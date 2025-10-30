/**
 * Universal File Picker Module
 * Provides file browsing functionality for different asset types
 */

// SVG Icon Constants
const ICONS = {
  FOLDER: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
  </svg>`,
  
  ARROW_RIGHT: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>`,
  
  ARROW_LEFT: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>`,
  
  AUDIO: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
  </svg>`,
  
  IMAGE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>`,
  
  VIDEO: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>`,
  
  FILE: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>`
};

/**
 * Manifest Cache Management
 * Handles localStorage caching with TTL validation
 */
class ManifestCache {
  constructor(maxAge = 5 * 60 * 1000) {
    this.maxAge = maxAge; // Default 5 minutes
    this.keyPrefix = 'filePicker_';
  }
  
  /**
   * Get cached data if valid
   * @param {string} manifestPath - Path to manifest file
   * @returns {Array|null} Cached files or null if invalid/missing
   */
  get(manifestPath) {
    const cacheKey = this.keyPrefix + manifestPath;
    const cachedData = localStorage.getItem(cacheKey);
    
    if (!cachedData) return null;
    
    try {
      const cached = JSON.parse(cachedData);
      if (this.isValid(cached.timestamp)) {
        const cacheAge = Date.now() - cached.timestamp;
        console.log(`[Cache] Hit for ${manifestPath} (${Math.round(cacheAge / 1000)}s old)`);
        return cached.files;
      } else {
        const cacheAge = Date.now() - cached.timestamp;
        console.log(`[Cache] Expired for ${manifestPath} (${Math.round(cacheAge / 1000)}s old)`);
        return null;
      }
    } catch (e) {
      console.warn(`[Cache] Parse error for ${manifestPath}:`, e);
      return null;
    }
  }
  
  /**
   * Store data in cache with timestamp
   * @param {string} manifestPath - Path to manifest file
   * @param {Array} files - File data to cache
   */
  set(manifestPath, files) {
    const cacheKey = this.keyPrefix + manifestPath;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        files: files
      }));
      console.log(`[Cache] Stored ${manifestPath}`);
    } catch (e) {
      console.warn(`[Cache] Failed to store ${manifestPath}:`, e);
    }
  }
  
  /**
   * Check if cached data is still valid
   * @param {number} timestamp - Cache timestamp
   * @returns {boolean} True if valid
   */
  isValid(timestamp) {
    return (Date.now() - timestamp) < this.maxAge;
  }
  
  /**
   * Clear old cache entries from previous manifest locations
   */
  clearOldEntries() {
    const oldKeys = [
      'filePicker_assets/audio-manifest.json',
      'filePicker_assets/images/backgrounds-manifest.json',
      'filePicker_assets/images/project-titles-manifest.json',
      'filePicker_assets/video-manifest.json'
    ];
    
    oldKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`[Cache] Cleared old entry: ${key}`);
      }
    });
  }
  
  /**
   * Clear all file picker cache entries
   */
  clearAll() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.keyPrefix)) {
        localStorage.removeItem(key);
      }
    });
    console.log(`[Cache] Cleared all entries`);
  }
}

/**
 * Modal Component Factory Functions
 * Create reusable modal DOM elements
 */

function createModalOverlay() {
  const modal = document.createElement("div");
  modal.className = "file-picker-modal";
  return modal;
}

function createModalContent() {
  const content = document.createElement("div");
  content.className = "file-picker-content";
  return content;
}

function createModalHeader(title) {
  const header = document.createElement("div");
  header.className = "file-picker-header";
  
  const titleEl = document.createElement("h3");
  titleEl.className = "file-picker-title";
  titleEl.textContent = title;
  header.appendChild(titleEl);
  
  return header;
}

function createBreadcrumb() {
  const breadcrumb = document.createElement("div");
  breadcrumb.className = "file-picker-breadcrumb";
  return breadcrumb;
}

function createFileListContainer() {
  const container = document.createElement("div");
  container.className = "file-picker-list-container";
  
  const fileList = document.createElement("div");
  fileList.className = "file-picker-list";
  
  // Initial loading message
  const loadingMsg = document.createElement("p");
  loadingMsg.className = "file-picker-loading";
  loadingMsg.textContent = "Loading files...";
  fileList.appendChild(loadingMsg);
  
  container.appendChild(fileList);
  return { container, fileList };
}

function createModalFooter(onClose) {
  const footer = document.createElement("div");
  footer.className = "file-picker-footer";
  
  const closeButton = document.createElement("button");
  closeButton.className = "file-picker-cancel-btn";
  closeButton.textContent = "Cancel";
  closeButton.addEventListener("click", onClose);
  footer.appendChild(closeButton);
  
  return footer;
}

/**
 * Utility: Recursively count files in a folder structure
 * @param {Object} folderObj - Folder object with files and folders properties
 * @returns {number} Total file count
 */
function countFilesInFolder(folderObj) {
  let count = folderObj.files.length;
  Object.values(folderObj.folders || {}).forEach(subfolder => {
    count += countFilesInFolder(subfolder);
  });
  return count;
}

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
  
  // Create modal components
  const modal = createModalOverlay();
  const modalContent = createModalContent();
  const header = createModalHeader(title);
  const breadcrumb = createBreadcrumb();
  const { container: fileListContainer, fileList } = createFileListContainer();
  
  const closeModal = () => document.body.removeChild(modal);
  const footer = createModalFooter(closeModal);
  
  // Assemble modal structure
  header.appendChild(breadcrumb);
  modalContent.append(header, fileListContainer, footer);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Click outside to close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Scan directory for files
  async function scanDirectory() {
    let files = [];
    const cache = new ManifestCache();
    
    try {
      // Map directories to their manifest files
      const manifestMap = {
        'assets/audio': 'assets/manifests/audio.json',
        'assets/images/backgrounds': 'assets/manifests/images-backgrounds.json',
        'assets/images/project-titles': 'assets/manifests/images-titles.json',
        'assets/video': 'assets/manifests/video.json'
      };
      
      // Check if we have a manifest for this directory
      const manifestPath = manifestMap[directory];
      
      if (manifestPath) {
        console.log(`[File Picker] Loading manifest for ${directory}: ${manifestPath}`);
        
        // Clear old cache entries (one-time migration)
        cache.clearOldEntries();
        
        // Try cache first
        const cachedFiles = cache.get(manifestPath);
        if (cachedFiles) {
          files = cachedFiles.filter(file => {
            const lowerPath = file.path.toLowerCase();
            return extensions.some(ext => lowerPath.endsWith(ext));
          });
          console.log(`[File Picker] Loaded ${files.length} files from cache`);
        } else {
          // Fetch fresh data
          try {
            const response = await fetch(manifestPath);
            if (response.ok) {
              const manifest = await response.json();
              
              // Filter by extensions
              files = manifest.files.filter(file => {
                const lowerPath = file.path.toLowerCase();
                return extensions.some(ext => lowerPath.endsWith(ext));
              });
              console.log(`[File Picker] Loaded ${files.length} files from manifest`);
              
              // Cache the manifest
              cache.set(manifestPath, manifest.files);
            } else {
              console.log(`[File Picker] Manifest not found (${response.status}), falling back to directory scan`);
              await fallbackDirectoryScan();
            }
          } catch (error) {
            console.log(`[File Picker] Error loading manifest, falling back to directory scan`, error);
            await fallbackDirectoryScan();
          }
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
    console.log(`[File Picker] Files:`, files);
    
    // Build folder structure from flat file list
    const folderStructure = buildFolderStructure(files, directory);
    console.log(`[File Picker] Folder structure:`, folderStructure);
    
    // Display the folder structure
    displayFolderStructure(folderStructure, directory);
  }
  
  // Build a hierarchical folder structure from flat file list (supports unlimited nesting)
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
        // File is in nested folders - build recursive structure
        let currentLevel = structure;
        
        // Navigate/create folder hierarchy
        for (let i = 0; i < pathParts.length - 1; i++) {
          const folderName = pathParts[i];
          
          if (!currentLevel.folders[folderName]) {
            currentLevel.folders[folderName] = {
              folders: {},
              files: [],
              fullPath: baseDir + '/' + pathParts.slice(0, i + 1).join('/')
            };
          }
          
          currentLevel = currentLevel.folders[folderName];
        }
        
        // Add file to deepest folder level
        currentLevel.files.push(file);
      }
    });
    
    return structure;
  }
  
  // Display folder structure with navigation
  function displayFolderStructure(structure, currentPath, parentPath = null) {
    fileList.innerHTML = "";
    
    // Update breadcrumb (no subfolder - at root)
    updateBreadcrumb(currentPath);
    
    // Count files recursively
    const totalFiles = countFilesInFolder(structure);
    const folderCount = Object.keys(structure.folders).length;
    
    console.log(`[File Picker] Display: ${totalFiles} total files, ${folderCount} folders at root`);
    
    if (totalFiles === 0 && folderCount === 0) {
      const noFilesMsg = document.createElement("p");
      noFilesMsg.className = "file-picker-empty";
      noFilesMsg.textContent = `No files found`;
      fileList.appendChild(noFilesMsg);
      
      const hint = document.createElement("p");
      hint.className = "file-picker-hint";
      hint.textContent = `Add ${extensions.join(', ')} files to the ${directory} folder`;
      fileList.appendChild(hint);
      return;
    }
    
    // Display folders first
    const folderNames = Object.keys(structure.folders).sort();
    console.log(`[File Picker] Displaying ${folderNames.length} folders:`, folderNames);
    folderNames.forEach(folderName => {
      const folder = structure.folders[folderName];
      console.log(`[File Picker] Folder "${folderName}":`, folder);
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
  function updateBreadcrumb(basePath, subfolderName = null) {
    breadcrumb.innerHTML = "";
    
    // Build full path if subfolder provided
    const fullPath = subfolderName ? `${basePath}/${subfolderName}` : basePath;
    const pathParts = fullPath.split('/');
    
    // Create breadcrumb items
    pathParts.forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "file-picker-breadcrumb-separator";
        separator.textContent = "/";
        breadcrumb.appendChild(separator);
      }
      
      const crumb = document.createElement("span");
      crumb.className = index === pathParts.length - 1 
        ? "file-picker-breadcrumb-part active" 
        : "file-picker-breadcrumb-part";
      crumb.textContent = part;
      breadcrumb.appendChild(crumb);
    });
  }
  
  // Create folder item with click to expand
  function createFolderItem(folderName, folder, currentPath) {
    const folderItem = document.createElement("div");
    folderItem.className = "file-picker-item";
    
    // Folder icon
    const icon = document.createElement("span");
    icon.className = "file-picker-item-icon file-picker-folder-icon";
    icon.innerHTML = ICONS.FOLDER;
    folderItem.appendChild(icon);
    
    // Folder name and file count
    const label = document.createElement("div");
    label.className = "file-picker-item-label";
    
    const name = document.createElement("div");
    name.className = "file-picker-item-name";
    name.textContent = folderName;
    label.appendChild(name);
    
    // Count files recursively
    const fileCount = countFilesInFolder(folder);
    const count = document.createElement("div");
    count.className = "file-picker-folder-count";
    count.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    label.appendChild(count);
    
    folderItem.appendChild(label);
    
    // Arrow indicator
    const arrow = document.createElement("span");
    arrow.className = "file-picker-item-arrow";
    arrow.innerHTML = ICONS.ARROW_RIGHT;
    folderItem.appendChild(arrow);
    
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
    updateBreadcrumb(directory, folderName);
    
    // Back button
    const backItem = document.createElement("button");
    backItem.className = "file-picker-back-btn";
    backItem.innerHTML = `${ICONS.ARROW_LEFT}<span>Back to all folders</span>`;
    backItem.addEventListener("click", () => {
      scanDirectory();
    });
    
    fileList.appendChild(backItem);
    
    // Display subfolders first
    const subfolderNames = Object.keys(folder.folders || {}).sort();
    subfolderNames.forEach(subfolderName => {
      const subfolder = folder.folders[subfolderName];
      const subfolderItem = createFolderItem(subfolderName, subfolder, `${directory}/${folderName}`);
      fileList.appendChild(subfolderItem);
    });
    
    // Then display files
    const sortedFiles = [...folder.files].sort((a, b) => a.name.localeCompare(b.name));
    sortedFiles.forEach(file => {
      const fileItem = createFileItem(file);
      fileList.appendChild(fileItem);
    });
  }
  
  // Create file item
  function createFileItem(file) {
    const fileItem = document.createElement("div");
    fileItem.className = "file-picker-item";
    
    // File icon
    const icon = document.createElement("span");
    icon.className = "file-picker-item-icon";
    const ext = file.name.split('.').pop().toLowerCase();
    const iconClass = getFileIconClass(ext);
    icon.classList.add(iconClass);
    icon.innerHTML = getFileIcon(ext);
    fileItem.appendChild(icon);
    
    // File name
    const name = document.createElement("span");
    name.className = "file-picker-file-name";
    name.textContent = file.name;
    fileItem.appendChild(name);
    
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
    const audioExts = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a', 'webm', 'alac'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
    
    if (audioExts.includes(extension)) return ICONS.AUDIO;
    if (imageExts.includes(extension)) return ICONS.IMAGE;
    if (videoExts.includes(extension)) return ICONS.VIDEO;
    return ICONS.FILE;
  }
  
  // Get CSS class for file icon
  function getFileIconClass(extension) {
    const audioExts = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a', 'webm', 'alac'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
    
    if (audioExts.includes(extension)) return 'file-picker-audio-icon';
    if (imageExts.includes(extension)) return 'file-picker-image-icon';
    if (videoExts.includes(extension)) return 'file-picker-video-icon';
    return 'file-picker-file-icon';
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
  btn.innerHTML = ICONS.FOLDER;
  btn.setAttribute("aria-label", `Browse ${pickerOptions.directory}`);
  btn.title = `Browse files from ${pickerOptions.directory}`;
  
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
