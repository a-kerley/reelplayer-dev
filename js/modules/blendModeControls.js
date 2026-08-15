// blendModeControls.js - Background effects UI controls

import { setupDebouncedInput } from "./domUtils.js";
import { createExpandablePreview, attachZoomListener, setupCropPreviewToggle } from "./backgroundEffects.js";
import { ValidationUtils } from "./validation.js";

/**
 * Sets up background image toggle and controls
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupBackgroundImageControls(reel, onChange) {
  const backgroundImageEnabled = document.getElementById("backgroundImageEnabled");
  const backgroundImageUrl = document.getElementById("backgroundImageUrl");

  if (!backgroundImageEnabled || !backgroundImageUrl) return;

  backgroundImageEnabled.checked = reel.backgroundImageEnabled || false;

  const updateBackgroundImageState = () => {
    const isEnabled = backgroundImageEnabled.checked;
    const filePickerBtn = document.getElementById("backgroundImageFilePicker");
    const cropBtn = document.getElementById("backgroundImageCropBtn");

    // Dim the URL input/buttons individually rather than the whole row -
    // the row now also holds the toggle itself (see js/builder.js), which
    // must stay at full opacity regardless of its own checked state.
    backgroundImageUrl.disabled = !isEnabled;
    backgroundImageUrl.style.opacity = isEnabled ? "1" : "0.5";

    if (filePickerBtn) {
      filePickerBtn.disabled = !isEnabled;
      filePickerBtn.style.opacity = isEnabled ? "1" : "0.5";
    }

    if (cropBtn) {
      cropBtn.disabled = !isEnabled;
      cropBtn.style.opacity = isEnabled ? "1" : "0.5";
    }

    reel.backgroundImageEnabled = isEnabled;
  };
  
  updateBackgroundImageState();
  
  backgroundImageEnabled.addEventListener("change", () => {
    updateBackgroundImageState();
    onChange();
  });
  
  // Set up URL input
  backgroundImageUrl.value = reel.backgroundImage || "";
  setupDebouncedInput(backgroundImageUrl, () => {
    reel.backgroundImage = ValidationUtils.isValidImageUrl(backgroundImageUrl.value) 
      ? backgroundImageUrl.value 
      : "";
    onChange();
  }, 300);
}

/**
 * Sets up background image file picker
 * @param {Object} reel - Reel configuration
 */
