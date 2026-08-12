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
import { updatePageBlocksEditor } from "./modules/pageBlocksEditor.js";
import { renderBlock } from "./modules/pageBlockRenderer.js";
import { publishPage, slugify, isValidSlug, publicPageUrl, contentFingerprint } from "./modules/pagePublish.js";
import { setupPageManagerButton } from "./modules/pageManager.js";
import { createToggleSwitch, createUrlInputRow } from "./modules/domUtils.js";
import { createValueControl } from "./modules/valueControl.js";
import { applyPageBackground } from "./modules/pageBackground.js";

function createEmptyPage() {
  return {
    id: "page-" + Date.now(),
    slug: null,
    publishedSlug: null,
    publishedContentHash: null,
    analyticsEnabled: false,
    backgroundImageEnabled: false,
    backgroundImage: "",
    backgroundBlur: 12,
    backgroundParallaxMode: "fixed",
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
    if (current) {
      schedulePageDraftSave(current);
      renderPagePreview(current);
      updatePublishStatus(current);
    }
    renderPagesSidebar(pages, currentPageId, setCurrent, createNew, handleDelete);
  }

  // Live preview: the same renderBlock() used by page.html itself and each
  // block row's own inline preview, just assembled together - never a
  // fourth copy of block-rendering logic. Called on every settle point
  // (field blur, add/remove/reorder block) via updateCurrentPage() above,
  // not per-keystroke.
  function renderPagePreview(page) {
    if (!pagePreviewPane) return;
    backgroundCleanup();

    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    if (!blocks.length) {
      pagePreviewPane.innerHTML = `<p class="page-status-message">This page has no content yet.</p>`;
    } else {
      const list = document.createElement("div");
      list.className = "page-blocks-list";
      blocks.forEach((block) => list.appendChild(renderBlock(block)));
      pagePreviewPane.innerHTML = "";
      pagePreviewPane.appendChild(list);
    }

    // #pagePreviewPane is its own scroll container (not the window) - see
    // js/modules/pageBackground.js's scrollSource param.
    backgroundCleanup = applyPageBackground(pagePreviewPane, page, pagePreviewPane);
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
  }

  async function handlePublish(page) {
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
        <div class="color-row" style="margin-top:1rem;">
          <span>URL slug:</span>
          <input type="text" id="pageSlugInput" placeholder="auto-generated from title" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;" />
          <button type="button" id="publishPageBtn" class="page-block-add-btn">Publish</button>
        </div>
        <p id="pagePublishStatus" class="builder-empty-state" style="text-align:left;padding:0.3rem 0;"></p>
        <button type="button" id="managePagesBtn">Manage Published Pages</button>
        <div class="color-row" style="margin-top:1rem;">
          <label for="pageAnalyticsEnabled" style="cursor:pointer;">Track Analytics (opens)</label>
          <span id="pageAnalyticsToggleSlot"></span>
        </div>
        <fieldset style="margin-top:1.2rem;border:1px solid #444;border-radius:8px;padding:1rem;">
          <legend style="font-size:1.05rem;font-weight:600;color:var(--builder-accent);margin-bottom:0.6em;">Background Image</legend>
          <div class="color-row" style="margin-bottom:1rem;">
            <label for="pageBackgroundEnabled" style="cursor:pointer;">Enable</label>
            <span id="pageBackgroundToggleSlot"></span>
          </div>
          <div id="pageBackgroundUrlRowSlot"></div>
          <div class="color-row" style="margin-top:1rem;">
            <span>Scroll behavior:</span>
            <select id="pageBackgroundParallaxMode" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;">
              <option value="fixed">Fixed</option>
              <option value="scroll">Scroll (parallax)</option>
            </select>
          </div>
          <div id="pageBackgroundBlurSlot" style="margin-top:1rem;"></div>
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
    updatePublishStatus(page);
    setupPageManagerButton(() => page);
    setupAnalyticsControls(page);
    setupBackgroundControls(page);

    if (!Array.isArray(page.blocks)) page.blocks = [];
    updatePageBlocksEditor(page, updateCurrentPage);
    renderPagePreview(page);
  }

  async function render() {
    renderPagesSidebar(pages, currentPageId, setCurrent, createNew, handleDelete);

    if (!pages.length) {
      hideLoading(); // init()'s showLoading() has no stub-load branch to pair with when there's nothing to load
      if (pageEditorPane) {
        pageEditorPane.innerHTML = `<p class="builder-empty-state">No pages yet. Click "+ New Page" to create one.</p>`;
      }
      if (pagePreviewPane) {
        backgroundCleanup();
        backgroundCleanup = () => {};
        pagePreviewPane.innerHTML = "";
      }
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
