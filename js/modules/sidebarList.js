// sidebarList.js - Generic sortable, delete-capable sidebar list, shared by
// js/sidebar.js (Reels) and js/pagesSidebar.js (Pages). Both lists are
// structurally identical - sort by createdAt desc, render an <li> per entry
// with a title (click = select) and a delete button, wire up a "+ New"
// button - only the container id, "untitled" placeholder, and "+ New"
// button id/label differ, so those are the only things callers pass in.
import { dialog } from './dialogSystem.js';
import { openContextMenu, openContextMenuAtCursor } from './contextMenu.js';
import { loadFolderMeta, saveFolderMeta } from './folderMeta.js';
import { showToast } from './toast.js';

// Folder grouping. `item.folder` is a plain string tag an item carries, but
// a folder's NAME persists independently via /folder-meta/:type (see
// folderMeta.js) - that's what lets an empty folder (created but nothing
// moved into it yet) survive a reload instead of disappearing the moment
// nothing references it. Items with no folder (new items default to this)
// group under the fixed, always-present "Uncategorised" header, which is
// never itself a real folder name an item can be tagged with or rename.
const UNCATEGORISED = 'Uncategorised';

// Per-list (#reelList/#pageList/#cardList) state: the persisted folder
// names + collapsed set (synced via opts.folderMetaType, once loaded), and
// the args needed to re-render after any change - self-contained here so
// none of this requires every caller to thread extra re-render plumbing
// through just for this. `names` is an ORDERED array, not a Set - its
// element order IS the folder display order (drag-to-reorder splices it),
// so renaming a folder must replace-in-place rather than delete+re-add
// (which would silently bump it to the end).
const folderMetaByList = new Map(); // listElId -> {type, names: string[], collapsed: Set, loaded: bool}
const lastRenderArgs = new Map(); // listElId -> arguments array

function getFolderMetaState(opts) {
  if (!folderMetaByList.has(opts.listElId)) {
    folderMetaByList.set(opts.listElId, { type: opts.folderMetaType, names: [], collapsed: new Set(), loaded: false });
  }
  const state = folderMetaByList.get(opts.listElId);
  if (opts.folderMetaType && !state.loaded && !state.loading) {
    state.loading = loadFolderMeta(opts.folderMetaType).then((meta) => {
      state.names.push(...meta.names);
      meta.collapsed.forEach((n) => state.collapsed.add(n));
      state.loaded = true;
      const args = lastRenderArgs.get(opts.listElId);
      if (args) renderSidebarList(...args);
    });
  }
  return state;
}

function persistFolderMeta(state) {
  if (!state.type) return;
  saveFolderMeta(state.type, { names: state.names, collapsed: [...state.collapsed] });
}

// Shared by the "New folder..." item (inside an item's Move-to submenu) and
// the empty-space "New Folder" action - same prompt, same collision check,
// same persistence. New folders join at the end of the order. Returns the
// created name, or null if cancelled/rejected.
async function createFolder(state) {
  const name = await dialog.prompt('New folder name:');
  if (!name) return null;
  if (name === UNCATEGORISED || state.names.includes(name)) {
    await dialog.alert(`A folder named "${name}" already exists.`);
    return null;
  }
  state.names.push(name);
  persistFolderMeta(state);
  return name;
}

async function renameFolder(state, oldName, opts) {
  const newName = await dialog.prompt('Rename folder:', oldName);
  if (!newName || newName === oldName) return;
  if (newName === UNCATEGORISED || state.names.includes(newName)) {
    await dialog.alert(`A folder named "${newName}" already exists.`);
    return;
  }
  const idx = state.names.indexOf(oldName);
  if (idx !== -1) state.names[idx] = newName; // in place - preserves its position in the order
  if (state.collapsed.has(oldName)) {
    state.collapsed.delete(oldName);
    state.collapsed.add(newName);
  }
  persistFolderMeta(state);
  opts.onRenameFolder?.(oldName, newName);
}

