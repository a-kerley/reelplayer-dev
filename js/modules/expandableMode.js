// expandableMode.js - Handles expandable mode UI and controls in the builder

import { createUrlInputRow, createToggleSwitch } from "./domUtils.js";
import { createValueControl } from "./valueControl.js";
import { eyedropButtonHTML } from "./colorPicker.js";

/**
 * Creates the Player Mode section with Static/Expandable toggle
 */
export function createPlayerModeSection(reel, onChange) {
  const section = document.createElement('fieldset');
  section.id = 'playerModeSection';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.border = '1px solid var(--builder-border)';
  section.style.borderRadius = '6px';

  const legend = document.createElement('legend');
  legend.textContent = 'Player Mode';
  legend.className = 'builder-section-legend';
  legend.style.padding = '0 0.5rem';
  section.appendChild(legend);

  const modeContainer = document.createElement('div');
  modeContainer.style.display = 'flex';
  modeContainer.style.gap = '1.5rem';
  modeContainer.style.marginTop = '0.75rem';

  // Static mode radio
  const staticLabel = document.createElement('label');
  staticLabel.style.display = 'flex';
  staticLabel.style.alignItems = 'center';
  staticLabel.style.gap = '0.5rem';
  staticLabel.style.cursor = 'pointer';

  const staticRadio = document.createElement('input');
  staticRadio.type = 'radio';
  staticRadio.name = 'playerMode';
  staticRadio.value = 'static';
  staticRadio.id = 'modeStatic';
  staticRadio.checked = (reel.mode || 'static') === 'static';

  const staticText = document.createElement('span');
  staticText.textContent = 'Static';

  staticLabel.appendChild(staticRadio);
  staticLabel.appendChild(staticText);

  // Expandable mode radio
  const expandableLabel = document.createElement('label');
  expandableLabel.style.display = 'flex';
  expandableLabel.style.alignItems = 'center';
  expandableLabel.style.gap = '0.5rem';
  expandableLabel.style.cursor = 'pointer';

  const expandableRadio = document.createElement('input');
  expandableRadio.type = 'radio';
  expandableRadio.name = 'playerMode';
  expandableRadio.value = 'expandable';
  expandableRadio.id = 'modeExpandable';
  expandableRadio.checked = reel.mode === 'expandable';

  const expandableText = document.createElement('span');
  expandableText.textContent = 'Expandable';

  expandableLabel.appendChild(expandableRadio);
  expandableLabel.appendChild(expandableText);

  modeContainer.appendChild(staticLabel);
  modeContainer.appendChild(expandableLabel);
  section.appendChild(modeContainer);

  // Mode description
  const description = document.createElement('p');
  description.id = 'modeDescription';
  description.style.fontSize = '0.85rem';
  description.style.color = '#ccc';
  description.style.marginTop = '0.75rem';
  description.style.marginBottom = '0';
  description.textContent = reel.mode === 'expandable' 
    ? 'Expandable mode: Player appears as a banner and expands on hover to show full controls.'
    : 'Static mode: Player displays at full height with all controls visible.';
  section.appendChild(description);

  return section;
}

/**
 * Sets up event handlers for the player mode selector
 */
export function setupPlayerModeControls(section, reel, onChange) {
  const staticRadio = section.querySelector('#modeStatic');
  const expandableRadio = section.querySelector('#modeExpandable');
  const description = section.querySelector('#modeDescription');

  const handleModeChange = () => {
    const newMode = expandableRadio.checked ? 'expandable' : 'static';
    reel.mode = newMode;

    // Update description
    description.textContent = newMode === 'expandable'
      ? 'Expandable mode: Player appears as a banner and expands on hover to show full controls.'
      : 'Static mode: Player displays at full height with all controls visible.';

    // Toggle static settings visibility
    const staticSettings = document.getElementById('staticModeSettings');
    if (staticSettings) {
      staticSettings.style.display = newMode === 'static' ? 'block' : 'none';
    }

    // Toggle expandable settings visibility
    const expandableSettings = document.getElementById('expandableModeSettings');
    if (expandableSettings) {
      expandableSettings.style.display = newMode === 'expandable' ? 'block' : 'none';
    }

    onChange();
  };

  staticRadio.addEventListener('change', handleModeChange);
  expandableRadio.addEventListener('change', handleModeChange);
}

/**
 * Creates the Static Mode Settings section
 */
