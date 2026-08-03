// embedManager.js - "Manage Published Embeds" modal: lists reels published to
// the Cloudflare Worker and lets you delete ones you no longer need.
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

function renderListHTML(entries) {
  if (!entries.length) {
    return '<p style="color:#666;font-style:italic;">No published reels yet.</p>';
  }

  return `
    <div style="max-height:300px;overflow-y:auto;">
      ${entries.map(entry => `
        <div class="embed-manager-row" data-id="${entry.id}" style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #eee;">
          <div>
            <div style="font-weight:600;">${entry.title || "(untitled)"}</div>
            <div style="font-size:0.8rem;color:#888;">${entry.id}${entry.created ? " &middot; " + new Date(entry.created).toLocaleString() : ""}</div>
          </div>
          <button type="button" class="embed-manager-delete-btn" data-id="${entry.id}"
            style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:0.4em 0.8em;cursor:pointer;">Delete</button>
        </div>
      `).join("")}
    </div>
  `;
}

async function openEmbedManager() {
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
    message: "Published Reels",
    content: renderListHTML(entries),
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
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
          openEmbedManager(); // refresh the list
        } catch (error) {
          dialog.alert(error.message);
        }
      });
    });
  }, 50);
}

export function setupEmbedManagerButton() {
  const btn = document.getElementById("manageEmbedsBtn");
  if (btn) {
    btn.onclick = () => openEmbedManager();
  }
}
