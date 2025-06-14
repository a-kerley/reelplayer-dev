// builder.js

import { playerApp } from "./player.js";

// Keep track of Pickr instances to destroy them between renders
let pickrInstances = [];

// --- Colour Preset Browser Helpers ---
function loadColourPresets() {
  try {
    const json = localStorage.getItem("colourPresets");
    return json ? JSON.parse(json) : [];
  } catch (e) {
    return [];
  }
}
function saveColourPresets(presets) {
  localStorage.setItem("colourPresets", JSON.stringify(presets));
}
function getDefaultColourPreset() {
  const presets = loadColourPresets();
  return presets.find((p) => p.isDefault) || null;
}

export function createEmptyReel() {
  // If there's a default preset, apply its values
  const defaultPreset = getDefaultColourPreset();
  let reel = {
    id: "reel-" + Date.now(),
    title: "",
    accent: "#2a0026",
    showTitle: true,
    playlist: [{ title: "", url: "" }],
  };
  if (defaultPreset) {
    // Only set if present in preset
    if (defaultPreset.varUiAccent)
      reel.varUiAccent = defaultPreset.varUiAccent;
    if (defaultPreset.varWaveformUnplayed)
      reel.varWaveformUnplayed = defaultPreset.varWaveformUnplayed;
    if (defaultPreset.varWaveformHover)
      reel.varWaveformHover = defaultPreset.varWaveformHover;
  }
  return reel;
}

