// builderAuth.js - the builder's one way to call the password-protected
// API. There is no password any more: on reels-admin.boxedape.com Cloudflare
// Access signs you in (email one-time PIN) before the page even loads, and
// its session cookie rides along on these same-origin requests; the API
// verifies it (worker/src/index.js "Auth"). Locally, the dev API trusts the
// machine (LOCAL_DEV_AUTH in worker/.dev.vars). So callers just make the
// request - apiFetch() only has to handle the session running out.
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";

// Earlier builds cached the shared API password here in plaintext; clear it
// out of every browser that still has it.
try {
  localStorage.removeItem("builderPassword");
} catch {
  // Storage disabled - nothing stored to clear.
}

let sessionPromptShown = false;

// An expired Access session shows up two ways: a 401 from the API, or -
// because Access answers an expired request with a redirect to its
// cross-origin login page, which fetch() can't follow - a network error.
// Either way the fix is a full reload, which goes back through the Access
// sign-in. Offline is the one network error that isn't this, so it's left
// alone.
function promptToSignInAgain() {
  if (sessionPromptShown) return;
  sessionPromptShown = true;
  dialog.createDialog({
    type: "custom",
    message: "Your sign-in has expired",
    content: "<p>Sign in again to keep working. Unsaved edits made in the last few seconds may need redoing.</p>",
    buttons: [
      { text: "Sign in again", type: "primary", onClick: () => window.location.reload() },
    ],
  });
}

/**
 * fetch() against the API: `path` is appended to WORKER_BASE_URL. Resolves
 * with the Response for any status except 401 (callers still check
 * response.ok for their own error messages); rejects on 401 or a network
 * failure, after offering a fresh sign-in.
 * @param {string} path - e.g. "/drafts" or `/reels/${id}`
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${WORKER_BASE_URL}${path}`, options);
  } catch (error) {
    if (WORKER_BASE_URL.startsWith("http://localhost")) {
      throw new Error("Couldn't reach the local API - is `npx wrangler dev` running in worker/?");
    }
    if (navigator.onLine !== false) promptToSignInAgain();
    throw new Error("Couldn't reach the server - check your connection, or sign in again.");
  }
  if (response.status === 401) {
    promptToSignInAgain();
    throw new Error("Your sign-in has expired.");
  }
  return response;
}
