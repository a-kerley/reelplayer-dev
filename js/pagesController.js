// pagesController.js - Owns all Pages-tab orchestration (list/select/create/
// delete/save/render), the Pages counterpart of the reel-orchestration block
// in js/main.js. Kept as its own module rather than folded into js/main.js
// so the reel/page seams stay easy to see and compare side by side - see
// each function here against its same-named counterpart in js/main.js.
import { dialog } from "./modules/dialogSystem.js";
import { showToast } from "./modules/toast.js";
import {
  listPageDrafts,
  loadPageDraft,
  schedulePageDraftSave,
  flushPageDraftSave,
  deletePageDraft,
  onPageSaveStatusChange,
} from "./modules/pageDraftStore.js";
import { renderPagesSidebar } from "./pagesSidebar.js";
import { ICONS } from "./modules/sidebarList.js";
import { updatePageBlocksEditor, openCustomizeStylesDialog } from "./modules/pageBlocksEditor.js";
import { renderBlock } from "./modules/pageBlockRenderer.js";
import { publishPage, slugify, isValidSlug, publicPageUrl, contentFingerprint } from "./modules/pagePublish.js";
import { setupPageManagerButton } from "./modules/pageManager.js";
import { createToggleSwitch, createUrlInputRow } from "./modules/domUtils.js";
import { createValueControl } from "./modules/valueControl.js";
import { applyPageBackground } from "./modules/pageBackground.js";
import { applyTextStyles } from "./modules/pageTextStyles.js";
import { applyBlockReveal } from "./modules/pageBlockReveal.js";

function createEmptyPage() {
  return {
    id: "page-" + Date.now(),
    slug: null,
    publishedSlug: null,
    publishedContentHash: null,
    analyticsEnabled: false,
    locked: false,
    backgroundImageEnabled: false,
    backgroundImage: "",
    backgroundOverlayEnabled: false,
    backgroundOverlayColor: "#000000",
    backgroundBlur: 12,
    backgroundParallaxMode: "fixed",
    contentOverlayColor: "#000000",
    contentOverlayOpacity: 0,
    contentOverlayFullBleed: false,
    contentOverlayMarginVertical: 0,
    contentOverlayMarginHorizontal: 0,
    contentMaxWidth: 900,
    contentPaddingTop: 0,
    contentPaddingBottom: 0,
    textStyleDefs: {},
    title: "",
    createdAt: Date.now(),
    blocks: [],
  };
}

