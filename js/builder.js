// builder.js - Main builder orchestration and reel management

import { playerApp } from "./player.js";
import { getDefaultColourPreset } from "./modules/colorPresets.js";
import { destroyPickrInstances, createColorPickers, getCurrentPickrValues, eyedropButtonHTML } from "./modules/colorPicker.js";
import { createPresetModal, renderColourPresetModal } from "./modules/presetModal.js";
import { updateTracksEditor } from "./modules/tracksEditor.js";
import { createPlayerTextStylesSection, setupPlayerTextStylesControls } from "./modules/playerTextStyles.js";
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
import { createFieldset, removeElementsByIds, insertElement } from "./modules/domUtils.js";
import { renderPerTrackBackgrounds } from "./modules/backgroundEffects.js";
import { buildValueControl, wireValueControl } from "./modules/valueControl.js";

/**
 * Creates a new empty reel with default configuration
 * @returns {Object} New reel object
 */
export function createEmptyReel() {
  const defaultPreset = getDefaultColourPreset();
  
  const reel = {
    id: "reel-" + Date.now(),
    title: "",
    showTitle: true,
    analyticsEnabled: false,
    locked: false,
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
    backgroundColorEnabled: true,
    playerOutlineEnabled: false,
    overlayColor: "rgba(255, 255, 255, 0.5)",
    overlayColorEnabled: false,
    hoverDarkenEnabled: false,
    hoverDarkenAmount: 15,
    idleUnblurEnabled: false,
    idleUnblurAmount: 50,
    // Player configuration
    playerHeight: 500,
    mode: "static",
    // Expandable mode settings
    expandableCollapsedHeight: 120,
    expandableExpandedHeight: 500,
    projectTitleImage: "",
    showWaveformOnCollapse: true,
    enablePlayerClosedIdle: false,
    playerClosedIdleVideo: "",
    playerClosedIdleOverlayColor: "rgba(0, 0, 0, 0.7)",
    playerClosedIdleBlur: 8
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

  // Sections that share a uniform create(reel, onChange) -> element,
  // setup(element, reel, onChange) shape. Each is inserted immediately after
  // the previous one; to add a new section here, add one entry to this list.
  const sectionDefs = [
    { create: createPlayerModeSection, setup: setupPlayerModeControls },
    { create: createStaticModeSettings, setup: setupStaticModeSettings },
    { create: createExpandableModeSettings, setup: setupExpandableModeSettings },
    { create: createPlayerTextStylesSection, setup: setupPlayerTextStylesControls },
  ];

  const sectionElements = [];
  sectionDefs.forEach(({ create }, i) => {
    const element = create(reel, onChange);
    if (i === 0) {
      insertPlayerModeSection(element, titleInput, reelForm);
    } else {
      insertElement(element, sectionElements[i - 1], reelForm, "after");
    }
    sectionElements.push(element);
  });

  // Tracks and color pickers don't fit the uniform shape above (they look up
  // their own DOM internally rather than operating on a passed element), so
  // they're created and inserted explicitly.
  const exportBtn = document.getElementById("exportEmbedBtn");

  const tracksSection = createTracksSection();
  insertElement(tracksSection, exportBtn, reelForm, "before");

  const colorFieldset = createColorPickersSection();
  insertElement(colorFieldset, exportBtn, reelForm, "before");

  // Set up preset modal
  const colourPresetModal = createPresetModal();
  setupPresetModalEvents(colourPresetModal, reel, onChange);

  // Set up title input
  setupTitleInput(titleInput, reel, onChange);

  // Set up the uniform-shaped sections in the same order they were created
  sectionDefs.forEach(({ setup }, i) => setup(sectionElements[i], reel, onChange));

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
    "playerTextStylesSection",
    "tracksSection",
    "playerColoursSection"
  ]);
}

