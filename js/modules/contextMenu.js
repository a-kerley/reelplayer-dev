// contextMenu.js - Small anchored dropdown menu (Copy URL / Rename / Delete,
// "Add block", etc.), positioned next to whatever button opened it, instead
// of a full-screen dialog. Only one instance is ever open at a time.
// Extracted from js/modules/mediaBrowser.js (its original, single caller)
// so js/modules/pageBlocksEditor.js's "Add block" menu can reuse the exact
// same positioning/outside-click/Escape/scroll-dismiss behavior rather than
// a second hand-copy of it.
let openMenuCleanup = null;
let openMenuAnchor = null;
// One entry per open flyout LEVEL (not per item) - entry 0 is the first
// flyout off the root menu, entry 1 a flyout off one of entry 0's own
// items, etc. Submenus can nest arbitrarily deep (see mediaBrowser.js's
// folder-tree "Move to..." menu) - closeSubmenusFrom(n) truncates the
// chain back to n levels, which is what both "hovered a sibling at this
// depth" and "closed the whole menu" need.
let submenuStack = [];

export function closeContextMenu() {
  closeSubmenusFrom(0);
  if (openMenuCleanup) {
    openMenuCleanup();
    openMenuCleanup = null;
    openMenuAnchor = null;
  }
}

function closeSubmenusFrom(depth) {
  while (submenuStack.length > depth) {
    submenuStack.pop().cleanup();
  }
}

// openContextMenu() positions relative to an anchor element's own bounding
// box - fine for a small, click-sized anchor (a button, a narrow list row),
// but wrong for a right-click on something wide (a table row spanning the
// full content width, open empty space), where the menu would land at the
// anchor's far edge instead of near the actual click. A zero-size point
// element at the cursor gives it a same-size-as-click "anchor" instead;
// removed immediately after, since openContextMenu only reads its rect
// synchronously during positioning.
export function openContextMenuAtCursor(e, items, opts) {
  const point = document.createElement('div');
  point.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;`;
  document.body.appendChild(point);
  openContextMenu(point, items, opts);
  point.remove();
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
 *   "Move to..." item). Submenu items can themselves carry a `submenu`,
 *   nesting to any depth (see js/modules/mediaBrowser.js's folder-tree
 *   "Move to..." menu).
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
  renderMenuItems(menu, items, opts, 0, currentLabel);
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
    // click inside any open submenu (at any nesting depth) is *not* outside
    // this parent menu either - each flyout is a separate DOM node, appended
    // straight to <body>.
    if (menu.contains(e.target) || anchorEl.contains(e.target)) return;
    if (submenuStack.some(entry => entry.el.contains(e.target))) return;
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

// Shared by the root menu and every flyout level - builds each item's
// button and wires its hover/click behavior. `depth` is the flyout-stack
// index that a submenu opened FROM this item would occupy (0 for items in
// the root menu, 1 for items inside the first flyout, etc.) - it's what
// closeSubmenusFrom() needs to collapse only the levels deeper than
// whichever item was just hovered/clicked.
function renderMenuItems(container, items, opts, depth, currentLabel) {
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
      container.appendChild(btn);
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
      chevron.textContent = "▸";
      btn.appendChild(chevron);
      const openThisSubmenu = () => openSubmenuLevel(depth, btn, item.submenu, opts);
      btn.addEventListener("mouseenter", openThisSubmenu);
      btn.onclick = openThisSubmenu;
    } else {
      // Hovering a plain item collapses any flyouts opened from a sibling
      // at this same depth, but leaves this item's own ancestor flyouts
      // (depth - 1, depth - 2, ...) open.
      btn.addEventListener("mouseenter", () => closeSubmenusFrom(depth));
      btn.onclick = () => {
        closeContextMenu();
        item.onClick();
      };
    }
    container.appendChild(btn);
  });
}

// Opens (or replaces) the flyout at stack position `level`, anchored to the
// item button that triggered it - positioned to its right, flipping
// left/up if that would overflow the viewport. Any deeper flyout (level+1
// and beyond) is closed first, and any flyout already at this exact level
// (e.g. the user moved from one submenu-having item to a sibling one) is
// replaced.
function openSubmenuLevel(level, anchorEl, items, opts) {
  closeSubmenusFrom(level);

  const submenu = document.createElement("div");
  submenu.className = "app-context-menu";
  renderMenuItems(submenu, items, opts, level + 1);
  document.body.appendChild(submenu);

  const anchorRect = anchorEl.getBoundingClientRect();
  const subRect = submenu.getBoundingClientRect();
  let left = anchorRect.right + 2;
  if (left + subRect.width > window.innerWidth - 4) left = anchorRect.left - subRect.width - 2;
  let top = anchorRect.top;
  if (top + subRect.height > window.innerHeight - 4) top = window.innerHeight - subRect.height - 4;
  submenu.style.left = `${left}px`;
  submenu.style.top = `${top}px`;

  submenuStack.push({
    el: submenu,
    cleanup: () => submenu.remove()
  });
}
