// pagePublish.js - Publishes a page draft to its public GET /pages/:slug
// entry, the Pages counterpart of js/modules/embedExporter.js's
// storeReelData(). Unlike a reel's embed id (a content hash, regenerated
// silently on every publish), a page's slug is a stable, user-editable
// public identifier - the Worker route needs both the new slug and the
// previously-published one (if renaming) to clean up the old entry and
// reject genuine collisions. See worker/src/index.js's POST /pages/:slug
// handler for the other half of this contract.
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { hashContent } from "./contentHash.js";

const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** A short hash of the page's publish-relevant content (title + blocks).
 * js/pagesController.js stores this on the page (as publishedContentHash)
 * right after a successful publish, then compares a fresh call here against
 * that stored value to tell "live and matches this draft" apart from "live,
 * but you've edited it since" - the Pages equivalent of how a reel's embed
 * id (itself a content hash, see embedExporter.js) already doubles as that
 * signal for Reels. */
export function contentFingerprint(page) {
  return hashContent({ title: page.title, blocks: page.blocks });
}

/** Lowercases, replaces anything not alphanumeric/hyphen with a hyphen, trims/collapses repeats. */
export function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length > 0 && SLUG_PATTERN.test(slug);
}

/** The canonical, shareable public URL for a published slug (extensionless
 * "page", matching player?id=<id>'s clean-URL form - see embedExporter.js). */
export function publicPageUrl(slug) {
  const baseURL = (window.location.origin + window.location.pathname).replace(/index\.html$/, "");
  return `${baseURL}page?slug=${slug}`;
}

/**
 * @param {Object} page - full page draft object
 * @param {string} slug - the slug to publish under
 * @returns {Promise<{ok: boolean, slug: string}>}
 */
export async function publishPage(page, slug) {
  const password = await getBuilderPassword();
  if (!password) {
    throw new Error("A password is required to publish this page.");
  }

  const previousSlug = page.publishedSlug && page.publishedSlug !== slug ? page.publishedSlug : undefined;

  const response = await fetch(`${WORKER_BASE_URL}/pages/${slug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${password}`,
    },
    body: JSON.stringify({
      id: page.id,
      slug,
      previousSlug,
      title: page.title || "",
      blocks: page.blocks || [],
    }),
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password. Please try publishing again.");
  }
  if (response.status === 409) {
    throw new Error(`The URL "/page?slug=${slug}" is already taken by another page - choose a different slug.`);
  }
  if (!response.ok) {
    throw new Error(`Failed to publish page (server responded with status ${response.status}).`);
  }

  return response.json();
}
