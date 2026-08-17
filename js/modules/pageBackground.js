// pageBackground.js - Page-level background image (blur + parallax),
// rendered identically by page.html (the public standalone renderer) and
// the builder's own live-preview pane (js/pagesController.js's
// renderPagePreview()) via the one function below. See pageBlockRenderer.js
// for the same one-render-function-two-callers pattern already established
// for block content - CLAUDE.md documents the real bug class (player.html
// hand-duplicating js/player.js's render logic) this is designed to avoid
// repeating for page-level styling too.
//
// Also positions a second layer, .page-content-overlay-layer, a color+
// opacity tint over the content column - independent of the background
// image/parallax mechanics below (works with or without a background
// image), living in this same function because it's page-level styling
// applied the same way in both contexts, same reasoning as everything
// else here. Sized by MEASURING the actual rendered content element
// (.page-blocks-list/.page-status-message) rather than matching it via a
// shared CSS property, specifically so it can be told to bleed outward
// past that element's own box (contentOverlayMarginVertical/Horizontal)
// or stretch to the page's full height (contentOverlayFullBleed) - things
// a background-color set directly on the content element could never do,
// since it's bound to that element's own box.
//
// "Fixed" and "scroll with parallax" are the same code path with a
// different multiplier, not two separate implementations (no
// position:fixed/background-attachment:fixed anywhere - that wouldn't work
// inside the builder's scrollable preview pane, and using it only in
// page.html while faking something else in the preview would reintroduce
// exactly the drift this module exists to avoid). The layer is a plain
// position:absolute element; on scroll, it's translated by
// `scrollPos * factor`:
//   - factor 1 ("fixed") exactly cancels the layer's natural scroll-with-
//     the-page motion, so it reads as pinned regardless of scroll depth.
//   - factor <1 ("scroll") lets it still move, just slower than the
//     foreground, producing drift.
//
// The layer is wrapped in .page-background-clip (overflow:hidden, height
// capped to the real content/viewport extent - see getContentExtent()
// below) rather than inserted into scopeEl directly. Chrome includes a
// transformed descendant's POST-transform box in its ancestor's scrollable
// overflow, so translateY(scrollPos * factor) on the bare layer grows
// scopeEl's own scrollHeight by that same translateY amount as the user
// scrolls - which grows how far they CAN scroll, which grows the next
// translateY, with no ceiling (confirmed by hand: setting a bare layer's
// transform to translateY(2000px) alone moved document.documentElement.
// scrollHeight by exactly 2000px). That's the mechanism behind "scrolling
// near the bottom of the page slowly extends it forever" - the clip
// wrapper absorbs the transformed box's overflow before it ever reaches
// scopeEl, confirmed by hand to hold scrollHeight flat across repeated
// scrolls even with the layer transformed far past its wrapper.
import { colorToRgba } from "./colorUtils.js";

const FIXED_FACTOR = 1;
const PARALLAX_FACTOR = 0.4;
const EDGE_BUFFER = 40; // px - oversize beyond computed height, hides blur's own edge softening
const SCROLL_MODE_BUFFER = 400; // px - extra drift room needed only in "scroll" mode

function getScrollPos(scrollSource) {
  return scrollSource === window ? window.scrollY : scrollSource.scrollTop;
}

function getViewportHeight(scrollSource) {
  return scrollSource === window ? window.innerHeight : scrollSource.clientHeight;
}

// The real, un-inflated extent of the page's own content - contentEl's own
// box, NOT scopeEl.scrollHeight/documentElement.scrollHeight (both of which
// include every descendant's rendered extent, transformed layers included -
// exactly the measurement this module must avoid feeding on, see the
// header comment). Shared by positionContentOverlay()'s fullBleed sizing
// and the background clip wrapper's sizing below, so both are pinned to
// the same safe, non-circular number.
function getContentExtent(scopeEl) {
  const contentEl = scopeEl.querySelector(".page-blocks-list, .page-status-message");
  return contentEl ? contentEl.offsetTop + contentEl.offsetHeight : 0;
}

function getContentHeight(scopeEl, scrollSource) {
  return scrollSource === window
    ? document.documentElement.scrollHeight
    : scopeEl.scrollHeight;
}

