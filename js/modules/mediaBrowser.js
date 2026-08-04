// mediaBrowser.js - shared media-browsing UI, used both as the full "Media
// Library" tab (mode: 'manage') and inside the builder's file-picker modal
// (mode: 'select'). One component so both places behave identically -
// folders, search, sort, list/grid view - with only the row-click action and
// the visibility of management controls (upload/rename/delete/bulk actions)
// differing by mode.
import { WORKER_BASE_URL, R2_PUBLIC_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

const ICONS = {
  FOLDER: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
  </svg>`,
  AUDIO: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
  </svg>`,
  IMAGE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>`,
  VIDEO: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>`,
  FILE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>`
};

const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a', 'alac'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

function extOf(name) {
  return name.split('.').pop().toLowerCase();
}

function fileType(name) {
  const ext = extOf(name);
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return 'other';
}

function typeIcon(type) {
  if (type === 'audio') return ICONS.AUDIO;
  if (type === 'image') return ICONS.IMAGE;
  if (type === 'video') return ICONS.VIDEO;
  return ICONS.FILE;
}

function baseName(key) {
  return key.split('/').pop();
}

function folderOf(key) {
  const parts = key.split('/');
  parts.pop();
  return parts.length ? parts.join('/') + '/' : '';
}

// The three top-level R2 folders every file-picker context (see
// R2_PREFIX_MAP in filePicker.js) targets by fixed path. Renaming or
// deleting one of these would silently break every picker pointed at it, so
// they - and only they, not arbitrary user-created subfolders within them -
// are protected from those actions. Their whole subtree still gets a
// distinct color so it's visually obvious which top-level category a nested
// folder belongs to.
const PROTECTED_ROOT_FOLDERS = {
  'audio/': '#60a5fa',
  'images/': '#fbbf24',
  'video/': '#a78bfa'
};

function protectedRootOf(path) {
  return Object.keys(PROTECTED_ROOT_FOLDERS).find(root => path === root || path.startsWith(root)) || null;
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function authHeaders(password) {
  return { "Authorization": `Bearer ${password}` };
}

async function fetchAllR2Files(password) {
  const response = await fetch(`${WORKER_BASE_URL}/media/list?prefix=&flat=1`, {
    headers: authHeaders(password)
  });
  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to load media (status ${response.status}).`);
  }
  const { files } = await response.json();
  return files.map(f => ({
    key: f.key,
    name: baseName(f.key),
    size: f.size,
    uploaded: f.uploaded,
    trackNumber: f.trackNumber || null,
    readOnly: false,
    url: `${R2_PUBLIC_URL}/${f.key}`
  }));
}

async function uploadFile(folder, file, password) {
  const key = `${folder}${file.name}`;
  const response = await fetch(`${WORKER_BASE_URL}/media/upload?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { ...authHeaders(password), "Content-Type": file.type || "application/octet-stream" },
    body: file
  });
  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to upload ${file.name} (status ${response.status}).`);
  }
}

