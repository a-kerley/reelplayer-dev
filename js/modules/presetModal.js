// presetModal.js - Handles the color preset browser modal

import { loadColourPresets, saveColourPresets } from './colorPresets.js';
import { applyPresetToPickrs } from './colorPicker.js';
import { dialog } from './dialogSystem.js';

export function createPresetModal() {
  let colourPresetModal = document.getElementById("colourPresetModal");
  if (!colourPresetModal) {
    colourPresetModal = document.createElement("div");
    colourPresetModal.id = "colourPresetModal";
    colourPresetModal.style.display = "none";
    document.body.appendChild(colourPresetModal);
  }
  return colourPresetModal;
}

export function renderColourPresetModal(currentPickrValues, reel, colourPresetModal) {
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
        <button type="button" class="save-current-preset-btn" style="background:var(--builder-accent,#000);color:#fff;font-weight:600;padding:0.5em 1.1em;border-radius:5px;border:none;cursor:pointer;">Save current as preset</button>
      </div>
    </div>
  `;
  
  colourPresetModal.innerHTML = `<div class="preset-modal-outer">${html}</div>`;
  
  // Clean up existing overlay
  const existingOverlay = colourPresetModal.querySelector('.preset-modal-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
    colourPresetModal.classList.remove("has-overlay");
  }
  
  // Add overlay
  const overlay = document.createElement("div");
  overlay.className = "preset-modal-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.22)",
    zIndex: "1001",
    cursor: "pointer"
  });
  
  overlay.onclick = () => {
    colourPresetModal.style.display = "none";
  };
  
  colourPresetModal.insertBefore(overlay, colourPresetModal.firstChild);
  colourPresetModal.classList.add("has-overlay");
  
  // Style modal container
  const modalOuter = colourPresetModal.querySelector(".preset-modal-outer");
  if (modalOuter) {
    Object.assign(modalOuter.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 6px 32px rgba(60,0,60,0.12)",
      padding: "2.1em 2.2em 1.4em 2.2em",
      minWidth: "420px",
      width: "420px",
      minHeight: "150px",
      zIndex: "1002",
      maxWidth: "98vw",
      maxHeight: "90vh",
      overflow: "auto"
    });
  }
  
  // Set up event handlers
  setupModalEventHandlers(colourPresetModal, presets, currentPickrValues, reel);
}

function setupModalEventHandlers(colourPresetModal, presets, currentPickrValues, reel) {
  // Close modal
  colourPresetModal.querySelector(".close-preset-modal").onclick = () => {
    colourPresetModal.style.display = "none";
  };

  // Preset row events
  const presetRows = colourPresetModal.querySelectorAll(".preset-row");
  presetRows.forEach((row) => {
    const idx = parseInt(row.getAttribute("data-idx"));
    const preset = presets[idx];
    
    // Set as default
    row.querySelector(".preset-star").onclick = (e) => {
      e.stopPropagation();
      presets.forEach((p, i) => { p.isDefault = (i === idx); });
      saveColourPresets(presets);
      renderColourPresetModal(currentPickrValues, reel, colourPresetModal);
    };
    
    // Rename
    row.querySelector(".preset-edit").onclick = (e) => {
      e.stopPropagation();
      handlePresetRename(row, preset, currentPickrValues, reel, colourPresetModal);
    };
    
    // Delete
    row.querySelector(".preset-delete").onclick = (e) => {
      e.stopPropagation();
      dialog.confirm("Delete this preset?", "Delete", "Cancel").then(confirmed => {
        if (confirmed) {
          presets.splice(idx, 1);
          saveColourPresets(presets);
          renderColourPresetModal(currentPickrValues, reel, colourPresetModal);
        }
      });
    };
    
    // Load preset
    const loadPreset = () => {
      applyPresetToPickrs(preset, reel);
      colourPresetModal.style.display = "none";
      const refreshBtn = document.getElementById('refreshPreviewBtn');
      if (refreshBtn) refreshBtn.click();
    };
    
    row.querySelector(".preset-load-btn").onclick = (e) => {
      e.stopPropagation();
      loadPreset();
    };
    
    row.querySelector(".preset-swatch").onclick = (e) => {
      e.stopPropagation();
      loadPreset();
    };
    
    row.querySelector(".preset-name").onclick = (e) => {
      e.stopPropagation();
      loadPreset();
    };
  });
  
  // Save current as preset
  colourPresetModal.querySelector(".save-current-preset-btn").onclick = () => {
    handleSaveCurrentPreset(presets, currentPickrValues, reel, colourPresetModal);
  };
}

function handlePresetRename(row, preset, currentPickrValues, reel, colourPresetModal) {
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
    saveColourPresets(loadColourPresets());
    renderColourPresetModal(currentPickrValues, reel, colourPresetModal);
  }
  
  input.onblur = finishRename;
  input.onkeydown = (ev) => {
    if (ev.key === "Enter") input.blur();
  };
}

function handleSaveCurrentPreset(presets, currentPickrValues, reel, colourPresetModal) {
  // Find next available name
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
  renderColourPresetModal(currentPickrValues, reel, colourPresetModal);
  
  // Focus new preset for renaming
  setTimeout(() => {
    const rows = colourPresetModal.querySelectorAll(".preset-row");
    const idx = presets.length - 1;
    const row = rows[idx];
    if (row) {
      const nameCol = row.querySelector(".preset-name-col");
      if (nameCol) {
        const nameSpan = nameCol.querySelector(".preset-name");
        if (nameSpan) {
          handlePresetRename(row, newPreset, currentPickrValues, reel, colourPresetModal);
        }
      }
    }
  }, 30);
}
