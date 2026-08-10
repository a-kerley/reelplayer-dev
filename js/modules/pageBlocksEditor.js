// pageBlocksEditor.js - Add/remove/reorder UI for a page's blocks, the Pages
// counterpart of js/modules/tracksEditor.js. Drag-and-drop is structurally
// copied from there (same drag-handle-toggles-draggable-on-mousedown
// pattern, same dragstart/dragover/dragleave/drop sequence) rather than a
// generic shared abstraction - the two lists differ enough per-row (type-
// specific config forms here vs. fixed title/url fields there) that forcing
// a shared component would add more indirection than it'd save.
import { createUrlInputRow } from "./domUtils.js";
import { createValueControl } from "./valueControl.js";
import { renderBlock } from "./pageBlockRenderer.js";
import { openReelPicker } from "./reelPicker.js";
import { openContextMenu } from "./contextMenu.js";

const BLOCK_TYPE_LABELS = {
  "banner-image": "Banner Image",
  text: "Text",
  image: "Image",
  player: "Player",
};

// Iconoir (MIT license, iconoir.com) icons, inlined per this codebase's
// existing convention of embedding raw SVG markup directly rather than
// loading an icon font/library - see e.g. js/modules/domUtils.js,
// js/modules/tracksEditor.js.
const ICONS = {
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12H12M18 12H12M12 12V6M12 12V18" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "banner-image": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 3.6V20.4C21 20.7314 20.7314 21 20.4 21H3.6C3.26863 21 3 20.7314 3 20.4V3.6C3 3.26863 3.26863 3 3.6 3H20.4C20.7314 3 21 3.26863 21 3.6Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 16L10 13L21 18" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10C14.8954 10 14 9.10457 14 8C14 6.89543 14.8954 6 16 6C17.1046 6 18 6.89543 18 8C18 9.10457 17.1046 10 16 10Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 3.6V20.4C21 20.7314 20.7314 21 20.4 21H3.6C3.26863 21 3 20.7314 3 20.4V3.6C3 3.26863 3.26863 3 3.6 3H20.4C20.7314 3 21 3.26863 21 3.6Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 9V7L17 7V9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7V17M12 17H10M12 17H14" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  image: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 7.6V20.4C21 20.7314 20.7314 21 20.4 21H7.6C7.26863 21 7 20.7314 7 20.4V7.6C7 7.26863 7.26863 7 7.6 7H20.4C20.7314 7 21 7.26863 21 7.6Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 4H4.6C4.26863 4 4 4.26863 4 4.6V18" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 16.8L12.4444 15L21 18" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 13C15.6716 13 15 12.3284 15 11.5C15 10.6716 15.6716 10 16.5 10C17.3284 10 18 10.6716 18 11.5C18 12.3284 17.3284 13 16.5 13Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  player: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.90588 4.53682C6.50592 4.2998 6 4.58808 6 5.05299V18.947C6 19.4119 6.50592 19.7002 6.90588 19.4632L18.629 12.5162C19.0211 12.2838 19.0211 11.7162 18.629 11.4838L6.90588 4.53682Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function createEmptyBlock(type) {
  const blockId = "block-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  switch (type) {
    case "banner-image":
      return { blockId, type, imageUrl: "", altText: "", caption: "", maxHeight: 600 };
    case "text":
      return { blockId, type, heading: "", body: "", alignment: "left" };
    case "image":
      return { blockId, type, imageUrl: "", altText: "", widthPreset: "full" };
    case "player":
      return { blockId, type, reelId: "", reelTitle: "", height: 500 };
    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}

export function updatePageBlocksEditor(page, onChange) {
  const container = document.getElementById("pageBlocksEditor");
  if (!container) return;
  container.innerHTML = "";

  page.blocks.forEach((block, i) => {
    container.appendChild(createBlockRow(block, i, page, onChange));
  });

  container.appendChild(createAddBlockRow(page, onChange));
}

