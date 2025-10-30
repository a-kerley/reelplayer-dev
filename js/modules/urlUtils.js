// urlUtils.js - Centralized URL handling utilities

/**
 * Extract a clean filename from a URL
 * @param {string} url - The URL to extract filename from
 * @returns {string} - Clean filename with spaces instead of separators, no extension
 */
export function extractFileName(url) {
  if (!url) return "";
  return url
    .split("/")
    .pop()
    .split("?")[0]
    .replace(/[_-]/g, " ")
    .replace(/\.[^/.]+$/, "");
}

/**
 * Create a filename display span for URL inputs
 * Implements the click-to-edit pattern used in track URL inputs
 * @param {string} url - Initial URL value
 * @param {string} placeholder - Placeholder text when no URL
 * @returns {HTMLElement} - Configured span element
 */
export function createFilenameDisplay(url, placeholder = "Paste Link or Select File") {
  const span = document.createElement("span");
  span.classList.add("filename-display");
  
  const filenameText = extractFileName(url) || placeholder;
  span.textContent = filenameText;
  
  if (filenameText === placeholder) {
    span.classList.add("placeholder");
  } else {
    span.classList.remove("placeholder");
  }
  
  span.tabIndex = 0;
  
  return span;
}

/**
 * Update filename display with new URL
 * @param {HTMLElement} displaySpan - The filename display span element
 * @param {string} url - The new URL value
 * @param {string} placeholder - Placeholder text when no URL
 */
export function updateFilenameDisplay(displaySpan, url, placeholder = "Paste Link or Select File") {
  if (!displaySpan) return;
  
  const filenameText = extractFileName(url) || placeholder;
  displaySpan.textContent = filenameText;
  
  if (filenameText === placeholder) {
    displaySpan.classList.add("placeholder");
  } else {
    displaySpan.classList.remove("placeholder");
  }
}

/**
 * Setup focus/blur behavior for URL input with filename display
 * @param {HTMLElement} displaySpan - The filename display span
 * @param {HTMLInputElement} urlInput - The URL input field
 * @param {Function} onBlur - Callback when input loses focus
 */
export function setupUrlInputToggle(displaySpan, urlInput, onBlur) {
  // Click filename to edit URL
  displaySpan.onclick = () => {
    displaySpan.style.display = "none";
    urlInput.style.display = "";
    urlInput.focus();
  };
  
  // Handle blur event
  urlInput.onblur = () => {
    displaySpan.style.display = "";
    urlInput.style.display = "none";
    if (onBlur) onBlur();
  };
  
  // Enter key triggers blur
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") urlInput.blur();
  });
}
