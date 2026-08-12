// contentHash.js - Deterministic short hash of a JSON-serializable value.
// Two calls with equal content always produce the same string, so
// comparing hashes is enough to detect "has this changed since I last
// published it" without a dedicated diffing mechanism. Not cryptographic
// (collisions are astronomically unlikely for this use case - a handful of
// short-lived comparisons - but possible in principle) - never use this for
// anything security-sensitive.
//
// Extracted from js/modules/embedExporter.js's generateReelId(), which
// used this exact algorithm to turn a reel's content into its embed id;
// js/modules/pagePublish.js's contentFingerprint() uses it the same way to
// detect a page's unpublished changes.
export function hashContent(value) {
  const content = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}
