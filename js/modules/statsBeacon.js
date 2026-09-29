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

// The builder (reels-admin.boxedape.com) and the public player/pages
// (reels.boxedape.com) are different origins, so localStorage alone can't
// carry the flag across - it's also written as a cookie for the whole
// boxedape.com domain. Holds nothing but "1". localStorage stays for local
// dev and the legacy workers.dev host, where the cookie can't be shared.
const OPERATOR_COOKIE_DOMAIN = "boxedape.com";

export function markAsOperatorBrowser() {
  try {
    localStorage.setItem(OPERATOR_FLAG_KEY, "1");
  } catch {
    // Private-browsing/storage-disabled - fine, just means this browser
    // won't get excluded; not worth surfacing.
  }
  if (window.location.hostname.endsWith(OPERATOR_COOKIE_DOMAIN)) {
    document.cookie = `${OPERATOR_FLAG_KEY}=1; Domain=${OPERATOR_COOKIE_DOMAIN}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  }
}

function isOperatorBrowser() {
  if (document.cookie.split("; ").includes(`${OPERATOR_FLAG_KEY}=1`)) return true;
  try {
    return localStorage.getItem(OPERATOR_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

// Visitors whose browser sends Global Privacy Control or Do Not Track are
// never counted. Not a legal requirement for this (cookie-less, no stored
// identifiers) kind of analytics in the UK/EU - a deliberate courtesy.
function prefersNoTracking() {
  return navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1" || window.doNotTrack === "1";
}

/** One id per page load, ties a page/reel's "view" beacon to whichever
 * "play" beacons happen during that same visit - not persisted across
 * reloads, since a reload is a new visit. */
export function createSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** @param {'reel'|'page'|'card'} targetType
 *  @param {string} targetId - whatever id this embed loaded with (reel hash
 *    or `live-<id>`, page slug, card id) - the Worker resolves it to the
 *    item's stable draft id before filing the event
 *  @param {Object} payload - {event: 'view'|'play', sessionId, trackIndex?, trackTitle?, listenSeconds?} */
export function sendStatBeacon(targetType, targetId, payload) {
  if (isOperatorBrowser() || prefersNoTracking()) return;
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