export function renderBuilder(reel, onChange) {
  // Form elements
  const titleInput = document.getElementById("reelTitle");
  const showTitleCheckbox = document.getElementById("reelShowTitle");
  const reelForm = document.getElementById("reelForm");

  // Helper to enable/disable title appearance controls
  function setTitleAppearanceEnabled(enabled) {
    const fieldset = document.getElementById("reelTitleAppearanceSection");
    if (!fieldset) return;
    if (!enabled) {
      fieldset.classList.add("disabled");
    } else {
      fieldset.classList.remove("disabled");
    }
  }
  // --- Remove old reel title appearance fieldset if present ---
  const oldTitleAppearance = document.getElementById("reelTitleAppearanceSection");
  if (oldTitleAppearance) oldTitleAppearance.remove();

  // --- Remove the original showTitleCheckbox label from the form (will be rendered inside fieldset) ---
  // Find label for showTitleCheckbox as anchor
  const showTitleLabel = showTitleCheckbox.closest("label");
  if (showTitleLabel && showTitleLabel.parentNode) {
    showTitleLabel.parentNode.removeChild(showTitleLabel);
  }

  // Build the fieldset, moving the "Display Reel Title in Player" checkbox inside as the first control
  const titleAppearanceSection = document.createElement("fieldset");
  titleAppearanceSection.id = "reelTitleAppearanceSection";
  titleAppearanceSection.style.marginTop = "1.2rem";
  titleAppearanceSection.style.border = "1px solid #eee";
  titleAppearanceSection.style.borderRadius = "8px";
  titleAppearanceSection.style.padding = "1rem";
  titleAppearanceSection.innerHTML = `
    <legend style="font-size:1.05rem;font-weight:600;color:var(--builder-accent);margin-bottom:0.6em;">Reel Title Appearance</legend>
    <label style="margin-bottom: 1rem; display: block">
      <input type="checkbox" id="reelShowTitle" />
      Display Reel Title in Player
    </label>
    <div style="display:flex;flex-wrap:wrap;gap:1.1rem 2.2rem;">
      <label class="appearance-option" style="display:flex;align-items:center;gap:0.7em;">
        Font Size:
        <input type="number" id="reelTitleFontSizePt" min="8" max="72" step="1" style="width:4em"> pt
      </label>
      <label class="appearance-option" style="display:flex;align-items:center;gap:0.7em;">
        Font Weight:
        <select id="reelTitleFontWeight">
          <option value="400">400</option>
          <option value="600">600</option>
          <option value="700">700</option>
          <option value="800">800</option>
        </select>
      </label>
      <label class="appearance-option" style="display:flex;align-items:center;gap:0.7em;">
        Align:
        <span id="reelTitleAlignLeft" class="align-icon" title="Left">
          <span class="material-symbols-outlined">format_align_left</span>
        </span>
        <span id="reelTitleAlignCenter" class="align-icon" title="Center">
          <span class="material-symbols-outlined">format_align_center</span>
        </span>
      </label>
      <label class="appearance-option" style="display:flex;align-items:center;gap:0.7em;">
        Padding Below:
        <input type="number" id="reelTitlePaddingBottom" min="0" max="100" step="1" style="width:4.5em" /> px
      </label>
    </div>
  `;
  // Insert after title input (so it's the second control in the form)
  if (titleInput && titleInput.parentNode) {
    if (titleInput.parentNode.nextSibling) {
      titleInput.parentNode.parentNode.insertBefore(titleAppearanceSection, titleInput.parentNode.nextSibling);
    } else {
      titleInput.parentNode.parentNode.appendChild(titleAppearanceSection);
    }
  } else {
    // Fallback: append to form start
    reelForm.insertBefore(titleAppearanceSection, reelForm.firstChild);
  }

  // --- Set up value binding for reel.titleAppearance ---
  // Ensure reel.titleAppearance exists
  if (!reel.titleAppearance) {
    reel.titleAppearance = {};
  }
  // Defaults
  const defaultAppearance = {
    fontSize: "1.3rem",
    fontWeight: "700",
    align: "center",
    paddingBottom: "0.8rem"
  };
  // Use values from reel or fallback to defaults
  const ta = reel.titleAppearance;
  // Font size (pt) input
  const fontSizeInput = titleAppearanceSection.querySelector("#reelTitleFontSizePt");
  let ptVal = 11; // default
  if (ta.fontSize && ta.fontSize.endsWith("px")) {
    ptVal = Math.round(parseFloat(ta.fontSize) / 1.333);
  } else if (ta.fontSize && ta.fontSize.endsWith("pt")) {
    ptVal = parseInt(ta.fontSize, 10);
  }
  fontSizeInput.value = ptVal;
  fontSizeInput.oninput = () => {
    // Update local model, do not call onChange yet
    const val = parseInt(fontSizeInput.value, 10) || 11;
    reel.titleAppearance.fontSize = (val * 1.333).toFixed(1) + "px";
  };
  fontSizeInput.onblur = () => {
    onChange();
  };

  // Font Weight
  const fontWeightSelect = titleAppearanceSection.querySelector("#reelTitleFontWeight");
  fontWeightSelect.value = ta.fontWeight || defaultAppearance.fontWeight;
  fontWeightSelect.onchange = () => {
    reel.titleAppearance.fontWeight = fontWeightSelect.value;
    onChange();
  };

  // Align icons
  const alignLeft = titleAppearanceSection.querySelector("#reelTitleAlignLeft");
  const alignCenter = titleAppearanceSection.querySelector("#reelTitleAlignCenter");
  function updateAlignUI() {
    const align = ta.align || "center";
    alignLeft.classList.toggle("active", align === "left");
    alignCenter.classList.toggle("active", align === "center");
  }
  alignLeft.onclick = () => {
    reel.titleAppearance.align = "left";
    updateAlignUI();
    onChange();
  };
  alignCenter.onclick = () => {
    reel.titleAppearance.align = "center";
    updateAlignUI();
    onChange();
  };
  updateAlignUI();

  // paddingBottom
  const paddingInput = titleAppearanceSection.querySelector("#reelTitlePaddingBottom");
  let padVal = ta.paddingBottom;
  if (typeof padVal === "string" && padVal.endsWith("px")) {
    padVal = padVal.slice(0, -2);
  }
  if (!padVal) {
    padVal = defaultAppearance.paddingBottom.replace("rem", "") === defaultAppearance.paddingBottom
      ? parseInt(defaultAppearance.paddingBottom)
      : "";
  }
  if (!ta.paddingBottom && defaultAppearance.paddingBottom.endsWith("rem")) {
    padVal = Math.round(parseFloat(defaultAppearance.paddingBottom) * 16);
  }
  paddingInput.value = padVal || "";
  paddingInput.oninput = () => {
    let val = paddingInput.value.trim();
    if (val !== "" && !isNaN(val)) {
      reel.titleAppearance.paddingBottom = val + "px";
    } else {
      delete reel.titleAppearance.paddingBottom;
    }
    // Do not call onChange here!
  };
  paddingInput.onblur = () => {
    onChange();
  };

  // Destroy old Pickr instances before rendering new ones
  if (pickrInstances.length) {
    pickrInstances.forEach((p) => p.destroy());
    pickrInstances = [];
  }

  // ----- BUILD OR UPDATE THE COLOR PICKER ROWS -----
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
      alpha: 0.13, // special, handled below
    },
  ];

  function hexToRgba(hex, alpha = 1) {
    let c = hex.replace("#", "");
    if (c.length === 3)
      c = c
        .split("")
        .map((x) => x + x)
        .join("");
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${
      num & 255
    },${alpha})`;
  }

  // --- Remove old tracks section and color pickers fieldset if present ---
  // Remove old tracksSection fieldset if it exists
  const oldTracksSection = document.getElementById("tracksSection");
  if (oldTracksSection) oldTracksSection.remove();
  // Remove old color pickers fieldset by id
  const oldColorFieldset = document.getElementById("playerColoursSection");
  if (oldColorFieldset) oldColorFieldset.remove();

  // --- Insert new tracksSection fieldset before color pickers fieldset ---
  // Build tracksSection fieldset
  const tracksSection = document.createElement("fieldset");
  tracksSection.id = "tracksSection";
  tracksSection.style.marginTop = "2rem";
  tracksSection.style.border = "1px solid #eee";
  tracksSection.style.borderRadius = "8px";
  tracksSection.style.padding = "1rem";
  tracksSection.innerHTML = `
    <legend style="font-size:1.1rem;font-weight:600;color:var(--builder-accent)">Tracks</legend>
    <div id="tracksEditor"></div>
  `;
  // Insert tracksSection before color pickers fieldset (which we will add next)
  // Find where to insert: before the next fieldset (which is for Player Colors)
  // We'll insert at the end for now; after that, color pickers will be inserted after tracksSection
  // Find export button to insert before, if any
  const exportBtn = document.getElementById("exportEmbedBtn");
  if (exportBtn) {
    reelForm.insertBefore(tracksSection, exportBtn);
  } else {
    reelForm.appendChild(tracksSection);
  }

  // --- Insert new color pickers fieldset after tracksSection ---
  const colorFieldset = document.createElement("fieldset");
  colorFieldset.id = "playerColoursSection";
  colorFieldset.style.marginTop = "2rem";
  colorFieldset.style.border = "1px solid #eee";
  colorFieldset.style.borderRadius = "8px";
  colorFieldset.style.padding = "1rem";
  // Add legend with preset browser button (SVG)
  colorFieldset.innerHTML = `
    <legend style="font-size:1.1rem;font-weight:600;color:var(--builder-accent);display:flex;align-items:center;gap:0.5rem;">
      Player Colours
      <button id="openPresetBrowserBtn" type="button" title="Browse Colour Presets" style="margin-left:0.6em;background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;padding:0;color:var(--builder-accent);">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:22px;height:22px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </button>
    </legend>
    <div class="color-row">
      <span>UI Accent Colour:</span>
      <button id="pickr-ui-accent" class="pickr-button" type="button"></button>
    </div>
    <div class="color-row">
      <span>Waveform Unplayed Colour:</span>
      <button id="pickr-waveform-unplayed" class="pickr-button" type="button"></button>
    </div>
    <div class="color-row">
      <span>Waveform Hover Colour:</span>
      <button id="pickr-waveform-hover" class="pickr-button" type="button"></button>
    </div>
  `;
  // Insert colorFieldset after tracksSection and before export button
  if (exportBtn) {
    reelForm.insertBefore(colorFieldset, exportBtn);
  } else {
    reelForm.appendChild(colorFieldset);
  }

  // --- Insert modal for preset browser (hidden by default) ---
  let colourPresetModal = document.getElementById("colourPresetModal");
  if (!colourPresetModal) {
    colourPresetModal = document.createElement("div");
    colourPresetModal.id = "colourPresetModal";
    colourPresetModal.style.display = "none";
    document.body.appendChild(colourPresetModal);
  }

  // --- Modal logic ---
  function renderColourPresetModal(currentPickrValues) {
    // currentPickrValues: { varUiAccent, varWaveformUnplayed, varWaveformHover }
    const presets = loadColourPresets();
    function makeSwatch(preset) {
      return `
        <div class="preset-swatch" style="display:inline-block;width:38px;height:22px;border-radius:5px;border:1.5px solid #ccc;vertical-align:middle;background:linear-gradient(to right,${preset.varUiAccent||'#2a0026'},${preset.varWaveformUnplayed||'#929292'},${preset.varWaveformHover||'rgba(0,31,103,0.13)'})"></div>
      `;
    }
    function starIcon(filled) {
      return `<span class="preset-star" data-tooltip="Set as default" style="display:inline-flex;vertical-align:middle;cursor:pointer;color:${filled?'#f4cd2a':'#bbb'};margin-right:0.3em;">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      </span>`;
    }
    function editIcon() {
      return `<span class="preset-edit" data-tooltip="Rename" style="display:inline-flex;vertical-align:middle;cursor:pointer;margin-left:0.4em;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
      </span>`;
    }
    function trashIcon() {
      return `<span class="preset-delete" data-tooltip="Delete" style="display:inline-flex;vertical-align:middle;cursor:pointer;margin-left:0.4em;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
      </span>`;
    }
    function loadBtn() {
      return `<button type="button" class="preset-load-btn" data-tooltip="Load preset" style="margin-left:0.6em;padding:0.13em 0.55em;border-radius:3px;border:1px solid #bbb;background:#f7f7f7;color:#222;font-size:0.76em;cursor:pointer;">Load</button>`;
    }
    let html = `
      <div class="preset-modal-content">
        <div class="preset-modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1em;">
          <span style="font-size:1.15rem;font-weight:700;">Colour Presets</span>
          <button type="button" class="close-preset-modal" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#888;padding:0 0.5em;">&times;</button>
        </div>
        <div class="preset-list" style="max-height:260px;overflow-y:auto;">
    `;
    if (presets.length === 0) {
      html += `<div style="text-align:center;color:#888;font-style:italic;padding:1.1em;">No presets saved yet.</div>`;
    } else {
      presets.forEach((preset, idx) => {
        html += `
          <div class="preset-row" data-idx="${idx}">
            ${makeSwatch(preset)}
            <div class="preset-name-col">
              <span class="preset-name">${preset.name||'(untitled)'}</span>
            </div>
            <div class="preset-actions">
              ${starIcon(!!preset.isDefault)}
              ${editIcon()}
              ${trashIcon()}
              ${loadBtn()}
            </div>
          </div>
        `;
      });
    }
    html += `
        </div>
        <div style="margin-top:1.2em;text-align:right;">
          <button type="button" class="save-current-preset-btn" style="background:var(--ui-accent,#2a0026);color:#fff;font-weight:600;padding:0.5em 1.1em;border-radius:5px;border:none;cursor:pointer;">Save current as preset</button>
        </div>
      </div>
    `;
    colourPresetModal.innerHTML = `<div class="preset-modal-outer">${html}</div>`;
    // Always remove existing overlay before creating a new one
    const existingOverlay = colourPresetModal.querySelector('.preset-modal-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
      colourPresetModal.classList.remove("has-overlay");
    }
    // Now add a fresh overlay each time
    const overlay = document.createElement("div");
    overlay.className = "preset-modal-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,0.22)";
    overlay.style.zIndex = "1001";
    overlay.style.cursor = "pointer";
    overlay.onclick = () => {
      colourPresetModal.style.display = "none";
    };
    colourPresetModal.insertBefore(overlay, colourPresetModal.firstChild);
    colourPresetModal.classList.add("has-overlay");
    // Style modal container
    const modalOuter = colourPresetModal.querySelector(".preset-modal-outer");
    if (modalOuter) {
      modalOuter.style.position = "fixed";
      modalOuter.style.top = "50%";
      modalOuter.style.left = "50%";
      modalOuter.style.transform = "translate(-50%,-50%)";
      modalOuter.style.background = "#fff";
      modalOuter.style.borderRadius = "10px";
      modalOuter.style.boxShadow = "0 6px 32px rgba(60,0,60,0.12)";
      modalOuter.style.padding = "2.1em 2.2em 1.4em 2.2em";
      modalOuter.style.minWidth = "420px";
      modalOuter.style.width = "420px";
      modalOuter.style.minHeight = "150px";
      modalOuter.style.zIndex = "1002";
      modalOuter.style.maxWidth = "98vw";
      modalOuter.style.maxHeight = "90vh";
      modalOuter.style.overflow = "auto";
    }
    // --- Modal event handlers ---
    // Close modal
    colourPresetModal.querySelector(".close-preset-modal").onclick = () => {
      colourPresetModal.style.display = "none";
    };
    // Overlay click closes modal
    colourPresetModal.querySelector(".preset-modal-overlay").onclick = () => {
      colourPresetModal.style.display = "none";
    };
    // Click on preset row elements
    const presetRows = colourPresetModal.querySelectorAll(".preset-row");
    presetRows.forEach((row) => {
      const idx = parseInt(row.getAttribute("data-idx"));
      const preset = presets[idx];
      // Set as default
      row.querySelector(".preset-star").onclick = (e) => {
        e.stopPropagation();
        presets.forEach((p, i) => { p.isDefault = (i === idx); });
        saveColourPresets(presets);
        renderColourPresetModal(currentPickrValues);
      };
      // Rename
      row.querySelector(".preset-edit").onclick = (e) => {
        e.stopPropagation();
        // Only replace the .preset-name span inside .preset-name-col
        const nameCol = row.querySelector(".preset-name-col");
        const nameSpan = nameCol.querySelector(".preset-name");
        const oldName = preset.name || "";
        const input = document.createElement("input");
        input.type = "text";
        input.value = oldName;
        input.style.width = "100%";
        input.style.boxSizing = "border-box";
        input.style.display = "block";
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        function finishRename() {
          preset.name = input.value.trim() || "(untitled)";
          saveColourPresets(presets);
          renderColourPresetModal(currentPickrValues);
        }
        input.onblur = finishRename;
        input.onkeydown = (ev) => {
          if (ev.key === "Enter") input.blur();
        };
      };
      // Delete
      row.querySelector(".preset-delete").onclick = (e) => {
        e.stopPropagation();
        if (confirm("Delete this preset?")) {
          presets.splice(idx, 1);
          saveColourPresets(presets);
          renderColourPresetModal(currentPickrValues);
        }
      };
      // Load (swatch, name, or button)
      row.querySelector(".preset-load-btn").onclick = (e) => {
        e.stopPropagation();
        // Apply preset to pickers (but do not save until refresh preview)
        applyPresetToPickrs(preset);
        colourPresetModal.style.display = "none";
        const refreshBtn = document.getElementById('refreshPreviewBtn');
        if (refreshBtn) refreshBtn.click();
      };
      row.querySelector(".preset-swatch").onclick = (e) => {
        e.stopPropagation();
        applyPresetToPickrs(preset);
        colourPresetModal.style.display = "none";
        const refreshBtn = document.getElementById('refreshPreviewBtn');
        if (refreshBtn) refreshBtn.click();
      };
      row.querySelector(".preset-name").onclick = (e) => {
        e.stopPropagation();
        applyPresetToPickrs(preset);
        colourPresetModal.style.display = "none";
        const refreshBtn = document.getElementById('refreshPreviewBtn');
        if (refreshBtn) refreshBtn.click();
      };
    });
    // Save current as preset
    colourPresetModal.querySelector(".save-current-preset-btn").onclick = () => {
      // Find next available "New Preset", "New Preset 2", etc.
      let base = "New Preset";
      let count = 1;
      let name = base;
      const existing = presets.map(p => p.name);
      while (existing.includes(name)) {
        count += 1;
        name = base + " " + count;
      }
      const newPreset = {
        name,
        varUiAccent: currentPickrValues.varUiAccent,
        varWaveformUnplayed: currentPickrValues.varWaveformUnplayed,
        varWaveformHover: currentPickrValues.varWaveformHover,
        isDefault: false,
      };
      presets.push(newPreset);
      saveColourPresets(presets);
      renderColourPresetModal(currentPickrValues);
      // Focus and select the new preset's name field for renaming
      setTimeout(() => {
        const rows = colourPresetModal.querySelectorAll(".preset-row");
        const idx = presets.length - 1;
        const row = rows[idx];
        if (row) {
          const nameCol = row.querySelector(".preset-name-col");
          if (nameCol) {
            const nameSpan = nameCol.querySelector(".preset-name");
            if (nameSpan) {
              // Replace span with input and focus/select
              const input = document.createElement("input");
              input.type = "text";
              input.value = newPreset.name;
              input.style.width = "100%";
              input.style.boxSizing = "border-box";
              input.style.display = "block";
              nameSpan.replaceWith(input);
              input.focus();
              input.select();
              function finishRename() {
                newPreset.name = input.value.trim() || "(untitled)";
                saveColourPresets(presets);
                renderColourPresetModal(currentPickrValues);
              }
              input.onblur = finishRename;
              input.onkeydown = (ev) => {
                if (ev.key === "Enter") input.blur();
              };
            }
          }
        }
      }, 30);
    };
  }

  // Helper: get pickr values as hex/rgba strings
  function getCurrentPickrValues() {
    return {
      varUiAccent: reel.varUiAccent || "#2a0026",
      varWaveformUnplayed: reel.varWaveformUnplayed || "#929292",
      varWaveformHover: reel.varWaveformHover || "rgba(0, 31, 103, 0.13)",
    };
  }

  // Helper: apply a preset object to pickrs and reel
  function applyPresetToPickrs(preset) {
    // Set the reel properties and update pickr buttons
    if (preset.varUiAccent) reel.varUiAccent = preset.varUiAccent;
    if (preset.varWaveformUnplayed) reel.varWaveformUnplayed = preset.varWaveformUnplayed;
    if (preset.varWaveformHover) reel.varWaveformHover = preset.varWaveformHover;
    // Update pickr UI: set color values directly
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
    // Do not call onChange here (wait for Refresh Preview).
  }

  // --- Modal open/close logic ---
  setTimeout(() => {
    const openBtn = document.getElementById("openPresetBrowserBtn");
    if (openBtn) {
      openBtn.onclick = (e) => {
        e.preventDefault();
        // Render modal content with current pickr values
        renderColourPresetModal(getCurrentPickrValues());
        colourPresetModal.style.display = "block";
      };
    }
    // Escape key closes modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && colourPresetModal.style.display === "block") {
        colourPresetModal.style.display = "none";
      }
    });
  }, 10);

  // Now, proceed with the Pickr setTimeout as before
  setTimeout(() => {
    // console.log("[Pickr] Starting color picker setup...");
    pickrConfigs.forEach((cfg) => {
      const btn = document.getElementById(cfg.id);
      if (!btn) {
        // console.warn("[Pickr] Button not found for id:", cfg.id);
        return;
      }
      // --- CLEANUP: Remove Pickr artifacts from previous instance ---
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.className = "pickr-button";
      btn.removeAttribute("aria-haspopup");
      btn.removeAttribute("aria-expanded");
      btn.removeAttribute("aria-owns");
      btn.removeAttribute("tabindex");
      Object.keys(btn.dataset).forEach((key) => delete btn.dataset[key]);
      delete btn._pickr;
      btn.style.background = cfg.default;
      // console.log(`[Pickr] Cleaned up and ready to attach Pickr for ${cfg.id}`);
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
        // console.log(`[Pickr] Created Pickr for ${cfg.id}`, pickr);
        pickr.on("change", (color, instance) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
          // Only update the button preview, do not update CSS variable or reel property here.
        });
        pickr.on("init", (instance) => {
          const value = pickr.getColor().toRGBA().toString();
          btn.style.background = value;
          // console.log(`[Pickr] Initialized for ${cfg.id}`);
        });
        pickr.on("save", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
          // Update the reel property, call onChange, and hide the picker, but do not set the CSS variable directly.
          reel[cfg.reelKey] = value;
          onChange();
          pickr.hide();
        });
        pickr.on("swatchselect", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
        });
      } catch (e) {
        // console.error(`[Pickr] Error creating Pickr for ${cfg.id}:`, e);
      }
    });
    // console.log("[Pickr] Finished color picker setup.");
  }, 0);

  // Set values, but do NOT clear or replace form HTML!
  titleInput.value = reel.title || "";
  // After re-creating the checkbox inside the fieldset, rebind value and event
  const showTitleCheckboxNew = titleAppearanceSection.querySelector("#reelShowTitle");
  showTitleCheckboxNew.checked = !!reel.showTitle;
  showTitleCheckboxNew.onchange = () => {
    reel.showTitle = showTitleCheckboxNew.checked;
    setTitleAppearanceEnabled(reel.showTitle);
    onChange();
  };
  // Set the initial enabled/disabled state for title appearance controls
  setTitleAppearanceEnabled(showTitleCheckboxNew.checked);
  // Update on input (but don't call onChange on every keystroke to avoid rerender)
  titleInput.oninput = () => {
    reel.title = titleInput.value;
  };
  titleInput.onblur = () => {
    onChange();
  };

  // Playlist track editing
  function updateTracksEditor() {
    function extractFileName(url) {
      if (!url) return "";
      return url
        .split("/")
        .pop()
        .split("?")[0]
        .replace(/[_-]/g, " ")
        .replace(/\.[^/.]+$/, "");
    }
    // Only clear the tracksEditor section inside the new fieldset
    const tracksEditor = document.getElementById("tracksEditor");
    if (!tracksEditor) return;
    tracksEditor.innerHTML = "";
    reel.playlist.forEach((track, i) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "0.5rem";
      row.style.marginBottom = "0.5rem";
      // Only the drag handle can make this row draggable
      row.draggable = false;

      const dragHandle = document.createElement("span");
      dragHandle.className = "track-drag-handle";
      dragHandle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:22px;height:22px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
        </svg>
      `;
      dragHandle.style.cursor = "grab";

      // Only enable dragging when the handle is pressed
      dragHandle.addEventListener("mousedown", (e) => {
        row.draggable = true;
      });
      dragHandle.addEventListener("mouseup", (e) => {
        row.draggable = false;
      });
      dragHandle.addEventListener("mouseleave", (e) => {
        row.draggable = false;
      });

      const titleField = document.createElement("input");
      titleField.type = "text";
      titleField.setAttribute("inputmode", "text");
      titleField.setAttribute("autocomplete", "off");
      titleField.placeholder = "Track title (optional, overrides file name)";
      titleField.value = track.title;
      titleField.size = 32;
      titleField.oninput = (e) => {
        track.title = e.target.value;
        // Do not call onChange on every input to avoid rerender
      };
      titleField.onblur = () => {
        onChange();
      };

      // Filename "fake" display span
      const fileNameSpan = document.createElement("span");
      fileNameSpan.classList.add("filename-display");
      const filenameText = extractFileName(track.url) || "Dropbox link";
      fileNameSpan.textContent = filenameText;
      if (filenameText === "Dropbox link") {
        fileNameSpan.classList.add("placeholder");
      } else {
        fileNameSpan.classList.remove("placeholder");
      }
      fileNameSpan.style.flex = "2";
      // Additional consistent styling for fileNameSpan
      fileNameSpan.style.minWidth = "14rem";
      fileNameSpan.style.maxWidth = "100%";
      fileNameSpan.style.boxSizing = "border-box";
      fileNameSpan.style.padding = "0.35em 0.7em";
      fileNameSpan.style.fontFamily = "inherit";
      fileNameSpan.style.fontSize = "0.8rem";
      fileNameSpan.style.fontWeight = "400";
      fileNameSpan.tabIndex = 0;

      // The actual input field (hidden by default)
      const urlField = document.createElement("input");
      urlField.type = "text";
      urlField.value = track.url;
      urlField.style.flex = "2";
      // Additional consistent styling for urlField
      urlField.style.minWidth = "14rem";
      urlField.style.maxWidth = "100%";
      urlField.style.boxSizing = "border-box";
      urlField.style.padding = "0.35em 0.7em";
      urlField.style.fontFamily = "inherit";
      urlField.style.fontSize = "0.8rem";
      urlField.style.fontWeight = "400";
      urlField.style.display = "none";

      // When you click the filename, show the input and focus it
      fileNameSpan.onclick = () => {
        fileNameSpan.style.display = "none";
        urlField.style.display = "";
        urlField.focus();
      };

      // When input loses focus, go back to the span
      urlField.onblur = () => {
        const filenameText = extractFileName(urlField.value) || "Dropbox link";
        fileNameSpan.textContent = filenameText;
        if (filenameText === "Dropbox link") {
          fileNameSpan.classList.add("placeholder");
        } else {
          fileNameSpan.classList.remove("placeholder");
        }
        fileNameSpan.style.display = "";
        urlField.style.display = "none";
        track.url = urlField.value;
        onChange();
      };

      urlField.oninput = (e) => {
        track.url = e.target.value;
      };

      urlField.addEventListener("keydown", (e) => {
        if (e.key === "Enter") urlField.blur();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "track-remove-btn";
      removeBtn.type = "button";
      removeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      `;
      removeBtn.onclick = () => {
        reel.playlist.splice(i, 1);
        updateTracksEditor();
        onChange();
      };

      row.appendChild(dragHandle);
      row.appendChild(titleField);
      // Instead of row.appendChild(urlField), do:
      row.appendChild(fileNameSpan);
      row.appendChild(urlField);
      if (reel.playlist.length > 1) row.appendChild(removeBtn);

      // Drag events: only allow drag if initiated from handle (row.draggable true)
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", i);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        row.draggable = false;
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        // Remove any existing drop indicators first
        const tracksEditor = document.getElementById("tracksEditor");
        Array.from(tracksEditor.querySelectorAll('.drop-indicator')).forEach(el => el.remove());
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        // If this is the last row, insert after; otherwise, insert before
        if (i === reel.playlist.length - 1) {
          row.parentNode.insertBefore(indicator, row.nextSibling);
        } else {
          row.parentNode.insertBefore(indicator, row);
        }
      });
      row.addEventListener("dragleave", () => {
        const tracksEditor = document.getElementById("tracksEditor");
        Array.from(tracksEditor.querySelectorAll('.drop-indicator')).forEach(el => el.remove());
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const tracksEditor = document.getElementById("tracksEditor");
        Array.from(tracksEditor.querySelectorAll('.drop-indicator')).forEach(el => el.remove());
        const fromIndex = +e.dataTransfer.getData("text/plain");
        const toIndex = i;
        if (fromIndex !== toIndex) {
          const [moved] = reel.playlist.splice(fromIndex, 1);
          reel.playlist.splice(toIndex, 0, moved);
          updateTracksEditor();
          onChange();
        }
      });
      tracksEditor.appendChild(row);
    });

    // Phantom "Add" row
    const addRow = document.createElement("div");
    addRow.className = "phantom-track-row";
    addRow.style.display = "flex";
    addRow.style.gap = "0.5rem";
    addRow.style.alignItems = "center";
    addRow.style.marginBottom = "0.5rem";
    addRow.style.height = "32px"; // Match button height for alignment
    addRow.style.justifyContent = "space-between"; // align button right

    const flexFiller = document.createElement("span");
    flexFiller.style.flex = "1";
    addRow.appendChild(flexFiller);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "track-remove-btn add-btn";
    addBtn.setAttribute("aria-label", "Add track");
    addBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    `;
    addBtn.onclick = () => {
      reel.playlist.push({ title: "", url: "" });
      updateTracksEditor();
      onChange();
    };
    addRow.appendChild(addBtn);

    tracksEditor.appendChild(addRow);
  }

  updateTracksEditor();
}

