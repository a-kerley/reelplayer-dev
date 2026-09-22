// reelPicker.js - "Select a Reel" modal for page player blocks and Project
// Cards: lists published reels and lets you pick one by reference
// (js/pagesController.js/js/cardsController.js store just the picked
// reel's id, never a copy of its config - see pageBlockRenderer.js's
// renderPlayer() for why). Read-only single-select variant of
// js/modules/embedManager.js's fetch/render pattern - same GET /reels
// call, no delete button.
//
// onSelect is handed a `live-<sourceReelId>` reference (not the raw
// content-hash `entry.id`) whenever the picked entry has a sourceReelId -
// the Worker's reelStorageKey() resolves that to whatever hash was most
// recently published for that reel draft, so a Page/Card that references
// it this way stays current across future republishes of the reel instead
// of freezing on today's hash. Falls back to the raw hash for reels
// published before this field existed.
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

async function fetchReelList(password) {
  const response = await fetch(`${WORKER_BASE_URL}/reels`, {
    headers: { "Authorization": `Bearer ${password}` }
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to load published reels (status ${response.status}).`);
  }
  return response.json();
}

function renderListHTML(entries) {
  if (!entries.length) {
    return '<p class="builder-empty-state">No published reels yet - publish a reel first (Reels tab &rarr; Export Embed Code), then come back to add it here.</p>';
  }

  return `
    <div style="max-height:300px;overflow-y:auto;">
      ${entries.map(entry => `
        <div class="reel-picker-row" data-id="${entry.id}" data-source-id="${entry.sourceReelId || ""}" data-title="${(entry.title || "").replace(/"/g, "&quot;")}"
          title="Select this reel" role="button"
          style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #444;cursor:pointer;">
          <div>
            <div style="font-weight:600;">${entry.title || "(untitled)"}</div>
            <div style="font-size:0.8rem;color:#888;">${entry.id}${entry.created ? " &middot; " + new Date(entry.created).toLocaleString() : ""}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/**
 * @param {Object} opts
 * @param {(reelId: string, reelTitle: string) => void} opts.onSelect
 */
export async function openReelPicker({ onSelect }) {
  const password = await getBuilderPassword();
  if (!password) return;

  let entries;
  try {
    entries = await fetchReelList(password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  dialog.createDialog({
    type: "custom",
    message: "Select a Reel",
    content: renderListHTML(entries),
    buttons: [
      { text: "Cancel", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".reel-picker-row").forEach(row => {
      row.addEventListener("mouseenter", () => { row.style.background = "#333"; });
      row.addEventListener("mouseleave", () => { row.style.background = ""; });
      row.addEventListener("click", () => {
        const liveId = row.dataset.sourceId ? `live-${row.dataset.sourceId}` : row.dataset.id;
        onSelect(liveId, row.dataset.title);
        dialog.closeDialog();
      });
    });
  }, 50);
}
