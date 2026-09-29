// mediaBrowser.js - shared media-browsing UI, used both as the full "Media
// Library" tab (mode: 'manage') and inside the builder's file-picker modal
// (mode: 'select'). One component so both places behave identically -
// folders, search, sort, list/grid view - with only the row-click action and
// the visibility of management controls (upload/rename/delete/bulk actions)
// differing by mode.
import { R2_PUBLIC_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { apiFetch } from "./builderAuth.js";
import { openContextMenuAtCursor } from "./contextMenu.js";

const ICONS = {
  FOLDER: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
  </svg>`,
  AUDIO: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
  </svg>`,
  IMAGE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>`,
  VIDEO: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>`,
  PLAY: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
  </svg>`,
  STOP: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
  </svg>`,
  MORE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
  </svg>`,
  FILE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
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

// "song.mp3" -> "song (2).mp3", "song (3).mp3", ... - first one not in
// `takenKeys` within `folder`.
function uniqueFileName(folder, name, takenKeys) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; takenKeys.has(`${folder}${candidate}`); n++) candidate = `${stem} (${n})${ext}`;
  return candidate;
}

// R2 has no real concept of a folder - one only shows up in the sidebar
// because some file's key happens to start with that prefix (see
// computeFolders()). A brand-new folder with nothing in it yet has no key
// to derive from, so it isn't actually persisted anywhere - it'd vanish
// the instant you navigated away. Uploading this invisible zero-byte
// marker object as the folder's first "file" (see createFolder()) is what
// makes it stick; isFolderMarker() filters it back out of every visible
// list/count so it never shows up as a real file to the user.
const FOLDER_MARKER_NAME = ".folder";
function isFolderMarker(f) {
  return baseName(f.key) === FOLDER_MARKER_NAME;
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

// Cloudflare R2's free tier: 10GB of storage before paid usage kicks in.
// Purely informational - the Worker enforces nothing client-side, this is
// just so the Media Library tab can show how close the account is to it.
const FREE_TIER_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

function formatGB(bytes) {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchAllR2Files() {
  const response = await apiFetch("/media/list?prefix=&flat=1");
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

// The Worker refuses to overwrite an existing key unless `overwrite` is set
// - see renderUploadZone()'s Replace/Keep both prompt.
// Cloudflare rejects request bodies over ~100MB (413), so bigger files go up
// as fixed-size parts via the Worker's multipart routes. R2 requires every
// part but the last to be the same size (and >= 5MiB).
const SINGLE_UPLOAD_MAX = 90 * 1024 * 1024;
const UPLOAD_PART_SIZE = 50 * 1024 * 1024;

async function uploadFile(folder, file, name = file.name, overwrite = false) {
  const key = `${folder}${name}`;
  const contentType = file.type || "application/octet-stream";
  const fail = (response) => {
    if (response.status === 409) throw new Error(`"${name}" already exists in this folder.`);
    throw new Error(`Failed to upload ${file.name} (status ${response.status}).`);
  };

  if (file.size <= SINGLE_UPLOAD_MAX) {
    const response = await apiFetch(`/media/upload?key=${encodeURIComponent(key)}${overwrite ? "&overwrite=1" : ""}`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!response.ok) fail(response);
    return;
  }

  const q = `key=${encodeURIComponent(key)}`;
  const start = await apiFetch(`/media/upload/start?${q}${overwrite ? "&overwrite=1" : ""}`, {
    method: "POST",
    headers: { "Content-Type": contentType }
  });
  if (!start.ok) fail(start);
  const { uploadId } = await start.json();
  const uq = `${q}&uploadId=${encodeURIComponent(uploadId)}`;

  try {
    const parts = [];
    for (let offset = 0, n = 1; offset < file.size; offset += UPLOAD_PART_SIZE, n++) {
      const response = await apiFetch(`/media/upload/part?${uq}&n=${n}`, {
        method: "POST",
        body: file.slice(offset, offset + UPLOAD_PART_SIZE)
      });
      if (!response.ok) fail(response);
      parts.push(await response.json());
    }
    const done = await apiFetch(`/media/upload/complete?${uq}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts })
    });
    if (!done.ok) fail(done);
  } catch (err) {
    await apiFetch(`/media/upload/abort?${uq}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

async function renameFile(from, to) {
  const response = await apiFetch("/media/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to })
  });
  if (response.status === 409) {
    throw new Error(`"${baseName(to)}" already exists in that folder.`);
  }
  if (!response.ok) {
    throw new Error(`Failed to rename file (status ${response.status}).`);
  }
}

// Read-only preview of what POST /media/rename would rewrite - see
// worker/src/index.js's findMediaReferences(). Used to warn before a
// rename/move that a file is actually in use, not to perform the rewrite
// itself (the Worker does that unconditionally as part of the rename call).
async function fetchMediaUsages(key) {
  const response = await apiFetch(`/media/usages?key=${encodeURIComponent(key)}`);
  if (!response.ok) {
    throw new Error(`Failed to check file usages (status ${response.status}).`);
  }
  const { matches } = await response.json();
  return matches;
}

async function deleteFile(key) {
  const response = await apiFetch(`/media/delete?key=${encodeURIComponent(key)}`, { method: "DELETE" });
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
  scoped = scoped.filter(f => !isFolderMarker(f));
  const counts = { audio: 0, video: 0, image: 0, other: 0 };
  scoped.forEach(f => { counts[fileType(f.name)]++; });
  return { total: scoped.length, ...counts };
}

// Thin alias over dialog.prompt() - kept so every call site in this file
// doesn't need touching now that the actual prompt UI lives in
// dialogSystem.js (js/modules/pageBlocksEditor.js's block-preset save flow
// uses dialog.prompt() directly instead of importing this).
function promptForText(message, defaultValue = "") {
  return dialog.prompt(message, defaultValue);
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
 * @param {boolean} options.multiple - 'select' mode only: shows checkboxes instead of picking-and-
 *   closing on a single row click - see onSelectMultiple/onSelectionChange.
 * @param {Function} options.onSelectMultiple - (urls[]) => void, called in 'select' mode with `multiple`
 *   when the caller's own confirm action (from onSelectionChange) fires - urls are in the picker's own
 *   current display order (whatever sort is active), not checkbox-click order.
 * @param {Function} options.onSelectionChange - 'select' mode with `multiple` only: (count, confirmFn) => void,
 *   called every time the checked count changes, so the caller can drive its own UI (e.g. a modal's
 *   footer button switching from "Cancel" to "Add N Selected") instead of this component showing its
 *   own confirm bar. confirmFn is null when count is 0, otherwise call it to fire onSelectMultiple.
 */
export async function renderMediaBrowser(container, options = {}) {
  const {
    mode = 'manage',
    extensions = null,
    startFolder = '',
    contextKey = null,
    onSelect = null,
    multiple = false,
    onSelectMultiple = null,
    onSelectionChange = null
  } = options;

  // Checkboxes show in 'manage' mode (bulk move/delete via right-click) and
  // in 'select' mode when the caller opted into multi-pick.
  const showCheckboxes = mode === 'manage' || (mode === 'select' && multiple);

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
    expandedFolders: new Set(),
    editingFolderPath: null
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

  // One shared element for the audio play/stop buttons, so starting one
  // preview stops the previous. Nothing tells this component when it's
  // hidden (tab switch) or removed (picker closed), so it checks on each
  // timeupdate (~4x/s while playing) and stops itself.
  const previewAudio = new Audio();
  let previewKey = null;
  previewAudio.onended = () => stopPreview();
  previewAudio.ontimeupdate = () => {
    if (!container.isConnected || container.offsetParent === null) stopPreview();
  };

  function togglePreview(file) {
    if (previewKey === file.key) return stopPreview();
    previewKey = file.key;
    previewAudio.src = file.url;
    previewAudio.play().catch(() => stopPreview());
    syncPreviewButtons();
  }

  function stopPreview() {
    previewAudio.pause();
    previewKey = null;
    syncPreviewButtons();
  }

  function syncPreviewButtons() {
    container.querySelectorAll(".media-browser-preview-btn").forEach(btn => {
      const playing = btn.dataset.key === previewKey;
      btn.innerHTML = playing ? ICONS.STOP : ICONS.PLAY;
      btn.classList.toggle("playing", playing);
      btn.title = playing ? "Stop preview" : "Play preview";
      btn.setAttribute("aria-label", btn.title);
    });
  }

  function createPreviewButton(file) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "media-browser-preview-btn";
    btn.dataset.key = file.key;
    btn.onclick = (e) => { e.stopPropagation(); togglePreview(file); };
    return btn;
  }

  // Containing block for the busy-overlay spinner (see beginBusy/endBusy
  // below) - set once here rather than in CSS, since this same element is
  // whatever the caller happened to hand in (a tab pane, a modal body).
  container.style.position = "relative";

  container.innerHTML = '<p style="color:#888;">Loading...</p>';

  let r2Files;
  try {
    r2Files = await fetchAllR2Files();
  } catch (error) {
    container.innerHTML = `<p style="color:#e66;">${error.message}</p>`;
    return;
  }

  const applyExtFilter = (files) => extensions
    ? files.filter(f => extensions.some(ext => f.name.toLowerCase().endsWith(ext)))
    : files;

  state.files = applyExtFilter(r2Files);

  render();

  // Shared by visibleFiles() (current folder) and selectedFilesInOrder()
  // (a multi-pick's checked files, which may span folders the user
  // navigated through while checking boxes) - same active sort/direction
  // either way.
  function sortComparator(a, b) {
    const dir = state.sortDir === 'asc' ? 1 : -1;
    if (state.sortField === 'name') return dir * a.name.localeCompare(b.name);
    if (state.sortField === 'type') return dir * fileType(a.name).localeCompare(fileType(b.name));
    if (state.sortField === 'trackNumber') return dir * ((parseInt(a.trackNumber, 10) || 0) - (parseInt(b.trackNumber, 10) || 0));
    if (state.sortField === 'size') return dir * ((a.size || 0) - (b.size || 0));
    return dir * (new Date(a.uploaded || 0) - new Date(b.uploaded || 0));
  }

  // Search spans every folder, not just the open one - a file you're
  // looking for is rarely in whichever folder you happen to be in.
  function isSearching() {
    return state.search.trim() !== '';
  }

  function visibleFiles() {
    let list = state.view.type === 'folder' && !isSearching()
      ? state.files.filter(f => folderOf(f.key) === state.view.path)
      : state.files;
    list = list.filter(f => !isFolderMarker(f));
    if (isSearching()) {
      const q = state.search.trim().toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    return [...list].sort(sortComparator);
  }

  // The multi-pick's checked files, in the picker's own current sort order
  // (not checkbox-click order) - see notifySelectionChange()'s confirmFn.
  function selectedFilesInOrder() {
    return state.files
      .filter(f => state.selected.has(f.key) && !isFolderMarker(f))
      .sort(sortComparator);
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

  // Shows a spinner overlay for the duration of a mutating action (move,
  // rename, delete) - counted rather than a plain boolean so an action that
  // somehow overlaps another (e.g. a stray double-click) doesn't have the
  // first one's completion hide the overlay out from under the second.
  // render() wipes container's children (including the overlay) on its own
  // whenever a mutating action's own refresh() call lands, which is exactly
  // the "stays up until the action is confirmed complete" behavior wanted -
  // endBusy()'s own removal call is then just a no-op cleanup for the
  // error/no-op paths that don't call refresh().
  let busyCount = 0;
  function beginBusy(text = "") {
    busyCount++;
    if (!container.querySelector(".media-browser-busy-overlay")) {
      const overlay = document.createElement("div");
      overlay.className = "media-browser-busy-overlay";
      overlay.innerHTML = '<div class="media-browser-spinner"></div><div class="media-browser-busy-text"></div>';
      container.appendChild(overlay);
    }
    setBusyText(text);
  }
  function setBusyText(text) {
    const el = container.querySelector(".media-browser-busy-text");
    if (el) el.textContent = text;
  }
  function endBusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) container.querySelector(".media-browser-busy-overlay")?.remove();
  }

  async function refresh() {
    try {
      r2Files = await fetchAllR2Files();
    } catch (error) {
      dialog.alert(error.message);
      return;
    }
    state.files = applyExtFilter(r2Files);
    state.selected.clear();
    render();
  }

  // Uploads FOLDER_MARKER_NAME as `path`'s first object, so the folder
  // actually persists in R2 instead of just existing as transient client
  // state that disappears the moment you navigate away (see the comment on
  // isFolderMarker() above). Refetches into state.files but doesn't
  // render() - callers immediately navigate/moveFiles afterward, which
  // renders once with the final result rather than flickering through an
  // intermediate one.
  async function createFolder(path) {
    beginBusy();
    try {
      await uploadFile(path, new File([], FOLDER_MARKER_NAME));
      r2Files = await fetchAllR2Files();
      state.files = applyExtFilter(r2Files);
    } catch (error) {
      dialog.alert(error.message);
    } finally {
      endBusy();
    }
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
    syncPreviewButtons();
    notifySelectionChange();
  }

  // Tells the caller (via onSelectionChange) how many files are checked
  // right now, plus a confirmFn to actually commit that selection - see
  // that option's own doc comment above. Called on every render so the
  // caller's own UI (e.g. a modal footer button) always reflects the
  // current count, without this component needing its own confirm bar.
  function notifySelectionChange() {
    if (!(mode === 'select' && multiple && onSelectionChange)) return;
    const count = state.selected.size;
    onSelectionChange(count, count > 0 ? () => onSelectMultiple(selectedFilesInOrder().map(f => f.url)) : null);
  }

  // Drag-resizes the sidebar by writing directly to its inline width during
  // the drag (avoiding a full re-render per pointermove) and only persisting
  // once, on release.
  function renderResizeHandle() {
    const handle = document.createElement("div");
    handle.className = "media-browser-resize-handle";
    handle.title = "Drag to resize the media sidebar";
    handle.setAttribute("aria-label", "Drag to resize the media sidebar");

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

  function renderStorageUsage() {
    const totalBytes = r2Files
      .filter(f => !isFolderMarker(f))
      .reduce((sum, f) => sum + (f.size || 0), 0);
    const fraction = Math.min(totalBytes / FREE_TIER_STORAGE_LIMIT_BYTES, 1);

    const wrap = document.createElement("div");
    wrap.className = "media-browser-storage";
    wrap.title = `${formatGB(totalBytes)} of ${formatGB(FREE_TIER_STORAGE_LIMIT_BYTES)} used (Cloudflare R2 free tier)`;

    const label = document.createElement("span");
    label.className = "media-browser-storage-label";
    label.textContent = `${formatGB(totalBytes)} / 10 GB`;
    wrap.appendChild(label);

    const track = document.createElement("div");
    track.className = "media-browser-storage-track";
    const fill = document.createElement("div");
    fill.className = "media-browser-storage-fill";
    if (fraction >= 0.9) fill.classList.add("near-limit");
    fill.style.width = `${fraction * 100}%`;
    track.appendChild(fill);
    wrap.appendChild(track);

    return wrap;
  }

  function renderToolbar() {
    const bar = document.createElement("div");
    bar.className = "media-browser-toolbar";

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search all folders...";
    search.className = "media-browser-search";
    search.title = "Search file names across every folder";
    search.setAttribute("aria-label", "Search file names across every folder");
    search.value = state.search;
    search.oninput = () => { state.search = search.value; renderMainOnly(); };
    bar.appendChild(search);

    // Manage mode only (the real Media Library tab) - a file-picker modal is
    // about finding one file, not auditing total account usage, and r2Files
    // there can be extension-filtered to begin with (see applyExtFilter),
    // which would misreport it anyway. Reads the live r2Files closure
    // variable fresh on every render() call, so it stays correct after an
    // upload/delete/rename/move without any separate "recompute the total"
    // bookkeeping - render() already re-runs renderToolbar() after each of
    // those (see refresh()/createFolder() above).
    if (mode === 'manage') {
      bar.appendChild(renderStorageUsage());
    }

    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.textContent = "List";
    listBtn.className = `media-browser-view-btn${state.viewMode === 'list' ? ' active' : ''}`;
    listBtn.title = "Show files as a list";
    listBtn.onclick = () => { state.viewMode = 'list'; persistPrefs(); render(); };

    const gridBtn = document.createElement("button");
    gridBtn.type = "button";
    gridBtn.textContent = "Grid";
    gridBtn.className = `media-browser-view-btn${state.viewMode === 'grid' ? ' active' : ''}`;
    gridBtn.title = "Show files as a grid of thumbnails";
    gridBtn.onclick = () => { state.viewMode = 'grid'; persistPrefs(); render(); };

    // Grid has no column headers to click, so it gets its own sort control
    // over the same sortField/sortDir state the list headers drive.
    if (state.viewMode === 'grid') {
      const sortSelect = document.createElement("select");
      sortSelect.className = "builder-select";
      sortSelect.title = "Sort files";
      sortSelect.setAttribute("aria-label", "Sort files");
      [
        ['uploaded:desc', 'Newest first'], ['uploaded:asc', 'Oldest first'],
        ['name:asc', 'Name A–Z'], ['name:desc', 'Name Z–A'],
        ['size:desc', 'Largest first'], ['size:asc', 'Smallest first'],
        ['type:asc', 'Type A–Z'], ['type:desc', 'Type Z–A'],
        ['trackNumber:asc', 'Track # low–high'], ['trackNumber:desc', 'Track # high–low']
      ].forEach(([value, label]) => sortSelect.add(new Option(label, value)));
      sortSelect.value = `${state.sortField}:${state.sortDir}`;
      sortSelect.onchange = () => {
        [state.sortField, state.sortDir] = sortSelect.value.split(':');
        persistPrefs();
        renderMainOnly();
      };
      bar.appendChild(sortSelect);
    }

    bar.append(listBtn, gridBtn);
    return bar;
  }

  function renderSidebar() {
    const sidebar = document.createElement("div");
    sidebar.className = "media-browser-sidebar";
    sidebar.style.width = `${state.sidebarWidth}px`;

    const allMediaRow = folderNavItem("All Media", () => { state.view = { type: 'all' }; persistFolder(); render(); },
      state.view.type === 'all', countsFor(state.files, null));
    allMediaRow.style.marginBottom = "0.75rem";
    allMediaRow.style.borderBottom = "1px solid #444";
    allMediaRow.style.paddingBottom = "0.75rem";
    sidebar.appendChild(allMediaRow);

    const unfiledRow = folderNavItem("Unfiled", () => navigateToFolder(''),
      state.view.type === 'folder' && state.view.path === '', countsFor(state.files, ''), 0, '');
    sidebar.appendChild(unfiledRow);

    if (mode === 'manage') {
      const newFolderBtn = document.createElement("button");
      newFolderBtn.type = "button";
      newFolderBtn.textContent = "+ New Folder";
      newFolderBtn.className = "media-browser-new-folder-btn";
      newFolderBtn.title = "Create a new folder to organize files into";
      // Same inline-rename-in-place flow as a folder row's own "New
      // Folder" context-menu item (see showFolderMenu()), just anchored to
      // whatever folder is currently being viewed instead of a
      // right-clicked one - no popup prompt for the name.
      newFolderBtn.onclick = async () => {
        const parentPath = state.view.type === 'folder' ? state.view.path : '';
        const childPath = `${parentPath}${uniqueChildFolderName(parentPath)}/`;
        await createFolder(childPath);
        state.editingFolderPath = childPath;
        navigateToFolder(childPath);
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

    return sidebar;
  }

  function folderNavItem(label, onClick, isActive, counts, depth = 0, path = null,
    hasChildren = false, isExpanded = false, onToggleExpand = null) {
    const row = document.createElement("div");
    row.className = `media-browser-folder-row${isActive ? ' active' : ''}`;
    row.style.paddingLeft = `${0.75 + depth * 1}rem`;
    row.title = path === null
      ? "View every file across all folders"
      : path === ''
        ? "View files that aren't in any folder"
        : `View files in "${label}"`;

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

    labelDiv.insertAdjacentHTML("beforeend", ICONS.FOLDER);
    // "New Folder" (see showFolderMenu()) leaves its freshly-created child
    // in this state so its name is immediately editable in place, instead
    // of a separate rename step after the fact.
    if (path !== null && path === state.editingFolderPath) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "media-browser-folder-rename-input";
      input.value = label;
      input.title = "Folder name";
      const commit = async () => {
        state.editingFolderPath = null;
        const newName = input.value.trim();
        if (!newName || newName === label) { renderSidebarOnly(); return; }
        await renameFolder(path, newName);
      };
      input.onblur = commit;
      input.onkeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        else if (e.key === "Escape") { e.preventDefault(); state.editingFolderPath = null; renderSidebarOnly(); }
      };
      input.onclick = (e) => e.stopPropagation(); // don't trigger the row's own onClick (navigate) while editing
      labelDiv.appendChild(input);
      // Deferred so the input exists in the DOM (and has real layout) before
      // focus/select are attempted.
      requestAnimationFrame(() => { input.focus(); input.select(); });
    } else {
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      labelDiv.appendChild(labelSpan);
    }
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
    // A named folder's count rolls up its subfolders, but opening it lists
    // only its direct files - say so, or "12" next to an empty list looks
    // like a bug.
    if (path) {
      const direct = state.files.filter(f => folderOf(f.key) === path && !isFolderMarker(f)).length;
      if (direct !== counts.total) {
        countsDiv.title = `${counts.total} files in total: ${direct} in this folder, ${counts.total - direct} in subfolders`;
      }
    }
    row.appendChild(countsDiv);

    // Every real, named folder gets a right-click menu in manage mode
    // (not the special "Unfiled"/"All Media" rows, which have no path) -
    // including the protected audio/images/video roots, whose Rename/Delete
    // are shown greyed out (see showFolderMenu()) rather than the row
    // having no menu at all. Anchored at the cursor, not the row, since a
    // wide row's own bounding box would put the menu far from the click.
    if (mode === 'manage' && path) {
      row.oncontextmenu = (e) => {
        e.preventDefault();
        showFolderMenu(path, e);
      };
    }

    // Guard against a click landing anywhere else in the row (the icon, the
    // counts column) while its name is being edited - only the input's own
    // click is stopped above, so without this a click just outside it would
    // still navigate away mid-edit.
    row.onclick = (e) => {
      if (path !== null && path === state.editingFolderPath) return;
      onClick(e);
    };
    // Keyboard: Enter/Space opens, Left/Right collapse/expand, and the
    // context-menu key or Shift+F10 opens the folder menu. e.target check
    // keeps the inline rename input's own keys from reaching this.
    // Both actions re-render the sidebar, so focus is put back on this
    // folder's replacement row afterwards.
    row.tabIndex = 0;
    row.dataset.navId = path ?? "*all*";
    const refocus = () => container.querySelector(`[data-nav-id="${CSS.escape(row.dataset.navId)}"]`)?.focus();
    row.onkeydown = (e) => {
      if (e.target !== row) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(e);
        refocus();
      } else if (onToggleExpand && ((e.key === "ArrowRight" && !isExpanded) || (e.key === "ArrowLeft" && isExpanded))) {
        e.preventDefault();
        onToggleExpand();
        refocus();
      } else if (row.oncontextmenu && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        row.oncontextmenu({ preventDefault() {}, clientX: rect.left + 24, clientY: rect.bottom });
      }
    };
    if (path !== null) setupFolderDropTarget(row, path);
    return row;
  }

  // Renaming/moving a file changes its R2 key, which used to silently
  // orphan any reel/page block still pointing at the old URL - the Worker
  // now self-heals that automatically as part of the rename call itself
  // (see worker/src/index.js's rewriteMediaReferences()), but the user
  // should still get a say in whether the move happens at all, not just a
  // silent rewrite after the fact - hence this confirmation, checked
  // BEFORE calling renameFile. Returns true if it's fine to proceed
  // (nothing referenced it, or the user confirmed anyway).
  async function confirmIfInUse(keys) {
    const matches = await usagesOf(keys);
    if (matches === null) return false;
    if (matches.length === 0) return true;
    return dialog.confirm(
      `This will update ${matches.length} place(s) that reference the file(s) you're moving: ${describeUsages(matches)}. Continue?`,
      "Move", "Cancel"
    );
  }

  // Every reel/page referencing any of `keys`, de-duplicated - or null if
  // the check itself failed (already reported), so callers abort rather
  // than proceed blind.
  async function usagesOf(keys) {
    try {
      const perKey = await Promise.all(keys.map((key) => fetchMediaUsages(key)));
      const seen = new Set();
      return perKey.flat().filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
    } catch (error) {
      dialog.alert(error.message);
      return null;
    }
  }

  function describeUsages(matches) {
    return matches.slice(0, 10).map((m) => `${m.title} (${m.type})`).join(", ")
      + (matches.length > 10 ? `, and ${matches.length - 10} more` : "");
  }

  // The Worker blanks every exact-URL reference on delete (see
  // clearMediaReferences()), so the usage warning is folded into the delete
  // confirmation itself rather than being a second dialog.
  async function confirmDelete(label, keys) {
    beginBusy();
    const matches = await usagesOf(keys);
    endBusy();
    if (matches === null) return false;
    const warning = matches.length
      ? ` ${matches.length} reel(s)/page(s) still use it and will have that field cleared: ${describeUsages(matches)}.`
      : "";
    return dialog.confirm(`Delete ${label}?${warning} This cannot be undone.`, "Delete", "Cancel");
  }

  // Shared by a file row's "Move to..." context-menu entry (single file or
  // whole checkbox selection) and drag-and-drop - both are just this same
  // rename-to-a-new-prefix operation, one call per file.
  async function moveFiles(keys, destFolder) {
    const takenKeys = new Set(r2Files.map(f => f.key));
    const clashing = [];
    const toMove = keys.filter((key) => {
      const file = state.files.find(f => f.key === key);
      if (!file || file.readOnly || folderOf(file.key) === destFolder) return false;
      if (takenKeys.has(`${destFolder}${file.name}`)) { clashing.push(file.name); return false; }
      return true;
    });
    if (clashing.length) {
      await dialog.alert(`${clashing.join(", ")} ${clashing.length === 1 ? "wasn't" : "weren't"} moved - "${destFolder || "Unfiled"}" already has a file with that name. Rename first to move ${clashing.length === 1 ? "it" : "them"}.`);
    }
    if (toMove.length === 0) return;
    if (!(await confirmIfInUse(toMove))) return;

    beginBusy();
    try {
      for (const key of toMove) {
        const file = state.files.find(f => f.key === key);
        await renameFile(key, `${destFolder}${file.name}`);
      }
      await refresh();
    } catch (error) {
      dialog.alert(error.message);
      await refresh();
    } finally {
      endBusy();
    }
  }

  // What a drag or right-click menu on `file` acts on - the whole visible
  // selection if `file` is part of it, otherwise just `file` itself.
  function targetKeysFor(file) {
    const selection = visibleSelection();
    return selection.includes(file.key) && selection.length > 1 ? selection : [file.key];
  }

  // The checked files actually on screen right now. The selection survives
  // folder changes and search (a multi-pick picker relies on that), so
  // anything a bulk Move/Delete acts on must go through this - otherwise
  // files checked in a folder you've since left get swept up unseen.
  function visibleSelection() {
    return visibleFiles().map(f => f.key).filter(key => state.selected.has(key));
  }

  function setupFolderDropTarget(row, path) {
    if (mode !== 'manage') return;
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drop-target");
      const raw = e.dataTransfer.getData("application/x-media-keys");
      if (!raw) return;
      const keys = JSON.parse(raw);
      moveFiles(keys, path);
    });
  }

  // Shared by the folder context menu's "Rename" item and the inline
  // rename-in-place input shown right after "New Folder" creates a child
  // (see folderNavItem's editingFolderPath handling) - both are just this
  // same rename-every-file-under-the-prefix operation.
  async function renameFolder(path, newName) {
    const parentPath = folderOf(path.slice(0, -1));
    const newPrefix = `${parentPath}${newName}/`;
    // Would merge into an existing folder, where same-named files would
    // collide - refuse outright rather than half-merge.
    if (newName.includes("/") || r2Files.some(f => f.key.startsWith(newPrefix))) {
      await dialog.alert(newName.includes("/")
        ? 'Folder names can\'t contain "/".'
        : `A folder named "${newName}" already exists here.`);
      renderSidebarOnly();
      return;
    }
    const filesToMove = state.files.filter(f => f.key.startsWith(path));
    if (!(await confirmIfInUse(filesToMove.map(f => f.key)))) return;
    beginBusy();
    try {
      for (const f of filesToMove) {
        const newKey = `${newPrefix}${f.key.slice(path.length)}`;
        await renameFile(f.key, newKey);
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
    } finally {
      endBusy();
    }
  }

  // Picks a default name that doesn't collide with an existing direct
  // child of `parentPath` ("New Folder", "New Folder 2", ...) - the name
  // is only ever a starting point anyway, since "New Folder" (below)
  // immediately opens it for inline rename.
  function uniqueChildFolderName(parentPath) {
    const existing = new Set(subfoldersOf(parentPath).map(p => p.split('/').filter(Boolean).pop().toLowerCase()));
    let name = "New Folder";
    for (let n = 2; existing.has(name.toLowerCase()); n++) name = `New Folder ${n}`;
    return name;
  }

  function showFolderMenu(path, e) {
    // The protected audio/images/video roots still get a menu (consistent
    // right-click affordance on every folder row), but Rename/Delete are
    // greyed out rather than the row having no menu at all - these paths
    // are fixed targets every file-picker/upload flow depends on existing.
    // Creating a CHILD folder inside one of them is still fine (e.g.
    // audio/podcasts/), so "New Folder" itself is never disabled.
    const isProtected = !!PROTECTED_ROOT_FOLDERS[path];

    openContextMenuAtCursor(e, [
      {
        label: "New Folder",
        onClick: async () => {
          const childPath = `${path}${uniqueChildFolderName(path)}/`;
          await createFolder(childPath);
          state.expandedFolders.add(path);
          state.editingFolderPath = childPath;
          renderSidebarOnly();
        }
      },
      {
        label: "Rename",
        disabled: isProtected,
        onClick: () => {
          state.editingFolderPath = path;
          renderSidebarOnly();
        }
      },
      {
        label: "Delete",
        danger: true,
        disabled: isProtected,
        onClick: async () => {
          const filesToDelete = state.files.filter(f => f.key.startsWith(path));
          const realFiles = filesToDelete.filter(f => !isFolderMarker(f));
          const confirmed = await confirmDelete(
            `folder "${path}" and all ${realFiles.length} file(s) inside it`,
            realFiles.map(f => f.key)
          );
          if (!confirmed) return;
          beginBusy();
          try {
            for (const f of filesToDelete) {
              await deleteFile(f.key);
            }
            if (state.view.type === 'folder' && state.view.path.startsWith(path)) {
              state.view = { type: 'folder', path: '' };
              persistFolder();
            }
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
            await refresh();
          } finally {
            endBusy();
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

    if (files.length === 0) {
      main.appendChild(renderEmptyState());
      return main;
    }

    if (mode === 'manage') {
      const selectedCount = visibleSelection().length;
      if (selectedCount > 1) main.appendChild(renderSelectionSummary(selectedCount));
    }

    main.appendChild(state.viewMode === 'list' ? renderTable(files) : renderGrid(files));
    return main;
  }

  // Says what a bulk action ("⋯" or right-click on a checked file) will hit.
  function renderSelectionSummary(count) {
    const bar = document.createElement("div");
    bar.className = "media-browser-selection-summary";
    bar.textContent = `${count} selected - use ⋯ or right-click on any of them to move or delete. `;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.title = "Uncheck all files";
    clear.onclick = () => { state.selected.clear(); renderMainOnly(); };
    bar.appendChild(clear);
    return bar;
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

    if (isSearching()) {
      message.textContent = `No files match "${state.search.trim()}".`;
      wrap.appendChild(message);
      return wrap;
    }

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
    syncPreviewButtons();
    notifySelectionChange();
  }

  function renderSidebarOnly() {
    const body = container.querySelector(".media-browser-body");
    if (!body) return render();
    const oldSidebar = body.querySelector(".media-browser-sidebar");
    const newSidebar = renderSidebar();
    body.replaceChild(newSidebar, oldSidebar);
  }

  const TYPE_ROOT_FOLDERS = { audio: 'audio/', image: 'images/', video: 'video/' };

  // Rule-based upload-destination suggestion, never automatic - just
  // offered as a one-click nudge after uploading into the root/Unfiled
  // view (see suggestMoveAfterUpload() below). Keyword match against
  // existing folder names first (e.g. "hero-banner-2.jpg" landing while a
  // "page-banners/" folder already exists), falling back to the file's
  // broad type - the same audio/images/video split filePicker.js's
  // R2_PREFIX_MAP already routes context-specific pickers' uploads to.
  function suggestFolder(fileName) {
    const base = fileName.toLowerCase().replace(/\.[^.]+$/, '');
    const allFolders = computeFolders(state.files);
    const keywordMatch = allFolders.find(f => {
      const leaf = f.split('/').filter(Boolean).pop().toLowerCase();
      return leaf.length > 2 && base.includes(leaf);
    });
    if (keywordMatch) return keywordMatch;
    return TYPE_ROOT_FOLDERS[fileType(fileName)] || null;
  }

  // Only called after uploading into the Media Library's own root/Unfiled
  // view - a select-mode picker is already folder-scoped to the right
  // category by filePicker.js, and a named folder was presumably chosen on
  // purpose, so neither needs a suggestion. Groups the just-uploaded files
  // by suggested destination and asks once per group; declining leaves
  // them exactly where they landed.
  async function suggestMoveAfterUpload(fileNames) {
    const byFolder = new Map();
    fileNames.forEach((name) => {
      const folder = suggestFolder(name);
      if (!folder) return;
      if (!byFolder.has(folder)) byFolder.set(folder, []);
      byFolder.get(folder).push(name);
    });
    for (const [folder, names] of byFolder) {
      const label = names.length === 1 ? names[0] : `${names.length} files`;
      const confirmed = await dialog.confirm(
        names.length === 1
          ? `${label} looks like it belongs in "${folder}" - move it there now?`
          : `${label} look like they belong in "${folder}" - move them there now?`,
        "Move", "Leave in Unfiled"
      );
      if (!confirmed) continue;
      const keys = state.files.filter((f) => folderOf(f.key) === '' && names.includes(f.name)).map((f) => f.key);
      await moveFiles(keys, folder);
    }
  }

  function renderUploadZone() {
    const zone = document.createElement("div");
    zone.className = "media-browser-upload-zone";
    zone.textContent = "Drag files here, or ";

    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "click to upload";
    link.title = "Choose files from your computer to upload";
    zone.appendChild(link);

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";

    const targetFolder = state.view.type === 'folder' ? state.view.path : '';

    // Per-file progress text (not a single "Uploading N file(s)..." for the
    // whole batch) and continue-on-error (one bad file no longer aborts
    // every file queued after it, which a single try/for-loop did before -
    // failures are collected and reported together at the end instead).
    const handleFiles = async (fileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;

      // r2Files, not state.files - a picker's extension filter could hide
      // the very file this would overwrite.
      const takenKeys = new Set(r2Files.map(f => f.key));
      const clashes = files.filter(f => takenKeys.has(`${targetFolder}${f.name}`));
      let clashMode = null;
      if (clashes.length) {
        const names = clashes.slice(0, 5).map(f => f.name).join(", ")
          + (clashes.length > 5 ? `, and ${clashes.length - 5} more` : "");
        clashMode = await dialog.choose(
          `${names} already ${clashes.length === 1 ? "exists" : "exist"} in this folder. Replacing changes every reel/page that uses ${clashes.length === 1 ? "it" : "them"}.`,
          [
            { text: "Cancel", value: null },
            { text: "Keep Both", value: "keep", type: "primary" },
            { text: "Replace", value: "replace", type: "danger" }
          ]
        );
        if (!clashMode) return;
      }

      const failures = [];
      const succeeded = [];
      beginBusy();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const exists = takenKeys.has(`${targetFolder}${file.name}`);
        const name = exists && clashMode === "keep" ? uniqueFileName(targetFolder, file.name, takenKeys) : file.name;
        setBusyText(`Uploading ${i + 1} of ${files.length}: ${name}`);
        try {
          await uploadFile(targetFolder, file, name, exists && clashMode === "replace");
          takenKeys.add(`${targetFolder}${name}`);
          succeeded.push(name);
        } catch (error) {
          failures.push(`${file.name}: ${error.message}`);
        }
      }

      await refresh();
      endBusy();

      if (failures.length) {
        dialog.alert(`${failures.length} of ${files.length} file(s) failed to upload:\n\n${failures.join('\n')}`);
      }

      if (mode === 'manage' && targetFolder === '' && succeeded.length) {
        await suggestMoveAfterUpload(succeeded);
      }
    };

    link.onclick = (e) => { e.preventDefault(); input.click(); };
    input.onchange = () => handleFiles(input.files);
    // types.includes("Files") excludes an internal file-row/card drag (see
    // targetKeysFor()'s "application/x-media-keys" payload) from lighting up
    // this zone as a drop target - that drag is for moving between
    // folders, not uploading, and dataTransfer.files is empty for it
    // anyway, but skipping the dragover highlight avoids a confusing flash
    // of "drop to upload" affordance during an unrelated organize-drag.
    zone.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      zone.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });

    zone.appendChild(input);
    return zone;
  }

  function sortHeader(label, field, colClass = '') {
    const th = document.createElement("th");
    th.className = `media-browser-sortable${colClass ? ` ${colClass}` : ''}`;
    th.title = `Sort by ${label.toLowerCase()} (click again to reverse order)`;

    // Arrow lives before the label (not after) and always reserves its own
    // space (empty when this isn't the active sort column) so clicking
    // between columns doesn't shift the label text sideways.
    const wrap = document.createElement("span");
    wrap.className = "media-browser-sort-label";
    const arrow = document.createElement("span");
    arrow.className = "media-browser-sort-arrow";
    arrow.textContent = state.sortField === field ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    wrap.append(arrow, label);
    th.appendChild(wrap);

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
    if (showCheckboxes) {
      const th = document.createElement("th");
      th.className = "media-browser-col-check";
      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      selectAll.checked = files.length > 0 && files.every(f => state.selected.has(f.key));
      selectAll.title = "Select all files";
      selectAll.onchange = () => {
        if (selectAll.checked) files.forEach(f => { if (!f.readOnly) state.selected.add(f.key); });
        else files.forEach(f => state.selected.delete(f.key));
        renderMainOnly();
      };
      th.appendChild(selectAll);
      headRow.appendChild(th);
    }
    const iconTh = document.createElement("th");
    iconTh.className = "media-browser-col-icon";
    headRow.appendChild(iconTh);
    // table-layout: fixed derives every column's width from THIS row's
    // cells (see js/modules/CLAUDE.md's note on this exact gotcha) - Name
    // is the only column with no width class, so it gets whatever space
    // the fixed-width columns leave over.
    headRow.appendChild(sortHeader("Name", "name"));
    headRow.appendChild(sortHeader("Type", "type", "media-browser-col-type"));
    // Only audio carries a track number (from its ID3 tag) - no point
    // spending a column on a list of dashes.
    const showTrack = files.some(f => f.trackNumber);
    if (showTrack) headRow.appendChild(sortHeader("Track #", "trackNumber", "media-browser-col-track"));
    headRow.appendChild(sortHeader("Size", "size", "media-browser-col-size"));
    headRow.appendChild(sortHeader("Uploaded", "uploaded", "media-browser-col-uploaded"));
    if (mode === 'manage') {
      const th = document.createElement("th");
      th.className = "media-browser-col-actions";
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    files.forEach(file => tbody.appendChild(renderRow(file, showTrack)));
    table.appendChild(tbody);

    return table;
  }

  // Shared by list rows and grid cards so both views behave the same.
  // Drag-to-folder and right-click menu (manage mode only). Right-clicking
  // an item that's already part of a multi-checkbox selection operates on
  // the whole selection (see showRowMenu); right-clicking outside it
  // collapses the selection down to just this item first, like
  // Finder/Explorer.
  function wireManageActions(el, file) {
    if (mode !== 'manage' || file.readOnly) return;
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-media-keys", JSON.stringify(targetKeysFor(file)));
    });
    el.oncontextmenu = (e) => {
      e.preventDefault();
      openFileMenu(file, e);
    };
  }

  function openFileMenu(file, e, anchorRect = null) {
    if (!state.selected.has(file.key)) {
      state.selected.clear();
      state.selected.add(file.key);
      renderMainOnly();
    }
    showRowMenu(file, e, anchorRect);
  }

  // Visible counterpart to right-click, so the file actions are
  // discoverable. Manage mode only, same as the right-click menu.
  function createMoreButton(file) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "media-browser-more-btn";
    btn.innerHTML = ICONS.MORE;
    btn.title = "File actions (Copy URL, Rename, Move, Delete)";
    btn.setAttribute("aria-label", `Actions for ${file.name}`);
    btn.onclick = (e) => {
      e.stopPropagation();
      // renderMainOnly() inside openFileMenu can replace this button, so
      // anchor to its position captured now rather than the element.
      openFileMenu(file, e, btn.getBoundingClientRect());
    };
    return btn;
  }

  function createFileCheckbox(file) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = file.readOnly;
    checkbox.checked = state.selected.has(file.key);
    checkbox.title = "Select this file";
    checkbox.onclick = (e) => e.stopPropagation(); // don't also activate the grid card it sits on
    checkbox.onchange = () => toggleSelected(file.key);
    return checkbox;
  }

  function toggleSelected(key) {
    if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    renderMainOnly();
  }

  // Clicking a file's name (list) or card (grid).
  function activateFile(file) {
    if (mode === 'select' && multiple) {
      // Checkbox-driven batch pick instead of pick-and-close - the
      // caller's own UI (see onSelectionChange) confirms the actual add.
      toggleSelected(file.key);
    } else if (mode === 'select' && onSelect) {
      onSelect(file.url);
    } else {
      window.open(file.url, '_blank', 'noopener');
    }
  }

  function renderRow(file, showTrack) {
    const type = fileType(file.name);
    const row = document.createElement("tr");
    // Checked rows are exactly the set a right-click's context-menu actions
    // will apply to (see the oncontextmenu handler below), so highlighting
    // them here doubles as "these are what you're about to act on."
    row.className = `media-browser-row${state.selected.has(file.key) ? ' selected' : ''}`;

    wireManageActions(row, file);

    if (showCheckboxes) {
      const cb = document.createElement("td");
      cb.appendChild(createFileCheckbox(file));
      row.appendChild(cb);
    }

    const iconTd = document.createElement("td");
    iconTd.className = `media-browser-icon media-browser-icon-${type}`;
    if (type === 'audio') iconTd.appendChild(createPreviewButton(file));
    else iconTd.innerHTML = typeIcon(type);
    row.appendChild(iconTd);

    const nameTd = document.createElement("td");
    const link = document.createElement("a");
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = file.name;
    // Manage mode keeps the link's native behavior (new tab, cmd-click etc).
    link.onclick = (e) => {
      if (mode === 'select') {
        e.preventDefault();
        activateFile(file);
      }
    };
    nameTd.appendChild(link);
    // Results can come from anywhere, so say where.
    if (state.view.type === 'all' || isSearching()) {
      const folder = document.createElement("span");
      folder.className = "media-browser-file-folder";
      folder.textContent = folderOf(file.key) || "Unfiled";
      nameTd.appendChild(folder);
    }
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

    if (showTrack) {
      const trackTd = document.createElement("td");
      trackTd.textContent = file.trackNumber || "—";
      row.appendChild(trackTd);
    }

    const sizeTd = document.createElement("td");
    sizeTd.textContent = formatBytes(file.size);
    row.appendChild(sizeTd);

    const uploadedTd = document.createElement("td");
    uploadedTd.textContent = file.uploaded ? new Date(file.uploaded).toLocaleDateString() : "—";
    row.appendChild(uploadedTd);

    if (mode === 'manage') {
      const actionsTd = document.createElement("td");
      if (!file.readOnly) actionsTd.appendChild(createMoreButton(file));
      row.appendChild(actionsTd);
    }

    return row;
  }

  // A folder that has subfolders becomes a flyout itself (its own "Move
  // here" entry plus one item per child, each recursing the same way) -
  // contextMenu.js supports arbitrarily deep nested submenus, so this
  // mirrors the real folder tree instead of a flattened path list. A
  // childless folder is just a plain clickable item.
  function folderMoveItem(path, keys) {
    const leaf = path.split('/').filter(Boolean).pop();
    const children = subfoldersOf(path);
    if (children.length === 0) {
      return { label: `${leaf}/`, icon: ICONS.FOLDER, onClick: () => moveFiles(keys, path) };
    }
    return {
      label: `${leaf}/`,
      icon: ICONS.FOLDER,
      submenu: [
        { label: "Move here", onClick: () => moveFiles(keys, path) },
        ...children.map(child => folderMoveItem(child, keys))
      ]
    };
  }

  function moveToSubmenuItems(keys) {
    const allFolders = computeFolders(state.files);
    const topLevel = allFolders.filter(path => folderOf(path.slice(0, -1)) === '');
    const items = [
      { label: "Unfiled (root)", icon: ICONS.FOLDER, onClick: () => moveFiles(keys, '') },
      ...topLevel.map(path => folderMoveItem(path, keys))
    ];
    items.push({
      label: "New folder...",
      onClick: async () => {
        const name = await promptForText("New folder name (e.g. backgrounds/nature)");
        if (!name) return;
        const path = name.replace(/^\/+|\/+$/g, '') + '/';
        await moveFiles(keys, path);
      }
    });
    return items;
  }

  // Operates on the whole checkbox selection when the right-clicked row is
  // part of one (size > 1), otherwise just this row - see the oncontextmenu
  // handler above, which collapses the selection to this row first
  // otherwise. Rename/Copy URL don't have a sane multi-target meaning, so
  // they're only offered for a single target.
  function showRowMenu(file, e, anchorRect = null) {
    const keys = targetKeysFor(file);
    const multi = keys.length > 1;

    const items = [];
    if (!multi) {
      items.push({
        label: "Copy URL",
        onClick: async () => {
          try { await navigator.clipboard.writeText(file.url); } catch { /* ignore */ }
        }
      });
      items.push({
        label: "Rename",
        onClick: async () => {
          let newName = await promptForText("Rename file", file.name);
          if (!newName || newName === file.name) return;
          if (newName.includes("/")) {
            dialog.alert('File names can\'t contain "/" - use "Move to..." to change folders.');
            return;
          }
          // Keep the extension if it was dropped - fileType() and the
          // player's own media handling both key off it.
          const ext = `.${extOf(file.name)}`;
          if (file.name.includes(".") && !newName.toLowerCase().endsWith(ext.toLowerCase())) newName += ext;
          if (r2Files.some(f => f.key === `${folderOf(file.key)}${newName}`)) {
            dialog.alert(`"${newName}" already exists in this folder.`);
            return;
          }
          if (!(await confirmIfInUse([file.key]))) return;
          beginBusy();
          try {
            await renameFile(file.key, `${folderOf(file.key)}${newName}`);
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
          } finally {
            endBusy();
          }
        }
      });
    }

    items.push({ label: "Move to...", submenu: moveToSubmenuItems(keys) });

    items.push({
      label: multi ? `Delete ${keys.length} Files` : "Delete",
      danger: true,
      onClick: async () => {
        const label = multi ? `${keys.length} file(s)` : `"${file.name}"`;
        if (!(await confirmDelete(label, keys))) return;
        beginBusy();
        try {
          for (const key of keys) {
            const f = state.files.find(f => f.key === key);
            if (!f || f.readOnly) continue;
            await deleteFile(key);
          }
          await refresh();
        } catch (error) {
          dialog.alert(error.message);
          await refresh();
        } finally {
          endBusy();
        }
      }
    });

    // A keyboard-activated button click has no real cursor position, so the
    // "⋯" button passes its own rect and the menu opens under it instead.
    openContextMenuAtCursor(anchorRect ? { clientX: anchorRect.left, clientY: anchorRect.bottom } : e, items);
  }

  function renderGrid(files) {
    const grid = document.createElement("div");
    grid.className = "media-browser-grid";

    files.forEach(file => {
      const type = fileType(file.name);
      const card = document.createElement("div");
      card.className = `media-browser-card${state.selected.has(file.key) ? ' selected' : ''}`;
      card.title = `${folderOf(file.key)}${file.name}`;
      wireManageActions(card, file);

      if (showCheckboxes) {
        const checkbox = createFileCheckbox(file);
        checkbox.classList.add("media-browser-card-check");
        card.appendChild(checkbox);
      }

      const preview = document.createElement("div");
      preview.className = "media-browser-card-preview";
      if (type === 'image') {
        const img = document.createElement("img");
        img.src = file.url;
        img.alt = file.name;
        img.loading = "lazy";
        preview.appendChild(img);
      } else {
        preview.classList.add(`media-browser-icon-${type}`);
        if (type === 'audio') preview.appendChild(createPreviewButton(file));
        else preview.innerHTML = typeIcon(type);
      }
      card.appendChild(preview);

      const name = document.createElement("div");
      name.className = "media-browser-card-name";
      name.textContent = file.name;
      card.appendChild(name);

      if (mode === 'manage' && !file.readOnly) {
        const more = createMoreButton(file);
        more.classList.add("media-browser-card-more");
        card.appendChild(more);
      }

      card.onclick = () => activateFile(file);
      card.tabIndex = 0;
      card.onkeydown = (e) => {
        if (e.target !== card || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        activateFile(file);
      };

      grid.appendChild(card);
    });

    return grid;
  }
}
