// titleAppearance.js - Handles title appearance controls

import { ValidationUtils } from './validation.js';

export function createTitleAppearanceSection(reel, onChange) {
  // Remove old section if present
  const oldTitleAppearance = document.getElementById("reelTitleAppearanceSection");
  if (oldTitleAppearance) oldTitleAppearance.remove();

  // Remove original checkbox label from form
  const showTitleCheckbox = document.getElementById("reelShowTitle");
  const showTitleLabel = showTitleCheckbox?.closest("label");
  if (showTitleLabel && showTitleLabel.parentNode) {
    showTitleLabel.parentNode.removeChild(showTitleLabel);
  }

  // Create new fieldset
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

  return titleAppearanceSection;
}

export function setupTitleAppearanceControls(titleAppearanceSection, reel, onChange) {
  // Ensure titleAppearance object exists
  if (!reel.titleAppearance) {
    reel.titleAppearance = {};
  }

  const defaultAppearance = {
    fontSize: "1.3rem",
    fontWeight: "700",
    align: "center",
    paddingBottom: "0.8rem"
  };

  const ta = reel.titleAppearance;

  // Font size input
  const fontSizeInput = titleAppearanceSection.querySelector("#reelTitleFontSizePt");
  let ptVal = 11; // default
  if (ta.fontSize && ta.fontSize.endsWith("px")) {
    ptVal = Math.round(parseFloat(ta.fontSize) / 1.333);
  } else if (ta.fontSize && ta.fontSize.endsWith("pt")) {
    ptVal = parseInt(ta.fontSize, 10);
  }
  fontSizeInput.value = ptVal;
  
  fontSizeInput.oninput = () => {
    const val = parseInt(fontSizeInput.value, 10) || 11;
    const validatedSize = ValidationUtils.validateFontSize(val);
    
    if (validatedSize) {
      reel.titleAppearance.fontSize = validatedSize;
      ValidationUtils.showValidationFeedback(fontSizeInput, "", true);
    } else {
      ValidationUtils.showValidationFeedback(
        fontSizeInput, 
        "Font size must be between 8 and 72 points",
        false
      );
    }
  };
  
  fontSizeInput.onblur = () => {
    onChange();
  };

  // Font weight
  const fontWeightSelect = titleAppearanceSection.querySelector("#reelTitleFontWeight");
  fontWeightSelect.value = ta.fontWeight || defaultAppearance.fontWeight;
  fontWeightSelect.onchange = () => {
    reel.titleAppearance.fontWeight = fontWeightSelect.value;
    onChange();
  };

  // Alignment
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

  // Padding bottom
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
    
    if (val === "") {
      delete reel.titleAppearance.paddingBottom;
      ValidationUtils.showValidationFeedback(paddingInput, "", true);
    } else {
      const validatedPadding = ValidationUtils.validatePadding(val);
      
      if (validatedPadding) {
        reel.titleAppearance.paddingBottom = validatedPadding;
        ValidationUtils.showValidationFeedback(paddingInput, "", true);
      } else {
        ValidationUtils.showValidationFeedback(
          paddingInput, 
          "Padding must be between 0 and 100 pixels",
          false
        );
      }
    }
  };
  
  paddingInput.onblur = () => {
    onChange();
  };

  // Show title checkbox
  const showTitleCheckboxNew = titleAppearanceSection.querySelector("#reelShowTitle");
  showTitleCheckboxNew.checked = !!reel.showTitle;
  
  showTitleCheckboxNew.onchange = () => {
    reel.showTitle = showTitleCheckboxNew.checked;
    setTitleAppearanceEnabled(reel.showTitle);
    onChange();
  };

  // Set initial state
  setTitleAppearanceEnabled(showTitleCheckboxNew.checked);

  function setTitleAppearanceEnabled(enabled) {
    const fieldset = document.getElementById("reelTitleAppearanceSection");
    if (!fieldset) return;
    
    if (!enabled) {
      fieldset.classList.add("disabled");
    } else {
      fieldset.classList.remove("disabled");
    }
  }
}
