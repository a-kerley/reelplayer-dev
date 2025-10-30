// builder.js

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
    backgroundVideo: "",
    backgroundVideoEnabled: false,
    backgroundZoom: 1,
    backgroundOpacity: "1",
    backgroundBlur: "2",
    overlayColor: "rgba(255, 255, 255, 0.5)",
    overlayColorEnabled: false,
    // Player dimensions
    playerHeight: 500, // Default height in pixels
    // Player mode
    mode: "static", // "static" or "expandable"
    // Expandable mode settings
    expandableCollapsedHeight: 120,
    expandableExpandedHeight: 500,
    projectTitleImage: "",
    showWaveformOnCollapse: true
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

  // Create and insert player mode section
  const playerModeSection = createPlayerModeSection(reel, onChange);
  insertPlayerModeSection(playerModeSection, titleInput, reelForm);

  // Create and insert static mode settings section
  const staticModeSettings = createStaticModeSettings(reel, onChange);
  insertStaticModeSettings(staticModeSettings, playerModeSection, reelForm);

  // Create and insert expandable mode settings section
  const expandableModeSettings = createExpandableModeSettings(reel, onChange);
  insertExpandableModeSettings(expandableModeSettings, staticModeSettings, reelForm);

  // Create and insert title appearance section
  const titleAppearanceSection = createTitleAppearanceSection(reel, onChange);
  insertTitleAppearanceSection(titleAppearanceSection, expandableModeSettings, reelForm);

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

