// playerTextStyles.js - "Player Text Styles" builder section: the reel
// title, current-track-name, and playlist row (track name + duration
// together, one shared style) text, each independently either "Custom"
// (its own font/size/weight/color, via the same createTextStyleToolbar()
// widget the
// page button block uses - js/modules/styleToolbarWidgets.js) or set to
// inherit one of the page's named text-style roles (h1/h2/h3/body/link).
// Replaces the older, title-only "Reel Title Appearance" section - see
// reel.playerTextStyles below for the data model and
// ensurePlayerTextStyles() for the one-time migration off the old
// reel.titleAppearance field.
//
// "Inherit" only ever resolves to real values when this reel is actually
// embedded via a page's Player block (js/modules/pageBlockRenderer.js's
// renderPlayer() forwards the embedding page's current role styles as a
// URL param - see js/modules/previewManager.js's resolveTextUnit() and
// player.html's identical copy for the resolution/fallback logic) - a
// reel isn't tied to any one page, so there's no page context here in
// the Reels tab itself, and inherit mode simply falls back to this unit's
// own custom fields (or, if those are unset too, today's hardcoded CSS
// defaults) - the same "still looks good with nothing configured"
// fallback used everywhere else in this feature.
import { ValidationUtils } from "./validation.js";
import { createValueControl } from "./valueControl.js";
import { createToggleSwitch } from "./domUtils.js";
import { REEL_COLOR_DEFAULTS } from "./colorUtils.js";
import { createTextStyleToolbar } from "./styleToolbarWidgets.js";

// Per-unit effective defaults shown in the toolbar when nothing's been
// set - matches css/player.css's own hardcoded fallback values for
// .reel-title/.track-info exactly, so the controls always show what the
// text actually currently looks like, never a blank/generic placeholder.
const TITLE_DEFAULTS = { fontSize: 21, fontWeight: "700" };
const TRACK_NAME_DEFAULTS = { fontSize: 14, fontWeight: "600" };
const PLAYLIST_DEFAULTS = { fontSize: 16, fontWeight: "400" };

let toolbarPickrInstances = [];
function destroyToolbarPickrInstances() {
  toolbarPickrInstances.forEach((p) => p.destroy());
  toolbarPickrInstances = [];
}

// One-time migration off the old reel.titleAppearance (fontSize as a
// pt/rem/px *string*, no font-family/color at all) into
// reel.playerTextStyles.title (fontSize as a plain px *number*, matching
// every other size field in this feature). Runs before this section's
// toolbars are built (createPlayerTextStylesSection() below), not in the
// separate setup() step, since the toolbars need real data to read their
// initial labels from the moment they're constructed - same "convert
// lazily on first touch" shape as the text block's legacy Markdown-body
// migration (pageBlockRenderer.js's renderText()).
function ensurePlayerTextStyles(reel) {
  if (reel.playerTextStyles) {
    const pts = reel.playerTextStyles;
    // A reel saved under the brief window this feature had a split
    // Playlist Item/Duration (two units) instead of one combined
    // `.playlist` unit - back-fill by collapsing onto the Item values
    // (what was actually visible - the track name - over the duration's,
    // which had no separate meaning worth keeping).
    if (!pts.playlist) pts.playlist = pts.playlistItem || {};
    delete pts.playlistItem;
    delete pts.playlistDuration;
    return;
  }

  const ta = reel.titleAppearance || {};
  const parsePx = (value) => {
    if (typeof value !== "string") return undefined;
    if (value.endsWith("px")) return Math.round(parseFloat(value));
    if (value.endsWith("pt")) return Math.round(parseFloat(value) * 1.333);
    if (value.endsWith("rem")) return Math.round(parseFloat(value) * 16);
    return undefined;
  };

  reel.playerTextStyles = {
    title: {
      fontSize: parsePx(ta.fontSize),
      fontWeight: ta.fontWeight,
      align: ta.align,
      paddingBottom: parsePx(ta.paddingBottom),
    },
    trackName: {},
    playlist: {},
  };
  delete reel.titleAppearance;
}

