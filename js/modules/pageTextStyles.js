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

// "playlistItem" has no page-block CSS of its own (unlike h1/h2/h3/body/
// link, it styles nothing directly on the page) - it exists purely as an
// inherit target for a reel's playlist row text style
// (js/modules/playerTextStyles.js) when that reel sits in a Player block on
// this page. applyTextStyles() below still writes its --page-text-* vars
// like any other role; they're just unread by css/page.css itself.
export const ROLES = ["h1", "h2", "h3", "bold", "italic", "underline", "body", "link", "playerTitle", "playerTrackName", "playerTrackSubtitle", "playlistItem", "playlistItemUnselected"];
export const ROLE_LABELS = { h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", bold: "Bold", italic: "Italic", underline: "Underline", body: "Body", link: "Link", playerTitle: "Player Title", playerTrackName: "Player Track Name", playerTrackSubtitle: "Player Track Subtitle", playlistItem: "Playlist Item (Selected)", playlistItemUnselected: "Playlist Item (Unselected)" };

// Roles only a reel's Player Text Styles rows can inherit - like
// playlistItem above, they style nothing on the page itself (css/page.css
// has no [data-text-role] rule for them), so they're kept out of page
// blocks' own role menus via PAGE_TEXT_ROLES below.
export const PLAYER_TEXT_ROLES = ["playerTitle", "playerTrackName", "playerTrackSubtitle", "playlistItem", "playlistItemUnselected"];

// Every role that can be assigned wholesale to something other than
// inline-selected text - the Customize Text Styles dialog's rows
// (js/modules/pageBlocksEditor.js) and the button block's own "Text
// Style" picker both use exactly this set. bold/italic/underline are
// excluded: those are inline toggles applied to a run of selected text
// within a text block (createTextConfig()'s B/I/U buttons), not a style a
// whole block/button can "be" the way h1/h2/h3/body/link can.
export const ASSIGNABLE_TEXT_ROLES = ROLES.filter((role) => !["bold", "italic", "underline"].includes(role));
// What a page block (button, expandable overlay) can actually render a role as.
export const PAGE_TEXT_ROLES = ASSIGNABLE_TEXT_ROLES.filter((role) => !PLAYER_TEXT_ROLES.includes(role));

// Read as both the Customize Text Styles dialog's initial value for every
// field (js/modules/pageBlocksEditor.js) and the "Edit Fallback Text
// Styles" dialog's identical one (js/modules/playerTextStyles.js), plus
// the fallback for both dialogs' own and styleToolbarWidgets.js's
// createTextStyleToolbar()'s role-menu previews - so a role never shows a
// blank placeholder, always a real size/weight/color.
//
// SIZE_PX/WEIGHT still mirror css/page.css's own literal fallback values
// for h1/h2/h3/body (playlistItem has no fixed page.css look to mirror -
// see this file's own comment on the role, above - so its 16/400 is just
// a reasonable starting point, same as css/playlist.css's own
// un-customized .playlist-item). COLOR is deliberately NOT a mirror of
// each role's actual CSS fallback (h1-h3 render white already, but body's
// real default is --page-text-muted's grey and link/playlistItem fall
// back to an accent color, not white) - it's a flat white starting point
// for every role, on purpose, so opening the color picker (or hitting
// Reset) always lands on white rather than a role-specific pre-chosen
// hue.
// Player roles mirror css/player.css / css/playlist.css's own fallbacks
// (title 1.3rem/700, track name 0.9rem/600, selected row 600).
export const ROLE_DEFAULT_SIZE_PX = { h1: 32, h2: 22, h3: 18, body: 16, link: 16, playerTitle: 21, playerTrackName: 14, playerTrackSubtitle: 12, playlistItem: 16, playlistItemUnselected: 16 };
export const ROLE_DEFAULT_WEIGHT = { h1: 700, h2: 700, h3: 600, body: 400, link: 400, playerTitle: 700, playerTrackName: 600, playerTrackSubtitle: 400, playlistItem: 600, playlistItemUnselected: 400 };
// Unitless line-height. Matches the fallbacks baked into css/page.css's
// .page-block-text {h1,h2,h3,p} rules, so an uncustomized role renders
// exactly as before.
export const ROLE_DEFAULT_LINE_HEIGHT = { h1: 1.2, h2: 1.25, h3: 1.3, body: 1.6, link: 1.6, playerTitle: 1.2, playerTrackName: 1.3, playerTrackSubtitle: 1.3, playlistItem: 1.6, playlistItemUnselected: 1.6 };
export const ROLE_DEFAULT_COLOR = { h1: "#ffffff", h2: "#ffffff", h3: "#ffffff", body: "#ffffff", link: "#ffffff", playerTitle: "#ffffff", playerTrackName: "#ffffff", playerTrackSubtitle: "#ffffff", playlistItem: "#ffffff", playlistItemUnselected: "#ffffff" };

// A role with colorFromAccent set follows the accent colour of whatever it
// renders in (a page's page.accent, or a reel/card's --ui-accent) instead of
// its own stored `color`, which is kept so toggling back restores it.
export const DEFAULT_PAGE_ACCENT = "#4a90e2";

// Shared by the builder (playerTextStyles.js, previewManager.js) and
// player.html, so the migration below can't drift between the two.
//
// Before the Playlist row split into Selected/Unselected, one `playlist`
// unit styled every row, but css/playlist.css forced the selected row to
// weight 600 regardless. Copying that unit into playlistUnselected, and
// pinning a Custom selected row to 600, keeps an existing reel rendering
// exactly as before. (A role-based selected row now takes its role's
// weight instead of 600 - no way to pin that without leaving role mode.)
export function ensurePlaylistUnselected(pts) {
  if (pts.playlistUnselected) return;
  // A reel from the brief split playlistItem/playlistDuration format can
  // reach here un-normalized (the Cards tab previews the fetched reel as-is).
  if (!pts.playlist) pts.playlist = pts.playlistItem || {};
  pts.playlistUnselected = { ...pts.playlist };
  if (!pts.playlist.role) pts.playlist.fontWeight = "600";
}

// An untouched Unselected row sets no vars, so css/playlist.css falls back
// to the Selected row's own (see .playlist-item:not(.active)).
export function isTextUnitEmpty(unit) {
  return !unit || !["role", "fontFamily", "fontSize", "fontWeight", "color", "colorFromAccent"].some((key) => unit[key]);
}
export function resolveRoleColor(def, role, accent) {
  return def?.colorFromAccent ? accent : (def?.color || ROLE_DEFAULT_COLOR[role]);
}

// A curated pick, not an open text field - three system/web-safe stacks
// (no network request) plus a spread of Google Fonts across sans/serif/
// display/mono, loaded on demand only for a role that actually selects one
// (see syncGoogleFonts() below), not unconditionally on every page. Each
// entry's own `weights` is the exact static set that family was requested
// from Google Fonts with (its googleFont query string's own "wght@..."
// list) - not just some shared scale every font gets offered regardless of
// whether it actually ships that weight. `weights` is absent for
// system/serif/mono (no Google Fonts request at all - see
// createWeightControl()'s own comment, js/modules/styleToolbarWidgets.js,
// for why that's exactly the "let them type any value" signal).
export const TEXT_FONT_OPTIONS = [
  { value: "system", label: "System Default", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif" },
  { value: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Monospace", stack: "'SF Mono', Menlo, Consolas, monospace" },
  { value: "inter", label: "Inter", stack: "'Inter', sans-serif", googleFont: "Inter:wght@300;400;500;600;700;800", weights: ["300", "400", "500", "600", "700", "800"] },
  { value: "roboto", label: "Roboto", stack: "'Roboto', sans-serif", googleFont: "Roboto:wght@300;400;500;700", weights: ["300", "400", "500", "700"] },
  { value: "opensans", label: "Open Sans", stack: "'Open Sans', sans-serif", googleFont: "Open+Sans:wght@300;400;500;600;700;800", weights: ["300", "400", "500", "600", "700", "800"] },
  { value: "lato", label: "Lato", stack: "'Lato', sans-serif", googleFont: "Lato:wght@300;400;700", weights: ["300", "400", "700"] },
  { value: "montserrat", label: "Montserrat", stack: "'Montserrat', sans-serif", googleFont: "Montserrat:wght@300;400;500;600;700;800", weights: ["300", "400", "500", "600", "700", "800"] },
  { value: "poppins", label: "Poppins", stack: "'Poppins', sans-serif", googleFont: "Poppins:wght@300;400;500;600;700;800", weights: ["300", "400", "500", "600", "700", "800"] },
  { value: "oswald", label: "Oswald", stack: "'Oswald', sans-serif", googleFont: "Oswald:wght@300;400;500;600;700", weights: ["300", "400", "500", "600", "700"] },
  { value: "merriweather", label: "Merriweather", stack: "'Merriweather', serif", googleFont: "Merriweather:wght@300;400;700", weights: ["300", "400", "700"] },
  { value: "playfair", label: "Playfair Display", stack: "'Playfair Display', serif", googleFont: "Playfair+Display:wght@400;500;600;700;800", weights: ["400", "500", "600", "700", "800"] },
  { value: "lora", label: "Lora", stack: "'Lora', serif", googleFont: "Lora:wght@400;500;600;700", weights: ["400", "500", "600", "700"] },
  { value: "jetbrainsmono", label: "JetBrains Mono", stack: "'JetBrains Mono', monospace", googleFont: "JetBrains+Mono:wght@300;400;500;600;700;800", weights: ["300", "400", "500", "600", "700", "800"] },
  { value: "khand", label: "Khand", stack: "'Khand', sans-serif", googleFont: "Khand:wght@300;400;500;600;700", weights: ["300", "400", "500", "600", "700"] },
  { value: "hindsiliguri", label: "Hind Siliguri", stack: "'Hind Siliguri', sans-serif", googleFont: "Hind+Siliguri:wght@300;400;500;600;700", weights: ["300", "400", "500", "600", "700"] },
  { value: "kalam", label: "Kalam", stack: "'Kalam', cursive", googleFont: "Kalam:wght@300;400;700", weights: ["300", "400", "700"] },
  { value: "karma", label: "Karma", stack: "'Karma', serif", googleFont: "Karma:wght@300;400;500;600;700", weights: ["300", "400", "500", "600", "700"] },
  { value: "rajdhani", label: "Rajdhani", stack: "'Rajdhani', sans-serif", googleFont: "Rajdhani:wght@300;400;500;600;700", weights: ["300", "400", "500", "600", "700"] },
  { value: "teko", label: "Teko", stack: "'Teko', sans-serif", googleFont: "Teko:wght@300;400;500;600;700", weights: ["300", "400", "500", "600", "700"] },
];

// Standard OpenType weight-class names, purely for display (e.g. "700
// Bold" in the Weight dropdown) - createWeightControl() below is the only
// consumer.
export const WEIGHT_LABELS = {
  "100": "Thin",
  "200": "Extra Light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "SemiBold",
  "700": "Bold",
  "800": "Extra Bold",
  "900": "Black",
};

// The Weight control (createWeightControl(), js/modules/
// styleToolbarWidgets.js) needs to know, for whatever font is currently
// selected, whether to offer a dropdown of just that font's real static
// weights or let the user type any value - this is the single source of
// truth both the Customize Text Styles dialog and the shared Text Style
// toolbar read it from, rather than each re-deriving it. Falls back to
// TEXT_FONT_OPTIONS[0] (System Default) for an unset/"system" value, same
// convention as fontLabelFor()-style lookups elsewhere in this codebase.
export function fontWeightsFor(fontValue) {
  const font = TEXT_FONT_OPTIONS.find((f) => f.value === (fontValue || "system"));
  return font?.weights || null;
}

// Distinct roles can now pick distinct Google Fonts at once, so this is a
// set of <link>s, not one - every apply call removes whichever of these
// links it previously added, then re-adds exactly the current set. Simpler
// and just as cheap as surgical diffing at this scale (at most 6 roles).
// Fonts are served from our own origin (assets/fonts/, generated by
// scripts/self-host-fonts.py) rather than fonts.googleapis.com, which would
// send every visitor's IP to Google without consent. `googleFont` is still
// the source spec that script downloads from. Root-absolute: this runs in
// player.html (often inside a third-party page's iframe), page.html and the
// builder, all served from the app's own origin.
function selfHostedFontUrl(font) {
  return `/assets/fonts/${font.value}.css`;
}

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
    link.href = selfHostedFontUrl(font);
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
  link.href = selfHostedFontUrl(font);
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

    if (def.colorFromAccent) {
      scopeEl.style.setProperty(`--page-text-${role}-color`, page.accent || DEFAULT_PAGE_ACCENT);
    } else if (def.color) {
      scopeEl.style.setProperty(`--page-text-${role}-color`, def.color);
    } else {
      scopeEl.style.removeProperty(`--page-text-${role}-color`);
    }

    if (def.lineHeight != null) {
      scopeEl.style.setProperty(`--page-text-${role}-line-height`, String(def.lineHeight));
    } else {
      scopeEl.style.removeProperty(`--page-text-${role}-line-height`);
    }
  });

  syncGoogleFonts(neededFonts);
}
