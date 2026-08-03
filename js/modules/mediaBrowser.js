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
 * @param {string} options.startFolder - initial folder to open, e.g. 'audio/'
 * @param {Function} options.onSelect - (url) => void, called in 'select' mode when a row is clicked
 * @param {Array} options.extraFiles - additional read-only files to merge in (e.g. git-committed test assets), shaped like the internal file record: {key, name, size, uploaded, readOnly: true, url}
 */
export async function renderMediaBrowser(container, options = {}) {
  const {
    mode = 'manage',
    extensions = null,
    startFolder = '',
    onSelect = null,
    extraFiles = []
  } = options;

  const state = {
    view: startFolder ? { type: 'folder', path: startFolder } : { type: 'folder', path: '' },
    search: '',
    sortField: 'uploaded',
    sortDir: 'desc',
    viewMode: 'list',
    selected: new Set(),
    files: [],
    password: null
  };

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

  state.files = [...applyExtFilter(r2Files), ...extraFiles];

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

  async function refresh() {
    try {
      r2Files = await fetchAllR2Files(state.password);
    } catch (error) {
      dialog.alert(error.message);
      return;
    }
    state.files = [...applyExtFilter(r2Files), ...extraFiles];
    state.selected.clear();
    render();
  }

  function render() {
    container.innerHTML = "";
    container.appendChild(renderToolbar());
    const body = document.createElement("div");
    body.className = "media-browser-body";
    body.appendChild(renderSidebar());
    body.appendChild(renderMain());
    container.appendChild(body);
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
    listBtn.onclick = () => { state.viewMode = 'list'; render(); };

    const gridBtn = document.createElement("button");
    gridBtn.type = "button";
    gridBtn.textContent = "Grid";
    gridBtn.className = `media-browser-view-btn${state.viewMode === 'grid' ? ' active' : ''}`;
    gridBtn.onclick = () => { state.viewMode = 'grid'; render(); };

    bar.append(listBtn, gridBtn);
    return bar;
  }

  function renderSidebar() {
    const sidebar = document.createElement("div");
    sidebar.className = "media-browser-sidebar";

    const unfiledRow = folderNavItem("Unfiled", () => { state.view = { type: 'folder', path: '' }; render(); },
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
        state.view = { type: 'folder', path };
        render();
      };
      sidebar.appendChild(newFolderBtn);
    }

    // Render every known folder path flat with indentation by depth - simple
    // and still conveys nesting, without needing a collapsible tree.
    const allFolders = computeFolders(state.files);
    allFolders.forEach(path => {
      const depth = path.split('/').filter(Boolean).length - 1;
      const label = path.split('/').filter(Boolean).pop();
      const row = folderNavItem(label, () => { state.view = { type: 'folder', path }; render(); },
        state.view.type === 'folder' && state.view.path === path, countsFor(state.files, path), depth);
      sidebar.appendChild(row);
    });

    const allMediaRow = folderNavItem("All Media", () => { state.view = { type: 'all' }; render(); },
      state.view.type === 'all', countsFor(state.files, null));
    allMediaRow.style.marginTop = "0.75rem";
    allMediaRow.style.borderTop = "1px solid #444";
    allMediaRow.style.paddingTop = "0.75rem";
    sidebar.appendChild(allMediaRow);

    return sidebar;
  }

  function folderNavItem(label, onClick, isActive, counts, depth = 0) {
    const row = document.createElement("div");
    row.className = `media-browser-folder-row${isActive ? ' active' : ''}`;
    row.style.paddingLeft = `${0.75 + depth * 1}rem`;
    row.innerHTML = `
      <div class="media-browser-folder-label">${ICONS.FOLDER}<span>${label}</span></div>
      <div class="media-browser-folder-counts">${counts.total}</div>
    `;
    row.onclick = onClick;
    return row;
  }

  function renderMain() {
    const main = document.createElement("div");
    main.className = "media-browser-main";
    main.appendChild(renderUploadZone());

    const files = visibleFiles();

    if (mode === 'manage' && state.selected.size > 0) {
      main.appendChild(renderBulkBar());
    }

    if (files.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = "color:#888;font-style:italic;";
      empty.textContent = "No files here.";
      main.appendChild(empty);
      return main;
    }

    main.appendChild(state.viewMode === 'list' ? renderTable(files) : renderGrid(files));
    return main;
  }

  function renderMainOnly() {
    const body = container.querySelector(".media-browser-body");
    if (!body) return render();
    const oldMain = body.querySelector(".media-browser-main");
    const newMain = renderMain();
    body.replaceChild(newMain, oldMain);
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
        menuBtn.onclick = () => showRowMenu(file);
        actionsTd.appendChild(menuBtn);
      }
      row.appendChild(actionsTd);
    }

    return row;
  }

  function showRowMenu(file) {
    dialog.createDialog({
      type: "custom",
      message: file.name,
      content: '<p style="color:#ccc;">Choose an action.</p>',
      buttons: [
        { text: "Copy URL", type: "secondary", onClick: async () => {
          dialog.closeDialog();
          try { await navigator.clipboard.writeText(file.url); } catch { /* ignore */ }
        } },
        { text: "Rename", type: "secondary", onClick: async () => {
          dialog.closeDialog();
          const newName = await promptForText("Rename file", file.name);
          if (!newName || newName === file.name) return;
          try {
            await renameFile(file.key, `${folderOf(file.key)}${newName}`, state.password);
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
          }
        } },
        { text: "Delete", type: "danger", onClick: async () => {
          dialog.closeDialog();
          const confirmed = await dialog.confirm(`Delete "${file.name}"? This cannot be undone.`, "Delete", "Cancel");
          if (!confirmed) return;
          try {
            await deleteFile(file.key, state.password);
            await refresh();
          } catch (error) {
            dialog.alert(error.message);
          }
        } },
        { text: "Close", type: "primary", onClick: () => dialog.closeDialog() }
      ]
    });
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