// Ungroups every item currently in this folder (folder -> null, same as
// "Remove from folder") rather than deleting them - reuses onRenameFolder's
// existing bulk-rewrite, just targeting null instead of a new name.
async function deleteFolder(state, name, opts) {
  const confirmed = await dialog.confirm(`Delete "${name}"? Items inside move to Uncategorised.`, 'Delete', 'Cancel');
  if (!confirmed) return;
  state.names = state.names.filter((n) => n !== name);
  state.collapsed.delete(name);
  persistFolderMeta(state);
  opts.onRenameFolder?.(name, null);
}

// Moves `draggedName` to sit immediately before `targetName` in the order -
// same "insert before, except dropping on the last one inserts after"
// simplification js/modules/tracksEditor.js's own drag-reorder already
// uses, rather than cursor-Y half-detection.
function reorderFolder(state, draggedName, targetName, insertAfter) {
  const from = state.names.indexOf(draggedName);
  if (from === -1) return;
  state.names.splice(from, 1);
  let to = state.names.indexOf(targetName);
  if (to === -1) return;
  if (insertAfter) to += 1;
  state.names.splice(to, 0, draggedName);
  persistFolderMeta(state);
}

// Splices `draggedId` to sit before/after `targetId` within `folderItems`
// (already in their current display order), then hands the caller the
// full new id order for that one group to persist as each item's `order`
// field (0, 1, 2, ... matching the new sequence) - renumbering the whole
// group at once, not just the two that moved, so every item's `order` is
// always a clean dense sequence rather than accumulating gaps or ties.
function reorderItem(folderItems, draggedId, targetId, insertAfter, opts) {
  const ids = folderItems.map(([id]) => id);
  const from = ids.indexOf(draggedId);
  if (from === -1) return;
  ids.splice(from, 1);
  let to = ids.indexOf(targetId);
  if (to === -1) return;
  if (insertAfter) to += 1;
  ids.splice(to, 0, draggedId);
  opts.onReorderItems?.(ids);
}

