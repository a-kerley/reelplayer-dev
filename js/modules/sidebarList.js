// sidebarList.js - Generic sortable, delete-capable sidebar list, shared by
// js/sidebar.js (Reels) and js/pagesSidebar.js (Pages). Both lists are
// structurally identical - sort by createdAt desc, render an <li> per entry
// with a title (click = select) and a delete button, wire up a "+ New"
// button - only the container id, "untitled" placeholder, and "+ New"
// button id/label differ, so those are the only things callers pass in.
import { dialog } from './dialogSystem.js';

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
 */
export function renderSidebarList(opts, items, currentId, onSelect, onNew, onDelete, renderSubtitle) {
  const list = document.getElementById(opts.listElId);
  if (!list) return;
  list.innerHTML = '';

  // Sort by most recent (descending createdAt), fallback to 0. Same
  // de-dupe-by-id-then-sort shape as the original renderSidebar() - kept in
  // case a caller ever passes duplicate-id entries mid-transition.
  const sortedItems = Object.entries(
    items.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {})
  ).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  sortedItems.forEach(([id, item]) => {
    const li = document.createElement('li');
    li.className = item.id === currentId ? 'active' : '';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = item.title || opts.emptyTitlePlaceholder;
    titleSpan.onclick = () => onSelect(item.id);
    li.appendChild(titleSpan);

    if (renderSubtitle) {
      const subtitleSpan = document.createElement('span');
      subtitleSpan.className = 'sidebar-item-subtitle';
      subtitleSpan.textContent = renderSubtitle(item);
      subtitleSpan.onclick = () => onSelect(item.id);
      li.appendChild(subtitleSpan);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-reel-btn';
    delBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;">
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

    li.appendChild(delBtn);
    list.appendChild(li);
  });

  const newBtn = document.getElementById(opts.newBtnId);
  if (newBtn) {
    newBtn.textContent = opts.newBtnLabel;
    newBtn.onclick = onNew;
  }
}
