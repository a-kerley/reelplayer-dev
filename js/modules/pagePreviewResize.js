// pagePreviewResize.js - Drag-to-resize the Pages tab's live-preview pane
// (#pagePreviewPane), via the handle sitting above it (#pageBuilderView's
// static skeleton in index.html - never recreated by pagesController.js's
// renders, so this only needs wiring up once, unlike the pane's *content*).
import { initResizablePanel } from "./resizablePanel.js";

export function initPagePreviewResize() {
  initResizablePanel({
    target: document.getElementById("pagePreviewPane"),
    handle: document.getElementById("pagePreviewResizeHandle"),
    axis: "y",
    cssVar: "--page-preview-height",
    storageKey: "pagePreviewHeight",
    min: 120,
    max: 900,
    // The handle sits above the pane, so dragging it up (toward the editor
    // pane) should grow the preview, and dragging it down should shrink it
    // - the opposite of a raw Y-delta, hence invert.
    invert: true,
  });
}