export function createPlayerTextStylesSection(reel, onChange) {
  const old = document.getElementById("playerTextStylesSection");
  if (old) old.remove();

  // Remove original checkbox label from form (same as the old section -
  // the toggle is rebuilt below as part of this fieldset instead).
  const showTitleCheckbox = document.getElementById("reelShowTitle");
  const showTitleLabel = showTitleCheckbox?.closest("label");
  if (showTitleLabel?.parentNode) {
    showTitleLabel.parentNode.removeChild(showTitleLabel);
  }

  ensurePlayerTextStyles(reel);
  destroyToolbarPickrInstances();

  const section = document.createElement("fieldset");
  section.id = "playerTextStylesSection";
  section.style.marginTop = "1.2rem";
  section.style.border = "1px solid #444";
  section.style.borderRadius = "8px";
  section.style.padding = "1rem";

  section.innerHTML = `
    <legend class="builder-section-legend">Player Text Styles</legend>
    <div class="color-row">
      <label for="reelShowTitle" style="cursor:pointer;">Display Reel Title in Player</label>
      <span id="reelShowTitleToggleSlot"></span>
    </div>

    <div id="titleStyleControls">
      <div class="builder-section-legend" style="margin-top:1rem;">Title</div>
      <div id="titleStyleToolbarSlot" style="margin-top:0.4rem;"></div>
      <div style="display:flex;flex-wrap:wrap;gap:1.1rem 2.2rem;margin-top:0.6rem;">
        <label class="appearance-option" style="display:flex;align-items:center;gap:0.7em;">
          Align:
          <span class="icon-toggle-group">
            <span id="reelTitleAlignLeft" class="align-icon" title="Left">
              <span class="material-symbols-outlined">format_align_left</span>
            </span>
            <span id="reelTitleAlignCenter" class="align-icon" title="Center">
              <span class="material-symbols-outlined">format_align_center</span>
            </span>
          </span>
        </label>
        <label class="appearance-option" style="display:flex;align-items:center;gap:0.7em;">
          Padding Below:
          <span id="paddingControlSlot"></span>
        </label>
      </div>
    </div>

    <div class="builder-section-legend" style="margin-top:1.2rem;">Track Name</div>
    <div id="trackNameStyleToolbarSlot" style="margin-top:0.4rem;"></div>

    <div class="builder-section-legend" style="margin-top:1.2rem;">Playlist (track names &amp; lengths)</div>
    <div id="playlistStyleToolbarSlot" style="margin-top:0.4rem;"></div>
  `;

  const showTitleToggle = createToggleSwitch({ id: "reelShowTitle", checked: !!reel.showTitle });
  section.querySelector("#reelShowTitleToggleSlot").replaceWith(showTitleToggle);

  const paddingControl = createValueControl({
    id: "reelTitlePaddingBottom",
    label: "",
    value: reel.playerTextStyles.title.paddingBottom ?? 13,
    min: 0,
    max: 100,
    step: 1,
    unit: "px",
  });
  section.querySelector("#paddingControlSlot").replaceWith(paddingControl.control);

  const defaultColor = () => reel.varUiAccent || REEL_COLOR_DEFAULTS.uiAccent;

  const { toolbar: titleToolbar } = createTextStyleToolbar({
    idPrefix: "reelTitle",
    getRole: () => reel.playerTextStyles.title.role,
    setRole: (role) => { reel.playerTextStyles.title.role = role; },
    getFontFamily: () => reel.playerTextStyles.title.fontFamily,
    setFontFamily: (value) => { reel.playerTextStyles.title.fontFamily = value; },
    getFontSize: () => reel.playerTextStyles.title.fontSize || TITLE_DEFAULTS.fontSize,
    setFontSize: (value) => { reel.playerTextStyles.title.fontSize = value; },
    getFontWeight: () => reel.playerTextStyles.title.fontWeight || TITLE_DEFAULTS.fontWeight,
    setFontWeight: (value) => { reel.playerTextStyles.title.fontWeight = value; },
    getColor: () => reel.playerTextStyles.title.color || defaultColor(),
    setColor: (value) => { reel.playerTextStyles.title.color = value; },
    pickrInstances: toolbarPickrInstances,
    onCommit: onChange,
  });
  section.querySelector("#titleStyleToolbarSlot").appendChild(titleToolbar);

  const { toolbar: trackNameToolbar } = createTextStyleToolbar({
    idPrefix: "reelTrackName",
    getRole: () => reel.playerTextStyles.trackName.role,
    setRole: (role) => { reel.playerTextStyles.trackName.role = role; },
    getFontFamily: () => reel.playerTextStyles.trackName.fontFamily,
    setFontFamily: (value) => { reel.playerTextStyles.trackName.fontFamily = value; },
    getFontSize: () => reel.playerTextStyles.trackName.fontSize || TRACK_NAME_DEFAULTS.fontSize,
    setFontSize: (value) => { reel.playerTextStyles.trackName.fontSize = value; },
    getFontWeight: () => reel.playerTextStyles.trackName.fontWeight || TRACK_NAME_DEFAULTS.fontWeight,
    setFontWeight: (value) => { reel.playerTextStyles.trackName.fontWeight = value; },
    getColor: () => reel.playerTextStyles.trackName.color || defaultColor(),
    setColor: (value) => { reel.playerTextStyles.trackName.color = value; },
    pickrInstances: toolbarPickrInstances,
    onCommit: onChange,
  });
  section.querySelector("#trackNameStyleToolbarSlot").appendChild(trackNameToolbar);

  // Shared control for the whole playlist row (css/playlist.css's
  // .playlist-item-title track name and .playlist-duration length) - one
  // style, not independently configurable, per the original design of this
  // section.
  const { toolbar: playlistToolbar } = createTextStyleToolbar({
    idPrefix: "reelPlaylist",
    getRole: () => reel.playerTextStyles.playlist.role,
    setRole: (role) => { reel.playerTextStyles.playlist.role = role; },
    getFontFamily: () => reel.playerTextStyles.playlist.fontFamily,
    setFontFamily: (value) => { reel.playerTextStyles.playlist.fontFamily = value; },
    getFontSize: () => reel.playerTextStyles.playlist.fontSize || PLAYLIST_DEFAULTS.fontSize,
    setFontSize: (value) => { reel.playerTextStyles.playlist.fontSize = value; },
    getFontWeight: () => reel.playerTextStyles.playlist.fontWeight || PLAYLIST_DEFAULTS.fontWeight,
    setFontWeight: (value) => { reel.playerTextStyles.playlist.fontWeight = value; },
    getColor: () => reel.playerTextStyles.playlist.color || defaultColor(),
    setColor: (value) => { reel.playerTextStyles.playlist.color = value; },
    pickrInstances: toolbarPickrInstances,
    onCommit: onChange,
  });
  section.querySelector("#playlistStyleToolbarSlot").appendChild(playlistToolbar);

  return section;
}

