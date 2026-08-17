// pageBlockReveal.js - Staged, top-to-bottom fade/rise-in for page blocks
// (js/modules/pageBlockRenderer.js's .page-block elements) as they enter
// the viewport. Same "one apply function, two callers" shape as
// js/modules/pageBackground.js's applyPageBackground()/pageTextStyles.js's
// applyTextStyles(): page.html and the builder's own live preview pane
// (js/pagesController.js's renderPagePreview()) both call
// applyBlockReveal() rather than each hand-rolling the same reveal logic.
//
// IntersectionObserver-driven, not scroll-position math - deliberately,
// given this repo's own documented history of scroll/transform-driven bugs
// in this exact page-rendering system (see pageBackground.js's header
// comment: a scroll-tied transform silently grew the page's own scrollable
// area with no ceiling). An IntersectionObserver only toggles a class once
// per element on entry; it never reads scrollHeight/scrollTop and never
// sets anything tied to live scroll position, so it can't reintroduce that
// bug class.
//
// Driven by the Web Animations API (target.animate()), NOT a CSS class
// toggle triggering a declarative transition - that was the original
// implementation, and real-world testing on a live page repeatedly showed
// it completing in under 100ms regardless of the declared 1s duration
// (confirmed by directly sampling computed opacity every 100ms - it read
// "1" from the very first sample, every time), while an isolated,
// standalone transition test in the same browser worked correctly. That
// pattern - a real value change happens, transitionend fires, but the
// animation itself never visibly runs its declared duration - is the
// signature of a CSS transition getting cut short by a mid-flight style
// recalculation (e.g. a web font finishing its swap, or any other layout-
// triggering change elsewhere on the page landing at the wrong moment).
// element.animate() keeps its own independent timeline instead of being
// re-derived from computed style on every recalc, so it isn't vulnerable
// to that class of interruption.
//
// Each block's start delay is set from its own position among siblings (0,
// STAGGER_MS, 2*STAGGER_MS, ...), capped at MAX_DELAY_MS. That staggers
// whichever blocks are visible together - typically everything above the
// fold on first load - into a top-to-bottom cascade, while a block a
// visitor scrolls all the way down to still reveals close to immediately
// (the cap keeps a block far down the page from ever waiting on some large,
// meaningless delay carried over from its raw index).
const STAGGER_MS = 280;
const MAX_DELAY_MS = 1400;
const FADE_DURATION_MS = 700;

/**
 * @param {HTMLElement} scopeEl - document.body for page.html, #pagePreviewPane
 *   for the builder's own live preview - same scopeEl passed to
 *   applyPageBackground()/applyTextStyles().
 * @param {Window|HTMLElement} scrollSource - window for page.html, the
 *   scrollable preview pane element for the builder - becomes the
 *   IntersectionObserver's `root` (null means "the viewport", which is
 *   wrong for a scrollable pane that isn't the window).
 * @returns {() => void} teardown - disconnects the observer. Callers must
 *   invoke the PREVIOUS teardown before calling this again for the same
 *   scopeEl, same reasoning as applyPageBackground()'s own teardown
 *   contract - re-rendering wipes the block elements themselves, but not
 *   an observer still holding stale references to them.
 */
export function applyBlockReveal(scopeEl, scrollSource) {
  // Plain (non `:scope >`) selector, same reasoning as
  // positionContentOverlay() in pageBackground.js - page.html nests blocks
  // one level deeper (body > #pageRoot > .page-blocks-list > .page-block)
  // than the builder's preview pane does (#pagePreviewPane >
  // .page-blocks-list > .page-block directly), and this handles both
  // without the caller needing to know which shape it's in.
  const blocks = Array.from(scopeEl.querySelectorAll(".page-blocks-list > .page-block"));
  if (!blocks.length) return () => {};

  // No staged reveal at all under this preference, not just a motion-free
  // version of it - .page-block-reveal-ready (the class that actually
  // hides a block pre-reveal) is never added, so blocks simply render
  // normally visible, like before this feature existed.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }

  const delays = blocks.map((block, i) => {
    block.classList.add("page-block-reveal-ready");
    return Math.min(i * STAGGER_MS, MAX_DELAY_MS);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target;
        const i = blocks.indexOf(target);
        // fill: "forwards" holds the end state after the animation
        // completes, at higher priority than the underlying CSS (same
        // idea as an inline style) - .page-block-reveal-ready's opacity:0/
        // translateY(16px) stays in the stylesheet as the pre-reveal state,
        // this just paints over it once, permanently, per element.
        target.animate(
          [
            { opacity: 0, transform: "translateY(16px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: FADE_DURATION_MS,
            delay: delays[i],
            easing: "ease",
            fill: "forwards",
          }
        );
        // One-shot reveal, not a repeating scroll animation - once a block
        // has appeared, scrolling it back out and in again shouldn't hide
        // and re-fade it every time.
        observer.unobserve(target);
      });
    },
    {
      root: scrollSource === window ? null : scrollSource,
      threshold: 0.15,
    }
  );

  blocks.forEach((block) => observer.observe(block));

  return () => observer.disconnect();
}
