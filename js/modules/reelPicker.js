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
//
// GET /reels returns every version ever published (each publish mints a new
// hash, and old ones are kept for embeds that still point at them), so the
// list is collapsed to one row per reel via embedManager.js's groupByReel(),
// and limited to reels that still exist as drafts in the builder.
import { dialog } from "./dialogSystem.js";
import { apiFetch } from "./builderAuth.js";
import { escapeHtml } from "./domUtils.js";
import { groupByReel } from "./embedManager.js";

async function fetchJson(path, what) {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${what} (status ${response.status}).`);
  }
  return response.json();
}

// One entry per currently published reel: its latest version, referenced by
// live-<draftId> so the pick follows future republishes. Legacy publishes
// with no sourceReelId only appear if a draft still names that exact hash.
async function fetchPublishedReels() {
  const [entries, drafts] = await Promise.all([
    fetchJson("/reels", "published reels"),
    fetchJson("/drafts", "reels")
  ]);
  const draftIds = new Set(drafts.map((d) => d.id));
  const publishedHashes = new Set(drafts.map((d) => d.publishedEmbedId).filter(Boolean));
  return groupByReel(entries)
    .filter((g) => g.sourceReelId ? draftIds.has(g.sourceReelId) : publishedHashes.has(g.key))
    .map((g) => ({
      id: g.sourceReelId ? `live-${g.sourceReelId}` : g.key,
      title: g.versions[0].title,
      created: g.versions[0].created
    }));
}

function renderListHTML(reels) {
  if (!reels.length) {
    return '<p class="builder-empty-state">No published reels yet - publish a reel first (Reels tab &rarr; Export Embed Code), then come back to add it here.</p>';
  }

  return `
    <div style="max-height:300px;overflow-y:auto;">
      ${reels.map(reel => `
        <div class="reel-picker-row" data-id="${escapeHtml(reel.id)}" data-title="${escapeHtml(reel.title || "")}"
          title="Select this reel" role="button"
          style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #444;cursor:pointer;">
          <div>
            <div style="font-weight:600;">${escapeHtml(reel.title || "(untitled)")}</div>
            <div style="font-size:0.8rem;color:#888;">${reel.created ? "Last published " + new Date(reel.created).toLocaleString() : ""}</div>
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
  let reels;
  try {
    reels = await fetchPublishedReels();
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  dialog.createDialog({
    type: "custom",
    message: "Select a Reel",
    content: renderListHTML(reels),
    buttons: [
      { text: "Cancel", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".reel-picker-row").forEach(row => {
      row.addEventListener("mouseenter", () => { row.style.background = "#333"; });
      row.addEventListener("mouseleave", () => { row.style.background = ""; });
      row.addEventListener("click", () => {
        onSelect(row.dataset.id, row.dataset.title);
        dialog.closeDialog();
      });
    });
  }, 50);
}
