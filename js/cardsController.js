// cardsController.js - Owns all Project Cards-tab orchestration (list/
// select/create/delete/save/render), the Project Cards counterpart of
// js/pagesController.js. v1 stub per docs/project-cards/PLAN.md §7: a reel
// picker + one raw-JSON textarea for every other card field, to prove the
// draft/publish spine end to end before building the real repeater-based
// form (description/stats/links/cardOverrides UI).
import { dialog } from "./modules/dialogSystem.js";
import { showToast } from "./modules/toast.js";
import {
  listCardDrafts,
  loadCardDraft,
  scheduleCardDraftSave,
  flushCardDraftSave,
  deleteCardDraft,
  onCardSaveStatusChange,
} from "./modules/cardDraftStore.js";
import { renderCardsSidebar } from "./cardsSidebar.js";
import { openReelPicker } from "./modules/reelPicker.js";
import { publishCard } from "./modules/cardPublish.js";
import { WORKER_BASE_URL } from "./config.js";

function createEmptyCard() {
  return {
    id: "card-" + Date.now(),
    title: "",
    reelId: null,
    rawJson: "{}",
    analyticsEnabled: false,
    publishedEmbedId: null,
    publishedAt: null,
    createdAt: Date.now(),
  };
}

export function initCardsController() {
  let cards = [];
  let currentCardId = null;
  let loaded = false;

  const cardEditorPane = document.getElementById("cardEditorPane");
  const saveStatusEl = document.getElementById("cardDraftSaveStatus");

  function updateSaveStatusIndicator(status) {
    if (!saveStatusEl) return;
    const text = {
      pending: "Unsaved changes…",
      saving: "Saving…",
      saved: "All changes saved",
      error: "⚠ Save failed - will retry",
    }[status] || "";
    saveStatusEl.textContent = text;
    saveStatusEl.dataset.status = status;
  }

  async function setCurrent(id) {
    currentCardId = id;
    await render();
  }

  function createNew() {
    const card = createEmptyCard();
    cards.push(card);
    currentCardId = card.id;
    flushCardDraftSave(card); // not awaited - one-shot, don't stall the UI
    render();
  }

  async function handleDelete(id) {
    const idx = cards.findIndex((c) => c.id === id);
    if (idx === -1) return;

    const [removed] = cards.splice(idx, 1); // optimistic
    const wasCurrent = currentCardId === id;
    if (wasCurrent) currentCardId = cards.length ? cards[0].id : null;

    try {
      await deleteCardDraft(id);
    } catch (e) {
      // Roll back - local/server state must not silently drift.
      cards.splice(idx, 0, removed);
      if (wasCurrent) currentCardId = id;
      dialog.alert(`Couldn't delete "${removed.title || "(untitled card)"}" - ${e.message}`);
      await render();
      return;
    }

    await render();
  }

  // Called on every settle point (title blur, reel picked, JSON blur) -
  // persists the draft and refreshes the sidebar row (title/reel subtitle).
  function updateCurrentCard() {
    const current = cards.find((c) => c.id === currentCardId);
    if (current) scheduleCardDraftSave(current);
    renderCardsSidebar(cards, currentCardId, setCurrent, createNew, handleDelete);
  }

  function renderEditor(card) {
    if (!cardEditorPane) return;

    if (!card) {
      cardEditorPane.innerHTML = `<p class="builder-empty-state">No cards yet. Click "+ New Card" to create one.</p>`;
      return;
    }

    cardEditorPane.innerHTML = `
      <label>
        Title:
        <input type="text" id="cardTitleInput" class="filename-display" />
      </label>
      <div style="margin-top: 1rem;">
        <button type="button" id="cardReelPickerBtn" class="page-block-add-btn"></button>
      </div>
      <label style="display: block; margin-top: 1rem;">
        Card data (JSON) - description, stats, links, logos, cardOverrides,
        etc. (see docs/project-cards/PLAN.md §3 for the field list)
        <textarea id="cardRawJsonInput" rows="14"
          style="width: 100%; box-sizing: border-box; font-family: monospace; margin-top: 0.4rem;"></textarea>
      </label>
      <p id="cardJsonError" class="field-error" style="display: none;"></p>
      <button type="button" id="cardPublishBtn" style="margin-top: 1rem;">Publish Card</button>
      <p id="cardPublishResult" style="margin-top: 0.75rem;"></p>
    `;

    const titleInput = document.getElementById("cardTitleInput");
    titleInput.value = card.title || "";
    titleInput.oninput = (e) => {
      card.title = e.target.value;
      updateCurrentCard();
    };

    const reelBtn = document.getElementById("cardReelPickerBtn");
    reelBtn.textContent = card.reelId ? `Reel: ${card.reelId} (change…)` : "Choose a reel…";
    reelBtn.onclick = () => {
      openReelPicker({
        onSelect: (reelId) => {
          card.reelId = reelId;
          reelBtn.textContent = `Reel: ${reelId} (change…)`;
          updateCurrentCard();
        },
      });
    };

    const jsonInput = document.getElementById("cardRawJsonInput");
    const jsonError = document.getElementById("cardJsonError");
    jsonInput.value = card.rawJson || "{}";
    jsonInput.oninput = (e) => {
      const value = e.target.value;
      try {
        JSON.parse(value || "{}");
        jsonError.style.display = "none";
      } catch {
        // Still stored - a mid-edit draft is allowed to be momentarily
        // invalid JSON, same tolerance as any other free-text field. Only
        // publishCard() (and the Worker's own POST) actually rejects it.
        jsonError.textContent = "Not valid JSON yet - fix before publishing.";
        jsonError.style.display = "block";
      }
      card.rawJson = value;
      updateCurrentCard();
    };

    document.getElementById("cardPublishBtn").onclick = async () => {
      const resultEl = document.getElementById("cardPublishResult");
      resultEl.textContent = "Publishing…";
      try {
        const { cardId } = await publishCard(card);
        card.publishedEmbedId = cardId;
        card.publishedAt = Date.now();
        flushCardDraftSave(card);
        // player.html has no mode:"card" branch yet (PLAN.md §5, a later
        // spine step) - this GET is the reel-inlining round-trip itself,
        // not a working embed preview.
        const verifyUrl = `${WORKER_BASE_URL}/cards/${cardId}`;
        resultEl.innerHTML = `Published as <code>${cardId}</code>. Verify it inlined the reel: <a href="${verifyUrl}" target="_blank" rel="noopener">${verifyUrl}</a>`;
        showToast("Card published!");
      } catch (e) {
        resultEl.textContent = "";
        dialog.alert(e.message);
      }
    };
  }

  async function render() {
    renderCardsSidebar(cards, currentCardId, setCurrent, createNew, handleDelete);

    if (!cards.length) {
      renderEditor(null);
      return;
    }

    const idx = cards.findIndex((c) => c.id === currentCardId);
    let current = cards[idx];
    if (!current) return;

    if (current._stub) {
      try {
        const full = await loadCardDraft(current.id);
        if (full) {
          cards[idx] = full;
          current = full;
        } else {
          // 404 - deleted server-side elsewhere; drop it, pick another.
          cards.splice(idx, 1);
          currentCardId = cards[0]?.id ?? null;
          return render();
        }
      } catch (e) {
        dialog.alert(`Couldn't load this card (offline or server error): ${e.message}`);
        return;
      }
    }

    renderEditor(current);
  }

  async function init() {
    let listEntries;
    try {
      listEntries = await listCardDrafts();
    } catch (e) {
      console.error("Failed to list card drafts:", e);
      listEntries = [];
    }
    cards = listEntries.map((e) => ({ ...e, _stub: true }));

    if (cards.length) currentCardId = cards[0].id;

    onCardSaveStatusChange((id, status) => {
      if (id === currentCardId) updateSaveStatusIndicator(status);
    });

    loaded = true;
    await render();
  }

  // Lazy: matches Pages/Media Library - no /drafts/cards fetch until the
  // tab is actually opened.
  async function activate() {
    if (!loaded) {
      await init();
    } else {
      await render();
    }
  }

  return { activate };
}
