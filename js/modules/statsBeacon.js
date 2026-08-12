// statsBeacon.js - Fire-and-forget "view"/"play" event beacons for opt-in
// per-reel/per-page analytics, sent from player.html/page.html (the two
// public, unauthenticated bootstrap pages) to the Worker's POST
// /stats/:type/:id route. A failed or blocked beacon must never affect
// playback or surface any UI - every call here swallows its own errors.
import { WORKER_BASE_URL } from "../config.js";

// Self-exclusion: js/main.js/pagesController.js's own bootstrap calls
// markAsOperatorBrowser() unconditionally on every builder load, so any
// browser that has ever opened the builder never counts its own opens
// (including via the "Test Embed" button, which opens player.html
// same-origin in a new tab) against a client's real analytics. localStorage
// is shared across same-origin pages, so this needs no cookie/param
// threading - it just works the moment the builder has loaded once in that
// browser. Doesn't cover checking a live client link from a browser that's
// never touched the builder (e.g. your phone) - that's an accepted gap, not
// something this mechanism tries to solve.
const OPERATOR_FLAG_KEY = "reelplayer_operator";

export function markAsOperatorBrowser() {
  try {
    localStorage.setItem(OPERATOR_FLAG_KEY, "1");
  } catch {
    // Private-browsing/storage-disabled - fine, just means this browser
    // won't get excluded; not worth surfacing.
  }
}

function isOperatorBrowser() {
  try {
    return localStorage.getItem(OPERATOR_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** One id per page load, ties a page/reel's "view" beacon to whichever
 * "play" beacons happen during that same visit - not persisted across
 * reloads, since a reload is a new visit. */
export function createSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** @param {'reel'|'page'} targetType
 *  @param {string} targetId - reel's publishedEmbedId, or page's publishedSlug
 *  @param {Object} payload - {event: 'view'|'play', sessionId, trackIndex?, trackTitle?, listenSeconds?} */
export function sendStatBeacon(targetType, targetId, payload) {
  if (isOperatorBrowser()) return;
  try {
    fetch(`${WORKER_BASE_URL}/stats/${targetType}/${targetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // lets this survive a pagehide/tab-close flush
    }).catch(() => {});
  } catch {
    // Beacons are best-effort - never let a tracking failure surface to the user.
  }
}
