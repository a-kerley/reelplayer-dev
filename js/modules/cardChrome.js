// cardChrome.js - Renders a Project Card's own chrome (banner + Info/Listen
// tabs) around a reel, for player.html's `type=card` embed. See
// docs/project-cards/PLAN.md §5.
//
// Markup/CSS here is modeled on (not ported verbatim from)
// docs/project-cards/boxed-ape-source/project-card.js/.css - see
// css/card.css's own header comment for why. The expand/collapse
// interaction below is new code, NOT a reuse of js/player.js's
// expandPlayer()/collapsePlayer() (those are wired into one reel's own
// wavesurfer/video-crossfade/idle-manager state, none of which exists for
// a card wrapper whose reel always renders mode:"static") - it's modeled
// on the same desktop-hover UX so a card feels like a reel expanding.
//
// This first slice is desktop-hover only, per PLAN.md's mobile-parity
// section - the scroll-band IntersectionObserver mobile behavior is a
// separate follow-up slice, not built here yet.

// cardOverrides whitelist (PLAN.md §3) that maps onto the reel's own
// settings fields, winning over whatever the reel itself has set. Two of
// the whitelist's other keys are handled elsewhere, not here:
// - bannerImage/bannerVideo: banner-only, resolveBannerImage() below
//   (bannerVideo isn't rendered at all yet - no crossfade slice yet)
// - textStyles: NOT handled by this function - needs a new top tier in
//   the previewManager.js/player.html text-style resolver pair (its own
//   separate slice, PLAN.md §5's "second drift pair" note), not a plain
//   settings-field override like the rest of this whitelist.
const OVERRIDE_SETTINGS_FIELD = {
  accent: "varUiAccent",
  waveformUnplayed: "varWaveformUnplayed",
  waveformHover: "varWaveformHover",
  outlineWidth: "playerOutlineWidth",
  outlineColor: "playerOutlineColor",
};

/**
 * Applies a card's cardOverrides onto its (already mode:"static"-forced)
 * reel, returning a new reel object - never mutates the input, since
 * cardData.reel may be read again elsewhere. Reel field names differ from
 * the cardOverrides key names (e.g. accent -> varUiAccent) because the
 * whitelist names things from the *card author's* perspective, not the
 * reel schema's.
 */
