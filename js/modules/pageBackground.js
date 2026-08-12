// pageBackground.js - Page-level background image (blur + parallax),
// rendered identically by page.html (the public standalone renderer) and
// the builder's own live-preview pane (js/pagesController.js's
// renderPagePreview()) via the one function below. See pageBlockRenderer.js
// for the same one-render-function-two-callers pattern already established
// for block content - CLAUDE.md documents the real bug class (player.html
// hand-duplicating js/player.js's render logic) this is designed to avoid
// repeating for page-level styling too.
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
 *   backgroundBlur (px), backgroundParallaxMode ("fixed"|"scroll")
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
  if (!page.backgroundImageEnabled || !page.backgroundImage) {
    return () => {};
  }

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

  if (getComputedStyle(scopeEl).position === "static") {
    scopeEl.style.position = "relative";
  }
  scopeEl.insertBefore(layer, scopeEl.firstChild);

  const factor = page.backgroundParallaxMode === "scroll" ? PARALLAX_FACTOR : FIXED_FACTOR;

  function sizeLayer() {
    // Zero first so this element's own (previous) height can't inflate the
    // scrollHeight/documentHeight read just below - a real feedback loop
    // otherwise, since the layer is itself part of what contributes to that
    // measurement.
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
    layer.style.transform = `translateY(${getScrollPos(scrollSource) * factor}px)`;
    ticking = false;
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateTransform);
  }

  sizeLayer();
  updateTransform();

  const scrollTarget = scrollSource === window ? window : scrollSource;
  scrollTarget.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", sizeLayer);

  return () => {
    scrollTarget.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", sizeLayer);
    layer.remove();
  };
}