export function createStaticModeSettings(reel, onChange) {
  const section = document.createElement('fieldset');
  section.id = 'staticModeSettings';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.border = '1px solid var(--builder-border)';
  section.style.borderRadius = '6px';
  section.style.display = (reel.mode || 'static') === 'static' ? 'block' : 'none';

  const legend = document.createElement('legend');
  legend.textContent = 'Static Mode Settings';
  legend.className = 'builder-section-legend';
  legend.style.padding = '0 0.5rem';
  section.appendChild(legend);

  const settingsContainer = document.createElement('div');
  settingsContainer.style.display = 'flex';
  settingsContainer.style.flexDirection = 'column';
  // Matches .color-row's own default margin-bottom (css/builder.css) -
  // this container used flex gap instead of that class's row margin, so
  // it was a second, independently-drifting spacing value; now the same
  // condensed-but-clear 0.6rem as everywhere else.
  settingsContainer.style.gap = '0.6rem';
  settingsContainer.style.marginTop = '0.75rem';

  // Player Height
  const { row: playerHeightRow } = createValueControl({
    id: 'playerHeight',
    label: 'Player Height (px):',
    value: reel.playerHeight || 500,
    min: 200,
    max: 1000,
    step: 10,
    unit: 'px',
    tooltip: 'Height of the player in static mode'
  });
  settingsContainer.appendChild(playerHeightRow);

  section.appendChild(settingsContainer);

  return section;
}

/**
 * Sets up event handlers for static mode settings
 */
export function setupStaticModeSettings(section, reel, onChange) {
  // Player Height
  const playerHeight = section.querySelector('#playerHeight');
  if (playerHeight) {
    playerHeight.addEventListener('input', () => {
      const value = parseInt(playerHeight.value);
      if (!isNaN(value) && value >= 200 && value <= 1000) {
        reel.playerHeight = value;
      }
    });
    playerHeight.addEventListener('change', onChange);
  }
}

/**
 * Creates the Expandable Mode Settings section
 */
export function createExpandableModeSettings(reel, onChange) {
  const section = document.createElement('fieldset');
  section.id = 'expandableModeSettings';
  section.style.marginBottom = '1.5rem';
  section.style.padding = '1rem';
  section.style.border = '1px solid var(--builder-border)';
  section.style.borderRadius = '6px';
  section.style.display = (reel.mode || 'static') === 'expandable' ? 'block' : 'none';

  const legend = document.createElement('legend');
  legend.textContent = 'Expandable Mode Settings';
  legend.className = 'builder-section-legend';
  legend.style.padding = '0 0.5rem';
  section.appendChild(legend);

  const settingsContainer = document.createElement('div');
  settingsContainer.style.display = 'flex';
  settingsContainer.style.flexDirection = 'column';
  // Matches .color-row's own default margin-bottom (css/builder.css) -
  // this container used flex gap instead of that class's row margin, so
  // it was a second, independently-drifting spacing value; now the same
  // condensed-but-clear 0.6rem as everywhere else.
  settingsContainer.style.gap = '0.6rem';
  settingsContainer.style.marginTop = '0.75rem';

  // Collapsed Height
  const { row: collapsedHeightRow } = createValueControl({
    id: 'expandableCollapsedHeight',
    label: 'Collapsed Height (px):',
    value: reel.expandableCollapsedHeight || 120,
    min: 50,
    max: 300,
    step: 5,
    unit: 'px',
    tooltip: 'Height of the player when collapsed (banner mode)'
  });
  settingsContainer.appendChild(collapsedHeightRow);

  // Expanded Height
  const { row: expandedHeightRow } = createValueControl({
    id: 'expandableExpandedHeight',
    label: 'Expanded Height (px):',
    value: reel.expandableExpandedHeight || 500,
    min: 200,
    max: 1000,
    step: 10,
    unit: 'px',
    tooltip: 'Height of the player when fully expanded'
  });
  settingsContainer.appendChild(expandedHeightRow);

  // Project Title Image
  const { row: titleImageRow } = createUrlInputRow({
    id: 'projectTitleImage',
    label: 'Collapsed Banner Image URL:',
    value: reel.projectTitleImage || '',
    placeholder: 'https://example.com/title-image.jpg',
    tooltip: 'Shown in place of the reel title when the player is collapsed',
    pickerOptions: {
      directory: 'assets/images/project-titles',
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
      title: 'Select Collapsed Banner Image'
    }
  });
  settingsContainer.appendChild(titleImageRow);

  // Show Waveform on Collapse toggle
  const waveformRow = createToggleRow(
    'Show waveform when playing (collapsed)',
    'showWaveformOnCollapse',
    reel.showWaveformOnCollapse !== false, // Default to true
    'Keep the waveform visible in the collapsed banner while a track plays'
  );
  settingsContainer.appendChild(waveformRow);

  // Enable Player Closed Idle toggle - reads as a heading for the idle
  // video/overlay/blur controls below it, since it gates all three.
  const closedIdleRow = createToggleRow(
    'Fade to idle video when paused & collapsed',
    'enablePlayerClosedIdle',
    reel.enablePlayerClosedIdle === true, // Default to false
    'When playback stops and the player is collapsed, fade in the idle video below instead of the normal collapsed banner',
    { heading: true }
  );
  settingsContainer.appendChild(closedIdleRow);

  // Player Closed Idle Video input
  const { row: closedIdleVideoRow } = createUrlInputRow({
    id: 'playerClosedIdleVideo',
    label: 'Idle Background Video:',
    value: reel.playerClosedIdleVideo || '',
    placeholder: 'https://example.com/idle-video.mp4',
    tooltip: 'Plays during the idle state above. Fallback order: this video, then the collapsed banner image, then the current track\'s background',
    pickerOptions: {
      directory: 'assets/video',
      extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
      title: 'Select Idle Background Video'
    }
  });
  settingsContainer.appendChild(closedIdleVideoRow);

  // Player Closed Idle Overlay Colour (matches the Background Image & Effects
  // section's .color-row / .pickr-button pattern - wired up by colorPicker.js)
  const closedIdleOverlayRow = createColorPickerRow(
    'Idle Overlay Colour:',
    'pickr-player-closed-idle-overlay-color',
    'Tint (color + opacity) applied over the idle video/background'
  );
  settingsContainer.appendChild(closedIdleOverlayRow);

  // Player Closed Idle Blur
  const { row: closedIdleBlurRow } = createValueControl({
    id: 'playerClosedIdleBlur',
    label: 'Idle Background Blur (px):',
    value: reel.playerClosedIdleBlur ?? 8,
    min: 0,
    max: 50,
    step: 1,
    unit: 'px',
    tooltip: 'Backdrop blur strength applied over the idle video/background'
  });
  settingsContainer.appendChild(closedIdleBlurRow);

  section.appendChild(settingsContainer);

  return section;
}