/**
 * @param {HTMLElement} scopeEl - positioning container the layer is
 *   absolutely positioned within (made position:relative if it isn't
 *   already) - document.body for page.html, #pagePreviewPane for the
 *   builder preview.
 * @param {Object} page - backgroundImageEnabled, backgroundImage,
 *   backgroundBlur (px), backgroundParallaxMode ("fixed"|"scroll"),
 *   contentOverlayColor (hex), contentOverlayOpacity (0-100),
 *   contentOverlayFullBleed (bool), contentOverlayMarginVertical (px,
 *   ignored when contentOverlayFullBleed is true), contentOverlayMarginHorizontal (px),
 *   contentMaxWidth (px), contentPaddingTop (px), contentPaddingBottom (px)
 * @param {Window|HTMLElement} scrollSource - window for page.html, the
 *   scrollable preview pane element for the builder (its own internal
 *   scroll, not the window's)
 * @returns {() => void} teardown - removes the layer and its scroll/resize
 *   listeners. Callers must invoke the PREVIOUS teardown before calling
 *   this again for the same scopeEl, or listeners accumulate across
 *   re-renders (innerHTML="" wipes the layer element itself, but not a
 *   listener attached directly to scrollSource when scrollSource is a
 *   persistent element like the preview pane, not the wiped content).
 */
