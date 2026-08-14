// pageBlocksEditor.js - Add/remove/reorder UI for a page's blocks, the Pages
// counterpart of js/modules/tracksEditor.js. Drag-and-drop is structurally
// copied from there (same drag-handle-toggles-draggable-on-mousedown
// pattern, same dragstart/dragover/dragleave/drop sequence) rather than a
// generic shared abstraction - the two lists differ enough per-row (type-
// specific config forms here vs. fixed title/url fields there) that forcing
// a shared component would add more indirection than it'd save.
import { createUrlInputRow } from "./domUtils.js";
import { createValueControl } from "./valueControl.js";
import { renderBlock, parseVideoEmbedUrl } from "./pageBlockRenderer.js";
import { openReelPicker } from "./reelPicker.js";
import { openContextMenu } from "./contextMenu.js";
import { dialog } from "./dialogSystem.js";
import { loadBlockPresets, addBlockPreset, deleteBlockPreset } from "./pageBlockPresets.js";
import { ROLES, ROLE_LABELS, TEXT_FONT_OPTIONS, applyTextStyles } from "./pageTextStyles.js";
import { sanitizeHtml } from "./htmlSanitizer.js";

const BLOCK_TYPE_LABELS = {
  "banner-image": "Banner Image",
  text: "Text",
  image: "Image",
  player: "Player",
  "embedded-video": "Embedded Video",
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
  const styleBtn = document.createElement("button");
  styleBtn.type = "button";
  styleBtn.className = "page-block-add-btn";
  styleBtn.textContent = "Apply style...";
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
    editable.addEventListener(evt, updateFormatButtonStates);
  });
  wrap.appendChild(editable);

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

// The "Apply style..." menu's contents - everything in ROLES (pageTextStyles.js)
// except bold/italic/underline, which get their own dedicated B/I/U icon
// buttons instead (see createTextConfig() above).
const BLOCK_STYLE_ROLES = ["h1", "h2", "h3", "body"];
const FORMAT_BLOCK_TAGS = { h1: "H1", h2: "H2", h3: "H3", body: "P" };

function openCustomizeStylesDialog(page, onChange, refreshPreview) {
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
    fontSelect.style.cssText = inputStyle;
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
    weightSelect.style.cssText = inputStyle;
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
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.style.cssText = "width:2.4rem;height:2rem;padding:0;border:1px solid #444;border-radius:4px;background:#1e1e1e;cursor:pointer;";
    colorInput.value = def.color || "#ffffff";
    colorInput.onchange = () => { def.color = colorInput.value; commit(); };
    colorTd.appendChild(colorInput);
    tr.appendChild(colorTd);

    // A native <input type=color> always holds a concrete value, so there's
    // no way to "unset" it back to the CSS default from the swatch alone -
    // this clears all four fields for the row at once instead of adding a
    // separate per-field reset control for just this one property.
    const resetTd = document.createElement("td");
    resetTd.style.cssText = cellStyle;
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";
    resetBtn.className = "media-browser-delete-btn";
    resetBtn.onclick = () => {
      page.textStyleDefs[role] = {};
      fontSelect.value = "";
      sizeInput.value = "";
      weightSelect.value = "";
      colorInput.value = "#ffffff";
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
    buttons: [{ text: "Done", type: "primary", onClick: () => dialog.closeDialog() }],
    maxWidth: "560px",
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

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-block-add-btn";
  btn.innerHTML = `${ICONS.plus}<span>Add Block</span>`;
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
