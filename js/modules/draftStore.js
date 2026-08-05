// draftStore.js - Server-backed persistence for in-progress builder reels
// ("drafts"), replacing js/sidebar.js's old localStorage-only loadReels/
// saveReels. Backed by the Worker's /drafts* routes (see worker/README.md),
// which require BUILDER_PASSWORD on every call - unlike the published-embed
// /reels/:id routes, drafts have no legitimate anonymous reader.
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

// Per-reel debounce timers for scheduleDraftSave, keyed by reel.id.
const saveTimers = new Map();
const SAVE_DEBOUNCE_MS = 1200;

// Save-status pub/sub, keyed by reel.id: 'pending' | 'saving' | 'saved' | 'error'.
const saveStatus = new Map();
const statusListeners = new Set();

function setSaveStatus(id, status) {
  saveStatus.set(id, status);
  statusListeners.forEach((fn) => fn(id, status));
}

export function getSaveStatus(id) {
  return saveStatus.get(id) || null;
}

export function onSaveStatusChange(fn) {
  statusListeners.add(fn);
}

async function authorizedFetch(path, options = {}) {
  const password = await getBuilderPassword();
  if (!password) {
    throw new Error("A password is required.");
  }

  const response = await fetch(`${WORKER_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${password}`,
    },
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }

  if (!response.ok) {
    throw new Error(`Request failed (status ${response.status}).`);
  }

  return response;
}

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

/** GET /drafts - lightweight {id,title,createdAt,updatedAt} for every draft. */
export async function listDrafts() {
  const response = await authorizedFetch("/drafts");
  return response.json();
}

/** GET /drafts/:id - full reel object, or null on 404. */
export async function loadDraft(id) {
  const password = await getBuilderPassword();
  if (!password) {
    throw new Error("A password is required.");
  }

  const response = await fetch(`${WORKER_BASE_URL}/drafts/${id}`, {
    headers: { Authorization: `Bearer ${password}` },
  });

  if (response.status === 404) {
    return null;
  }
  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Request failed (status ${response.status}).`);
  }

  return normalizeReel(await response.json());
}

async function putDraftNow(reel) {
  setSaveStatus(reel.id, "saving");
  try {
    const response = await authorizedFetch(`/drafts/${reel.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reel),
    });
    const { updatedAt } = await response.json();
    reel.updatedAt = updatedAt;
    setSaveStatus(reel.id, "saved");
  } catch (err) {
    console.error(`Failed to save draft "${reel.id}":`, err);
    setSaveStatus(reel.id, "error");
    // Swallowed by design - non-blocking, the next edit's debounce (or a
    // manual flushDraftSave) is the retry. No retry queue for v1.
  }
}

/**
 * Debounces a POST of the given full reel object. Independent of (not
 * coupled to) the builder's own preview-refresh debounce in js/main.js.
 */
export function scheduleDraftSave(reel) {
  setSaveStatus(reel.id, "pending");
  clearTimeout(saveTimers.get(reel.id));
  saveTimers.set(
    reel.id,
    setTimeout(() => {
      saveTimers.delete(reel.id);
      putDraftNow(reel);
    }, SAVE_DEBOUNCE_MS)
  );
}

/**
 * Cancels any pending debounce for this reel and saves immediately.
 * Used for one-shot actions (e.g. creating a new reel) where waiting the
 * full debounce would be wrong. Returns the save promise.
 */
export function flushDraftSave(reel) {
  clearTimeout(saveTimers.get(reel.id));
  saveTimers.delete(reel.id);
  return putDraftNow(reel);
}

/** DELETE /drafts/:id - cancels any pending save timer first. */
export async function deleteDraft(id) {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  await authorizedFetch(`/drafts/${id}`, { method: "DELETE" });
}

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
