/**
 * File Picker Module
 * Opens a modal for selecting a media file for a specific field (track audio,
 * background image/video, etc). The actual browsing UI is the shared
 * mediaBrowser component (mode: 'select') - this module just supplies the
 * modal shell, pointed at the R2-backed Media Library.
 */
import { renderMediaBrowser } from "./mediaBrowser.js";

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
</svg>`;

// The 4 known asset categories, mapped to their equivalent R2 media prefix
// (where uploads for that category land in the Media Library) so the picker
// opens straight into the relevant folder.
const R2_PREFIX_MAP = {
  'assets/audio': 'audio/',
  'assets/images/backgrounds': 'images/backgrounds/',
  'assets/images/project-titles': 'images/project-titles/',
  'assets/video': 'video/'
};

// User-facing names for each category, e.g. for button tooltips - the
// R2_PREFIX_MAP keys above are internal folder paths, not something to show.
const CATEGORY_LABELS = {
  'assets/audio': 'audio library',
  'assets/images/backgrounds': 'background image library',
  'assets/images/project-titles': 'collapsed banner image library',
  'assets/video': 'video library'
};

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

  renderMediaBrowser(body, {
    mode: "select",
    extensions,
    startFolder: R2_PREFIX_MAP[directory] || "",
    contextKey: directory,
    onSelect: (url) => {
      onSelect(url);
      closeModal();
    }
  });
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
  const categoryLabel = CATEGORY_LABELS[pickerOptions.directory] || "media library";
  btn.setAttribute("aria-label", `Browse ${categoryLabel}`);
  btn.title = `Browse ${categoryLabel}`;

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
