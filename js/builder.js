// builder.js - Main builder orchestration and reel management

import { playerApp } from "./player.js";
import { getDefaultColourPreset } from "./modules/colorPresets.js";
import { destroyPickrInstances, createColorPickers, getCurrentPickrValues } from "./modules/colorPicker.js";
import { createPresetModal, renderColourPresetModal } from "./modules/presetModal.js";
import { updateTracksEditor } from "./modules/tracksEditor.js";
import { createTitleAppearanceSection, setupTitleAppearanceControls } from "./modules/titleAppearance.js";
import { initTooltips } from "./modules/tooltips.js";
import { ValidationUtils } from "./modules/validation.js";
import { 
  createPlayerModeSection, 
  setupPlayerModeControls,
  createStaticModeSettings,
  setupStaticModeSettings,
  createExpandableModeSettings,
  setupExpandableModeSettings
} from "./modules/expandableMode.js";
import { createFieldset, removeElementsByIds } from "./modules/domUtils.js";
import { renderPerTrackBackgrounds } from "./modules/backgroundEffects.js";

/**
 * Creates a new empty reel with default configuration
 * @returns {Object} New reel object
 */
export function createEmptyReel() {
  const defaultPreset = getDefaultColourPreset();
  
  const reel = {
    id: "reel-" + Date.now(),
    title: "",
    accent: "#2a0026",
    showTitle: true,
    playlist: [{ title: "", url: "" }],
    createdAt: Date.now(),
    // Background effects
    backgroundColor: "rgba(255, 255, 255, 1)",
    backgroundImage: "",
    backgroundImageEnabled: false,
    backgroundVideo: "",
    backgroundVideoEnabled: false,
    backgroundZoom: 1,
    backgroundOpacity: "1",
    backgroundBlur: "2",
    overlayColor: "rgba(255, 255, 255, 0.5)",
    overlayColorEnabled: false,
    // Player configuration
    playerHeight: 500,
    mode: "static",
    // Expandable mode settings
    expandableCollapsedHeight: 120,
    expandableExpandedHeight: 500,
    projectTitleImage: "",
    showWaveformOnCollapse: true,
    enablePlayerClosedIdle: false,
    playerClosedIdleVideo: ""
  };
  
  // Apply default preset colors if available
  if (defaultPreset) {
    if (defaultPreset.varUiAccent) reel.varUiAccent = defaultPreset.varUiAccent;
    if (defaultPreset.varWaveformUnplayed) reel.varWaveformUnplayed = defaultPreset.varWaveformUnplayed;
    if (defaultPreset.varWaveformHover) reel.varWaveformHover = defaultPreset.varWaveformHover;
  }
  
  return reel;
}

/**
 * Renders the builder UI for the given reel
 * @param {Object} reel - Reel configuration object
 * @param {Function} onChange - Callback when reel changes
 */
export function renderBuilder(reel, onChange) {
  const titleInput = document.getElementById("reelTitle");
  const reelForm = document.getElementById("reelForm");

  // Clean up old instances and sections
  destroyPickrInstances();
  removeOldSections();

  // Create and insert all sections in order
  const playerModeSection = createPlayerModeSection(reel, onChange);
  insertPlayerModeSection(playerModeSection, titleInput, reelForm);

  const staticModeSettings = createStaticModeSettings(reel, onChange);
  insertStaticModeSettings(staticModeSettings, playerModeSection, reelForm);

  const expandableModeSettings = createExpandableModeSettings(reel, onChange);
  insertExpandableModeSettings(expandableModeSettings, staticModeSettings, reelForm);

  const titleAppearanceSection = createTitleAppearanceSection(reel, onChange);
  insertTitleAppearanceSection(titleAppearanceSection, expandableModeSettings, reelForm);

  const tracksSection = createTracksSection();
  insertTracksSection(tracksSection, reelForm);

  const colorFieldset = createColorPickersSection();
  insertColorPickersSection(colorFieldset, reelForm);

  // Set up preset modal
  const colourPresetModal = createPresetModal();
  setupPresetModalEvents(colourPresetModal, reel, onChange);

  // Set up title input
  setupTitleInput(titleInput, reel, onChange);

  // Set up player mode controls
  setupPlayerModeControls(playerModeSection, reel, onChange);

  // Set up static mode settings
  setupStaticModeSettings(staticModeSettings, reel, onChange);

  // Set up expandable mode settings
  setupExpandableModeSettings(expandableModeSettings, reel, onChange);

  // Set up title appearance controls
  setupTitleAppearanceControls(titleAppearanceSection, reel, onChange);

  // Set up tracks editor with callback to update per-track backgrounds
  const onChangeWithBackgrounds = () => {
    onChange();
    // Also update per-track backgrounds list when playlist changes
    setTimeout(() => renderPerTrackBackgrounds(reel, onChange), 50);
  };
  updateTracksEditor(reel, onChangeWithBackgrounds);

  // Set up color pickers
  createColorPickers(reel, onChange);

  // Set up blend mode controls
  setupBlendModeControls(reel, onChange);
}

