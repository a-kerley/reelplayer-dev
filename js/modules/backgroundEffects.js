// backgroundEffects.js - Background image, video, and per-track background management

import { createFilePickerButton, createCropPreviewButton, createClearButton, setupDebouncedInput } from "./domUtils.js";
import { buildValueControl, wireValueControl } from "./valueControl.js";
import { trackBackgroundType } from "./trackBackground.js";

let zoomControlIdCounter = 0;

/**
 * Background image preview HTML with zoom control - one frame per player
 * height (collapsed + expanded in expandable mode), each showing the push-in peak
 * @param {string} imageUrl - Image URL
 * @param {Object} reel - Reel configuration object
 * @param {number} zoom - Zoom level (1-3)
 * @returns {string} HTML string
 */
export function createExpandablePreview(imageUrl, reel, zoom = 1) {
  const previewIframe = document.querySelector("#player-preview");
  let playerWidth = 800;
  if (previewIframe) {
    const iframeRect = previewIframe.getBoundingClientRect();
    playerWidth = Math.min(iframeRect.width, 800) || 800;
  }
  const scaleFactor = Math.min(playerWidth, 400) / playerWidth;
  const previewWidth = playerWidth * scaleFactor;

  const isExpandable = reel?.mode === "expandable";
  const frames = isExpandable
    ? [
        ["Collapsed", parseInt(reel.expandableSettings?.collapsedHeight) || 120],
        ["Expanded", parseInt(reel.expandableSettings?.expandedHeight) || 500]
      ]
    : [["Player", parseInt(reel?.playerHeight) || 500]];

  // WHY: playback pushes the image in to zoom × multiplier around its centre,
  // so relative to this base-zoom preview the area still visible at the peak is
  // always the middle 1/multiplier of the frame, whatever the zoom.
  const multiplier = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--playback-idle-zoom-multiplier")) || 1.2;
  const inset = ((1 - 1 / multiplier) / 2 * 100).toFixed(2);

  // Built (not wired) here since this is assembled into an HTML string and
  // re-parsed via innerHTML - attachZoomListener() wires it after mounting.
  const zoomControl = buildValueControl({
    id: `zoomControl${zoomControlIdCounter++}`,
    label: '',
    value: Math.round(zoom * 100),
    min: 100,
    max: 300,
    step: 10,
    unit: '%'
  });
  // `tooltip` above only lands on the (here, empty) label element - this
  // markup only ever embeds `.control.outerHTML` (see below), so set title
  // directly on the piece that's actually serialized.
  zoomControl.control.title = 'Base zoom for this background image. During playback it slowly pushes in further from here.';

  const frameHtml = frames.map(([label, height]) => `
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          <div style="font-size:0.75rem;color:#ccc;text-align:center;">${label} (${height}px)</div>
          <div style="width:${previewWidth}px;height:${height * scaleFactor}px;border:1px solid #444;border-radius:4px;overflow:hidden;position:relative;">
            <img class="preview-img" src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(${zoom});" />
            <div style="position:absolute;inset:${inset}%;border:1px dashed rgba(255,255,255,0.85);box-shadow:0 0 0 1px rgba(0,0,0,0.5);pointer-events:none;"></div>
          </div>
        </div>`).join("");

  return `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div style="text-align:center;font-size:var(--builder-text-base);color:#ccc;font-weight:var(--builder-weight-medium);">${isExpandable ? "Expandable Mode Preview" : "Background Preview"}</div>

      <div style="display:flex;align-items:center;gap:0.75rem;padding:0 1rem;">
        <label style="font-size:var(--builder-text-sm);color:#ccc;white-space:nowrap;">Zoom:</label>
        ${zoomControl.control.outerHTML}
      </div>

      <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">${frameHtml}
      </div>

      <div style="text-align:center;font-size:0.75rem;color:#999;">Dashed outline: what's still visible at the peak of the playback push-in (×${multiplier}).</div>
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
  const zoomControl = previewPane.querySelector(".value-control");
  const previewImages = previewPane.querySelectorAll(".preview-img");

  if (!zoomControl || !previewImages.length) return;

  wireValueControl(zoomControl);
  const zoomInput = zoomControl.querySelector(".value-control-input");

  // Control displays/edits 100-300 (%); stored as a 1-3 multiplier.
  zoomInput.addEventListener("input", () => {
    const zoom = parseFloat(zoomInput.value) / 100;
    track.backgroundZoom = zoom;
    previewImages.forEach(img => {
      img.style.transform = `scale(${zoom})`;
    });
  });

  if (onChange) {
    zoomInput.addEventListener("change", onChange);
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
      if (svg) svg.style.color = "#ccc";
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
      if (svg) svg.style.color = "#ccc";
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
  display.title = "Click to edit the URL directly.";
  display.style.cssText = "flex:1;min-width:0;padding:0.3rem 0.4rem;border:1px solid #444;border-radius:3px;font-size:0.75rem;background:#1e1e1e;color:#fff;cursor:text;";
  
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
  input.title = placeholder;
  input.style.cssText = "flex:1;min-width:0;padding:0.3rem 0.4rem;border:1px solid #444;border-radius:3px;font-size:0.75rem;background:#1e1e1e;color:#fff;display:none;";
  
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
    trackRow.style.cssText = "display:flex;gap:0.4rem;align-items:center;margin-bottom:0.4rem;padding:0.35rem 0.5rem;background:#262626;border-radius:3px;border:1px solid #444;";
    
    // Track label
    // Image-or-video switch (daisyUI toggle with icons: 2nd child shows when
    // off, 3rd when on). The inactive side keeps its value, just dimmed + inert.
    const typeToggle = document.createElement("label");
    typeToggle.className = "toggle toggle-sm";
    typeToggle.style.flexShrink = "0";
    typeToggle.title = "Use a background image or a background video for this track.";
    typeToggle.innerHTML = `
      <input type="checkbox" aria-label="Background video instead of image" />
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const typeCheckbox = typeToggle.querySelector("input");
    typeCheckbox.checked = trackBackgroundType(track) === "video";

    const trackLabel = document.createElement("span");
    trackLabel.style.cssText = "width:180px;font-size:0.75rem;font-weight:500;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;";
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
    previewPane.style.cssText = "display:none;margin-top:0.5rem;padding:0.75rem;background:#1e1e1e;border:1px solid #444;border-radius:4px;";
    
    const updatePreview = () => {
      if (track.backgroundImage) {
        previewPane.innerHTML = createExpandablePreview(track.backgroundImage, reel, track.backgroundZoom);
        attachZoomListener(previewPane, track, onChange);
      } else {
        previewPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No image selected</p>';
      }
    };
    
    const cropPreview = setupCropPreviewToggle(cropBtn, previewPane, updatePreview);
    
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
    separator.style.cssText = "width:1px;height:20px;background:#444;margin:0 0.3rem;flex-shrink:0;";
    
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
        videoChanged();
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
          videoChanged();
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
        videoChanged();
        onChange();
      }
    });

    // Start point: a scrub pane (same open/close button pattern as the image's
    // crop pane) that picks where this track's video begins playing.
    const startBtn = createCropPreviewButton({ id: `track-${index}-video-start` });
    startBtn.setAttribute("aria-label", "Choose video start point");
    startBtn.title = "Choose where this track's video starts playing";
    startBtn.querySelector("path").setAttribute("d", "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z");

    const startHint = document.createElement("span");
    startHint.style.cssText = "font-size:0.7rem;color:#4a90e2;white-space:nowrap;flex-shrink:0;";
    startHint.title = "This track's video starts from here";
    const updateStartHint = () => {
      const start = track.backgroundVideoStart || 0;
      startHint.textContent = start ? `@${formatVideoTime(start)}` : "";
      startHint.style.display = start ? "" : "none";
    };
    updateStartHint();

    const startPane = document.createElement("div");
    startPane.className = "bg-preview-pane";
    startPane.style.cssText = "display:none;margin-top:0.5rem;padding:0.75rem;background:#1e1e1e;border:1px solid #444;border-radius:4px;";
    const renderStartPane = () => {
      startPane.innerHTML = "";
      if (!track.backgroundVideo) {
        startPane.innerHTML = '<p style="text-align:center;color:#999;margin:1rem 0;">No video selected</p>';
        return;
      }
      startPane.appendChild(createVideoStartEditor(track, () => {
        updateStartHint();
        onChange();
      }));
    };
    const startPreview = setupCropPreviewToggle(startBtn, startPane, renderStartPane);

    // A start point belongs to one specific file - drop it when the video changes.
    function videoChanged() {
      track.backgroundVideoStart = 0;
      updateStartHint();
      if (startPreview.isOpen) renderStartPane();
    }

    // Assemble row
    const groupCss = "display:flex;gap:0.4rem;align-items:center;flex:1;min-width:0;transition:opacity 0.2s;";
    const imageGroup = document.createElement("div");
    imageGroup.style.cssText = groupCss;
    imageGroup.append(imageFilenameDisplay, imageUrlInput, imageFilePickerBtn, cropBtn, imageClearBtn);
    const videoGroup = document.createElement("div");
    videoGroup.style.cssText = groupCss;
    videoGroup.append(videoFilenameDisplay, videoUrlInput, startHint, videoFilePickerBtn, startBtn, videoClearBtn);

    const applyType = () => {
      const isVideo = typeCheckbox.checked;
      imageGroup.inert = isVideo;
      imageGroup.style.opacity = isVideo ? "0.5" : "1";
      videoGroup.inert = !isVideo;
      videoGroup.style.opacity = isVideo ? "1" : "0.5";
      if (isVideo && cropPreview.isOpen) cropPreview.toggle();
      if (!isVideo && startPreview.isOpen) startPreview.toggle();
    };
    applyType();
    typeCheckbox.addEventListener("change", () => {
      track.backgroundType = typeCheckbox.checked ? "video" : "image";
      applyType();
      onChange();
    });

    trackRow.append(typeToggle, trackLabel, imageGroup, separator, videoGroup);
    
    trackWrapper.appendChild(trackRow);
    trackWrapper.appendChild(previewPane);
    trackWrapper.appendChild(startPane);
    
    container.appendChild(trackWrapper);
  });
}

