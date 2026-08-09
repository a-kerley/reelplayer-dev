// pageManager.js - "Manage Published Pages" modal: lists pages published to
// the Cloudflare Worker, lets you copy each one's public URL, and delete
// ones no longer needed. The Pages counterpart of
// js/modules/embedManager.js, with a slug + "Copy Link" button in place of
// the embed id shown there (a page's slug IS its public identifier, unlike
// a reel's embed id which nothing outside this app ever needs to see).
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { publicPageUrl } from "./pagePublish.js";

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

function renderListHTML(entries) {
  if (!entries.length) {
    return '<p class="builder-empty-state">No published pages yet.</p>';
  }

  return `
    <div style="max-height:300px;overflow-y:auto;">
      ${entries.map(entry => `
        <div class="page-manager-row" data-slug="${entry.slug}" style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #444;gap:0.5rem;">
          <div style="min-width:0;">
            <div style="font-weight:600;">${entry.title || "(untitled)"}</div>
            <div style="font-size:0.8rem;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">/page?slug=${entry.slug}${entry.published ? " &middot; " + new Date(entry.published).toLocaleString() : ""}</div>
          </div>
          <div style="display:flex;gap:0.4rem;flex-shrink:0;">
            <button type="button" class="page-manager-copy-btn" data-slug="${entry.slug}"
              style="background:none;border:1px solid var(--builder-accent);color:var(--builder-accent);border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Copy Link</button>
            <button type="button" class="page-manager-delete-btn" data-slug="${entry.slug}"
              style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Delete</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

async function openPageManager() {
  const password = await getBuilderPassword();
  if (!password) return;

  let entries;
  try {
    entries = await fetchPageList(password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  dialog.createDialog({
    type: "custom",
    message: "Published Pages",
    content: renderListHTML(entries),
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    document.querySelectorAll(".page-manager-copy-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(publicPageUrl(btn.dataset.slug)).then(() => {
          dialog.closeDialog();
          setTimeout(() => dialog.alert("Link copied to clipboard!"), 200);
        }).catch(() => {
          dialog.closeDialog();
          setTimeout(() => dialog.alert("Failed to copy - please copy the URL manually."), 200);
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
          openPageManager(); // refresh the list
        } catch (error) {
          dialog.alert(error.message);
        }
      });
    });
  }, 50);
}

export function setupPageManagerButton() {
  const btn = document.getElementById("managePagesBtn");
  if (btn) {
    btn.onclick = () => openPageManager();
  }
}