/**
 * Sets up event handlers for expandable mode settings
 */
export function setupExpandableModeSettings(section, reel, onChange) {
  // Collapsed Height
  const collapsedHeight = section.querySelector('#expandableCollapsedHeight');
  if (collapsedHeight) {
    collapsedHeight.addEventListener('input', () => {
      const value = parseInt(collapsedHeight.value);
      if (!isNaN(value) && value >= 50 && value <= 300) {
        reel.expandableCollapsedHeight = value;
        
        // Validate against expanded height
        validateHeightSettings(reel, collapsedHeight, section);
      }
    });
    collapsedHeight.addEventListener('change', onChange);
  }

  // Expanded Height
  const expandedHeight = section.querySelector('#expandableExpandedHeight');
  if (expandedHeight) {
    expandedHeight.addEventListener('input', () => {
      const value = parseInt(expandedHeight.value);
      if (!isNaN(value) && value >= 200 && value <= 1000) {
        reel.expandableExpandedHeight = value;
        
        // Validate against collapsed height
        validateHeightSettings(reel, expandedHeight, section);
      }
    });
    expandedHeight.addEventListener('change', onChange);
  }

  // Project Title Image
  const titleImage = section.querySelector('#projectTitleImage');
  if (titleImage) {
    let urlTimeout;
    titleImage.addEventListener('input', () => {
      clearTimeout(urlTimeout);
      urlTimeout = setTimeout(() => {
        reel.projectTitleImage = titleImage.value.trim();
        onChange();
      }, 300);
    });
  }

  // Show Waveform on Collapse
  const showWaveform = section.querySelector('#showWaveformOnCollapse');
  if (showWaveform) {
    showWaveform.addEventListener('change', () => {
      reel.showWaveformOnCollapse = showWaveform.checked;
      onChange();
    });
  }

  // Enable Player Closed Idle
  const enableClosedIdle = section.querySelector('#enablePlayerClosedIdle');
  if (enableClosedIdle) {
    enableClosedIdle.addEventListener('change', () => {
      reel.enablePlayerClosedIdle = enableClosedIdle.checked;
      onChange();
    });
  }

  // Player Closed Idle Video
  const closedIdleVideo = section.querySelector('#playerClosedIdleVideo');
  if (closedIdleVideo) {
    let urlTimeout;
    closedIdleVideo.addEventListener('input', () => {
      clearTimeout(urlTimeout);
      urlTimeout = setTimeout(() => {
        reel.playerClosedIdleVideo = closedIdleVideo.value.trim();
        onChange();
      }, 300);
    });
  }

  // Player Closed Idle Overlay Colour is wired up by colorPicker.js
  // (pickr-player-closed-idle-overlay-color, saved to reel.playerClosedIdleOverlayColor)

  // Player Closed Idle Blur
  const closedIdleBlur = section.querySelector('#playerClosedIdleBlur');
  if (closedIdleBlur) {
    closedIdleBlur.addEventListener('input', () => {
      reel.playerClosedIdleBlur = parseInt(closedIdleBlur.value);
    });
    closedIdleBlur.addEventListener('change', onChange);
  }
}

