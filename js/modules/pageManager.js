// pageManager.js - "Manage Published Pages" modal: lists pages published to
// the Cloudflare Worker, lets you copy each one's public URL, and delete
// ones no longer needed. The Pages counterpart of
// js/modules/embedManager.js, with a slug + "Copy Link" button in place of
// the embed id shown there (a page's slug IS its public identifier, unlike
// a reel's embed id which nothing outside this app ever needs to see).
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { showToast } from "./toast.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { publicPageUrl } from "./pagePublish.js";
import { openStatsModal } from "./statsViewer.js";

async function fetchPageList(password) {
  const response = await fetch(`${WORKER_BASE_URL}/pages`, {
    headers: { "Authorization": `Bearer ${password}` }
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to load published pages (status ${response.status}).`);
  }
  return response.json();
}

async function deletePublishedPage(slug, password) {
  const response = await fetch(`${WORKER_BASE_URL}/pages/${slug}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${password}` }
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to delete page (status ${response.status}).`);
  }
}

// currentSlug - the publishedSlug of the page currently open in the
// builder, if any (js/pagesController.js's handlePublish() sets this on
// publish) - marks that one row so "which of these is the one I'm looking
// at right now" doesn't require cross-referencing slugs by eye.
function renderListHTML(entries, currentSlug) {
  if (!entries.length) {
    return '<p class="builder-empty-state">No published pages yet.</p>';
  }

  return `
    <div style="max-height:300px;overflow-y:auto;">
      ${entries.map(entry => {
        const isCurrent = currentSlug && entry.slug === currentSlug;
        return `
        <div class="page-manager-row" data-slug="${entry.slug}" style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #444;gap:0.5rem;${isCurrent ? "background:rgba(74,144,226,0.1);" : ""}">
          <div style="min-width:0;">
            <div style="font-weight:600;">${entry.title || "(untitled)"}${isCurrent ? ' <span style="color:var(--builder-accent);font-weight:600;font-size:0.8rem;">(currently editing)</span>' : ""}</div>
            <div style="font-size:0.8rem;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">/page?slug=${entry.slug}${entry.published ? " &middot; " + new Date(entry.published).toLocaleString() : ""}</div>
          </div>
          <div style="display:flex;gap:0.4rem;flex-shrink:0;">
            <button type="button" class="page-manager-stats-btn" data-slug="${entry.slug}" data-title="${(entry.title || "").replace(/"/g, "&quot;")}"
              style="background:none;border:1px solid var(--builder-accent);color:var(--builder-accent);border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Stats</button>
            <button type="button" class="page-manager-copy-btn" data-slug="${entry.slug}"
              style="background:none;border:1px solid var(--builder-accent);color:var(--builder-accent);border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Copy Link</button>
            <button type="button" class="page-manager-delete-btn" data-slug="${entry.slug}"
              style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Delete</button>
          </div>
        </div>
      `;
      }).join("")}
    </div>
  `;
}

async function openPageManager(getCurrentPage) {
  const password = await getBuilderPassword();
  if (!password) return;

  let entries;
  try {
    entries = await fetchPageList(password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const currentSlug = getCurrentPage?.()?.publishedSlug;

  dialog.createDialog({
    type: "custom",
    message: "Published Pages",
    content: renderListHTML(entries, currentSlug),
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".page-manager-stats-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openStatsModal("page", btn.dataset.slug, btn.dataset.title);
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
          `Delete published page "/page?slug=${slug}"? This cannot be undone.`,
          "Delete",
          "Cancel"
        );
        if (!confirmed) return;

        try {
          await deletePublishedPage(slug, password);
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
 *   entry in the list (via its publishedSlug). Omit to skip that.
 */
export function setupPageManagerButton(getCurrentPage) {
  const btn = document.getElementById("managePagesBtn");
  if (btn) {
    btn.onclick = () => openPageManager(getCurrentPage);
  }
}
