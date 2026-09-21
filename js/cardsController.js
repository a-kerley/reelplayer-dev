// cardsController.js - Owns all Project Cards-tab orchestration (list/
// select/create/delete/save/render), the Project Cards counterpart of
// js/pagesController.js. Real repeater-based form per docs/project-cards/
// PLAN.md §7.6 (the v1 raw-JSON-textarea stub is retired - see git history
// for it).
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
import {
  createFieldset,
  createToggleSwitch,
  createUrlInputRow,
  createFilePickerButton,
  createClearButton,
} from "./modules/domUtils.js";
import {
  destroyPickrInstances,
  createGenericColorPickers,
  eyedropButtonHTML,
} from "./modules/colorPicker.js";
import { openFilePicker } from "./modules/filePicker.js";
import { buildValueControl, wireValueControl } from "./modules/valueControl.js";
import { renderCardChrome, mergeCardOverrides } from "./modules/cardChrome.js";
import { playerApp } from "./player.js";
import { PreviewManager } from "./modules/previewManager.js";

// The fixed set of icon files shipped in assets/card-icons/ (link icons on
// the Info tab) - a static, code-coupled asset set (see CLAUDE.md's "Asset
// migration" note in docs/project-cards/PLAN.md §8), not user media, so no
// Media Library round-trip is needed to list them.
const LINK_ICONS = [
  "apple-music.svg",
  "browser-safari.svg",
  "play-circle-icon.svg",
  "play-circle-icon-filled.svg",
  "playstation.svg",
  "spotify.svg",
  "tidal.svg",
];

// cardOverrides whitelist (docs/project-cards/PLAN.md §3) that get their own
// Pickr color swatch, matching js/builder.js's Colours & Effects section.
const OVERRIDE_COLOR_FIELDS = [
  { key: "accent", label: "Accent Colour", default: "#4a90e2" },
  { key: "waveformUnplayed", label: "Waveform Unplayed Colour", default: "#4a4a4a" },
  { key: "waveformHover", label: "Waveform Hover Colour", default: "#ffffff" },
  { key: "playerBackground", label: "Player Background Colour", default: "#1a1a1a" },
  { key: "outlineColor", label: "Outline Colour", default: "#ffffff" },
];

// cardOverrides.OVERRIDE_COLOR_FIELDS above maps onto the reel's own
// settings fields (see cardChrome.js's OVERRIDE_SETTINGS_FIELD). These are
// the OTHER half of the PLAN.md §3 whitelist - card-chrome CSS custom
// properties, applied verbatim (cardChrome.js's renderCardChrome() just
// does `card.style.setProperty(key, value)` for every cardOverrides key
// that starts with "--") - so the stored key IS the literal CSS var name,
// unlike the reel-facing fields above. Ported from the original
// boxed-ape-source/projects-data.js's per-card `themeColors`; defaults here
// match css/card.css's own var(--x, <default>) fallbacks.
// --card-gradient-top/-bottom aren't here - both are now wired up in
// css/card.css (the banner's collapsed/expanded gradient crossfade), but
// they're full linear-gradient(...) strings, not flat colors, so they get
// plain text inputs below instead of a Pickr swatch (see
// CARD_CHROME_TEXT_FIELDS).
const CARD_CHROME_COLOR_FIELDS = [
  { key: "--card-text-primary", label: "Text Colour (Primary)", default: "#ffffff" },
  { key: "--card-text-secondary", label: "Text Colour (Secondary)", default: "#cccccc" },
  { key: "--card-tab-toggle-bg", label: "Tab Toggle Background", default: "rgba(0, 0, 0, 0.3)" },
  { key: "--card-tab-active-bg", label: "Active Tab Background", default: "rgba(255, 255, 255, 0.15)" },
];

// Raw CSS strings (gradients, filters) - plain text inputs, no Pickr.
const CARD_CHROME_TEXT_FIELDS = [
  { key: "--card-gradient-top", label: "Banner Gradient (Collapsed)", placeholder: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 70%)" },
  { key: "--card-gradient-bottom", label: "Banner Gradient (Expanded)", placeholder: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.05) 100%)" },
  { key: "--card-icon-filter", label: "Icon Filter (CSS filter())", placeholder: "brightness(0) invert(1)" },
];