function createBlockRow(block, index, page, onChange) {
  const row = document.createElement("div");
  row.className = "page-block-row";
  row.draggable = false;

  const header = document.createElement("div");
  header.className = "page-block-row-header";

  const dragHandle = createDragHandle(row);
  header.appendChild(dragHandle);

  const typeLabel = document.createElement("span");
  typeLabel.className = "page-block-type-label";
  typeLabel.innerHTML = `${ICONS[block.type] || ""}<span>${BLOCK_TYPE_LABELS[block.type] || block.type}</span>`;
  header.appendChild(typeLabel);

  const removeBtn = createRemoveButton(index, page, onChange);
  header.appendChild(removeBtn);

  row.appendChild(header);

  // Re-renders just this row's own preview/type-label (not a save trigger
  // itself - each config field's own blur/change handler calls onChange()
  // separately, since a plain field edit shouldn't always force a full
  // list re-render the way add/remove/reorder do).
  const configForm = createConfigForm(block, onChange, () => {
    updatePageBlocksEditor(page, onChange);
  });
  row.appendChild(configForm);

  const preview = document.createElement("div");
  preview.className = "page-block-row-preview";
  preview.appendChild(renderBlock(block));
  row.appendChild(preview);

  setupDragAndDrop(row, index, page, onChange);

  return row;
}

function createDragHandle(row) {
  const dragHandle = document.createElement("span");
  dragHandle.className = "page-block-drag-handle";
  dragHandle.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
    </svg>
  `;
  dragHandle.style.cursor = "grab";

  // Only enable dragging when the handle itself is pressed, mirroring
  // tracksEditor.js's createDragHandle() - otherwise dragging would fire
  // from any click inside the row's config form fields.
  dragHandle.addEventListener("mousedown", () => { row.draggable = true; });
  dragHandle.addEventListener("mouseup", () => { row.draggable = false; });
  dragHandle.addEventListener("mouseleave", () => { row.draggable = false; });

  return dragHandle;
}

function createRemoveButton(index, page, onChange) {
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "page-block-remove-btn";
  removeBtn.setAttribute("aria-label", "Remove block");
  removeBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  `;

  // Unlike tracksEditor.js's remove button, no "must have >=1" guard - a
  // page is allowed to have zero blocks (a reel needs >=1 track to play
  // anything; an empty page is just an empty page).
  removeBtn.onclick = () => {
    page.blocks.splice(index, 1);
    updatePageBlocksEditor(page, onChange);
    onChange();
  };

  return removeBtn;
}

function setupDragAndDrop(row, index, page, onChange) {
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

    const container = document.getElementById("pageBlocksEditor");
    Array.from(container.querySelectorAll(".drop-indicator")).forEach((el) => el.remove());

    const indicator = document.createElement("div");
    indicator.className = "drop-indicator";

    if (index === page.blocks.length - 1) {
      row.parentNode.insertBefore(indicator, row.nextSibling);
    } else {
      row.parentNode.insertBefore(indicator, row);
    }
  });

  row.addEventListener("dragleave", () => {
    const container = document.getElementById("pageBlocksEditor");
    Array.from(container.querySelectorAll(".drop-indicator")).forEach((el) => el.remove());
  });

  row.addEventListener("drop", (e) => {
    e.preventDefault();

    const container = document.getElementById("pageBlocksEditor");
    Array.from(container.querySelectorAll(".drop-indicator")).forEach((el) => el.remove());

    const fromIndex = +e.dataTransfer.getData("text/plain");
    const toIndex = index;

    if (fromIndex !== toIndex) {
      const [moved] = page.blocks.splice(fromIndex, 1);
      page.blocks.splice(toIndex, 0, moved);
      updatePageBlocksEditor(page, onChange);
      onChange();
    }
  });
}

// ---- Per-block-type config forms ----
// Each returns a container element wired to mutate `block` in place.
// `refreshPreview` re-renders just this row's own preview + type label (no
// full list re-render needed for plain field edits - only reorder/add/
// remove touch the DOM structure via updatePageBlocksEditor()).

function createConfigForm(block, onChange, refreshPreview) {
  const form = document.createElement("div");
  form.className = "page-block-config";

  switch (block.type) {
    case "banner-image":
      form.appendChild(createBannerImageConfig(block, onChange, refreshPreview));
      break;
    case "text":
      form.appendChild(createTextConfig(block, onChange, refreshPreview));
      break;
    case "image":
      form.appendChild(createImageConfig(block, onChange, refreshPreview));
      break;
    case "player":
      form.appendChild(createPlayerConfig(block, onChange, refreshPreview));
      break;
    default:
      form.textContent = `Unknown block type: ${block.type}`;
  }

  return form;
}

function createBannerImageConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const { row: urlRow, input: urlInput } = createUrlInputRow({
    id: `${block.blockId}-imageUrl`,
    label: "Image:",
    value: block.imageUrl,
    placeholder: "Paste an image URL or select from Media Library",
    pickerOptions: {
      directory: "assets/images/page-banners",
      extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      title: "Select Banner Image",
    },
  });
  urlInput.addEventListener("input", () => {
    block.imageUrl = urlInput.value;
  });
  urlInput.addEventListener("blur", () => {
    refreshPreview();
    onChange();
  });
  wrap.appendChild(urlRow);

  const captionRow = document.createElement("div");
  captionRow.className = "color-row";
  const captionLabel = document.createElement("span");
  captionLabel.textContent = "Caption:";
  const captionInput = document.createElement("input");
  captionInput.type = "text";
  captionInput.value = block.caption || "";
  captionInput.style.cssText = "flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";
  captionInput.oninput = () => { block.caption = captionInput.value; };
  captionInput.onblur = () => { refreshPreview(); onChange(); };
  captionRow.append(captionLabel, captionInput);
  wrap.appendChild(captionRow);

  // A cap, not an exact size - the image is never cropped (see
  // pageBlockRenderer.js), so this only ever shrinks unusually tall
  // (portrait) images down to a reasonable size; wide/landscape images
  // routinely render well under this without it doing anything visible.
  const { row: maxHeightRow, input: maxHeightInput } = createValueControl({
    id: `${block.blockId}-maxHeight`,
    label: "Max Height (px):",
    value: block.maxHeight ?? 600,
    min: 100,
    max: 1600,
    step: 10,
    unit: "px",
  });
  maxHeightInput.addEventListener("input", () => {
    const val = parseInt(maxHeightInput.value, 10);
    if (!isNaN(val)) block.maxHeight = val;
  });
  maxHeightInput.addEventListener("change", () => {
    refreshPreview();
    onChange();
  });
  wrap.appendChild(maxHeightRow);

  return wrap;
}

function createTextConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const headingRow = document.createElement("div");
  headingRow.className = "color-row";
  const headingLabel = document.createElement("span");
  headingLabel.textContent = "Heading:";
  const headingInput = document.createElement("input");
  headingInput.type = "text";
  headingInput.value = block.heading || "";
  headingInput.style.cssText = "flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";
  headingInput.oninput = () => { block.heading = headingInput.value; };
  headingInput.onblur = () => { refreshPreview(); onChange(); };
  headingRow.append(headingLabel, headingInput);
  wrap.appendChild(headingRow);

  const bodyLabel = document.createElement("label");
  bodyLabel.style.cssText = "display:block;margin:0.5rem 0 0.2rem;";
  bodyLabel.textContent = "Body:";
  wrap.appendChild(bodyLabel);

  const bodyTextarea = document.createElement("textarea");
  bodyTextarea.value = block.body || "";
  bodyTextarea.rows = 4;
  bodyTextarea.style.cssText = "width:100%;box-sizing:border-box;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;font-family:inherit;resize:vertical;";
  bodyTextarea.oninput = () => { block.body = bodyTextarea.value; };
  bodyTextarea.onblur = () => { refreshPreview(); onChange(); };
  wrap.appendChild(bodyTextarea);

  const alignRow = document.createElement("div");
  alignRow.className = "color-row";
  alignRow.style.marginTop = "0.5rem";
  const alignLabel = document.createElement("span");
  alignLabel.textContent = "Align:";
  const alignSelect = document.createElement("select");
  ["left", "center"].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v[0].toUpperCase() + v.slice(1);
    if ((block.alignment || "left") === v) opt.selected = true;
    alignSelect.appendChild(opt);
  });
  alignSelect.onchange = () => {
    block.alignment = alignSelect.value;
    refreshPreview();
    onChange();
  };
  alignRow.append(alignLabel, alignSelect);
  wrap.appendChild(alignRow);

  return wrap;
}

function createImageConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const { row: urlRow, input: urlInput } = createUrlInputRow({
    id: `${block.blockId}-imageUrl`,
    label: "Image:",
    value: block.imageUrl,
    placeholder: "Paste an image URL or select from Media Library",
    pickerOptions: {
      directory: "assets/images/page-blocks",
      extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      title: "Select Image",
    },
  });
  urlInput.addEventListener("input", () => {
    block.imageUrl = urlInput.value;
  });
  urlInput.addEventListener("blur", () => {
    refreshPreview();
    onChange();
  });
  wrap.appendChild(urlRow);

  const widthRow = document.createElement("div");
  widthRow.className = "color-row";
  const widthLabel = document.createElement("span");
  widthLabel.textContent = "Width:";
  const widthSelect = document.createElement("select");
  ["full", "medium", "small"].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v[0].toUpperCase() + v.slice(1);
    if ((block.widthPreset || "full") === v) opt.selected = true;
    widthSelect.appendChild(opt);
  });
  widthSelect.onchange = () => {
    block.widthPreset = widthSelect.value;
    refreshPreview();
    onChange();
  };
  widthRow.append(widthLabel, widthSelect);
  wrap.appendChild(widthRow);

  return wrap;
}

function createPlayerConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const pickRow = document.createElement("div");
  pickRow.className = "color-row";

  const label = document.createElement("span");
  label.textContent = "Reel:";
  pickRow.appendChild(label);

  const selectedLabel = document.createElement("span");
  selectedLabel.className = "page-block-selected-reel";
  selectedLabel.style.flex = "1";
  selectedLabel.textContent = block.reelId
    ? (block.reelTitle || block.reelId)
    : "No reel selected";
  pickRow.appendChild(selectedLabel);

  const pickBtn = document.createElement("button");
  pickBtn.type = "button";
  pickBtn.className = "page-block-add-btn";
  pickBtn.textContent = block.reelId ? "Change" : "Select Reel";
  pickBtn.onclick = () => {
    openReelPicker({
      onSelect: (reelId, reelTitle) => {
        block.reelId = reelId;
        block.reelTitle = reelTitle;
        selectedLabel.textContent = reelTitle || reelId;
        pickBtn.textContent = "Change";
        refreshPreview();
        onChange();
      },
    });
  };
  pickRow.appendChild(pickBtn);

  wrap.appendChild(pickRow);

  const heightRow = document.createElement("div");
  heightRow.className = "color-row";
  const heightLabel = document.createElement("span");
  heightLabel.textContent = "Height (px):";
  const heightInput = document.createElement("input");
  heightInput.type = "number";
  heightInput.min = "100";
  heightInput.max = "2000";
  heightInput.value = block.height || 500;
  heightInput.style.cssText = "width:6rem;padding:0.4rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";
  heightInput.oninput = () => {
    const val = parseInt(heightInput.value, 10);
    block.height = Number.isFinite(val) ? val : 500;
  };
  heightInput.onblur = () => {
    refreshPreview();
    onChange();
  };
  heightRow.append(heightLabel, heightInput);
  wrap.appendChild(heightRow);

  return wrap;
}

// A single trigger button opening a context menu of block types (icon +
// label per type, via js/modules/contextMenu.js), rather than one button
// per type - scales to more block types later without the row growing
// wider indefinitely.
function createAddBlockRow(page, onChange) {
  const addRow = document.createElement("div");
  addRow.className = "page-block-add-row";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-block-add-btn";
  btn.innerHTML = `${ICONS.plus}<span>Add Block</span>`;
  btn.onclick = () => {
    openContextMenu(btn, Object.entries(BLOCK_TYPE_LABELS).map(([type, typeLabel]) => ({
      label: typeLabel,
      icon: ICONS[type],
      onClick: () => {
        page.blocks.push(createEmptyBlock(type));
        updatePageBlocksEditor(page, onChange);
        onChange();
      },
    })));
  };
  addRow.appendChild(btn);

  return addRow;
}
