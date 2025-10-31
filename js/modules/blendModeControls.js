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
  const backgroundImageRow = document.getElementById("backgroundImageRow");
  
  if (!backgroundImageEnabled || !backgroundImageUrl) return;
  
  backgroundImageEnabled.checked = reel.backgroundImageEnabled || false;
  
  const updateBackgroundImageState = () => {
    const isEnabled = backgroundImageEnabled.checked;
    const filePickerBtn = document.getElementById("backgroundImageFilePicker");
    const cropBtn = document.getElementById("backgroundImageCropBtn");
    
    backgroundImageUrl.disabled = !isEnabled;
    backgroundImageRow.style.opacity = isEnabled ? "1" : "0.5";
    
    if (filePickerBtn) {
      filePickerBtn.style.display = isEnabled ? "inline-block" : "none";
      filePickerBtn.disabled = !isEnabled;
    }
    
    if (cropBtn) {
      cropBtn.style.display = isEnabled ? "inline-flex" : "none";
      cropBtn.disabled = !isEnabled;
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
  
  filePickerBtn.style.display = backgroundImageEnabled.checked ? "inline-block" : "none";
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
  
  cropBtn.style.display = backgroundImageEnabled.checked ? "inline-flex" : "none";
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
  const backgroundVideoRow = document.getElementById("backgroundVideoRow");
  
  if (!backgroundVideoEnabled || !backgroundVideoUrl) return;
  
  backgroundVideoEnabled.checked = reel.backgroundVideoEnabled || false;
  
  const updateBackgroundVideoState = () => {
    const isEnabled = backgroundVideoEnabled.checked;
    const videoFilePickerBtn = document.getElementById("backgroundVideoFilePicker");
    
    backgroundVideoUrl.disabled = !isEnabled;
    backgroundVideoRow.style.opacity = isEnabled ? "1" : "0.5";
    
    if (videoFilePickerBtn) {
      videoFilePickerBtn.style.display = isEnabled ? "inline-block" : "none";
      videoFilePickerBtn.disabled = !isEnabled;
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
  
  videoFilePickerBtn.style.display = backgroundVideoEnabled.checked ? "inline-block" : "none";
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
 * Sets up opacity and blur sliders
 * @param {Object} reel - Reel configuration
 */
export function setupOpacityAndBlurControls(reel) {
  const backgroundOpacity = document.getElementById("backgroundOpacity");
  const backgroundOpacityValue = document.getElementById("backgroundOpacityValue");
  const backgroundBlur = document.getElementById("backgroundBlur");
  const backgroundBlurValue = document.getElementById("backgroundBlurValue");
  
  if (backgroundOpacity && backgroundOpacityValue) {
    backgroundOpacity.value = reel.backgroundOpacity || "1";
    const updateOpacityDisplay = () => {
      const value = Math.round(backgroundOpacity.value * 100);
      backgroundOpacityValue.textContent = `${value}%`;
    };
    updateOpacityDisplay();
    
    backgroundOpacity.addEventListener("input", () => {
      reel.backgroundOpacity = backgroundOpacity.value;
      updateOpacityDisplay();
    });
    
    backgroundOpacity.addEventListener("change", () => {
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
    
    backgroundBlur.addEventListener("input", () => {
      reel.backgroundBlur = backgroundBlur.value;
      updateBlurDisplay();
    });
    
    backgroundBlur.addEventListener("change", () => {
      if (window.saveReels && window.reels) {
        window.saveReels(window.reels);
      }
    });
  }
}
