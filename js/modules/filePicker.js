/**
 * Universal File Picker Module
 * Provides file browsing functionality for different asset types
 */

/**
 * Opens a file browser modal for selecting files from a specific directory
 * @param {Object} options - Configuration options
 * @param {string} options.directory - Directory to scan (e.g., 'assets/images/backgrounds')
 * @param {string[]} options.extensions - Allowed file extensions (e.g., ['.jpg', '.png'])
 * @param {string} options.title - Modal title
 * @param {Function} options.onSelect - Callback when file is selected, receives file path
 */
export function openFilePicker(options) {
  const {
    directory,
    extensions,
    title = "Select File",
    onSelect
  } = options;

  console.log(`[File Picker] Opening file browser for ${directory}...`);
  
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
    padding: "0",
    maxWidth: "600px",
    width: "90%",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
  });
  
  // Modal header
  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "1.25rem 1.5rem",
    borderBottom: "1px solid #444",
    backgroundColor: "#252525"
  });
  
  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  Object.assign(titleEl.style, {
    margin: "0 0 0.5rem 0",
    color: "#fff",
    fontSize: "1.2rem",
    fontWeight: "600"
  });
  header.appendChild(titleEl);
  
  // Breadcrumb navigation
  const breadcrumb = document.createElement("div");
  breadcrumb.className = "breadcrumb";
  Object.assign(breadcrumb.style, {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.85rem",
    color: "#999",
    flexWrap: "wrap"
  });
  header.appendChild(breadcrumb);
  
  modalContent.appendChild(header);
  
  // File list container with scroll
  const fileListContainer = document.createElement("div");
  Object.assign(fileListContainer.style, {
    flex: "1",
    overflowY: "auto",
    padding: "1rem 1.5rem"
  });
  
  // File list
  const fileList = document.createElement("div");
  fileList.className = "file-list";
  Object.assign(fileList.style, {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem"
  });
  
  // Loading message
  const loadingMsg = document.createElement("p");
  loadingMsg.textContent = "Loading files...";
  loadingMsg.style.color = "#999";
  loadingMsg.style.textAlign = "center";
  fileList.appendChild(loadingMsg);
  
  fileListContainer.appendChild(fileList);
  modalContent.appendChild(fileListContainer);
  
  // Footer with close button
  const footer = document.createElement("div");
  Object.assign(footer.style, {
    padding: "1rem 1.5rem",
    borderTop: "1px solid #444",
    backgroundColor: "#252525"
  });
  
  const closeButton = document.createElement("button");
  closeButton.textContent = "Cancel";
  Object.assign(closeButton.style, {
    padding: "0.6rem 1.2rem",
    backgroundColor: "#555",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    width: "100%",
    fontSize: "0.95rem",
    fontWeight: "500",
    transition: "background-color 0.2s"
  });
  closeButton.addEventListener("mouseenter", () => {
    closeButton.style.backgroundColor = "#666";
  });
  closeButton.addEventListener("mouseleave", () => {
    closeButton.style.backgroundColor = "#555";
  });
  closeButton.addEventListener("click", () => {
    document.body.removeChild(modal);
  });
  footer.appendChild(closeButton);
  modalContent.appendChild(footer);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Click outside to close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  // Scan directory for files
  async function scanDirectory() {
    let files = [];
    
    try {
      // Map directories to their manifest files
      const manifestMap = {
        'assets/audio': 'assets/audio-manifest.json',
        'assets/images/backgrounds': 'assets/images/backgrounds-manifest.json',
        'assets/images/project-titles': 'assets/images/project-titles-manifest.json',
        'assets/video': 'assets/video-manifest.json'
      };
      
      // Check if we have a manifest for this directory
      const manifestPath = manifestMap[directory];
      
      if (manifestPath) {
        console.log(`[File Picker] Trying manifest for ${directory}: ${manifestPath}`);
        
        try {
          const response = await fetch(manifestPath);
          if (response.ok) {
            const manifest = await response.json();
            files = manifest.files.filter(file => {
              const lowerPath = file.path.toLowerCase();
              return extensions.some(ext => lowerPath.endsWith(ext));
            });
            console.log(`[File Picker] Loaded ${files.length} files from manifest`);
          } else {
            console.log(`[File Picker] Manifest not found (${response.status}), falling back to directory scan`);
            await fallbackDirectoryScan();
          }
        } catch (error) {
          console.log(`[File Picker] Error loading manifest, falling back to directory scan`, error);
          await fallbackDirectoryScan();
        }
      } else {
        // For directories without manifests, use directory scanning
        console.log(`[File Picker] No manifest configured for ${directory}, using directory scan`);
        await fallbackDirectoryScan();
      }
    } catch (error) {
      console.error(`[File Picker] Error in scanDirectory:`, error);
    }
    
    // Fallback function for directory scanning
    async function fallbackDirectoryScan() {
      // Recursive function to scan a directory and its subdirectories
      async function scanDir(dir) {
        try {
          console.log(`[File Picker] Scanning directory: ${dir}`);
          
          // Fetch directory listing
          const response = await fetch(dir);
          
          if (!response.ok) {
            console.error(`[File Picker] Failed to fetch ${dir}: ${response.status}`);
            return;
          }
          
          const html = await response.text();
          
          // Parse HTML to find file links
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const links = doc.querySelectorAll('a');
          
          const subdirs = [];
          
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('?') && !href.startsWith('/') && !href.includes('..') && href !== '../') {
              const lowerHref = href.toLowerCase();
              
              // Check if it's a directory (ends with /)
              if (href.endsWith('/')) {
                subdirs.push(`${dir}/${href.replace(/\/$/, '')}`);
              }
              // Check if it's a file with matching extension
              else if (extensions.some(ext => lowerHref.endsWith(ext))) {
                files.push({
                  name: decodeURIComponent(href),
                  path: `${dir}/${href}`
                });
              }
            }
          }
          
          // Recursively scan subdirectories
          for (const subdir of subdirs) {
            await scanDir(subdir);
          }
          
        } catch (error) {
          console.error(`[File Picker] Error scanning ${dir}:`, error);
        }
      }
      
      await scanDir(directory);
    }
    
    console.log(`[File Picker] Found ${files.length} files in ${directory}`);
    
    // Build folder structure from flat file list
    const folderStructure = buildFolderStructure(files, directory);
    
    // Display the folder structure
    displayFolderStructure(folderStructure, directory);
  }
  
  // Build a hierarchical folder structure from flat file list
  function buildFolderStructure(files, baseDir) {
    const structure = {
      folders: {},
      files: []
    };
    
    files.forEach(file => {
      // Get path relative to base directory
      const relativePath = file.path.replace(baseDir + '/', '');
      const pathParts = relativePath.split('/');
      
      if (pathParts.length === 1) {
        // File is in root directory
        structure.files.push(file);
      } else {
        // File is in a subfolder
        const folderName = pathParts[0];
        if (!structure.folders[folderName]) {
          structure.folders[folderName] = {
            folders: {},
            files: []
          };
        }
        
        // For simplicity, we'll just track which folder the file is in
        // and store the full file info
        if (pathParts.length === 2) {
          structure.folders[folderName].files.push(file);
        } else {
          // Nested deeper - for now just add to parent folder
          structure.folders[folderName].files.push(file);
        }
      }
    });
    
    return structure;
  }
  
  // Display folder structure with navigation
  function displayFolderStructure(structure, currentPath, parentPath = null) {
    fileList.innerHTML = "";
    
    // Update breadcrumb
    updateBreadcrumb(currentPath, parentPath);
    
    const totalFiles = structure.files.length + 
                      Object.values(structure.folders).reduce((sum, folder) => sum + folder.files.length, 0);
    
    if (totalFiles === 0) {
      const noFilesMsg = document.createElement("p");
      noFilesMsg.textContent = `No files found`;
      noFilesMsg.style.color = "#999";
      noFilesMsg.style.textAlign = "center";
      noFilesMsg.style.padding = "2rem 1rem";
      fileList.appendChild(noFilesMsg);
      
      const hint = document.createElement("p");
      hint.textContent = `Add ${extensions.join(', ')} files to the ${directory} folder`;
      hint.style.color = "#666";
      hint.style.fontSize = "0.85rem";
      hint.style.textAlign = "center";
      fileList.appendChild(hint);
      return;
    }
    
    // Display folders first
    const folderNames = Object.keys(structure.folders).sort();
    folderNames.forEach(folderName => {
      const folder = structure.folders[folderName];
      const folderItem = createFolderItem(folderName, folder, currentPath);
      fileList.appendChild(folderItem);
    });
    
    // Then display files in current directory
    const sortedFiles = [...structure.files].sort((a, b) => a.name.localeCompare(b.name));
    sortedFiles.forEach(file => {
      const fileItem = createFileItem(file);
      fileList.appendChild(fileItem);
    });
  }
  
  // Update breadcrumb navigation
  function updateBreadcrumb(currentPath, parentPath) {
    breadcrumb.innerHTML = "";
    
    const pathParts = currentPath.split('/');
    
    // Create breadcrumb items
    pathParts.forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.textContent = "/";
        separator.style.color = "#666";
        separator.style.padding = "0 0.25rem";
        breadcrumb.appendChild(separator);
      }
      
      const crumb = document.createElement("span");
      crumb.textContent = part;
      crumb.style.color = index === pathParts.length - 1 ? "#fff" : "#999";
      breadcrumb.appendChild(crumb);
    });
  }
  
  // Create folder item with click to expand
  function createFolderItem(folderName, folder, currentPath) {
    const folderItem = document.createElement("div");
    folderItem.className = "folder-item";
    
    Object.assign(folderItem.style, {
      padding: "0.7rem 0.75rem",
      backgroundColor: "transparent",
      borderRadius: "4px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      color: "#fff",
      fontSize: "0.9rem",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      borderBottom: "1px solid #3a3a3a"
    });
    
    // Folder icon
    const icon = document.createElement("span");
    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;color:#fbbf24;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    `;
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    folderItem.appendChild(icon);
    
    // Folder name and file count
    const label = document.createElement("div");
    label.style.flex = "1";
    
    const name = document.createElement("div");
    name.textContent = folderName;
    name.style.fontWeight = "500";
    label.appendChild(name);
    
    const count = document.createElement("div");
    count.textContent = `${folder.files.length} file${folder.files.length !== 1 ? 's' : ''}`;
    count.style.fontSize = "0.75rem";
    count.style.color = "#999";
    count.style.marginTop = "0.15rem";
    label.appendChild(count);
    
    folderItem.appendChild(label);
    
    // Arrow indicator
    const arrow = document.createElement("span");
    arrow.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;color:#666;">
        <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    `;
    arrow.style.display = "flex";
    arrow.style.alignItems = "center";
    folderItem.appendChild(arrow);
    
    // Hover effect
    folderItem.addEventListener("mouseenter", () => {
      folderItem.style.backgroundColor = "#3a3a3a";
      const svg = arrow.querySelector('svg');
      if (svg) svg.style.color = "#999";
    });
    folderItem.addEventListener("mouseleave", () => {
      folderItem.style.backgroundColor = "transparent";
      const svg = arrow.querySelector('svg');
      if (svg) svg.style.color = "#666";
    });
    
    // Click to show folder contents
    folderItem.addEventListener("click", () => {
      displayFolderContents(folderName, folder);
    });
    
    return folderItem;
  }
  
  // Display contents of a specific folder
  function displayFolderContents(folderName, folder) {
    fileList.innerHTML = "";
    
    // Update breadcrumb to show we're in a subfolder
    breadcrumb.innerHTML = "";
    const pathParts = directory.split('/');
    pathParts.forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.textContent = "/";
        separator.style.color = "#666";
        separator.style.padding = "0 0.25rem";
        breadcrumb.appendChild(separator);
      }
      const crumb = document.createElement("span");
      crumb.textContent = part;
      crumb.style.color = "#999";
      breadcrumb.appendChild(crumb);
    });
    
    // Add current folder to breadcrumb
    const separator = document.createElement("span");
    separator.textContent = "/";
    separator.style.color = "#666";
    separator.style.padding = "0 0.25rem";
    breadcrumb.appendChild(separator);
    
    const folderCrumb = document.createElement("span");
    folderCrumb.textContent = folderName;
    folderCrumb.style.color = "#fff";
    breadcrumb.appendChild(folderCrumb);
    
    // Back button
    const backItem = document.createElement("div");
    Object.assign(backItem.style, {
      padding: "0.7rem 0.75rem",
      backgroundColor: "transparent",
      borderRadius: "4px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      color: "#4a90e2",
      fontSize: "0.9rem",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      borderBottom: "1px solid #3a3a3a",
      fontWeight: "500"
    });
    
    backItem.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:18px;height:18px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      <span>Back to all folders</span>
    `;
    
    backItem.addEventListener("mouseenter", () => {
      backItem.style.backgroundColor = "#3a3a3a";
    });
    backItem.addEventListener("mouseleave", () => {
      backItem.style.backgroundColor = "transparent";
    });
    backItem.addEventListener("click", () => {
      scanDirectory();
    });
    
    fileList.appendChild(backItem);
    
    // Display files
    const sortedFiles = [...folder.files].sort((a, b) => a.name.localeCompare(b.name));
    sortedFiles.forEach(file => {
      const fileItem = createFileItem(file);
      fileList.appendChild(fileItem);
    });
  }
  
  // Create file item
  function createFileItem(file) {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    
    Object.assign(fileItem.style, {
      padding: "0.7rem 0.75rem",
      backgroundColor: "transparent",
      borderRadius: "4px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      color: "#fff",
      fontSize: "0.9rem",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      borderBottom: "1px solid #3a3a3a"
    });
    
    // File icon
    const icon = document.createElement("span");
    const ext = file.name.split('.').pop().toLowerCase();
    icon.innerHTML = getFileIcon(ext);
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.flexShrink = "0";
    fileItem.appendChild(icon);
    
    // File name
    const name = document.createElement("span");
    name.textContent = file.name;
    name.style.flex = "1";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    name.style.whiteSpace = "nowrap";
    fileItem.appendChild(name);
    
    // Hover effect
    fileItem.addEventListener("mouseenter", () => {
      fileItem.style.backgroundColor = "#3a3a3a";
    });
    fileItem.addEventListener("mouseleave", () => {
      fileItem.style.backgroundColor = "transparent";
    });
    
    // Click to select
    fileItem.addEventListener("click", () => {
      console.log(`[File Picker] Selected: ${file.path}`);
      onSelect(file.path);
      document.body.removeChild(modal);
    });
    
    return fileItem;
  }
  
  // Get appropriate icon for file type
  function getFileIcon(extension) {
    // Audio files
    const audioExts = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a', 'webm', 'alac'];
    if (audioExts.includes(extension)) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;color:#8b5cf6;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
      `;
    }
    
    // Image files
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
    if (imageExts.includes(extension)) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;color:#10b981;">
          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      `;
    }
    
    // Video files
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
    if (videoExts.includes(extension)) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;color:#ec4899;">
          <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      `;
    }
    
    // Default document icon
    return `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;color:#6b7280;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    `;
  }
  
  // Start scanning
  scanDirectory();
}

/**
 * Creates a file picker button for input fields
 * @param {HTMLElement} inputElement - The input field to attach the button to
 * @param {Object} pickerOptions - Options to pass to openFilePicker
 * @returns {HTMLElement} The created button element
 */
export function createFilePickerButton(inputElement, pickerOptions) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "file-picker-btn";
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  `;
  btn.setAttribute("aria-label", `Browse ${pickerOptions.directory}`);
  btn.title = `Browse files from ${pickerOptions.directory}`;
  
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
  
  // Click handler
  btn.addEventListener("click", () => {
    openFilePicker({
      ...pickerOptions,
      onSelect: (filePath) => {
        inputElement.value = filePath;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
  
  return btn;
}