function formatVideoTime(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

/**
 * Scrub-to-pick editor for a track's video start point: a muted preview that
 * follows the slider, plus "Set start here". Writes track.backgroundVideoStart.
 * @param {Object} track - Playlist track with backgroundVideo
 * @param {Function} onCommit - Called after the start point changes
 * @returns {HTMLDivElement}
 */
function createVideoStartEditor(track, onCommit) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:0.6rem;align-items:center;";

  const video = document.createElement("video");
  video.src = track.backgroundVideo;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText = "width:100%;max-width:400px;max-height:225px;background:#000;border-radius:3px;";

  // Slider + a marker for the saved start point, positioned over the track.
  const sliderWrap = document.createElement("div");
  sliderWrap.style.cssText = "position:relative;width:100%;max-width:400px;";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "range range-primary range-xs";
  slider.style.width = "100%";
  slider.min = "0";
  slider.step = "0.04";
  slider.disabled = true;
  slider.title = "Scrub through the video to find the start point (arrow keys step about one frame).";
  slider.setAttribute("aria-label", "Video position");
  const marker = document.createElement("div");
  marker.style.cssText = "position:absolute;top:-3px;bottom:-3px;width:2px;background:#dc3545;pointer-events:none;display:none;";
  marker.title = "Current start point";
  sliderWrap.append(slider, marker);

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:0.6rem;align-items:center;font-size:0.75rem;color:#ccc;";
  const readout = document.createElement("span");
  readout.style.cssText = "font-variant-numeric:tabular-nums;min-width:9em;";
  const setBtn = document.createElement("button");
  setBtn.type = "button";
  setBtn.className = "page-block-add-btn";
  setBtn.textContent = "Set start here";
  setBtn.title = "Start this track's video from the frame shown.";
  setBtn.disabled = true;
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "page-block-add-btn";
  resetBtn.textContent = "Reset";
  resetBtn.title = "Start this track's video from the beginning.";
  const startLabel = document.createElement("span");
  startLabel.style.color = "#999";
  controls.append(readout, setBtn, resetBtn, startLabel);

  const render = () => {
    const duration = video.duration || 0;
    const start = track.backgroundVideoStart || 0;
    readout.textContent = `${formatVideoTime(video.currentTime)} / ${formatVideoTime(duration)}`;
    startLabel.textContent = `Start: ${formatVideoTime(start)}`;
    marker.style.display = duration ? "" : "none";
    if (duration) marker.style.left = `calc(${(start / duration) * 100}% - 1px)`;
  };

  video.addEventListener("loadedmetadata", () => {
    slider.max = String(video.duration);
    slider.disabled = false;
    setBtn.disabled = false;
    const start = track.backgroundVideoStart || 0;
    video.currentTime = start;
    slider.value = String(start);
    render();
  });
  video.addEventListener("seeked", render);
  slider.addEventListener("input", () => {
    video.currentTime = parseFloat(slider.value);
    render();
  });
  setBtn.addEventListener("click", () => {
    track.backgroundVideoStart = Math.round(video.currentTime * 100) / 100;
    render();
    onCommit();
  });
  resetBtn.addEventListener("click", () => {
    track.backgroundVideoStart = 0;
    video.currentTime = 0;
    slider.value = "0";
    render();
    onCommit();
  });

  wrap.append(video, sliderWrap, controls);
  render();
  return wrap;
}
