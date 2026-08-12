// embedManager.js - "Manage Published Embeds" modal: lists reels published to
// the Cloudflare Worker and lets you delete ones you no longer need.
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { openStatsModal } from "./statsViewer.js";

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

async function deleteReel(id, password) {
  const response = await fetch(`${WORKER_BASE_URL}/reels/${id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${password}` }
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to delete reel (status ${response.status}).`);
  }
}

const BADGE_STYLE = "display:inline-block;background:#1e1e1e;border:1px solid #444;border-radius:4px;padding:0.15em 0.55em;font-size:0.75rem;color:#999;";

// currentEmbedId - the reel currently open in the builder's own
// publishedEmbedId (js/main.js's updateReelPublishStatus() sets this on
// publish), if any. Since a reel's embed id is a content hash, this only
// ever matches when the currently-open draft is exactly what's live at
// that entry - marks that one row so "which of these is the one I'm
// looking at right now" doesn't require cross-referencing ids by eye.
function renderListHTML(entries, currentEmbedId) {
  // KV writes aren't instantly consistent across every edge location, so a
  // reel published moments ago can briefly be missing from this list even
  // though the publish itself succeeded - this note is shown unconditionally
  // (not just on a suspicious-looking empty list) since there's no reliable
  // way to detect "this is probably that case" from here.
  const lagNotice = `<p style="font-size:0.8rem;color:#888;margin:0 0 1rem;">Just published something? It can take a few seconds to show up here - reopen this dialog if you don't see it yet.</p>`;

  if (!entries.length) {
    return lagNotice + '<p class="builder-empty-state">No published reels yet.</p>';
  }

  const rows = `
    <div style="max-height:420px;overflow-y:auto;">
      ${entries.map(entry => {
        const isCurrent = currentEmbedId && entry.id === currentEmbedId;
        const analyticsBadge = entry.analyticsEnabled
          ? `<span style="${BADGE_STYLE}color:var(--builder-accent);border-color:var(--builder-accent);">Analytics on</span>`
          : `<span style="${BADGE_STYLE}">Analytics off</span>`;
        const dateBadge = entry.created
          ? `<span style="${BADGE_STYLE}">Published ${new Date(entry.created).toLocaleString()}</span>`
          : "";
        const idBadge = `<span style="${BADGE_STYLE}font-family:monospace;">${entry.id}</span>`;

        return `
        <div class="embed-manager-row" data-id="${entry.id}" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.85rem 0;border-bottom:1px solid #444;${isCurrent ? "background:rgba(74,144,226,0.1);" : ""}">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:600;font-size:0.95rem;">${entry.title || "(untitled)"}${isCurrent ? ' <span style="color:var(--builder-accent);font-weight:600;font-size:0.8rem;">(currently editing)</span>' : ""}</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem;">
              ${dateBadge}${analyticsBadge}${idBadge}
            </div>
          </div>
          <div style="display:flex;gap:0.4rem;flex-shrink:0;">
            <button type="button" class="embed-manager-stats-btn" data-id="${entry.id}" data-title="${(entry.title || "").replace(/"/g, "&quot;")}"
              style="background:none;border:1px solid var(--builder-accent);color:var(--builder-accent);border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Stats</button>
            <button type="button" class="embed-manager-delete-btn" data-id="${entry.id}"
              style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Delete</button>
          </div>
        </div>
      `;
      }).join("")}
    </div>
  `;

  return lagNotice + rows;
}

async function openEmbedManager(getCurrentReel) {
  const password = await getBuilderPassword();
  if (!password) return;

  let entries;
  try {
    entries = await fetchReelList(password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const currentEmbedId = getCurrentReel?.()?.publishedEmbedId;

  dialog.createDialog({
    type: "custom",
    message: "Published Reels",
    content: renderListHTML(entries, currentEmbedId),
    maxWidth: "640px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".embed-manager-stats-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openStatsModal("reel", btn.dataset.id, btn.dataset.title);
      });
    });

    document.querySelectorAll(".embed-manager-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmed = await dialog.confirm(
          `Delete published reel "${id}"? This cannot be undone.`,
          "Delete",
          "Cancel"
        );
        if (!confirmed) return;

        try {
          await deleteReel(id, password);
          openEmbedManager(getCurrentReel); // refresh the list
        } catch (error) {
          dialog.alert(error.message);
        }
      });
    });
  }, 50);
}

/**
 * @param {() => Object|undefined} [getCurrentReel] - returns the reel
 *   currently open in the builder, if any - used only to highlight its
 *   entry in the list (via its publishedEmbedId). Omit to skip that.
 */
export function setupEmbedManagerButton(getCurrentReel) {
  const btn = document.getElementById("manageEmbedsBtn");
  if (btn) {
    btn.onclick = () => openEmbedManager(getCurrentReel);
  }
}
