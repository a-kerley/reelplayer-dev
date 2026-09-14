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
// Desktop gets hover-driven expand/collapse + banner video preview; touch
// devices get the IntersectionObserver scroll-band behavior instead (no
// hover to trigger a video preview from, so touch visitors only ever see
// the static banner image) - see isTouchDevice() branch below.

// cardOverrides whitelist (PLAN.md §3) that maps onto the reel's own
// settings fields, winning over whatever the reel itself has set. Two of
// the whitelist's other keys are handled elsewhere, not here:
// - bannerImage/bannerVideo: banner-only, resolveBannerImage()/
//   resolveBannerVideo() below
// - textStyles: not a plain settings-field override like the rest of this
//   whitelist - player.html wires it directly into the existing
//   pageRoleStyles slot in its resolveTextUnit()/applyReelStyleVars()
//   pair (PLAN.md §5's "second drift pair"), not through this function.
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

// Same detection method as js/player.js's isTouchDevice(), kept
// independent (not imported) since that one's a playerApp method, not a
// standalone export.
function isTouchDevice() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

// Banner video hover-preview (desktop only - see the isTouchDevice()
// branch below). Calls play() immediately on hover (harmless while the
// video stays at opacity:0 - a rejected autoplay promise, e.g. a strict
// browser policy, just means it never reaches readiness and the static
// image stays showing, which is a safe fallback either way), but only
// reveals it once genuinely ready to play smoothly
// (HAVE_ENOUGH_DATA/canplaythrough) - never fades in a video that's about
// to stutter on a still-buffering preload="metadata" source. Matches this
// project's own "gate the start of visible playback on real readiness,
// don't force it on partial data" convention (js/modules/videoPlayback.js).
// videoEl._pendingRevealListener stashes the in-flight listener directly
// on the element (rather than a closure-captured variable, a Map, or a
// WeakMap) since these two functions are the only code that ever touches
// it and there's exactly one video per card - the simplest place that's
// still reachable from both functions without threading extra state
// through renderCardChrome()'s own closure.
function previewBannerVideo(videoEl, banner) {
  if (!videoEl) return;
  videoEl.play().catch(() => {}); // autoplay rejection -> stays on the static image, not an error
  if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    banner.classList.add("video-ready");
    return;
  }
  const onReady = () => banner.classList.add("video-ready");
  videoEl._pendingRevealListener = onReady;
  videoEl.addEventListener("canplaythrough", onReady, { once: true });
}

