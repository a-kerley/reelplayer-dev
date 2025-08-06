// colorPicker.js - Handles Pickr color picker functionality

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
      default: reel.varUiAccent || "#2a0026",
      reelKey: "varUiAccent",
    },
    {
      id: "pickr-waveform-unplayed",
      var: "--waveform-unplayed",
      default: reel.varWaveformUnplayed || "#929292",
      reelKey: "varWaveformUnplayed",
    },
    {
      id: "pickr-waveform-hover",
      var: "--waveform-hover",
      default: reel.varWaveformHover || "#001f67",
      reelKey: "varWaveformHover",
      alpha: 0.13,
    },
    {
      id: "pickr-overlay-color",
      var: "--overlay-color",
      default: reel.overlayColor || "rgba(255, 255, 255, 0.5)",
      reelKey: "overlayColor",
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
            "#2a0026",
            "#001f67",
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
        pickr.on("change", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
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
        pickr.setColor(preset.varUiAccent || "#2a0026");
      } else if (pickr.options.el.id === "pickr-waveform-unplayed") {
        pickr.setColor(preset.varWaveformUnplayed || "#929292");
      } else if (pickr.options.el.id === "pickr-waveform-hover") {
        pickr.setColor(preset.varWaveformHover || "rgba(0, 31, 103, 0.13)");
      }
    }
  });
}

export function getCurrentPickrValues(reel) {
  return {
    varUiAccent: reel.varUiAccent || "#2a0026",
    varWaveformUnplayed: reel.varWaveformUnplayed || "#929292",
    varWaveformHover: reel.varWaveformHover || "rgba(0, 31, 103, 0.13)",
  };
}
