// pagesController.js - Owns all Pages-tab orchestration (list/select/create/
// delete/save/render), the Pages counterpart of the reel-orchestration block
// in js/main.js. Kept as its own module rather than folded into js/main.js
// so the reel/page seams stay easy to see and compare side by side - see
// each function here against its same-named counterpart in js/main.js.
import { dialog } from "./modules/dialogSystem.js";
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
import { publishPage, slugify, isValidSlug, publicPageUrl } from "./modules/pagePublish.js";
import { setupPageManagerButton } from "./modules/pageManager.js";

function createEmptyPage() {
  return {
    id: "page-" + Date.now(),
    slug: null,
    publishedSlug: null,
    title: "",
    createdAt: Date.now(),
    blocks: [],
  };
}

export function initPagesController() {
  let pages = [];
  let currentPageId = null;
  let loaded = false;

  const loadingOverlay = document.getElementById("builderLoadingOverlay");
  const loadingContent = document.getElementById("builderLoadingContent");
  const pageBuilderView = document.getElementById("pageBuilderView");
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
    if (current) schedulePageDraftSave(current);
    renderPagesSidebar(pages, currentPageId, setCurrent, createNew, handleDelete);
  }

  function updatePublishStatus(page) {
    const statusEl = document.getElementById("pagePublishStatus");
    if (!statusEl) return;
    statusEl.textContent = page.publishedSlug
      ? `Live at ${publicPageUrl(page.publishedSlug)}`
      : "Not yet published.";
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
      updateCurrentPage();
      updatePublishStatus(page);
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
                dialog.closeDialog();
                setTimeout(() => dialog.alert("Link copied to clipboard!"), 200);
              }).catch(() => {
                dialog.closeDialog();
                setTimeout(() => dialog.alert("Failed to copy - please select and copy the URL manually."), 200);
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
    if (!pageBuilderView) return;
    pageBuilderView.innerHTML = `
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
    setupPageManagerButton();

    if (!Array.isArray(page.blocks)) page.blocks = [];
    updatePageBlocksEditor(page, updateCurrentPage);
  }

  async function render() {
    renderPagesSidebar(pages, currentPageId, setCurrent, createNew, handleDelete);

    if (!pages.length) {
      hideLoading(); // init()'s showLoading() has no stub-load branch to pair with when there's nothing to load
      if (pageBuilderView) {
        pageBuilderView.innerHTML = `<p class="builder-empty-state">No pages yet. Click "+ New Page" to create one.</p>`;
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