/**
 * Removes old builder sections before re-rendering
 */
function removeOldSections() {
  removeElementsByIds([
    "playerModeSection",
    "staticModeSettings",
    "expandableModeSettings",
    "tracksSection",
    "playerColoursSection"
  ]);
}

function insertPlayerModeSection(playerModeSection, titleInput, reelForm) {
  // Insert after the show title checkbox
  const showTitleCheckbox = document.getElementById("reelShowTitle");
  if (showTitleCheckbox && showTitleCheckbox.parentNode) {
    if (showTitleCheckbox.parentNode.nextSibling) {
      reelForm.insertBefore(playerModeSection, showTitleCheckbox.parentNode.nextSibling);
    } else {
      reelForm.appendChild(playerModeSection);
    }
  } else if (titleInput && titleInput.parentNode) {
    if (titleInput.parentNode.nextSibling) {
      reelForm.insertBefore(playerModeSection, titleInput.parentNode.nextSibling);
    } else {
      reelForm.appendChild(playerModeSection);
    }
  } else {
    reelForm.insertBefore(playerModeSection, reelForm.firstChild);
  }
}

function insertStaticModeSettings(staticModeSettings, playerModeSection, reelForm) {
  if (playerModeSection && playerModeSection.nextSibling) {
    reelForm.insertBefore(staticModeSettings, playerModeSection.nextSibling);
  } else {
    reelForm.appendChild(staticModeSettings);
  }
}

function insertExpandableModeSettings(expandableModeSettings, staticModeSettings, reelForm) {
  if (staticModeSettings && staticModeSettings.nextSibling) {
    reelForm.insertBefore(expandableModeSettings, staticModeSettings.nextSibling);
  } else {
    reelForm.appendChild(expandableModeSettings);
  }
}

function insertTitleAppearanceSection(titleAppearanceSection, expandableModeSettings, reelForm) {
  if (expandableModeSettings && expandableModeSettings.nextSibling) {
    reelForm.insertBefore(titleAppearanceSection, expandableModeSettings.nextSibling);
  } else {
    reelForm.appendChild(titleAppearanceSection);
  }
}

/**
 * Creates the tracks editor section
 * @returns {HTMLFieldSetElement}
 */
function createTracksSection() {
  return createFieldset({
    id: "tracksSection",
    legend: "Tracks",
    content: '<div id="tracksEditor"></div>'
  });
}

function insertTracksSection(tracksSection, reelForm) {
  const exportBtn = document.getElementById("exportEmbedBtn");
  if (exportBtn) {
    reelForm.insertBefore(tracksSection, exportBtn);
  } else {
    reelForm.appendChild(tracksSection);
  }
}

/**
 * Creates the color pickers and background effects section
 * @returns {HTMLFieldSetElement}
 */
