/**
 * File Picker Module
 * Opens a modal for selecting a media file for a specific field (track audio,
 * background image/video, etc). The actual browsing UI is the shared
 * mediaBrowser component (mode: 'select') - this module just supplies the
 * modal shell, and merges in the git-committed "Test Assets" alongside
 * whatever's been uploaded to the R2-backed Media Library.
 */
import { renderMediaBrowser } from "./mediaBrowser.js";

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
</svg>`;

// The 4 known asset categories, mapped to their git-committed manifest
// (Test Assets) and their equivalent R2 media prefix (where uploads for
// that category land in the Media Library).
const MANIFEST_MAP = {
  'assets/audio': 'assets/manifests/audio.json',
  'assets/images/backgrounds': 'assets/manifests/images-backgrounds.json',
  'assets/images/project-titles': 'assets/manifests/images-titles.json',
  'assets/video': 'assets/manifests/video.json'
};

const R2_PREFIX_MAP = {
  'assets/audio': 'audio/',
  'assets/images/backgrounds': 'images/backgrounds/',
  'assets/images/project-titles': 'images/project-titles/',
  'assets/video': 'video/'
};

/**
 * Manifest Cache Management
 * Handles localStorage caching with TTL validation
 */
class ManifestCache {
  constructor(maxAge = 5 * 60 * 1000) {
    this.maxAge = maxAge; // Default 5 minutes
    this.keyPrefix = 'filePicker_';
  }

  get(manifestPath) {
    const cacheKey = this.keyPrefix + manifestPath;
    const cachedData = localStorage.getItem(cacheKey);
    if (!cachedData) return null;
    try {
      const cached = JSON.parse(cachedData);
      return this.isValid(cached.timestamp) ? cached.files : null;
    } catch (e) {
      console.warn(`[Cache] Parse error for ${manifestPath}:`, e);
      return null;
    }
  }

  set(manifestPath, files) {
    const cacheKey = this.keyPrefix + manifestPath;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), files }));
    } catch (e) {
      console.warn(`[Cache] Failed to store ${manifestPath}:`, e);
    }
  }

  isValid(timestamp) {
    return (Date.now() - timestamp) < this.maxAge;
  }
}

// Fetches the git-committed manifest for a directory (cached) and reshapes
// it into mediaBrowser's file-record shape, with keys remapped under a
// virtual "Test Assets/" root so they nest alongside (but never collide
// with) real R2 keys in the shared folder-tree logic.
async function fetchTestAssetFiles(directory, extensions) {
  const manifestPath = MANIFEST_MAP[directory];
  if (!manifestPath) return [];

  const cache = new ManifestCache();
  let files = cache.get(manifestPath);

  if (!files) {
    try {
      const response = await fetch(manifestPath);
      if (!response.ok) return [];
      const manifest = await response.json();
      files = manifest.files;
      cache.set(manifestPath, files);
    } catch (error) {
      console.error(`[File Picker] Failed to load ${manifestPath}:`, error);
      return [];
    }
  }

  return files
    .filter(file => extensions.some(ext => file.path.toLowerCase().endsWith(ext)))
    .map(file => ({
      key: `Test Assets/${file.path.replace(`${directory}/`, '')}`,
      name: file.path.split('/').pop(),
      size: null,
      uploaded: null,
      readOnly: true,
      url: file.path
    }));
}

function createModalOverlay() {
  const modal = document.createElement("div");
  modal.className = "file-picker-modal";
  return modal;
}

function createModalContent() {
  const content = document.createElement("div");
  content.className = "file-picker-content";
  return content;
}

function createModalHeader(title) {
  const header = document.createElement("div");
  header.className = "file-picker-header";
  const titleEl = document.createElement("h3");
  titleEl.className = "file-picker-title";
  titleEl.textContent = title;
  header.appendChild(titleEl);
  return header;
}

function createModalFooter(onClose) {
  const footer = document.createElement("div");
  footer.className = "file-picker-footer";
  const closeButton = document.createElement("button");
  closeButton.className = "file-picker-cancel-btn";
  closeButton.textContent = "Cancel";
  closeButton.addEventListener("click", onClose);
  footer.appendChild(closeButton);
  return footer;
}

/**
 * Opens a file browser modal for selecting a file for a specific field.
 * @param {Object} options
 * @param {string} options.directory - one of the 4 known categories, e.g. 'assets/audio'
 * @param {string[]} options.extensions - allowed file extensions, e.g. ['.jpg', '.png']
 * @param {string} options.title - modal title
 * @param {Function} options.onSelect - called with the selected file's URL
 */
export function openFilePicker(options) {
  const { directory, extensions, title = "Select File", onSelect } = options;

  const modal = createModalOverlay();
  const modalContent = createModalContent();
  const header = createModalHeader(title);
  const body = document.createElement("div");
  body.className = "file-picker-body";

  const closeModal = () => document.body.removeChild(modal);
  const footer = createModalFooter(closeModal);

  modalContent.append(header, body, footer);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  (async () => {
    const extraFiles = await fetchTestAssetFiles(directory, extensions);
    renderMediaBrowser(body, {
      mode: "select",
      extensions,
      startFolder: R2_PREFIX_MAP[directory] || "",
      extraFiles,
      onSelect: (url) => {
        onSelect(url);
        closeModal();
      }
    });
  })();
}

/**
 * Creates a file picker button for input fields
 * @param {HTMLElement} inputElement - The input field to attach the button to
 * @param {Object} pickerOptions - Options to pass to openFilePicker
 * @returns {HTMLElement} The created button element
 */
export function createFilePickerButton(inputElement, pickerOptions) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "file-picker-btn";
  btn.innerHTML = FOLDER_ICON;
  btn.setAttribute("aria-label", `Browse ${pickerOptions.directory}`);
  btn.title = `Browse files from ${pickerOptions.directory}`;

  btn.addEventListener("click", () => {
    openFilePicker({
      ...pickerOptions,
      onSelect: (filePath) => {
        inputElement.value = filePath;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  return btn;
}