export async function setupBackgroundImageFilePicker(reel) {
  const filePickerBtn = document.getElementById("backgroundImageFilePicker");
  const backgroundImageUrl = document.getElementById("backgroundImageUrl");
  const backgroundImageEnabled = document.getElementById("backgroundImageEnabled");
  
  if (!filePickerBtn) return;
  
  filePickerBtn.addEventListener("click", async () => {
    const { openFilePicker } = await import("./filePicker.js");
    openFilePicker({
      directory: "assets/images/backgrounds",
      extensions: [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"],
      title: "Select Background Image",
      onSelect: (filePath) => {
        backgroundImageUrl.value = filePath;
        backgroundImageUrl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });
  
  filePickerBtn.disabled = !backgroundImageEnabled.checked;
}

/**
 * Sets up background image crop/preview functionality
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupBackgroundImagePreview(reel, onChange) {
  const cropBtn = document.getElementById("backgroundImageCropBtn");
  const previewPane = document.getElementById("backgroundImagePreviewPane");
  const backgroundImageUrl = document.getElementById("backgroundImageUrl");
  const backgroundImageEnabled = document.getElementById("backgroundImageEnabled");
  
  if (!cropBtn || !previewPane) return;
  
  if (reel.backgroundZoom === undefined) {
    reel.backgroundZoom = 1;
  }
  
  const updatePreview = () => {
    if (backgroundImageUrl.value) {
      previewPane.innerHTML = createExpandablePreview(backgroundImageUrl.value, reel, reel.backgroundZoom);
      attachZoomListener(previewPane, reel, onChange);
    } else {
      previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
    }
  };
  
  const { isOpen } = setupCropPreviewToggle(cropBtn, previewPane, updatePreview);
  
  backgroundImageUrl.addEventListener("input", () => {
    if (isOpen) {
      updatePreview();
    }
  });
  
  cropBtn.disabled = !backgroundImageEnabled.checked;
}

/**
 * Sets up background video toggle and controls
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupBackgroundVideoControls(reel, onChange) {
  const backgroundVideoEnabled = document.getElementById("backgroundVideoEnabled");
  const backgroundVideoUrl = document.getElementById("backgroundVideoUrl");

  if (!backgroundVideoEnabled || !backgroundVideoUrl) return;

  backgroundVideoEnabled.checked = reel.backgroundVideoEnabled || false;

  const updateBackgroundVideoState = () => {
    const isEnabled = backgroundVideoEnabled.checked;
    const videoFilePickerBtn = document.getElementById("backgroundVideoFilePicker");

    // Dim the URL input/button individually rather than the whole row -
    // the row now also holds the toggle itself (see js/builder.js), which
    // must stay at full opacity regardless of its own checked state.
    backgroundVideoUrl.disabled = !isEnabled;
    backgroundVideoUrl.style.opacity = isEnabled ? "1" : "0.5";

    if (videoFilePickerBtn) {
      videoFilePickerBtn.disabled = !isEnabled;
      videoFilePickerBtn.style.opacity = isEnabled ? "1" : "0.5";
    }

    reel.backgroundVideoEnabled = isEnabled;
  };
  
  updateBackgroundVideoState();
  
  backgroundVideoEnabled.addEventListener("change", () => {
    updateBackgroundVideoState();
    onChange();
  });
  
  // Set up URL input
  backgroundVideoUrl.value = reel.backgroundVideo || "";
  setupDebouncedInput(backgroundVideoUrl, () => {
    reel.backgroundVideo = backgroundVideoUrl.value;
    onChange();
  }, 300);
}

/**
 * Sets up background video file picker
 */
export async function setupBackgroundVideoFilePicker() {
  const videoFilePickerBtn = document.getElementById("backgroundVideoFilePicker");
  const backgroundVideoUrl = document.getElementById("backgroundVideoUrl");
  const backgroundVideoEnabled = document.getElementById("backgroundVideoEnabled");
  
  if (!videoFilePickerBtn) return;
  
  videoFilePickerBtn.addEventListener("click", async () => {
    const { openFilePicker } = await import("./filePicker.js");
    openFilePicker({
      directory: "assets/video",
      extensions: [".mp4", ".webm", ".mov", ".avi", ".mkv"],
      title: "Select Background Video",
      onSelect: (filePath) => {
        backgroundVideoUrl.value = filePath;
        backgroundVideoUrl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });
  
  videoFilePickerBtn.disabled = !backgroundVideoEnabled.checked;
}

/**
 * Sets up overlay color toggle
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupOverlayColorControls(reel, onChange) {
  const overlayColorEnabled = document.getElementById("overlayColorEnabled");
  const overlayColorButton = document.getElementById("pickr-overlay-color");
  
  if (!overlayColorEnabled) return;
  
  overlayColorEnabled.checked = reel.overlayColorEnabled || false;
  
  const updateOverlayColorState = () => {
    const isEnabled = overlayColorEnabled.checked;
    if (overlayColorButton) {
      overlayColorButton.disabled = !isEnabled;
      overlayColorButton.style.opacity = isEnabled ? "1" : "0.5";
    }
    reel.overlayColorEnabled = isEnabled;
  };
  
  updateOverlayColorState();
  
  overlayColorEnabled.addEventListener("change", () => {
    updateOverlayColorState();
    onChange();
  });
}

/**
 * Sets up the static background colour toggle. Unlike overlay colour
 * (opt-in, defaults off), background colour has always rendered
 * unconditionally, so this defaults to ON (reel.backgroundColorEnabled
 * !== false) rather than requiring existing reels to opt back in.
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupBackgroundColorControls(reel, onChange) {
  const backgroundColorEnabled = document.getElementById("backgroundColorEnabled");
  const backgroundColorButton = document.getElementById("pickr-background-color");

  if (!backgroundColorEnabled) return;

  backgroundColorEnabled.checked = reel.backgroundColorEnabled !== false;

  const updateBackgroundColorState = () => {
    const isEnabled = backgroundColorEnabled.checked;
    if (backgroundColorButton) {
      backgroundColorButton.disabled = !isEnabled;
      backgroundColorButton.style.opacity = isEnabled ? "1" : "0.5";
    }
    reel.backgroundColorEnabled = isEnabled;
  };

  updateBackgroundColorState();

  backgroundColorEnabled.addEventListener("change", () => {
    updateBackgroundColorState();
    onChange();
  });
}

/**
 * Sets up opacity and blur value controls
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupOpacityAndBlurControls(reel, onChange) {
  // Stored as a 0-1 fraction (fed straight into a CSS opacity value elsewhere),
  // but the control itself displays/edits it as a 0-100 percentage.
  const backgroundOpacity = document.getElementById("backgroundOpacity");
  const backgroundOpacitySlider = document.getElementById("backgroundOpacitySlider");

  if (backgroundOpacity) {
    const initialPercent = Math.round((parseFloat(reel.backgroundOpacity) || 1) * 100);
    backgroundOpacity.value = initialPercent;
    if (backgroundOpacitySlider) backgroundOpacitySlider.value = initialPercent;

    backgroundOpacity.addEventListener("input", () => {
      reel.backgroundOpacity = (parseFloat(backgroundOpacity.value) / 100).toString();
    });

    backgroundOpacity.addEventListener("change", onChange);
  }

  const backgroundBlur = document.getElementById("backgroundBlur");
  const backgroundBlurSlider = document.getElementById("backgroundBlurSlider");
  if (backgroundBlur) {
    backgroundBlur.value = reel.backgroundBlur || "2";
    if (backgroundBlurSlider) backgroundBlurSlider.value = backgroundBlur.value;

    backgroundBlur.addEventListener("input", () => {
      reel.backgroundBlur = backgroundBlur.value;
    });

    backgroundBlur.addEventListener("change", onChange);
  }
}

/**
 * Sets up the player outline toggle, colour, and width controls
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupOutlineControls(reel, onChange) {
  const outlineEnabled = document.getElementById("playerOutlineEnabled");
  const outlineColorButton = document.getElementById("pickr-outline-color");
  const outlineWidth = document.getElementById("playerOutlineWidth");
  const outlineWidthSlider = document.getElementById("playerOutlineWidthSlider");
  if (!outlineEnabled || !outlineWidth) return;

  // This toggle didn't exist when playerOutlineWidth was introduced, so an
  // existing reel with a nonzero width (previously the only way to make an
  // outline visible) should still show one until the user says otherwise.
  outlineEnabled.checked = reel.playerOutlineEnabled ?? (reel.playerOutlineWidth > 0);

  outlineWidth.value = reel.playerOutlineWidth || 0;
  if (outlineWidthSlider) outlineWidthSlider.value = outlineWidth.value;

  const updateOutlineState = () => {
    const isEnabled = outlineEnabled.checked;
    if (outlineColorButton) {
      outlineColorButton.disabled = !isEnabled;
      outlineColorButton.style.opacity = isEnabled ? "1" : "0.5";
    }
    outlineWidth.disabled = !isEnabled;
    if (outlineWidthSlider) outlineWidthSlider.disabled = !isEnabled;
    reel.playerOutlineEnabled = isEnabled;
  };

  updateOutlineState();

  outlineEnabled.addEventListener("change", () => {
    updateOutlineState();
    onChange();
  });

  outlineWidth.addEventListener("input", () => {
    reel.playerOutlineWidth = parseInt(outlineWidth.value, 10) || 0;
  });

  outlineWidth.addEventListener("change", onChange);
}

/**
 * Sets up hover-darken toggle and amount slider
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupHoverDarkenControls(reel, onChange) {
  const hoverDarkenEnabled = document.getElementById("hoverDarkenEnabled");
  const hoverDarkenAmount = document.getElementById("hoverDarkenAmount");
  const hoverDarkenAmountSlider = document.getElementById("hoverDarkenAmountSlider");

  if (!hoverDarkenEnabled || !hoverDarkenAmount) return;

  hoverDarkenEnabled.checked = reel.hoverDarkenEnabled || false;
  hoverDarkenAmount.value = reel.hoverDarkenAmount ?? 15;
  if (hoverDarkenAmountSlider) hoverDarkenAmountSlider.value = hoverDarkenAmount.value;

  const updateEnabledState = () => {
    const isEnabled = hoverDarkenEnabled.checked;
    hoverDarkenAmount.disabled = !isEnabled;
    if (hoverDarkenAmountSlider) hoverDarkenAmountSlider.disabled = !isEnabled;
    reel.hoverDarkenEnabled = isEnabled;
  };
  updateEnabledState();

  hoverDarkenEnabled.addEventListener("change", () => {
    updateEnabledState();
    onChange();
  });

  hoverDarkenAmount.addEventListener("input", () => {
    reel.hoverDarkenAmount = parseInt(hoverDarkenAmount.value);
  });

  hoverDarkenAmount.addEventListener("change", onChange);
}

/**
 * Sets up idle-unblur toggle and amount slider - mirrors
 * setupHoverDarkenControls() above structurally, but the effect itself
 * triggers off playback-idle/collapsed-idle (see css/player.css), not hover.
 * @param {Object} reel - Reel configuration
 * @param {Function} onChange - Change callback
 */
export function setupIdleUnblurControls(reel, onChange) {
  const idleUnblurEnabled = document.getElementById("idleUnblurEnabled");
  const idleUnblurAmount = document.getElementById("idleUnblurAmount");
  const idleUnblurAmountSlider = document.getElementById("idleUnblurAmountSlider");

  if (!idleUnblurEnabled || !idleUnblurAmount) return;

  idleUnblurEnabled.checked = reel.idleUnblurEnabled || false;
  idleUnblurAmount.value = reel.idleUnblurAmount ?? 50;
  if (idleUnblurAmountSlider) idleUnblurAmountSlider.value = idleUnblurAmount.value;

  const updateEnabledState = () => {
    const isEnabled = idleUnblurEnabled.checked;
    idleUnblurAmount.disabled = !isEnabled;
    if (idleUnblurAmountSlider) idleUnblurAmountSlider.disabled = !isEnabled;
    reel.idleUnblurEnabled = isEnabled;
  };
  updateEnabledState();

  idleUnblurEnabled.addEventListener("change", () => {
    updateEnabledState();
    onChange();
  });

  idleUnblurAmount.addEventListener("input", () => {
    reel.idleUnblurAmount = parseInt(idleUnblurAmount.value);
  });

  idleUnblurAmount.addEventListener("change", onChange);
}
