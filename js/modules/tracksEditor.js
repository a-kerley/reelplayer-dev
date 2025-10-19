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
  
  // File picker button
  const filePickerBtn = createFilePickerButton(track, onChange, extractFileName);
  
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
  
  const filenameText = extractFileName(track.url) || "Paste Link or Select File";
  fileNameSpan.textContent = filenameText;
  
  if (filenameText === "Paste Link or Select File") {
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
    const newFilenameText = extractFileName(urlField.value) || "Paste Link or Select File";
    fileNameSpan.textContent = newFilenameText;
    
    if (newFilenameText === "Paste Link or Select File") {
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

function createFilePickerButton(track, onChange, extractFileName) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "file-picker-btn";
  btn.setAttribute("aria-label", "Browse local files");
  btn.title = "Browse files from assets/audio";
  
  // Folder icon SVG
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  `;
  
  // Styling
  Object.assign(btn.style, {
    background: "var(--ui-accent, #2f2f2f)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "0.35em 0.5em",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.2s ease"
  });
  
  // Hover effect
  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = "#4a90e2";
  });
  
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = "var(--ui-accent, #2f2f2f)";
  });
  
  // Click handler - opens file browser modal
  btn.onclick = () => {
    openFileBrowserModal((selectedFilePath) => {
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
    });
  };
  
  return btn;
}

function openFileBrowserModal(onSelectCallback) {
  // Create modal overlay
  const modal = document.createElement("div");
  modal.className = "file-browser-modal";
  
  Object.assign(modal.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "10000"
  });
  
  // Create modal content
  const modalContent = document.createElement("div");
  Object.assign(modalContent.style, {
    backgroundColor: "#2f2f2f",
    borderRadius: "8px",
    padding: "1.5rem",
    maxWidth: "500px",
    width: "90%",
    maxHeight: "70vh",
    overflow: "auto",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
  });
  
  // Modal header
  const header = document.createElement("h3");
  header.textContent = "Select Audio File";
  Object.assign(header.style, {
    margin: "0 0 1rem 0",
    color: "#fff",
    fontSize: "1.2rem"
  });
  modalContent.appendChild(header);
  
  // File list
  const fileList = document.createElement("div");
  fileList.className = "file-list";
  Object.assign(fileList.style, {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem"
  });
  
  // Supported audio formats
  const audioFormats = ['.mp3', '.wav', '.ogg', '.opus', '.flac', '.aac', '.m4a', '.webm', '.alac'];
  
  // Fetch files from assets/audio directory
  fetch('/assets/audio/')
    .then(response => response.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = Array.from(doc.querySelectorAll('a'));
      
      const audioFiles = links
        .map(link => link.getAttribute('href'))
        .filter(href => href && audioFormats.some(ext => href.toLowerCase().endsWith(ext)));
      
      if (audioFiles.length === 0) {
        const noFiles = document.createElement("p");
        noFiles.textContent = "No audio files found in assets/audio/";
        noFiles.style.color = "#999";
        fileList.appendChild(noFiles);
      } else {
        audioFiles.forEach(audioFile => {
          const fileItem = document.createElement("div");
          fileItem.className = "file-item";
          
          Object.assign(fileItem.style, {
            padding: "0.75rem",
            backgroundColor: "#1f1f1f",
            borderRadius: "4px",
            cursor: "pointer",
            color: "#fff",
            transition: "background-color 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          });
          
          // File icon
          const icon = document.createElement("span");
          icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            </svg>
          `;
          fileItem.appendChild(icon);
          
          const fileNameSpan = document.createElement("span");
          fileNameSpan.textContent = decodeURIComponent(audioFile);
          fileItem.appendChild(fileNameSpan);
          
          // Hover effect
          fileItem.addEventListener("mouseenter", () => {
            fileItem.style.backgroundColor = "#4a90e2";
          });
          
          fileItem.addEventListener("mouseleave", () => {
            fileItem.style.backgroundColor = "#1f1f1f";
          });
          
          // Click to select
          fileItem.onclick = () => {
            const filePath = `assets/audio/${audioFile}`;
            onSelectCallback(filePath);
            document.body.removeChild(modal);
          };
          
          fileList.appendChild(fileItem);
        });
      }
    })
    .catch(error => {
      console.error('Error loading audio files:', error);
      const errorMsg = document.createElement("p");
      errorMsg.textContent = "Error loading files. Make sure directory listing is enabled.";
      errorMsg.style.color = "#ff6b6b";
      fileList.appendChild(errorMsg);
    });
  
  modalContent.appendChild(fileList);
  
  // Cancel button
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.type = "button";
  Object.assign(cancelBtn.style, {
    marginTop: "1rem",
    padding: "0.5rem 1rem",
    backgroundColor: "#444",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    width: "100%",
    fontSize: "0.9rem"
  });
  
  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };
  
  modalContent.appendChild(cancelBtn);
  modal.appendChild(modalContent);
  
  // Close on overlay click
  modal.onclick = (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  };
  
  document.body.appendChild(modal);
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
