// tracksEditor.js - Handles the track editing interface

import { ValidationUtils } from './validation.js';

export function updateTracksEditor(reel, onChange) {
  function extractFileName(url) {
    if (!url) return "";
    return url
      .split("/")
      .pop()
      .split("?")[0]
      .replace(/[_-]/g, " ")
      .replace(/\.[^/.]+$/, "");
  }

  const tracksEditor = document.getElementById("tracksEditor");
  if (!tracksEditor) return;
  
  tracksEditor.innerHTML = "";
  
  reel.playlist.forEach((track, i) => {
    const row = createTrackRow(track, i, reel, onChange, extractFileName);
    tracksEditor.appendChild(row);
  });

  // Add the phantom "Add" row
  const addRow = createAddTrackRow(reel, onChange);
  tracksEditor.appendChild(addRow);
}

function createTrackRow(track, index, reel, onChange, extractFileName) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "0.5rem";
  row.style.marginBottom = "0.5rem";
  row.draggable = false;

  // Drag handle
  const dragHandle = createDragHandle(row);
  
  // Title field
  const titleField = createTitleField(track, onChange);
  
  // Copy filename button
  const copyBtn = createCopyFilenameButton(track, titleField, onChange, extractFileName);
  
  // URL field with filename display
  const { fileNameSpan, urlField } = createUrlField(track, onChange, extractFileName);
  
  // Remove button
  const removeBtn = createRemoveButton(index, reel, onChange);

  // Assemble row
  row.appendChild(dragHandle);
  row.appendChild(titleField);
  row.appendChild(copyBtn);
  row.appendChild(fileNameSpan);
  row.appendChild(urlField);
  
  if (reel.playlist.length > 1) {
    row.appendChild(removeBtn);
  }

  // Set up drag and drop
  setupDragAndDrop(row, index, reel, onChange);
  
  return row;
}

function createDragHandle(row) {
  const dragHandle = document.createElement("span");
  dragHandle.className = "track-drag-handle";
  dragHandle.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:22px;height:22px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
    </svg>
  `;
  dragHandle.style.cursor = "grab";

  // Only enable dragging when handle is pressed
  dragHandle.addEventListener("mousedown", () => { row.draggable = true; });
  dragHandle.addEventListener("mouseup", () => { row.draggable = false; });
  dragHandle.addEventListener("mouseleave", () => { row.draggable = false; });
  
  return dragHandle;
}

function createTitleField(track, onChange) {
  const titleField = document.createElement("input");
  titleField.type = "text";
  titleField.setAttribute("inputmode", "text");
  titleField.setAttribute("autocomplete", "off");
  titleField.placeholder = "Track title (optional, overrides file name)";
  titleField.value = track.title;
  titleField.size = 32;
  
  titleField.oninput = (e) => {
    track.title = e.target.value;
  };
  
  titleField.onblur = () => {
    onChange();
  };
  
  return titleField;
}

function createUrlField(track, onChange, extractFileName) {
  const fileNameSpan = document.createElement("span");
  fileNameSpan.classList.add("filename-display");
  
  const filenameText = extractFileName(track.url) || "Dropbox link";
  fileNameSpan.textContent = filenameText;
  
  if (filenameText === "Dropbox link") {
    fileNameSpan.classList.add("placeholder");
  } else {
    fileNameSpan.classList.remove("placeholder");
  }
  
  // Styling
  Object.assign(fileNameSpan.style, {
    flex: "2",
    minWidth: "14rem",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "0.35em 0.7em",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    fontWeight: "400"
  });
  fileNameSpan.tabIndex = 0;

  // Hidden URL input field
  const urlField = document.createElement("input");
  urlField.type = "text";
  urlField.value = track.url;
  
  Object.assign(urlField.style, {
    flex: "2",
    minWidth: "14rem",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "0.35em 0.7em",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    fontWeight: "400",
    display: "none"
  });

  // Click filename to edit URL
  fileNameSpan.onclick = () => {
    fileNameSpan.style.display = "none";
    urlField.style.display = "";
    urlField.focus();
  };

  // URL field events
  urlField.onblur = () => {
    const newFilenameText = extractFileName(urlField.value) || "Dropbox link";
    fileNameSpan.textContent = newFilenameText;
    
    if (newFilenameText === "Dropbox link") {
      fileNameSpan.classList.add("placeholder");
    } else {
      fileNameSpan.classList.remove("placeholder");
    }
    
    // Validate URL if provided
    if (urlField.value.trim() && !ValidationUtils.isValidAudioUrl(urlField.value)) {
      ValidationUtils.showValidationFeedback(
        urlField, 
        "Please enter a valid audio file URL (mp3, wav, etc.) or supported streaming link",
        false
      );
    } else {
      ValidationUtils.showValidationFeedback(urlField, "", true);
    }
    
    fileNameSpan.style.display = "";
    urlField.style.display = "none";
    track.url = urlField.value;
    onChange();
  };

  urlField.oninput = (e) => {
    track.url = e.target.value;
  };

  urlField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") urlField.blur();
  });

  return { fileNameSpan, urlField };
}

function createCopyFilenameButton(track, titleField, onChange, extractFileName) {
  const copyBtn = document.createElement("button");
  copyBtn.className = "track-copy-btn";
  copyBtn.type = "button";
  copyBtn.title = "Copy filename to title";
  copyBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
      <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 9-3 3m0 0 3 3m-3-3h7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  `;
  
  copyBtn.onclick = () => {
    if (track.url) {
      // Extract raw filename directly from URL (before any cleaning)
      const rawFilename = track.url
        .split("/")
        .pop()
        .split("?")[0]; // Get filename without query params
      
      if (rawFilename && rawFilename !== "Dropbox link") {
        // Clean up the filename: remove extension, replace underscores/hyphens with spaces
        const cleanTitle = rawFilename
          .replace(/\.[^/.]+$/, "") // Remove file extension
          .replace(/[_-]/g, " ") // Replace underscores and hyphens with spaces
          .trim();
        
        titleField.value = cleanTitle;
        track.title = cleanTitle;
        titleField.focus(); // Focus the title field to show it was updated
        onChange();
      }
    }
  };
  
  return copyBtn;
}

