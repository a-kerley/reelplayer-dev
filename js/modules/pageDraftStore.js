// pageDraftStore.js - Server-backed persistence for in-progress builder
// pages ("page drafts"), the Pages-tab equivalent of js/modules/draftStore.js.
// Backed by the Worker's /drafts/pages* routes (see worker/README.md),
// sharing the exact same debounced-save/status-pub-sub/auth machinery via
// draftStoreFactory.js rather than a second hand-copy of it.
import { createDraftStore } from "./draftStoreFactory.js";

// Fills in fields that didn't exist when a page draft was first saved under
// an older schema - mirrors draftStore.js's normalizeReel().
function normalizePage(page) {
  if (!page.blocks) page.blocks = [];
  if (page.slug === undefined) page.slug = null;
  if (page.publishedSlug === undefined) page.publishedSlug = null;
  // A page published before this field existed has no recorded fingerprint
  // of what was live - null never equals a real contentFingerprint() value,
  // so js/pagesController.js's updatePublishStatus() correctly falls back
  // to the "stale" (unpublished changes) state rather than false-reporting
  // "up to date" for a page it actually has no basis to compare.
  if (page.publishedContentHash === undefined) page.publishedContentHash = null;
  return page;
}

const store = createDraftStore({ prefix: "/drafts/pages", normalize: normalizePage });

/** GET /drafts/pages - lightweight {id,title,slug,createdAt,updatedAt} for every page draft. */
export const listPageDrafts = store.listDrafts;
/** GET /drafts/pages/:id - full page object, or null on 404. */
export const loadPageDraft = store.loadDraft;
/** Debounces a POST of the given full page object. */
export const schedulePageDraftSave = store.scheduleDraftSave;
/** Cancels any pending debounce for this page and saves immediately. Returns the save promise. */
export const flushPageDraftSave = store.flushDraftSave;
/** DELETE /drafts/pages/:id - cancels any pending save timer first. */
export const deletePageDraft = store.deleteDraft;
export const onPageSaveStatusChange = store.onSaveStatusChange;
export const getPageSaveStatus = store.getSaveStatus;
