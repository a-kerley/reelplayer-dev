// pageManager.js - "Manage Published Pages" modal: lists pages published to
// the Cloudflare Worker, lets you copy each one's public URL, and delete
// ones no longer needed. The Pages counterpart of
// js/modules/embedManager.js, with a slug + "Copy Link" button in place of
// the embed id shown there (a page's slug IS its public identifier, unlike
// a reel's embed id which nothing outside this app ever needs to see).
import { dialog } from "./dialogSystem.js";
import { showToast } from "./toast.js";
import { apiFetch } from "./builderAuth.js";
import { publicPageUrl } from "./pagePublish.js";
import { openStatsModal } from "./statsViewer.js";
import { escapeHtml } from "./domUtils.js";

async function fetchPageList() {
  const response = await apiFetch("/pages");
  if (!response.ok) {
    throw new Error(`Failed to load published pages (status ${response.status}).`);
  }
  return response.json();
}

async function deletePublishedPage(slug) {
  const response = await apiFetch(`/pages/${slug}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to delete page (status ${response.status}).`);
  }
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unknown date";
}

// currentPageId - the draft id of the page open in the builder, matched
// against each entry's id so the highlight survives a slug rename.
function renderListHTML(entries, currentPageId) {
  // Mirrors embedManager.js's identical note - KV writes aren't instantly
  // consistent across every edge location, so a page published moments ago
  // can briefly be missing from this list even though the publish itself
  // succeeded.
  const lagNotice = `<p class="manage-footnote">Just published something? It can take a few seconds to show up here - reopen this window if you don't see it yet.</p>`;

  if (!entries.length) {
    return '<p class="builder-empty-state builder-empty-state--block">No published pages yet.</p>' + lagNotice;
  }

  const cards = [...entries]
    .sort((a, b) => ((a.published || "") < (b.published || "") ? 1 : -1))
    .map((entry) => {
      const title = escapeHtml(entry.title || "(untitled)");
      const slug = escapeHtml(entry.slug);
      const isCurrent = currentPageId && entry.id === currentPageId;
      const analyticsBadge = entry.analyticsEnabled
        ? '<span class="manage-badge manage-badge--on">Analytics on</span>'
        : '<span class="manage-badge">Analytics off</span>';

      return `
      <div class="manage-card${isCurrent ? " is-current" : ""}">
        <div class="manage-card-header">
          <div class="manage-card-title">${title}${isCurrent ? '<span class="manage-current-tag">Currently editing</span>' : ""}</div>
          <div class="manage-card-actions">
            <button type="button" class="manage-btn page-manager-stats-btn" data-slug="${slug}" data-id="${escapeHtml(entry.id || "")}" data-analytics="${entry.analyticsEnabled ? "on" : "off"}" data-title="${title}"
              title="View how many times this page has been opened">Stats</button>
            <button type="button" class="manage-btn page-manager-copy-btn" data-slug="${slug}"
              title="Copy this page's public link">Copy Link</button>
            <button type="button" class="manage-btn manage-btn--danger page-manager-delete-btn" data-slug="${slug}" data-title="${title}"
              title="Unpublish this page - its link stops working">Delete</button>
          </div>
        </div>
        <div class="manage-badges">
          ${analyticsBadge}
          <span class="manage-badge">Published ${formatDate(entry.published)}</span>
          <code class="manage-id" title="Public path">/p/${slug}</code>
        </div>
      </div>`;
    }).join("");

  return `<div class="manage-list">${cards}</div>${lagNotice}`;
}

async function openPageManager(getCurrentPage) {
  let entries;
  try {
    entries = await fetchPageList();
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  dialog.createDialog({
    type: "custom",
    message: `Published Pages (${entries.length})`,
    content: renderListHTML(entries, getCurrentPage?.()?.id),
    maxWidth: "640px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".page-manager-stats-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openStatsModal("page", btn.dataset.id || btn.dataset.slug, btn.dataset.title, [btn.dataset.slug], { analyticsEnabled: btn.dataset.analytics === "on" });
      });
    });

    document.querySelectorAll(".page-manager-copy-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(publicPageUrl(btn.dataset.slug)).then(() => {
          showToast("Link copied to clipboard!");
        }).catch(() => {
          showToast("Failed to copy - please copy the URL manually.");
        });
      });
    });

    document.querySelectorAll(".page-manager-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const slug = btn.dataset.slug;
        const confirmed = await dialog.confirm(
          `Unpublish "${btn.dataset.title}" (/p/${slug})? Its link will stop working. The draft stays in your Pages list, so you can publish it again.`,
          "Delete",
          "Cancel"
        );
        if (!confirmed) return;

        try {
          await deletePublishedPage(slug);
          openPageManager(getCurrentPage); // refresh the list
        } catch (error) {
          dialog.alert(error.message);
        }
      });
    });
  }, 50);
}

/**
 * @param {() => Object|undefined} [getCurrentPage] - returns the page
 *   currently open in the builder, if any - used only to highlight its
 *   entry in the list (via its draft id). Omit to skip that.
 */
export function setupPageManagerButton(getCurrentPage) {
  const btn = document.getElementById("managePagesBtn");
  if (btn) {
    btn.onclick = () => openPageManager(getCurrentPage);
  }
}
