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
// Each block's CSS transition-delay is set from its own position among
// siblings (0, STAGGER_MS, 2*STAGGER_MS, ...), capped at MAX_DELAY_MS. That
// staggers whichever blocks are visible together - typically everything
// above the fold on first load - into a top-to-bottom cascade, while a
// block a visitor scrolls all the way down to still reveals close to
// immediately (the cap keeps a block far down the page from ever waiting
// on some large, meaningless delay carried over from its raw index).
const STAGGER_MS = 400;
const MAX_DELAY_MS = 2000;

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
  if (!blocks.length) {
    console.log("📜 pageBlockReveal: no .page-block elements found under", scopeEl);
    return () => {};
  }

  // No staged reveal at all under this preference, not just a motion-free
  // version of it - .page-block-reveal-ready (the class that actually
  // hides a block pre-reveal) is never added, so blocks simply render
  // normally visible, like before this feature existed. css/page.css
  // carries a matching (belt-and-suspenders) reduced-motion rule for the
  // rare case a block was already mid-reveal when the OS preference
  // changed mid-session.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    console.log("📜 pageBlockReveal: skipped - prefers-reduced-motion is on");
    return () => {};
  }

  // t0/elapsed() exist purely to answer "is the delay/duration actually
  // being honored in real time, or does it just look that way from the
  // class list" - transition-delay/duration are CSS values, not proof the
  // browser actually spent that long animating. The "revealing" log fires
  // when is-visible is added (start of delay countdown); the "finished
  // fading" log fires on the real transitionend event, so the gap between
  // them is measured wall-clock time, not a configured value.
  const t0 = performance.now();
  const elapsed = () => `${(performance.now() - t0).toFixed(0)}ms`;

  const delays = blocks.map((block, i) => {
    const delay = Math.min(i * STAGGER_MS, MAX_DELAY_MS);
    block.classList.add("page-block-reveal-ready");
    block.style.transitionDelay = `${delay}ms`;
    return delay;
  });
  console.log(`📜 pageBlockReveal: watching ${blocks.length} block(s), delays [${delays.join(", ")}]ms`);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target;
        const i = blocks.indexOf(target);
        console.log(`📜 pageBlockReveal: [${elapsed()}] block ${i} (${target.className.split(" ")[1] || "?"}) entered viewport - revealing (configured delay ${delays[i]}ms)`);
        // Not { once: true } - transitionend bubbles, and once:true would
        // consume the listener on the FIRST transitionend of any kind, which
        // could be a bubbled one this handler is about to ignore, silently
        // eating the listener before the real event ever arrives. Removed
        // manually instead, only once the real match fires.
        function onTransitionEnd(e) {
          // A banner/image block's own child <img> has its own separate
          // opacity transition (css/page.css's .page-image-fade, unrelated
          // feature) - without the e.target check, that child's transition
          // finishing bubbles up and gets mistaken for this wrapper's own
          // reveal transition completing, under-reporting elapsed time by
          // whatever's left of the child's fade.
          if (e.target !== target || e.propertyName !== "opacity") return;
          console.log(`📜 pageBlockReveal: [${elapsed()}] block ${i} finished fading in`);
          target.removeEventListener("transitionend", onTransitionEnd);
        }
        target.addEventListener("transitionend", onTransitionEnd);
        // Double rAF, not a direct classList.add() - .page-block-reveal-ready
        // (opacity:0) was applied earlier in this same function, but style
        // application alone doesn't guarantee the browser has actually
        // PAINTED that hidden state yet; paints happen on the rendering
        // pipeline's own schedule, not synchronously with a style write. On
        // a busy main thread (this page's two Player iframes + a video
        // background preload were enough to reproduce it), the first real
        // paint opportunity can land AFTER is-visible would already have
        // been added too, so the browser never renders an intermediate
        // "hidden" frame to transition FROM - it just snaps straight to the
        // final opacity, no visible fade, even though transitionend still
        // fires (this is what block 0 finishing in 36ms instead of ~1000ms
        // during testing turned out to mean). One rAF callback runs before
        // the NEXT paint - it's still too early, since that same upcoming
        // paint might be the very first one. A second, nested rAF callback
        // runs after that paint has already happened, guaranteeing the
        // hidden state was actually rendered at least once before this flips
        // it - the standard fix for this class of "transition doesn't
        // animate" bug.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            target.classList.add("is-visible");
          });
        });
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

  // Fires once, at a fixed point safely past every possible delay+duration
  // (MAX_DELAY_MS + a 1s fade + 1s slack), and reports each block's actual
  // ground-truth state - not reliant on a person timing when they check the
  // console themselves, or on transitionend having fired at all (a heavily
  // loaded main thread, e.g. from a browser extension's own content script,
  // can starve/coalesce a transition without ever firing that event).
  setTimeout(() => {
    const report = blocks.map((block, i) => ({
      i,
      type: block.className.split(" ")[1] || "?",
      opacity: getComputedStyle(block).opacity,
      isVisibleClass: block.classList.contains("is-visible"),
    }));
    console.log(`📜 pageBlockReveal: [${elapsed()}] final status check -`, report);
  }, MAX_DELAY_MS + 2000);

  return () => {
    console.log("📜 pageBlockReveal: teardown - observer disconnected");
    observer.disconnect();
  };
}