function insertPlayerModeSection(playerModeSection, titleInput, reelForm) {
  // Insert after the show title checkbox's row, falling back to after the
  // title input's row, falling back to the very front of the form
  const showTitleCheckbox = document.getElementById("reelShowTitle");
  const anchor = (showTitleCheckbox && showTitleCheckbox.parentNode) ||
                 (titleInput && titleInput.parentNode);

  if (anchor) {
    insertElement(playerModeSection, anchor, reelForm, "after");
  } else {
    insertElement(playerModeSection, reelForm.firstChild, reelForm, "before");
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

/**
 * Creates the color pickers and background effects section
 * @returns {HTMLFieldSetElement}
 */
function createColorPickersSection() {
  // Built (not wired) here since this markup gets embedded in a template
  // string and re-parsed via innerHTML - see the wireValueControl() pass
  // below, after the fieldset is actually mounted.
  // Values are placeholders - blendModeControls.js's setup functions
  // overwrite them with the reel's actual values right after this mounts.
  const backgroundOpacityRow = buildValueControl({
    id: 'backgroundOpacity',
    label: 'Background Opacity (%):',
    value: 100,
    min: 0,
    max: 100,
    step: 5,
    unit: '%'
  }).row.outerHTML;

  const backgroundBlurRow = buildValueControl({
    id: 'backgroundBlur',
    label: 'Blur Amount (px):',
    value: 2,
    min: 0,
    max: 50,
    step: 1,
    unit: 'px'
  }).row.outerHTML;

  const hoverDarkenAmountBuilt = buildValueControl({
    id: 'hoverDarkenAmount',
    label: '',
    value: 15,
    min: 0,
    max: 100,
    step: 5,
    unit: '%'
  });
  hoverDarkenAmountBuilt.input.disabled = true;
  hoverDarkenAmountBuilt.slider.disabled = true;
  const hoverDarkenAmountRow = hoverDarkenAmountBuilt.control.outerHTML;

  const idleUnblurAmountBuilt = buildValueControl({
    id: 'idleUnblurAmount',
    label: '',
    value: 50,
    min: 0,
    max: 100,
    step: 5,
    unit: '%'
  });
  idleUnblurAmountBuilt.input.disabled = true;
  idleUnblurAmountBuilt.slider.disabled = true;
  const idleUnblurAmountRow = idleUnblurAmountBuilt.control.outerHTML;

  const outlineWidthControl = buildValueControl({
    id: 'playerOutlineWidth',
    label: '',
    value: 0,
    min: 0,
    max: 20,
    step: 1,
    unit: 'px'
  }).control.outerHTML;

  const content = `
    <div class="color-row">
      <span>UI Accent Colour:</span>
      <button id="pickr-ui-accent" class="pickr-button" type="button"></button>
      ${eyedropButtonHTML('pickr-ui-accent')}
    </div>
    <div class="color-row">
      <span>Waveform Unplayed Colour:</span>
      <button id="pickr-waveform-unplayed" class="pickr-button" type="button"></button>
      ${eyedropButtonHTML('pickr-waveform-unplayed')}
    </div>
    <div class="color-row">
      <span>Waveform Hover Colour:</span>
      <button id="pickr-waveform-hover" class="pickr-button" type="button"></button>
      ${eyedropButtonHTML('pickr-waveform-hover')}
    </div>
    <div class="blend-modes-section" style="margin-top:1rem;padding-top:1rem;border-top:1px solid #444;">
      <h4 style="margin:0 0 0.75rem 0;font-size:1rem;font-weight:600;color:var(--builder-accent);">Player Outline</h4>
      <div class="color-row">
        <span>Outline:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="playerOutlineEnabled" />
          <span class="toggle-slider"></span>
        </label>
        <button id="pickr-outline-color" class="pickr-button" type="button" disabled style="opacity:0.5;"></button>
        ${eyedropButtonHTML('pickr-outline-color')}
        ${outlineWidthControl}
      </div>
    </div>
    <div class="blend-modes-section" style="margin-top:1rem;padding-top:1rem;border-top:1px solid #444;">
      <h4 style="margin:0 0 0.75rem 0;font-size:1rem;font-weight:600;color:var(--builder-accent);">Background Image & Effects</h4>
      <div class="color-row">
        <span>Static Background Colour:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="backgroundColorEnabled" />
          <span class="toggle-slider"></span>
        </label>
        <button id="pickr-background-color" class="pickr-button" type="button"></button>
        ${eyedropButtonHTML('pickr-background-color')}
      </div>
      <div id="backgroundImageRowWrapper">
        <div class="color-row" id="backgroundImageRow">
          <span>Background Image:</span>
          <label class="toggle-switch" style="margin-right:0.5rem;">
            <input type="checkbox" id="backgroundImageEnabled" />
            <span class="toggle-slider"></span>
          </label>
          <input id="backgroundImageUrl" type="url" placeholder="https://example.com/image.jpg" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;opacity:0.5;" disabled />
          <button id="backgroundImageFilePicker" type="button" class="file-picker-btn" aria-label="Browse background images" title="Browse background images" disabled style="opacity:0.5;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #ccc;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </button>
          <button id="backgroundImageCropBtn" type="button" class="crop-preview-btn" aria-label="Preview & Crop" title="Preview & Crop" disabled style="opacity:0.5;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #ccc;">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
        </div>
        <div id="backgroundImagePreviewPane" class="bg-preview-pane" style="display:none;margin-top:0.5rem;padding:0.75rem;background:#1e1e1e;border:1px solid #444;border-radius:4px;"></div>
      </div>
      <div id="backgroundVideoRowWrapper">
        <div class="color-row" id="backgroundVideoRow">
          <span>Background Video:</span>
          <label class="toggle-switch" style="margin-right:0.5rem;">
            <input type="checkbox" id="backgroundVideoEnabled" />
            <span class="toggle-slider"></span>
          </label>
          <input id="backgroundVideoUrl" type="url" placeholder="https://example.com/video.mp4" style="flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;opacity:0.5;" disabled />
          <button id="backgroundVideoFilePicker" type="button" class="file-picker-btn" aria-label="Browse background videos" title="Browse background videos" disabled style="opacity:0.5;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #ccc;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </button>
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
      ${backgroundOpacityRow}
      ${backgroundBlurRow}
      <div class="color-row">
        <span>Overlay Colour:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="overlayColorEnabled" />
          <span class="toggle-slider"></span>
        </label>
        <button id="pickr-overlay-color" class="pickr-button" type="button" disabled style="opacity:0.5;"></button>
        ${eyedropButtonHTML('pickr-overlay-color')}
      </div>
      <div class="color-row">
        <span>Darken on Hover:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="hoverDarkenEnabled" />
          <span class="toggle-slider"></span>
        </label>
        ${hoverDarkenAmountRow}
      </div>
      <div class="color-row">
        <span>Unblur on Idle:</span>
        <label class="toggle-switch" style="margin-right:0.5rem;">
          <input type="checkbox" id="idleUnblurEnabled" />
          <span class="toggle-slider"></span>
        </label>
        ${idleUnblurAmountRow}
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

  // The value controls above were assembled as markup and re-parsed via
  // innerHTML, so their behavior needs wiring up now that they're mounted.
  fieldset.querySelectorAll(".value-control").forEach(wireValueControl);

  return fieldset;
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
    setupBackgroundColorControls,
    setupOverlayColorControls,
    setupOpacityAndBlurControls,
    setupHoverDarkenControls,
    setupIdleUnblurControls,
    setupOutlineControls
  } = await import("./modules/blendModeControls.js");

  setTimeout(async () => {
    // Set up all background effects controls
    setupBackgroundImageControls(reel, onChange);
    await setupBackgroundImageFilePicker(reel);
    setupBackgroundImagePreview(reel, onChange);

    setupBackgroundVideoControls(reel, onChange);
    await setupBackgroundVideoFilePicker();

    setupBackgroundColorControls(reel, onChange);
    setupOverlayColorControls(reel, onChange);
    setupOpacityAndBlurControls(reel, onChange);
    setupOutlineControls(reel, onChange);
    setupHoverDarkenControls(reel, onChange);
    setupIdleUnblurControls(reel, onChange);

    // Render per-track backgrounds UI
    renderPerTrackBackgrounds(reel, onChange);
  }, 100);
}

// Initialize tooltips when DOM is ready
document.addEventListener("DOMContentLoaded", initTooltips);