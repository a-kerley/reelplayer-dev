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

const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "EM", "U", "H1", "H2", "H3", "A"]);

// execCommand's output tag choice is inconsistent across browsers (some
// produce <b>/<i> instead of <strong>/<em>) - normalized here rather than
// allowlisted separately, so stored content is consistent regardless of
// which browser authored it.
const TAG_ALIASES = { B: "STRONG", I: "EM" };

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
      node.removeAttribute(attr.name);
    });
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!/^(https?:|mailto:|tel:)/i.test(href)) node.removeAttribute("href");
    }

    sanitizeNode(node);
  });
}

/** @param {string} html @returns {string} sanitized HTML, allowlisted to P/BR/STRONG/EM/U/H1-3/A */
export function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeNode(template.content);
  return template.innerHTML;
}
