// cardManager.js - "Manage Published Cards" modal: the Project Cards
// counterpart of js/modules/embedManager.js. Every publish mints a new
// content-hash card id, so versions are grouped one card per draft
// (sourceCardId) the same way reels are - stats are per card, not per
// version. Cards have no live alias (unlike reels), so a hosting page embeds
// one exact version - deleting it breaks that embed.
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { openStatsModal } from "./statsViewer.js";
import { escapeHtml } from "./domUtils.js";
import { publicCardPlayerUrl } from "./cardPublish.js";

async function authedFetch(path, password, options = {}) {
  const response = await fetch(`${WORKER_BASE_URL}${path}`, {
    ...options,
    headers: { "Authorization": `Bearer ${password}` }
  });
  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Request failed (status ${response.status}).`);
  }
  return response;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unknown date";
}

// Cards published before sourceCardId existed stand alone as their own group.
function groupByCard(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const key = entry.sourceCardId || entry.id;
    if (!groups.has(key)) groups.set(key, { sourceCardId: entry.sourceCardId, versions: [] });
    groups.get(key).versions.push(entry);
  });
  const byNewest = (a, b) => ((a.created || "") < (b.created || "") ? 1 : -1);
  return [...groups.values()]
    .map((g) => ({ ...g, versions: g.versions.sort(byNewest) }))
    .sort((a, b) => byNewest(a.versions[0], b.versions[0]));
}

function renderListHTML(groups, currentCardId) {
  const lagNotice = `<p class="manage-footnote">Just published something? It can take a few seconds to show up here - reopen this window if you don't see it yet.</p>`;

  if (!groups.length) {
    return '<p class="builder-empty-state builder-empty-state--block">No published cards yet.</p>' + lagNotice;
  }

  const cards = groups.map((group) => {
    const latest = group.versions[0];
    const title = escapeHtml(latest.title || "(untitled)");
    const isCurrent = currentCardId && group.sourceCardId === currentCardId;
    const badges = [
      latest.analyticsEnabled
        ? '<span class="manage-badge manage-badge--on">Analytics on</span>'
        : '<span class="manage-badge">Analytics off</span>',
      latest.reelId ? "" : '<span class="manage-badge manage-badge--warn" title="The latest version has no reel linked - its Listen tab is empty">No reel linked</span>',
      `<span class="manage-badge">${group.versions.length} version${group.versions.length === 1 ? "" : "s"}</span>`,
    ].join("");

    const versions = group.versions.map((v, i) => `
      <div class="manage-version">
        <span class="manage-version-date">${formatDate(v.created)}</span>
        ${i === 0 ? '<span class="manage-badge manage-badge--on">Latest</span>' : ""}
        <code class="manage-id" title="Card id">${escapeHtml(v.id)}</code>
        <button type="button" class="manage-btn card-manager-open-btn" data-id="${escapeHtml(v.id)}"
          title="Open this version in a new tab">Open</button>
        <button type="button" class="manage-btn manage-btn--danger card-manager-delete-btn" data-id="${escapeHtml(v.id)}" data-title="${title}" data-created="${escapeHtml(formatDate(v.created))}"
          title="Permanently delete this published version">Delete</button>
      </div>`).join("");

    return `
      <div class="manage-card${isCurrent ? " is-current" : ""}">
        <div class="manage-card-header">
          <div class="manage-card-title">${title}${isCurrent ? '<span class="manage-current-tag">Currently editing</span>' : ""}</div>
          <button type="button" class="manage-btn card-manager-stats-btn" data-id="${escapeHtml(latest.id)}" data-source-id="${escapeHtml(group.sourceCardId || "")}" data-analytics="${latest.analyticsEnabled ? "on" : "off"}" data-title="${title}"
            title="View views, plays and listen time for this card (all its published versions combined)">Stats</button>
        </div>
        <div class="manage-badges">${badges}</div>
        <div class="manage-versions">${versions}</div>
      </div>`;
  }).join("");

  return `<div class="manage-list">${cards}</div>${lagNotice}`;
}

async function openCardManager(getCurrentCard) {
  const password = await getBuilderPassword();
  if (!password) return;

  let entries;
  try {
    entries = await (await authedFetch("/cards", password)).json();
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const groups = groupByCard(entries);

  dialog.createDialog({
    type: "custom",
    message: `Published Cards (${groups.length})`,
    content: renderListHTML(groups, getCurrentCard?.()?.id),
    maxWidth: "640px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".card-manager-stats-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openStatsModal("card", btn.dataset.sourceId || btn.dataset.id, btn.dataset.title, [btn.dataset.id], { analyticsEnabled: btn.dataset.analytics === "on" });
      });
    });

    document.querySelectorAll(".card-manager-open-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.open(publicCardPlayerUrl(btn.dataset.id), "_blank", "noopener");
      });
    });

    document.querySelectorAll(".card-manager-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const confirmed = await dialog.confirm(
          `Delete the version of "${btn.dataset.title}" published ${btn.dataset.created}? Anywhere this exact version is embedded will stop showing it. This can't be undone.`,
          "Delete",
          "Cancel"
        );
        if (!confirmed) return;

        try {
          await authedFetch(`/cards/${btn.dataset.id}`, password, { method: "DELETE" });
          openCardManager(getCurrentCard); // refresh the list
        } catch (error) {
          dialog.alert(error.message);
        }
      });
    });
  }, 50);
}

/**
 * @param {() => Object|undefined} [getCurrentCard] - returns the card draft
 *   open in the builder, if any - used only to highlight its group.
 */
export function setupCardManagerButton(getCurrentCard) {
  const btn = document.getElementById("manageCardsBtn");
  if (btn) {
    btn.onclick = () => openCardManager(getCurrentCard);
  }
}
