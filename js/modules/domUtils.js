// domUtils.js - DOM manipulation and element creation utilities

/**
 * Creates a fieldset element with legend and content
 * @param {Object} options - Configuration options
 * @param {string} options.id - Element ID
 * @param {string} options.legend - Legend text
 * @param {string} options.content - Inner HTML content
 * @param {Object} options.styles - Optional CSS styles
 * @returns {HTMLFieldSetElement}
 */
export function createFieldset({ id, legend, content, styles = {} }) {
  const fieldset = document.createElement("fieldset");
  fieldset.id = id;
  
  // Apply default styles
  Object.assign(fieldset.style, {
    marginTop: "2rem",
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "1rem",
    ...styles
  });
  
  fieldset.innerHTML = `
    <legend style="font-size:1.1rem;font-weight:600;color:var(--builder-accent)">${legend}</legend>
    ${content}
  `;
  
  return fieldset;
}

/**
 * Creates a color picker row with label and button
 * @param {Object} options - Configuration options
 * @param {string} options.label - Label text
 * @param {string} options.buttonId - Button element ID
 * @param {HTMLElement[]} options.additionalElements - Optional additional elements to include
 * @returns {HTMLDivElement}
 */
export function createColorRow({ label, buttonId, additionalElements = [] }) {
  const row = document.createElement("div");
  row.className = "color-row";
  
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  
  const button = document.createElement("button");
  button.id = buttonId;
  button.className = "pickr-button";
  button.type = "button";
  
  row.appendChild(labelSpan);
  additionalElements.forEach(el => row.appendChild(el));
  row.appendChild(button);
  
  return row;
}

/**
 * Creates a toggle switch element
 * @param {Object} options - Configuration options
 * @param {string} options.id - Input element ID
 * @param {boolean} options.checked - Initial checked state
 * @param {Function} options.onChange - Change event handler
 * @returns {HTMLLabelElement}
 */
export function createToggleSwitch({ id, checked = false, onChange = null }) {
  const label = document.createElement("label");
  label.className = "toggle-switch";
  label.style.marginRight = "0.5rem";
  
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = checked;
  
  if (onChange) {
    input.addEventListener("change", onChange);
  }
  
  const slider = document.createElement("span");
  slider.className = "toggle-slider";
  
  label.appendChild(input);
  label.appendChild(slider);
  
  return label;
}

/**
 * Creates a file picker button with folder icon
 * @param {Object} options - Configuration options
 * @param {string} options.id - Button element ID
 * @param {string} options.ariaLabel - Aria label for accessibility
 * @param {string} options.title - Tooltip title
 * @param {boolean} options.disabled - Initial disabled state
 * @returns {HTMLButtonElement}
 */
