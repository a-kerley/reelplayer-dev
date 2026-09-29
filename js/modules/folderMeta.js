// folderMeta.js - GET/POST /folder-meta/:type (see worker/src/index.js),
// the one place a sidebar folder's name persists independent of any item
// referencing it - lets js/modules/sidebarList.js support an empty folder
// (created but nothing moved into it yet) and cross-device-synced
// collapse state. Best-effort both ways: a failure falls back to no folder
// metadata rather than blocking the sidebar.
import { apiFetch } from "./builderAuth.js";

/**
 * @param {"reel"|"page"|"card"} type
 * @returns {Promise<{names: string[], collapsed: string[]}>}
 */
export async function loadFolderMeta(type) {
  try {
    const response = await apiFetch(`/folder-meta/${type}`);
    if (response.ok) return response.json();
  } catch {
    // apiFetch() already offered a fresh sign-in if that's the cause.
  }
  return { names: [], collapsed: [] };
}

/**
 * @param {"reel"|"page"|"card"} type
 * @param {{names: string[], collapsed: string[]}} meta
 */
export async function saveFolderMeta(type, meta) {
  try {
    await apiFetch(`/folder-meta/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
  } catch {
    // Best-effort, same as before.
  }
}
