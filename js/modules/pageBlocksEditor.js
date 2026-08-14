// pageBlocksEditor.js - Add/remove/reorder UI for a page's blocks, the Pages
// counterpart of js/modules/tracksEditor.js. Drag-and-drop is structurally
// copied from there (same drag-handle-toggles-draggable-on-mousedown
// pattern, same dragstart/dragover/dragleave/drop sequence) rather than a
// generic shared abstraction - the two lists differ enough per-row (type-
// specific config forms here vs. fixed title/url fields there) that forcing
// a shared component would add more indirection than it'd save.
import { createUrlInputRow } from "./domUtils.js";
import { createValueControl, buildValueControl } from "./valueControl.js";
import { renderBlock, parseVideoEmbedUrl } from "./pageBlockRenderer.js";
import { openReelPicker } from "./reelPicker.js";
import { openContextMenu } from "./contextMenu.js";
import { dialog } from "./dialogSystem.js";
import { loadBlockPresets, addBlockPreset, deleteBlockPreset } from "./pageBlockPresets.js";
import { ROLES, ROLE_LABELS, TEXT_FONT_OPTIONS, applyTextStyles, ensureInlineGoogleFont } from "./pageTextStyles.js";
import { sanitizeHtml, normalizeFontFamily } from "./htmlSanitizer.js";

const BLOCK_TYPE_LABELS = {
  "banner-image": "Banner Image",
  text: "Text",
  image: "Image",
  player: "Player",
  "embedded-video": "Embedded Video",
};

// Same Pickr library the reel builder's own color controls use (see
// js/modules/colorPicker.js) - two separate instance arrays here rather
// than reusing that module's, since these swatches are for page
// text-block content colors, not reel appearance CSS variables, and
// colorPicker.js's helper is hardcoded to a fixed set of reel-only fields.
// Split in two because the two call sites rebuild on different lifecycles:
// toolbarPickrInstances alongside the rest of a text block's toolbar
// (destroyed whenever updatePageBlocksEditor() rebuilds the whole editor),
// dialogPickrInstances alongside the Customize Styles dialog's rows
// (destroyed whenever that dialog is opened or closed) - destroying one
// array must never tear down a Pickr button still live in the other spot.
let toolbarPickrInstances = [];
let dialogPickrInstances = [];
function destroyToolbarPickrInstances() {
  toolbarPickrInstances.forEach((p) => p.destroy());
  toolbarPickrInstances = [];
}
function destroyDialogPickrInstances() {
  dialogPickrInstances.forEach((p) => p.destroy());
  dialogPickrInstances = [];
}
const TEXT_COLOR_SWATCHES = ["#ffffff", "#000000", "#4a90e2", "#dc3545", "#219e36", "#f4cd2a"];

// Renders as the same small square .pickr-button used throughout the reel
// builder (css/builder.css), opening the same nano-themed Pickr popup -
// instead of a plain native <input type="color">. Pickr needs the button
// actually attached to the DOM to position/measure its popup, so creation
// is deferred a tick (same setTimeout(...,0) "DOM readiness" pattern
// colorPicker.js uses), after the caller has synchronously appended the
// returned .btn to the document.
function createColorPickrButton(initialColor, onApply, instanceList) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pickr-button";
  let pickrRef = null;
  setTimeout(() => {
    const pickr = Pickr.create({
      el: btn,
      theme: "nano",
      default: initialColor || "#ffffff",
      swatches: TEXT_COLOR_SWATCHES,
      // No opacity component - text color has no use for alpha here, and
      // htmlSanitizer.js's COLOR_RE only accepts a plain 6-digit #rrggbb/
      // rgb(), not an alpha channel, so keeping this off means the value
      // this button ever hands to onApply is always something the
      // sanitizer will actually keep.
      components: {
        preview: true,
        opacity: false,
        hue: true,
        interaction: { hex: true, input: true, save: true },
      },
    });
    pickrRef = pickr;
    instanceList.push(pickr);
    // Built from the raw RGB channels rather than color.toHEXA().toString()
    // - Pickr's own HEXA stringification includes an alpha suffix (e.g.
    // "#dc3545ff") that htmlSanitizer.js's 6-digit COLOR_RE rejects
    // outright, which silently dropped every applied color until this was
    // switched to always emit exactly #rrggbb.
    const toSanitizableHex = (color) => {
      const [r, g, b] = color.toRGBA();
      return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    };
    pickr.on("init", () => {
      btn.style.background = toSanitizableHex(pickr.getColor());
    });
    pickr.on("change", (color) => {
      btn.style.background = toSanitizableHex(color);
    });
    pickr.on("save", (color) => {
      const hex = toSanitizableHex(color);
      btn.style.background = hex;
      onApply(hex);
      pickr.hide();
    });
  }, 0);
  return {
    btn,
    reset(hex) {
      if (pickrRef) pickrRef.setColor(hex);
    },
  };
}

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
  "embedded-video": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 6.6V17.4C21 17.9523 20.5523 18.4 20 18.4H4C3.44772 18.4 3 17.9523 3 17.4V6.6C3 6.04772 3.44772 5.6 4 5.6H20C20.5523 5.6 21 6.04772 21 6.6Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9.2L14.5 12L10 14.8V9.2Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bookmark: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4.5C6 3.67157 6.67157 3 7.5 3H16.5C17.3284 3 18 3.67157 18 4.5V21L12 17L6 21V4.5Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// Session-only collapsed state, keyed by blockId - not part of the saved
// page data, and needs to survive updatePageBlocksEditor() rebuilding the
// row DOM from scratch on every add/remove/reorder.
const collapsedBlockIds = new Set();

function createEmptyBlock(type) {
  const blockId = "block-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  switch (type) {
    case "banner-image":
      return { blockId, type, imageUrl: "", altText: "", caption: "", maxHeight: 600 };
    case "text":
      // bodyHtml (contenteditable WYSIWYG editor) is the live format now -
      // heading/body were the pre-WYSIWYG Markdown fields, kept readable
      // by pageBlockRenderer.js/pageBlocksEditor.js only for pages saved
      // before this feature, never written by a brand new block.
      return { blockId, type, bodyHtml: "", alignment: "left" };
    case "image":
      return { blockId, type, imageUrl: "", altText: "", widthPreset: "full" };
    case "player":
      return { blockId, type, reelId: "", reelTitle: "", height: 500 };
    case "embedded-video":
      return { blockId, type, videoUrl: "", aspectRatio: "16:9" };
    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}

export function updatePageBlocksEditor(page, onChange) {
  const container = document.getElementById("pageBlocksEditor");
  if (!container) return;
  destroyToolbarPickrInstances();
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

  const collapseBtn = createCollapseButton(block, row);
  header.appendChild(collapseBtn);

  const typeLabel = document.createElement("span");
  typeLabel.className = "page-block-type-label";
  typeLabel.innerHTML = `${ICONS[block.type] || ""}<span>${BLOCK_TYPE_LABELS[block.type] || block.type}</span>`;
  header.appendChild(typeLabel);

  const savePresetBtn = createSavePresetButton(block);
  header.appendChild(savePresetBtn);

  const removeBtn = createRemoveButton(index, page, onChange);
  header.appendChild(removeBtn);

  row.appendChild(header);

  // Re-renders just this row's own preview/type-label (not a save trigger
  // itself - each config field's own blur/change handler calls onChange()
  // separately, since a plain field edit shouldn't always force a full
  // list re-render the way add/remove/reorder do).
  const configForm = createConfigForm(block, page, onChange, () => {
    updatePageBlocksEditor(page, onChange);
  });
  row.appendChild(configForm);

  // Text blocks skip this - their contenteditable editor (createTextConfig())
  // shows the styled result directly, so a second, separate rendered
  // preview underneath would just be a redundant duplicate view. Every
  // other block type still gets one (banner image, image, player,
  // embedded video - none of those have an in-place styled editing view).
  if (block.type !== "text") {
    const preview = document.createElement("div");
    preview.className = "page-block-row-preview";
    preview.appendChild(renderBlock(block));
    row.appendChild(preview);
  }

  if (collapsedBlockIds.has(block.blockId)) {
    row.classList.add("page-block-row-collapsed");
  }

  setupDragAndDrop(row, index, page, onChange);

  return row;
}