// Minimal tooltip JS for [data-tooltip] attributes (builder modal actions)
document.addEventListener("DOMContentLoaded", function () {
  let tooltipEl = null;
  let lastTarget = null;
  function showTooltip(e) {
    let target = e.target;
    while (target && target !== document.body && !target.hasAttribute("data-tooltip")) {
      target = target.parentElement;
    }
    if (!target || !target.hasAttribute("data-tooltip")) return;
    const text = target.getAttribute("data-tooltip");
    if (!text) return;
    // Remove any existing tooltip
    if (tooltipEl) tooltipEl.remove();
    tooltipEl = document.createElement("div");
    tooltipEl.className = "custom-tooltip";
    tooltipEl.textContent = text;
    // Apply styles immediately before positioning
    tooltipEl.style.position = "absolute";
    tooltipEl.style.zIndex = "10010";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.background = "#222";
    tooltipEl.style.color = "#fff";
    tooltipEl.style.fontSize = "0.9em";
    tooltipEl.style.padding = "4px 10px";
    tooltipEl.style.borderRadius = "4px";
    tooltipEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.13)";
    tooltipEl.style.opacity = "0.97";
    tooltipEl.style.transition = "opacity 0.13s";
    tooltipEl.style.whiteSpace = "nowrap";
    document.body.appendChild(tooltipEl);
    // Wait a tick for layout, then position
    requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const ttRect = tooltipEl.getBoundingClientRect();
      let top = rect.top + window.scrollY - ttRect.height - 8;
      let left = rect.left + window.scrollX + rect.width / 2 - ttRect.width / 2;
      // Clamp left/right to viewport
      left = Math.max(4, Math.min(left, window.innerWidth - ttRect.width - 4));
      tooltipEl.style.left = left + "px";
      tooltipEl.style.top = top + "px";
    });
    lastTarget = target;
  }
  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
      lastTarget = null;
    }
  }
  document.addEventListener("mouseover", showTooltip, true);
  document.addEventListener("focusin", showTooltip, true);
  document.addEventListener("mouseout", hideTooltip, true);
  document.addEventListener("focusout", hideTooltip, true);
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("mousedown", hideTooltip, true);
});