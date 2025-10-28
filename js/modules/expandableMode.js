// expandableMode.js - Handles expandable mode UI and controls in the builder

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
  legend.style.fontWeight = '600';
  legend.style.fontSize = '0.95rem';
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
  description.style.color = '#666';
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
  legend.style.fontWeight = '600';
  legend.style.fontSize = '0.95rem';
  legend.style.padding = '0 0.5rem';
  section.appendChild(legend);

  const settingsContainer = document.createElement('div');
  settingsContainer.style.display = 'flex';
  settingsContainer.style.flexDirection = 'column';
  settingsContainer.style.gap = '1rem';
  settingsContainer.style.marginTop = '0.75rem';

  // Collapsed Height
  const collapsedHeightRow = createNumberInput(
    'Collapsed Height (px):',
    'expandableCollapsedHeight',
    reel.expandableCollapsedHeight || 120,
    50,
    300,
    'Height of the player when collapsed (banner mode)'
  );
  settingsContainer.appendChild(collapsedHeightRow);

  // Expanded Height
  const expandedHeightRow = createNumberInput(
    'Expanded Height (px):',
    'expandableExpandedHeight',
    reel.expandableExpandedHeight || 500,
    200,
    1000,
    'Height of the player when fully expanded'
  );
  settingsContainer.appendChild(expandedHeightRow);

  // Project Title Image
  const titleImageRow = createTextInput(
    'Project Title Image URL:',
    'projectTitleImage',
    reel.projectTitleImage || '',
    'URL of the image to display when collapsed'
  );
  settingsContainer.appendChild(titleImageRow);

  // Show Waveform on Collapse checkbox
  const waveformRow = createCheckboxInput(
    'Show waveform when playing (collapsed)',
    'showWaveformOnCollapse',
    reel.showWaveformOnCollapse !== false, // Default to true
    'Keep waveform visible when collapsed during playback'
  );
  settingsContainer.appendChild(waveformRow);

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
        
        if (window.previewManager) {
          window.previewManager.updatePreview(reel);
        }
      }
    });
    collapsedHeight.addEventListener('change', () => {
      if (window.saveReels && window.reels) {
        window.saveReels(window.reels);
      }
    });
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
        
        if (window.previewManager) {
          window.previewManager.updatePreview(reel);
        }
      }
    });
    expandedHeight.addEventListener('change', () => {
      if (window.saveReels && window.reels) {
        window.saveReels(window.reels);
      }
    });
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
    warning.style.backgroundColor = '#fff3cd';
    warning.style.border = '1px solid #ffc107';
    warning.style.borderRadius = '4px';
    warning.style.color = '#856404';
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
 * Helper: Create a number input row
 */
function createNumberInput(label, id, value, min, max, tooltip) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.75rem';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  labelEl.style.flex = '0 0 auto';
  labelEl.style.fontSize = '0.9rem';
  if (tooltip) {
    labelEl.title = tooltip;
  }

  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.value = value;
  input.min = min;
  input.max = max;
  input.step = '1';
  input.style.flex = '1';
  input.style.padding = '0.4rem';
  input.style.borderRadius = '4px';
  input.style.border = '1px solid var(--builder-border)';

  row.appendChild(labelEl);
  row.appendChild(input);

  return row;
}

/**
 * Helper: Create a text input row
 */
function createTextInput(label, id, value, tooltip) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexDirection = 'column';
  row.style.gap = '0.4rem';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  labelEl.style.fontSize = '0.9rem';
  labelEl.style.fontWeight = '500';
  if (tooltip) {
    labelEl.title = tooltip;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.value = value;
  input.style.padding = '0.4rem';
  input.style.borderRadius = '4px';
  input.style.border = '1px solid var(--builder-border)';
  input.placeholder = 'https://example.com/title-image.jpg';

  row.appendChild(labelEl);
  row.appendChild(input);

  return row;
}

/**
 * Helper: Create a checkbox input row
 */
function createCheckboxInput(label, id, checked, tooltip) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.5rem';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  labelEl.style.fontSize = '0.9rem';
  labelEl.style.cursor = 'pointer';
  if (tooltip) {
    labelEl.title = tooltip;
  }

  row.appendChild(input);
  row.appendChild(labelEl);

  return row;
}