function createCollapseButton(block, row) {
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "page-block-collapse-btn";
  collapseBtn.setAttribute("aria-label", "Collapse block");
  collapseBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  `;
  collapseBtn.onclick = () => {
    const collapsed = row.classList.toggle("page-block-row-collapsed");
    if (collapsed) {
      collapsedBlockIds.add(block.blockId);
    } else {
      collapsedBlockIds.delete(block.blockId);
    }
  };
  return collapseBtn;
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

function createSavePresetButton(block) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-block-preset-btn";
  btn.setAttribute("aria-label", "Save as preset");
  btn.title = "Save as preset";
  btn.innerHTML = ICONS.bookmark;
  btn.onclick = async () => {
    const typeLabel = BLOCK_TYPE_LABELS[block.type] || block.type;
    const name = await dialog.prompt(`Save this ${typeLabel} block as a preset:`);
    if (!name) return;
    // Everything except blockId/type - a preset seeds a fresh block (new
    // blockId, same type) later, it never stores identity.
    const { blockId, type, ...config } = block;
    addBlockPreset(name, type, config);
  };
  return btn;
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

function createConfigForm(block, page, onChange, refreshPreview) {
  const form = document.createElement("div");
  form.className = "page-block-config";

  switch (block.type) {
    case "banner-image":
      form.appendChild(createBannerImageConfig(block, onChange, refreshPreview));
      break;
    case "text":
      form.appendChild(createTextConfig(block, page, onChange, refreshPreview));
      break;
    case "image":
      form.appendChild(createImageConfig(block, onChange, refreshPreview));
      break;
    case "player":
      form.appendChild(createPlayerConfig(block, onChange, refreshPreview));
      break;
    case "embedded-video":
      form.appendChild(createEmbeddedVideoConfig(block, onChange, refreshPreview));
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

// A true contenteditable WYSIWYG field, not a raw-markdown textarea - bold/
// italic/underline/headings render live as you type/select, no visible
// markup and no separate preview needed (createBlockRow() skips the usual
// row preview for text blocks specifically, since this field doubles as
// it). Content is serialized to sanitized HTML (block.bodyHtml) on blur,
// not markdown - see js/modules/htmlSanitizer.js and
// pageBlockRenderer.js's renderText() for the render-time half. A block
// saved before this feature (legacy block.heading/block.body, Markdown)
// is rendered once via the existing renderBlock() to seed this field's
// initial content, then converts to bodyHtml the first time it's actually
// edited - no forced bulk migration.
function createTextConfig(block, page, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  // Single consolidated toolbar above the field (style menu, B/I/U, align
  // - grouped and divided like a conventional rich-text toolbar, e.g.
  // Google Docs'). Declared before `editable` (referenced inside these
  // closures) since none of them actually run until later, by which point
  // it's assigned - same reasoning as every other field in this file.
  const toolbarRow = document.createElement("div");
  toolbarRow.className = "page-block-text-toolbar";

  // A menu button, not a <select> - a <select> unavoidably moves focus off
  // the editable field the moment it's clicked, which loses its selection
  // before the style can be applied to it. Both this button's own
  // mousedown and each menu item's (via openContextMenu's
  // preventFocusSteal option) preventDefault the focus change, so the
  // field - and its selection - never loses focus at all while picking a
  // style, the same mechanism document.execCommand()-based toolbars
  // always rely on.
  const styleBtn = createDropdownMenuButton("Apply style...");
  styleBtn.addEventListener("mousedown", (e) => e.preventDefault());
  styleBtn.onclick = () => {
    // Block-level styles only (headings + plain body) - Bold/Italic/
    // Underline get their own always-visible toggle buttons, the classic
    // B/I/U toolbar convention, instead of living in this menu.
    openContextMenu(styleBtn, BLOCK_STYLE_ROLES.map((role) => ({
      label: ROLE_LABELS[role],
      onClick: () => {
        editable.focus();
        document.execCommand("formatBlock", false, FORMAT_BLOCK_TAGS[role]);
        commit();
        updateInlineControlDisplays();
      },
    })), { preventFocusSteal: true });
  };
  toolbarRow.appendChild(styleBtn);
  toolbarRow.appendChild(createToolbarDivider());

  // Real toggles: each button's pressed state reflects
  // document.queryCommandState() for the current selection - the browser's
  // own accurate, native answer to "is this bold/italic/underlined,"
  // unlike the old textarea implementation's from-scratch marker-position
  // matching (that only existed because a plain textarea has no native
  // concept of "is this bold"; contenteditable does).
  const formatGroup = document.createElement("span");
  formatGroup.className = "icon-toggle-group";
  const formatButtons = {};
  [["bold", "format_bold", "Bold"], ["italic", "format_italic", "Italic"], ["underline", "format_underlined", "Underline"]].forEach(([command, glyph, title]) => {
    const btn = document.createElement("span");
    btn.className = "format-icon";
    btn.title = title;
    btn.innerHTML = `<span class="material-symbols-outlined">${glyph}</span>`;
    // Same focus-preserving mousedown trick as the style menu above.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.onclick = () => {
      editable.focus();
      document.execCommand(command);
      updateFormatButtonStates();
      commit();
    };
    formatButtons[command] = btn;
    formatGroup.appendChild(btn);
  });
  toolbarRow.appendChild(formatGroup);
  toolbarRow.appendChild(createToolbarDivider());

  function updateFormatButtonStates() {
    formatButtons.bold.classList.toggle("active", document.queryCommandState("bold"));
    formatButtons.italic.classList.toggle("active", document.queryCommandState("italic"));
    formatButtons.underline.classList.toggle("active", document.queryCommandState("underline"));
  }

  // Ad hoc font/size/color, applied via a real <span style="..."> (see
  // applyInlineStyle() below), not execCommand - execCommand's foreColor/
  // fontName/fontSize output is both inconsistent across browsers and (for
  // fontSize) stuck on the legacy 1-7 HTML size scale rather than real px,
  // so this codebase generates the markup itself for predictable,
  // consistently-sanitizable output. Unlike B/I/U/headings above, the
  // size and color controls are real <input>s that need actual focus to
  // work - clicking into either necessarily loses the editable's live
  // selection, the same problem preventFocusSteal solves for buttons/menus
  // but can't for text entry. savedRange (continuously updated from
  // mouseup/keyup/click on the editable, see below) is the workaround:
  // operating on a cloned Range's own DOM node references works
  // regardless of what currently has focus or what document.getSelection()
  // currently holds.
  let savedRange = null;
  function saveSelection() {
    const sel = window.getSelection();
    // Collapsed (just a caret, nothing highlighted) is saved too, not only
    // an actual selection - applyInlineStyle() below needs it either way:
    // a real editor's font/size/color controls don't just restyle already-
    // typed text, they also set what you're about to type next when
    // nothing's selected, the same as toggling Bold with an empty
    // selection already does natively via execCommand.
    if (sel.rangeCount && editable.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  // Range.extractContents() clones/splits whatever span(s) sit at the
  // range's exact start/end boundaries to preserve DOM structure, even
  // when that leaves an empty shell behind on one side (e.g. a range that
  // starts precisely at a span's first character splits that span into an
  // empty "before" clone plus the real content) - harmless once rendered
  // (invisible, no text), but needless clutter in what's actually stored.
  // Run after every applyInlineStyle()/applyFontSizeStep() DOM edit.
  function removeEmptySpans() {
    editable.querySelectorAll("span").forEach((s) => {
      if (!s.textContent) s.remove();
    });
  }

  // The nearest SPAN ancestor of `range` (walking up from its
  // commonAncestorContainer - the one node guaranteed to contain the whole
  // range, not just one end of it) that already carries an explicit value
  // for `prop`. Used both to display the current selection's style back
  // into the toolbar (updateInlineControlDisplays()) and to decide, in
  // applyInlineStyle() below, whether a new style application should
  // mutate that span in place rather than nest another one inside it.
  function findWrappingSpan(range, prop) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editable) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN" && node.style[prop]) return node;
      node = node.parentNode;
    }
    return null;
  }

  // A zero-width space, not a truly empty span - an empty inline element
  // has nowhere for a caret to actually land in most browsers, so there'd
  // be nothing to anchor "start typing here" to. commit() below strips
  // this back out on save if the block is committed with it still
  // unused (nothing was ever typed into it), so picking a size/font/color
  // with nothing selected and then clicking away doesn't leave permanent
  // invisible debris.
  const CARET_PLACEHOLDER = "​";

  // The range a font/size/color control should act on - the live
  // selection if the editable currently owns one, else the last one
  // saved before focus was stolen (Size's input, Color's Pickr popup).
  // If neither exists - the editable has never actually been focused or
  // clicked at all yet this session - falls back to a caret at the end of
  // its content instead of leaving nothing to act on at all: a real
  // editor's toolbar acts on "wherever you'd type next" rather than
  // silently no-opping just because nothing's been selected yet.
  function getWorkingRange() {
    const sel = window.getSelection();
    const liveRange = sel.rangeCount && editable.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    if (liveRange) return liveRange;
    if (savedRange) return savedRange;
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    return range;
  }

  // Font/size/color all funnel through here. Font's and Style's own menus
  // never steal the editable's live selection (preventFocusSteal), so the
  // *live* selection is preferred when it's still usable; Size (a real
  // focusable input) and Color (a Pickr popup) do steal it, so savedRange
  // is the fallback for those.
  //
  // Two cases, mirroring how a real editor's format controls behave:
  // - An actual (non-collapsed) selection, possibly spanning text that
  //   already has several different values for this property (e.g. two
  //   different font sizes) - the whole selection is extracted, any
  //   descendant's own value for this exact property is stripped (inline
  //   style on a descendant always wins over an ancestor's for the same
  //   property, so leaving it would silently shadow the new one), and the
  //   cleaned content is wrapped in one fresh span carrying the new value -
  //   applying one value uniformly regardless of what was there before.
  //   Font-size's own relative +/- stepping (applyFontSizeStep() below)
  //   needs the opposite behavior - each differently-sized run stepping
  //   from *its own* current size rather than collapsing to one shared
  //   value - so it doesn't call this at all for a real selection, only
  //   for its collapsed-caret fallback.
  // - Just a caret, nothing selected: sets the format for whatever gets
  //   typed *next*, the same as toggling Bold with an empty selection
  //   already does natively via execCommand - contenteditable has no
  //   built-in equivalent for arbitrary inline styles, so this reuses (or
  //   creates) a caret-sized span at that position and leaves the cursor
  //   inside it.
  function applyInlineStyle(prop, value) {
    const sel = window.getSelection();
    const range = getWorkingRange();

    if (!range.collapsed) {
      const fragment = range.extractContents();
      fragment.querySelectorAll("span").forEach((el) => {
        if (el.style[prop]) el.style[prop] = "";
      });
      const span = document.createElement("span");
      span.style[prop] = value;
      span.appendChild(fragment);
      range.insertNode(span);
      removeEmptySpans();
      // Reselects the new span itself (start-before/end-after it), not
      // selectNodeContents(span) (just its children) - the latter looks
      // equivalent (same highlighted text) but means any later
      // extractContents()/cloneContents() over this exact selection - a
      // second format applied without reselecting, or just re-reading it
      // for display - only ever sees span's *children* as top-level
      // fragment nodes, never span itself. That silently drops the very
      // property that was just set: nothing in the resulting fragment
      // still carries it, since it lived on the now-excluded container.
      const newRange = document.createRange();
      newRange.setStartBefore(span);
      newRange.setEndAfter(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRange = newRange.cloneRange();
    } else {
      const existing = findWrappingSpan(range, prop);
      // Only reused if it's still just the placeholder - i.e. it was
      // created for this exact "nothing selected" gesture a moment ago and
      // nothing's been typed into it yet (e.g. picking a second format
      // before typing anything). If the caret instead just happens to be
      // resting inside a span with *real* already-typed content - no
      // selection, just the cursor parked there - that's not something the
      // user selected to change, so it's left alone and a fresh, separate
      // placeholder is inserted (splitting the existing span at that
      // point) instead of silently resizing/restyling text they never
      // highlighted.
      const isReusablePlaceholder = existing && existing.textContent === CARET_PLACEHOLDER;
      if (isReusablePlaceholder) {
        existing.style[prop] = value;
      } else {
        const span = document.createElement("span");
        span.style[prop] = value;
        span.appendChild(document.createTextNode(CARET_PLACEHOLDER));
        range.insertNode(span);
        const newRange = document.createRange();
        newRange.setStart(span.firstChild, span.firstChild.length);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRange = newRange.cloneRange();
      }
    }
    commit();
  }

  // Current block-level tag at the selection (H1/H2/H3/P), walking up from
  // anchorNode the same way findAncestorLink() does below - used to show
  // the active paragraph style in styleBtn, mirroring how a selection's
  // actual bold/italic/underline state already drives formatButtons.
  const BLOCK_TAG_ROLES = { H1: "h1", H2: "h2", H3: "h3", P: "body" };
  function currentBlockRole() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editable.contains(sel.anchorNode)) return null;
    let node = sel.anchorNode;
    while (node && node !== editable) {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAG_ROLES[node.tagName]) return BLOCK_TAG_ROLES[node.tagName];
      node = node.parentNode;
    }
    return null;
  }

  // Shared "the selection doesn't agree on one value" result for the
  // selectionFontFamily()/selectionBlockRole() scans below - same idea as
  // selectionFontSizePx()'s null return, kept as a distinct sentinel here
  // (rather than reusing null) since these two also need null to mean a
  // real, agreed-on "no override" state (plain Font.../"Body" - default,
  // not mixed).
  const MIXED = Symbol("mixed");

  // Shared scan behind selectionFontFamily()/selectionFontSizePx() below -
  // MIXED if `getValue` disagrees across any two runs in the range, else
  // whatever value they all agreed on (including null, a real "no
  // override" agreement, distinct from MIXED).
  //
  // Walks *live* text nodes still attached to `editable` (filtered to ones
  // the range actually intersects), not range.cloneContents() - a clone
  // only contains the range's own contents, so a selection shaped like
  // "all of span X's children" (exactly what happens right after
  // applyInlineStyle() wraps a fresh span and reselects it - or just as
  // easily from an ordinary mouse drag that happens to land on a span's
  // boundary) clones X's *children* as top-level fragment nodes without
  // ever cloning X itself. Any property that lives on X - the one this
  // whole selection was just wrapped in - is then invisible to a walk that
  // stops at the fragment boundary. Walking the real DOM instead means
  // every ancestor, including X, is still there to find.
  function selectionRunValue(range, getValue) {
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    let result;
    let has = false;
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent) continue;
      const value = getValue(node);
      if (!has) { result = value; has = true; }
      else if (result !== value) return MIXED;
    }
    return has ? result : null;
  }

  // Font's counterpart to selectionFontSizePx() - `baseFamily` (a run's
  // actual rendered font when nothing overrides it, see
  // baseFontFamilyForRange() below) if every run in the selection agrees
  // there's no explicit font-family override, a normalized stack string if
  // they all agree on the same explicit one, MIXED if they don't all agree.
  function selectionFontFamily(range, baseFamily) {
    return selectionRunValue(range, (textNode) => {
      let el = textNode.parentElement;
      while (el && el !== editable) {
        if (el.tagName === "SPAN" && el.style.fontFamily) return normalizeFontFamily(el.style.fontFamily);
        el = el.parentElement;
      }
      return baseFamily;
    });
  }

  // Style's counterpart - null if the selection isn't inside a recognized
  // block at all, a role string if every block-level element the selection
  // actually touches agrees (via Range.intersectsNode(), not just every
  // block that happens to be a sibling under the common ancestor), MIXED if
  // it spans more than one kind (e.g. the end of a heading through the
  // start of the paragraph after it).
  function selectionBlockRole(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (BLOCK_TAG_ROLES[node.tagName]) return BLOCK_TAG_ROLES[node.tagName];
    const blocks = Array.from(node.children || []).filter((el) => BLOCK_TAG_ROLES[el.tagName] && range.intersectsNode(el));
    if (!blocks.length) return null;
    const roles = new Set(blocks.map((el) => BLOCK_TAG_ROLES[el.tagName]));
    return roles.size === 1 ? [...roles][0] : MIXED;
  }

  // The size to show/step from when nothing at the selection has an
  // explicit inline override yet - the selection's own computed size
  // (which already reflects the page's per-role Customize Styles
  // defaults), not a hardcoded fallback, so the field always starts from
  // what the text actually looks like right now.
  function effectiveFontSizePx() {
    const sel = window.getSelection();
    const node = sel.rangeCount && editable.contains(sel.anchorNode) ? sel.anchorNode : null;
    const el = node ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) : editable;
    return Math.round(parseFloat(getComputedStyle(el || editable).fontSize)) || 16;
  }

  // Font's counterpart to effectiveFontSizePx() - the caret's actual
  // rendered font (normalized) when nothing explicitly overrides it, so
  // the toolbar can show a real font name instead of always falling back
  // to "Font..." just because there's no inline override span. In
  // practice this is almost always one of TEXT_FONT_OPTIONS' own stacks
  // already - page.css's base font-family and every per-role Customize
  // Styles override both come from that exact same list - so it reliably
  // resolves to a real label rather than silently landing on "Font..."
  // anyway.
  function effectiveFontFamily() {
    const sel = window.getSelection();
    const node = sel.rangeCount && editable.contains(sel.anchorNode) ? sel.anchorNode : null;
    const el = node ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) : editable;
    return normalizeFontFamily(getComputedStyle(el || editable).fontFamily);
  }

  // The base size for a *range's* bare/unstyled runs specifically -
  // applyFontSizeStep()'s multi-run branch needs this, and effectiveFontSizePx()
  // above is the wrong tool for it: that reads from wherever the live
  // selection's anchor happens to sit, which is frequently *inside* an
  // already-styled span (e.g. a selection that starts on already-resized
  // text and extends into plain text after it) - silently leaking that
  // span's size into every bare run's "base" instead of the block's real
  // inherited default, converging previously-distinct sizes toward each
  // other a little more on every click. This instead walks up from the
  // range's own commonAncestorContainer (guaranteed to contain the whole
  // range) to the nearest *block-level* ancestor - skipping over any span,
  // rather than potentially landing inside one - so it reads the role's
  // own font-size regardless of what the selection's anchor point
  // happens to be sitting on.
  function baseFontSizePxForRange(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editable && !["P", "H1", "H2", "H3"].includes(node.tagName)) {
      node = node.parentNode;
    }
    const el = node && node !== editable ? node : editable;
    return Math.round(parseFloat(getComputedStyle(el).fontSize)) || 16;
  }

  // Font's counterpart to baseFontSizePxForRange() - same reasoning, same
  // block-level-ancestor walk (skipping over any span so a selection that
  // starts inside one doesn't leak its font into the "no override"
  // baseline for the rest of the selection).
  function baseFontFamilyForRange(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editable && !["P", "H1", "H2", "H3"].includes(node.tagName)) {
      node = node.parentNode;
    }
    const el = node && node !== editable ? node : editable;
    return normalizeFontFamily(getComputedStyle(el).fontFamily);
  }

  // The size to *display* for a real (non-collapsed) selection - null if
  // it's mixed (several different sizes in it, e.g. right after
  // applyFontSizeStep() scaled differently-sized runs by differing
  // amounts), a single px number if every run in it agrees. Reads via
  // cloneContents() rather than findWrappingSpan()'s single-ancestor walk
  // - that only ever finds a size when the *whole* selection sits inside
  // one common span, so it silently fell back to the surrounding
  // <p>'s own base size (e.g. showing a stale "16" after a multi-run
  // step actually took each run to a different, correct, size) for any
  // selection spanning more than one span - not wrong, but confusing
  // enough to read as the spinner not doing anything.
  function selectionFontSizePx(range, baseSizePx) {
    const result = selectionRunValue(range, (textNode) => {
      let el = textNode.parentElement;
      while (el && el !== editable) {
        if (el.tagName === "SPAN" && el.style.fontSize) return parseInt(el.style.fontSize, 10);
        el = el.parentElement;
      }
      return baseSizePx;
    });
    return result === MIXED ? null : result;
  }

  // Reflects the current selection's actual style/font/size back into the
  // toolbar - called on every selection change (mouseup/keyup/click below)
  // and right after applying a change, the same idea as
  // updateFormatButtonStates() for B/I/U. Also runs for a bare collapsed
  // caret (not just a real selection), same as applyInlineStyle() - it
  // should show what the *next* typed character will look like too.
  function updateInlineControlDisplays() {
    const sel = window.getSelection();
    const hasRange = sel.rangeCount && editable.contains(sel.anchorNode);
    const range = hasRange ? sel.getRangeAt(0) : null;

    if (range && !range.collapsed) {
      const px = selectionFontSizePx(range, effectiveFontSizePx());
      sizeInput.value = px === null ? "" : px;
      sizeInput.placeholder = px === null ? "Mixed" : "";

      const family = selectionFontFamily(range, baseFontFamilyForRange(range));
      const fontOpt = family !== MIXED && TEXT_FONT_OPTIONS.find((f) => normalizeFontFamily(f.stack) === family);
      setDropdownLabel(fontBtn, family === MIXED ? "Mixed" : fontOpt ? fontOpt.label : "Font...");

      const role = selectionBlockRole(range);
      setDropdownLabel(styleBtn, role === MIXED ? "Mixed" : role ? ROLE_LABELS[role] : "Apply style...");
    } else {
      const sizeSpan = range && findWrappingSpan(range, "fontSize");
      sizeInput.value = sizeSpan ? parseInt(sizeSpan.style.fontSize, 10) : effectiveFontSizePx();
      sizeInput.placeholder = "";

      const fontSpan = range && findWrappingSpan(range, "fontFamily");
      // Compared with quotes stripped on both sides - see htmlSanitizer.js's
      // normalizeFontFamily() for why the browser's own fontFamily read-back
      // never matches TEXT_FONT_OPTIONS' stack strings literally. Falls back
      // to the caret's actual effective font (not just "Font...") when
      // there's no explicit override span - see effectiveFontFamily().
      const family = fontSpan ? normalizeFontFamily(fontSpan.style.fontFamily) : effectiveFontFamily();
      const fontOpt = TEXT_FONT_OPTIONS.find((f) => normalizeFontFamily(f.stack) === family);
      setDropdownLabel(fontBtn, fontOpt ? fontOpt.label : "Font...");

      const role = currentBlockRole();
      setDropdownLabel(styleBtn, role ? ROLE_LABELS[role] : "Apply style...");
    }
  }

  const fontBtn = createDropdownMenuButton("Font...");
  fontBtn.addEventListener("mousedown", (e) => e.preventDefault());
  fontBtn.onclick = () => {
    saveSelection();
    // No "nothing to act on" guard here (unlike this used to bail on a
    // collapsed savedRange) - applyInlineStyle() already handles a bare
    // caret by setting the format for whatever's typed next, the same as
    // Size's spinner does, and getWorkingRange() inside it already falls
    // back sensibly even with no prior selection at all. Blocking the menu
    // from opening in either case was the actual "Font... does nothing
    // with nothing selected" bug - the menu itself never even appeared.
    openContextMenu(fontBtn, TEXT_FONT_OPTIONS.map((f) => ({
      label: f.label,
      onClick: () => {
        ensureInlineGoogleFont(f.value);
        applyInlineStyle("fontFamily", f.stack);
        updateInlineControlDisplays();
      },
    })), { preventFocusSteal: true });
  };
  toolbarRow.appendChild(fontBtn);

  const SIZE_MIN = 8;
  const SIZE_MAX = 96;
  const SIZE_STEP = 1;
  const clampSize = (px) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, px));

  // Steps every run of text in the selection *relative to its own current
  // size*, instead of collapsing the whole selection to one shared value -
  // selecting text that already has several different sizes in it and
  // clicking +/- should scale each of them up/down from where it already
  // was, not flatten them all to one size (that's what typing an exact
  // value into the field does instead - see applyInlineStyle(), used for
  // that case since "replace whatever's there with this one value" is
  // exactly what it already does for font/color).
  //
  // Reselecting the modified range afterward mirrors applyInlineStyle():
  // extractContents() collapses the original range, so a second call (a
  // second +/- click with no reselection in between) needs a fresh live
  // range to work with, not a stale collapsed one.
  function applyFontSizeStep(delta) {
    const sel = window.getSelection();
    const range = getWorkingRange();

    if (range.collapsed) {
      const current = parseInt(sizeInput.value, 10) || effectiveFontSizePx();
      applyInlineStyle("fontSize", `${clampSize(current + delta)}px`);
      updateInlineControlDisplays();
      return;
    }

    // Read before extracting - a bare (unstyled) run's size comes from
    // page.css's per-role defaults via inheritance, which can't be
    // resolved by getComputedStyle() once its nodes are detached into a
    // fragment below. Every plain-text run in the same selection shares
    // this one base size regardless: ad hoc spans are the only thing that
    // ever gives inline text its own size in this editor, and block-level
    // roles (H1/H2/H3/Body) don't change mid-selection within one block.
    const baseSizePx = baseFontSizePxForRange(range);
    const fragment = range.extractContents();
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    const steppedSpans = new Set();
    textNodes.forEach((textNode) => {
      if (!textNode.textContent) return;
      let el = textNode.parentElement;
      let ownSpan = null;
      while (el && el !== fragment) {
        if (el.tagName === "SPAN" && el.style.fontSize) { ownSpan = el; break; }
        el = el.parentElement;
      }
      if (ownSpan) {
        // A span can hold more than one text node - only step it once
        // regardless of how many of its text nodes this walk visits.
        if (steppedSpans.has(ownSpan)) return;
        steppedSpans.add(ownSpan);
        ownSpan.style.fontSize = `${clampSize(parseInt(ownSpan.style.fontSize, 10) + delta)}px`;
      } else {
        const span = document.createElement("span");
        span.style.fontSize = `${clampSize(baseSizePx + delta)}px`;
        textNode.parentNode.insertBefore(span, textNode);
        span.appendChild(textNode);
      }
    });

    const firstChild = fragment.firstChild;
    const lastChild = fragment.lastChild;
    range.insertNode(fragment);
    if (firstChild && lastChild) {
      const newRange = document.createRange();
      newRange.setStartBefore(firstChild);
      newRange.setEndAfter(lastChild);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRange = newRange.cloneRange();
    }
    removeEmptySpans();
    commit();
    updateInlineControlDisplays();
  }

  // Segmented number+spin control (css/builder.css's .value-control-number/
  // .value-control-spin, see valueControl.js) instead of a plain
  // <input type="number"> - discrete +/- buttons for stepping the size up/
  // down, matching every other numeric control in the builder, plus the
  // field stays a real typeable input for an exact value. The slider half
  // of valueControl.js's normal hover-reveal behavior is suppressed via
  // CSS (.page-block-text-toolbar-size) - out of place in a compact
  // toolbar - but the slider element itself is still built and mounted
  // (just hidden), since buildValueControl() always includes one.
  //
  // Deliberately NOT wired with valueControl.js's own wireValueControl() -
  // that assumes a single "set to this value" operation, but this field
  // needs two different ones depending on how a value arrives: the +/-
  // buttons and arrow keys scale each run relative to its own current size
  // (applyFontSizeStep()), while typing an exact value and committing it
  // unifies the whole selection to that one value (applyInlineStyle(),
  // on blur/Enter - not per-keystroke, so an in-progress "2" while typing
  // "24" never gets applied as a real size).
  const sizeControl = buildValueControl({
    id: `${block.blockId}-toolbarFontSize`,
    label: "",
    value: 16,
    min: SIZE_MIN,
    max: SIZE_MAX,
    step: SIZE_STEP,
    unit: "px",
  });
  sizeControl.control.classList.add("page-block-text-toolbar-size");
  sizeControl.input.title = "Font size (px) for the selected text";
  const sizeInput = sizeControl.input;

  const spinUp = sizeControl.control.querySelector(".value-control-spin-up");
  const spinDown = sizeControl.control.querySelector(".value-control-spin-down");
  [[spinUp, 1], [spinDown, -1]].forEach(([btn, dir]) => {
    if (!btn) return;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // don't steal focus off the number input
      applyFontSizeStep(dir * SIZE_STEP);
    });
  });

  // Typing (not a step) marks the field dirty, so blur only commits an
  // actual edit - without this, simply clicking into the field to look at
  // it and then clicking away would silently overwrite the selection with
  // whatever number happened to be displayed.
  let sizeInputDirty = false;
  sizeInput.addEventListener("input", () => { sizeInputDirty = true; });
  sizeInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyFontSizeStep(SIZE_STEP);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyFontSizeStep(-SIZE_STEP);
    } else if (e.key === "Enter") {
      e.preventDefault();
      sizeInput.blur();
    }
  });
  sizeInput.addEventListener("blur", () => {
    if (!sizeInputDirty) return;
    sizeInputDirty = false;
    const val = parseInt(sizeInput.value, 10);
    if (isNaN(val)) return;
    applyInlineStyle("fontSize", `${clampSize(val)}px`);
    updateInlineControlDisplays();
  });
  toolbarRow.appendChild(sizeControl.control);

  const colorPickr = createColorPickrButton("#ffffff", (hex) => {
    applyInlineStyle("color", hex);
  }, toolbarPickrInstances);
  colorPickr.btn.title = "Text color for the selected text";
  toolbarRow.appendChild(colorPickr.btn);
  toolbarRow.appendChild(createToolbarDivider());

  // Link/unlink toggle - unlike the styling controls above, this doesn't
  // need savedRange for the "already a link" case, but does for creating
  // a new one, since dialog.prompt() is a modal popup that definitely
  // steals focus while the user types the URL.
  const linkBtn = document.createElement("span");
  linkBtn.className = "format-icon";
  linkBtn.title = "Link";
  linkBtn.innerHTML = `<span class="material-symbols-outlined">link</span>`;
  linkBtn.addEventListener("mousedown", (e) => e.preventDefault());
  linkBtn.onclick = async () => {
    saveSelection();
    const existingLink = savedRange && findAncestorLink(savedRange.commonAncestorContainer);
    if (existingLink) {
      const parent = existingLink.parentNode;
      while (existingLink.firstChild) parent.insertBefore(existingLink.firstChild, existingLink);
      parent.removeChild(existingLink);
      commit();
      return;
    }
    if (!savedRange || savedRange.collapsed) return;
    const range = savedRange;
    const url = await dialog.prompt("Link URL:", "https://");
    if (!url) return;
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    wrapRangeInLink(range, href);
    commit();
  };
  toolbarRow.appendChild(linkBtn);
  toolbarRow.appendChild(createToolbarDivider());

  function findAncestorLink(node) {
    while (node && node !== editable) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "A") return node;
      node = node.parentNode;
    }
    return null;
  }

  // Icon toggle, matches titleAppearance.js's Reel Title Appearance align
  // control (same .align-icon class/material-symbols-outlined icon pair),
  // so alignment reads the same way in both builders. Unrelated to
  // contenteditable/execCommand - still just block.alignment, applied as
  // text-align on the block's outer wrapper.
  const alignGroup = document.createElement("span");
  alignGroup.className = "icon-toggle-group";
  const alignIcons = {};
  [["left", "format_align_left", "Left"], ["center", "format_align_center", "Center"]].forEach(([value, glyph, title]) => {
    const icon = document.createElement("span");
    icon.className = "align-icon";
    icon.title = title;
    icon.innerHTML = `<span class="material-symbols-outlined">${glyph}</span>`;
    icon.onclick = () => {
      block.alignment = value;
      updateAlignIcons();
      editable.style.textAlign = value === "center" ? "center" : "left";
      onChange();
    };
    alignIcons[value] = icon;
    alignGroup.appendChild(icon);
  });
  toolbarRow.appendChild(alignGroup);

  function updateAlignIcons() {
    const align = block.alignment || "left";
    alignIcons.left.classList.toggle("active", align === "left");
    alignIcons.center.classList.toggle("active", align === "center");
  }
  updateAlignIcons();

  const customizeBtn = document.createElement("button");
  customizeBtn.type = "button";
  customizeBtn.className = "page-block-add-btn";
  customizeBtn.textContent = "Customize Styles...";
  customizeBtn.style.marginLeft = "auto";
  customizeBtn.onclick = () => openCustomizeStylesDialog(page, onChange, refreshPreview);
  toolbarRow.appendChild(customizeBtn);

  wrap.appendChild(toolbarRow);

  const editable = document.createElement("div");
  editable.contentEditable = "true";
  // .page-block-text reuses css/page.css's actual p/h1/h2/h3/strong/em/u
  // rules (same ones the public page renders with) so this genuinely shows
  // the final styling, not generic browser bold/italic - .page-block-
  // text-editable layers the builder-chrome-only editing-field look
  // (border/background/focus ring) on top, in css/builder.css.
  editable.className = "page-block-text page-block-text-editable";
  editable.setAttribute("data-placeholder", "Type your text here...");
  editable.style.textAlign = block.alignment === "center" ? "center" : "left";
  editable.innerHTML = initialEditableHtml(block);
  // Reflects the page's actual per-role font/size/weight/color
  // customization live inside the editor itself, not just in the preview
  // panes - genuine WYSIWYG rather than generic browser bold/italic.
  applyTextStyles(editable, page);

  // Deliberately does NOT call refreshPreview() (the row-rebuild callback
  // every other block type's config form uses) - that would tear down and
  // recreate this exact `editable` element, killing its focus/selection on
  // every single toolbar click. There's nothing left for a rebuild to
  // refresh here anyway now that text blocks have no separate row preview
  // to keep in sync (createBlockRow() skips it) - the field already shows
  // its own result live. onChange() still runs the real page-level save
  // and the full page live-preview-pane update, which don't touch this row.
  function commit() {
    block.bodyHtml = sanitizeHtml(editable.innerHTML);
    delete block.body;
    delete block.heading;
    onChange();
  }

  // Forces all pasted content to plain text - keeps the editable's HTML
  // surface entirely self-generated by our own execCommand calls above,
  // never arbitrary external markup.
  editable.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  editable.addEventListener("blur", commit);
  ["keyup", "mouseup", "click"].forEach((evt) => {
    editable.addEventListener(evt, () => {
      updateFormatButtonStates();
      saveSelection();
      updateInlineControlDisplays();
    });
  });
  wrap.appendChild(editable);
  // Deferred, not called synchronously here - `wrap` (and so `editable`)
  // isn't connected to the document yet at this point in createTextConfig()
  // (its caller does that, appending this function's return value right
  // after it returns), and getComputedStyle() on a disconnected element
  // doesn't reflect the real CSS cascade - effectiveFontFamily()'s read
  // came back empty/unmatched every time, which is why the Font button
  // showed "Font..." on first load even though the same page, once
  // actually interacted with, correctly showed a real font. By the time
  // this fires, the synchronous appendChild() that follows createTextConfig()
  // has already run.
  setTimeout(updateInlineControlDisplays, 0);

  const hint = document.createElement("p");
  hint.className = "builder-empty-state";
  hint.style.cssText = "text-align:left;margin:0.3rem 0 0;font-size:0.8rem;";
  hint.textContent = "Select text and use the toolbar above to format it.";
  wrap.appendChild(hint);

  return wrap;
}

function initialEditableHtml(block) {
  if (block.bodyHtml) return sanitizeHtml(block.bodyHtml);
  if (!block.heading && !block.body) return "";
  // One-time seed from the legacy heading/Markdown-body fields -
  // renderBlock() builds this via safe DOM construction
  // (createElement/createTextNode, see pageBlockRenderer.js), so reading
  // its innerHTML back out here isn't a user-string-to-innerHTML step,
  // unlike sanitizeHtml()'s job elsewhere in this file.
  const rendered = renderBlock({ type: "text", heading: block.heading, body: block.body, alignment: block.alignment });
  return rendered.innerHTML;
}

function createToolbarDivider() {
  const divider = document.createElement("span");
  divider.className = "page-block-toolbar-divider";
  return divider;
}

// A menu-trigger button styled like the builder's segmented value-control
// spinners (css/builder.css's .value-control-number/.value-control-spin) -
// a bordered, dark label segment plus a distinct chevron segment on the
// right - rather than a plain solid-accent action button, so it visually
// reads as "opens a dropdown" the same way the rest of the builder's
// dropdown-shaped controls do. Used for the text block toolbar's "Apply
// style..."/"Font..." menu buttons (js/modules/contextMenu.js still
// supplies the actual menu popup - this only changes the trigger's look).
function createDropdownMenuButton(label, icon = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dropdown-menu-btn";
  btn.innerHTML = `
    <span class="dropdown-menu-btn-label">${icon}<span class="dropdown-menu-btn-label-text">${label}</span></span>
    <span class="dropdown-menu-btn-arrow">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M6 9L12 15L18 9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  `;
  return btn;
}

// Updates a createDropdownMenuButton()'s visible text in place - used to
// reflect the current selection's actual style/font back into the "Apply
// style..."/"Font..." buttons (see updateInlineControlDisplays() below),
// the same way updateFormatButtonStates() reflects it into B/I/U.
function setDropdownLabel(btn, text) {
  const labelText = btn.querySelector(".dropdown-menu-btn-label-text");
  if (labelText) labelText.textContent = text;
}

function wrapRangeInLink(range, href) {
  const a = document.createElement("a");
  a.href = href;
  a.appendChild(range.extractContents());
  range.insertNode(a);
  return a;
}

// The "Apply style..." menu's contents - everything in ROLES (pageTextStyles.js)
// except bold/italic/underline, which get their own dedicated B/I/U icon
// buttons instead (see createTextConfig() above).
const BLOCK_STYLE_ROLES = ["h1", "h2", "h3", "body"];
const FORMAT_BLOCK_TAGS = { h1: "H1", h2: "H2", h3: "H3", body: "P" };

function openCustomizeStylesDialog(page, onChange, refreshPreview) {
  destroyDialogPickrInstances();
  if (!page.textStyleDefs) page.textStyleDefs = {};

  const content = document.createElement("div");
  content.style.cssText = "max-height:60vh;overflow-y:auto;";

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:var(--builder-text-base);";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th style="text-align:left;padding:0.3rem;">Style</th>
      <th style="text-align:left;padding:0.3rem;">Font</th>
      <th style="text-align:left;padding:0.3rem;">Size</th>
      <th style="text-align:left;padding:0.3rem;">Weight</th>
      <th style="text-align:left;padding:0.3rem;">Color</th>
      <th style="padding:0.3rem;"></th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  ROLES.forEach((role) => {
    if (!page.textStyleDefs[role]) page.textStyleDefs[role] = {};
    const def = page.textStyleDefs[role];

    // Also refreshes any text block editors currently open on screen, not
    // just the row/page preview panes - a customization applies to every
    // block using that role, and an open contenteditable field (see
    // createTextConfig()) needs its own live CSS custom properties
    // refreshed the same way to show the change immediately.
    const commit = () => {
      refreshPreview();
      onChange();
      document.querySelectorAll(".page-block-text-editable").forEach((el) => applyTextStyles(el, page));
    };
    const cellStyle = "padding:0.3rem;";
    // Only for the plain number input below - the two <select>s use the
    // shared .builder-select class instead (no width:100% override), so
    // they size to their widest option rather than a fixed cell width,
    // which would otherwise truncate a label like "Merriweather (Google
    // Font)".
    const inputStyle = "width:100%;box-sizing:border-box;padding:0.3rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#fff;";

    const tr = document.createElement("tr");
    tr.style.borderTop = "1px solid #444";

    const labelTd = document.createElement("td");
    labelTd.style.cssText = "padding:0.4rem 0.3rem;white-space:nowrap;";
    labelTd.textContent = ROLE_LABELS[role];
    tr.appendChild(labelTd);

    const fontTd = document.createElement("td");
    fontTd.style.cssText = cellStyle;
    const fontSelect = document.createElement("select");
    fontSelect.className = "builder-select";
    const fontDefOpt = document.createElement("option");
    fontDefOpt.value = "";
    fontDefOpt.textContent = "Default";
    fontSelect.appendChild(fontDefOpt);
    TEXT_FONT_OPTIONS.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.value;
      opt.textContent = f.label;
      fontSelect.appendChild(opt);
    });
    fontSelect.value = def.fontFamily || "";
    fontSelect.onchange = () => { def.fontFamily = fontSelect.value || undefined; commit(); };
    fontTd.appendChild(fontSelect);
    tr.appendChild(fontTd);

    const sizeTd = document.createElement("td");
    sizeTd.style.cssText = cellStyle;
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "10";
    sizeInput.max = "72";
    sizeInput.placeholder = "Default";
    sizeInput.style.cssText = inputStyle;
    if (def.fontSize) sizeInput.value = def.fontSize;
    sizeInput.onchange = () => {
      const val = parseInt(sizeInput.value, 10);
      def.fontSize = !isNaN(val) ? val : undefined;
      commit();
    };
    sizeTd.appendChild(sizeInput);
    tr.appendChild(sizeTd);

    const weightTd = document.createElement("td");
    weightTd.style.cssText = cellStyle;
    const weightSelect = document.createElement("select");
    weightSelect.className = "builder-select";
    const weightDefOpt = document.createElement("option");
    weightDefOpt.value = "";
    weightDefOpt.textContent = "Default";
    weightSelect.appendChild(weightDefOpt);
    ["400", "500", "600", "700"].forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = w;
      weightSelect.appendChild(opt);
    });
    weightSelect.value = def.fontWeight || "";
    weightSelect.onchange = () => { def.fontWeight = weightSelect.value || undefined; commit(); };
    weightTd.appendChild(weightSelect);
    tr.appendChild(weightTd);

    const colorTd = document.createElement("td");
    colorTd.style.cssText = cellStyle;
    const colorPickr = createColorPickrButton(def.color || "#ffffff", (hex) => { def.color = hex; commit(); }, dialogPickrInstances);
    colorTd.appendChild(colorPickr.btn);
    tr.appendChild(colorTd);

    // A Pickr swatch always holds a concrete value, so there's no way to
    // "unset" it back to the CSS default from the swatch alone - this
    // clears all four fields for the row at once instead of adding a
    // separate per-field reset control for just this one property.
    const resetTd = document.createElement("td");
    resetTd.style.cssText = cellStyle;
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";
    // Not .media-browser-delete-btn - that class only has a background
    // rule scoped under .media-browser-bulk-bar (css/file-picker.css), so
    // used bare here it fell through to native dark-mode button chrome
    // (inherited from the dialog overlay's color-scheme:dark), rendering
    // as an unreadable white-on-white box - see CLAUDE.md's note on this
    // exact failure mode for unstyled buttons under color-scheme:dark.
    resetBtn.style.cssText = "padding:0.3rem 0.6rem;border:1px solid #444;border-radius:4px;background:#1e1e1e;color:#ccc;cursor:pointer;font-size:var(--builder-text-base);";
    resetBtn.onclick = () => {
      page.textStyleDefs[role] = {};
      fontSelect.value = "";
      sizeInput.value = "";
      weightSelect.value = "";
      colorPickr.reset("#ffffff");
      commit();
    };
    resetTd.appendChild(resetBtn);
    tr.appendChild(resetTd);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  content.appendChild(table);

  dialog.createDialog({
    type: "custom",
    message: "Customize Text Styles",
    content: '<div id="customizeStylesSlot"></div>',
    buttons: [{ text: "Done", type: "primary", onClick: () => { destroyDialogPickrInstances(); dialog.closeDialog(); } }],
    // Widened from 560px - the Font column's <select> now sizes to fit
    // its widest option ("Merriweather (Google Font)") rather than being
    // squeezed into a narrow fixed-width cell, so the dialog needs more
    // room for the full table to lay out without wrapping/overflowing.
    maxWidth: "720px",
  });
  // createDialog's `content` option only innerHTML's an HTML string - these
  // rows need real onchange handlers, so an empty placeholder slot is
  // filled with the real DOM built above once the dialog shell exists
  // (same technique as the block-presets manager dialog).
  document.getElementById("customizeStylesSlot")?.appendChild(content);
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
  widthSelect.className = "builder-select";
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

  // Just a starting guess, not a fixed size: player.html corrects it
  // automatically once the embedded reel loads (via the postMessage
  // handshake in pageBlockRenderer.js's renderPlayer()) - a static reel
  // reports its real configured height on load, an expandable one keeps
  // reporting a new height every time it expands/collapses. This only
  // matters for how the block looks for an instant before that first
  // message arrives.
  const { row: heightRow, input: heightInput } = createValueControl({
    id: `${block.blockId}-height`,
    label: "Starting Height (px):",
    value: block.height || 500,
    min: 100,
    max: 2000,
    step: 10,
    unit: "px",
    tooltip: "Corrected automatically once the player loads - this only affects the instant before that.",
  });
  heightInput.addEventListener("input", () => {
    const val = parseInt(heightInput.value, 10);
    if (!isNaN(val)) block.height = val;
  });
  heightInput.addEventListener("change", () => {
    refreshPreview();
    onChange();
  });
  wrap.appendChild(heightRow);

  return wrap;
}

function createEmbeddedVideoConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const urlRow = document.createElement("div");
  urlRow.className = "color-row";
  const urlLabel = document.createElement("span");
  urlLabel.textContent = "Video URL:";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.value = block.videoUrl || "";
  urlInput.placeholder = "Paste a YouTube or Vimeo link";
  urlInput.style.cssText = "flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";
  urlRow.append(urlLabel, urlInput);
  wrap.appendChild(urlRow);

  const errorMsg = document.createElement("p");
  errorMsg.className = "builder-empty-state";
  errorMsg.style.cssText = "text-align:left;padding:0.2rem 0 0;display:none;color:#dc3545;";
  errorMsg.textContent = "Couldn't recognize that as a YouTube or Vimeo link.";
  wrap.appendChild(errorMsg);

  function commit() {
    block.videoUrl = urlInput.value.trim();
    errorMsg.style.display = block.videoUrl && !parseVideoEmbedUrl(block.videoUrl) ? "block" : "none";
    refreshPreview();
    onChange();
  }
  urlInput.addEventListener("input", () => { block.videoUrl = urlInput.value.trim(); });
  urlInput.addEventListener("blur", commit);

  const aspectRow = document.createElement("div");
  aspectRow.className = "color-row";
  aspectRow.style.marginTop = "0.5rem";
  const aspectLabel = document.createElement("span");
  aspectLabel.textContent = "Aspect ratio:";
  const aspectSelect = document.createElement("select");
  aspectSelect.className = "builder-select";
  [["16:9", "Widescreen (16:9)"], ["4:3", "Standard (4:3)"], ["1:1", "Square (1:1)"], ["9:16", "Vertical (9:16)"]].forEach(([v, text]) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = text;
    if ((block.aspectRatio || "16:9") === v) opt.selected = true;
    aspectSelect.appendChild(opt);
  });
  aspectSelect.onchange = () => {
    block.aspectRatio = aspectSelect.value;
    refreshPreview();
    onChange();
  };
  aspectRow.append(aspectLabel, aspectSelect);
  wrap.appendChild(aspectRow);

  return wrap;
}

// A single trigger button opening a context menu of block types (icon +
// label per type, via js/modules/contextMenu.js), rather than one button
// per type - scales to more block types later without the row growing
// wider indefinitely.
function createAddBlockRow(page, onChange) {
  const addRow = document.createElement("div");
  addRow.className = "page-block-add-row";

  const btn = createDropdownMenuButton("Add Block", ICONS.plus);
  btn.onclick = () => {
    const typeItems = Object.entries(BLOCK_TYPE_LABELS).map(([type, typeLabel]) => ({
      label: typeLabel,
      icon: ICONS[type],
      onClick: () => {
        page.blocks.push(createEmptyBlock(type));
        updatePageBlocksEditor(page, onChange);
        onChange();
      },
    }));

    const presets = loadBlockPresets();
    const presetItems = presets.map((preset, i) => ({
      label: `${preset.name} (${BLOCK_TYPE_LABELS[preset.blockType] || preset.blockType})`,
      icon: ICONS[preset.blockType],
      onClick: () => {
        page.blocks.push({ ...createEmptyBlock(preset.blockType), ...preset.config });
        updatePageBlocksEditor(page, onChange);
        onChange();
      },
    }));
    if (presets.length) {
      presetItems.push({
        label: "Manage Presets...",
        icon: ICONS.bookmark,
        onClick: () => openManagePresetsDialog(),
      });
    }

    openContextMenu(btn, [...typeItems, ...presetItems]);
  };
  addRow.appendChild(btn);

  return addRow;
}

function openManagePresetsDialog() {
  const presets = loadBlockPresets();

  const content = document.createElement("div");
  content.style.cssText = "max-height:16rem;overflow-y:auto;";
  if (presets.length === 0) {
    content.textContent = "No saved presets.";
  }
  presets.forEach((preset, i) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid #444;";

    const label = document.createElement("span");
    label.style.flex = "1";
    label.textContent = `${preset.name} (${BLOCK_TYPE_LABELS[preset.blockType] || preset.blockType})`;
    row.appendChild(label);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "media-browser-delete-btn";
    deleteBtn.onclick = () => {
      deleteBlockPreset(i);
      dialog.closeDialog();
      openManagePresetsDialog();
    };
    row.appendChild(deleteBtn);

    content.appendChild(row);
  });

  dialog.createDialog({
    type: "custom",
    message: "Manage Block Presets",
    content: '<div id="managePresetsSlot"></div>',
    buttons: [{ text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }],
  });
  // createDialog's `content` option only accepts an HTML string (it's
  // innerHTML'd directly), but the delete buttons above need real onclick
  // handlers, and preset names are arbitrary user text - building this via
  // innerHTML would mean interpolating untrusted text into markup. Pass an
  // empty placeholder slot above and fill it with the real DOM content
  // built safely (createElement/textContent) once the dialog shell exists.
  document.getElementById("managePresetsSlot")?.appendChild(content);
}
