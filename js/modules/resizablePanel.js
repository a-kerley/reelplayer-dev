// resizablePanel.js - Generic drag-to-resize for a panel along one axis
// (the sidebar's width via a handle on its right edge, the Pages live-
// preview pane's height via a handle above it, etc), persisting the chosen
// size across sessions. Factored out so each concrete resize
// (sidebarResize.js, pagePreviewResize.js) is just a few lines of
// configuration rather than a second hand-copy of the drag/clamp/persist
// logic - same reasoning as draftStoreFactory.js's split.
/**
 * @param {Object} opts
 * @param {HTMLElement} opts.target - the element being resized
 * @param {HTMLElement} opts.handle - the draggable strip
 * @param {"x"|"y"} opts.axis
 * @param {string} opts.cssVar - custom property set on `target`, read by its width/height CSS
 * @param {string} opts.storageKey - localStorage key for persistence
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {boolean} [opts.invert] - true when the handle sits on the
 *   trailing edge of the size being controlled (e.g. above a pane whose
 *   *height* grows as you drag the handle *up*) - flips drag direction.
 */
export function initResizablePanel({ target, handle, axis, cssVar, storageKey, min, max, invert = false }) {
  if (!target || !handle) return;

  const saved = parseInt(localStorage.getItem(storageKey), 10);
  if (saved >= min && saved <= max) {
    target.style.setProperty(cssVar, `${saved}px`);
  }

  const cursor = axis === "x" ? "col-resize" : "row-resize";
  let dragging = false;
  let startPos = 0;
  let startSize = 0;

  function currentSize() {
    const rect = target.getBoundingClientRect();
    return axis === "x" ? rect.width : rect.height;
  }

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    startPos = axis === "x" ? e.clientX : e.clientY;
    startSize = currentSize();
    handle.classList.add("resizing");
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const pos = axis === "x" ? e.clientX : e.clientY;
    const rawDelta = pos - startPos;
    const delta = invert ? -rawDelta : rawDelta;
    const newSize = Math.min(max, Math.max(min, startSize + delta));
    target.style.setProperty(cssVar, `${newSize}px`);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("resizing");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    localStorage.setItem(storageKey, Math.round(currentSize()));
  });
}