// A brand new item never has `order` set - it sorts by createdAt (newest
// first, this list's original behaviour) ahead of every item that DOES
// have one (only ever assigned by an actual drag-reorder, which stamps
// every item then in the same group at once - see reorderItem()).
function compareItemOrder([, a], [, b]) {
  const aOrdered = a.order !== undefined;
  const bOrdered = b.order !== undefined;
  if (aOrdered !== bOrdered) return aOrdered ? 1 : -1;
  if (aOrdered) return a.order - b.order;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

function groupByFolder(sortedItems, persistedNames) {
  const groups = new Map(); // folderName -> [[id, item], ...]
  groups.set(UNCATEGORISED, []);
  for (const name of persistedNames) groups.set(name, []);
  for (const entry of sortedItems) {
    const folder = entry[1].folder || UNCATEGORISED;
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(entry);
  }
  // Sort each group independently - a drag-reorder (see reorderItem())
  // only ever assigns `order` to the items within one group, so order
  // values are only ever compared within that same group, never across
  // groups. A brand new item has no `order` yet, so it sorts to the top
  // by createdAt (this list's original convention) ahead of any item
  // that's been manually positioned, until the next reorder folds it in.
  for (const arr of groups.values()) arr.sort(compareItemOrder);
  // Uncategorised always last. Named folders in their persisted custom
  // order (drag-to-reorder splices `persistedNames` directly); an ad-hoc
  // folder name (an item references it but it's missing from
  // persistedNames - shouldn't normally happen, every creation path adds
  // to the array) has no defined position, so it sorts after every
  // explicitly-ordered folder, alphabetically among any others like it.
  const orderIndex = new Map(persistedNames.map((name, i) => [name, i]));
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNCATEGORISED) return 1;
    if (b === UNCATEGORISED) return -1;
    const ai = orderIndex.has(a) ? orderIndex.get(a) : Infinity;
    const bi = orderIndex.has(b) ? orderIndex.get(b) : Infinity;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

// Heroicons (MIT license, heroicons.com) 24x24 solid lock-closed/lock-open,
// inlined per this codebase's existing convention of embedding raw SVG
// markup directly (see e.g. js/modules/pageBlocksEditor.js) rather than
// loading an icon font/library.
export const ICONS = {
  lockClosed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;">
    <path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clip-rule="evenodd" />
  </svg>`,
  lockOpen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;">
    <path d="M18 1.5c2.9 0 5.25 2.35 5.25 5.25v3.75a.75.75 0 0 1-1.5 0V6.75a3.75 3.75 0 1 0-7.5 0v3a3 3 0 0 1 3 3v6.75a3 3 0 0 1-3 3H3.75a3 3 0 0 1-3-3v-6.75a3 3 0 0 1 3-3h9v-3c0-2.9 2.35-5.25 5.25-5.25Z" />
  </svg>`,
};

/**
 * @param {Object} opts
 * @param {string} opts.listElId - id of the <ul> to render into
 * @param {string} opts.newBtnId - id of the "+ New" button to wire up
 * @param {string} opts.newBtnLabel - text for the "+ New" button
 * @param {string} opts.emptyTitlePlaceholder - shown when an entry has no title
 * @param {string} [opts.deleteConfirmMessage] - confirm() prompt for delete
 * @param {Array} items - entries with at least .id/.title/.createdAt
 * @param {string} currentId
 * @param {(id: string) => void} onSelect
 * @param {() => void} onNew
 * @param {(id: string) => void} onDelete
 * @param {(item: Object) => string} [renderSubtitle] - optional per-item subtitle line
 * @param {(id: string) => void} [onToggleLock] - optional lock/unlock icon button per row
 * @param {"reel"|"page"|"card"} [opts.folderMetaType] - enables folder grouping/rename/create,
 *   synced via /folder-meta/:type (folderMeta.js). Omit to render a flat list with no folders.
 * @param {(id: string, folder: string|null) => void} [opts.onMoveToFolder] - per-item move/remove
 * @param {(oldName: string, newName: string|null) => void} [opts.onRenameFolder] - bulk-rewrites
 *   every item currently tagged with oldName to newName (or null to ungroup); called after the
 *   collision check passes (rename) or the confirm dialog is accepted (delete)
 * @param {(id: string) => void} [opts.onDuplicate] - row context-menu "Duplicate" + the "+ New"
 *   button's dropdown "Duplicate Current"
 * @param {(item: Object) => string|null} [opts.getPublicUrl] - shareable URL for a published
 *   item, or null/undefined if unpublished; enables the row's "Copy Link" item when present
 * @param {(orderedIds: string[]) => void} [opts.onReorderItems] - drag-to-reorder within one
 *   group; called with every item id in that group, in its new order, to persist as `order`
 */
export function renderSidebarList(opts, items, currentId, onSelect, onNew, onDelete, renderSubtitle, onToggleLock) {
  const list = document.getElementById(opts.listElId);
  if (!list) return;
  list.innerHTML = '';
  lastRenderArgs.set(opts.listElId, [opts, items, currentId, onSelect, onNew, onDelete, renderSubtitle, onToggleLock]);
  const folderMeta = getFolderMetaState(opts);
  const collapsed = folderMeta.collapsed;

  // Sort by most recent (descending createdAt), fallback to 0. Same
  // de-dupe-by-id-then-sort shape as the original renderSidebar() - kept in
  // case a caller ever passes duplicate-id entries mid-transition.
  const sortedItems = Object.entries(
    items.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {})
  ).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  const folderNames = [...new Set([...folderMeta.names, ...sortedItems.map(([, it]) => it.folder).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b));

  const renderItem = ([id, item], folderItems) => {
    const li = document.createElement('li');
    li.className = item.id === currentId ? 'active' : '';
    // The row itself is the "select this item" control - role="button" +
    // tabindex make it keyboard-reachable/operable, since previously only
    // the lock/delete icon buttons inside it were. Child buttons already
    // call e.stopPropagation() in their own onclick, so this doesn't
    // double-fire selection when clicking those.
    li.setAttribute('role', 'button');
    li.tabIndex = 0;
    if (item.id === currentId) li.setAttribute('aria-current', 'true');
    li.onclick = () => onSelect(item.id);
    li.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(item.id);
      }
    };

    // Drag-to-a-folder-header is the fast path; the context menu's "Move
    // to..." (below) is the keyboard/accessible equivalent of the same
    // action, not a fallback bolted on after the fact - both call the same
    // opts.onMoveToFolder. .dragging/.drag-over are the same classes
    // js/modules/tracksEditor.js's own drag-reorder already uses.
    if (opts.onMoveToFolder) {
      li.draggable = true;
      li.ondragstart = (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        li.classList.add('dragging');
      };
      li.ondragend = () => li.classList.remove('dragging');

      // Reordering within the same group is a separate gesture from
      // moving between groups (that's drag-onto-a-header, or the context
      // menu below) - dropping this item onto another one only reorders
      // if they're already in the same folder; dropping across folders
      // here is a silent no-op rather than also moving it, so there's
      // never ambiguity about what a single drag-and-drop does.
      li.ondragover = (e) => {
        e.preventDefault();
        list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
        const indicator = document.createElement('li');
        indicator.className = 'drop-indicator';
        const isLastInGroup = folderItems[folderItems.length - 1]?.[0] === item.id;
        if (isLastInGroup) li.after(indicator);
        else li.before(indicator);
      };
      li.ondragleave = () => list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
      li.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation(); // don't also let this bubble to a folder header's own ondrop
        list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === item.id) return;
        const draggedInGroup = folderItems.some(([entryId]) => entryId === draggedId);
        if (!draggedInGroup) return; // different folder - not this gesture's job
        const isLastInGroup = folderItems[folderItems.length - 1]?.[0] === item.id;
        reorderItem(folderItems, draggedId, item.id, isLastInGroup, opts);
      };
    }

    li.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menuItems = [];

      if (onToggleLock) {
        menuItems.push({
          label: item.locked ? 'Unlock' : 'Lock',
          onClick: () => onToggleLock(item.id),
        });
      }

      if (opts.onMoveToFolder) {
        const submenuItems = folderNames
          .filter((name) => name !== item.folder)
          .map((name) => ({ label: name, onClick: () => opts.onMoveToFolder(item.id, name) }));
        submenuItems.push({
          label: 'New folder…',
          onClick: async () => {
            const name = await createFolder(folderMeta);
            if (name) opts.onMoveToFolder(item.id, name);
          },
        });
        if (item.folder) {
          submenuItems.push({ label: 'Remove from folder', onClick: () => opts.onMoveToFolder(item.id, null) });
        }
        menuItems.push({ label: 'Move to…', submenu: submenuItems });
      }

      if (opts.onDuplicate) {
        menuItems.push({ label: 'Duplicate', onClick: () => opts.onDuplicate(item.id) });
      }

      if (opts.getPublicUrl) {
        const url = opts.getPublicUrl(item);
        menuItems.push({
          label: 'Copy Link',
          disabled: !url,
          onClick: () => navigator.clipboard.writeText(url)
            .then(() => showToast('Link copied'))
            .catch(() => dialog.alert(`Couldn't copy to clipboard. Link: ${url}`)),
        });
      }

      menuItems.push({
        label: 'Delete',
        danger: true,
        onClick: () => dialog.confirm(opts.deleteConfirmMessage || 'Delete this item?', 'Delete', 'Cancel').then((confirmed) => {
          if (confirmed) onDelete(item.id);
        }),
      });

      openContextMenu(li, menuItems);
    };

    const titleSpan = document.createElement('span');
    titleSpan.className = 'sidebar-item-title';
    titleSpan.textContent = item.title || opts.emptyTitlePlaceholder;
    li.appendChild(titleSpan);

    // Subtitle + lock/delete buttons share one row under the title, instead
    // of the buttons sitting on the title's own line - keeps the row to two
    // lines total instead of three, and the buttons no longer force the
    // title line's height up to icon size.
    const metaRow = document.createElement('div');
    metaRow.className = 'sidebar-item-meta-row';
    li.appendChild(metaRow);

    if (renderSubtitle) {
      const subtitleSpan = document.createElement('span');
      subtitleSpan.className = 'sidebar-item-subtitle';
      subtitleSpan.textContent = renderSubtitle(item);
      metaRow.appendChild(subtitleSpan);
    }

    if (onToggleLock) {
      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'lock-reel-btn' + (item.locked ? ' locked' : '');
      lockBtn.setAttribute('aria-label', item.locked ? 'Unlock' : 'Lock');
      lockBtn.title = item.locked ? 'Unlock' : 'Lock';
      // Heroicons (MIT license, heroicons.com) solid lock-closed/lock-open,
      // same convention already used for the delete button's icon just
      // below (also a Heroicons solid path).
      lockBtn.innerHTML = item.locked ? ICONS.lockClosed : ICONS.lockOpen;
      // Confirm-before-unlock lives in the caller's onToggleLock itself
      // (js/main.js's toggleReelLock(), js/pagesController.js's
      // equivalent) - not here - so the sidebar icon and the in-editor
      // lock button (a separate entry point to the same toggle) can't
      // drift into asking differently.
      lockBtn.onclick = (e) => {
        e.stopPropagation();
        onToggleLock(item.id);
      };
      metaRow.appendChild(lockBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-reel-btn';
    delBtn.title = `Delete ${item.title || opts.emptyTitlePlaceholder}`;
    delBtn.setAttribute('aria-label', delBtn.title);
    delBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:22px;height:22px;">
        <path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clip-rule="evenodd" />
      </svg>
    `;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (e.target.closest('.delete-reel-btn')) {
        dialog.confirm(opts.deleteConfirmMessage || 'Delete this item?', 'Delete', 'Cancel').then(confirmed => {
          if (confirmed) onDelete(item.id);
        });
      }
    };

    metaRow.appendChild(delBtn);
    return li;
  };

  const allGroupNames = [];
  const groupEntries = groupByFolder(sortedItems, folderMeta.names);
  // The named folder immediately before Uncategorised (always last) - the
  // one exception to "insert before the drop target" when reordering
  // folders, same shape as js/modules/tracksEditor.js's own drag-reorder.
  const lastNamedFolder = groupEntries.length > 1 ? groupEntries[groupEntries.length - 2][0] : null;
  for (const [folderName, folderItems] of groupEntries) {
    allGroupNames.push(folderName);
    const isCollapsed = collapsed.has(folderName);

    const header = document.createElement('li');
    header.className = 'sidebar-folder-header';
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.setAttribute('aria-expanded', String(!isCollapsed));

    const chevron = document.createElement('span');
    chevron.className = 'sidebar-folder-chevron' + (isCollapsed ? ' collapsed' : '');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾'; // ▾, rotated via CSS to ▸ when collapsed
    header.appendChild(chevron);

    const name = document.createElement('span');
    name.className = 'sidebar-folder-name';
    name.textContent = folderName;
    header.appendChild(name);

    const count = document.createElement('span');
    count.className = 'sidebar-folder-count';
    count.textContent = String(folderItems.length);
    header.appendChild(count);

    const toggle = () => {
      if (collapsed.has(folderName)) collapsed.delete(folderName);
      else collapsed.add(folderName);
      persistFolderMeta(folderMeta);
      renderSidebarList(...lastRenderArgs.get(opts.listElId));
    };
    header.onclick = toggle;
    header.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };

    // Folders reorder among themselves via drag (Uncategorised is pinned
    // last, never draggable/a reorder target - it isn't a real stored
    // folder). Separate from an ITEM dragged onto a header (moves it into
    // that folder, handled below) - the two use different dataTransfer
    // types so dragover can tell which is in flight before drop (only
    // `.types` is readable mid-drag, not the actual payload).
    if (opts.onRenameFolder && folderName !== UNCATEGORISED) {
      header.draggable = true;
      header.ondragstart = (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-folder-name', folderName);
        header.classList.add('dragging');
      };
      header.ondragend = () => header.classList.remove('dragging');
    }

    if (opts.onMoveToFolder) {
      const dropTargetName = folderName === UNCATEGORISED ? null : folderName;
      const isFolderReorderTarget = folderName !== UNCATEGORISED;
      header.ondragover = (e) => {
        e.preventDefault(); // required for ondrop to fire at all
        if (isFolderReorderTarget && e.dataTransfer.types.includes('application/x-folder-name')) {
          list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
          const indicator = document.createElement('li');
          indicator.className = 'drop-indicator';
          if (folderName === lastNamedFolder) header.after(indicator);
          else header.before(indicator);
        } else {
          header.classList.add('drag-over');
        }
      };
      header.ondragleave = () => {
        header.classList.remove('drag-over');
        list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
      };
      header.ondrop = (e) => {
        e.preventDefault();
        header.classList.remove('drag-over');
        list.querySelectorAll('.drop-indicator').forEach((el) => el.remove());
        const draggedFolderName = e.dataTransfer.getData('application/x-folder-name');
        if (isFolderReorderTarget && draggedFolderName && draggedFolderName !== folderName) {
          reorderFolder(folderMeta, draggedFolderName, folderName, folderName === lastNamedFolder);
          renderSidebarList(...lastRenderArgs.get(opts.listElId));
          return;
        }
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) opts.onMoveToFolder(draggedId, dropTargetName);
      };
    }

    if (opts.onRenameFolder) {
      header.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isUncategorised = folderName === UNCATEGORISED;
        openContextMenu(header, [
          {
            label: 'Rename',
            disabled: isUncategorised,
            onClick: () => renameFolder(folderMeta, folderName, opts).then(() => renderSidebarList(...lastRenderArgs.get(opts.listElId))),
          },
          {
            label: 'Delete Folder',
            disabled: isUncategorised,
            danger: true,
            onClick: () => deleteFolder(folderMeta, folderName, opts).then(() => renderSidebarList(...lastRenderArgs.get(opts.listElId))),
          },
        ]);
      };
    }

    list.appendChild(header);

    if (!isCollapsed) {
      folderItems.forEach((entry) => list.appendChild(renderItem(entry, folderItems)));
    }
  }

  // Right-click on empty space below the rendered rows (not bubbled from a
  // row or header - both call stopPropagation() in their own handlers) -
  // "New Folder" here doesn't need to move any item, just register the name
  // so it shows up (empty) right away.
  if (opts.folderMetaType) {
    list.oncontextmenu = (e) => {
      if (e.target !== list) return;
      e.preventDefault();
      const setAllCollapsed = (value) => {
        allGroupNames.forEach((n) => (value ? collapsed.add(n) : collapsed.delete(n)));
        persistFolderMeta(folderMeta);
        renderSidebarList(...lastRenderArgs.get(opts.listElId));
      };
      openContextMenuAtCursor(e, [
        {
          label: 'New Folder…',
          onClick: () => createFolder(folderMeta).then(() => renderSidebarList(...lastRenderArgs.get(opts.listElId))),
        },
        { label: 'Expand All', onClick: () => setAllCollapsed(false) },
        { label: 'Collapse All', onClick: () => setAllCollapsed(true) },
      ]);
    };
  }

  const newBtn = document.getElementById(opts.newBtnId);
  if (newBtn) {
    newBtn.textContent = opts.newBtnLabel;
    if (opts.onDuplicate) {
      // "+ New Reel" -> "New Reel" for the menu item's own label (the "+ "
      // is button-chrome, not part of the action's name).
      const newLabel = opts.newBtnLabel.replace(/^\+\s*/, '');
      newBtn.onclick = () => openContextMenu(newBtn, [
        { label: newLabel, onClick: onNew },
        { label: 'Duplicate Current', disabled: !currentId, onClick: () => opts.onDuplicate(currentId) },
      ]);
    } else {
      newBtn.onclick = onNew;
    }
  }
}