function createRemoveButton(index, reel, onChange) {
  const removeBtn = document.createElement("button");
  removeBtn.className = "track-remove-btn";
  removeBtn.type = "button";
  removeBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  `;
  
  removeBtn.onclick = () => {
    reel.playlist.splice(index, 1);
    updateTracksEditor(reel, onChange);
    onChange();
  };
  
  return removeBtn;
}

function setupDragAndDrop(row, index, reel, onChange) {
  row.addEventListener("dragstart", (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index);
    row.classList.add("dragging");
  });
  
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    row.draggable = false;
  });
  
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    
    // Remove existing drop indicators
    const tracksEditor = document.getElementById("tracksEditor");
    Array.from(tracksEditor.querySelectorAll('.drop-indicator')).forEach(el => el.remove());
    
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    
    // Insert indicator position based on row index
    if (index === reel.playlist.length - 1) {
      row.parentNode.insertBefore(indicator, row.nextSibling);
    } else {
      row.parentNode.insertBefore(indicator, row);
    }
  });
  
  row.addEventListener("dragleave", () => {
    const tracksEditor = document.getElementById("tracksEditor");
    Array.from(tracksEditor.querySelectorAll('.drop-indicator')).forEach(el => el.remove());
  });
  
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    
    const tracksEditor = document.getElementById("tracksEditor");
    Array.from(tracksEditor.querySelectorAll('.drop-indicator')).forEach(el => el.remove());
    
    const fromIndex = +e.dataTransfer.getData("text/plain");
    const toIndex = index;
    
    if (fromIndex !== toIndex) {
      const [moved] = reel.playlist.splice(fromIndex, 1);
      reel.playlist.splice(toIndex, 0, moved);
      updateTracksEditor(reel, onChange);
      onChange();
    }
  });
}

function createAddTrackRow(reel, onChange) {
  const addRow = document.createElement("div");
  addRow.className = "phantom-track-row";
  
  Object.assign(addRow.style, {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "0.5rem",
    height: "32px",
    justifyContent: "space-between"
  });

  const flexFiller = document.createElement("span");
  flexFiller.style.flex = "1";
  addRow.appendChild(flexFiller);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "track-remove-btn add-btn";
  addBtn.setAttribute("aria-label", "Add track");
  addBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  `;
  
  addBtn.onclick = () => {
    reel.playlist.push({ title: "", url: "" });
    updateTracksEditor(reel, onChange);
    onChange();
  };
  
  addRow.appendChild(addBtn);
  return addRow;
}
