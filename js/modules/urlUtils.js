// urlUtils.js - Centralized URL handling utilities

/**
 * Extract a clean filename from a URL
 * @param {string} url - The URL to extract filename from
 * @returns {string} - Clean filename with spaces instead of underscores, no extension. Hyphens are
 *   left alone (unlike underscores) - they're often an intentional part of a name ("afro-cuban",
 *   "up-tempo"), not just a space substitute.
 */
export function extractFileName(url) {
  if (!url) return "";
  return url
    .split("/")
    .pop()
    .split("?")[0]
    .replace(/_/g, " ")
    .replace(/\.[^/.]+$/, "");
}
