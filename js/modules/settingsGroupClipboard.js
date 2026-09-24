// settingsGroupClipboard.js - Right-click Copy/Paste Settings on a builder
// settings-group fieldset (Player Mode, Static/Expandable Mode Settings,
// Player Text Styles, Player Colours), so a group's values can be copied
// from one reel and pasted into the same group on another. In-memory only
// (module-level, not persisted) - lost on page reload, same lifetime as the
// rest of the builder's unsaved-until-saveReels() state.
//
// Tracks/playlist is deliberately not a copy/paste-enabled group - it's
// reel content, not settings, and copying whole playlists between reels is
// a different feature.
import { openContextMenuAtCursor } from "./contextMenu.js";
import { showToast } from "./toast.js";

// Keyed by the fieldset's own id - the same ids js/builder.js's
// removeOldSections() already treats as each group's stable identity.
const GROUP_KEYS = {
  playerModeSection: ["mode"],
  staticModeSettings: ["playerHeight"],
  expandableModeSettings: [
    "expandableCollapsedHeight",
    "expandableExpandedHeight",
    "projectTitleImage",
    "showWaveformOnCollapse",
    "enablePlayerClosedIdle",
    "playerClosedIdleVideo",
    "playerClosedIdleOverlayColor",
    "playerClosedIdleOverlayColorEnabled",
    "playerClosedIdleBlur",
  ],
  playerTextStylesSection: ["showTitle", "playerTextStyles"],
  playerColoursSection: [
    "varUiAccent",
    "varWaveformUnplayed",
    "varWaveformHover",
    "backgroundColor",
    "backgroundColorEnabled",
    "backgroundImage",
    "backgroundImageEnabled",
    "backgroundVideo",
    "backgroundVideoEnabled",
    "backgroundZoom",
    "backgroundOpacity",
    "backgroundBlur",
    "overlayColor",
    "overlayColorEnabled",
    "playerOutlineColor",
    "playerOutlineEnabled",
    "playerOutlineWidth",
    "hoverDarkenEnabled",
    "hoverDarkenAmount",
    "hoverDarkenUndarkenOnIdle",
    "idleUnblurEnabled",
    "idleUnblurAmount",
  ],
};

let clipboard = null; // { groupId, groupLabel, values }

function pick(reel, keys) {
  const values = {};
  keys.forEach((key) => { values[key] = reel[key]; });
  return values;
}

/**
 * Wires a right-click Copy/Paste Settings menu onto a settings-group
 * fieldset's legend. No-ops if the fieldset's id isn't one of the groups
 * above (e.g. Tracks, or a Pages/Cards section reusing the same
 * makeSectionCollapsible() helper this is normally called alongside).
 * @param {HTMLFieldSetElement} fieldset
 * @param {Object} reel - the live reel object; paste mutates it in place
 * @param {() => void} onPasteApplied - called after paste mutates `reel`,
 *   so the caller can persist + fully rebuild the form (a partial DOM patch
 *   can't reliably reflect pasted values back into Pickr swatches, sliders,
 *   radios, etc. - see js/main.js's onSettingsPasted()).
 */
export function attachSettingsGroupClipboard(fieldset, reel, onPasteApplied) {
  const keys = GROUP_KEYS[fieldset.id];
  if (!keys) return;

  const legend = fieldset.querySelector(":scope > legend");
  if (!legend) return;

  legend.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const groupLabel = legend.textContent.trim();

    openContextMenuAtCursor(e, [
      {
        label: "Copy Settings",
        onClick: () => {
          clipboard = { groupId: fieldset.id, groupLabel, values: structuredClone(pick(reel, keys)) };
          showToast(`Copied ${groupLabel} settings.`);
        },
      },
      {
        label: "Paste Settings",
        disabled: !clipboard || clipboard.groupId !== fieldset.id,
        onClick: () => {
          Object.assign(reel, structuredClone(clipboard.values));
          onPasteApplied();
          showToast(`Pasted ${clipboard.groupLabel} settings.`);
        },
      },
    ]);
  });
}
