// contextMenu.js - Small anchored dropdown menu (Copy URL / Rename / Delete,
// "Add block", etc.), positioned next to whatever button opened it, instead
// of a full-screen dialog. Only one instance is ever open at a time.
// Extracted from js/modules/mediaBrowser.js (its original, single caller)
// so js/modules/pageBlocksEditor.js's "Add block" menu can reuse the exact
// same positioning/outside-click/Escape/scroll-dismiss behavior rather than
// a second hand-copy of it.
let openMenuCleanup = null;

export function closeContextMenu() {
  if (openMenuCleanup) {
    openMenuCleanup();
    openMenuCleanup = null;
  }
}

/**
 * @param {HTMLElement} anchorEl - element the menu is positioned relative to
 * @param {Array<{label: string, icon?: string, danger?: boolean, onClick: () => void}>} items
 *   `icon`, if given, is raw inline SVG markup shown before the label.
 */
export function openContextMenu(anchorEl, items) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "app-context-menu";
  items.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = item.danger ? "danger" : "";
    btn.innerHTML = item.icon ? `${item.icon}<span>${item.label}</span>` : item.label;
    btn.onclick = () => {
      closeContextMenu();
      item.onClick();
    };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);

  const anchorRect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = anchorRect.right - menuRect.width;
  let top = anchorRect.bottom + 4;
  left = Math.max(4, Math.min(left, window.innerWidth - menuRect.width - 4));
  if (top + menuRect.height > window.innerHeight - 4) {
    top = anchorRect.top - menuRect.height - 4;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onOutsideClick = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) closeContextMenu();
  };
  const onKeydown = (e) => { if (e.key === "Escape") closeContextMenu(); };
  const onScroll = () => closeContextMenu();

  // Defer listener attach so the click that opened the menu doesn't
  // immediately close it via the outside-click handler.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("scroll", onScroll, true);
  }, 0);

  openMenuCleanup = () => {
    menu.remove();
    document.removeEventListener("mousedown", onOutsideClick);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", onScroll, true);
  };
}
