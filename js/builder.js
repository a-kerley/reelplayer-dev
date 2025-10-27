// builder.js

import { playerApp } from "./player.js";
import { getDefaultColourPreset } from "./modules/colorPresets.js";
import { destroyPickrInstances, createColorPickers, getCurrentPickrValues } from "./modules/colorPicker.js";
import { createPresetModal, renderColourPresetModal } from "./modules/presetModal.js";
import { updateTracksEditor } from "./modules/tracksEditor.js";
import { createTitleAppearanceSection, setupTitleAppearanceControls } from "./modules/titleAppearance.js";
import { initTooltips } from "./modules/tooltips.js";
import { ValidationUtils } from "./modules/validation.js";

export function createEmptyReel() {
  // If there's a default preset, apply its values
  const defaultPreset = getDefaultColourPreset();
  let reel = {
    id: "reel-" + Date.now(),
    title: "",
    accent: "#2a0026",
    showTitle: true,
    playlist: [{ title: "", url: "" }],
    createdAt: Date.now(),
    // Background effects properties
    backgroundImage: "",
    backgroundImageEnabled: false,
    backgroundOpacity: "1",
    backgroundBlur: "2",
    overlayColor: "rgba(255, 255, 255, 0.5)",
    overlayColorEnabled: false,
    // Player dimensions
    playerHeight: 500 // Default height in pixels
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
  const reelForm = document.getElementById("reelForm");

  // Destroy old Pickr instances before rendering new ones
  destroyPickrInstances();

  // Remove old sections
  removeOldSections();

  // Create and insert title appearance section
  const titleAppearanceSection = createTitleAppearanceSection(reel, onChange);
  insertTitleAppearanceSection(titleAppearanceSection, titleInput, reelForm);

  // Create tracks section
  const tracksSection = createTracksSection();
  insertTracksSection(tracksSection, reelForm);

  // Create color pickers section
  const colorFieldset = createColorPickersSection();
  insertColorPickersSection(colorFieldset, reelForm);

  // Set up modal
  const colourPresetModal = createPresetModal();
  setupPresetModalEvents(colourPresetModal, reel, onChange);

  // Set up title input
  setupTitleInput(titleInput, reel, onChange);

  // Set up title appearance controls
  setupTitleAppearanceControls(titleAppearanceSection, reel, onChange);

  // Set up tracks editor
  updateTracksEditor(reel, onChange);

  // Set up color pickers
  createColorPickers(reel, onChange);

  // Set up blend mode controls
  setupBlendModeControls(reel, onChange);
}

function removeOldSections() {
  const oldTracksSection = document.getElementById("tracksSection");
  if (oldTracksSection) oldTracksSection.remove();
  
  const oldColorFieldset = document.getElementById("playerColoursSection");
  if (oldColorFieldset) oldColorFieldset.remove();
}

function insertTitleAppearanceSection(titleAppearanceSection, titleInput, reelForm) {
  if (titleInput && titleInput.parentNode) {
    if (titleInput.parentNode.nextSibling) {
      titleInput.parentNode.parentNode.insertBefore(titleAppearanceSection, titleInput.parentNode.nextSibling);
    } else {
      titleInput.parentNode.parentNode.appendChild(titleAppearanceSection);
    }
  } else {
    reelForm.insertBefore(titleAppearanceSection, reelForm.firstChild);
  }
}

function createTracksSection() {
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
  return tracksSection;
}

function insertTracksSection(tracksSection, reelForm) {
  const exportBtn = document.getElementById("exportEmbedBtn");
  if (exportBtn) {
    reelForm.insertBefore(tracksSection, exportBtn);
  } else {
    reelForm.appendChild(tracksSection);
  }
}

function createColorPickersSection() {
  const colorFieldset = document.createElement("fieldset");
  colorFieldset.id = "playerColoursSection";
  colorFieldset.style.marginTop = "2rem";
  colorFieldset.style.border = "1px solid #eee";
  colorFieldset.style.borderRadius = "8px";
  colorFieldset.style.padding = "1rem";
  
  colorFieldset.innerHTML = `
    <legend style="font-size:1.1rem;font-weight:600;color:var(--builder-accent);display:flex;align-items:center;gap:0.5rem;">
      Player Colours & Effects
      <button id="openPresetBrowserBtn" type="button" title="Browse Colour Presets" style="margin-left:0.6em;background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;padding:0;color:var(--builder-accent);">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:22px;height:22px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </button>
    </legend>
    <div class="color-row">
      <span>Background Image:</span>
      <label class="toggle-switch" style="margin-right:0.5rem;">
        <input type="checkbox" id="backgroundImageEnabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="color-row" id="backgroundImageRow" style="opacity:0.5;">
      <span>Background Image URL:</span>
      <input id="backgroundImageUrl" type="url" placeholder="https://example.com/image.jpg" style="flex:1;padding:0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.9rem;" disabled />
    </div>
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
    <div class="blend-modes-section" style="margin-top:1rem;padding-top:1rem;border-top:1px solid #eee;">
      <h4 style="margin:0 0 0.75rem 0;font-size:1rem;font-weight:600;color:var(--builder-accent);">Background Effects</h4>
      <div class="color-row">
        <span>Background Opacity:</span>
        <input id="backgroundOpacity" type="range" min="0" max="1" step="0.1" style="flex:1;" />
        <span id="backgroundOpacityValue" style="min-width:2.5rem;text-align:right;font-size:0.9rem;"></span>
      </div>
      <div class="color-row">
        <span>Blur Amount:</span>
        <input id="backgroundBlur" type="range" min="0" max="20" step="1" style="flex:1;" />
        <span id="backgroundBlurValue" style="min-width:2.5rem;text-align:right;font-size:0.9rem;"></span>
      </div>
      <div class="color-row">
        <span>Player Height:</span>
        <input id="playerHeight" type="number" step="1" style="flex:1;padding:0.25rem;" />
        <span style="min-width:2.5rem;text-align:right;font-size:0.9rem;">px</span>
      </div>
      <div class="color-row">
        <span>Overlay Colour:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="overlayColorEnabled" />
          <span class="toggle-slider"></span>
        </label>
        <button id="pickr-overlay-color" class="pickr-button" type="button" disabled style="opacity:0.5;"></button>
      </div>
    </div>
  `;
  
  return colorFieldset;
}

function insertColorPickersSection(colorFieldset, reelForm) {
  const exportBtn = document.getElementById("exportEmbedBtn");
  if (exportBtn) {
    reelForm.insertBefore(colorFieldset, exportBtn);
  } else {
    reelForm.appendChild(colorFieldset);
  }
}

function setupPresetModalEvents(colourPresetModal, reel, onChange) {
  setTimeout(() => {
    const openBtn = document.getElementById("openPresetBrowserBtn");
    if (openBtn) {
      openBtn.onclick = (e) => {
        e.preventDefault();
        const currentPickrValues = getCurrentPickrValues(reel);
        renderColourPresetModal(currentPickrValues, reel, colourPresetModal);
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
}

function setupTitleInput(titleInput, reel, onChange) {
  titleInput.value = reel.title || "";
  
  titleInput.oninput = () => {
    reel.title = ValidationUtils.validateTitle(titleInput.value);
  };
  
  titleInput.onblur = () => {
    onChange();
  };
}

function setupBlendModeControls(reel, onChange) {
  setTimeout(() => {
    const backgroundImageEnabled = document.getElementById("backgroundImageEnabled");
    const backgroundImageUrl = document.getElementById("backgroundImageUrl");
    const backgroundImageRow = document.getElementById("backgroundImageRow");
    const backgroundOpacity = document.getElementById("backgroundOpacity");
    const backgroundOpacityValue = document.getElementById("backgroundOpacityValue");
    const backgroundBlur = document.getElementById("backgroundBlur");
    const backgroundBlurValue = document.getElementById("backgroundBlurValue");
    const overlayColorEnabled = document.getElementById("overlayColorEnabled");
    const overlayColorButton = document.getElementById("pickr-overlay-color");

    // Set initial values
    if (backgroundImageEnabled) {
      backgroundImageEnabled.checked = reel.backgroundImageEnabled || false;
      
      const updateBackgroundImageState = () => {
        const isEnabled = backgroundImageEnabled.checked;
        backgroundImageUrl.disabled = !isEnabled;
        backgroundImageRow.style.opacity = isEnabled ? "1" : "0.5";
        reel.backgroundImageEnabled = isEnabled;
        // Don't reset the URL - preserve it for when user re-enables
      };
      
      // Set initial state without calling onChange
      updateBackgroundImageState();
      
      // Add event listener with proper debouncing
      backgroundImageEnabled.addEventListener('change', () => {
        updateBackgroundImageState();
        onChange();
      });
    }

    if (backgroundImageUrl) {
      backgroundImageUrl.value = reel.backgroundImage || "";
      let urlTimeout;
      backgroundImageUrl.addEventListener('input', () => {
        // Always update the value regardless of enabled state
        clearTimeout(urlTimeout);
        urlTimeout = setTimeout(() => {
          reel.backgroundImage = ValidationUtils.isValidImageUrl(backgroundImageUrl.value) ? backgroundImageUrl.value : "";
          onChange();
        }, 300);
      });
    }

    if (overlayColorEnabled) {
      overlayColorEnabled.checked = reel.overlayColorEnabled || false;
      
      const updateOverlayColorState = () => {
        const isEnabled = overlayColorEnabled.checked;
        if (overlayColorButton) {
          overlayColorButton.disabled = !isEnabled;
          overlayColorButton.style.opacity = isEnabled ? "1" : "0.5";
        }
        reel.overlayColorEnabled = isEnabled;
        // Don't reset the overlay color - preserve it for when user re-enables
      };
      
      // Set initial state without calling onChange
      updateOverlayColorState();
      
      // Add event listener
      overlayColorEnabled.addEventListener('change', () => {
        updateOverlayColorState();
        onChange();
      });
    }

    if (backgroundOpacity && backgroundOpacityValue) {
      backgroundOpacity.value = reel.backgroundOpacity || "1";
      const updateOpacityDisplay = () => {
        const value = Math.round(backgroundOpacity.value * 100);
        backgroundOpacityValue.textContent = `${value}%`;
      };
      updateOpacityDisplay();
      
      // Listen to input for immediate visual feedback
      backgroundOpacity.addEventListener('input', () => {
        reel.backgroundOpacity = backgroundOpacity.value;
        updateOpacityDisplay();
      });
      
      // Save when user finishes dragging (but don't re-render builder)
      backgroundOpacity.addEventListener('change', () => {
        // Just trigger a save without re-rendering the builder
        if (window.saveReels && window.reels) {
          window.saveReels(window.reels);
        }
      });
    }

    if (backgroundBlur && backgroundBlurValue) {
      backgroundBlur.value = reel.backgroundBlur || "2";
      const updateBlurDisplay = () => {
        const value = backgroundBlur.value;
        backgroundBlurValue.textContent = `${value}px`;
      };
      updateBlurDisplay();
      
      // Listen to input for immediate visual feedback
      backgroundBlur.addEventListener('input', () => {
        reel.backgroundBlur = backgroundBlur.value;
        updateBlurDisplay();
      });
      
      // Save when user finishes dragging (but don't re-render builder)
      backgroundBlur.addEventListener('change', () => {
        // Just trigger a save without re-rendering the builder
        if (window.saveReels && window.reels) {
          window.saveReels(window.reels);
        }
      });
    }

    // Player Height Control
    const playerHeight = document.getElementById("playerHeight");
    if (playerHeight) {
      playerHeight.value = reel.playerHeight || 500;
      
      // Listen to input for immediate visual feedback
      playerHeight.addEventListener('input', () => {
        const value = parseInt(playerHeight.value);
        if (!isNaN(value) && value > 0) {
          reel.playerHeight = value;
          
          // Update preview if available
          if (window.previewManager) {
            window.previewManager.updatePreview(reel);
          }
        }
      });
      
      // Save when user finishes editing
      playerHeight.addEventListener('change', () => {
        if (window.saveReels && window.reels) {
          window.saveReels(window.reels);
        }
      });
    }
  }, 100);
}

// Initialize tooltips when DOM is ready
document.addEventListener("DOMContentLoaded", initTooltips);