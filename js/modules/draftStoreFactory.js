// draftStoreFactory.js - Generic server-backed draft persistence, factored
// out of the original reel-only js/modules/draftStore.js so the same
// debounced-save/status-pub-sub/auth machinery can back page drafts too
// (js/modules/pageDraftStore.js) without a second hand-copy of this logic.
// Backed by the Worker's /drafts* (or /drafts/pages*) routes - see
// worker/README.md.
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

/**
 * @param {Object} opts
 * @param {string} opts.prefix - Worker route prefix, e.g. "/drafts" or "/drafts/pages"
 * @param {(item: Object) => Object} [opts.normalize] - fills in fields missing
 *   from an older-schema draft, applied on every load
 */
export function createDraftStore({ prefix, normalize = (item) => item }) {
  // Per-item debounce timers for scheduleDraftSave, keyed by item.id.
  const saveTimers = new Map();
  const SAVE_DEBOUNCE_MS = 1200;

  // Save-status pub/sub, keyed by item.id: 'pending' | 'saving' | 'saved' | 'error'.
  const saveStatus = new Map();
  const statusListeners = new Set();

  function setSaveStatus(id, status) {
    saveStatus.set(id, status);
    statusListeners.forEach((fn) => fn(id, status));
  }

  function getSaveStatus(id) {
    return saveStatus.get(id) || null;
  }

  function onSaveStatusChange(fn) {
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

  /** GET {prefix} - lightweight summary entries for every draft. */
  async function listDrafts() {
    const response = await authorizedFetch(prefix);
    return response.json();
  }

  /** GET {prefix}/:id - full item object, or null on 404. */
  async function loadDraft(id) {
    const password = await getBuilderPassword();
    if (!password) {
      throw new Error("A password is required.");
    }

    const response = await fetch(`${WORKER_BASE_URL}${prefix}/${id}`, {
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

    return normalize(await response.json());
  }

  async function putDraftNow(item) {
    setSaveStatus(item.id, "saving");
    try {
      const response = await authorizedFetch(`${prefix}/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const { updatedAt } = await response.json();
      item.updatedAt = updatedAt;
      setSaveStatus(item.id, "saved");
    } catch (err) {
      console.error(`Failed to save draft "${item.id}":`, err);
      setSaveStatus(item.id, "error");
      // Swallowed by design - non-blocking, the next edit's debounce (or a
      // manual flushDraftSave) is the retry. No retry queue for v1.
    }
  }

  /**
   * Debounces a POST of the given full item object. Independent of (not
   * coupled to) the builder's own preview-refresh debounce in js/main.js.
   */
  function scheduleDraftSave(item) {
    setSaveStatus(item.id, "pending");
    clearTimeout(saveTimers.get(item.id));
    saveTimers.set(
      item.id,
      setTimeout(() => {
        saveTimers.delete(item.id);
        putDraftNow(item);
      }, SAVE_DEBOUNCE_MS)
    );
  }

  /**
   * Cancels any pending debounce for this item and saves immediately.
   * Used for one-shot actions (e.g. creating a new item) where waiting the
   * full debounce would be wrong. Returns the save promise.
   */
  function flushDraftSave(item) {
    clearTimeout(saveTimers.get(item.id));
    saveTimers.delete(item.id);
    return putDraftNow(item);
  }

  /** DELETE {prefix}/:id - cancels any pending save timer first. */
  async function deleteDraft(id) {
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
    await authorizedFetch(`${prefix}/${id}`, { method: "DELETE" });
  }

  return {
    listDrafts,
    loadDraft,
    scheduleDraftSave,
    flushDraftSave,
    deleteDraft,
    onSaveStatusChange,
    getSaveStatus,
  };
}
