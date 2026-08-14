// htmlSanitizer.js - Strict allowlist HTML sanitizer for the text block's
// contenteditable editor (js/modules/pageBlocksEditor.js) and its render
// path (js/modules/pageBlockRenderer.js). Called at BOTH points - a stored
// value is never trusted just because it was sanitized once already; the
// render-time call is the real security boundary, since that's what
// anonymous visitors' browsers execute on the public page.
//
// Parses into a detached <template> rather than a live element - a
// template's `.content` is an inert DocumentFragment: embedded <script>
// tags never execute and event-handler attributes never fire on
// disconnected, non-rendered nodes, so parsing untrusted input this way is
// itself safe. Nothing here is inserted into the real document until every
// disallowed tag/attribute has already been stripped.

import { TEXT_FONT_OPTIONS } from "./pageTextStyles.js";

// SPAN is the one allowed tag that carries an attribute besides <A>'s href -
// js/modules/pageBlocksEditor.js's ad hoc font/size/color toolbar controls
// wrap a selection in <span style="..."> (never via execCommand, whose
// output for these is inconsistent across browsers - see that file), so
// this sanitizer has to actually validate `style`, not just strip it like
// every other attribute.
const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "EM", "U", "H1", "H2", "H3", "A", "SPAN"]);

// execCommand's output tag choice is inconsistent across browsers (some
// produce <b>/<i> instead of <strong>/<em>) - normalized here rather than
// allowlisted separately, so stored content is consistent regardless of
// which browser authored it.
const TAG_ALIASES = { B: "STRONG", I: "EM" };

// Exact-match only, not a free-text font-family - same curated stacks the
// per-page style roles use (js/modules/pageTextStyles.js), so an inline
// span can never smuggle in an arbitrary font-family value.
const ALLOWED_FONT_FAMILIES = new Set(TEXT_FONT_OPTIONS.map((f) => f.stack));

// Browsers normalize a color set via JS (`el.style.color = '#ff0000'`) to
// rgb(...) when the style attribute is read back out - both forms are
// accepted since either could show up depending on browser.
const COLOR_RE = /^(#[0-9a-f]{6}|rgb\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}\s*\))$/i;
const FONT_SIZE_RE = /^(\d{1,3})px$/;

// Rebuilds `<span style="...">` from scratch, keeping only
// color/font-family/font-size, each independently validated - never trusts
// the CSS text itself, only specific properties read via the already-
// browser-parsed CSSStyleDeclaration (node.style), each checked against a
// strict allowlist/pattern before being written back.
function sanitizeSpanStyle(node) {
  const { color, fontFamily, fontSize } = node.style;
  node.removeAttribute("style");
  if (color && COLOR_RE.test(color)) node.style.color = color;
  if (fontFamily && ALLOWED_FONT_FAMILIES.has(fontFamily)) node.style.fontFamily = fontFamily;
  if (fontSize && FONT_SIZE_RE.test(fontSize)) {
    const px = parseInt(fontSize, 10);
    if (px >= 8 && px <= 96) node.style.fontSize = fontSize;
  }
  return node.style.length > 0;
}

function sanitizeNode(parent) {
  Array.from(parent.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType !== Node.ELEMENT_NODE) {
      parent.removeChild(node);
      return;
    }

    const alias = TAG_ALIASES[node.tagName];
    if (alias) {
      const replacement = node.ownerDocument.createElement(alias);
      while (node.firstChild) replacement.appendChild(node.firstChild);
      parent.replaceChild(replacement, node);
      sanitizeNode(replacement);
      return;
    }

    if (!ALLOWED_TAGS.has(node.tagName)) {
      // Unwrap, not delete - keep the text content, drop just the tag.
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      sanitizeNode(parent);
      return;
    }

    Array.from(node.attributes).forEach((attr) => {
      if (node.tagName === "A" && attr.name === "href") return;
      if (node.tagName === "SPAN" && attr.name === "style") return;
      node.removeAttribute(attr.name);
    });
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!/^(https?:|mailto:|tel:)/i.test(href)) node.removeAttribute("href");
    }
    if (node.tagName === "SPAN" && !sanitizeSpanStyle(node)) {
      // Nothing about this span survived validation - it's now a bare,
      // pointless wrapper, so drop it the same way a disallowed tag would be.
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      sanitizeNode(parent);
      return;
    }

    sanitizeNode(node);
  });
}

/** @param {string} html @returns {string} sanitized HTML, allowlisted to P/BR/STRONG/EM/U/H1-3/A/SPAN[style] */
export function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeNode(template.content);
  return template.innerHTML;
}