/**
 * Validates that collapsed height is less than expanded height
 */
function validateHeightSettings(reel, changedInput, section) {
  const collapsedHeight = reel.expandableCollapsedHeight || 120;
  const expandedHeight = reel.expandableExpandedHeight || 500;
  
  // Remove any existing warnings
  const existingWarning = section.querySelector('.height-validation-warning');
  if (existingWarning) {
    existingWarning.remove();
  }
  
  // Check if collapsed >= expanded
  if (collapsedHeight >= expandedHeight) {
    // Create warning message
    const warning = document.createElement('div');
    warning.className = 'height-validation-warning';
    warning.style.padding = '0.5rem';
    warning.style.marginTop = '0.5rem';
    warning.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
    warning.style.border = '1px solid #ffc107';
    warning.style.borderRadius = '4px';
    warning.style.color = '#ffda6a';
    warning.style.fontSize = '0.85rem';
    warning.innerHTML = '⚠️ Collapsed height should be smaller than expanded height for proper functionality.';
    
    // Insert warning after the settings container
    const settingsContainer = section.querySelector('div[style*="flex-direction: column"]');
    if (settingsContainer && settingsContainer.parentNode) {
      settingsContainer.parentNode.insertBefore(warning, settingsContainer.nextSibling);
    }
    
    // Add visual feedback to inputs
    const collapsedInput = section.querySelector('#expandableCollapsedHeight');
    const expandedInput = section.querySelector('#expandableExpandedHeight');
    if (collapsedInput) collapsedInput.style.borderColor = '#ffc107';
    if (expandedInput) expandedInput.style.borderColor = '#ffc107';
  } else {
    // Reset border colors if valid
    const collapsedInput = section.querySelector('#expandableCollapsedHeight');
    const expandedInput = section.querySelector('#expandableExpandedHeight');
    if (collapsedInput) collapsedInput.style.borderColor = '';
    if (expandedInput) expandedInput.style.borderColor = '';
  }
}

/**
 * Helper: Create a Pickr color-swatch row, matching the Background Image &
 * Effects section's styling (.color-row / .pickr-button). The Pickr instance
 * itself is created by colorPicker.js, keyed off the button's id.
 */
function createColorPickerRow(label, buttonId, tooltip) {
  const row = document.createElement('div');
  row.className = 'color-row';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  if (tooltip) {
    labelEl.dataset.tooltip = tooltip;
  }

  const button = document.createElement('button');
  button.id = buttonId;
  button.className = 'pickr-button';
  button.type = 'button';

  row.appendChild(labelEl);
  row.appendChild(button);
  row.insertAdjacentHTML('beforeend', eyedropButtonHTML(buttonId));

  return row;
}

/**
 * Helper: Create a toggle-switch row, matching the Background Image/Video
 * enable toggles in the Colours & Effects section (.color-row, label on the
 * left, toggle-switch on the right). Pass { heading: true } for a toggle
 * that gates a group of rows below it, so it reads as a mini section
 * heading (bold, accent-coloured) rather than a plain option.
 */
function createToggleRow(label, id, checked, tooltip, { heading = false } = {}) {
  const row = document.createElement('div');
  row.className = 'color-row';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  labelEl.style.cursor = 'pointer';
  if (heading) {
    labelEl.style.color = 'var(--builder-accent)';
    labelEl.style.fontWeight = 'var(--builder-weight-bold)';
  }
  if (tooltip) {
    labelEl.dataset.tooltip = tooltip;
  }

  const toggle = createToggleSwitch({ id, checked });

  row.appendChild(labelEl);
  row.appendChild(toggle);

  return row;
}
