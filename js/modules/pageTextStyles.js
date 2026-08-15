// pageTextStyles.js - Per-page, per-role text styling for a page's text
// blocks - a fixed set of named styles mirroring Markdown's vocabulary
// (Heading 1/2/3, Bold, Italic, Body; see ROLES below), each independently
// customizable per page via js/modules/pageBlocksEditor.js's "Customize
// Styles..." popup. Same "one apply function, two callers" shape as
// pageBackground.js's applyPageBackground(): page.html and the builder's
// own live preview pane (js/pagesController.js's renderPagePreview()) both
// call applyTextStyles() rather than each hand-rolling the same CSS
// custom-property/font-loading logic.
//
// Values live in page.textStyleDefs[role] = {fontFamily?, fontSize?,
// fontWeight?, color?} - an unset role, or an unset property within one,
// means "use the css/page.css default for that role", so a page saved
// before this feature (or before a given role was ever customized) renders
// identically to before.

export const ROLES = ["h1", "h2", "h3", "bold", "italic", "underline", "body", "link"];
export const ROLE_LABELS = { h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", bold: "Bold", italic: "Italic", underline: "Underline", body: "Body", link: "Link" };

// Every role that can be assigned wholesale to something other than
// inline-selected text - the Customize Text Styles dialog's rows
// (js/modules/pageBlocksEditor.js) and the button block's own "Text
// Style" picker both use exactly this set. bold/italic/underline are
// excluded: those are inline toggles applied to a run of selected text
// within a text block (createTextConfig()'s B/I/U buttons), not a style a
// whole block/button can "be" the way h1/h2/h3/body/link can.
export const ASSIGNABLE_TEXT_ROLES = ROLES.filter((role) => !["bold", "italic", "underline"].includes(role));

// A curated pick, not an open text field - three system/web-safe stacks
// (no network request) plus two Google Fonts, loaded on demand only for a
// role that actually selects one (see syncGoogleFonts() below), not
// unconditionally on every page.
export const TEXT_FONT_OPTIONS = [
  { value: "system", label: "System Default", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif" },
  { value: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Monospace", stack: "'SF Mono', Menlo, Consolas, monospace" },
  { value: "inter", label: "Inter (Google Font)", stack: "'Inter', sans-serif", googleFont: "Inter:wght@400;500;600;700" },
  { value: "merriweather", label: "Merriweather (Google Font)", stack: "'Merriweather', serif", googleFont: "Merriweather:wght@400;700" },
];

// Distinct roles can now pick distinct Google Fonts at once, so this is a
// set of <link>s, not one - every apply call removes whichever of these
// links it previously added, then re-adds exactly the current set. Simpler
// and just as cheap as surgical diffing at this scale (at most 6 roles).
function syncGoogleFonts(neededFontValues) {
  document.querySelectorAll("link[data-page-text-font]").forEach((el) => el.remove());
  const seen = new Set();
  neededFontValues.forEach((fontValue) => {
    const font = TEXT_FONT_OPTIONS.find((f) => f.value === fontValue);
    if (!font?.googleFont || seen.has(font.googleFont)) return;
    seen.add(font.googleFont);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.pageTextFont = font.googleFont;
    link.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`;
    document.head.appendChild(link);
  });
}

// Ad hoc, per-selection font choices (js/modules/pageBlocksEditor.js's
// inline font toolbar control, applied via a <span style="font-family:...">
// rather than a page-wide role) need the same Google Font loaded on
// demand, but can't share syncGoogleFonts()'s link set above - that
// function wipes and rebuilds its own links on every applyTextStyles()
// call, which would silently rip out a font an inline span still needs the
// next time any role is edited. Kept deliberately simple: additive only,
// keyed by font value, never removed - a page that's ever used a Google
// Font inline keeps that stylesheet loaded for the rest of the session,
// which costs nothing further once fetched.
export function ensureInlineGoogleFont(fontValue) {
  const font = TEXT_FONT_OPTIONS.find((f) => f.value === fontValue);
  if (!font?.googleFont) return;
  if (document.querySelector(`link[data-inline-text-font="${font.googleFont}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.inlineTextFont = font.googleFont;
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`;
  document.head.appendChild(link);
}

/**
 * @param {HTMLElement} scopeEl - element to set the CSS custom properties
 *   on; .page-block-text's per-role rules (css/page.css) read them via
 *   var(...) with a fallback to that role's current default, so this is a
 *   no-op visually for a page/role with nothing customized.
 * @param {Object} page
 */
export function applyTextStyles(scopeEl, page) {
  const defs = page.textStyleDefs || {};
  const neededFonts = [];

  ROLES.forEach((role) => {
    const def = defs[role] || {};
    const font = TEXT_FONT_OPTIONS.find((f) => f.value === def.fontFamily);

    if (font) {
      scopeEl.style.setProperty(`--page-text-${role}-font-family`, font.stack);
      neededFonts.push(font.value);
    } else {
      scopeEl.style.removeProperty(`--page-text-${role}-font-family`);
    }

    if (def.fontSize) {
      scopeEl.style.setProperty(`--page-text-${role}-font-size`, `${def.fontSize}px`);
    } else {
      scopeEl.style.removeProperty(`--page-text-${role}-font-size`);
    }

    if (def.fontWeight) {
      scopeEl.style.setProperty(`--page-text-${role}-font-weight`, String(def.fontWeight));
    } else {
      scopeEl.style.removeProperty(`--page-text-${role}-font-weight`);
    }

    if (def.color) {
      scopeEl.style.setProperty(`--page-text-${role}-color`, def.color);
    } else {
      scopeEl.style.removeProperty(`--page-text-${role}-color`);
    }
  });

  syncGoogleFonts(neededFonts);
}