async function renameFile(from, to, password) {
  const response = await fetch(`${WORKER_BASE_URL}/media/rename`, {
    method: "POST",
    headers: { ...authHeaders(password), "Content-Type": "application/json" },
    body: JSON.stringify({ from, to })
  });
  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to rename file (status ${response.status}).`);
  }
}

async function deleteFile(key, password) {
  const response = await fetch(`${WORKER_BASE_URL}/media/delete?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: authHeaders(password)
  });
  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to delete file (status ${response.status}).`);
  }
}

// Every ancestor folder path implied by a set of files, e.g. "a/b/c.mp3"
// contributes "a/" and "a/b/". Used to build the sidebar list.
function computeFolders(files) {
  const set = new Set();
  files.forEach(f => {
    const parts = f.key.split('/');
    parts.pop();
    let path = '';
    parts.forEach(part => {
      path += `${part}/`;
      set.add(path);
    });
  });
  return Array.from(set).sort();
}

function countsFor(files, folder) {
  let scoped;
  if (folder === null) {
    scoped = files; // "All Media"
  } else if (folder === '') {
    scoped = files.filter(f => folderOf(f.key) === ''); // "Unfiled" - root files only, not recursive
  } else {
    scoped = files.filter(f => f.key.startsWith(folder)); // named folder - recursive rollup
  }
  const counts = { audio: 0, video: 0, image: 0, other: 0 };
  scoped.forEach(f => { counts[fileType(f.name)]++; });
  return { total: scoped.length, ...counts };
}

// Small anchored dropdown menu (Copy URL / Rename / Delete, etc.), positioned
// next to whatever button opened it, instead of a full-screen dialog. Only
// one instance is ever open at a time.
let openMenuCleanup = null;

function closeContextMenu() {
  if (openMenuCleanup) {
    openMenuCleanup();
    openMenuCleanup = null;
  }
}

function openContextMenu(anchorEl, items) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "media-browser-context-menu";
  items.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    btn.className = item.danger ? "danger" : "";
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

function promptForText(message, defaultValue = "") {
  return new Promise((resolve) => {
    dialog.createDialog({
      type: "custom",
      message,
      content: `<input type="text" id="mediaBrowserPromptInput" value="${String(defaultValue).replace(/"/g, "&quot;")}"
        style="width:100%;padding:0.6em;border:1px solid #444;border-radius:4px;font-size:0.95rem;box-sizing:border-box;background:#1e1e1e;color:#fff;" />`,
      buttons: [
        { text: "Cancel", type: "secondary", onClick: () => { dialog.closeDialog(); resolve(null); } },
        {
          text: "OK",
          type: "primary",
          onClick: () => {
            const input = document.getElementById("mediaBrowserPromptInput");
            const value = input ? input.value.trim() : "";
            dialog.closeDialog();
            resolve(value || null);
          }
        }
      ]
    });
    setTimeout(() => {
      const input = document.getElementById("mediaBrowserPromptInput");
      if (input) { input.focus(); input.select(); }
    }, 150);
  });
}

/**
 * Renders the shared media browser into `container`.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {'manage'|'select'} options.mode - 'manage' shows upload/rename/delete/bulk actions; 'select' hides them and makes rows clickable to choose.
 * @param {string[]|null} options.extensions - filter, e.g. ['.mp3', '.wav'] (matched case-insensitively against the filename)
 * @param {string} options.startFolder - fallback folder to open if there's no remembered folder for this context, e.g. 'audio/'
 * @param {string} options.contextKey - identifies *which* select-mode picker this is (e.g. 'assets/audio') so each
 *   one remembers its own last-visited folder independently. Ignored in 'manage' mode, which has a single shared memory.
 * @param {Function} options.onSelect - (url) => void, called in 'select' mode when a row is clicked
 */
export async function renderMediaBrowser(container, options = {}) {
  const {
    mode = 'manage',
    extensions = null,
    startFolder = '',
    contextKey = null,
    onSelect = null
  } = options;

  // Remembered state: which folder was last open (per manage-tab / per select
  // context, so e.g. the background-image picker and the audio-track picker
  // don't clobber each other's last folder), and sort/view-mode prefs (shared
  // across all pickers of the same mode - presentation prefs, not "where was I").
  const folderStorageKey = mode === 'manage'
    ? 'mediaBrowser:manage:folder'
    : `mediaBrowser:select:${contextKey || 'default'}:folder`;
  const prefsStorageKey = mode === 'manage'
    ? 'mediaBrowser:manage:prefs'
    : 'mediaBrowser:select:prefs';

  function loadSavedView() {
    const saved = localStorage.getItem(folderStorageKey);
    if (saved === null) {
      return startFolder ? { type: 'folder', path: startFolder } : { type: 'folder', path: '' };
    }
    try {
      const parsed = JSON.parse(saved);
      if (parsed && (parsed.type === 'folder' || parsed.type === 'all')) return parsed;
    } catch { /* fall through to default below */ }
    return startFolder ? { type: 'folder', path: startFolder } : { type: 'folder', path: '' };
  }

  const DEFAULT_SIDEBAR_WIDTH = 220;

  function loadSavedPrefs() {
    const saved = localStorage.getItem(prefsStorageKey);
    if (!saved) return { sortField: 'uploaded', sortDir: 'desc', viewMode: 'list', sidebarWidth: DEFAULT_SIDEBAR_WIDTH };
    try {
      const parsed = JSON.parse(saved);
      return {
        sortField: parsed.sortField || 'uploaded',
        sortDir: parsed.sortDir || 'desc',
        viewMode: parsed.viewMode || 'list',
        sidebarWidth: parsed.sidebarWidth || DEFAULT_SIDEBAR_WIDTH
      };
    } catch {
      return { sortField: 'uploaded', sortDir: 'desc', viewMode: 'list', sidebarWidth: DEFAULT_SIDEBAR_WIDTH };
    }
  }

  const savedPrefs = loadSavedPrefs();

  const state = {
    view: loadSavedView(),
    search: '',
    sortField: savedPrefs.sortField,
    sortDir: savedPrefs.sortDir,
    viewMode: savedPrefs.viewMode,
    sidebarWidth: savedPrefs.sidebarWidth,
    selected: new Set(),
    files: [],
    password: null,
    expandedFolders: new Set()
  };

  // Make sure every ancestor of a folder is expanded, so a deep folder (e.g.
  // restored from memory, or navigated to via rename) is actually visible in
  // the sidebar rather than hidden under a collapsed parent.
  function expandAncestors(path) {
    let current = folderOf(path.slice(0, -1));
    while (current) {
      state.expandedFolders.add(current);
      current = folderOf(current.slice(0, -1));
    }
  }
  if (state.view.type === 'folder' && state.view.path) {
    expandAncestors(state.view.path);
  }

  function persistFolder() {
    localStorage.setItem(folderStorageKey, JSON.stringify(state.view));
  }

  function persistPrefs() {
    localStorage.setItem(prefsStorageKey, JSON.stringify({
      sortField: state.sortField,
      sortDir: state.sortDir,
      viewMode: state.viewMode,
      sidebarWidth: state.sidebarWidth
    }));
  }

  // Single entry point for "switch the main view to this folder" - always
  // expands its ancestor chain too, so the newly-active folder is never left
  // hidden under a collapsed parent in the sidebar, regardless of which UI
  // triggered the navigation (sidebar row, empty-state subfolder chip, etc).
  function navigateToFolder(path) {
    state.view = { type: 'folder', path };
    expandAncestors(path);
    persistFolder();
    render();
  }

  const password = await getBuilderPassword();
  if (!password) {
    container.innerHTML = '<p style="color:#888;">A password is required to use the Media Library.</p>';
    return;
  }
  state.password = password;

  container.innerHTML = '<p style="color:#888;">Loading...</p>';

  let r2Files;
  try {
    r2Files = await fetchAllR2Files(password);
  } catch (error) {
    container.innerHTML = `<p style="color:#e66;">${error.message}</p>`;
    return;
  }

  const applyExtFilter = (files) => extensions
    ? files.filter(f => extensions.some(ext => f.name.toLowerCase().endsWith(ext)))
    : files;

  state.files = applyExtFilter(r2Files);

  render();

  function visibleFiles() {
    let list;
    if (state.view.type === 'all') {
      list = state.files;
    } else if (state.view.type === 'folder') {
      list = state.files.filter(f => folderOf(f.key) === state.view.path);
    } else {
      list = state.files;
    }
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    const dir = state.sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (state.sortField === 'name') return dir * a.name.localeCompare(b.name);
      if (state.sortField === 'size') return dir * ((a.size || 0) - (b.size || 0));
      return dir * (new Date(a.uploaded || 0) - new Date(b.uploaded || 0));
    });
    return list;
  }

  function subfoldersOf(path) {
    const all = computeFolders(state.files);
    return all.filter(f => folderOf(f.slice(0, -1)) === path && f !== path);
  }

  // A folder is only actually visible in the sidebar if every ancestor above
  // it is expanded too - not just its immediate parent - so collapsing a
  // folder hides its whole subtree, not just its direct children.
  function isFolderVisible(path) {
    const depth = path.split('/').filter(Boolean).length - 1;
    if (depth === 0) return true;
    const parent = folderOf(path.slice(0, -1));
    return state.expandedFolders.has(parent) && isFolderVisible(parent);
  }

  async function refresh() {
    try {
      r2Files = await fetchAllR2Files(state.password);
    } catch (error) {
      dialog.alert(error.message);
      return;
    }
    state.files = applyExtFilter(r2Files);
    state.selected.clear();
    render();
  }

  function render() {
    container.innerHTML = "";
    container.appendChild(renderToolbar());
    const body = document.createElement("div");
    body.className = "media-browser-body";
    body.appendChild(renderSidebar());
    body.appendChild(renderResizeHandle());
    body.appendChild(renderMain());
    container.appendChild(body);
  }

  // Drag-resizes the sidebar by writing directly to its inline width during
  // the drag (avoiding a full re-render per pointermove) and only persisting
  // once, on release.
  function renderResizeHandle() {
    const handle = document.createElement("div");
    handle.className = "media-browser-resize-handle";

    const MIN_WIDTH = 140;
    const MAX_WIDTH = 480;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const sidebar = container.querySelector(".media-browser-sidebar");
      if (!sidebar) return;
      const startX = e.clientX;
      const startWidth = sidebar.getBoundingClientRect().width;
      handle.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);

      function onMove(moveEvent) {
        const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
        sidebar.style.width = `${width}px`;
        state.sidebarWidth = width;
      }
      function onUp() {
        handle.classList.remove("dragging");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        persistPrefs();
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });

    return handle;
  }

  function renderToolbar() {
    const bar = document.createElement("div");
    bar.className = "media-browser-toolbar";

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search...";
    search.className = "media-browser-search";
    search.value = state.search;
    search.oninput = () => { state.search = search.value; renderMainOnly(); };
    bar.appendChild(search);

    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.textContent = "List";
    listBtn.className = `media-browser-view-btn${state.viewMode === 'list' ? ' active' : ''}`;
    listBtn.onclick = () => { state.viewMode = 'list'; persistPrefs(); render(); };

    const gridBtn = document.createElement("button");
    gridBtn.type = "button";
    gridBtn.textContent = "Grid";
    gridBtn.className = `media-browser-view-btn${state.viewMode === 'grid' ? ' active' : ''}`;
    gridBtn.onclick = () => { state.viewMode = 'grid'; persistPrefs(); render(); };

    bar.append(listBtn, gridBtn);
    return bar;
  }

  function renderSidebar() {
    const sidebar = document.createElement("div");
    sidebar.className = "media-browser-sidebar";
    sidebar.style.width = `${state.sidebarWidth}px`;

    const unfiledRow = folderNavItem("Unfiled", () => navigateToFolder(''),
      state.view.type === 'folder' && state.view.path === '', countsFor(state.files, ''));
    sidebar.appendChild(unfiledRow);

    if (mode === 'manage') {
      const newFolderBtn = document.createElement("button");
      newFolderBtn.type = "button";
      newFolderBtn.textContent = "+ New Folder";
      newFolderBtn.className = "media-browser-new-folder-btn";
      newFolderBtn.onclick = async () => {
        const name = await promptForText("New folder name (e.g. backgrounds/nature)");
        if (!name) return;
        const path = name.replace(/^\/+|\/+$/g, '') + '/';
        navigateToFolder(path);
      };
      sidebar.appendChild(newFolderBtn);
    }

    // Render every known folder path with indentation by depth. Only a
    // folder's immediate children are shown, and only once it's expanded -
    // deeper descendants stay hidden until each level in between is opened.
    const allFolders = computeFolders(state.files);
    allFolders.forEach(path => {
      const depth = path.split('/').filter(Boolean).length - 1;
      if (!isFolderVisible(path)) return;

      const label = path.split('/').filter(Boolean).pop();
      const hasChildren = subfoldersOf(path).length > 0;
      const isExpanded = state.expandedFolders.has(path);
      const row = folderNavItem(label, () => navigateToFolder(path),
        state.view.type === 'folder' && state.view.path === path, countsFor(state.files, path), depth, path,
        hasChildren, isExpanded, () => {
          if (isExpanded) state.expandedFolders.delete(path);
          else state.expandedFolders.add(path);
          renderSidebarOnly();
        });
      sidebar.appendChild(row);
    });

    const allMediaRow = folderNavItem("All Media", () => { state.view = { type: 'all' }; persistFolder(); render(); },
      state.view.type === 'all', countsFor(state.files, null));
    allMediaRow.style.marginTop = "0.75rem";
    allMediaRow.style.borderTop = "1px solid #444";
    allMediaRow.style.paddingTop = "0.75rem";
    sidebar.appendChild(allMediaRow);

    return sidebar;
  }

  function folderNavItem(label, onClick, isActive, counts, depth = 0, path = null,
    hasChildren = false, isExpanded = false, onToggleExpand = null) {
    const row = document.createElement("div");
    row.className = `media-browser-folder-row${isActive ? ' active' : ''}`;
    row.style.paddingLeft = `${0.75 + depth * 1}rem`;

    const labelDiv = document.createElement("div");
    labelDiv.className = "media-browser-folder-label";

    if (hasChildren && onToggleExpand) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "media-browser-folder-toggle";
      toggle.textContent = isExpanded ? "▼" : "▶";
      toggle.setAttribute("aria-label", isExpanded ? "Collapse folder" : "Expand folder");
      toggle.onclick = (e) => { e.stopPropagation(); onToggleExpand(); };
      labelDiv.appendChild(toggle);
    } else if (path) {
      // Keep icon/text aligned with sibling rows that do have a toggle.
      const spacer = document.createElement("span");
      spacer.className = "media-browser-folder-toggle-spacer";
      labelDiv.appendChild(spacer);
    }

    labelDiv.insertAdjacentHTML("beforeend", `${ICONS.FOLDER}<span>${label}</span>`);
    const protectedRoot = path ? protectedRootOf(path) : null;
    if (protectedRoot && !isActive) {
      // Skip the category color on the active row - it'd fight the active
      // row's own white-icon-on-blue-background treatment for contrast.
      labelDiv.querySelector("svg").style.color = PROTECTED_ROOT_FOLDERS[protectedRoot];
    }
    row.appendChild(labelDiv);

    const countsDiv = document.createElement("div");
    countsDiv.className = "media-browser-folder-counts";
    countsDiv.textContent = counts.total;
    row.appendChild(countsDiv);

    // Only real, named folders (not the special "Unfiled"/"All Media" rows,
    // and not the protected audio/images/video roots every file-picker
    // targets by fixed path) get rename/delete actions, and only in manage mode.
    if (mode === 'manage' && path && !PROTECTED_ROOT_FOLDERS[path]) {
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.textContent = "⋮";
      menuBtn.className = "media-browser-folder-menu-btn";
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        showFolderMenu(path, menuBtn);
      };
      row.appendChild(menuBtn);
    }

    row.onclick = onClick;
    return row;
  }

  function showFolderMenu(path, anchorEl) {
    if (PROTECTED_ROOT_FOLDERS[path]) return; // belt-and-suspenders; the menu button itself is already omitted for these
    const currentName = path.split('/').filter(Boolean).pop();
    const parentPath = folderOf(path.slice(0, -1));

    openContextMenu(anchorEl, [
      {
        label: "Rename",
        onClick: async () => {
          const newName = await promptForText("Rename folder", currentName);
          if (!newName || newName === currentName) return;
          const newPrefix = `${parentPath}${newName}/`;
          const filesToMove = state.files.filter(f => f.key.startsWith(path));
          try {
            for (const f of filesToMove) {
              const newKey = `${newPrefix}${f.key.slice(path.length)}`;
              await renameFile(f.key, newKey, state.password);
            }
            if (state.view.type === 'folder' && state.view.path.startsWith(path)) {
              state.view = { type: 'folder', path: newPrefix + state.view.path.slice(path.length) };
              expandAncestors(state.view.path);
              persistFolder();
            }
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
            await refresh();
          }
        }
      },
      {
        label: "Delete",
        danger: true,
        onClick: async () => {
          const filesToDelete = state.files.filter(f => f.key.startsWith(path));
          const confirmed = await dialog.confirm(
            `Delete folder "${path}" and all ${filesToDelete.length} file(s) inside it? This cannot be undone.`,
            "Delete", "Cancel"
          );
          if (!confirmed) return;
          try {
            for (const f of filesToDelete) {
              await deleteFile(f.key, state.password);
            }
            if (state.view.type === 'folder' && state.view.path.startsWith(path)) {
              state.view = { type: 'folder', path: '' };
              persistFolder();
            }
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
            await refresh();
          }
        }
      }
    ]);
  }

  function renderMain() {
    const main = document.createElement("div");
    main.className = "media-browser-main";
    main.appendChild(renderUploadZone());

    const files = visibleFiles();

    if (mode === 'manage' && state.selected.size > 0) {
      main.classList.add("has-bulk-bar");
      main.appendChild(renderBulkBar());
    }

    if (files.length === 0) {
      main.appendChild(renderEmptyState());
      return main;
    }

    main.appendChild(state.viewMode === 'list' ? renderTable(files) : renderGrid(files));
    return main;
  }

  // Folder selection only ever shows files sitting directly in that folder
  // (sidebar counts, by contrast, roll up everything nested underneath) - so
  // a folder that's non-empty in the sidebar can still land here with zero
  // direct files. Rather than a bare "No files here." that looks like a bug,
  // point at the actual subfolders so there's somewhere to go.
  function renderEmptyState() {
    const wrap = document.createElement("div");

    const message = document.createElement("p");
    message.className = "builder-empty-state";
    message.style.margin = "0 0 0.5rem";

    const subfolders = state.view.type === 'folder' && state.view.path
      ? subfoldersOf(state.view.path)
      : [];

    if (subfolders.length === 0) {
      message.textContent = "No files here.";
      wrap.appendChild(message);
      return wrap;
    }

    message.textContent = "No files directly in this folder. Contains:";
    wrap.appendChild(message);

    const list = document.createElement("div");
    list.className = "media-browser-empty-subfolders";
    subfolders.forEach(path => {
      const label = path.split('/').filter(Boolean).pop();
      const link = document.createElement("button");
      link.type = "button";
      link.className = "media-browser-empty-subfolder-link";
      link.textContent = `${label}/`;
      link.onclick = () => navigateToFolder(path);
      list.appendChild(link);
    });
    wrap.appendChild(list);

    return wrap;
  }

  function renderMainOnly() {
    const body = container.querySelector(".media-browser-body");
    if (!body) return render();
    const oldMain = body.querySelector(".media-browser-main");
    const newMain = renderMain();
    body.replaceChild(newMain, oldMain);
  }

  function renderSidebarOnly() {
    const body = container.querySelector(".media-browser-body");
    if (!body) return render();
    const oldSidebar = body.querySelector(".media-browser-sidebar");
    const newSidebar = renderSidebar();
    body.replaceChild(newSidebar, oldSidebar);
  }

  function renderUploadZone() {
    const zone = document.createElement("div");
    zone.className = "media-browser-upload-zone";
    zone.textContent = "Drag files here, or ";

    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "click to upload";
    zone.appendChild(link);

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";

    const targetFolder = state.view.type === 'folder' ? state.view.path : '';

    const handleFiles = async (fileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      zone.textContent = `Uploading ${files.length} file(s)...`;
      try {
        for (const file of files) {
          await uploadFile(targetFolder, file, state.password);
        }
        await refresh();
      } catch (error) {
        dialog.alert(error.message);
        await refresh();
      }
    };

    link.onclick = (e) => { e.preventDefault(); input.click(); };
    input.onchange = () => handleFiles(input.files);
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });

    zone.appendChild(input);
    return zone;
  }

  function renderBulkBar() {
    const bar = document.createElement("div");
    bar.className = "media-browser-bulk-bar";
    bar.textContent = `${state.selected.size} selected  `;

    const moveBtn = document.createElement("button");
    moveBtn.type = "button";
    moveBtn.textContent = "Move to folder...";
    moveBtn.onclick = async () => {
      const dest = await promptForText("Move selected files to folder (e.g. backgrounds/nature):");
      if (dest === null) return;
      const folder = dest ? dest.replace(/^\/+|\/+$/g, '') + '/' : '';
      try {
        for (const key of state.selected) {
          const file = state.files.find(f => f.key === key);
          if (!file || file.readOnly) continue;
          await renameFile(key, `${folder}${file.name}`, state.password);
        }
        await refresh();
      } catch (error) {
        dialog.alert(error.message);
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete Selected";
    deleteBtn.className = "media-browser-delete-btn";
    deleteBtn.onclick = async () => {
      const confirmed = await dialog.confirm(`Delete ${state.selected.size} file(s)? This cannot be undone.`, "Delete", "Cancel");
      if (!confirmed) return;
      try {
        for (const key of state.selected) {
          const file = state.files.find(f => f.key === key);
          if (!file || file.readOnly) continue;
          await deleteFile(key, state.password);
        }
        await refresh();
      } catch (error) {
        dialog.alert(error.message);
      }
    };

    bar.append(moveBtn, deleteBtn);
    return bar;
  }

  function sortHeader(label, field) {
    const th = document.createElement("th");
    const arrow = state.sortField === field ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    th.textContent = label + arrow;
    th.className = "media-browser-sortable";
    th.onclick = () => {
      if (state.sortField === field) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDir = 'asc';
      }
      persistPrefs();
      renderMainOnly();
    };
    return th;
  }

  function renderTable(files) {
    const table = document.createElement("table");
    table.className = "media-browser-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    if (mode === 'manage') {
      const th = document.createElement("th");
      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      selectAll.checked = files.length > 0 && files.every(f => state.selected.has(f.key));
      selectAll.onchange = () => {
        if (selectAll.checked) files.forEach(f => { if (!f.readOnly) state.selected.add(f.key); });
        else files.forEach(f => state.selected.delete(f.key));
        renderMainOnly();
      };
      th.appendChild(selectAll);
      headRow.appendChild(th);
    }
    headRow.appendChild(document.createElement("th"));
    headRow.appendChild(sortHeader("Name", "name"));
    const typeTh = document.createElement("th");
    typeTh.textContent = "Type";
    headRow.appendChild(typeTh);
    const trackTh = document.createElement("th");
    trackTh.textContent = "Track #";
    headRow.appendChild(trackTh);
    headRow.appendChild(sortHeader("Size", "size"));
    headRow.appendChild(sortHeader("Uploaded", "uploaded"));
    if (mode === 'manage') headRow.appendChild(document.createElement("th"));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    files.forEach(file => tbody.appendChild(renderRow(file)));
    table.appendChild(tbody);

    return table;
  }

  function renderRow(file) {
    const type = fileType(file.name);
    const row = document.createElement("tr");
    row.className = "media-browser-row";

    if (mode === 'manage') {
      const cb = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = file.readOnly;
      checkbox.checked = state.selected.has(file.key);
      checkbox.onchange = () => {
        if (checkbox.checked) state.selected.add(file.key);
        else state.selected.delete(file.key);
        renderMainOnly();
      };
      cb.appendChild(checkbox);
      row.appendChild(cb);
    }

    const iconTd = document.createElement("td");
    iconTd.className = `media-browser-icon media-browser-icon-${type}`;
    iconTd.innerHTML = typeIcon(type);
    row.appendChild(iconTd);

    const nameTd = document.createElement("td");
    const link = document.createElement("a");
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = file.name;
    link.onclick = (e) => {
      if (mode === 'select' && onSelect) {
        e.preventDefault();
        onSelect(file.url);
      }
    };
    nameTd.appendChild(link);
    if (file.readOnly) {
      const badge = document.createElement("span");
      badge.textContent = " (test asset)";
      badge.style.cssText = "color:#888;font-size:0.8em;";
      nameTd.appendChild(badge);
    }
    row.appendChild(nameTd);

    const typeTd = document.createElement("td");
    typeTd.textContent = type;
    row.appendChild(typeTd);

    const trackTd = document.createElement("td");
    trackTd.textContent = file.trackNumber || "—";
    row.appendChild(trackTd);

    const sizeTd = document.createElement("td");
    sizeTd.textContent = formatBytes(file.size);
    row.appendChild(sizeTd);

    const uploadedTd = document.createElement("td");
    uploadedTd.textContent = file.uploaded ? new Date(file.uploaded).toLocaleDateString() : "—";
    row.appendChild(uploadedTd);

    if (mode === 'manage') {
      const actionsTd = document.createElement("td");
      if (!file.readOnly) {
        const menuBtn = document.createElement("button");
        menuBtn.type = "button";
        menuBtn.textContent = "⋮";
        menuBtn.className = "media-browser-row-menu-btn";
        menuBtn.onclick = () => showRowMenu(file, menuBtn);
        actionsTd.appendChild(menuBtn);
      }
      row.appendChild(actionsTd);
    }

    return row;
  }

  function showRowMenu(file, anchorEl) {
    openContextMenu(anchorEl, [
      {
        label: "Copy URL",
        onClick: async () => {
          try { await navigator.clipboard.writeText(file.url); } catch { /* ignore */ }
        }
      },
      {
        label: "Rename",
        onClick: async () => {
          const newName = await promptForText("Rename file", file.name);
          if (!newName || newName === file.name) return;
          try {
            await renameFile(file.key, `${folderOf(file.key)}${newName}`, state.password);
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
          }
        }
      },
      {
        label: "Delete",
        danger: true,
        onClick: async () => {
          const confirmed = await dialog.confirm(`Delete "${file.name}"? This cannot be undone.`, "Delete", "Cancel");
          if (!confirmed) return;
          try {
            await deleteFile(file.key, state.password);
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
          }
        }
      }
    ]);
  }

  function renderGrid(files) {
    const grid = document.createElement("div");
    grid.className = "media-browser-grid";

    files.forEach(file => {
      const type = fileType(file.name);
      const card = document.createElement("div");
      card.className = "media-browser-card";

      const preview = document.createElement("div");
      preview.className = "media-browser-card-preview";
      if (type === 'image') {
        preview.innerHTML = `<img src="${file.url}" alt="${file.name}" loading="lazy" />`;
      } else {
        preview.classList.add(`media-browser-icon-${type}`);
        preview.innerHTML = typeIcon(type);
      }
      card.appendChild(preview);

      const name = document.createElement("div");
      name.className = "media-browser-card-name";
      name.textContent = file.name;
      card.appendChild(name);

      card.onclick = () => {
        if (mode === 'select' && onSelect) {
          onSelect(file.url);
        } else {
          window.open(file.url, '_blank', 'noopener');
        }
      };

      grid.appendChild(card);
    });

    return grid;
  }
}
