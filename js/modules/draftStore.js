// draftStore.js - Server-backed persistence for in-progress builder reels
// ("drafts"), replacing js/sidebar.js's old localStorage-only loadReels/
// saveReels. Backed by the Worker's /drafts* routes (see worker/README.md),
// which require BUILDER_PASSWORD on every call - unlike the published-embed
// /reels/:id routes, drafts have no legitimate anonymous reader.
//
// This is a thin, reel-specific instantiation of the generic machinery in
// draftStoreFactory.js (debounced save, save-status pub/sub, auth) - see
// js/modules/pageDraftStore.js for the page-draft equivalent, which shares
// the exact same factory rather than a second hand-copy of this logic.
import { createDraftStore } from "./draftStoreFactory.js";

// Fills in fields that didn't exist when a reel was first saved under an
// older schema - same normalization js/main.js used to do once, at
// bootstrap, over the whole array. Applied per-reel here instead, so it
// keeps protecting any old-shape reel regardless of when it's loaded
// (initial list, on-demand select, or migration).
function normalizeReel(reel) {
  if (!reel.backgroundColor) {
    reel.backgroundColor = "rgba(255, 255, 255, 1)";
  }
  return reel;
}

const store = createDraftStore({ prefix: "/drafts", normalize: normalizeReel });

/** GET /drafts - lightweight {id,title,createdAt,updatedAt} for every draft. */
export const listDrafts = store.listDrafts;
/** GET /drafts/:id - full reel object, or null on 404. */
export const loadDraft = store.loadDraft;
/**
 * Debounces a POST of the given full reel object. Independent of (not
 * coupled to) the builder's own preview-refresh debounce in js/main.js.
 */
export const scheduleDraftSave = store.scheduleDraftSave;
/**
 * Cancels any pending debounce for this reel and saves immediately.
 * Used for one-shot actions (e.g. creating a new reel) where waiting the
 * full debounce would be wrong. Returns the save promise.
 */
export const flushDraftSave = store.flushDraftSave;
/** DELETE /drafts/:id - cancels any pending save timer first. */
export const deleteDraft = store.deleteDraft;
export const onSaveStatusChange = store.onSaveStatusChange;
export const getSaveStatus = store.getSaveStatus;

/**
 * Back-compat shim - same name/signature as the old js/sidebar.js export.
 * window.saveReels(window.reels) is called directly (bypassing the
 * builder's onChange) from js/modules/blendModeControls.js,
 * js/modules/backgroundEffects.js, and js/modules/expandableMode.js after
 * mutating a field on the currently-open reel. Stub entries (lightweight
 * sidebar-only placeholders, see js/main.js) are filtered out here so they
 * can never overwrite a real draft with truncated data - in practice this
 * only ever schedules a save for the one currently-loaded full reel.
 */
export function saveReels(reels) {
  reels.filter((r) => !r._stub).forEach(scheduleDraftSave);
}
