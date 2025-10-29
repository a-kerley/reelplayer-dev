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
    padding: "1.5rem",
    maxWidth: "500px",
    width: "90%",
    maxHeight: "70vh",
    overflow: "auto",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
  });
  
  // Modal header
  const header = document.createElement("h3");
  header.textContent = title;
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
  
  // Loading message
  const loadingMsg = document.createElement("p");
  loadingMsg.textContent = "Loading files...";
  loadingMsg.style.color = "#999";
  loadingMsg.style.textAlign = "center";
  fileList.appendChild(loadingMsg);
  
  modalContent.appendChild(fileList);
  
  // Close button
  const closeButton = document.createElement("button");
  closeButton.textContent = "Cancel";
  Object.assign(closeButton.style, {
    marginTop: "1rem",
    padding: "0.5rem 1rem",
    backgroundColor: "#555",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    width: "100%"
  });
  closeButton.addEventListener("click", () => {
    document.body.removeChild(modal);
  });
  modalContent.appendChild(closeButton);
  
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
    const files = [];
    
    try {
      // Fetch directory listing
      const response = await fetch(directory);
      const html = await response.text();
      
      // Parse HTML to find file links
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a');
      
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('?') && !href.startsWith('/') && !href.includes('..')) {
          const lowerHref = href.toLowerCase();
          if (extensions.some(ext => lowerHref.endsWith(ext))) {
            files.push({
              name: decodeURIComponent(href),
              path: `${directory}/${href}`
            });
          }
        }
      });
      
      console.log(`[File Picker] Found ${files.length} files in ${directory}`);
      
    } catch (error) {
      console.error(`[File Picker] Error scanning ${directory}:`, error);
    }
    
    // Update file list
    fileList.innerHTML = "";
    
    if (files.length === 0) {
      const noFilesMsg = document.createElement("p");
      noFilesMsg.textContent = `No files found in ${directory}`;
      noFilesMsg.style.color = "#999";
      noFilesMsg.style.textAlign = "center";
      noFilesMsg.style.padding = "1rem";
      fileList.appendChild(noFilesMsg);
      
      const hint = document.createElement("p");
      hint.textContent = `Add ${extensions.join(', ')} files to the ${directory} folder`;
      hint.style.color = "#666";
      hint.style.fontSize = "0.9rem";
      hint.style.textAlign = "center";
      fileList.appendChild(hint);
      return;
    }
    
    // Sort files alphabetically
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    // Create file items
    files.forEach(file => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      Object.assign(fileItem.style, {
        padding: "0.75rem",
        backgroundColor: "#3a3a3a",
        borderRadius: "4px",
        cursor: "pointer",
        transition: "background-color 0.2s",
        color: "#fff",
        fontSize: "0.9rem",
        wordBreak: "break-word"
      });
      
      fileItem.textContent = file.name;
      
      // Hover effect
      fileItem.addEventListener("mouseenter", () => {
        fileItem.style.backgroundColor = "#4a4a4a";
      });
      fileItem.addEventListener("mouseleave", () => {
        fileItem.style.backgroundColor = "#3a3a3a";
      });
      
      // Click to select
      fileItem.addEventListener("click", () => {
        console.log(`[File Picker] Selected: ${file.path}`);
        onSelect(file.path);
        document.body.removeChild(modal);
      });
      
      fileList.appendChild(fileItem);
    });
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
