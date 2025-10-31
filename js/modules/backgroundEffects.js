// backgroundEffects.js - Background image, video, and per-track background management

import { createFilePickerButton, createCropPreviewButton, createClearButton, setupDebouncedInput } from "./domUtils.js";

/**
 * Generates expandable mode preview HTML with zoom control
 * @param {string} imageUrl - Image URL
 * @param {Object} reel - Reel configuration object
 * @param {number} zoom - Zoom level (1-3)
 * @returns {string} HTML string
 */
export function createExpandablePreview(imageUrl, reel, zoom = 1) {
  if (!reel || reel.mode !== "expandable") {
    return `<img src="${imageUrl}" style="width:100%;height:auto;max-height:200px;object-fit:contain;border-radius:3px;transform:scale(${zoom});" />`;
  }
  
  const previewIframe = document.querySelector("#player-preview");
  let playerWidth = 800;
  if (previewIframe) {
    const iframeRect = previewIframe.getBoundingClientRect();
    playerWidth = Math.min(iframeRect.width, 800);
  }
  
  const collapsedHeight = parseInt(reel.expandableSettings?.collapsedHeight) || 120;
  const expandedHeight = parseInt(reel.expandableSettings?.expandedHeight) || 500;
  
  const maxPreviewWidth = Math.min(playerWidth, 400);
  const scaleFactor = maxPreviewWidth / playerWidth;
  const previewWidth = playerWidth * scaleFactor;
  const collapsedPreviewHeight = collapsedHeight * scaleFactor;
  const expandedPreviewHeight = expandedHeight * scaleFactor;
  
  return `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div style="text-align:center;font-size:0.85rem;color:#666;font-weight:500;">Expandable Mode Preview</div>
      
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
}

/**
 * Attaches zoom slider event listeners to preview pane
 * @param {HTMLElement} previewPane - Preview pane container
 * @param {Object} track - Track or reel object to update
 * @param {Function} onChange - Optional callback for final save
 */
export function attachZoomListener(previewPane, track, onChange = null) {
  const zoomSlider = previewPane.querySelector(".zoom-slider");
  const zoomValue = previewPane.querySelector(".zoom-value");
  const previewImages = previewPane.querySelectorAll(".preview-img");
  
  if (zoomSlider && zoomValue && previewImages.length) {
    zoomSlider.addEventListener("input", (e) => {
      const zoom = parseFloat(e.target.value);
      track.backgroundZoom = zoom;
      zoomValue.textContent = `${(zoom * 100).toFixed(0)}%`;
      previewImages.forEach(img => {
        img.style.transform = `scale(${zoom})`;
      });
    });
    
    if (onChange) {
      zoomSlider.addEventListener("change", () => {
        if (window.saveReels && window.reels) {
          window.saveReels(window.reels);
        }
      });
    }
  }
}

/**
 * Sets up crop/preview button toggle functionality
 * @param {HTMLButtonElement} cropBtn - Crop button element
 * @param {HTMLElement} previewPane - Preview pane container
 * @param {Function} updatePreview - Function to update preview content
 * @returns {Object} Object with previewOpen state and toggle function
 */
export function setupCropPreviewToggle(cropBtn, previewPane, updatePreview) {
  let previewOpen = false;
  
  const toggle = () => {
    previewOpen = !previewOpen;
    const svg = cropBtn.querySelector("svg");
    
    if (previewOpen) {
      previewPane.style.display = "block";
      if (svg) svg.style.color = "#4a90e2";
      updatePreview();
    } else {
      previewPane.style.display = "none";
      if (svg) svg.style.color = "#000";
    }
  };
  
  cropBtn.addEventListener("click", toggle);
  
  // Hover effects
  cropBtn.addEventListener("mouseenter", () => {
    if (!previewOpen) {
      const svg = cropBtn.querySelector("svg");
      if (svg) svg.style.color = "#4a90e2";
    }
  });
  
  cropBtn.addEventListener("mouseleave", () => {
    if (!previewOpen) {
      const svg = cropBtn.querySelector("svg");
      if (svg) svg.style.color = "#000";
    }
  });
  
  return { get isOpen() { return previewOpen; }, toggle };
}

/**
 * Creates filename display element with click-to-edit functionality
 * @param {Object} options - Configuration options
 * @param {string} options.filename - Initial filename to display
 * @param {string} options.placeholder - Placeholder text
 * @param {HTMLInputElement} options.urlInput - Associated URL input element
 * @returns {HTMLSpanElement}
 */
export function createFilenameDisplay({ filename, placeholder, urlInput }) {
  const display = document.createElement("span");
  display.classList.add("filename-display");
  display.textContent = filename || placeholder;
  display.tabIndex = 0;
  display.style.cssText = "flex:1;min-width:0;padding:0.3rem 0.4rem;border:1px solid #ddd;border-radius:3px;font-size:0.75rem;background:#fff;cursor:text;";
  
  if (filename === placeholder || !filename) {
    display.classList.add("placeholder");
  }
  
  // Click to edit
  display.onclick = () => {
    display.style.display = "none";
    urlInput.style.display = "";
    urlInput.focus();
  };
  
  return display;
}

/**
 * Creates hidden URL input with blur-to-update functionality
 * @param {Object} options - Configuration options
 * @param {string} options.value - Initial value
 * @param {string} options.placeholder - Placeholder text
 * @param {HTMLSpanElement} options.filenameDisplay - Associated filename display
 * @param {Function} options.onUpdate - Callback when URL is updated
 * @param {Function} options.extractFileName - Function to extract filename from URL
 * @returns {HTMLInputElement}
 */
export function createUrlInput({ value, placeholder, filenameDisplay, onUpdate, extractFileName }) {
  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = placeholder;
  input.value = value || "";
  input.style.cssText = "flex:1;min-width:0;padding:0.3rem 0.4rem;border:1px solid #ddd;border-radius:3px;font-size:0.75rem;color:#333;display:none;";
  
  // Update on blur
  input.onblur = () => {
    const newFilename = extractFileName(input.value) || placeholder;
    filenameDisplay.textContent = newFilename;
    
    if (newFilename === placeholder) {
      filenameDisplay.classList.add("placeholder");
    } else {
      filenameDisplay.classList.remove("placeholder");
    }
    
    filenameDisplay.style.display = "";
    input.style.display = "none";
  };
  
  // Enter key to blur
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  
  // Debounced update
  if (onUpdate) {
    setupDebouncedInput(input, onUpdate, 300);
  }
  
  return input;
}

/**
 * Renders per-track background controls
 * @param {Object} reel - Reel configuration object
 * @param {Function} onChange - Callback when changes occur
 */
export async function renderPerTrackBackgrounds(reel, onChange) {
  const container = document.getElementById("perTrackBackgroundsList");
  if (!container) return;
  
  container.innerHTML = "";
  
  const { extractFileName } = await import("./urlUtils.js");
  
  reel.playlist.forEach((track, index) => {
    // Ensure properties exist
    if (track.backgroundImage === undefined) track.backgroundImage = "";
    if (track.backgroundVideo === undefined) track.backgroundVideo = "";
    if (track.backgroundZoom === undefined) track.backgroundZoom = 1;
    
    const trackWrapper = document.createElement("div");
    trackWrapper.style.cssText = "margin-bottom:0.4rem;";
    
    const trackRow = document.createElement("div");
    trackRow.className = "per-track-bg-row";
    trackRow.style.cssText = "display:flex;gap:0.4rem;align-items:center;margin-bottom:0.4rem;padding:0.35rem 0.5rem;background:#fafafa;border-radius:3px;border:1px solid #eee;";
    
    // Track label
    const trackLabel = document.createElement("span");
    trackLabel.style.cssText = "width:180px;font-size:0.75rem;font-weight:500;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;";
    const trackTitle = track.title || `Track ${index + 1}`;
    trackLabel.textContent = trackTitle;
    trackLabel.title = trackTitle;
    
    // Image controls
    const imageFilenameDisplay = createFilenameDisplay({
      filename: extractFileName(track.backgroundImage),
      placeholder: "Image URL",
      urlInput: null // Set after creating urlInput
    });
    
    const imageUrlInput = createUrlInput({
      value: track.backgroundImage,
      placeholder: "Image URL",
      filenameDisplay: imageFilenameDisplay,
      onUpdate: () => {
        track.backgroundImage = imageUrlInput.value;
        onChange();
      },
      extractFileName
    });
    
    imageFilenameDisplay.onclick = () => {
      imageFilenameDisplay.style.display = "none";
      imageUrlInput.style.display = "";
      imageUrlInput.focus();
    };
    
    const imageFilePickerBtn = createFilePickerButton({
      id: `track-${index}-image-picker`,
      ariaLabel: "Browse backgrounds",
      title: "Browse files"
    });
    
    imageFilePickerBtn.addEventListener("click", async () => {
      const { openFilePicker } = await import("./filePicker.js");
      openFilePicker({
        directory: "assets/images/backgrounds",
        extensions: [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"],
        title: "Select Background Image",
        onSelect: (filePath) => {
          imageUrlInput.value = filePath;
          track.backgroundImage = filePath;
          const newFilename = extractFileName(filePath) || "Image URL";
          imageFilenameDisplay.textContent = newFilename;
          imageFilenameDisplay.classList.toggle("placeholder", newFilename === "Image URL");
          onChange();
        }
      });
    });
    
    // Crop/Preview button and pane
    const cropBtn = createCropPreviewButton({ id: `track-${index}-crop` });
    const previewPane = document.createElement("div");
    previewPane.className = "bg-preview-pane";
    previewPane.style.cssText = "display:none;margin-top:0.5rem;padding:0.75rem;background:#fff;border:1px solid #ddd;border-radius:4px;";
    
    const updatePreview = () => {
      if (track.backgroundImage) {
        previewPane.innerHTML = createExpandablePreview(track.backgroundImage, reel, track.backgroundZoom);
        attachZoomListener(previewPane, track);
      } else {
        previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
      }
    };
    
    setupCropPreviewToggle(cropBtn, previewPane, updatePreview);
    
    // Update preview when URL changes
    imageUrlInput.addEventListener("input", () => {
      if (previewPane.style.display === "block") {
        updatePreview();
      }
    });
    
    const imageClearBtn = createClearButton({
      onClick: () => {
        imageUrlInput.value = "";
        track.backgroundImage = "";
        imageFilenameDisplay.textContent = "Image URL";
        imageFilenameDisplay.classList.add("placeholder");
        onChange();
        if (previewPane.style.display === "block") {
          previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
        }
      }
    });
    
    // Separator
    const separator = document.createElement("div");
    separator.style.cssText = "width:1px;height:20px;background:#ddd;margin:0 0.3rem;flex-shrink:0;";
    
    // Video controls
    const videoFilenameDisplay = createFilenameDisplay({
      filename: extractFileName(track.backgroundVideo),
      placeholder: "Video URL",
      urlInput: null
    });
    
    const videoUrlInput = createUrlInput({
      value: track.backgroundVideo,
      placeholder: "Video URL",
      filenameDisplay: videoFilenameDisplay,
      onUpdate: () => {
        track.backgroundVideo = videoUrlInput.value;
        onChange();
      },
      extractFileName
    });
    
    videoFilenameDisplay.onclick = () => {
      videoFilenameDisplay.style.display = "none";
      videoUrlInput.style.display = "";
      videoUrlInput.focus();
    };
    
    const videoFilePickerBtn = createFilePickerButton({
      id: `track-${index}-video-picker`,
      ariaLabel: "Browse videos",
      title: "Browse video files"
    });
    
    videoFilePickerBtn.addEventListener("click", async () => {
      const { openFilePicker } = await import("./filePicker.js");
      openFilePicker({
        directory: "assets/video",
        extensions: [".mp4", ".webm", ".mov", ".avi", ".mkv"],
        title: "Select Background Video",
        onSelect: (filePath) => {
          videoUrlInput.value = filePath;
          track.backgroundVideo = filePath;
          const newFilename = extractFileName(filePath) || "Video URL";
          videoFilenameDisplay.textContent = newFilename;
          videoFilenameDisplay.classList.toggle("placeholder", newFilename === "Video URL");
          onChange();
        }
      });
    });
    
    const videoClearBtn = createClearButton({
      onClick: () => {
        videoUrlInput.value = "";
        track.backgroundVideo = "";
        videoFilenameDisplay.textContent = "Video URL";
        videoFilenameDisplay.classList.add("placeholder");
        onChange();
      }
    });
    
    // Assemble row
    trackRow.appendChild(trackLabel);
    trackRow.appendChild(imageFilenameDisplay);
    trackRow.appendChild(imageUrlInput);
    trackRow.appendChild(imageFilePickerBtn);
    trackRow.appendChild(cropBtn);
    trackRow.appendChild(imageClearBtn);
    trackRow.appendChild(separator);
    trackRow.appendChild(videoFilenameDisplay);
    trackRow.appendChild(videoUrlInput);
    trackRow.appendChild(videoFilePickerBtn);
    trackRow.appendChild(videoClearBtn);
    
    trackWrapper.appendChild(trackRow);
    trackWrapper.appendChild(previewPane);
    
    container.appendChild(trackWrapper);
  });
}
