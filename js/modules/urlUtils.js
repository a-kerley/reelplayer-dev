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
