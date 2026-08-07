/**
 * File Picker Module
 * Opens a modal for selecting a media file for a specific field (track audio,
 * background image/video, etc). The actual browsing UI is the shared
 * mediaBrowser component (mode: 'select') - this module just supplies the
 * modal shell, pointed at the R2-backed Media Library.
 */
import { renderMediaBrowser } from "./mediaBrowser.js";

// The 4 known asset categories, mapped to their equivalent R2 media prefix
// (where uploads for that category land in the Media Library) so the picker
// opens straight into the relevant folder.
const R2_PREFIX_MAP = {
  'assets/audio': 'audio/',
  'assets/images/backgrounds': 'images/backgrounds/',
  'assets/images/project-titles': 'images/project-titles/',
  'assets/video': 'video/'
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
