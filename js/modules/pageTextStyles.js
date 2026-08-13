// pageTextStyles.js - Per-page text styling (font family/size/weight) for
// a page's text blocks. Same "one apply function, two callers" shape as
// pageBackground.js's applyPageBackground(): page.html and the builder's
// own live preview pane (js/pagesController.js's renderPagePreview()) both
// call applyTextStyles() rather than each hand-rolling the same CSS
// custom-property/font-loading logic.
//
// Values live directly on the page object (page.textFontFamily/
// textFontSize/textFontWeight) - null/unset means "use the page-block-text
// default in css/page.css", so a page saved before this feature existed
// renders identically to before.

// A curated pick, not an open text field - three system/web-safe stacks
// (no network request) plus two Google Fonts, loaded on demand only for a
// page that actually selects one (see ensureGoogleFont() below), not
// unconditionally on every page.
export const TEXT_FONT_OPTIONS = [
  { value: "system", label: "System Default", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif" },
  { value: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Monospace", stack: "'SF Mono', Menlo, Consolas, monospace" },
  { value: "inter", label: "Inter (Google Font)", stack: "'Inter', sans-serif", googleFont: "Inter:wght@400;500;600;700" },
  { value: "merriweather", label: "Merriweather (Google Font)", stack: "'Merriweather', serif", googleFont: "Merriweather:wght@400;700" },
];

const GOOGLE_FONT_LINK_ID = "pageTextGoogleFontLink";

// One shared <link>, keyed by a fixed id - swapped (not duplicated) as the
// selected font changes, whether that's the same page's font field being
// edited live or the builder preview switching between different pages
// with different fonts selected.
function ensureGoogleFont(googleFont) {
  const existing = document.getElementById(GOOGLE_FONT_LINK_ID);
  if (!googleFont) {
    existing?.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${googleFont}&display=swap`;
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement("link");
  link.id = GOOGLE_FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * @param {HTMLElement} scopeEl - element to set the CSS custom properties
 *   on; .page-block-text's font-family/size/weight (css/page.css) read
 *   them via var(...) with a fallback to the current default, so this is
 *   a no-op visually for a page with none of these fields set.
 * @param {Object} page
 */
export function applyTextStyles(scopeEl, page) {
  const font = TEXT_FONT_OPTIONS.find((f) => f.value === page.textFontFamily);
  if (font) {
    scopeEl.style.setProperty("--page-text-font-family", font.stack);
    ensureGoogleFont(font.googleFont || null);
  } else {
    scopeEl.style.removeProperty("--page-text-font-family");
    ensureGoogleFont(null);
  }

  if (page.textFontSize) {
    scopeEl.style.setProperty("--page-text-font-size", `${page.textFontSize}px`);
  } else {
    scopeEl.style.removeProperty("--page-text-font-size");
  }

  if (page.textFontWeight) {
    scopeEl.style.setProperty("--page-text-font-weight", String(page.textFontWeight));
  } else {
    scopeEl.style.removeProperty("--page-text-font-weight");
  }
}
