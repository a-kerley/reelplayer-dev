// contextMenu.js - Small anchored dropdown menu (Copy URL / Rename / Delete,
// "Add block", etc.), positioned next to whatever button opened it, instead
// of a full-screen dialog. Only one instance is ever open at a time.
// Extracted from js/modules/mediaBrowser.js (its original, single caller)
// so js/modules/pageBlocksEditor.js's "Add block" menu can reuse the exact
// same positioning/outside-click/Escape/scroll-dismiss behavior rather than
// a second hand-copy of it.
let openMenuCleanup = null;
let openMenuAnchor = null;
let openSubmenuCleanup = null; // closed whenever the parent menu closes, or another item's submenu opens

export function closeContextMenu() {
  closeSubmenu();
  if (openMenuCleanup) {
    openMenuCleanup();
    openMenuCleanup = null;
    openMenuAnchor = null;
  }
}

function closeSubmenu() {
  if (openSubmenuCleanup) {
    openSubmenuCleanup();
    openSubmenuCleanup = null;
  }
}

/**
 * @param {HTMLElement} anchorEl - element the menu is positioned relative to
 * @param {Array<{label: string, icon?: string, danger?: boolean, disabled?: boolean, style?: string,
 *   submenu?: Array<same shape>, onClick?: () => void}>} items
 *   `icon`, if given, is raw inline SVG markup shown before the label.
 *   `disabled`, if true, greys the item out and makes it inert - e.g. a
 *   "Rename" option that exists for consistency but doesn't apply to the
 *   current target (see js/modules/sidebarList.js's Uncategorised header).
 *   `submenu`, if given (and `onClick` omitted), makes this a flyout item -
 *   hovering or clicking it opens a second anchored menu of its own items
 *   instead of firing an action directly (see js/modules/sidebarList.js's
 *   "Move to..." item).
 *   `style`, if given, is a CSS text string applied to the item's own
 *   button (e.g. `font-family: 'Merriweather', serif` for a font picker
 *   menu, so each entry previews in its own typeface) - see
 *   js/modules/pageBlocksEditor.js's Font/Text Style dropdowns.
 * @param {Object} [opts]
 * @param {boolean} [opts.preventFocusSteal] - keeps whatever element was
 *   focused (e.g. a textarea mid-selection) focused when an item is
 *   clicked, instead of the click handing focus to the menu button - see
 *   js/modules/pageBlocksEditor.js's text-block style menu, which needs
 *   the textarea's selection to survive picking a style from this menu.
 *   The caller is still responsible for guarding its own *anchor* button's
 *   mousedown the same way (this can only cover the item buttons this
 *   function creates, not the trigger that opened it).
 */
export function openContextMenu(anchorEl, items, opts = {}) {
  // Clicking the same trigger again closes the menu instead of flickering it
  // shut and straight back open - a normal dropdown toggle.
  const reopeningSameAnchor = openMenuAnchor === anchorEl;
  closeContextMenu();
  if (reopeningSameAnchor) return;

  // For a value-reflecting dropdown (Font / Weight / Style menus, all built on
  // createDropdownMenuButton), highlight the item matching the trigger's
  // current label. The trailing " •" override marker on the style button isn't
  // part of any item label, so strip it before comparing.
  const currentLabel = anchorEl
    .querySelector?.(".dropdown-menu-btn-label-text")
    ?.textContent.replace(/\s*•\s*$/, "").trim();

  const menu = document.createElement("div");
  menu.className = "app-context-menu";
  items.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = item.danger ? "danger" : "";
    if (currentLabel && typeof item.label === "string" && item.label.trim() === currentLabel) {
      btn.classList.add("selected");
      btn.setAttribute("aria-current", "true");
    }
    if (item.style) btn.style.cssText = item.style;
    btn.innerHTML = item.icon ? `${item.icon}<span>${item.label}</span>` : item.label;

    if (item.disabled) {
      btn.disabled = true;
      menu.appendChild(btn);
      return;
    }

    if (opts.preventFocusSteal) {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
    }

    if (item.submenu) {
      btn.classList.add("has-submenu");
      const chevron = document.createElement("span");
      chevron.className = "submenu-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "▸"; // ▸
      btn.appendChild(chevron);
      const openThisSubmenu = () => openSubmenu(btn, item.submenu, opts);
      btn.addEventListener("mouseenter", openThisSubmenu);
      btn.onclick = openThisSubmenu;
    } else {
      btn.addEventListener("mouseenter", closeSubmenu); // hovering away from the flyout item closes it
      btn.onclick = () => {
        closeContextMenu();
        item.onClick();
      };
    }
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
    // A click on the anchor (or anything inside it, e.g. the label span / caret
    // svg) is left for the anchor's own handler to toggle - closing here first
    // would make that handler always see "not open" and reopen instead. A
    // click inside an open submenu is *not* outside this parent menu either -
    // the submenu is a separate DOM node, appended straight to <body>.
    if (menu.contains(e.target) || anchorEl.contains(e.target)) return;
    if (openSubmenuEl && openSubmenuEl.contains(e.target)) return;
    closeContextMenu();
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

  openMenuAnchor = anchorEl;
  openMenuCleanup = () => {
    menu.remove();
    document.removeEventListener("mousedown", onOutsideClick);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", onScroll, true);
  };
}

let openSubmenuEl = null;

// One flyout level only (no submenu-of-a-submenu) - anchored to the item
// button that opened it, to its right, flipping left/up if that would
// overflow the viewport. Positioned/closed independently of the parent
// menu's own lifecycle, except closeContextMenu() always closes both.
function openSubmenu(anchorEl, items, parentOpts) {
  closeSubmenu();

  const submenu = document.createElement("div");
  submenu.className = "app-context-menu";
  items.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = item.danger ? "danger" : "";
    if (item.style) btn.style.cssText = item.style;
    btn.innerHTML = item.icon ? `${item.icon}<span>${item.label}</span>` : item.label;
    if (item.disabled) {
      btn.disabled = true;
      submenu.appendChild(btn);
      return;
    }
    if (parentOpts.preventFocusSteal) {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
    }
    btn.onclick = () => {
      closeContextMenu();
      item.onClick();
    };
    submenu.appendChild(btn);
  });
  document.body.appendChild(submenu);

  const anchorRect = anchorEl.getBoundingClientRect();
  const subRect = submenu.getBoundingClientRect();
  let left = anchorRect.right + 2;
  if (left + subRect.width > window.innerWidth - 4) left = anchorRect.left - subRect.width - 2;
  let top = anchorRect.top;
  if (top + subRect.height > window.innerHeight - 4) top = window.innerHeight - subRect.height - 4;
  submenu.style.left = `${left}px`;
  submenu.style.top = `${top}px`;

  openSubmenuEl = submenu;
  openSubmenuCleanup = () => {
    submenu.remove();
    openSubmenuEl = null;
  };
}