export function applyPageBackground(scopeEl, page, scrollSource) {
  const teardowns = [];

  // Layout properties (independent of backgroundImageEnabled below - these
  // work whether or not a background image is on).
  scopeEl.style.setProperty("--page-content-max-width", `${page.contentMaxWidth ?? 900}px`);
  scopeEl.style.setProperty("--page-content-padding-top", `${page.contentPaddingTop ?? 0}px`);
  scopeEl.style.setProperty("--page-content-padding-bottom", `${page.contentPaddingBottom ?? 0}px`);

  if (getComputedStyle(scopeEl).position === "static") {
    scopeEl.style.position = "relative";
  }

  // Both the content-overlay tint and the background clip wrapper (below)
  // need to re-measure whenever the real content's size changes - not just
  // on window resize, but also e.g. an image inside a block finishing its
  // async load and growing the content taller after the initial
  // measurement already ran - or the viewport itself resizes. Collected in
  // one list so a single ResizeObserver + a single "resize" listener drive
  // both, instead of each maintaining its own (see positionContentOverlay's
  // fullBleed branch and the header comment for why neither can safely
  // measure off scrollHeight to react to this itself).
  const onMeasureChange = [];

  function refreshOverlay() {
    positionContentOverlay(scopeEl, page, scrollSource);
  }
  onMeasureChange.push(refreshOverlay);
  refreshOverlay();

  const overlayContentEl = scopeEl.querySelector(".page-blocks-list, .page-status-message");
  let contentResizeObserver = null;
  if (overlayContentEl) {
    contentResizeObserver = new ResizeObserver(() => onMeasureChange.forEach((fn) => fn()));
    contentResizeObserver.observe(overlayContentEl);
  }
  teardowns.push(() => contentResizeObserver?.disconnect());
  teardowns.push(() => {
    const existing = scopeEl.querySelector(".page-content-overlay-layer");
    if (existing) existing.remove();
  });

  function onViewportResize() {
    onMeasureChange.forEach((fn) => fn());
  }
  window.addEventListener("resize", onViewportResize);
  teardowns.push(() => window.removeEventListener("resize", onViewportResize));

  if (!page.backgroundImageEnabled || !page.backgroundImage) {
    return () => teardowns.forEach((fn) => fn());
  }

  // .page-background-layer is wrapped in this overflow:hidden container,
  // capped to getContentExtent()/viewport height rather than left to size
  // itself off the layer - see the header comment for why: the layer's own
  // transform would otherwise inflate scopeEl's scrollable overflow
  // directly. Anything the (intentionally oversized, for blur-edge and
  // drift buffer) layer transforms past this boundary is simply clipped,
  // which is correct - nothing should render below the real page bottom
  // anyway.
  const clip = document.createElement("div");
  clip.className = "page-background-clip";
  // Solid color behind the image layer (painted first, since it's the
  // clip's own background rather than a sibling/child) - not a translucent
  // tint stacked on top like .page-content-overlay-layer above. Fills any
  // transparency in the source image and the blurred layer's own edge
  // softening with a chosen color instead of scopeEl's plain background.
  clip.style.backgroundColor = page.backgroundOverlayEnabled
    ? (page.backgroundOverlayColor || "#000000")
    : "";
  scopeEl.insertBefore(clip, scopeEl.firstChild);

  const layer = document.createElement("div");
  layer.className = "page-background-layer";
  layer.style.backgroundImage = `url("${page.backgroundImage}")`;
  layer.style.filter = `blur(${page.backgroundBlur ?? 0}px)`;
  // Only bled vertically, not horizontally - the layer's left/right edges
  // never move (only translateY happens), so a horizontal blur edge just
  // sits statically at the container's own boundary, an acceptable/subtle
  // soft fade into the page's own background color. Bleeding horizontally
  // too would need overflow-x:hidden on <html> itself (body alone isn't
  // enough to stop the viewport scrolling sideways in Chrome, confirmed by
  // hand) - not worth adding to css/page.css, which is deliberately kept
  // free of anything that could affect the builder chrome that also loads
  // it (see that file's own header comment), for an edge effect nobody
  // will be scrolling sideways to see anyway.
  layer.style.top = `-${EDGE_BUFFER}px`;
  layer.style.left = "0";
  layer.style.right = "0";

  clip.appendChild(layer);

  const factor = page.backgroundParallaxMode === "scroll" ? PARALLAX_FACTOR : FIXED_FACTOR;

  function sizeClip() {
    clip.style.height = `${Math.max(getContentExtent(scopeEl), getViewportHeight(scrollSource))}px`;
  }

  function sizeLayer() {
    // Zero first so this element's own (previous) height can't inflate the
    // scrollHeight/documentHeight read just below - a real feedback loop
    // otherwise, since the layer is itself part of what contributes to that
    // measurement. (The clip wrapper above stops the layer's TRANSFORM from
    // reaching scopeEl's scrollHeight, but its plain, un-transformed height
    // still does, same as any other in-flow measurement - this guard is
    // still needed.)
    layer.style.height = "0px";
    const viewportH = getViewportHeight(scrollSource);
    if (factor >= 1) {
      layer.style.height = `${viewportH + EDGE_BUFFER * 2}px`;
    } else {
      const contentH = getContentHeight(scopeEl, scrollSource);
      layer.style.height = `${Math.max(contentH, viewportH) + SCROLL_MODE_BUFFER + EDGE_BUFFER * 2}px`;
    }
  }

  let ticking = false;
  function updateTransform() {
    // translate3d, not translateY - the 3D form is a much stronger, more
    // consistent signal to promote the layer onto the GPU compositor than
    // a plain 2D translateY, on top of the will-change:transform hint in
    // css/page.css (that hint alone wasn't enough to stop scroll stutter
    // with a large blurred surface - see that rule's comment).
    layer.style.transform = `translate3d(0, ${getScrollPos(scrollSource) * factor}px, 0)`;
    ticking = false;
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateTransform);
  }

  onMeasureChange.push(sizeClip, sizeLayer);
  sizeClip();
  sizeLayer();
  updateTransform();

  const scrollTarget = scrollSource === window ? window : scrollSource;
  scrollTarget.addEventListener("scroll", onScroll, { passive: true });

  teardowns.push(() => {
    scrollTarget.removeEventListener("scroll", onScroll);
    clip.remove();
  });

  return () => teardowns.forEach((fn) => fn());
}