function createColorPickersSection() {
  const content = `
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
      <h4 style="margin:0 0 0.75rem 0;font-size:1rem;font-weight:600;color:var(--builder-accent);">Background Image & Effects</h4>
      <div class="color-row">
        <span>Static Background Colour:</span>
        <button id="pickr-background-color" class="pickr-button" type="button"></button>
      </div>
      <div class="color-row">
        <span>Background Image:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="backgroundImageEnabled" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div id="backgroundImageRowWrapper">
        <div class="color-row" id="backgroundImageRow" style="opacity:0.5;">
          <span>Background Image URL:</span>
          <input id="backgroundImageUrl" type="url" placeholder="https://example.com/image.jpg" style="flex:1;padding:0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.9rem;" disabled />
          <button id="backgroundImageFilePicker" type="button" class="file-picker-btn" style="display:none;" disabled></button>
          <button id="backgroundImageCropBtn" type="button" class="crop-preview-btn" style="display:none;" disabled></button>
        </div>
        <div id="backgroundImagePreviewPane" class="bg-preview-pane" style="display:none;margin-top:0.5rem;padding:0.75rem;background:#fff;border:1px solid #ddd;border-radius:4px;"></div>
      </div>
      <div class="color-row">
        <span>Background Video:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="backgroundVideoEnabled" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div id="backgroundVideoRowWrapper">
        <div class="color-row" id="backgroundVideoRow" style="opacity:0.5;">
          <span>Background Video URL:</span>
          <input id="backgroundVideoUrl" type="url" placeholder="https://example.com/video.mp4" style="flex:1;padding:0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.9rem;" disabled />
          <button id="backgroundVideoFilePicker" type="button" class="file-picker-btn" style="display:none;" disabled></button>
        </div>
      </div>
      <div class="per-track-backgrounds-section" style="margin-top:0.0rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:0.5rem 0;" onclick="this.classList.toggle('expanded');const list=document.getElementById('perTrackBackgroundsList');const arrow=this.querySelector('.expand-arrow');if(list.style.display==='none'||!list.style.display){list.style.display='block';arrow.style.transform='rotate(90deg)';}else{list.style.display='none';arrow.style.transform='rotate(0deg)';}">
          <div style="display:flex;align-items:center;gap:0.2rem;">
            <span class="expand-arrow" style="font-size:0.8rem;transition:transform 0.2s;display:inline-block;">▶</span>
            <span>Per-Track Backgrounds:</span>
          </div>
          <span style="font-size:0.75rem;color:#999;">Click to expand</span>
        </div>
        <div id="perTrackBackgroundsList" style="display:none;margin-top:0.2rem;"></div>
      </div>
      <div class="color-row">
        <span>Background Opacity:</span>
        <input id="backgroundOpacity" type="range" min="0" max="1" step="0.1" style="flex:1;" />
        <span id="backgroundOpacityValue" style="min-width:2.5rem;text-align:right;font-size:0.9rem;"></span>
      </div>
      <div class="color-row">
        <span>Blur Amount:</span>
        <input id="backgroundBlur" type="range" min="0" max="50" step="1" style="flex:1;" />
        <span id="backgroundBlurValue" style="min-width:2.5rem;text-align:right;font-size:0.9rem;"></span>
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
  
  const fieldset = createFieldset({
    id: "playerColoursSection",
    legend: `Player Colours & Effects
      <button id="openPresetBrowserBtn" type="button" title="Browse Colour Presets" style="margin-left:0.6em;background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;padding:0;color:var(--builder-accent);">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:22px;height:22px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </button>`,
    content
  });
  
  // Update legend styling to support flex layout
  const legend = fieldset.querySelector("legend");
  if (legend) {
    legend.style.display = "flex";
    legend.style.alignItems = "center";
    legend.style.gap = "0.5rem";
  }
  
  return fieldset;
}

function insertColorPickersSection(colorFieldset, reelForm) {
  const exportBtn = document.getElementById("exportEmbedBtn");
  if (exportBtn) {
    reelForm.insertBefore(colorFieldset, exportBtn);
  } else {
    reelForm.appendChild(colorFieldset);
  }
}

// Per-track backgrounds are now handled in backgroundEffects.js module

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

/**
 * Sets up blend mode and background effects controls
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
async function setupBlendModeControls(reel, onChange) {
  // Import blend mode control functions
  const {
    setupBackgroundImageControls,
    setupBackgroundImageFilePicker,
    setupBackgroundImagePreview,
    setupBackgroundVideoControls,
    setupBackgroundVideoFilePicker,
    setupOverlayColorControls,
    setupOpacityAndBlurControls
  } = await import("./modules/blendModeControls.js");
  
  setTimeout(async () => {
    // Set up all background effects controls
    setupBackgroundImageControls(reel, onChange);
    await setupBackgroundImageFilePicker(reel);
    setupBackgroundImagePreview(reel, onChange);
    
    setupBackgroundVideoControls(reel, onChange);
    await setupBackgroundVideoFilePicker();
    
    setupOverlayColorControls(reel, onChange);
    setupOpacityAndBlurControls(reel);
    
    // Render per-track backgrounds UI
    renderPerTrackBackgrounds(reel, onChange);
  }, 100);
}

// Initialize tooltips when DOM is ready
document.addEventListener("DOMContentLoaded", initTooltips);