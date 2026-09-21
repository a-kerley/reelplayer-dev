// folderMeta.js - GET/POST /folder-meta/:type (see worker/src/index.js),
// the one place a sidebar folder's name persists independent of any item
// referencing it - lets js/modules/sidebarList.js support an empty folder
// (created but nothing moved into it yet) and cross-device-synced
// collapse state. Same auth pattern as js/modules/cardPublish.js.
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

/**
 * @param {"reel"|"page"|"card"} type
 * @returns {Promise<{names: string[], collapsed: string[]}>}
 */
export async function loadFolderMeta(type) {
  const password = await getBuilderPassword();
  if (!password) return { names: [], collapsed: [] };

  const response = await fetch(`${WORKER_BASE_URL}/folder-meta/${type}`, {
    headers: { Authorization: `Bearer ${password}` },
  });
  if (response.status === 401) {
    clearBuilderPassword();
    return { names: [], collapsed: [] };
  }
  if (!response.ok) return { names: [], collapsed: [] };
  return response.json();
}

/**
 * @param {"reel"|"page"|"card"} type
 * @param {{names: string[], collapsed: string[]}} meta
 */
export async function saveFolderMeta(type, meta) {
  const password = await getBuilderPassword();
  if (!password) return;

  const response = await fetch(`${WORKER_BASE_URL}/folder-meta/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
    body: JSON.stringify(meta),
  });
  if (response.status === 401) clearBuilderPassword();
}