// Measures the actual rendered content element and positions/sizes
// .page-content-overlay-layer to match it, optionally expanded outward by
// contentOverlayMarginVertical/Horizontal or stretched to the full page
// height (contentOverlayFullBleed). Re-runs on every call (idempotent -
// finds and replaces the one instance), so both the initial call and the
// resize listener above can share it directly. No-ops if the content
// element isn't in the DOM yet (nothing to measure/align to).
//
// Searches with a plain (non `:scope >`) selector and inserts via
// `contentEl.parentNode`, not `scopeEl`, because page.html nests the
// content one level deeper (`body > #pageRoot > .page-blocks-list`) than
// the builder's preview pane does (`#pagePreviewPane > .page-blocks-list`
// directly) - this handles both without the caller needing to know which
// shape it's in. The resulting DOM position doesn't affect the layer's
// actual screen position (position:absolute resolves against the nearest
// positioned ancestor, which is scopeEl in both cases since #pageRoot is
// a plain static div with no position of its own), and still produces the
// correct paint order (behind the background layer... behind this
// overlay... behind the real content) because "positioned, z-index:auto"
// elements paint in tree order across the whole subtree, not just among
// literal siblings, as long as nothing between them establishes its own
// stacking context - which #pageRoot doesn't.
function positionContentOverlay(scopeEl, page, scrollSource) {
  const existing = scopeEl.querySelector(".page-content-overlay-layer");
  if (existing) existing.remove();

  const contentEl = scopeEl.querySelector(".page-blocks-list, .page-status-message");
  if (!contentEl) return;

  const marginH = page.contentOverlayMarginHorizontal ?? 0;
  const marginV = page.contentOverlayMarginVertical ?? 0;
  const fullBleed = page.contentOverlayFullBleed === true;

  const overlay = document.createElement("div");
  overlay.className = "page-content-overlay-layer";
  overlay.style.left = "50%";
  overlay.style.transform = "translateX(-50%)";
  overlay.style.width = `${contentEl.offsetWidth + marginH * 2}px`;
  overlay.style.backgroundColor = colorToRgba(
    page.contentOverlayColor || "#000000",
    (page.contentOverlayOpacity ?? 0) / 100
  );

  if (fullBleed) {
    // Not "top:0; bottom:0; height:auto" - scopeEl (body for page.html,
    // #pagePreviewPane for the builder preview) is only as tall as its own
    // in-flow content, since absolutely positioned descendants (this layer
    // included) don't contribute to that auto-height. When the page's
    // actual content is shorter than the viewport, that leaves scopeEl's
    // box shorter than the visible page too, so "bottom:0" resolves against
    // that shorter box and the tint stops short of the real bottom of the
    // screen - the exact "extends to top but not bottom" symptom. Sizing
    // explicitly to whichever is taller - content or viewport - covers both:
    // a long page (content taller than viewport) and a short one (viewport
    // taller than content).
    //
    // Measured via getContentExtent() (contentEl's own box), NOT
    // getContentHeight()/scrollHeight - scrollHeight reflects the extent of
    // EVERY descendant, including .page-background-layer's own box, which
    // in "scroll" parallax mode is deliberately oversized past the real
    // content (SCROLL_MODE_BUFFER). Sizing off scrollHeight fed that
    // oversize back into this layer's height, which then fed into the next
    // sizeLayer() computation for .page-background-layer (its own
    // scrollHeight read includes THIS layer's box) - each resize event
    // (fired by mobile browsers as their address bar hides/shows during
    // scroll) compounded the two layers' heights off each other with no
    // ceiling. contentEl's own box is unaffected by either layer, so it
    // can't feed a loop.
    overlay.style.top = "0";
    overlay.style.bottom = "";
    overlay.style.height = `${Math.max(getContentExtent(scopeEl), getViewportHeight(scrollSource))}px`;
    overlay.style.borderRadius = "0";
    // A native rubber-band/elastic overscroll bounce reveals area beyond
    // scopeEl's own real bottom - the browser paints THAT sliver from
    // scopeEl's own background-color, not from any element inside it, so
    // no DOM box can cover it (a first attempt at this padded the overlay's
    // own height past the real edge instead; that box, being real layout
    // geometry, made the extra area genuinely scrollable by ordinary
    // means, not just reachable via bounce - background-color never
    // affects scrollable overflow, so it's the only way to tint that gap
    // without reopening that bug). Cleared in the non-fullBleed branch
    // below so a page that had fullBleed on and then turned it off doesn't
    // keep a stale tinted background.
    scopeEl.style.backgroundColor = colorToRgba(
      page.contentOverlayColor || "#000000",
      (page.contentOverlayOpacity ?? 0) / 100
    );
  } else {
    scopeEl.style.backgroundColor = "";
    overlay.style.top = `${contentEl.offsetTop - marginV}px`;
    overlay.style.bottom = "";
    overlay.style.height = `${contentEl.offsetHeight + marginV * 2}px`;
    // Matches .player-box's fixed corner radius (css/layout.css) so the
    // content column reads as the same "card" language as the player.
    overlay.style.borderRadius = "8px";
  }

  contentEl.parentNode.insertBefore(overlay, contentEl);
}