export function mergeCardOverrides(reel, cardOverrides) {
  if (!cardOverrides) return reel;

  const settings = { ...(reel.settings || {}) };
  for (const [overrideKey, settingsField] of Object.entries(OVERRIDE_SETTINGS_FIELD)) {
    if (cardOverrides[overrideKey] !== undefined) settings[settingsField] = cardOverrides[overrideKey];
  }
  // outlineWidth alone doesn't turn the outline on - playerOutlineEnabled
  // is a separate flag applyReelStyleVars() reads (mirrors the reel
  // builder's own "outlineWidth > 0 implies enabled" convention).
  if (cardOverrides.outlineWidth !== undefined) settings.playerOutlineEnabled = cardOverrides.outlineWidth > 0;

  const merged = { ...reel, settings };
  // backgroundColor/showTitle are read top-level (not under .settings) by
  // applyReelStyleVars()/renderPlayer() respectively - see js/player.js's
  // own reelData.backgroundColor-before-settings.backgroundColor fallback.
  if (cardOverrides.playerBackground !== undefined) merged.backgroundColor = cardOverrides.playerBackground;
  if (cardOverrides.showReelTitle !== undefined) merged.showTitle = cardOverrides.showReelTitle;

  return merged;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// PLAN.md §3 "Banner visual" fallback chain: cardOverrides.bannerImage wins,
// else the reel's own backgroundImage (if enabled), else its first track's
// backgroundImage. Video banners (cardOverrides.bannerVideo /
// reel backgroundVideo) aren't implemented in this slice - image only.
function resolveBannerImage(cardData) {
  const overrides = cardData.cardOverrides || {};
  if (overrides.bannerImage) return overrides.bannerImage;
  const settings = cardData.reel?.settings || {};
  if (settings.backgroundImageEnabled && settings.backgroundImage) return settings.backgroundImage;
  return cardData.reel?.playlist?.[0]?.backgroundImage || "";
}

function renderStats(stats) {
  if (!Array.isArray(stats) || !stats.length) return "";
  return stats.map((stat) => {
    if (stat.label) return `<div><strong>${escapeHtml(stat.label)}</strong>${escapeHtml(stat.value)}</div>`;
    return `<div>${escapeHtml(stat.value)}</div>`;
  }).join("");
}

function renderLinks(links) {
  if (!Array.isArray(links) || !links.length) return "";
  const items = links.map((link) => `
    <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="extra-link" aria-label="${escapeHtml(link.alt || "External link")}">
      <img src="/assets/card-icons/${escapeHtml(link.icon)}" alt="${escapeHtml(link.alt || "")}" class="link-icon-svg" />
    </a>
  `).join("");
  return `<div class="extra-links">${items}</div>`;
}

function renderPartnerLogos(partnerLogos) {
  if (!Array.isArray(partnerLogos) || !partnerLogos.length) return "";
  return partnerLogos.map((logo) => `<img src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.alt || "")}" />`).join("");
}

function renderDescription(description) {
  if (!Array.isArray(description) || !description.length) return "";
  return description.map((para) => `<p>${escapeHtml(para)}</p>`).join("");
}

/**
 * @param {HTMLElement} container - mount point (player.html's #embedPlayer)
 * @param {Object} cardData - GET /cards/:id response ({...cardFields, reel})
 * @param {Object} opts
 * @param {() => void} opts.onActivateListen - called the first time the
 *   Listen tab is opened, so the caller can lazily call renderPlayer() only
 *   once a visitor actually wants to hear it (PLAN.md §8 "per-card cost").
 * @returns {{ listenContainerId: string }} - the id to pass as
 *   renderPlayer()'s containerId once onActivateListen fires.
 */
export function renderCardChrome(container, cardData, { onActivateListen }) {
  const hasReel = !!(cardData.reel && cardData.reel.playlist && cardData.reel.playlist.length);
  const bannerImage = resolveBannerImage(cardData);
  const listenContainerId = "cardListenPlayer";

  container.innerHTML = `
    <div class="project-card">
      <div class="project-card-banner" style="${bannerImage ? `background-image:url('${escapeHtml(bannerImage)}')` : ""}">
        ${bannerImage ? `<img class="project-card-banner-img" src="${escapeHtml(bannerImage)}" alt="" />` : ""}
        ${cardData.logo ? `<img class="project-card-logo" src="${escapeHtml(cardData.logo)}" alt="${escapeHtml(cardData.logoAlt || cardData.title || "")}" />` : ""}
        <div class="project-card-hover-text">
          <div class="hover-logos">${renderPartnerLogos(cardData.partnerLogos)}</div>
          ${cardData.composers ? `<span class="project-card-composers">Music by ${escapeHtml(cardData.composers)}</span>` : ""}
        </div>
        <div class="project-card-banner-buttons">
          <button type="button" class="card-banner-btn" data-tab="info">Info</button>
          ${hasReel ? `<button type="button" class="card-banner-btn" data-tab="listen">Listen</button>` : ""}
        </div>
      </div>
      <div class="project-card-extra">
        <div class="tab-toggle">
          <button type="button" class="tab-btn active" data-tab="info">
            <img class="tab-icon-outline" src="/assets/card-icons/tab-info-icon.svg" alt="Info" />
            <img class="tab-icon-filled" src="/assets/card-icons/tab-info-icon-filled.svg" alt="Info" />
          </button>
          ${hasReel ? `
          <button type="button" class="tab-btn" data-tab="listen">
            <img class="tab-icon-outline" src="/assets/card-icons/tab-listen-icon.svg" alt="Listen" />
            <img class="tab-icon-filled" src="/assets/card-icons/tab-listen-icon-filled.svg" alt="Listen" />
          </button>
          ` : ""}
        </div>
        <div class="tab-content active" data-tab-content="info">
          ${cardData.title ? `<h3>${escapeHtml(cardData.title)}</h3>` : ""}
          ${renderDescription(cardData.description)}
          <div class="extra-stats">${renderStats(cardData.stats)}</div>
          ${renderLinks(cardData.links)}
        </div>
        ${hasReel ? `
        <div class="tab-content" data-tab-content="listen">
          <div id="${listenContainerId}" class="card-listen-player"></div>
        </div>
        ` : ""}
      </div>
    </div>
  `;

  const card = container.querySelector(".project-card");
  const banner = container.querySelector(".project-card-banner");

  // Card-chrome CSS vars from cardOverrides (PLAN.md §3 whitelist) - the
  // remaining, non-CSS-var half of the whitelist (accent/waveform/
  // outline/playerBackground/showReelTitle) is applied to the reel itself
  // by mergeCardOverrides() above, not here.
  Object.entries(cardData.cardOverrides || {}).forEach(([key, value]) => {
    if (key.startsWith("--")) card.style.setProperty(key, value);
  });

  function postResize() {
    if (window.self === window.top) return;
    requestAnimationFrame(() => {
      const height = card.classList.contains("expanded") ? card.scrollHeight : banner.offsetHeight;
      window.parent.postMessage({ type: "reelplayer:resize", height }, "*");
    });
  }

  function expand() {
    if (card.classList.contains("expanded")) return;
    card.classList.add("expanded");
    postResize();
  }

  function collapse() {
    if (!card.classList.contains("expanded")) return;
    card.classList.remove("expanded");
    postResize();
  }

  // Desktop hover only for this slice - see this file's header comment.
  card.addEventListener("mouseenter", expand);
  card.addEventListener("mouseleave", collapse);

  let listenActivated = false;
  function switchTab(tabName) {
    container.querySelectorAll(".tab-btn, .card-banner-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    container.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.toggle("active", content.dataset.tabContent === tabName);
    });
    if (tabName === "listen" && !listenActivated) {
      listenActivated = true;
      onActivateListen?.();
    }
    postResize();
  }

  container.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      expand();
      switchTab(btn.dataset.tab);
    });
  });

  postResize(); // initial (collapsed) height

  return { listenContainerId };
}
