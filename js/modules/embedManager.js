// embedManager.js - "Manage Published Embeds" modal: lists reels published to
// the Cloudflare Worker and lets you delete ones you no longer need.
import { dialog } from "./dialogSystem.js";
import { apiFetch } from "./builderAuth.js";
import { openStatsModal } from "./statsViewer.js";
import { escapeHtml } from "./domUtils.js";

async function fetchReelList() {
  const response = await apiFetch("/reels");
  if (!response.ok) {
    throw new Error(`Failed to load published reels (status ${response.status}).`);
  }
  return response.json();
}

async function deleteReel(id) {
  const response = await apiFetch(`/reels/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to delete reel (status ${response.status}).`);
  }
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unknown date";
}

// Every publish mints a new content-hash id, so one reel usually has several
// entries here. Grouped by its draft id (sourceReelId) - one card per reel,
// its versions underneath - since stats are per reel, not per version.
// Legacy publishes with no sourceReelId stand alone as their own group.
export function groupByReel(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const key = entry.sourceReelId || entry.id;
    if (!groups.has(key)) groups.set(key, { key, sourceReelId: entry.sourceReelId, versions: [] });
    groups.get(key).versions.push(entry);
  });
  const byNewest = (a, b) => (a.created || "") < (b.created || "") ? 1 : -1;
  return [...groups.values()]
    .map((g) => ({ ...g, versions: g.versions.sort(byNewest) }))
    .sort((a, b) => byNewest(a.versions[0], b.versions[0]));
}

// currentReelId - the draft id of the reel open in the builder, matched
// against each group's sourceReelId so the highlight survives republishes.
function renderListHTML(groups, currentReelId) {
  // KV writes aren't instantly consistent across every edge location, so a
  // reel published moments ago can briefly be missing from this list even
  // though the publish itself succeeded - this note is shown unconditionally
  // (not just on a suspicious-looking empty list) since there's no reliable
  // way to detect "this is probably that case" from here.
  const lagNotice = `<p class="manage-footnote">Just published something? It can take a few seconds to show up here - reopen this window if you don't see it yet.</p>`;

  if (!groups.length) {
    return '<p class="builder-empty-state builder-empty-state--block">No published reels yet.</p>' + lagNotice;
  }

  const cards = groups.map((group) => {
    const latest = group.versions[0];
    const title = escapeHtml(latest.title || "(untitled)");
    const isCurrent = currentReelId && group.sourceReelId === currentReelId;
    const analyticsBadge = latest.analyticsEnabled
      ? '<span class="manage-badge manage-badge--on">Analytics on</span>'
      : '<span class="manage-badge">Analytics off</span>';
    const versionCount = `<span class="manage-badge">${group.versions.length} version${group.versions.length === 1 ? "" : "s"}</span>`;

    const versions = group.versions.map((v, i) => `
      <div class="manage-version">
        <span class="manage-version-date">${formatDate(v.created)}</span>
        ${i === 0 ? '<span class="manage-badge manage-badge--on">Latest</span>' : ""}
        <code class="manage-id" title="Embed id">${escapeHtml(v.id)}</code>
        <button type="button" class="manage-btn manage-btn--danger embed-manager-delete-btn" data-id="${escapeHtml(v.id)}" data-title="${title}" data-created="${escapeHtml(formatDate(v.created))}"
          title="Permanently delete this published version">Delete</button>
      </div>`).join("");

    return `
      <div class="manage-card${isCurrent ? " is-current" : ""}">
        <div class="manage-card-header">
          <div class="manage-card-title">${title}${isCurrent ? '<span class="manage-current-tag">Currently editing</span>' : ""}</div>
          <button type="button" class="manage-btn embed-manager-stats-btn" data-id="${escapeHtml(latest.id)}" data-source-id="${escapeHtml(group.sourceReelId || "")}" data-analytics="${latest.analyticsEnabled ? "on" : "off"}" data-title="${title}"
            title="View opens/plays/listen-time analytics for this reel (all its published versions combined)">Stats</button>
        </div>
        <div class="manage-badges">${analyticsBadge}${versionCount}</div>
        <div class="manage-versions">${versions}</div>
      </div>`;
  }).join("");

  return `<div class="manage-list">${cards}</div>${lagNotice}`;
}

async function openEmbedManager(getCurrentReel) {
  let entries;
  try {
    entries = await fetchReelList();
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const groups = groupByReel(entries);

  dialog.createDialog({
    type: "custom",
    message: `Published Reels (${groups.length})`,
    content: renderListHTML(groups, getCurrentReel?.()?.id),
    maxWidth: "640px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".embed-manager-stats-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        // Stats are filed per reel (its draft id), not per publish - a
        // legacy publish with no sourceReelId falls back to its own id.
        openStatsModal("reel", btn.dataset.sourceId || btn.dataset.id, btn.dataset.title, [btn.dataset.id], { analyticsEnabled: btn.dataset.analytics === "on" });
      });
    });

    document.querySelectorAll(".embed-manager-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmed = await dialog.confirm(
          `Delete the version of "${btn.dataset.title}" published ${btn.dataset.created}? Standalone embeds using this version will stop working. Pages and Project Cards always use the latest version and aren't affected. This can't be undone.`,
          "Delete",
          "Cancel"
        );
        if (!confirmed) return;

        try {
          await deleteReel(id);
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
 *   card in the list (via its draft id). Omit to skip that.
 */
export function setupEmbedManagerButton(getCurrentReel) {
  const btn = document.getElementById("manageEmbedsBtn");
  if (btn) {
    btn.onclick = () => openEmbedManager(getCurrentReel);
  }
}
