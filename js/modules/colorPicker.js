// colorPicker.js - Handles Pickr color picker functionality
import { REEL_COLOR_DEFAULTS } from "./colorUtils.js";

let pickrInstances = [];

export function destroyPickrInstances() {
  if (pickrInstances.length) {
    pickrInstances.forEach((p) => p.destroy());
    pickrInstances = [];
  }
}

export function createColorPickers(reel, onChange) {
  const pickrConfigs = [
    {
      id: "pickr-ui-accent",
      var: "--ui-accent",
      default: reel.varUiAccent || REEL_COLOR_DEFAULTS.uiAccent,
      reelKey: "varUiAccent",
    },
    {
      id: "pickr-waveform-unplayed",
      var: "--waveform-unplayed",
      default: reel.varWaveformUnplayed || REEL_COLOR_DEFAULTS.waveformUnplayed,
      reelKey: "varWaveformUnplayed",
    },
    {
      id: "pickr-waveform-hover",
      var: "--waveform-hover",
      default: reel.varWaveformHover || REEL_COLOR_DEFAULTS.waveformHoverHex,
      reelKey: "varWaveformHover",
      alpha: 0.13,
    },
    {
      id: "pickr-background-color",
      var: "--background-color",
      default: reel.backgroundColor || REEL_COLOR_DEFAULTS.backgroundColor,
      reelKey: "backgroundColor",
    },
    {
      id: "pickr-outline-color",
      var: "--player-outline-color",
      default: reel.playerOutlineColor || REEL_COLOR_DEFAULTS.outlineColor,
      reelKey: "playerOutlineColor",
    },
    {
      id: "pickr-overlay-color",
      var: "--overlay-color",
      default: reel.overlayColor || REEL_COLOR_DEFAULTS.overlayColor,
      reelKey: "overlayColor",
    },
    {
      id: "pickr-player-closed-idle-overlay-color",
      var: "--player-closed-idle-overlay-base-color",
      default: reel.playerClosedIdleOverlayColor || REEL_COLOR_DEFAULTS.playerClosedIdleOverlayColor,
      reelKey: "playerClosedIdleOverlayColor",
    },
  ];

  // Create Pickr instances with a small delay for DOM readiness
  setTimeout(() => {
    pickrConfigs.forEach((cfg) => {
      const btn = document.getElementById(cfg.id);
      if (!btn) return;

      // Cleanup previous instance
      cleanupPickrButton(btn, cfg.default);

      try {
        const pickr = Pickr.create({
          el: btn,
          theme: "nano",
          default: cfg.default,
          swatches: [
            REEL_COLOR_DEFAULTS.uiAccent,
            REEL_COLOR_DEFAULTS.waveformHoverHex,
            "#219e36",
            "#b00000",
            "#f4cd2a",
            "#ffffff",
            "#000000",
          ],
          components: {
            preview: true,
            opacity: true,
            hue: true,
            interaction: {
              hex: true,
              rgba: true,
              input: true,
              save: true,
            },
          },
        });

        pickrInstances.push(pickr);

        // Event handlers
        // "change" fires continuously while dragging inside the popup -
        // unlike every other field in the builder, a color's actual reel
        // field/persisted save only happens on "save" below (Pickr's own
        // explicit save-button interaction model, kept as-is). This still
        // live-updates the preview iframe while dragging, matching every
        // other control, by writing straight to the reel field (same
        // "input mutates local state immediately" pattern every slider
        // here already uses) and scheduling a save-free preview refresh -
        // if the popup is dismissed without clicking "save", this value
        // simply sits uncommitted until either a real save happens
        // elsewhere or the reel is reloaded, exactly like an abandoned
        // slider drag today.
        pickr.on("change", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
          reel[cfg.reelKey] = value;
          if (window.schedulePreviewRefresh) window.schedulePreviewRefresh();
        });

        pickr.on("init", () => {
          const value = pickr.getColor().toRGBA().toString();
          btn.style.background = value;
        });

        pickr.on("save", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
          reel[cfg.reelKey] = value;
          onChange();
          pickr.hide();
        });

        pickr.on("swatchselect", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
        });
      } catch (e) {
        console.error(`Error creating Pickr for ${cfg.id}:`, e);
      }
    });
  }, 0);
}

function cleanupPickrButton(btn, defaultColor) {
  while (btn.firstChild) btn.removeChild(btn.firstChild);
  btn.className = "pickr-button";
  btn.removeAttribute("aria-haspopup");
  btn.removeAttribute("aria-expanded");
  btn.removeAttribute("aria-owns");
  btn.removeAttribute("tabindex");
  Object.keys(btn.dataset).forEach((key) => delete btn.dataset[key]);
  delete btn._pickr;
  btn.style.background = defaultColor;
}

export function applyPresetToPickrs(preset, reel) {
  // Set the reel properties and update pickr buttons
  if (preset.varUiAccent) reel.varUiAccent = preset.varUiAccent;
  if (preset.varWaveformUnplayed) reel.varWaveformUnplayed = preset.varWaveformUnplayed;
  if (preset.varWaveformHover) reel.varWaveformHover = preset.varWaveformHover;
  
  // Update pickr UI
  pickrInstances.forEach((pickr) => {
    if (pickr.options && pickr.options.el && pickr.options.el.id) {
      if (pickr.options.el.id === "pickr-ui-accent") {
        pickr.setColor(preset.varUiAccent || REEL_COLOR_DEFAULTS.uiAccent);
      } else if (pickr.options.el.id === "pickr-waveform-unplayed") {
        pickr.setColor(preset.varWaveformUnplayed || REEL_COLOR_DEFAULTS.waveformUnplayed);
      } else if (pickr.options.el.id === "pickr-waveform-hover") {
        pickr.setColor(preset.varWaveformHover || REEL_COLOR_DEFAULTS.waveformHoverRgba);
      }
    }
  });
}

export function getCurrentPickrValues(reel) {
  return {
    varUiAccent: reel.varUiAccent || REEL_COLOR_DEFAULTS.uiAccent,
    varWaveformUnplayed: reel.varWaveformUnplayed || REEL_COLOR_DEFAULTS.waveformUnplayed,
    varWaveformHover: reel.varWaveformHover || REEL_COLOR_DEFAULTS.waveformHoverRgba,
  };
}
