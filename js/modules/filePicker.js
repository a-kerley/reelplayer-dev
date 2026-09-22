/**
 * File Picker Module
 * Opens a modal for selecting a media file for a specific field (track audio,
 * background image/video, etc). The actual browsing UI is the shared
 * mediaBrowser component (mode: 'select') - this module just supplies the
 * modal shell, pointed at the R2-backed Media Library.
 */
import { renderMediaBrowser } from "./mediaBrowser.js";

// The known asset categories, mapped to their equivalent R2 media prefix
// (where uploads for that category land in the Media Library) so the picker
// opens straight into the relevant folder.
const R2_PREFIX_MAP = {
  'assets/audio': 'audio/',
  'assets/images/backgrounds': 'images/backgrounds/',
  'assets/images/project-titles': 'images/project-titles/',
  'assets/video': 'video/',
  'assets/images/page-banners': 'images/page-banners/',
  'assets/images/page-blocks': 'images/page-blocks/',
  'assets/images/page-backgrounds': 'images/page-backgrounds/'
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

// Single footer button that reads "Cancel" (closes the modal) until
// something's checked in multi-pick mode, at which point it becomes "Add N
// Selected" (confirms the pick) instead - see openFilePicker()'s own
// onSelectionChange handler below, which drives the swap - rather than a
// second button or an in-browser confirm bar.
function createModalFooter(onClose) {
  const footer = document.createElement("div");
  footer.className = "file-picker-footer";
  const actionButton = document.createElement("button");
  actionButton.className = "file-picker-cancel-btn";
  actionButton.textContent = "Cancel";
  actionButton.title = "Close without selecting a file";
  footer.appendChild(actionButton);
  return { footer, actionButton };
}

/**
 * Opens a file browser modal for selecting a file for a specific field.
 * @param {Object} options
 * @param {string} options.directory - one of the known categories (see R2_PREFIX_MAP above), e.g. 'assets/audio'
 * @param {string[]} options.extensions - allowed file extensions, e.g. ['.jpg', '.png']
 * @param {string} options.title - modal title
 * @param {Function} options.onSelect - called with the selected file's URL (single-pick, or the
 *   fallback path used by createFilePickerButtonEl's own single-file callers)
 * @param {boolean} options.multiple - shows checkboxes instead of picking-and-closing on a single row
 *   click, and turns the footer's Cancel button into "Add N Selected" once something's checked -
 *   see options.onSelectMultiple
 * @param {Function} options.onSelectMultiple - required when options.multiple is true; called with
 *   the checked files' URLs (string[]) in the picker's own display order, once confirmed
 */
export function openFilePicker(options) {
  const { directory, extensions, title = "Select File", onSelect, multiple = false, onSelectMultiple } = options;

  const modal = createModalOverlay();
  const modalContent = createModalContent();
  const header = createModalHeader(title);
  const body = document.createElement("div");
  body.className = "file-picker-body";

  const closeModal = () => document.body.removeChild(modal);
  const { footer, actionButton } = createModalFooter(closeModal);

  // The footer button's one click handler does whichever action is
  // currently active - closes the modal, or confirms the checked
  // selection - rather than re-binding a new listener every time the
  // count changes.
  let confirmSelection = null;
  actionButton.onclick = () => {
    if (confirmSelection) confirmSelection();
    else closeModal();
  };

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
    multiple,
    onSelect: (url) => {
      onSelect(url);
      closeModal();
    },
    onSelectMultiple: multiple ? (urls) => {
      onSelectMultiple(urls);
      closeModal();
    } : null,
    onSelectionChange: multiple ? (count, confirmFn) => {
      confirmSelection = confirmFn;
      actionButton.classList.toggle("file-picker-confirm-btn", count > 0);
      if (count > 0) {
        actionButton.textContent = `Add ${count} Selected`;
        actionButton.title = "Add the selected files";
      } else {
        actionButton.textContent = "Cancel";
        actionButton.title = "Close without selecting a file";
      }
    } : null
  });
}