function stopBannerVideoPreview(videoEl, banner) {
  if (!videoEl) return;
  videoEl.pause();
  banner.classList.remove("video-ready");
  if (videoEl._pendingRevealListener) {
    videoEl.removeEventListener("canplaythrough", videoEl._pendingRevealListener);
    videoEl._pendingRevealListener = null;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// PLAN.md §3 "Banner visual" fallback chain: cardOverrides.bannerImage wins,
// else the reel's own backgroundImage (if enabled), else its first track's
// backgroundImage. The static image is always rendered when resolved (even
// if a video is also present) - it's the video's poster/fallback for
// browsers that never reveal the video (mobile has no hover trigger for
// it - see the video-preview setup below) and the base layer under it
// while the video is still loading on desktop.
function resolveBannerImage(cardData) {
  const overrides = cardData.cardOverrides || {};
  if (overrides.bannerImage) return overrides.bannerImage;
  const settings = cardData.reel?.settings || {};
  if (settings.backgroundImageEnabled && settings.backgroundImage) return settings.backgroundImage;
  return cardData.reel?.playlist?.[0]?.backgroundImage || "";
}

// Same fallback shape as resolveBannerImage() above, for the reel's own
// backgroundVideo instead. Returns "" (no video) when neither the card nor
// its reel has one - the banner then stays a plain static image.
function resolveBannerVideo(cardData) {
  const overrides = cardData.cardOverrides || {};
  if (overrides.bannerVideo) return overrides.bannerVideo;
  const settings = cardData.reel?.settings || {};
  if (settings.backgroundVideoEnabled && settings.backgroundVideo) return settings.backgroundVideo;
  return "";
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
  const bannerVideo = resolveBannerVideo(cardData);
  const listenContainerId = "cardListenPlayer";

  container.innerHTML = `
    <div class="project-card">
      <div class="project-card-banner" style="${bannerImage ? `background-image:url('${escapeHtml(bannerImage)}')` : ""}">
        ${bannerImage ? `<img class="project-card-banner-img" src="${escapeHtml(bannerImage)}" alt="" />` : ""}
        ${bannerVideo ? `<video class="project-card-banner-video" src="${escapeHtml(bannerVideo)}" muted loop playsinline preload="metadata"></video>` : ""}
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
        <div class="project-card-extra-inner">
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

  const extraInner = container.querySelector(".project-card-extra-inner");

  // The *target* height, not whatever .project-card-extra's grid row
  // currently measures mid-transition (see card.css's header comment on
  // the 0fr/1fr trick) - extraInner.scrollHeight is its full natural
  // content height regardless of the outer row's current animated size,
  // since overflow:hidden clips the rendered box without affecting
  // scrollHeight. A real host iframe's own CSS (see embedExporter.js's
  // generated `transition: height 0.3s ease` on the wrapping div, and
  // PLAN.md §6 - the boxed-ape injector needs the same) is what actually
  // animates smoothly toward this target; this only ever needs to post
  // the one final number, not a value per frame.
  function postResize() {
    if (window.self === window.top) return;
    requestAnimationFrame(() => {
      const height = card.classList.contains("expanded")
        ? banner.offsetHeight + extraInner.scrollHeight
        : banner.offsetHeight;
      window.parent.postMessage({ type: "reelplayer:resize", height }, "*");
    });
  }

  // Collapsing retracts height that everything below the card was resting
  // on - uncompensated, whatever's below (in a masonry grid, likely other
  // cards) visibly jumps upward as that space disappears, exactly the bug
  // js/player.js's own compensateScrollDuringCollapse() exists to prevent
  // for the reel. Same technique here, adapted for the card wrapper: watch
  // the card's *actual rendered* height via ResizeObserver as the CSS
  // grid-template-rows transition plays (card.css), and scroll by the
  // same delta on each reported change so content below stays visually
  // anchored throughout the whole animation, not just before/after it -
  // a single before/after measurement would still leave a visible jump at
  // either end now that the collapse is a real multi-frame transition,
  // not the instant snap this function used to compensate for. Same
  // "scrollBy directly, or ask the host via postMessage when in an
  // iframe" split - a real card embed's host page needs its own
  // reelplayer:scrollCompensate listener (PLAN.md §6, copied from
  // embedExporter.js's resizeScript - not built yet, so this is a no-op
  // until then in a real embed, exactly like the reel's own handshake was
  // before embedExporter.js existed).
  function compensateScrollForCollapse() {
    const inIframe = window.self !== window.top;
    let previousHeight = card.getBoundingClientRect().height;

    const applyDelta = (delta) => {
      if (delta === 0) return;
      if (inIframe) {
        window.parent.postMessage({ type: "reelplayer:scrollCompensate", delta: -delta }, "*");
      } else {
        window.scrollBy(0, -delta);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const currentHeight = entries[entries.length - 1].contentRect.height;
      applyDelta(previousHeight - currentHeight);
      previousHeight = currentHeight;
    });

    const stop = () => {
      resizeObserver.disconnect();
      card.removeEventListener("transitionend", onTransitionEnd);
    };
    const onTransitionEnd = (e) => {
      if (e.target === extraInner?.parentElement && e.propertyName === "grid-template-rows") stop();
    };
    card.addEventListener("transitionend", onTransitionEnd);
    resizeObserver.observe(card);

    // Fallback in case transitionend never fires (reduced-motion strips
    // the transition entirely, or an interrupted transition) - stop
    // regardless shortly after the CSS transition's own configured
    // duration (card.css's grid-template-rows transition, 0.35s).
    // The transition lives on .project-card-extra (its grid-template-rows),
    // not on .project-card itself.
    const extra = container.querySelector(".project-card-extra");
    const transitionDuration = (parseFloat(getComputedStyle(extra).transitionDuration) || 0.35) * 1000;
    setTimeout(stop, transitionDuration + 150);
  }

  function expand() {
    if (card.classList.contains("expanded")) return;
    card.classList.add("expanded");
    postResize();
  }

  function collapse() {
    if (!card.classList.contains("expanded")) return;
    // Start observing BEFORE removing "expanded" - that removal is what
    // triggers the CSS transition, so the observer needs to already be
    // watching to catch the very first frame of the shrink (same ordering
    // js/player.js's own collapsePlayer() uses for the identical reason).
    compensateScrollForCollapse();
    card.classList.remove("expanded");
    postResize();
  }

  // manualOverrideUntil guards against the mobile scroll observer below
  // immediately re-firing on (and undoing) a deliberate tap - harmless to
  // set on desktop too, since nothing reads it there.
  let manualOverrideUntil = 0;
  const TAP_COOLDOWN_MS = 500;

  if (isTouchDevice()) {
    // Mobile has no hover - mirrors js/player.js's
    // setupExpandableModeTouchInteractions(): a card expands as it scrolls
    // into the middle third of the viewport, and collapses once it fully
    // leaves that band. Deliberately simpler than the reel's own version -
    // no top-half tracking (accepted gap, a pure optimization the reel
    // skips off the bottom - see compensateScrollForCollapse()'s own
    // comment for why this always compensates instead). No hover here
    // means no banner-video preview either - touch visitors only ever see
    // the static banner image, which is also why PLAN.md's mobile-parity
    // note calls for preload="metadata" over "auto".
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (Date.now() < manualOverrideUntil) return;
        if (entry.isIntersecting) {
          expand();
        } else if (card.classList.contains("expanded")) {
          collapse();
        }
      });
    }, { threshold: 0, rootMargin: "-33% 0px -33% 0px" });
    observer.observe(card);
  } else {
    // Desktop hover.
    const bannerVideoEl = banner.querySelector(".project-card-banner-video");
    card.addEventListener("mouseenter", () => {
      expand();
      previewBannerVideo(bannerVideoEl, banner);
    });
    card.addEventListener("mouseleave", () => {
      collapse();
      stopBannerVideoPreview(bannerVideoEl, banner);
    });
  }

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

  // A tap on the already-active tab while expanded closes the card again -
  // hover has mouseleave for this, touch has no equivalent, so without this
  // a touch visitor could open but never manually close it (the scroll
  // observer above only reacts to leaving the middle-third band, not to a
  // second tap on the same spot).
  container.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tabName = btn.dataset.tab;
      manualOverrideUntil = Date.now() + TAP_COOLDOWN_MS;

      const alreadyActive = container
        .querySelector(`.tab-content[data-tab-content="${tabName}"]`)
        ?.classList.contains("active");
      if (card.classList.contains("expanded") && alreadyActive) {
        collapse();
        return;
      }
      expand();
      switchTab(tabName);
    });
  });

  postResize(); // initial (collapsed) height

  // PLAN.md §5's mobile-parity checklist: reelplayer:resize must also
  // re-fire on viewport resize/orientation change, not just
  // expand/collapse/tab-switch - a real responsive host page can resize
  // the card's iframe *width* (e.g. a masonry grid recalculating
  // columns), which can reflow the card's own content to a different
  // natural height (more/fewer lines of description text) with nothing
  // otherwise telling the host iframe to match. Debounced (150ms),
  // mirroring js/player.js's setupWaveformWidthTracking() - a continuous
  // resize/orientation-change gesture should only trigger one
  // re-measure at the end, not one per intermediate frame. No
  // removeEventListener/cleanup here: renderCardChrome() runs exactly
  // once per player.html page load (never re-invoked to re-render a
  // different card in the same document), so there's nothing to leak.
  let resizeDebounce;
  window.addEventListener("resize", () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(postResize, 150);
  });

  return { listenContainerId };
}