export function createFilePickerButton({ id, ariaLabel, title, disabled = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = "file-picker-btn";
  button.setAttribute("aria-label", ariaLabel);
  button.title = title;
  button.disabled = disabled;
  
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  `;
  
  Object.assign(button.style, {
    background: "transparent",
    color: "#000",
    border: "none",
    borderRadius: "4px",
    padding: "0.35em 0.5em",
    cursor: "pointer",
    display: disabled ? "none" : "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease"
  });
  
  // Add hover effects
  button.addEventListener("mouseenter", () => {
    if (!button.disabled) {
      const svg = button.querySelector("svg");
      if (svg) svg.style.color = "#4a90e2";
    }
  });
  
  button.addEventListener("mouseleave", () => {
    const svg = button.querySelector("svg");
    if (svg) svg.style.color = "#000";
  });
  
  return button;
}

/**
 * Creates a crop/preview button with edit icon
 * @param {Object} options - Configuration options
 * @param {string} options.id - Button element ID
 * @param {boolean} options.disabled - Initial disabled state
 * @returns {HTMLButtonElement}
 */
export function createCropPreviewButton({ id, disabled = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = "crop-preview-btn";
  button.setAttribute("aria-label", "Preview & Crop");
  button.title = "Preview & Crop";
  button.disabled = disabled;
  
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 20px; height: 20px; color: #000;">
      <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  `;
  
  Object.assign(button.style, {
    background: "transparent",
    color: "#333",
    border: "none",
    borderRadius: "4px",
    padding: "0.35em 0.5em",
    cursor: "pointer",
    display: disabled ? "none" : "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    flexShrink: "0"
  });
  
  return button;
}

/**
 * Creates a clear button with X icon
 * @param {Object} options - Configuration options
 * @param {Function} options.onClick - Click event handler
 * @returns {HTMLButtonElement}
 */
export function createClearButton({ onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = "✕";
  button.title = "Clear";
  
  button.style.cssText = "background:transparent;border:none;color:#666;font-size:0.9rem;cursor:pointer;padding:0.2rem 0.3rem;transition:color 0.2s;flex-shrink:0;line-height:1;";
  
  button.addEventListener("mouseenter", () => button.style.color = "#dc3545");
  button.addEventListener("mouseleave", () => button.style.color = "#666");
  
  if (onClick) {
    button.addEventListener("click", onClick);
  }
  
  return button;
}

/**
 * Creates a range slider with value display
 * @param {Object} options - Configuration options
 * @param {string} options.id - Input element ID
 * @param {string} options.label - Label text
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {number} options.step - Step increment
 * @param {number} options.value - Initial value
 * @param {Function} options.onInput - Input event handler
 * @param {Function} options.onChange - Change event handler
 * @param {Function} options.formatValue - Function to format display value
 * @returns {HTMLDivElement}
 */
export function createRangeSlider({ id, label, min, max, step, value, onInput, onChange, formatValue }) {
  const row = document.createElement("div");
  row.className = "color-row";
  
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  
  const input = document.createElement("input");
  input.id = id;
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  input.style.flex = "1";
  
  const valueSpan = document.createElement("span");
  valueSpan.id = `${id}Value`;
  valueSpan.style.cssText = "min-width:2.5rem;text-align:right;font-size:0.9rem;";
  valueSpan.textContent = formatValue ? formatValue(value) : value;
  
  if (onInput) {
    input.addEventListener("input", (e) => {
      valueSpan.textContent = formatValue ? formatValue(e.target.value) : e.target.value;
      onInput(e);
    });
  }
  
  if (onChange) {
    input.addEventListener("change", onChange);
  }
  
  row.appendChild(labelSpan);
  row.appendChild(input);
  row.appendChild(valueSpan);
  
  return row;
}

/**
 * Inserts an element relative to a reference element
 * @param {HTMLElement} element - Element to insert
 * @param {HTMLElement} referenceElement - Reference element
 * @param {HTMLElement} container - Container element
 * @param {string} position - Position: 'before' or 'after'
 */
export function insertElement(element, referenceElement, container, position = "after") {
  if (referenceElement) {
    if (position === "after" && referenceElement.nextSibling) {
      container.insertBefore(element, referenceElement.nextSibling);
    } else if (position === "before") {
      container.insertBefore(element, referenceElement);
    } else {
      container.appendChild(element);
    }
  } else {
    container.appendChild(element);
  }
}

/**
 * Removes elements by ID if they exist
 * @param {string[]} ids - Array of element IDs to remove
 */
export function removeElementsByIds(ids) {
  ids.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.remove();
  });
}

/**
 * Sets up debounced input handler
 * @param {HTMLInputElement} input - Input element
 * @param {Function} callback - Callback function
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Cleanup function
 */
export function setupDebouncedInput(input, callback, delay = 300) {
  let timeout;
  
  const handler = () => {
    clearTimeout(timeout);
    timeout = setTimeout(callback, delay);
  };
  
  input.addEventListener("input", handler);
  
  // Return cleanup function
  return () => {
    clearTimeout(timeout);
    input.removeEventListener("input", handler);
  };
}