function createEmptyCard() {
  return {
    id: "card-" + Date.now(),
    title: "",
    order: 0,
    reelId: null,
    logo: "",
    logoAlt: "",
    listenImage: "",
    partnerLogos: [],
    composers: "",
    description: [],
    stats: [],
    links: [],
    cardOverrides: {},
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

  // --- Live preview (mirrors js/main.js's Reels-tab preview: debounced
  // auto-refresh on every field commit + a manual "Refresh Preview" button
  // as backstop/explicit trigger) - reuses the exact renderCardChrome()/
  // mergeCardOverrides() player.html itself uses for a real card embed and
  // the exact PreviewManager.applyPreviewStyles() the Reels tab already
  // uses, never a hand-written third copy of either.
  const cardPreviewStyles = new PreviewManager();
  let cardPreviewCleanup = null;
  let cardPreviewRefreshTimer = null;
  const reelCache = {}; // reelId -> full reel JSON (or null if unpublished/fetch failed)

  async function fetchReelForPreview(reelId) {
    if (!reelId) return null;
    if (reelCache[reelId] !== undefined) return reelCache[reelId];
    try {
      const res = await fetch(`${WORKER_BASE_URL}/reels/${reelId}`);
      reelCache[reelId] = res.ok ? await res.json() : null;
    } catch {
      reelCache[reelId] = null;
    }
    return reelCache[reelId];
  }

  async function showCardPreview(card) {
    const previewPane = document.getElementById("cardPreviewPane");
    if (!previewPane || !card) return;

    const reel = await fetchReelForPreview(card.reelId);
    // A field may have changed (or the card may have been swapped/removed)
    // while the fetch above was in flight - bail rather than render a
    // preview for a card that's no longer current.
    if (card.id !== currentCardId) return;

    cardPreviewCleanup?.();
    const { destroy } = renderCardChrome(previewPane, { ...card, reel }, {
      onActivateListen: () => {
        if (!reel || !reel.playlist || !reel.playlist.length) return;
        const merged = mergeCardOverrides({ ...reel, mode: "static" }, card.cardOverrides);
        const flatReel = { ...merged, ...(merged.settings || {}) };
        if (playerApp.wavesurfer) {
          playerApp.wavesurfer.pause();
          playerApp.wavesurfer.seekTo(0);
        }
        cardPreviewStyles.applyPreviewStyles(flatReel);
        // PLAN.md §3 "Ignored in a card": playerHeight is a standalone-
        // embed setting that applyPreviewStyles()/generateStyleConfig()
        // always sets regardless of context - matches the same fix in
        // player.html's real card render path (search --player-height
        // there for the full comment).
        document.documentElement.style.removeProperty("--player-height");
        playerApp.renderPlayer({
          showTitle: flatReel.showTitle,
          title: flatReel.title,
          playlist: merged.playlist,
          reel: flatReel,
          containerId: "cardListenPlayer",
        });
      },
    });
    cardPreviewCleanup = destroy;
  }

  function scheduleCardPreviewRefresh(card) {
    clearTimeout(cardPreviewRefreshTimer);
    cardPreviewRefreshTimer = setTimeout(() => showCardPreview(card), 400);
  }

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

  // Same stub-hydration requirement as render()'s own loadCardDraft() call
  // above - saving a still-stub card would overwrite its real draft body
  // with the stub's few fields.
  async function moveCardToFolder(id, folder) {
    const idx = cards.findIndex((c) => c.id === id);
    if (idx === -1) return;
    let card = cards[idx];

    if (card._stub) {
      try {
        const full = await loadCardDraft(id);
        if (!full) {
          cards.splice(idx, 1);
          await render();
          return;
        }
        cards[idx] = full;
        card = full;
      } catch (e) {
        dialog.alert(`Couldn't load this card (offline or server error): ${e.message}`);
        return;
      }
    }

    card.folder = folder;
    scheduleCardDraftSave(card);
    await render();
  }

  // Bulk version of moveCardToFolder()'s own stub-hydration requirement -
  // every card tagged with oldName needs its real body loaded before its
  // folder field can be safely rewritten and saved.
  async function renameCardFolder(oldName, newName) {
    for (let idx = 0; idx < cards.length; idx++) {
      if (cards[idx].folder !== oldName) continue;
      let card = cards[idx];
      if (card._stub) {
        try {
          const full = await loadCardDraft(card.id);
          if (!full) continue; // deleted server-side elsewhere; skip
          cards[idx] = full;
          card = full;
        } catch (e) {
          dialog.alert(`Couldn't load "${card.title || '(untitled card)'}" while renaming its folder: ${e.message}`);
          return;
        }
      }
      card.folder = newName;
      scheduleCardDraftSave(card);
    }
    await render();
  }

  // Called on every settle point (field blur/change) - persists the draft,
  // refreshes the sidebar row (title/reel subtitle), and debounces a
  // preview refresh (rapid field commits, e.g. tabbing through several
  // fields, shouldn't rebuild the preview on every single one).
  function updateCurrentCard() {
    const current = cards.find((c) => c.id === currentCardId);
    if (current) {
      scheduleCardDraftSave(current);
      scheduleCardPreviewRefresh(current);
    }
    renderCardsSidebar(cards, currentCardId, setCurrent, createNew, handleDelete, moveCardToFolder, renameCardFolder);
  }

  // --- Repeater sections (partnerLogos / stats / links) -------------------
  // Modeled on js/modules/tracksEditor.js's add/remove-row pattern (flex
  // row + phantom "add" row) - drag-reorder is skipped here since row order
  // isn't load-bearing for these lists the way playlist order is.
  //
  // createFieldset() takes an HTML string for `content`, so rows are built
  // as markup (via .outerHTML for the one reused domUtils button) + a
  // post-mount wiring pass, not appended DOM nodes directly.

  function partnerLogoRowHTML(logo, i) {
    const pickerBtn = createFilePickerButton({ ariaLabel: "Browse logo image", title: "Browse logo image" });
    pickerBtn.classList.add("partner-logo-picker");
    return `
      <div class="color-row" data-index="${i}">
        <input type="text" class="partner-logo-src" placeholder="Logo URL" value="${(logo.src || "").replace(/"/g, "&quot;")}" style="flex:2;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        ${pickerBtn.outerHTML}
        <input type="text" class="partner-logo-alt" placeholder="Alt text" value="${(logo.alt || "").replace(/"/g, "&quot;")}" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        <button type="button" class="track-remove-btn partner-logo-remove" aria-label="Remove partner logo">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
      </div>`;
  }

  function statRowHTML(stat, i) {
    return `
      <div class="color-row" data-index="${i}">
        <input type="text" class="stat-label" placeholder="Label (optional)" value="${(stat.label || "").replace(/"/g, "&quot;")}" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        <input type="text" class="stat-value" placeholder="Value" value="${(stat.value || "").replace(/"/g, "&quot;")}" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        <button type="button" class="track-remove-btn stat-remove" aria-label="Remove tag">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
      </div>`;
  }

  function linkRowHTML(link, i) {
    const options = LINK_ICONS.map((f) => `<option value="${f}" ${link.icon === f ? "selected" : ""}>${f.replace(/\.svg$/, "")}</option>`).join("");
    return `
      <div class="color-row" data-index="${i}">
        <input type="url" class="link-url" placeholder="https://…" value="${(link.url || "").replace(/"/g, "&quot;")}" style="flex:2;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        <select class="link-icon" style="padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;">
          <option value="">(no icon)</option>
          ${options}
        </select>
        <input type="text" class="link-alt" placeholder="Alt text" value="${(link.alt || "").replace(/"/g, "&quot;")}" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        <button type="button" class="track-remove-btn link-remove" aria-label="Remove link">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
      </div>`;
  }

  function buildRepeaterHTML(legend, id, rowsHTML, addLabel) {
    return createFieldset({
      id,
      legend,
      content: `
        <div class="${id}-rows">${rowsHTML.join("")}</div>
        <div class="phantom-track-row" style="display:flex;justify-content:flex-end;margin-top:0.25rem;">
          <button type="button" class="track-remove-btn add-btn ${id}-add" aria-label="${addLabel}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        </div>`,
    }).outerHTML;
  }

  function renderEditor(card) {
    if (!cardEditorPane) return;

    if (!card) {
      cardEditorPane.innerHTML = `<p class="builder-empty-state">No cards yet. Click "+ New Card" to create one.</p>`;
      cardPreviewCleanup?.();
      cardPreviewCleanup = null;
      const previewPane = document.getElementById("cardPreviewPane");
      if (previewPane) previewPane.innerHTML = "";
      return;
    }

    const overrides = card.cardOverrides || (card.cardOverrides = {});

    const outlineWidthControl = buildValueControl({
      id: "cardOutlineWidth",
      label: "Outline Width Override (px):",
      value: overrides.outlineWidth ?? 0,
      min: 0,
      max: 20,
      step: 1,
      unit: "px",
    }).row.outerHTML;

    const overridesHTML = `
      ${OVERRIDE_COLOR_FIELDS.map((f) => `
        <div class="color-row">
          <span>${f.label}:</span>
          <button id="card-pickr-${f.key}" class="pickr-button" type="button"></button>
          ${eyedropButtonHTML(`card-pickr-${f.key}`)}
        </div>`).join("")}
      ${outlineWidthControl}
      <div class="color-row">
        <label for="cardShowReelTitle">Show Reel Title:</label>
        <span id="cardShowReelTitleSlot"></span>
      </div>
      <div id="cardBannerImageRowSlot"></div>
      <div id="cardBannerVideoRowSlot"></div>
      <div id="cardListenImageRowSlot"></div>
      <h4 style="margin:1rem 0 0.5rem 0;font-size:1rem;font-weight:600;color:var(--builder-accent);">Card Chrome Colours</h4>
      ${CARD_CHROME_COLOR_FIELDS.map((f) => `
        <div class="color-row">
          <span>${f.label}:</span>
          <button id="card-pickr-chrome-${f.key.replace(/^--/, "")}" class="pickr-button" type="button"></button>
          ${eyedropButtonHTML(`card-pickr-chrome-${f.key.replace(/^--/, "")}`)}
        </div>`).join("")}
      ${CARD_CHROME_TEXT_FIELDS.map((f) => `
        <div class="color-row">
          <span>${f.label}:</span>
          <input type="text" class="card-chrome-text-input" data-key="${f.key}" placeholder="${f.placeholder}" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;" />
        </div>`).join("")}
    `;

    cardEditorPane.innerHTML = `
      <label>
        Title:
        <input type="text" id="cardTitleInput" class="filename-display" />
      </label>
      <label style="display: block; margin-top: 1rem;">
        Order (sidebar sort only, not layout):
        <input type="number" id="cardOrderInput" style="width:6rem;box-sizing:border-box;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;margin-top:0.4rem;" />
      </label>
      <div id="cardLogoRowSlot" style="margin-top: 1rem;"></div>
      <label style="display: block; margin-top: 1rem;">
        Logo Alt Text:
        <input type="text" id="cardLogoAltInput" style="width:100%;box-sizing:border-box;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;margin-top:0.4rem;" />
      </label>
      <label style="display: block; margin-top: 1rem;">
        Composers ("Music by …"):
        <input type="text" id="cardComposersInput" style="width:100%;box-sizing:border-box;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;margin-top:0.4rem;" />
      </label>
      <label style="display: block; margin-top: 1rem;">
        Description (blank line between paragraphs):
        <textarea id="cardDescriptionInput" rows="6" style="width:100%;box-sizing:border-box;padding:0.5rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;margin-top:0.4rem;"></textarea>
      </label>

      ${buildRepeaterHTML("Tags", "cardStats", (card.stats || []).map(statRowHTML), "Add tag")}
      ${buildRepeaterHTML("Links", "cardLinks", (card.links || []).map(linkRowHTML), "Add link")}
      ${buildRepeaterHTML("Partner Logos", "cardPartnerLogos", (card.partnerLogos || []).map(partnerLogoRowHTML), "Add partner logo")}

      <div id="cardReelFieldSlot" style="margin-top: 1rem;"></div>

      <div class="color-row" style="margin-top: 1rem;">
        <label for="cardAnalyticsEnabled">Analytics Enabled:</label>
        <span id="cardAnalyticsSlot"></span>
      </div>

      ${createFieldset({ id: "cardOverridesFieldset", legend: "Card Style Overrides", content: overridesHTML }).outerHTML}

      <button type="button" id="cardPublishBtn" style="margin-top: 1rem;">Publish Card</button>
      <p id="cardPublishResult" style="margin-top: 0.75rem;"></p>
    `;

    // --- Title / reel picker -------------------------------------------
    const titleInput = document.getElementById("cardTitleInput");
    titleInput.value = card.title || "";
    titleInput.oninput = (e) => {
      card.title = e.target.value;
      updateCurrentCard();
    };

    const orderInput = document.getElementById("cardOrderInput");
    orderInput.value = card.order ?? 0;
    orderInput.onblur = (e) => {
      card.order = parseInt(e.target.value, 10) || 0;
      updateCurrentCard();
    };

    // --- Reel field - laid out identically to every other asset-picker row
    // (Logo Image, Banner Image/Video, ...) via the shared createUrlInputRow()
    // - a single-line field showing the picked reel's title as plain text,
    // plus the same folder-icon browse button, wired to openReelPicker()
    // instead of the media openFilePicker() via createUrlInputRow()'s
    // onPickerClick escape hatch. Read-only (a reel is picked, never typed),
    // and the field itself is also clickable to reopen the picker, matching
    // how a read-only "display" field behaves elsewhere in this builder.
    // A clear (x) button is the one addition beyond the shared row shape -
    // needed here (unlike Logo Image) since you can't just delete text to
    // get back to "no reel" on a read-only field, and PLAN.md's schema
    // explicitly allows an Info-only card with no reelId at all.
    const reelFieldSlot = document.getElementById("cardReelFieldSlot");

    function openPicker() {
      openReelPicker({
        onSelect: (reelId, reelTitle) => {
          card.reelId = reelId;
          renderReelField(reelTitle);
          updateCurrentCard();
        },
      });
    }

    function renderReelField(title) {
      reelFieldSlot.innerHTML = "";

      const { row, input } = createUrlInputRow({
        id: "cardReelInput",
        label: "Reel:",
        value: card.reelId ? (title || card.reelId) : "",
        placeholder: "Choose a reel…",
        onPickerClick: openPicker,
      });
      input.readOnly = true;
      input.style.cursor = "pointer";
      input.onclick = openPicker;

      if (card.reelId) {
        const clearBtn = createClearButton({
          onClick: () => {
            card.reelId = null;
            renderReelField(null);
            updateCurrentCard();
          },
        });
        row.appendChild(clearBtn);
      }

      reelFieldSlot.appendChild(row);
    }

    renderReelField(card.reelId);
    if (card.reelId) {
      // The picker's own onSelect already supplies a title (no fetch
      // needed there) - this covers the OTHER path, opening a card whose
      // reelId was set in a previous session, where only the id is known
      // until this resolves. fetchReelForPreview() is the same cached
      // fetch/cache the preview pane already uses, so this doesn't cost a
      // second network round-trip once that's warm.
      fetchReelForPreview(card.reelId).then((reel) => {
        if (card.reelId && reel?.title) renderReelField(reel.title);
      });
    }

    // --- Logo (media picker row) ----------------------------------------
    const logoRowSlot = document.getElementById("cardLogoRowSlot");
    const { row: logoRow } = createUrlInputRow({
      id: "cardLogoInput",
      label: "Logo Image:",
      value: card.logo || "",
      placeholder: "https://example.com/logo.png",
      pickerOptions: { directory: "assets/images/backgrounds", extensions: [".jpg", ".jpeg", ".png", ".svg", ".webp"], title: "Select Logo Image" },
      onInput: (e) => { card.logo = e.target.value; },
    });
    logoRow.querySelector("input").onblur = () => updateCurrentCard();
    logoRowSlot.replaceWith(logoRow);
    logoRow.id = "cardLogoRowSlot";

    document.getElementById("cardLogoAltInput").value = card.logoAlt || "";
    document.getElementById("cardLogoAltInput").onblur = (e) => { card.logoAlt = e.target.value; updateCurrentCard(); };

    document.getElementById("cardComposersInput").value = card.composers || "";
    document.getElementById("cardComposersInput").onblur = (e) => { card.composers = e.target.value; updateCurrentCard(); };

    const descriptionInput = document.getElementById("cardDescriptionInput");
    descriptionInput.value = (card.description || []).join("\n\n");
    descriptionInput.onblur = (e) => {
      card.description = e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      updateCurrentCard();
    };

    // --- Repeaters --------------------------------------------------------
    wireRepeaterSection({
      containerSelector: ".cardStats-rows",
      addBtnSelector: ".cardStats-add",
      items: card.stats,
      newItem: () => ({ label: "", value: "" }),
      rowHTML: statRowHTML,
      wireRow: (row, item) => {
        row.querySelector(".stat-label").onblur = (e) => { item.label = e.target.value; updateCurrentCard(); };
        row.querySelector(".stat-value").onblur = (e) => { item.value = e.target.value; updateCurrentCard(); };
        row.querySelector(".stat-remove").onclick = () => removeItem(card.stats, item);
      },
    });

    wireRepeaterSection({
      containerSelector: ".cardLinks-rows",
      addBtnSelector: ".cardLinks-add",
      items: card.links,
      newItem: () => ({ url: "", icon: "", alt: "" }),
      rowHTML: linkRowHTML,
      wireRow: (row, item) => {
        row.querySelector(".link-url").onblur = (e) => { item.url = e.target.value; updateCurrentCard(); };
        row.querySelector(".link-icon").onchange = (e) => { item.icon = e.target.value; updateCurrentCard(); };
        row.querySelector(".link-alt").onblur = (e) => { item.alt = e.target.value; updateCurrentCard(); };
        row.querySelector(".link-remove").onclick = () => removeItem(card.links, item);
      },
    });

    wireRepeaterSection({
      containerSelector: ".cardPartnerLogos-rows",
      addBtnSelector: ".cardPartnerLogos-add",
      items: card.partnerLogos,
      newItem: () => ({ src: "", alt: "" }),
      rowHTML: partnerLogoRowHTML,
      wireRow: (row, item) => {
        row.querySelector(".partner-logo-src").onblur = (e) => { item.src = e.target.value; updateCurrentCard(); };
        row.querySelector(".partner-logo-alt").onblur = (e) => { item.alt = e.target.value; updateCurrentCard(); };
        row.querySelector(".partner-logo-picker").onclick = () => {
          openFilePicker({
            directory: "assets/images/backgrounds",
            extensions: [".jpg", ".jpeg", ".png", ".svg", ".webp"],
            title: "Select Partner Logo",
            onSelect: (filePath) => {
              item.src = filePath;
              row.querySelector(".partner-logo-src").value = filePath;
              updateCurrentCard();
            },
          });
        };
        row.querySelector(".partner-logo-remove").onclick = () => removeItem(card.partnerLogos, item);
      },
    });

    function removeItem(list, item) {
      const idx = list.indexOf(item);
      if (idx !== -1) list.splice(idx, 1);
      updateCurrentCard();
      renderEditor(card);
    }

    function wireRepeaterSection({ containerSelector, addBtnSelector, items, newItem, rowHTML, wireRow }) {
      const container = cardEditorPane.querySelector(containerSelector);
      if (!container) return;
      Array.from(container.children).forEach((row, i) => wireRow(row, items[i]));

      const addBtn = cardEditorPane.querySelector(addBtnSelector);
      if (addBtn) {
        addBtn.onclick = () => {
          items.push(newItem());
          updateCurrentCard();
          renderEditor(card);
        };
      }
    }

    // --- Analytics toggle ---------------------------------------------
    const analyticsToggle = createToggleSwitch({
      id: "cardAnalyticsEnabled",
      checked: card.analyticsEnabled === true,
      onChange: (e) => { card.analyticsEnabled = e.target.checked; updateCurrentCard(); },
    });
    document.getElementById("cardAnalyticsSlot").replaceWith(analyticsToggle);
    analyticsToggle.id = "cardAnalyticsSlot";

    // --- Card Style Overrides -------------------------------------------
    const showReelTitleToggle = createToggleSwitch({
      id: "cardShowReelTitle",
      checked: overrides.showReelTitle === true,
      onChange: (e) => { overrides.showReelTitle = e.target.checked; updateCurrentCard(); },
    });
    document.getElementById("cardShowReelTitleSlot").replaceWith(showReelTitleToggle);
    showReelTitleToggle.id = "cardShowReelTitleSlot";

    const { row: bannerImageRow } = createUrlInputRow({
      id: "cardBannerImageInput",
      label: "Banner Image Override:",
      value: overrides.bannerImage || "",
      placeholder: "Defaults to the reel's own background",
      pickerOptions: { directory: "assets/images/backgrounds", extensions: [".jpg", ".jpeg", ".png", ".webp"], title: "Select Banner Image" },
      onInput: (e) => { overrides.bannerImage = e.target.value; },
    });
    bannerImageRow.querySelector("input").onblur = () => updateCurrentCard();
    document.getElementById("cardBannerImageRowSlot").replaceWith(bannerImageRow);
    bannerImageRow.id = "cardBannerImageRowSlot";

    const { row: bannerVideoRow } = createUrlInputRow({
      id: "cardBannerVideoInput",
      label: "Banner Video Override:",
      value: overrides.bannerVideo || "",
      placeholder: "Optional hover-preview video",
      pickerOptions: { directory: "assets/video", extensions: [".mp4", ".webm", ".mov"], title: "Select Banner Video" },
      onInput: (e) => { overrides.bannerVideo = e.target.value; },
    });
    bannerVideoRow.querySelector("input").onblur = () => updateCurrentCard();
    document.getElementById("cardBannerVideoRowSlot").replaceWith(bannerVideoRow);
    bannerVideoRow.id = "cardBannerVideoRowSlot";

    // listenImage is a plain top-level card field (like logo), not a
    // cardOverrides entry - there's no reel-side equivalent for it to
    // override (see cardChrome.js's resolveBannerImage/-Video comment).
    const { row: listenImageRow } = createUrlInputRow({
      id: "cardListenImageInput",
      label: "Listen-Tab Banner Image:",
      value: card.listenImage || "",
      placeholder: "Optional - crossfades in when Listen tab opens",
      pickerOptions: { directory: "assets/images/backgrounds", extensions: [".jpg", ".jpeg", ".png", ".webp"], title: "Select Listen-Tab Banner Image" },
      onInput: (e) => { card.listenImage = e.target.value; },
    });
    listenImageRow.querySelector("input").onblur = () => updateCurrentCard();
    document.getElementById("cardListenImageRowSlot").replaceWith(listenImageRow);
    listenImageRow.id = "cardListenImageRowSlot";

    const outlineWidthEl = document.getElementById("cardOutlineWidth");
    wireValueControl(outlineWidthEl.closest(".value-control"));
    outlineWidthEl.addEventListener("change", () => {
      overrides.outlineWidth = parseInt(outlineWidthEl.value, 10) || 0;
      updateCurrentCard();
    });

    cardEditorPane.querySelectorAll(".card-chrome-text-input").forEach((input) => {
      const key = input.dataset.key;
      input.value = overrides[key] || "";
      input.onblur = (e) => {
        overrides[key] = e.target.value;
        updateCurrentCard();
      };
    });

    destroyPickrInstances();
    createGenericColorPickers(
      [
        ...OVERRIDE_COLOR_FIELDS.map((f) => ({
          id: `card-pickr-${f.key}`,
          default: overrides[f.key] || f.default,
          onCommit: (value) => { overrides[f.key] = value; },
        })),
        ...CARD_CHROME_COLOR_FIELDS.map((f) => ({
          id: `card-pickr-chrome-${f.key.replace(/^--/, "")}`,
          default: overrides[f.key] || f.default,
          onCommit: (value) => { overrides[f.key] = value; },
        })),
      ],
      updateCurrentCard
    );

    // --- Publish ----------------------------------------------------------
    document.getElementById("cardPublishBtn").onclick = async () => {
      const resultEl = document.getElementById("cardPublishResult");
      resultEl.textContent = "Publishing…";
      try {
        const { cardId } = await publishCard(card);
        card.publishedEmbedId = cardId;
        card.publishedAt = Date.now();
        flushCardDraftSave(card);
        const verifyUrl = `${WORKER_BASE_URL}/cards/${cardId}`;
        resultEl.innerHTML = `Published as <code>${cardId}</code>. Verify it inlined the reel: <a href="${verifyUrl}" target="_blank" rel="noopener">${verifyUrl}</a>`;
        showToast("Card published!");
      } catch (e) {
        resultEl.textContent = "";
        dialog.alert(e.message);
      }
    };

    const refreshPreviewBtn = document.getElementById("refreshCardPreviewBtn");
    if (refreshPreviewBtn) refreshPreviewBtn.onclick = () => showCardPreview(card);
    showCardPreview(card);
  }

  async function render() {
    renderCardsSidebar(cards, currentCardId, setCurrent, createNew, handleDelete, moveCardToFolder, renameCardFolder);

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
          // The sidebar row above was rendered from the stub (listCardDrafts()
          // only returns {id,title,createdAt,updatedAt} - no reelId), so its
          // subtitle needs a second pass now that the full card is in.
          renderCardsSidebar(cards, currentCardId, setCurrent, createNew, handleDelete, moveCardToFolder, renameCardFolder);
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
