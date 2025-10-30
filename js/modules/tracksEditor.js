// tracksEditor.js - Handles the track editing interface

import { ValidationUtils } from './validation.js';
import { openFilePicker } from './filePicker.js';
import { extractFileName } from './urlUtils.js';

export function updateTracksEditor(reel, onChange) {

  const tracksEditor = document.getElementById("tracksEditor");
  if (!tracksEditor) return;
  
  tracksEditor.innerHTML = "";
  
  reel.playlist.forEach((track, i) => {
    const row = createTrackRow(track, i, reel, onChange);
    tracksEditor.appendChild(row);
  });

  // Add the phantom "Add" row
  const addRow = createAddTrackRow(reel, onChange);
  tracksEditor.appendChild(addRow);
}

function createTrackRow(track, index, reel, onChange) {
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
  const copyBtn = createCopyFilenameButton(track, titleField, onChange);
  
  // File picker button
  const filePickerBtn = createFilePickerButton(track, onChange);
  
  // URL field with filename display
  const { fileNameSpan, urlField } = createUrlField(track, onChange);
  
  // Remove button
  const removeBtn = createRemoveButton(index, reel, onChange);

  // Assemble row
  row.appendChild(dragHandle);
  row.appendChild(titleField);
  row.appendChild(copyBtn);
  row.appendChild(fileNameSpan);
  row.appendChild(urlField);
  row.appendChild(filePickerBtn);
  
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
  titleField.placeholder = "Track Title (optional, overrides file name)";
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

function createUrlField(track, onChange) {
  const fileNameSpan = document.createElement("span");
  fileNameSpan.classList.add("filename-display");
  
  const filenameText = extractFileName(track.url) || "Paste Cloudinary Link or Select File";
  fileNameSpan.textContent = filenameText;
  
  if (filenameText === "Paste Cloudinary Link or Select File") {
    fileNameSpan.classList.add("placeholder");
  } else {
    fileNameSpan.classList.remove("placeholder");
  }
  
  // Styling - match title field styling
  Object.assign(fileNameSpan.style, {
    flex: "2",
    minWidth: "14rem",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "0.35em 0.7em",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    fontWeight: "400",
    border: "1px solid #ccc",
    borderRadius: "4px",
    backgroundColor: "#fff"
  });
  fileNameSpan.tabIndex = 0;

  // Hidden URL input field
  const urlField = document.createElement("input");
  urlField.type = "text";
  urlField.value = track.url;
  urlField.placeholder = "Paste Cloudinary Link or Select File";
  
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
    const newFilenameText = extractFileName(urlField.value) || "Paste Cloudinary Link or Select File";
    fileNameSpan.textContent = newFilenameText;
    
    if (newFilenameText === "Paste Cloudinary Link or Select File") {
      fileNameSpan.classList.add("placeholder");
    } else {
      fileNameSpan.classList.remove("placeholder");
    }
    
    // Only validate and show error if URL is provided AND invalid
    const trimmedUrl = urlField.value.trim();
    if (trimmedUrl && !ValidationUtils.isValidAudioUrl(urlField.value)) {
      // URL provided but invalid - show error
      ValidationUtils.showValidationFeedback(
        urlField, 
        "Please enter a valid audio file URL (mp3, wav, etc.) or supported streaming link",
        false
      );
    } else {
      // URL is empty or valid - clear any error
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

function createCopyFilenameButton(track, titleField, onChange) {
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

function createFilePickerButton(track, onChange) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "file-picker-btn";
  btn.setAttribute("aria-label", "Browse local files");
  btn.title = "Browse files from assets/audio";
  
  // Folder icon SVG
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  `;
  
  // Styling
  Object.assign(btn.style, {
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
  btn.addEventListener("mouseenter", () => {
    const svg = btn.querySelector('svg');
    if (svg) svg.style.color = "#4a90e2";
  });
  
  btn.addEventListener("mouseleave", () => {
    const svg = btn.querySelector('svg');
    if (svg) svg.style.color = "#000";
  });
  
  // Click handler - uses the file picker module
  btn.onclick = () => {
    openFilePicker({
      directory: 'assets/audio',
      extensions: ['.mp3', '.wav', '.ogg', '.opus', '.flac', '.aac', '.m4a', '.webm', '.alac'],
      title: 'Select Audio File',
      onSelect: (selectedFilePath) => {
        track.url = selectedFilePath;
        onChange();
        
        // Update the filename display
        const fileNameSpan = btn.parentElement.querySelector('.filename-display');
        if (fileNameSpan) {
          const newFilenameText = extractFileName(selectedFilePath) || "Paste Link or Select File";
          fileNameSpan.textContent = newFilenameText;
          
          if (newFilenameText === "Paste Link or Select File") {
            fileNameSpan.classList.add("placeholder");
          } else {
            fileNameSpan.classList.remove("placeholder");
          }
        }
      }
    });
  };
  
  return btn;
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