export function initPagesController() {
  let pages = [];
  let currentPageId = null;
  let loaded = false;
  // Teardown for the previously-applied background layer (see
  // js/modules/pageBackground.js) - must run before every re-render of the
  // preview pane, since #pagePreviewPane is a persistent element whose
  // scroll listener wouldn't otherwise be cleaned up just by innerHTML=""
  // wiping its (wiped) children.
  let backgroundCleanup = () => {};
  // Same reasoning as backgroundCleanup above, for js/modules/
  // pageBlockReveal.js's IntersectionObserver - it holds references to the
  // previous render's block elements, which innerHTML="" detaches from the
  // DOM but doesn't stop the observer from watching.
  let revealCleanup = () => {};

  const loadingOverlay = document.getElementById("builderLoadingOverlay");
  const loadingContent = document.getElementById("builderLoadingContent");
  const pageEditorPane = document.getElementById("pageEditorPane");
  const pagePreviewPane = document.getElementById("pagePreviewPane");
  const saveStatusEl = document.getElementById("pageDraftSaveStatus");

  function showLoading(html = "Loading…") {
    if (!loadingOverlay || !loadingContent) return;
    loadingContent.innerHTML = html;
    loadingOverlay.hidden = false;
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.hidden = true;
  }

  function updateSaveStatusIndicator(status) {
    if (!saveStatusEl) return;
    const text = {
      pending: "Unsaved changes…",
      saving: "Saving…",
      saved: "All changes saved",
      error: "⚠ Save failed - will retry",
    }[status] || "";
    saveStatusEl.textContent = text;
    saveStatusEl.dataset.status = status;
  }

  async function setCurrent(id) {
    currentPageId = id;
    localStorage.setItem("currentPageId", currentPageId);
    await render();
  }

  async function createNew() {
    const newPage = createEmptyPage();
    pages.push(newPage);
    currentPageId = newPage.id;
    flushPageDraftSave(newPage); // not awaited - one-shot, don't stall the UI
    await render();
  }

  async function handleDelete(id) {
    const idx = pages.findIndex((p) => p.id === id);
    if (idx === -1) return;

    const [removed] = pages.splice(idx, 1); // optimistic
    const wasCurrent = currentPageId === id;
    if (wasCurrent) {
      currentPageId = pages.length ? pages[0].id : null;
    }

    try {
      await deletePageDraft(id);
    } catch (e) {
      // Roll back - local/server state must not silently drift.
      pages.splice(idx, 0, removed);
      if (wasCurrent) currentPageId = id;
      dialog.alert(`Couldn't delete "${removed.title || "(untitled page)"}" - ${e.message}`);
      await render();
      return;
    }

    await render();
  }

  function updateCurrentPage() {
    const current = pages.find((p) => p.id === currentPageId);
    // Backstop beyond the visual pointer-events:none block on
    // #pageEditorPane (see applyPageLockState()) - that alone doesn't stop
    // a keyboard-focused edit from still firing this.
    if (current?.locked) return;
    if (current) {
      schedulePageDraftSave(current);
      renderPagePreview(current);
      updatePublishStatus(current);
    }
    renderPagesSidebar(pages, currentPageId, setCurrent, createNew, handleDelete, togglePageLock);
  }

  // Mirrors js/main.js's toggleReelLock() - toggling lock has to persist
  // even for a page that's only ever been a lightweight stub (never
  // opened), so hydrate the full body first, exactly like render() already
  // does when a stub page is selected.
  async function togglePageLock(id) {
    const idx = pages.findIndex((p) => p.id === id);
    if (idx === -1) return;
    let page = pages[idx];

    if (page.locked) {
      const confirmed = await dialog.confirm("Unlock this page for editing?", "Unlock", "Cancel");
      if (!confirmed) return;
    }

    if (page._stub) {
      showLoading();
      try {
        const full = await loadPageDraft(id);
        if (!full) {
          pages.splice(idx, 1);
          hideLoading();
          await render();
          return;
        }
        pages[idx] = full;
        page = full;
      } catch (e) {
        hideLoading();
        dialog.alert(`Couldn't load this page (offline or server error): ${e.message}`);
        return;
      }
      hideLoading();
    }

    page.locked = !page.locked;
    schedulePageDraftSave(page);
    await render();
  }

  // Live preview: the same renderBlock() used by page.html itself and each
  // block row's own inline preview, just assembled together - never a
  // fourth copy of block-rendering logic. Called on every settle point
  // (field blur, add/remove/reorder block) via updateCurrentPage() above,
  // not per-keystroke.
  function renderPagePreview(page) {
    if (!pagePreviewPane) return;
    backgroundCleanup();
    revealCleanup();

    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    if (!blocks.length) {
      pagePreviewPane.innerHTML = `<p class="page-status-message">This page has no content yet.</p>`;
    } else {
      const list = document.createElement("div");
      list.className = "page-blocks-list";
      blocks.forEach((block) => list.appendChild(renderBlock(block, page)));
      pagePreviewPane.innerHTML = "";
      pagePreviewPane.appendChild(list);
    }

    // #pagePreviewPane is its own scroll container (not the window) - see
    // js/modules/pageBackground.js's scrollSource param.
    backgroundCleanup = applyPageBackground(pagePreviewPane, page, pagePreviewPane);
    applyTextStyles(pagePreviewPane, page);
    revealCleanup = applyBlockReveal(pagePreviewPane, pagePreviewPane);
  }

  // Mirrors js/main.js's updateReelPublishStatus() - a page has no content-
  // hash id to piggyback on (its slug is stable/user-chosen, not derived
  // from content), so this compares a fresh contentFingerprint(page) against
  // page.publishedContentHash (stamped in handlePublish() below, right
  // after a successful publish) to tell the same three states apart: never
  // published, published and matching this draft, or published but the
  // draft has changed since.
  function updatePublishStatus(page) {
    const statusEl = document.getElementById("pagePublishStatus");
    if (!statusEl) return;

    if (!page.publishedSlug) {
      statusEl.textContent = "Not yet published.";
      statusEl.dataset.status = "unpublished";
      return;
    }

    const url = publicPageUrl(page.publishedSlug);
    if (contentFingerprint(page) === page.publishedContentHash) {
      statusEl.textContent = `Live at ${url}`;
      statusEl.dataset.status = "published";
    } else {
      statusEl.textContent = `⚠ Live at ${url} - you have unpublished changes.`;
      statusEl.dataset.status = "stale";
    }
  }

  // Analytics toggle - mirrors js/main.js's setupAnalyticsControls() for
  // reels. Stats themselves are viewed via a "Stats" button on each row of
  // the "Manage Published Pages" modal (js/modules/pageManager.js), not a
  // dedicated button here - works for any published page, not just
  // whichever one happens to be open in the builder right now. (A page
  // never plays anything itself - see js/modules/statsBeacon.js's split - a
  // page block's iframe is just player.html, tracked under that reel's own
  // analyticsEnabled independently - so a page's own stats are opens only.)
  function setupAnalyticsControls(page) {
    const slot = document.getElementById("pageAnalyticsToggleSlot");
    if (slot) {
      slot.innerHTML = "";
      slot.appendChild(createToggleSwitch({
        id: "pageAnalyticsEnabled",
        checked: !!page.analyticsEnabled,
        onChange: (e) => {
          page.analyticsEnabled = e.target.checked;
          updateCurrentPage();
        },
      }));
    }
  }

  // Page-level background image (blur + parallax) - see
  // js/modules/pageBackground.js for the shared render function this
  // config drives (used identically by renderPagePreview() below and
  // page.html). Reuses the same toggle/url-picker/slider components the
  // analytics toggle and the banner-image block already use.
  function setupBackgroundControls(page) {
    const toggleSlot = document.getElementById("pageBackgroundToggleSlot");
    if (toggleSlot) {
      toggleSlot.innerHTML = "";
      toggleSlot.appendChild(createToggleSwitch({
        id: "pageBackgroundEnabled",
        checked: !!page.backgroundImageEnabled,
        onChange: (e) => {
          page.backgroundImageEnabled = e.target.checked;
          updateCurrentPage();
        },
      }));
    }

    const urlSlot = document.getElementById("pageBackgroundUrlRowSlot");
    if (urlSlot) {
      urlSlot.innerHTML = "";
      const { row, input } = createUrlInputRow({
        id: "pageBackgroundImage",
        label: "Image:",
        value: page.backgroundImage || "",
        placeholder: "Paste an image URL or select from Media Library",
        pickerOptions: {
          directory: "assets/images/page-backgrounds",
          extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
          title: "Select Background Image",
        },
      });
      input.addEventListener("input", () => {
        page.backgroundImage = input.value;
        updateCurrentPage(); // picking via the file browser only fires "input", never "blur"
      });
      input.addEventListener("blur", () => {
        updateCurrentPage();
      });
      urlSlot.appendChild(row);
    }

    // Solid color rendered behind the image (js/modules/pageBackground.js's
    // .page-background-clip), not another translucent tint on top of it
    // like Content Background below - useful for filling a transparent PNG's
    // gaps or the blurred image's own edge softening with a chosen color
    // instead of the page's plain background. No opacity slider, unlike
    // Content Background - <input type="color"> is always opaque, and a
    // partly-transparent base color behind an opaque cover-sized image
    // would rarely be visible anyway.
    const overlayToggleSlot = document.getElementById("pageBackgroundOverlayToggleSlot");
    if (overlayToggleSlot) {
      overlayToggleSlot.innerHTML = "";
      overlayToggleSlot.appendChild(createToggleSwitch({
        id: "pageBackgroundOverlayEnabled",
        checked: !!page.backgroundOverlayEnabled,
        onChange: (e) => {
          page.backgroundOverlayEnabled = e.target.checked;
          updateCurrentPage();
        },
      }));
    }

    const overlayBgColorInput = document.getElementById("pageBackgroundOverlayColor");
    if (overlayBgColorInput) {
      overlayBgColorInput.value = page.backgroundOverlayColor || "#000000";
      overlayBgColorInput.addEventListener("input", () => {
        page.backgroundOverlayColor = overlayBgColorInput.value;
      });
      overlayBgColorInput.addEventListener("change", () => {
        updateCurrentPage();
      });
    }

    const modeSelect = document.getElementById("pageBackgroundParallaxMode");
    if (modeSelect) {
      modeSelect.value = page.backgroundParallaxMode === "scroll" ? "scroll" : "fixed";
      modeSelect.onchange = () => {
        page.backgroundParallaxMode = modeSelect.value;
        updateCurrentPage();
      };
    }

    const blurSlot = document.getElementById("pageBackgroundBlurSlot");
    if (blurSlot) {
      blurSlot.innerHTML = "";
      const { row, input: blurInput } = createValueControl({
        id: "pageBackgroundBlur",
        label: "Blur (px):",
        value: page.backgroundBlur ?? 12,
        min: 0,
        max: 60,
        step: 1,
        unit: "px",
      });
      blurInput.addEventListener("input", () => {
        const val = parseInt(blurInput.value, 10);
        if (!isNaN(val)) page.backgroundBlur = val;
      });
      blurInput.addEventListener("change", () => {
        updateCurrentPage();
      });
      blurSlot.appendChild(row);
    }

    const overlayColorInput = document.getElementById("pageContentOverlayColor");
    if (overlayColorInput) {
      overlayColorInput.value = page.contentOverlayColor || "#000000";
      overlayColorInput.addEventListener("input", () => {
        page.contentOverlayColor = overlayColorInput.value;
      });
      overlayColorInput.addEventListener("change", () => {
        updateCurrentPage();
      });
    }

    const overlayOpacitySlot = document.getElementById("pageContentOverlayOpacitySlot");
    if (overlayOpacitySlot) {
      overlayOpacitySlot.innerHTML = "";
      const { row, input: opacityInput } = createValueControl({
        id: "pageContentOverlayOpacity",
        label: "Opacity (%):",
        value: page.contentOverlayOpacity ?? 0,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
      });
      opacityInput.addEventListener("input", () => {
        const val = parseInt(opacityInput.value, 10);
        if (!isNaN(val)) page.contentOverlayOpacity = val;
      });
      opacityInput.addEventListener("change", () => {
        updateCurrentPage();
      });
      overlayOpacitySlot.appendChild(row);
    }

    const marginVerticalSlot = document.getElementById("pageContentOverlayMarginVerticalSlot");
    const marginHorizontalSlot = document.getElementById("pageContentOverlayMarginHorizontalSlot");

    // The vertical margin only has an effect when full-bleed is off (full-
    // bleed already spans the whole page top-to-bottom, so a vertical
    // margin on top of that would have nothing left to expand into) -
    // hiding its row while full-bleed is on avoids offering a control that
    // visibly does nothing.
    function updateMarginVerticalVisibility() {
      if (marginVerticalSlot) {
        marginVerticalSlot.style.display = page.contentOverlayFullBleed ? "none" : "";
      }
    }

    const fullBleedSlot = document.getElementById("pageContentOverlayFullBleedToggleSlot");
    if (fullBleedSlot) {
      fullBleedSlot.innerHTML = "";
      fullBleedSlot.appendChild(createToggleSwitch({
        id: "pageContentOverlayFullBleed",
        checked: !!page.contentOverlayFullBleed,
        onChange: (e) => {
          page.contentOverlayFullBleed = e.target.checked;
          updateMarginVerticalVisibility();
          updateCurrentPage();
        },
      }));
    }

    if (marginVerticalSlot) {
      marginVerticalSlot.innerHTML = "";
      const { row, input } = createValueControl({
        id: "pageContentOverlayMarginVertical",
        label: "Vertical Margin (px):",
        value: page.contentOverlayMarginVertical ?? 0,
        min: 0,
        max: 300,
        step: 5,
        unit: "px",
      });
      input.addEventListener("input", () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val)) page.contentOverlayMarginVertical = val;
      });
      input.addEventListener("change", () => {
        updateCurrentPage();
      });
      marginVerticalSlot.appendChild(row);
    }
    updateMarginVerticalVisibility();

    if (marginHorizontalSlot) {
      marginHorizontalSlot.innerHTML = "";
      const { row, input } = createValueControl({
        id: "pageContentOverlayMarginHorizontal",
        label: "Horizontal Margin (px):",
        value: page.contentOverlayMarginHorizontal ?? 0,
        min: 0,
        max: 300,
        step: 5,
        unit: "px",
      });
      input.addEventListener("input", () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val)) page.contentOverlayMarginHorizontal = val;
      });
      input.addEventListener("change", () => {
        updateCurrentPage();
      });
      marginHorizontalSlot.appendChild(row);
    }
  }

  // Page-level layout (content column max-width + top/bottom padding) -
  // same shared applyPageBackground() call in renderPagePreview()/page.html
  // renders these (as CSS custom properties css/page.css reads), so this
  // function only needs to own the form controls, same wiring pattern as
  // setupBackgroundControls() above.
  function setupLayoutControls(page) {
    const maxWidthSlot = document.getElementById("pageContentMaxWidthSlot");
    if (maxWidthSlot) {
      maxWidthSlot.innerHTML = "";
      const { row, input } = createValueControl({
        id: "pageContentMaxWidth",
        label: "Max Width (px):",
        value: page.contentMaxWidth ?? 900,
        min: 400,
        max: 1600,
        step: 10,
        unit: "px",
      });
      input.addEventListener("input", () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val)) page.contentMaxWidth = val;
      });
      input.addEventListener("change", () => {
        updateCurrentPage();
      });
      maxWidthSlot.appendChild(row);
    }

    const paddingTopSlot = document.getElementById("pageContentPaddingTopSlot");
    if (paddingTopSlot) {
      paddingTopSlot.innerHTML = "";
      const { row, input } = createValueControl({
        id: "pageContentPaddingTop",
        label: "Padding Top (px):",
        value: page.contentPaddingTop ?? 0,
        min: 0,
        max: 300,
        step: 5,
        unit: "px",
      });
      input.addEventListener("input", () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val)) page.contentPaddingTop = val;
      });
      input.addEventListener("change", () => {
        updateCurrentPage();
      });
      paddingTopSlot.appendChild(row);
    }

    const paddingBottomSlot = document.getElementById("pageContentPaddingBottomSlot");
    if (paddingBottomSlot) {
      paddingBottomSlot.innerHTML = "";
      const { row, input } = createValueControl({
        id: "pageContentPaddingBottom",
        label: "Padding Bottom (px):",
        value: page.contentPaddingBottom ?? 0,
        min: 0,
        max: 300,
        step: 5,
        unit: "px",
      });
      input.addEventListener("input", () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val)) page.contentPaddingBottom = val;
      });
      input.addEventListener("change", () => {
        updateCurrentPage();
      });
      paddingBottomSlot.appendChild(row);
    }
  }

  // Works before the page is ever published/saved, unlike a real GET
  // /pages/:slug fetch (password-gated, and there's no draft-preview route
  // on the Worker anyway - see worker/CLAUDE.md). Instead this writes the
  // in-progress page straight into localStorage and opens page.html in
  // preview mode, which reads it back out from there rather than fetching
  // anything - see page.html's PREVIEW_STORAGE_KEY. Same-origin only
  // (page.html and the builder share a host), and the opened tab gets a
  // watermark so a draft preview is never mistaken for the live page - it
  // deliberately does NOT use the real publish URL.
  const PAGE_PREVIEW_STORAGE_KEY = "reelplayer:pagePreview";

  function handlePreview(page) {
    localStorage.setItem(PAGE_PREVIEW_STORAGE_KEY, JSON.stringify(page));
    window.open("page.html?preview=1", "_blank");
  }

  async function handlePublish(page) {
    if (page.locked) {
      dialog.alert("This page is locked. Unlock it to publish.");
      return;
    }

    const slugInput = document.getElementById("pageSlugInput");
    const publishBtn = document.getElementById("publishPageBtn");
    let slug = slugify(slugInput.value) || slugify(page.title);

    if (!isValidSlug(slug)) {
      dialog.alert("Enter a title or a URL slug before publishing.");
      return;
    }

    slugInput.value = slug;
    page.slug = slug;

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      await publishPage(page, slug);
      page.publishedSlug = slug;
      // Records what was actually just published, so updatePublishStatus()
      // can tell "live and matches this draft" apart from "you've edited
      // it since" the next time anything changes.
      page.publishedContentHash = contentFingerprint(page);
      updateCurrentPage();
      updatePublishStatus(page);
      setupAnalyticsControls(page);
      dialog.createDialog({
        type: "custom",
        message: "Page published!",
        content: `
          <div style="margin-bottom:1rem;">
            <p>Your page is live at:</p>
            <textarea id="pageUrlArea" readonly style="width:100%;height:3rem;font-family:monospace;font-size:12px;padding:8px;border:1px solid #444;border-radius:4px;resize:vertical;background:#1e1e1e;color:#fff;">${publicPageUrl(slug)}</textarea>
          </div>
        `,
        buttons: [
          {
            text: "Copy Link",
            type: "primary",
            onClick: () => {
              navigator.clipboard.writeText(publicPageUrl(slug)).then(() => {
                showToast("Link copied to clipboard!");
              }).catch(() => {
                showToast("Failed to copy - please select and copy the URL manually.");
              });
            },
          },
          { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() },
        ],
      });
    } catch (e) {
      dialog.alert(`Publish failed: ${e.message}`);
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = "Publish";
    }
  }

  function renderPageBuilderForm(page) {
    if (!pageEditorPane) return;
    pageEditorPane.innerHTML = `
      <form id="pageForm" autocomplete="off">
        <label>
          Title:
          <input type="text" id="pageTitle" class="filename-display" />
        </label>
        <div class="color-row" style="margin-top:0.6rem;">
          <span>URL slug:</span>
          <input type="text" id="pageSlugInput" placeholder="auto-generated from title" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;" />
          <button type="button" id="publishPageBtn" class="page-block-add-btn">Publish</button>
        </div>
        <p id="pagePublishStatus" class="builder-empty-state" style="text-align:left;padding:0.3rem 0;"></p>
        <button type="button" id="previewPageBtn">Preview Page</button>
        <button type="button" id="managePagesBtn">Manage Published Pages</button>
        <button type="button" id="customizeTextStylesBtn">Customize Text Styles...</button>
        <div class="color-row" style="margin-top:0.6rem;">
          <label for="pageAnalyticsEnabled" style="cursor:pointer;">Track Analytics (opens)</label>
          <span id="pageAnalyticsToggleSlot"></span>
        </div>
        <fieldset style="margin-top:1.2rem;border:1px solid #444;border-radius:8px;padding:1rem;">
          <legend class="builder-section-legend">Background Image</legend>
          <div class="color-row">
            <label for="pageBackgroundEnabled" style="cursor:pointer;">Enable</label>
            <span id="pageBackgroundToggleSlot"></span>
          </div>
          <div id="pageBackgroundUrlRowSlot"></div>
          <div class="color-row" style="margin-top:0.6rem;">
            <label for="pageBackgroundOverlayEnabled" style="cursor:pointer;">Overlay behind image</label>
            <span id="pageBackgroundOverlayToggleSlot"></span>
            <input type="color" id="pageBackgroundOverlayColor" style="width:3rem;height:2rem;padding:0;border:1px solid #444;border-radius:4px;background:#1e1e1e;cursor:pointer;" />
          </div>
          <div class="color-row" style="margin-top:0.6rem;">
            <span>Scroll behavior:</span>
            <select id="pageBackgroundParallaxMode" class="builder-select">
              <option value="fixed">Fixed</option>
              <option value="scroll">Scroll (parallax)</option>
            </select>
          </div>
          <div id="pageBackgroundBlurSlot" style="margin-top:0.6rem;"></div>
          <div style="margin-top:1.2rem;padding-top:1rem;border-top:1px solid #444;">
            <div class="builder-section-legend">Content Background</div>
            <div class="color-row">
              <span>Color:</span>
              <input type="color" id="pageContentOverlayColor" style="width:3rem;height:2rem;padding:0;border:1px solid #444;border-radius:4px;background:#1e1e1e;cursor:pointer;" />
            </div>
            <div id="pageContentOverlayOpacitySlot"></div>
            <div class="color-row" style="margin-top:0.6rem;">
              <label for="pageContentOverlayFullBleed" style="cursor:pointer;">Extend to top/bottom of page</label>
              <span id="pageContentOverlayFullBleedToggleSlot"></span>
            </div>
            <div id="pageContentOverlayMarginVerticalSlot" style="margin-top:0.6rem;"></div>
            <div id="pageContentOverlayMarginHorizontalSlot" style="margin-top:0.6rem;"></div>
          </div>
        </fieldset>
        <fieldset style="margin-top:1.2rem;border:1px solid #444;border-radius:8px;padding:1rem;">
          <legend class="builder-section-legend">Page Layout</legend>
          <div id="pageContentMaxWidthSlot"></div>
          <div id="pageContentPaddingTopSlot" style="margin-top:0.6rem;"></div>
          <div id="pageContentPaddingBottomSlot" style="margin-top:0.6rem;"></div>
        </fieldset>
      </form>
      <div id="pageBlocksEditor" class="page-blocks-editor"></div>
    `;
    const titleInput = document.getElementById("pageTitle");
    titleInput.value = page.title || "";
    titleInput.oninput = () => {
      page.title = titleInput.value;
    };
    titleInput.onblur = () => {
      updateCurrentPage();
    };

    const slugInput = document.getElementById("pageSlugInput");
    slugInput.value = page.slug || "";
    slugInput.oninput = () => {
      page.slug = slugify(slugInput.value);
    };
    slugInput.onblur = () => {
      slugInput.value = page.slug || "";
      updateCurrentPage();
    };

    document.getElementById("publishPageBtn").onclick = () => handlePublish(page);
    document.getElementById("previewPageBtn").onclick = () => handlePreview(page);
    // Same dialog createTextConfig()'s per-block "Customize Styles..."
    // button opens (js/modules/pageBlocksEditor.js) - having it here too
    // means it's reachable even on a page with no text block yet, or once
    // the last one's been removed. onChange (updateCurrentPage) already
    // calls renderPagePreview() itself, so there's no separate row preview
    // to refresh from this call site - refreshPreview is a no-op.
    document.getElementById("customizeTextStylesBtn").onclick = () => openCustomizeStylesDialog(page, updateCurrentPage, () => {});
    updatePublishStatus(page);
    setupPageManagerButton(() => page);
    setupAnalyticsControls(page);
    setupBackgroundControls(page);
    setupLayoutControls(page);

    if (!Array.isArray(page.blocks)) page.blocks = [];
    updatePageBlocksEditor(page, updateCurrentPage);
    renderPagePreview(page);
  }

  async function render() {
    renderPagesSidebar(pages, currentPageId, setCurrent, createNew, handleDelete, togglePageLock);

    if (!pages.length) {
      hideLoading(); // init()'s showLoading() has no stub-load branch to pair with when there's nothing to load
      if (pageEditorPane) {
        pageEditorPane.innerHTML = `<p class="builder-empty-state">No pages yet. Click "+ New Page" to create one.</p>`;
      }
      if (pagePreviewPane) {
        backgroundCleanup();
        backgroundCleanup = () => {};
        revealCleanup();
        revealCleanup = () => {};
        pagePreviewPane.innerHTML = "";
      }
      const lockBtn = document.getElementById('pageLockBtn');
      if (lockBtn) lockBtn.style.display = 'none';
      return;
    }

    const idx = pages.findIndex((p) => p.id === currentPageId);
    let current = pages[idx];
    if (!current) {
      hideLoading();
      return;
    }

    if (current._stub) {
      showLoading();
      try {
        const full = await loadPageDraft(current.id);
        if (full) {
          pages[idx] = full;
          current = full;
        } else {
          // 404 - deleted server-side elsewhere; drop it, pick another.
          pages.splice(idx, 1);
          currentPageId = pages[0]?.id ?? null;
          hideLoading();
          return render();
        }
      } catch (e) {
        hideLoading();
        dialog.alert(`Couldn't load this page (offline or server error): ${e.message}`);
        return;
      }
      hideLoading();
    }

    renderPageBuilderForm(current);
    applyPageLockState(current);
  }

  // Mirrors js/main.js's applyReelLockState() - visual half of the lock
  // (dim + block pointer interaction on #pageEditorPane, which wraps both
  // #pageForm and the blocks editor as siblings, so locking has to target
  // that wrapper rather than #pageForm alone) plus the in-editor lock/
  // unlock button. #pageLockBtn lives outside #pageEditorPane in
  // index.html on purpose, so it survives renderPageBuilderForm()
  // replacing that pane's contents and stays clickable when locked.
  function applyPageLockState(page) {
    const pane = document.getElementById('pageEditorPane');
    const lockBtn = document.getElementById('pageLockBtn');
    if (!pane || !lockBtn || !page) return;

    lockBtn.style.display = ''; // undo the "no pages at all" hide in render()
    pane.classList.toggle('builder-locked-form', !!page.locked);
    lockBtn.classList.toggle('locked', !!page.locked);
    lockBtn.innerHTML = page.locked
      ? `${ICONS.lockClosed}<span>Locked - click to unlock</span>`
      : `${ICONS.lockOpen}<span>Lock this page</span>`;
    lockBtn.onclick = () => togglePageLock(page.id);
  }

  async function init() {
    showLoading();

    let listEntries;
    try {
      listEntries = await listPageDrafts();
    } catch (e) {
      console.error("Failed to list page drafts:", e);
      listEntries = [];
    }
    pages = listEntries.map((e) => ({ ...e, _stub: true }));

    const savedId = localStorage.getItem("currentPageId");
    if (savedId && pages.some((p) => p.id === savedId)) {
      currentPageId = savedId;
    } else if (pages.length) {
      currentPageId = pages[0].id;
    }

    onPageSaveStatusChange((id, status) => {
      if (id === currentPageId) updateSaveStatusIndicator(status);
    });

    loaded = true;
    await render();
  }

  // Lazy: the Pages tab's data isn't fetched until the tab is first
  // activated, matching how Media Library already only renders on demand -
  // no need to pay for a page-drafts fetch on every builder load if the
  // user never opens the Pages tab this session.
  async function activate() {
    if (!loaded) {
      await init();
    } else {
      await render();
    }
  }

  return { activate };
}
