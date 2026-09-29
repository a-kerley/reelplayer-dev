// builderAuth.js - Shared password prompt for the publish/manage embed actions.
// This does NOT gate the builder page itself, only requests to the Worker API
// (publishing a reel, listing/deleting published reels).
import { dialog } from "./dialogSystem.js";

const STORAGE_KEY = "builderPassword";

export function getCachedBuilderPassword() {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearBuilderPassword() {
  localStorage.removeItem(STORAGE_KEY);
}

function promptForBuilderPassword() {
  return new Promise((resolve) => {
    dialog.createDialog({
      type: "custom",
      message: "Enter the builder password to publish or manage embeds.",
      content: `
        <input type="password" id="builderPasswordInput" placeholder="Password"
          style="width:100%;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:0.95rem;box-sizing:border-box;background:#1e1e1e;color:#fff;" />
      `,
      buttons: [
        {
          text: "Cancel",
          type: "secondary",
          onClick: () => {
            dialog.closeDialog();
            resolve(null);
          },
        },
        {
          text: "Continue",
          type: "primary",
          onClick: () => {
            const input = document.getElementById("builderPasswordInput");
            const value = input ? input.value : "";
            dialog.closeDialog();
            resolve(value || null);
          },
        },
      ],
    });

    setTimeout(() => {
      const input = document.getElementById("builderPasswordInput");
      if (!input) return;
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const continueBtn = Array.from(document.querySelectorAll(".dialog-box button"))
          .find((b) => b.textContent === "Continue");
        if (continueBtn) continueBtn.click();
      });
    }, 150);
  });
}

/**
 * Returns the cached builder password, prompting the user once if none is
 * cached (or if forcePrompt is set, e.g. after a wrong-password rejection).
 * Caches a successfully entered password for next time.
 * @param {Object} options
 * @param {boolean} options.forcePrompt - Skip the cache and prompt anyway
 * @returns {Promise<string|null>} The password, or null if the user cancelled
 */
// On reels-admin.boxedape.com the API authenticates the Cloudflare Access
// session (cookie/JWT) and on localhost the local Worker trusts the machine
// (LOCAL_DEV_AUTH) - no password exists there to ask for. Callers still send
// "Bearer <this>", which the API ignores once the Access token checks out.
// Transitional: the legacy password flow below only remains for the old
// workers.dev / reels.boxedape.com builder until it's removed.
const PASSWORDLESS_HOSTS = ["reels-admin.boxedape.com", "localhost", "127.0.0.1"];
const PASSWORDLESS_TOKEN = "access-session";

export async function getBuilderPassword({ forcePrompt = false } = {}) {
  if (PASSWORDLESS_HOSTS.includes(window.location.hostname)) return PASSWORDLESS_TOKEN;
  if (!forcePrompt) {
    const cached = getCachedBuilderPassword();
    if (cached) return cached;
  }

  const entered = await promptForBuilderPassword();
  if (entered) {
    localStorage.setItem(STORAGE_KEY, entered);
  }
  return entered;
}