function removeOldSections() {
  const oldPlayerModeSection = document.getElementById("playerModeSection");
  if (oldPlayerModeSection) oldPlayerModeSection.remove();

  const oldStaticModeSettings = document.getElementById("staticModeSettings");
  if (oldStaticModeSettings) oldStaticModeSettings.remove();

  const oldExpandableModeSettings = document.getElementById("expandableModeSettings");
  if (oldExpandableModeSettings) oldExpandableModeSettings.remove();

  const oldTracksSection = document.getElementById("tracksSection");
  if (oldTracksSection) oldTracksSection.remove();
  
  const oldColorFieldset = document.getElementById("playerColoursSection");
  if (oldColorFieldset) oldColorFieldset.remove();
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
          <button id="backgroundImageCropBtn" type="button" class="crop-preview-btn" style="display:none;background:transparent;color:#333;border:none;border-radius:4px;padding:0.35em 0.5em;cursor:pointer;transition:all 0.2s ease;flex-shrink:0;align-items:center;justify-content:center;" disabled>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
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
        <input id="backgroundBlur" type="range" min="0" max="20" step="1" style="flex:1;" />
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

function renderPerTrackBackgrounds(reel, onChange) {
  const container = document.getElementById('perTrackBackgroundsList');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Ensure each track has a backgroundImage property
  reel.playlist.forEach((track, index) => {
    if (track.backgroundImage === undefined) {
      track.backgroundImage = '';
    }
    
    const trackRow = document.createElement('div');
    trackRow.className = 'per-track-bg-row';
    trackRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;margin-bottom:0.4rem;padding:0.35rem 0.5rem;background:#fafafa;border-radius:3px;border:1px solid #eee;';
    
    // Track number/name
    const trackLabel = document.createElement('span');
    trackLabel.style.cssText = 'width:180px;font-size:0.75rem;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;';
    const trackTitle = track.title || `Track ${index + 1}`;
    trackLabel.textContent = trackTitle;
    trackLabel.title = trackTitle;
    
    // URL input
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.placeholder = 'Image URL';
    urlInput.value = track.backgroundImage || '';
    urlInput.style.cssText = 'flex:1;min-width:0;padding:0.3rem 0.4rem;border:1px solid #ddd;border-radius:3px;font-size:0.75rem;color:#333;';
    
    let urlTimeout;
    urlInput.addEventListener('input', () => {
      clearTimeout(urlTimeout);
      urlTimeout = setTimeout(() => {
        track.backgroundImage = ValidationUtils.isValidImageUrl(urlInput.value) ? urlInput.value : urlInput.value;
        onChange();
      }, 300);
    });
    
    // File picker button
    const filePickerBtn = document.createElement('button');
    filePickerBtn.type = 'button';
    filePickerBtn.className = 'file-picker-btn';
    filePickerBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; color: #333;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    `;
    filePickerBtn.setAttribute('aria-label', 'Browse backgrounds');
    filePickerBtn.title = 'Browse files';
    
    Object.assign(filePickerBtn.style, {
      background: 'transparent',
      color: '#333',
      border: 'none',
      borderRadius: '3px',
      padding: '0.2em 0.3em',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      flexShrink: '0'
    });
    
    // Hover effects
    filePickerBtn.addEventListener('mouseenter', () => {
      const svg = filePickerBtn.querySelector('svg');
      if (svg) svg.style.color = '#4a90e2';
    });
    filePickerBtn.addEventListener('mouseleave', () => {
      const svg = filePickerBtn.querySelector('svg');
      if (svg) svg.style.color = '#333';
    });
    
    // Click handler
    filePickerBtn.addEventListener('click', async () => {
      const { openFilePicker } = await import('./modules/filePicker.js');
      openFilePicker({
        directory: 'assets/images/backgrounds',
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
        title: 'Select Background Image',
        onSelect: (filePath) => {
          urlInput.value = filePath;
          track.backgroundImage = filePath;
          onChange();
        }
      });
    });
    
    // Crop/Preview button
    const cropBtn = document.createElement('button');
    cropBtn.type = 'button';
    cropBtn.className = 'crop-preview-btn';
    cropBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; color: #333;">
        <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    `;
    cropBtn.setAttribute('aria-label', 'Preview & Crop');
    cropBtn.title = 'Preview & Crop';
    
    Object.assign(cropBtn.style, {
      background: 'transparent',
      color: '#333',
      border: 'none',
      borderRadius: '3px',
      padding: '0.2em 0.3em',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      flexShrink: '0'
    });
    
    // Preview pane container (hidden by default)
    const previewPane = document.createElement('div');
    previewPane.className = 'bg-preview-pane';
    previewPane.style.cssText = 'display:none;margin-top:0.5rem;padding:0.75rem;background:#fff;border:1px solid #ddd;border-radius:4px;';
    
    // Initialize zoom value from track data
    if (track.backgroundZoom === undefined) {
      track.backgroundZoom = 1;
    }
    
    // Function to create expandable mode preview
    const createExpandablePreview = (imageUrl, reel, zoom = 1) => {
      if (!reel || reel.mode !== 'expandable') {
        // Fallback to simple preview for non-expandable mode
        return `<img src="${imageUrl}" style="width:100%;height:auto;max-height:200px;object-fit:contain;border-radius:3px;transform:scale(${zoom});" />`;
      }
      
      // Get player dimensions from preview iframe or use defaults
      const previewIframe = document.querySelector('#player-preview');
      let playerWidth = 800; // Default width
      if (previewIframe) {
        const iframeRect = previewIframe.getBoundingClientRect();
        playerWidth = Math.min(iframeRect.width, 800); // Cap at 800px
      }
      
      // Get expandable mode settings or use defaults
      const collapsedHeight = parseInt(reel.expandableSettings?.collapsedHeight) || 120;
      const expandedHeight = parseInt(reel.expandableSettings?.expandedHeight) || 500;
      
      // Scale down if needed (max 90% of panel width for each preview)
      const maxPreviewWidth = Math.min(playerWidth, 400);
      const scaleFactor = maxPreviewWidth / playerWidth;
      const previewWidth = playerWidth * scaleFactor;
      const collapsedPreviewHeight = collapsedHeight * scaleFactor;
      const expandedPreviewHeight = expandedHeight * scaleFactor;
      
      return `
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div style="text-align:center;font-size:0.85rem;color:#666;font-weight:500;">Expandable Mode Preview</div>
          
          <!-- Zoom Control -->
          <div style="display:flex;align-items:center;gap:0.75rem;padding:0 1rem;">
            <label style="font-size:0.75rem;color:#666;white-space:nowrap;">Zoom:</label>
            <input type="range" class="zoom-slider" min="1" max="3" step="0.1" value="${zoom}" style="flex:1;" />
            <span class="zoom-value" style="font-size:0.75rem;color:#666;min-width:3rem;text-align:right;">${(zoom * 100).toFixed(0)}%</span>
          </div>
          
          <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <div style="font-size:0.75rem;color:#666;text-align:center;">Collapsed (${collapsedHeight}px)</div>
              <div style="width:${previewWidth}px;height:${collapsedPreviewHeight}px;border:1px solid #ddd;border-radius:4px;overflow:hidden;position:relative;">
                <img class="preview-img" src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(${zoom});" />
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <div style="font-size:0.75rem;color:#666;text-align:center;">Expanded (${expandedHeight}px)</div>
              <div style="width:${previewWidth}px;height:${expandedPreviewHeight}px;border:1px solid #ddd;border-radius:4px;overflow:hidden;position:relative;">
                <img class="preview-img" src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(${zoom});" />
              </div>
            </div>
          </div>
        </div>
      `;
    };
    
    // Toggle preview pane
    let previewOpen = false;
    const updatePreview = () => {
      if (track.backgroundImage) {
        previewPane.innerHTML = createExpandablePreview(track.backgroundImage, reel, track.backgroundZoom);
        // Re-attach zoom slider listener after innerHTML update
        attachZoomListener();
      } else {
        previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
      }
    };
    
    const attachZoomListener = () => {
      const zoomSlider = previewPane.querySelector('.zoom-slider');
      const zoomValue = previewPane.querySelector('.zoom-value');
      const previewImages = previewPane.querySelectorAll('.preview-img');
      
      if (zoomSlider && zoomValue && previewImages.length) {
        zoomSlider.addEventListener('input', (e) => {
          const zoom = parseFloat(e.target.value);
          track.backgroundZoom = zoom;
          zoomValue.textContent = `${(zoom * 100).toFixed(0)}%`;
          previewImages.forEach(img => {
            img.style.transform = `scale(${zoom})`;
          });
          // Save without triggering onChange to prevent CPU spike
        });
        // Save on change (when user finishes dragging) without triggering preview refresh
        zoomSlider.addEventListener('change', () => {
          // Save to localStorage without refreshing preview to preserve video state
          if (window.saveReels && window.reels) {
            window.saveReels(window.reels);
          }
        });
      }
    };
    
    cropBtn.addEventListener('click', () => {
      previewOpen = !previewOpen;
      if (previewOpen) {
        previewPane.style.display = 'block';
        cropBtn.style.color = '#4a90e2';
        updatePreview();
      } else {
        previewPane.style.display = 'none';
        cropBtn.style.color = '#333';
      }
    });
    
    // Update preview when URL changes
    urlInput.addEventListener('input', () => {
      if (previewOpen) {
        updatePreview();
      }
    });
    
    // Hover effects
    cropBtn.addEventListener('mouseenter', () => {
      if (!previewOpen) cropBtn.style.color = '#4a90e2';
    });
    cropBtn.addEventListener('mouseleave', () => {
      if (!previewOpen) cropBtn.style.color = '#333';
    });
    
    // Clear button for image
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.innerHTML = '✕';
    clearBtn.title = 'Clear image';
    clearBtn.style.cssText = 'background:transparent;border:none;color:#666;font-size:0.9rem;cursor:pointer;padding:0.2rem 0.3rem;transition:color 0.2s;flex-shrink:0;line-height:1;';
    clearBtn.addEventListener('mouseenter', () => clearBtn.style.color = '#dc3545');
    clearBtn.addEventListener('mouseleave', () => clearBtn.style.color = '#666');
    clearBtn.addEventListener('click', () => {
      urlInput.value = '';
      track.backgroundImage = '';
      onChange();
      if (previewOpen) {
        previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
      }
    });
    
    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = 'width:1px;height:20px;background:#ddd;margin:0 0.3rem;flex-shrink:0;';
    
    // === VIDEO CONTROLS ===
    
    // Ensure track has backgroundVideo property
    if (track.backgroundVideo === undefined) {
      track.backgroundVideo = '';
    }
    
    // Video URL input
    const videoUrlInput = document.createElement('input');
    videoUrlInput.type = 'url';
    videoUrlInput.placeholder = 'Video URL';
    videoUrlInput.value = track.backgroundVideo || '';
    videoUrlInput.style.cssText = 'flex:1;min-width:0;padding:0.3rem 0.4rem;border:1px solid #ddd;border-radius:3px;font-size:0.75rem;color:#333;';
    
    let videoUrlTimeout;
    videoUrlInput.addEventListener('input', () => {
      clearTimeout(videoUrlTimeout);
      videoUrlTimeout = setTimeout(() => {
        track.backgroundVideo = videoUrlInput.value;
        onChange();
      }, 300);
    });
    
    // Video file picker button
    const videoFilePickerBtn = document.createElement('button');
    videoFilePickerBtn.type = 'button';
    videoFilePickerBtn.className = 'file-picker-btn';
    videoFilePickerBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; color: #333;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    `;
    videoFilePickerBtn.setAttribute('aria-label', 'Browse videos');
    videoFilePickerBtn.title = 'Browse video files';
    
    Object.assign(videoFilePickerBtn.style, {
      background: 'transparent',
      color: '#333',
      border: 'none',
      borderRadius: '3px',
      padding: '0.2em 0.3em',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      flexShrink: '0'
    });
    
    videoFilePickerBtn.addEventListener('mouseenter', () => {
      const svg = videoFilePickerBtn.querySelector('svg');
      if (svg) svg.style.color = '#4a90e2';
    });
    videoFilePickerBtn.addEventListener('mouseleave', () => {
      const svg = videoFilePickerBtn.querySelector('svg');
      if (svg) svg.style.color = '#333';
    });
    
    videoFilePickerBtn.addEventListener('click', async () => {
      const { openFilePicker } = await import('./modules/filePicker.js');
      openFilePicker({
        directory: 'assets/videos/backgrounds',
        extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
        title: 'Select Background Video',
        onSelect: (filePath) => {
          videoUrlInput.value = filePath;
          track.backgroundVideo = filePath;
          onChange();
        }
      });
    });
    
    // Clear button for video
    const videoClearBtn = document.createElement('button');
    videoClearBtn.type = 'button';
    videoClearBtn.innerHTML = '✕';
    videoClearBtn.title = 'Clear video';
    videoClearBtn.style.cssText = 'background:transparent;border:none;color:#666;font-size:0.9rem;cursor:pointer;padding:0.2rem 0.3rem;transition:color 0.2s;flex-shrink:0;line-height:1;';
    videoClearBtn.addEventListener('mouseenter', () => videoClearBtn.style.color = '#dc3545');
    videoClearBtn.addEventListener('mouseleave', () => videoClearBtn.style.color = '#666');
    videoClearBtn.addEventListener('click', () => {
      videoUrlInput.value = '';
      track.backgroundVideo = '';
      onChange();
    });
    
    // Create wrapper for row and preview
    const trackWrapper = document.createElement('div');
    trackWrapper.style.cssText = 'margin-bottom:0.4rem;';
    
    // Append all elements to track row
    trackRow.appendChild(trackLabel);
    trackRow.appendChild(urlInput);
    trackRow.appendChild(filePickerBtn);
    trackRow.appendChild(cropBtn);
    trackRow.appendChild(clearBtn);
    trackRow.appendChild(separator);
    trackRow.appendChild(videoUrlInput);
    trackRow.appendChild(videoFilePickerBtn);
    trackRow.appendChild(videoClearBtn);
    
    trackWrapper.appendChild(trackRow);
    trackWrapper.appendChild(previewPane);
    
    container.appendChild(trackWrapper);
  });
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
        const filePickerBtn = document.getElementById('backgroundImageFilePicker');
        const cropBtn = document.getElementById('backgroundImageCropBtn');
        
        backgroundImageUrl.disabled = !isEnabled;
        backgroundImageRow.style.opacity = isEnabled ? "1" : "0.5";
        
        if (filePickerBtn) {
          filePickerBtn.style.display = isEnabled ? 'inline-block' : 'none';
          filePickerBtn.disabled = !isEnabled;
        }
        
        if (cropBtn) {
          cropBtn.style.display = isEnabled ? 'inline-flex' : 'none';
          cropBtn.disabled = !isEnabled;
        }
        
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
      
      // Wire up file picker button
      const filePickerBtn = document.getElementById('backgroundImageFilePicker');
      if (filePickerBtn) {
        // Set up the file picker button with folder SVG icon
        filePickerBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        `;
        filePickerBtn.setAttribute("aria-label", "Browse backgrounds");
        filePickerBtn.title = "Browse files from assets/images/backgrounds";
        
        Object.assign(filePickerBtn.style, {
          background: "transparent",
          color: "#000",
          border: "none",
          borderRadius: "4px",
          padding: "0.35em 0.5em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease"
        });
        
        // Hover effect - changes icon color to blue
        filePickerBtn.addEventListener("mouseenter", () => {
          if (!filePickerBtn.disabled) {
            const svg = filePickerBtn.querySelector('svg');
            if (svg) svg.style.color = "#4a90e2";
          }
        });
        filePickerBtn.addEventListener("mouseleave", () => {
          const svg = filePickerBtn.querySelector('svg');
          if (svg) svg.style.color = "#000";
        });
        
        // Click handler
        filePickerBtn.addEventListener("click", async () => {
          const { openFilePicker } = await import('./modules/filePicker.js');
          openFilePicker({
            directory: 'assets/images/backgrounds',
            extensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
            title: 'Select Background Image',
            onSelect: (filePath) => {
              backgroundImageUrl.value = filePath;
              backgroundImageUrl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
        });
        
        // Initial state
        filePickerBtn.style.display = backgroundImageEnabled.checked ? 'inline-block' : 'none';
        filePickerBtn.disabled = !backgroundImageEnabled.checked;
      }
      
      // Wire up crop/preview button
      const cropBtn = document.getElementById('backgroundImageCropBtn');
      const previewPane = document.getElementById('backgroundImagePreviewPane');
      if (cropBtn && previewPane) {
        // Initialize zoom if not set
        if (reel.backgroundZoom === undefined) {
          reel.backgroundZoom = 1;
        }
        
        // Function to create expandable mode preview
        const createExpandablePreview = (imageUrl, zoom = 1) => {
          if (!reel || reel.mode !== 'expandable') {
            // Fallback to simple preview for non-expandable mode
            return `<img src="${imageUrl}" style="width:100%;height:auto;max-height:200px;object-fit:contain;border-radius:3px;transform:scale(${zoom});" />`;
          }
          
          // Get player dimensions from preview iframe or use defaults
          const previewIframe = document.querySelector('#player-preview');
          let playerWidth = 800; // Default width
          if (previewIframe) {
            const iframeRect = previewIframe.getBoundingClientRect();
            playerWidth = Math.min(iframeRect.width, 800); // Cap at 800px
          }
          
          // Get expandable mode settings or use defaults
          const collapsedHeight = parseInt(reel.expandableSettings?.collapsedHeight) || 120;
          const expandedHeight = parseInt(reel.expandableSettings?.expandedHeight) || 500;
          
          // Scale down if needed (max 90% of panel width for each preview)
          const maxPreviewWidth = Math.min(playerWidth, 400);
          const scaleFactor = maxPreviewWidth / playerWidth;
          const previewWidth = playerWidth * scaleFactor;
          const collapsedPreviewHeight = collapsedHeight * scaleFactor;
          const expandedPreviewHeight = expandedHeight * scaleFactor;
          
          return `
            <div style="display:flex;flex-direction:column;gap:1rem;">
              <div style="text-align:center;font-size:0.85rem;color:#666;font-weight:500;">Expandable Mode Preview</div>
              <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                  <div style="font-size:0.75rem;color:#666;text-align:center;">Collapsed (${collapsedHeight}px)</div>
                  <div style="width:${previewWidth}px;height:${collapsedPreviewHeight}px;border:1px solid #ddd;border-radius:4px;overflow:hidden;position:relative;">
                    <img class="preview-img" src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(${zoom});" />
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                  <div style="font-size:0.75rem;color:#666;text-align:center;">Expanded (${expandedHeight}px)</div>
                  <div style="width:${previewWidth}px;height:${expandedPreviewHeight}px;border:1px solid #ddd;border-radius:4px;overflow:hidden;position:relative;">
                    <img class="preview-img" src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(${zoom});" />
                  </div>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0 1rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <label style="font-size:0.85rem;color:#666;">Zoom</label>
                  <span class="zoom-value" style="font-size:0.85rem;color:#999;">${zoom.toFixed(1)}x</span>
                </div>
                <input type="range" class="zoom-slider" min="1" max="3" step="0.1" value="${zoom}" 
                       style="width:100%;cursor:pointer;" />
              </div>
            </div>
          `;
        };
        
        let previewOpen = false;
        
        // Hover effects
        cropBtn.addEventListener('mouseenter', () => {
          if (!cropBtn.disabled && !previewOpen) {
            const svg = cropBtn.querySelector('svg');
            if (svg) svg.style.color = '#4a90e2';
          }
        });
        cropBtn.addEventListener('mouseleave', () => {
          if (!previewOpen) {
            const svg = cropBtn.querySelector('svg');
            if (svg) svg.style.color = '#000';
          }
        });
        
        // Function to update preview content
        const updatePreview = () => {
          if (backgroundImageUrl.value) {
            previewPane.innerHTML = createExpandablePreview(backgroundImageUrl.value, reel.backgroundZoom);
            attachZoomListener();
          } else {
            previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
          }
        };
        
        // Function to attach zoom slider listener
        const attachZoomListener = () => {
          const slider = previewPane.querySelector('.zoom-slider');
          const zoomValue = previewPane.querySelector('.zoom-value');
          if (slider && zoomValue) {
            slider.addEventListener('input', (e) => {
              const zoom = parseFloat(e.target.value);
              reel.backgroundZoom = zoom;
              zoomValue.textContent = `${zoom.toFixed(1)}x`;
              // Update all preview images
              previewPane.querySelectorAll('.preview-img').forEach(img => {
                img.style.transform = `scale(${zoom})`;
              });
              // No need to call updatePreview here - visual update is already done
            });
            // Save on change (when user finishes dragging)
            slider.addEventListener('change', () => {
              onChange();
            });
          }
        };
        
        // Toggle preview
        cropBtn.addEventListener('click', () => {
          previewOpen = !previewOpen;
          const svg = cropBtn.querySelector('svg');
          if (previewOpen) {
            previewPane.style.display = 'block';
            if (svg) svg.style.color = '#4a90e2';
            updatePreview();
          } else {
            previewPane.style.display = 'none';
            if (svg) svg.style.color = '#000';
          }
        });
        
        // Update preview when URL changes
        backgroundImageUrl.addEventListener('input', () => {
          if (previewOpen) {
            updatePreview();
          }
        });
        
        // Initial state
        cropBtn.style.display = backgroundImageEnabled.checked ? 'inline-flex' : 'none';
        cropBtn.disabled = !backgroundImageEnabled.checked;
      }
    }

    // Background Video Controls
    const backgroundVideoEnabled = document.getElementById("backgroundVideoEnabled");
    const backgroundVideoUrl = document.getElementById("backgroundVideoUrl");
    const backgroundVideoRow = document.getElementById("backgroundVideoRow");
    
    if (backgroundVideoEnabled) {
      backgroundVideoEnabled.checked = reel.backgroundVideoEnabled || false;
      
      const updateBackgroundVideoState = () => {
        const isEnabled = backgroundVideoEnabled.checked;
        const videoFilePickerBtn = document.getElementById('backgroundVideoFilePicker');
        
        backgroundVideoUrl.disabled = !isEnabled;
        backgroundVideoRow.style.opacity = isEnabled ? "1" : "0.5";
        
        if (videoFilePickerBtn) {
          videoFilePickerBtn.style.display = isEnabled ? 'inline-block' : 'none';
          videoFilePickerBtn.disabled = !isEnabled;
        }
        
        reel.backgroundVideoEnabled = isEnabled;
      };
      
      updateBackgroundVideoState();
      
      backgroundVideoEnabled.addEventListener('change', () => {
        updateBackgroundVideoState();
        onChange();
      });
    }

    if (backgroundVideoUrl) {
      backgroundVideoUrl.value = reel.backgroundVideo || "";
      let videoUrlTimeout;
      backgroundVideoUrl.addEventListener('input', () => {
        clearTimeout(videoUrlTimeout);
        videoUrlTimeout = setTimeout(() => {
          reel.backgroundVideo = backgroundVideoUrl.value;
          onChange();
        }, 300);
      });
      
      // Wire up video file picker button
      const videoFilePickerBtn = document.getElementById('backgroundVideoFilePicker');
      if (videoFilePickerBtn) {
        videoFilePickerBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        `;
        videoFilePickerBtn.setAttribute("aria-label", "Browse videos");
        videoFilePickerBtn.title = "Browse files from assets/videos/backgrounds";
        
        Object.assign(videoFilePickerBtn.style, {
          background: "transparent",
          color: "#000",
          border: "none",
          borderRadius: "4px",
          padding: "0.35em 0.5em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease"
        });
        
        videoFilePickerBtn.addEventListener("mouseenter", () => {
          if (!videoFilePickerBtn.disabled) {
            const svg = videoFilePickerBtn.querySelector('svg');
            if (svg) svg.style.color = "#4a90e2";
          }
        });
        videoFilePickerBtn.addEventListener("mouseleave", () => {
          const svg = videoFilePickerBtn.querySelector('svg');
          if (svg) svg.style.color = "#000";
        });
        
        videoFilePickerBtn.addEventListener("click", async () => {
          const { openFilePicker } = await import('./modules/filePicker.js');
          openFilePicker({
            directory: 'assets/videos/backgrounds',
            extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
            title: 'Select Background Video',
            onSelect: (filePath) => {
              backgroundVideoUrl.value = filePath;
              backgroundVideoUrl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
        });
        
        videoFilePickerBtn.style.display = backgroundVideoEnabled.checked ? 'inline-block' : 'none';
        videoFilePickerBtn.disabled = !backgroundVideoEnabled.checked;
      }
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
    
    // Render per-track backgrounds UI
    renderPerTrackBackgrounds(reel, onChange);
  }, 100);
}

// Initialize tooltips when DOM is ready
document.addEventListener("DOMContentLoaded", initTooltips);