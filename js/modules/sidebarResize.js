// sidebarResize.js - Drag-to-resize the builder sidebar (.builder-sidebar),
// persisting the chosen width across sessions. Pairs with css/builder.css's
// width: var(--builder-sidebar-width, 260px) - before this, the sidebar had
// no fixed width and auto-sized to whatever content was currently widest
// (a long page title, a long "/page?slug=..." subtitle), visibly jumping
// width on every selection change.
import { initResizablePanel } from "./resizablePanel.js";

export function initSidebarResize() {
  initResizablePanel({
    target: document.querySelector(".builder-sidebar"),
    handle: document.getElementById("sidebarResizeHandle"),
    axis: "x",
    cssVar: "--builder-sidebar-width",
    storageKey: "builderSidebarWidth",
    min: 200,
    max: 480,
  });
}