export function setupPlayerTextStylesControls(section, reel, onChange) {
  const title = reel.playerTextStyles.title;

  // Alignment
  const alignLeft = section.querySelector("#reelTitleAlignLeft");
  const alignCenter = section.querySelector("#reelTitleAlignCenter");

  function updateAlignUI() {
    const align = title.align || "center";
    alignLeft.classList.toggle("active", align === "left");
    alignCenter.classList.toggle("active", align === "center");
  }

  alignLeft.onclick = () => {
    title.align = "left";
    updateAlignUI();
    onChange();
  };

  alignCenter.onclick = () => {
    title.align = "center";
    updateAlignUI();
    onChange();
  };

  updateAlignUI();

  // Padding bottom
  const paddingInput = section.querySelector("#reelTitlePaddingBottom");

  paddingInput.oninput = () => {
    const val = paddingInput.value.trim();
    if (val === "") {
      delete title.paddingBottom;
      ValidationUtils.showValidationFeedback(paddingInput, "", true);
      return;
    }
    const validatedPadding = ValidationUtils.validatePadding(val);
    if (validatedPadding) {
      title.paddingBottom = parseInt(validatedPadding, 10);
      ValidationUtils.showValidationFeedback(paddingInput, "", true);
    } else {
      ValidationUtils.showValidationFeedback(
        paddingInput,
        "Padding must be between 0 and 100 pixels",
        false
      );
    }
  };

  paddingInput.onblur = () => {
    onChange();
  };

  // Show title checkbox
  const showTitleCheckbox = section.querySelector("#reelShowTitle");
  showTitleCheckbox.checked = !!reel.showTitle;

  showTitleCheckbox.onchange = () => {
    reel.showTitle = showTitleCheckbox.checked;
    setSectionEnabled(showTitleCheckbox.checked);
    onChange();
  };

  setSectionEnabled(showTitleCheckbox.checked);

  // Scoped to #titleStyleControls, not the whole fieldset - Track Name's
  // own toolbar has nothing to do with whether the title is shown, and
  // must stay fully usable regardless.
  function setSectionEnabled(enabled) {
    const controls = document.getElementById("titleStyleControls");
    if (!controls) return;
    controls.classList.toggle("disabled", !enabled);
  }
}
