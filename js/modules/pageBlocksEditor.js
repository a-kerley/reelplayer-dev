// pageBlocksEditor.js - Add/remove/reorder UI for a page's blocks, the Pages
// counterpart of js/modules/tracksEditor.js. Drag-and-drop is structurally
// copied from there (same drag-handle-toggles-draggable-on-mousedown
// pattern, same dragstart/dragover/dragleave/drop sequence) rather than a
// generic shared abstraction - the two lists differ enough per-row (type-
// specific config forms here vs. fixed title/url fields there) that forcing
// a shared component would add more indirection than it'd save.
import { createUrlInputRow, createToggleSwitch, createClearButton, animateCollapseHeight } from "./domUtils.js";
import { createValueControl, buildValueControl } from "./valueControl.js";
import { renderBlock, parseVideoEmbedUrl, parseVideoProvider } from "./pageBlockRenderer.js";
import { openReelPicker } from "./reelPicker.js";
import { WORKER_BASE_URL } from "../config.js";
import { openContextMenu } from "./contextMenu.js";
import { dialog } from "./dialogSystem.js";
import { loadBlockPresets, addBlockPreset, deleteBlockPreset } from "./pageBlockPresets.js";
import { ROLE_LABELS, TEXT_FONT_OPTIONS, ROLE_DEFAULT_SIZE_PX, ROLE_DEFAULT_WEIGHT, ROLE_DEFAULT_COLOR, applyTextStyles } from "./pageTextStyles.js";
import { sanitizeHtml, normalizeFontFamily } from "./htmlSanitizer.js";
import { createColorPickrButton, createToolbarDivider, createDropdownMenuButton, setDropdownLabel, fontMenuItems, createTextStyleToolbar, createWeightControl, openTextStyleDefsDialog } from "./styleToolbarWidgets.js";

const BLOCK_TYPE_LABELS = {
  "banner-image": "Banner Image",
  text: "Text",
  image: "Image",
  spacer: "Spacer",
  player: "Player",
  "embedded-video": "Embedded Video",
  button: "Button",
};

// Same Pickr library the reel builder's own color controls use (see
// js/modules/colorPicker.js) - a separate instance array here rather than
// reusing that module's, since these swatches are for page text-block
// content colors, not reel appearance CSS variables, and colorPicker.js's
// helper is hardcoded to a fixed set of reel-only fields. The Customize
// Text Styles dialog's own Pickr instances (openTextStyleDefsDialog(),
// js/modules/styleToolbarWidgets.js) are tracked separately there, since
// that dialog can now open with a completely different `defs` object (the
// reel builder's own "Edit Fallback Text Styles" - see
// js/modules/playerTextStyles.js) that this module knows nothing about.
let toolbarPickrInstances = [];
function destroyToolbarPickrInstances() {
  toolbarPickrInstances.forEach((p) => p.destroy());
  toolbarPickrInstances = [];
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
  spacer: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4H20" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20H20" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7V17" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 10L12 7L15 10" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14L12 17L15 14" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  player: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.90588 4.53682C6.50592 4.2998 6 4.58808 6 5.05299V18.947C6 19.4119 6.50592 19.7002 6.90588 19.4632L18.629 12.5162C19.0211 12.2838 19.0211 11.7162 18.629 11.4838L6.90588 4.53682Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "embedded-video": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 6.6V17.4C21 17.9523 20.5523 18.4 20 18.4H4C3.44772 18.4 3 17.9523 3 17.4V6.6C3 6.04772 3.44772 5.6 4 5.6H20C20.5523 5.6 21 6.04772 21 6.6Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9.2L14.5 12L10 14.8V9.2Z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  button: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8.6C3 7.71634 3.71634 7 4.6 7H19.4C20.2837 7 21 7.71634 21 8.6V15.4C21 16.2837 20.2837 17 19.4 17H4.6C3.71634 17 3 16.2837 3 15.4V8.6Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 12H17" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
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
    case "spacer":
      return { blockId, type, height: 40 };
    case "player":
      // Each height override has its own explicit enable toggle (off by
      // default) rather than relying on a 0-means-off sentinel - 0 is a
      // real-looking height in the spinner once it's pre-filled from the
      // reel's own configured height (see createPlayerConfig()), so an
      // implicit "0 = off" would be ambiguous here. Which of the three
      // actually applies depends on the picked reel's mode.
      return {
        blockId, type, reelId: "", reelTitle: "",
        closedHeightOverride: 0, closedHeightOverrideEnabled: false,
        openHeightOverride: 0, openHeightOverrideEnabled: false,
        playerHeightOverride: 0, playerHeightOverrideEnabled: false,
      };
    case "embedded-video":
      // Expandable-mode fields are intentionally absent here - a block
      // without them renders exactly as it always has (see
      // renderEmbeddedVideo()'s `if (block.expandable)` guard). They're
      // added lazily by createEmbeddedVideoConfig() when the toggle is
      // first switched on.
      return { blockId, type, videoUrl: "", aspectRatio: "16:9" };
    case "button":
      return { blockId, type, label: "Click Here", url: "", alignment: "center", backgroundColor: "#4a90e2", textColor: "#ffffff" };
    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}

// Player blocks' own row preview is an <iframe> whose src bakes in a
// snapshot of page.textStyleDefs at render time (js/modules/
// pageBlockRenderer.js's renderPlayer()) - unlike every other block type,
// which reads page.textStyleDefs live via CSS custom properties
// (applyTextStyles() below), so an edit elsewhere (e.g. the Customize
// Text Styles dialog, opened from a completely different block) can't
// reach it just by refreshing CSS vars. Tracked here, keyed by blockId,
// so openCustomizeStylesDialog()'s commitAll() can explicitly re-render
// just the player rows' own previews - not every row, and not a full
// updatePageBlocksEditor() rebuild (which would tear down every other
// row's DOM/Pickr instances/focus for an edit that, for those rows,
// nothing but a CSS var refresh was ever needed for anyway). Rebuilt
// fresh on every updatePageBlocksEditor() call below, so it can never
// reference a detached row from a previous render.
let playerBlockRefreshers = new Map();

export function updatePageBlocksEditor(page, onChange) {
  const container = document.getElementById("pageBlocksEditor");
  if (!container) return;
  destroyToolbarPickrInstances();
  container.innerHTML = "";
  playerBlockRefreshers = new Map();

  page.blocks.forEach((block, i) => {
    container.appendChild(createBlockRow(block, i, page, onChange));
  });

  container.appendChild(createAddBlockRow(page, onChange));

  // Every block row's own .page-block-row-preview inherits the page's
  // --page-text-{role}-* custom properties from this container (e.g. a
  // button block's label rendered with an assigned Text Style role) - set
  // once here, at the whole editor's own scope, rather than re-deriving
  // it per block type the way each text block's own editable already does
  // for itself (createTextConfig() below).
  applyTextStyles(container, page);
}

function createBlockRow(block, index, page, onChange) {
  const row = document.createElement("div");
  row.className = "page-block-row";
  row.draggable = false;

  // Text blocks skip this - their contenteditable editor (createTextConfig())
  // shows the styled result directly, so a second, separate rendered
  // preview underneath would just be a redundant duplicate view. Spacer
  // blocks skip it too - renderSpacer() is just an empty div at a given
  // height, so a rendered preview beneath the height control shows nothing
  // the control itself doesn't already say. Every other block type still
  // gets one (banner image, image, player, embedded video, button - none
  // of those have an in-place styled editing view or an inherently empty
  // render). Created before configForm (rather than inline further down)
  // so refreshPreview below has something to close over regardless of
  // block type.
  const preview = block.type !== "text" && block.type !== "spacer" ? document.createElement("div") : null;
  if (preview) preview.className = "page-block-row-preview";

  // Re-renders just THIS row's own preview - not a save trigger itself
  // (each config field's own blur/change handler calls onChange()
  // separately for that), and not a full block-list rebuild either: only
  // `preview`'s own contents are replaced, so every other row's DOM (and
  // its live Pickr instances, focus state, etc.) is left completely
  // alone. A no-op for text and spacer blocks, which have no `preview`
  // element to refresh in the first place (see above) - mirrors
  // createTextConfig()'s own comment on why it never calls this at all.
  function refreshPreview() {
    if (!preview) return;
    preview.innerHTML = "";
    preview.appendChild(renderBlock(block, page));
  }
  refreshPreview();
  if (block.type === "player") playerBlockRefreshers.set(block.blockId, refreshPreview);

  const configForm = createConfigForm(block, page, onChange, refreshPreview);

  // configForm + preview share one collapse/expand animation (see
  // createCollapseButton()) - wrapped in a single body div rather than
  // animated as two separate siblings, mirroring makeSectionCollapsible()'s
  // (js/modules/domUtils.js) own single-wrapper-per-section approach.
  const body = document.createElement("div");
  body.className = "page-block-body";
  body.appendChild(configForm);
  if (preview) body.appendChild(preview);

  const header = document.createElement("div");
  header.className = "page-block-row-header";

  const dragHandle = createDragHandle(row);
  header.appendChild(dragHandle);

  const collapseBtn = createCollapseButton(block, row, body);
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
  row.appendChild(body);

  setupDragAndDrop(row, index, page, onChange);

  return row;
}

function createCollapseButton(block, row, body) {
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "page-block-collapse-btn";
  collapseBtn.setAttribute("aria-label", "Collapse block");
  collapseBtn.title = "Collapse or expand this block's settings.";
  collapseBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  `;

  const setOpen = (open) => {
    collapseBtn.setAttribute("aria-expanded", String(open));
    row.classList.toggle("page-block-row-collapsed", !open);
    animateCollapseHeight(body, open);
    if (open) {
      collapsedBlockIds.delete(block.blockId);
    } else {
      collapsedBlockIds.add(block.blockId);
    }
  };
  // Stashed on the element itself so an alt-click on a DIFFERENT block row
  // (below) can drive this one's open state too - mirrors
  // makeSectionCollapsible()'s identical _setCollapsibleOpen pattern
  // (js/modules/domUtils.js) for settings-group fieldsets.
  row._setBlockCollapseOpen = setOpen;

  // Initial state is set directly, not via setOpen()/animateCollapseHeight() -
  // `row` isn't attached to the document yet at creation time
  // (updatePageBlocksEditor() appends it afterward), so body.scrollHeight
  // would read 0 regardless of the real content height. Only a later,
  // user-triggered toggle (below) is guaranteed to run while the row is
  // actually on-screen and laid out.
  const startOpen = !collapsedBlockIds.has(block.blockId);
  collapseBtn.setAttribute("aria-expanded", String(startOpen));
  row.classList.toggle("page-block-row-collapsed", !startOpen);
  body.style.height = startOpen ? "auto" : "0px";

  // Mirrors makeSectionCollapsible()'s own switch-to-auto-once-settled - a
  // config field revealing another row (e.g. the embedded-video block's
  // expandable-mode toggle) while open would otherwise get clipped by the
  // last pixel height measured at the start of that open transition.
  body.addEventListener("transitionend", (e) => {
    if (e.propertyName === "height" && collapseBtn.getAttribute("aria-expanded") === "true") {
      body.style.height = "auto";
    }
  });

  collapseBtn.onclick = (e) => {
    const opening = collapseBtn.getAttribute("aria-expanded") === "false";
    // Alt/Option-click applies this same open/closed state to every OTHER
    // block row on this page (expand-all/collapse-all), using whichever
    // direction this particular click would have applied to just this row.
    if (e.altKey && row.parentElement) {
      [...row.parentElement.children]
        .filter((el) => el.classList?.contains("page-block-row"))
        .forEach((el) => el._setBlockCollapseOpen?.(opening));
    } else {
      setOpen(opening);
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
// `refreshPreview` (createBlockRow() above) re-renders just this row's own
// .page-block-row-preview - no full list re-render needed for plain field
// edits; only reorder/add/remove touch the whole block list's DOM, via
// updatePageBlocksEditor().

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
    case "spacer":
      form.appendChild(createSpacerConfig(block, onChange, refreshPreview));
      break;
    case "player":
      form.appendChild(createPlayerConfig(block, onChange, refreshPreview));
      break;
    case "embedded-video":
      form.appendChild(createEmbeddedVideoConfig(block, page, onChange, refreshPreview));
      break;
    case "button":
      form.appendChild(createButtonConfig(block, page, onChange, refreshPreview));
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
    tooltip: "The banner image shown for this block, at full content width.",
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
  captionInput.title = "Optional caption text shown below the banner image.";
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
    tooltip: "Caps how tall the banner can render - only affects unusually tall (portrait) images.",
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
function createTextConfig(block, page, onChange, refreshPreview, { editableClass } = {}) {
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
  styleBtn.title = "Apply a block-level style (heading or body) to the selected text.";
  styleBtn.addEventListener("mousedown", (e) => e.preventDefault());
  styleBtn.onclick = () => {
    // Block-level styles only (headings + plain body) - Bold/Italic/
    // Underline get their own always-visible toggle buttons, the classic
    // B/I/U toolbar convention, instead of living in this menu.
    openContextMenu(styleBtn, styleMenuItems(page, (role) => {
      editable.focus();
      document.execCommand("formatBlock", false, FORMAT_BLOCK_TAGS[role]);
      // Reset, not layer - see stripOverrideSpans()'s comment.
      const sel = window.getSelection();
      if (sel.rangeCount && editable.contains(sel.anchorNode)) {
        blocksInRange(sel.getRangeAt(0)).forEach(stripOverrideSpans);
      }
      commit();
      updateInlineControlDisplays();
    }), { preventFocusSteal: true });
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
      // Canonicalize first so execCommand toggles against a clean single span
      // layer rather than last session's nested/styleless-span cruft - without
      // this, un-bolding a <strong> already wrapped in a size span silently
      // no-ops and Bold gets stuck "on".
      reserializeEditable();
      // Bold and the Weight dropdown are two entry points to font-weight -
      // Bold stays a real toggle across both. If the selection is heavy
      // only because of a Weight-dropdown span (not execCommand's own
      // <strong>), pressing Bold just clears that span (-> regular) rather
      // than layering a <strong> on top. Otherwise it's the normal toggle,
      // after first dropping any weight span so <strong> isn't immediately
      // overridden. The reverse (a weight unwrapping <strong>) is in
      // applyInlineStyle().
      if (command === "bold") {
        const heavyViaSpanOnly = selectionIsHeavy() && !document.queryCommandState("bold");
        clearWeightSpansInSelection();
        if (heavyViaSpanOnly) {
          commit();
          updateFormatButtonStates();
          return;
        }
      }
      document.execCommand(command);
      // commit() re-canonicalizes the editable (reserializeEditable) and can
      // move the selection, so read the button state back *after* it, not before.
      commit();
      updateFormatButtonStates();
    };
    formatButtons[command] = btn;
    formatGroup.appendChild(btn);
  });
  toolbarRow.appendChild(formatGroup);
  toolbarRow.appendChild(createToolbarDivider());

  function updateFormatButtonStates() {
    // Also lit when the selection is heavy via an explicit Weight-dropdown
    // value (>= 600), not just execCommand's own <strong>, so Bold's state
    // matches what's actually on screen. Pressing it then clears that weight
    // (clearWeightSpansInSelection) and toggles from there.
    formatButtons.bold.classList.toggle("active", document.queryCommandState("bold") || selectionIsHeavy());
    formatButtons.italic.classList.toggle("active", document.queryCommandState("italic"));
    formatButtons.underline.classList.toggle("active", document.queryCommandState("underline"));
    // queryCommandState("justifyLeft") is true whenever nothing else is set
    // too (left is every browser's unstyled default), so this always has
    // exactly one active button, never zero - matches how a real editor's
    // alignment buttons behave.
    Object.entries(justifyButtons).forEach(([command, btn]) => {
      btn.classList.toggle("active", document.queryCommandState(command));
    });
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

  // execCommand("bold") plus the Bold/Weight-dropdown reconciliation
  // (clearWeightSpansInSelection etc.) leave the *editable* with nested and
  // styleless spans - e.g. <span style="font-size:31px"><span><strong>...  -
  // that were only ever cleaned out of the saved bodyHtml copy, never here.
  // They compound over a session, and once a <strong> ends up wrapped in a
  // size span execCommand can no longer toggle it off: Bold sticks "on" and
  // repeated presses are silent no-ops. Folding the editable back through the
  // sanitizer after a format action restores a canonical DOM (one span layer,
  // no bare wrappers) - the structure execCommand actually needs.
  //
  // Only runs for a real range selection: a collapsed caret may be sitting in
  // a just-inserted CARET_PLACEHOLDER span (applyInlineStyle's "style the next
  // character I type" gesture), which sanitize strips - folding that back now
  // would delete the span the caret lives in. innerHTML replacement detaches
  // every node savedRange holds, so the caret is saved/restored as a plain-
  // text character offset (sanitize only ever rewrites tags/attributes, never
  // the text itself, so offsets round-trip).
  function reserializeEditable() {
    const sel = window.getSelection();
    if (sel.isCollapsed || !sel.rangeCount || !editable.contains(sel.anchorNode)) return;
    const r = sel.getRangeAt(0);
    // applyInlineStyle()/applyFontSizeStep() reselect the span they just made
    // with element-level boundaries (setStartBefore/setEndAfter), specifically
    // so selectionRunValue()'s range.intersectsNode() walk includes only that
    // span's own text and not the neighbouring runs. Re-deriving the selection
    // from plain text offsets here collapses those onto adjacent text nodes,
    // whose boundary-touch then counts as an intersection - so the toolbar
    // reads two fonts and shows "Mixed" right after a successful single change.
    // Those paths build clean single spans anyway (no execCommand nesting to
    // fold), so skip them; the B/I/U path still gets canonicalised.
    if (r.startContainer.nodeType === Node.ELEMENT_NODE || r.endContainer.nodeType === Node.ELEMENT_NODE) return;
    const clean = sanitizeHtml(editable.innerHTML);
    if (clean === editable.innerHTML) return;
    const start = caretCharOffset(r.startContainer, r.startOffset);
    const end = caretCharOffset(r.endContainer, r.endOffset);
    editable.innerHTML = clean;
    block.bodyHtml = clean;
    const restored = rangeFromCharOffsets(start, end);
    sel.removeAllRanges();
    sel.addRange(restored);
    savedRange = restored.cloneRange();
  }

  // Character offset from the editable's start to (container, offset), counting
  // only rendered text - the unit reserializeEditable() saves the caret in.
  function caretCharOffset(container, offset) {
    const pre = document.createRange();
    pre.selectNodeContents(editable);
    pre.setEnd(container, offset);
    return pre.toString().length;
  }

  // Inverse of caretCharOffset(): a Range spanning the same two text offsets
  // in the freshly-rebuilt DOM.
  function rangeFromCharOffsets(start, end) {
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node;
    let sNode = null;
    let sOff = 0;
    let eNode = null;
    let eOff = 0;
    while ((node = walker.nextNode())) {
      const len = node.textContent.length;
      if (sNode === null && count + len >= start) {
        sNode = node;
        sOff = start - count;
      }
      if (count + len >= end) {
        eNode = node;
        eOff = end - count;
        break;
      }
      count += len;
    }
    const r = document.createRange();
    if (sNode) r.setStart(sNode, sOff);
    else { r.selectNodeContents(editable); r.collapse(false); }
    if (eNode) r.setEnd(eNode, eOff);
    else r.collapse(sNode ? true : false);
    return r;
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

  // Whether any ad hoc Font/Size/Color span (applyInlineStyle() above)
  // touches `range` - i.e. this text's actual rendered style has drifted
  // away from whatever its role (H1/H2/H3/Body/Link/Playlist Item) alone
  // would produce, the same override an edit in Customize Text Styles
  // would silently fail to reach. Pure display signal for styleBtn's label
  // below - never consulted by applyInlineStyle()/execCommand("formatBlock")
  // themselves, only by what's shown back about their result.
  //
  // A collapsed caret only has one position to check (findWrappingSpan(),
  // same as the size/font display fallbacks above); a real selection can
  // straddle overridden and un-overridden text, so it's "any run in range
  // sits inside such a span" rather than "do they all agree" - unlike
  // selectionRunValue() above, one overridden run anywhere is enough to
  // call the whole selection customized.
  function selectionHasOverride(range) {
    if (!range) return false;
    if (range.collapsed) {
      return !!(findWrappingSpan(range, "fontFamily") || findWrappingSpan(range, "fontSize") || findWrappingSpan(range, "color") || findWrappingSpan(range, "fontWeight"));
    }
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent) continue;
      let el = node.parentElement;
      while (el && el !== editable) {
        if (el.tagName === "SPAN" && (el.style.fontFamily || el.style.fontSize || el.style.color || el.style.fontWeight)) return true;
        el = el.parentElement;
      }
    }
    return false;
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
        // A span left with no inline style at all (its only property was the
        // one just cleared) is pure wrapper debris - unwrap it now rather than
        // sealing it permanently inside the new span. Without this, re-styling
        // text that already had a span for `prop`, or a selection crossing
        // span boundaries, accumulates nested/styleless <span><span> shells.
        if (el.style.length === 0) {
          while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
          el.remove();
        }
      });
      // Bold and the Weight dropdown both target font-weight; keep them
      // coherent by making the last action win rather than silently stack.
      // Setting a weight unwraps any <strong>/<b> in the range (execCommand
      // bold's output) so the new weight span isn't shadowing a dead
      // <strong> underneath. The reverse - Bold clearing weight spans -
      // is handled in the B button's own onclick.
      if (prop === "fontWeight") {
        fragment.querySelectorAll("b, strong").forEach((el) => {
          while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
          el.remove();
        });
      }
      const span = document.createElement("span");
      span.style[prop] = value;
      span.appendChild(fragment);
      range.insertNode(span);
      removeEmptySpans();
      // The new span can land inside an ancestor span that also sets `prop`
      // (re-styling text already wrapped for it) - that ancestor's value is
      // now shadowed dead weight, so clear it, and drop the ancestor whole if
      // that was all it carried.
      for (let anc = span.parentNode; anc && anc !== editable && anc.tagName === "SPAN"; ) {
        const next = anc.parentNode;
        if (anc.style[prop]) {
          anc.style[prop] = "";
          if (anc.style.length === 0) {
            while (anc.firstChild) next.insertBefore(anc.firstChild, anc);
            anc.remove();
          }
        }
        anc = next;
      }
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
  //
  // Falls back to editable's own first child when there's no live
  // selection inside it at all (same idea as effectiveFontFamily()/
  // effectiveFontSizePx()'s `editable` fallback) - without this, a
  // freshly-loaded block that's never been clicked into always showed
  // "Apply style..." instead of the block's real role (e.g. "Body"),
  // even though picking a style and applying it already worked correctly
  // from that exact same untouched state (document.execCommand()
  // operates on whatever editable.focus() establishes, no live selection
  // required beforehand) - only the *display* was wrong, not the apply.
  const BLOCK_TAG_ROLES = { H1: "h1", H2: "h2", H3: "h3", P: "body" };
  // "body" (not null) is the terminal fallback - reachable for a block
  // that's completely empty (editable.firstChild is itself null, so the
  // walk below never even starts). There's no real ambiguity to reflect
  // in that case: a block with nothing in it yet reads exactly like plain
  // body text once you do start typing, the same as an empty Google Docs
  // paragraph shows "Normal text," never a blank/placeholder style.
  function currentBlockRole() {
    const sel = window.getSelection();
    let node = sel.rangeCount && editable.contains(sel.anchorNode) ? sel.anchorNode : editable.firstChild;
    while (node && node !== editable) {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAG_ROLES[node.tagName]) return BLOCK_TAG_ROLES[node.tagName];
      node = node.parentNode;
    }
    return "body";
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
    // Walks every ancestor level (see blocksInRange()'s identical climb
    // below) - a selection sitting entirely inside an override SPAN (e.g.
    // the whole paragraph has one covering it) resolves its common
    // ancestor to that span, not the P/H1-3 it's inside; a single text-
    // node-to-parent step stops one level too early there.
    let node = range.commonAncestorContainer;
    while (node !== editable && !BLOCK_TAG_ROLES[node.tagName]) node = node.parentNode;
    if (node !== editable) return BLOCK_TAG_ROLES[node.tagName];
    const blocks = Array.from(editable.children).filter((el) => BLOCK_TAG_ROLES[el.tagName] && range.intersectsNode(el));
    // "body", not null - same terminal-default reasoning as
    // currentBlockRole() above, for the (unusual) case of a real
    // selection that somehow doesn't intersect any recognized block.
    if (!blocks.length) return "body";
    const roles = new Set(blocks.map((el) => BLOCK_TAG_ROLES[el.tagName]));
    return roles.size === 1 ? [...roles][0] : MIXED;
  }

  // Same traversal as selectionBlockRole() above, but returns the actual
  // block element(s) rather than their agreed-on role - used by
  // styleMenuItems()'s onPick below to know exactly which paragraph(s) to
  // clean up after re-applying a role. Called *after* execCommand
  // ("formatBlock") has already run, so a bare top-level text node (no
  // wrapping element yet - see the defaultParagraphSeparator comment
  // above) has by then been wrapped into a real P/H1/H2/H3 the same way
  // formatBlock always leaves its target.
  function blocksInRange(range) {
    // Walks every ancestor level, not just one - a selection that sits
    // entirely inside an override SPAN (the common case: the override
    // covers the whole paragraph, so the selection's common ancestor
    // resolves to the span itself, not the P it's inside) needs to keep
    // climbing past that span to find the real block. A single text-node-
    // to-parent step (selectionBlockRole()'s own shallower version of this
    // same walk) stops one level too early there and silently finds
    // nothing to return.
    let node = range.commonAncestorContainer;
    while (node !== editable && !BLOCK_TAG_ROLES[node.tagName]) node = node.parentNode;
    if (node !== editable) return [node];
    return Array.from(editable.children).filter((el) => BLOCK_TAG_ROLES[el.tagName] && range.intersectsNode(el));
  }

  // Unwraps (keeps the text, drops the wrapper) any ad hoc Font/Size/Color
  // span (applyInlineStyle() above) inside `root`. Re-applying a role is
  // meant to reset text back to *only* that role's styling - the same
  // "start clean" a real editor's paragraph-style picker gives - not
  // leave the role's own definition permanently shadowed underneath
  // whatever override was already there (exactly the drift
  // selectionHasOverride()/the styleBtn "•" marker exists to flag).
  function stripOverrideSpans(root) {
    root.querySelectorAll("span").forEach((span) => {
      if (span.style.fontFamily || span.style.fontSize || span.style.color || span.style.fontWeight) {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.remove();
      }
    });
  }

  // Clears the font-weight off any span touching the current selection -
  // called just before execCommand("bold") so Bold's <strong> starts from a
  // clean slate instead of being visually overridden by a leftover numeric
  // weight the Weight dropdown set. Only nulls the property (no unwrap) so
  // the live selection survives for the execCommand that follows;
  // now-styleless spans are dropped by sanitizeHtml() at commit().
  function clearWeightSpansInSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editable.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    editable.querySelectorAll("span").forEach((span) => {
      if (span.style.fontWeight && range.intersectsNode(span)) span.style.fontWeight = "";
    });
  }

  // Effective font-weight at the caret is >= 600 - covers a <strong>, a
  // Weight-dropdown span, and a heavy per-role default alike.
  function selectionIsHeavy() {
    const sel = window.getSelection();
    const node = sel.rangeCount && editable.contains(sel.anchorNode) ? sel.anchorNode : null;
    const el = node ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) : null;
    if (!el) return false;
    return (parseInt(getComputedStyle(el).fontWeight, 10) || 400) >= 600;
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
      setStyleBtnLabel(role, selectionHasOverride(range));
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
      setStyleBtnLabel(role, selectionHasOverride(range));
    }
    // Re-derive the weight dropdown for the selection's current font and
    // reflect its current weight. null until the deferred init below builds
    // it (createWeightControl's synchronous render() needs `editable`).
    weightControl?.refresh();
  }

  // Shared by both updateInlineControlDisplays() branches above - appends
  // a "•" + explanatory title when this role also carries an ad hoc
  // override (selectionHasOverride()), so the button doesn't just say
  // "Body" while some of that text quietly no longer looks like Body at
  // all. MIXED is left alone (it's already an unambiguous "more than one
  // thing going on" signal on its own).
  const STYLE_BTN_BASE_TITLE = "Apply a block-level style (heading or body) to the selected text.";

  function setStyleBtnLabel(role, overridden) {
    if (role === MIXED) {
      setDropdownLabel(styleBtn, "Mixed");
      styleBtn.title = STYLE_BTN_BASE_TITLE;
      return;
    }
    const label = role ? ROLE_LABELS[role] : "Apply style...";
    setDropdownLabel(styleBtn, role && overridden ? `${label} •` : label);
    styleBtn.title = role && overridden
      ? `This text has custom formatting on top of its ${label} style - editing ${label} in Customize Text Styles won't change it.`
      : STYLE_BTN_BASE_TITLE;
  }

  const fontBtn = createDropdownMenuButton("Font...");
  fontBtn.classList.add("font-picker-btn");
  fontBtn.title = "Set the font family for the selected text.";
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
    openContextMenu(fontBtn, fontMenuItems((f) => {
      applyInlineStyle("fontFamily", f.stack);
      updateInlineControlDisplays();
    }), { preventFocusSteal: true });
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
  });
  sizeControl.control.classList.add("page-block-text-toolbar-size");
  sizeControl.control.title = "Font size (px) for the selected text";
  const sizeIcon = document.createElement("span");
  sizeIcon.className = "material-symbols-outlined page-block-text-toolbar-num-icon";
  sizeIcon.textContent = "format_size";
  sizeControl.control.prepend(sizeIcon);
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

  // Weight: the same font-aware control the Customize Text Styles dialog
  // uses (dropdown of the current font's real static weights, or a spinner
  // for system/serif/mono). Applied per-selection via a <span
  // style="font-weight:...">, which htmlSanitizer.js now keeps.
  //
  // createWeightControl() runs its render() synchronously, and render()
  // calls the getters below - which read `editable` - so unlike every
  // other toolbar closure here it CANNOT be built inline (editable isn't
  // declared yet). Built into this placeholder from the same deferred init
  // as updateInlineControlDisplays() at the end of this function.
  function currentSelectionRange() {
    const sel = window.getSelection();
    if (savedRange) return savedRange;
    return sel.rangeCount && editable.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
  }
  function currentFontValue() {
    const range = currentSelectionRange();
    const fontSpan = range && findWrappingSpan(range, "fontFamily");
    const family = fontSpan ? normalizeFontFamily(fontSpan.style.fontFamily) : effectiveFontFamily();
    const opt = TEXT_FONT_OPTIONS.find((f) => normalizeFontFamily(f.stack) === family);
    return opt ? opt.value : "system";
  }
  let weightControl = null;
  const weightSlot = document.createElement("span");
  weightSlot.className = "weight-control-wrap";
  weightSlot.title = "Font weight for the selected text";
  toolbarRow.appendChild(weightSlot);

  // Line spacing lives in the toolbar (after Weight), not its own row below the
  // field. Placeholder here; the real control needs `editable`/`commit`, built
  // in the deferred init lower down and swapped into this slot.
  const lineHeightSlot = document.createElement("span");
  toolbarRow.appendChild(lineHeightSlot);

  toolbarRow.appendChild(createToolbarDivider());
  function buildWeightControl() {
    if (weightControl) return;
    weightControl = createWeightControl({
      idPrefix: `${block.blockId}-toolbar`,
      getFontFamily: currentFontValue,
      getWeight: () => {
        const range = currentSelectionRange();
        const wSpan = range && findWrappingSpan(range, "fontWeight");
        if (wSpan) return wSpan.style.fontWeight;
        const sel = window.getSelection();
        const node = sel.rangeCount && editable.contains(sel.anchorNode) ? sel.anchorNode : editable;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return String(Math.round(parseFloat(getComputedStyle(el || editable).fontWeight)) || 400);
      },
      setWeight: (value) => {
        if (value == null) return;
        applyInlineStyle("fontWeight", String(value));
        // NOT updateInlineControlDisplays() here - createWeightControl's own
        // onClick has already set the button label, and refreshing now
        // rebuilds it from getWeight(), which can't see the span we just
        // wrapped (the selection is start-before/end-after it, so
        // findWrappingSpan walks past it) and so snaps the label back to
        // "Regular". The next real selection change re-syncs it.
      },
      onCommit: commit,
    });
    weightSlot.replaceWith(weightControl.control);
  }

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

  // Real per-selection toggles, same document.execCommand()/
  // queryCommandState() pattern as the B/I/U group above - not
  // block.alignment (that was a single value for the *whole* block,
  // applied once to the outer wrapper). justifyLeft/Center/Right/Full
  // apply to whichever paragraph(s)/heading(s) the current selection spans
  // (the browser's own native "block-level" targeting - a multi-paragraph
  // selection re-justifies every paragraph it touches), exactly the
  // per-line behavior a real editor's alignment buttons have. Still uses
  // .format-icon (not .align-icon) - visually identical, but marks this
  // as one of the execCommand-driven toggles, unlike .align-icon's other
  // consumers (the button block's own alignment, playerTextStyles.js's
  // Title align), which really are single whole-element settings.
  const justifyGroup = document.createElement("span");
  justifyGroup.className = "icon-toggle-group";
  const justifyButtons = {};
  [
    ["justifyLeft", "format_align_left", "Align left"],
    ["justifyCenter", "format_align_center", "Align center"],
    ["justifyRight", "format_align_right", "Align right"],
    ["justifyFull", "format_align_justify", "Justify"],
  ].forEach(([command, glyph, title]) => {
    const btn = document.createElement("span");
    btn.className = "format-icon";
    btn.title = title;
    btn.innerHTML = `<span class="material-symbols-outlined">${glyph}</span>`;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.onclick = () => {
      editable.focus();
      document.execCommand(command);
      commit();
      updateFormatButtonStates();
    };
    justifyButtons[command] = btn;
    justifyGroup.appendChild(btn);
  });
  toolbarRow.appendChild(justifyGroup);

  const customizeBtn = document.createElement("button");
  customizeBtn.type = "button";
  customizeBtn.className = "page-block-add-btn";
  customizeBtn.textContent = "Customize Styles...";
  customizeBtn.title = "Edit this page's Title/Body/Heading style roles, used by any text block set to that style.";
  // No margin-left:auto and no leading divider - in a flex-wrap toolbar that
  // auto margin snapped the button between the align-icons row and a right-
  // aligned row of its own (resizing the gap before it) every time the panel
  // width crossed a wrap point, and the 1px divider would wrap onto a line by
  // itself. Its accent-bordered style already reads as separate; it now just
  // flows inline and wraps predictably like any other item.
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
  editable.className = "page-block-text page-block-text-editable" + (editableClass ? ` ${editableClass}` : "");
  editable.setAttribute("data-placeholder", "Type your text here...");
  editable.style.textAlign = block.alignment === "center" ? "center" : "left";
  editable.innerHTML = initialEditableHtml(block);
  // Reflects the page's actual per-role font/size/weight/color
  // customization live inside the editor itself, not just in the preview
  // panes - genuine WYSIWYG rather than generic browser bold/italic.
  applyTextStyles(editable, page);
  // Per-field line spacing - one value for the whole block (paragraphs),
  // set as a CSS custom property that css/page.css's .page-block-text rule
  // reads (with a 1.6 fallback). Mirrored on the rendered block by
  // renderText().
  if (block.lineHeight != null) editable.style.setProperty("--page-text-block-line-height", String(block.lineHeight));

  const { control: lineHeightControl, input: lineHeightInput } = createValueControl({
    id: `${block.blockId}-lineHeight`,
    label: "",
    value: block.lineHeight ?? 1.6,
    min: 0,
    max: 3,
    step: 0.1,
  });
  // Compact toolbar form: hide the hover-reveal slider (CSS), sit at content
  // width, and use a leading icon instead of a "Line spacing:" text label.
  lineHeightControl.classList.add("page-block-text-toolbar-lineheight");
  lineHeightControl.title = "Line spacing - line-height for this block's paragraphs";
  const lhIcon = document.createElement("span");
  lhIcon.className = "material-symbols-outlined page-block-text-toolbar-num-icon";
  lhIcon.textContent = "format_line_spacing";
  lineHeightControl.prepend(lhIcon);
  const applyLineHeight = () => {
    const val = parseFloat(lineHeightInput.value);
    if (isNaN(val)) return;
    block.lineHeight = Math.round(val * 10) / 10;
    editable.style.setProperty("--page-text-block-line-height", String(block.lineHeight));
    commit();
  };
  lineHeightInput.addEventListener("change", applyLineHeight);
  lineHeightSlot.replaceWith(lineHeightControl);

  // Deliberately does NOT call refreshPreview() - harmless either way now
  // (it's a no-op for text blocks, which have no separate
  // .page-block-row-preview to refresh; createBlockRow() skips it since
  // this field already shows its own result live), but skipped anyway
  // since there's nothing for it to do here. onChange() still runs the
  // real page-level save and the page's own live-preview-pane update.
  function commit() {
    block.bodyHtml = sanitizeHtml(editable.innerHTML);
    delete block.body;
    delete block.heading;
    // Fold that sanitized HTML back into the live editable so nesting /
    // styleless-span cruft can't accumulate across a session (see its comment).
    reserializeEditable();
    // [overlay-debug] - keep until the overlay text is confirmed correct
    const dbgP = editable.querySelector("p, h1, h2, h3") || editable;
    const csEd = getComputedStyle(editable);
    const csP = getComputedStyle(dbgP);
    console.log(`[overlay-debug] EDITOR commit lhField=${block.lineHeight}
  container: lh=${csEd.lineHeight} size=${csEd.fontSize} weight=${csEd.fontWeight} family=${csEd.fontFamily}
  ${dbgP.tagName}:   lh=${csP.lineHeight} size=${csP.fontSize} weight=${csP.fontWeight} family=${csP.fontFamily}
  html: ${block.bodyHtml}`);
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
  // Without this, Chrome's default Enter behavior wraps each new line in a
  // <div> - not in htmlSanitizer.js's ALLOWED_TAGS, so every line past the
  // first would get silently unwrapped (text kept, paragraph boundary
  // lost) the moment this field blurs. <p> is already allowed (it's what
  // the "Body" style/FORMAT_BLOCK_TAGS above produces) and is also what
  // the justify buttons below need to exist as *something* alignable -
  // execCommand("justify*") targets the selection's nearest block-level
  // ancestor, and a bare text node with no wrapping element has none.
  // Document-level, not per-element, but harmless to re-set on every
  // focus - only one contenteditable owns focus at a time.
  editable.addEventListener("focus", () => {
    document.execCommand("defaultParagraphSeparator", false, "p");
  });
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
  setTimeout(() => {
    buildWeightControl();
    updateInlineControlDisplays();
  }, 0);

  const hint = document.createElement("p");
  hint.className = "builder-empty-state";
  hint.style.cssText = "text-align:left;margin:0.3rem 0 0;font-size:0.8rem;";
  hint.textContent = "Select text and use the toolbar above to format it.";
  wrap.appendChild(hint);

  return wrap;
}

function initialEditableHtml(block) {
  if (block.bodyHtml) return sanitizeHtml(block.bodyHtml);
  // A block container from the start - typing into a truly empty
  // contenteditable leaves the first line unwrapped at the root, and every
  // execCommand/style applied to bare root-level content then compounds
  // structural damage (stray </p>, runaway nesting, <font> tags). The
  // sanitizer now also heals this on commit (wrapBareInlineRuns), but
  // starting clean avoids the flicker.
  if (!block.heading && !block.body) return "<p><br></p>";
  // One-time seed from the legacy heading/Markdown-body fields -
  // renderBlock() builds this via safe DOM construction
  // (createElement/createTextNode, see pageBlockRenderer.js), so reading
  // its innerHTML back out here isn't a user-string-to-innerHTML step,
  // unlike sanitizeHtml()'s job elsewhere in this file.
  const rendered = renderBlock({ type: "text", heading: block.heading, body: block.body, alignment: block.alignment });
  return rendered.innerHTML;
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

// Resolves each BLOCK_STYLE_ROLES entry into real preview styling for its
// "Apply style..." menu item - same idea as styleToolbarWidgets.js's
// fontMenuItems() previewing each font option in its own typeface, just
// covering size/weight/color too, since a role is more than a font choice.
// Reads this page's own Customize Text Styles override
// (page.textStyleDefs[role]) with the same ROLE_DEFAULT_* fallback the
// dialog itself uses (below), so "Heading 1" in the menu always looks like
// this page's actual current Heading 1 - including after a Customize
// Styles edit, since the menu is rebuilt fresh on every click rather than
// cached.
function styleMenuItems(page, onPick) {
  return BLOCK_STYLE_ROLES.map((role) => {
    const def = page.textStyleDefs?.[role] || {};
    const font = TEXT_FONT_OPTIONS.find((f) => f.value === def.fontFamily);
    const styleParts = [
      `font-size:${def.fontSize || ROLE_DEFAULT_SIZE_PX[role]}px`,
      `font-weight:${def.fontWeight || ROLE_DEFAULT_WEIGHT[role]}`,
      `color:${def.color || ROLE_DEFAULT_COLOR[role]}`,
    ];
    if (font) styleParts.push(`font-family:${font.stack}`);
    return {
      label: ROLE_LABELS[role],
      style: styleParts.join(";"),
      onClick: () => onPick(role),
    };
  });
}

export function openCustomizeStylesDialog(page, onChange, refreshPreview) {
  if (!page.textStyleDefs) page.textStyleDefs = {};

  openTextStyleDefsDialog({
    title: "Customize Text Styles",
    defs: page.textStyleDefs,
    // Also refreshes any text block editors currently open on screen, not
    // just the row/page preview panes - a customization applies to every
    // block using that role, and an open contenteditable field (see
    // createTextConfig()) needs its own live CSS custom properties
    // refreshed the same way to show the change immediately.
    onCommit: () => {
      refreshPreview();
      onChange();
      document.querySelectorAll(".page-block-text-editable").forEach((el) => applyTextStyles(el, page));
      // Every other block row's own .page-block-row-preview (e.g. a button
      // assigned a Text Style role) reads these same --page-text-{role}-*
      // vars too, but has no per-instance applyTextStyles() call of its own
      // the way each text block's editable does above - it only inherits
      // whatever's set on an ancestor. Re-applied here at the whole editor's
      // container level so an edit made in this dialog is reflected in
      // every row's preview immediately, not just on the next full
      // add/remove/reorder rebuild (updatePageBlocksEditor() below).
      const container = document.getElementById("pageBlocksEditor");
      if (container) applyTextStyles(container, page);
      // Player blocks don't pick up the CSS-var refresh above at all (see
      // playerBlockRefreshers' own comment) - explicitly re-render just
      // their own row previews so an inherited title/track-name/playlist
      // role reflects this edit immediately, not just on the next add/
      // remove/reorder.
      playerBlockRefreshers.forEach((refresh) => refresh());
    },
  });
}

function createImageConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const { row: urlRow, input: urlInput } = createUrlInputRow({
    id: `${block.blockId}-imageUrl`,
    label: "Image:",
    value: block.imageUrl,
    placeholder: "Paste an image URL or select from Media Library",
    tooltip: "The image shown for this block.",
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
  widthSelect.title = "How wide this image renders within the content column.";
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

function createSpacerConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const { row, input } = createValueControl({
    id: `${block.blockId}-height`,
    label: "Height (px):",
    value: block.height ?? 40,
    min: 0,
    max: 600,
    step: 5,
    unit: "px",
    tooltip: "How much vertical space this block adds to the page.",
  });
  input.addEventListener("input", () => {
    const val = parseInt(input.value, 10);
    if (!isNaN(val)) block.height = val;
  });
  input.addEventListener("change", () => {
    refreshPreview();
    onChange();
  });
  wrap.appendChild(row);

  return wrap;
}

function createPlayerConfig(block, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  // Reel field - laid out identically to Project Cards' own reel field
  // (cardsController.js's renderReelField()) via the same shared
  // createUrlInputRow(), instead of this block's own previous hand-rolled
  // ".color-row" + "Select Reel"/"Change" button markup. Same reasoning as
  // that field's own comment: a single-line row with a folder-icon browse
  // button wired to openReelPicker() via onPickerClick, read-only (a reel
  // is picked, never typed), with a clear (x) button once one's picked
  // since a read-only field can't be emptied by typing.
  const reelFieldSlot = document.createElement("div");

  function openPicker() {
    openReelPicker({
      onSelect: (reelId, reelTitle) => {
        block.reelId = reelId;
        block.reelTitle = reelTitle;
        renderReelField(reelTitle);
        refreshHeightOverridesForReel();
        refreshPreview();
        onChange();
      },
    });
  }

  function renderReelField(title) {
    reelFieldSlot.innerHTML = "";

    const { row, input } = createUrlInputRow({
      id: `${block.blockId}-reel`,
      label: "Reel:",
      value: block.reelId ? (title || block.reelId) : "",
      placeholder: "Choose a reel…",
      tooltip: "The reel this player block embeds.",
      onPickerClick: openPicker,
    });
    input.readOnly = true;
    input.style.cursor = "pointer";
    input.onclick = openPicker;

    if (block.reelId) {
      const clearBtn = createClearButton({
        onClick: () => {
          block.reelId = "";
          block.reelTitle = "";
          renderReelField(null);
          refreshHeightOverridesForReel();
          refreshPreview();
          onChange();
        },
      });
      row.appendChild(clearBtn);
    }

    reelFieldSlot.appendChild(row);
  }

  renderReelField(block.reelTitle);
  wrap.appendChild(reelFieldSlot);

  // Which height override(s) make sense depends on the picked reel's own
  // mode (static: one height; expandable: separate closed/open heights) -
  // the block itself doesn't know this (it only stores a reelId reference,
  // never a copy of the reel's config - see reelPicker.js's header comment),
  // so it's fetched via the same public GET /reels/:id player.html itself
  // uses, whenever the picked reel changes. Each override has its own
  // enable toggle (see buildOverrideRow) and, once on, is forwarded into
  // the embed and applied on top of the reel's actual configured heights -
  // see player.html's applyPageHeightOverrides() - not just a pre-load
  // size guess.
  const heightOverrideSlot = document.createElement("div");
  wrap.appendChild(heightOverrideSlot);

  // One "toggle + spinner" row for a single override field. The spinner
  // shows/starts from block[key] once the user has set one, otherwise
  // reelDefaultValue - the reel's own actual current height for that
  // field - so switching the toggle on starts from a real, working value
  // instead of an arbitrary/zeroed one.
  function buildOverrideRow({ key, enabledKey, label, tooltip, reelDefaultValue, step, sliderMin, sliderMax }) {
    const { row, control, input, slider } = createValueControl({
      id: `${block.blockId}-${key}`,
      label,
      value: block[key] || reelDefaultValue,
      // Typed range stays wide (0-2000) regardless of field - the slider is
      // what's field-specific, matching whatever range the reel builder's
      // own equivalent control (expandableMode.js) uses, since that's the
      // actual value being overridden.
      min: 0,
      max: 2000,
      step,
      unit: "px",
      tooltip,
      sliderMin,
      sliderMax,
    });

    function setEnabled(enabled) {
      input.disabled = !enabled;
      slider.disabled = !enabled;
    }
    setEnabled(block[enabledKey] === true);

    const toggle = createToggleSwitch({
      id: `${block.blockId}-${key}-enabled`,
      checked: block[enabledKey] === true,
      tooltip: `Override ${tooltip.charAt(0).toLowerCase()}${tooltip.slice(1)}`,
      onChange: (e) => {
        block[enabledKey] = e.target.checked;
        setEnabled(e.target.checked);
        if (e.target.checked && !block[key]) {
          block[key] = reelDefaultValue;
          input.value = String(reelDefaultValue);
          slider.value = String(reelDefaultValue);
        }
        refreshPreview();
        onChange();
      },
    });
    // Between the label and the spinner, per the row's natural label ->
    // control order (buildValueControl() appends labelEl then control).
    row.insertBefore(toggle, control);

    input.addEventListener("input", () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val)) block[key] = val;
    });
    input.addEventListener("change", () => {
      refreshPreview();
      onChange();
    });

    return row;
  }

  function renderHeightOverrides(mode, reelDefaults) {
    heightOverrideSlot.innerHTML = "";
    if (!block.reelId) return;

    if (mode === "expandable") {
      // Ranges mirror the reel builder's own Collapsed/Expanded Height
      // controls exactly (expandableMode.js) - these overrides replace
      // those same values for this embed, so the slider should feel like
      // the same field, not an arbitrary new range.
      heightOverrideSlot.appendChild(buildOverrideRow({
        key: "closedHeightOverride",
        enabledKey: "closedHeightOverrideEnabled",
        label: "Closed Height Override (px):",
        tooltip: "This reel's own collapsed height for this embed only.",
        reelDefaultValue: reelDefaults.closedHeight,
        step: 5,
        sliderMin: 50,
        sliderMax: 300,
      }));
      heightOverrideSlot.appendChild(buildOverrideRow({
        key: "openHeightOverride",
        enabledKey: "openHeightOverrideEnabled",
        label: "Open Height Override (px):",
        tooltip: "This reel's own expanded height for this embed only.",
        reelDefaultValue: reelDefaults.openHeight,
        step: 10,
        sliderMin: 200,
        sliderMax: 1000,
      }));
    } else {
      // Matches the reel builder's own Player Height control's range.
      heightOverrideSlot.appendChild(buildOverrideRow({
        key: "playerHeightOverride",
        enabledKey: "playerHeightOverrideEnabled",
        label: "Player Height Override (px):",
        tooltip: "This reel's own player height for this embed only.",
        reelDefaultValue: reelDefaults.playerHeight,
        step: 10,
        sliderMin: 200,
        sliderMax: 1000,
      }));
    }
  }

  async function refreshHeightOverridesForReel() {
    if (!block.reelId) {
      renderHeightOverrides(null, {});
      return;
    }
    let data = null;
    try {
      const res = await fetch(`${WORKER_BASE_URL}/reels/${block.reelId}`);
      if (res.ok) data = await res.json();
    } catch {
      // Network hiccup or reel since unpublished - falls back to the
      // static (single height) field with default reel-height guesses
      // below, rather than leaving the form stuck empty.
    }
    renderHeightOverrides(data?.mode || "static", {
      playerHeight: data?.playerHeight || 500,
      closedHeight: data?.settings?.expandableCollapsedHeight || 120,
      openHeight: data?.settings?.expandableExpandedHeight || 500,
    });
  }

  refreshHeightOverridesForReel();

  return wrap;
}

// Fields only meaningful once "Expandable" is switched on. Added lazily
// (rather than in createEmptyBlock()) so a block that never opts in stays
// byte-for-byte identical to a pre-feature one - see renderEmbeddedVideo().
const EXPANDABLE_VIDEO_FIELD_DEFAULTS = {
  collapsedHeight: 120,
  closedBgImage: "",
  closedBgBlur: 8,
  closedOverlayColor: "rgba(0, 0, 0, 0.35)",
  closedOverlayColorEnabled: false,
  overlayMode: "none",
  overlayImage: "",
  overlayText: "",
};

function ensureExpandableVideoDefaults(block) {
  for (const [key, value] of Object.entries(EXPANDABLE_VIDEO_FIELD_DEFAULTS)) {
    if (block[key] == null) block[key] = value;
  }
  if (block.closedBgMode == null) {
    // Default to the free static thumbnail when we can get one, otherwise a
    // custom image is the only option (Vimeo has no static thumbnail URL).
    block.closedBgMode = parseVideoProvider(block.videoUrl) === "youtube" ? "thumbnail" : "custom";
  }
}

const IMAGE_PICKER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function createEmbeddedVideoConfig(block, page, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const urlRow = document.createElement("div");
  urlRow.className = "color-row";
  const urlLabel = document.createElement("span");
  urlLabel.textContent = "Video URL:";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.value = block.videoUrl || "";
  urlInput.placeholder = "Paste a YouTube, Vimeo, or Cloudflare Stream link";
  urlInput.title = "The video this block embeds - a YouTube, Vimeo, or Cloudflare Stream URL.";
  urlInput.style.cssText = "flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";

  // Cog: per-provider "Advanced Embed Settings" (controls, related videos,
  // start/end, Vimeo chrome, etc.). Hidden until the URL is a recognized
  // provider; opens a dialog that edits block.embedOptions live.
  const advBtn = document.createElement("button");
  advBtn.type = "button";
  advBtn.className = "file-picker-btn";
  advBtn.setAttribute("aria-label", "Advanced embed settings");
  advBtn.title = "Advanced embed settings";
  advBtn.style.cssText = "background:transparent;border:none;color:#ccc;border-radius:4px;padding:0.35em 0.5em;cursor:pointer;display:none;align-items:center;justify-content:center;";
  advBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`;

  urlRow.append(urlLabel, urlInput, advBtn);
  wrap.appendChild(urlRow);

  const errorMsg = document.createElement("p");
  errorMsg.className = "builder-empty-state";
  errorMsg.style.cssText = "text-align:left;padding:0.2rem 0 0;display:none;color:#dc3545;";
  errorMsg.textContent = "Couldn't recognize that as a YouTube, Vimeo, or Cloudflare Stream link.";
  wrap.appendChild(errorMsg);

  let lastProvider = parseVideoProvider(block.videoUrl);

  function syncAdvBtn() {
    const provider = parseVideoProvider(block.videoUrl);
    advBtn.disabled = !provider;
    advBtn.style.display = provider ? "flex" : "none";
  }
  advBtn.onclick = async () => {
    const provider = parseVideoProvider(block.videoUrl);
    if (!provider) return;
    if (!block.embedOptions) block.embedOptions = {};
    const { openEmbedSettingsDialog } = await import("./embedSettingsDialog.js");
    openEmbedSettingsDialog({
      provider,
      options: block.embedOptions,
      onChange: () => { refreshPreview(); onChange(); },
    });
  };

  function commit() {
    block.videoUrl = urlInput.value.trim();
    errorMsg.style.display = block.videoUrl && !parseVideoEmbedUrl(block.videoUrl) ? "block" : "none";
    // A changed provider makes the old provider's embedOptions meaningless -
    // clear them so a leftover YouTube `rel=0` doesn't ride along on a Vimeo
    // URL (harmless at render time, but confusing in the saved data).
    const provider = parseVideoProvider(block.videoUrl);
    if (provider !== lastProvider) {
      block.embedOptions = {};
      lastProvider = provider;
    }
    syncAdvBtn();
    syncClosedBgModeOptions();
    refreshPreview();
    onChange();
  }
  urlInput.addEventListener("input", () => { block.videoUrl = urlInput.value.trim(); });
  urlInput.addEventListener("blur", commit);
  syncAdvBtn();

  const aspectRow = document.createElement("div");
  aspectRow.className = "color-row";
  aspectRow.style.marginTop = "0.5rem";
  const aspectLabel = document.createElement("span");
  aspectLabel.textContent = "Aspect ratio:";
  const aspectSelect = document.createElement("select");
  aspectSelect.className = "builder-select";
  aspectSelect.title = "The video player's width-to-height ratio.";
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

  // ---- Expandable mode ----------------------------------------------------
  const expToggleRow = document.createElement("div");
  expToggleRow.className = "color-row";
  expToggleRow.style.marginTop = "0.75rem";
  const expToggleLabel = document.createElement("label");
  expToggleLabel.textContent = "Expandable";
  expToggleLabel.htmlFor = `${block.blockId}-ev-expandable`;
  expToggleLabel.style.cursor = "pointer";
  expToggleLabel.style.color = "var(--builder-accent)";
  expToggleLabel.style.fontWeight = "var(--builder-weight-bold)";
  const expToggle = createToggleSwitch({
    id: `${block.blockId}-ev-expandable`,
    checked: block.expandable === true,
    tooltip: "Collapse this video to a smaller preview that expands on hover/tap instead of playing inline at full size.",
    onChange: () => {
      block.expandable = expToggle.checked;
      if (block.expandable) ensureExpandableVideoDefaults(block);
      syncExpandableVisibility();
      refreshPreview();
      onChange();
    },
  });
  expToggleRow.append(expToggleLabel, expToggle);
  wrap.appendChild(expToggleRow);

  const expFields = document.createElement("div");
  expFields.style.flexDirection = "column";
  // No gap here - every row appended below carries .color-row, whose own
  // margin-bottom is already this same 0.6rem (css/builder.css, "the
  // single source of truth for row spacing"). A gap on top of that
  // doubled every row's spacing - same bug as js/modules/expandableMode.js's
  // Static/Expandable Mode Settings containers.
  expFields.style.marginTop = "0.6rem";
  wrap.appendChild(expFields);

  // Collapsed height
  const { row: collapsedHeightRow, input: collapsedHeightInput } = createValueControl({
    id: `${block.blockId}-ev-collapsedHeight`,
    label: "Collapsed Height (px):",
    value: block.collapsedHeight ?? EXPANDABLE_VIDEO_FIELD_DEFAULTS.collapsedHeight,
    min: 60,
    max: 400,
    step: 5,
    unit: "px",
    tooltip: "Height of the block before it expands on hover",
  });
  collapsedHeightInput.addEventListener("input", () => {
    const val = parseInt(collapsedHeightInput.value, 10);
    if (!isNaN(val)) block.collapsedHeight = val;
  });
  collapsedHeightInput.addEventListener("change", () => { refreshPreview(); onChange(); });
  expFields.appendChild(collapsedHeightRow);

  // Closed background source
  const closedBgModeRow = document.createElement("div");
  closedBgModeRow.className = "color-row";
  const closedBgModeLabel = document.createElement("span");
  closedBgModeLabel.textContent = "Collapsed background:";
  const closedBgModeSelect = document.createElement("select");
  closedBgModeSelect.className = "builder-select";
  closedBgModeSelect.title = "What's shown behind the collapsed video before it's expanded.";
  closedBgModeSelect.onchange = () => {
    block.closedBgMode = closedBgModeSelect.value;
    syncExpandableVisibility();
    refreshPreview();
    onChange();
  };
  closedBgModeRow.append(closedBgModeLabel, closedBgModeSelect);
  expFields.appendChild(closedBgModeRow);

  function syncClosedBgModeOptions() {
    // YouTube and Cloudflare Stream both expose a static thumbnail URL
    // (parseVideoThumbnailUrl); Vimeo doesn't, so it's custom-image only.
    const hasThumb = ["youtube", "stream"].includes(parseVideoProvider(block.videoUrl));
    const current = block.closedBgMode || (hasThumb ? "thumbnail" : "custom");
    closedBgModeSelect.innerHTML = "";
    const options = hasThumb
      ? [["thumbnail", "Video thumbnail"], ["custom", "Custom image"], ["none", "None"]]
      : [["custom", "Custom image"], ["none", "None"]];
    for (const [value, text] of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      closedBgModeSelect.appendChild(opt);
    }
    // A block set to "thumbnail" whose URL no longer has one - fall back to
    // custom so the control never lies about what renders.
    const resolved = !hasThumb && current === "thumbnail" ? "custom" : current;
    closedBgModeSelect.value = resolved;
    if (block.expandable) block.closedBgMode = resolved;
  }

  // Custom collapsed image
  const { row: closedImageRow, input: closedImageInput } = createUrlInputRow({
    id: `${block.blockId}-ev-closedBgImage`,
    label: "Collapsed Image:",
    value: block.closedBgImage || "",
    placeholder: "Paste an image URL or select from Media Library",
    tooltip: "Custom image shown behind the collapsed video, used when Collapsed Background is set to Custom image.",
    pickerOptions: {
      directory: "assets/images/page-blocks",
      extensions: IMAGE_PICKER_EXTENSIONS,
      title: "Select Collapsed Image",
    },
  });
  closedImageInput.addEventListener("input", () => { block.closedBgImage = closedImageInput.value; });
  closedImageInput.addEventListener("blur", () => { refreshPreview(); onChange(); });
  expFields.appendChild(closedImageRow);

  // Colour tint over the collapsed background (colour + alpha), gated by its
  // own enable toggle - same row shape as the reel builder's "Idle Overlay
  // Colour" (js/modules/expandableMode.js's createColorPickerRow()): label
  // becomes a <label for> the toggle, toggle sits between it and the swatch,
  // swatch dims + disables when off. Fades away as the block expands.
  const overlayTintRow = document.createElement("div");
  overlayTintRow.className = "color-row";
  const overlayTintLabel = document.createElement("label");
  overlayTintLabel.textContent = "Overlay Colour:";
  overlayTintLabel.htmlFor = `${block.blockId}-ev-overlayTintEnabled`;
  overlayTintLabel.style.cursor = "pointer";
  overlayTintRow.appendChild(overlayTintLabel);

  const overlayTintPickr = createColorPickrButton(
    block.closedOverlayColor || "rgba(0, 0, 0, 0.35)",
    (value) => { block.closedOverlayColor = value; refreshPreview(); onChange(); },
    toolbarPickrInstances,
    { opacity: true },
  );
  overlayTintPickr.btn.title = "Colour tint over the collapsed background; fades away as the block expands.";
  overlayTintPickr.btn.setAttribute("aria-label", "Collapsed overlay colour");

  function applyOverlayTintEnabled() {
    const on = block.closedOverlayColorEnabled === true;
    overlayTintPickr.btn.disabled = !on;
    overlayTintPickr.btn.style.opacity = on ? "1" : "0.5";
  }

  const overlayTintToggle = createToggleSwitch({
    id: `${block.blockId}-ev-overlayTintEnabled`,
    checked: block.closedOverlayColorEnabled === true,
    tooltip: "Show the colour tint over the collapsed background.",
    onChange: () => {
      block.closedOverlayColorEnabled = overlayTintToggle.checked;
      applyOverlayTintEnabled();
      refreshPreview();
      onChange();
    },
  });
  overlayTintRow.appendChild(overlayTintToggle);
  overlayTintRow.appendChild(overlayTintPickr.btn);
  applyOverlayTintEnabled();
  expFields.appendChild(overlayTintRow);

  // Background blur
  const { row: closedBlurRow, input: closedBlurInput } = createValueControl({
    id: `${block.blockId}-ev-closedBgBlur`,
    label: "Background Blur (px):",
    value: block.closedBgBlur ?? EXPANDABLE_VIDEO_FIELD_DEFAULTS.closedBgBlur,
    min: 0,
    max: 50,
    step: 1,
    unit: "px",
    tooltip: "Blur applied to the collapsed background image; animates away on expand",
  });
  closedBlurInput.addEventListener("input", () => {
    const val = parseInt(closedBlurInput.value, 10);
    if (!isNaN(val)) block.closedBgBlur = val;
  });
  closedBlurInput.addEventListener("change", () => { refreshPreview(); onChange(); });
  expFields.appendChild(closedBlurRow);

  // Overlay mode
  const overlayModeRow = document.createElement("div");
  overlayModeRow.className = "color-row";
  const overlayModeLabel = document.createElement("span");
  overlayModeLabel.textContent = "Overlay:";
  const overlayModeSelect = document.createElement("select");
  overlayModeSelect.className = "builder-select";
  overlayModeSelect.title = "What's shown on top of the collapsed video: nothing, an image, or text.";
  [["none", "None"], ["image", "Image"], ["text", "Text"]].forEach(([v, text]) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = text;
    overlayModeSelect.appendChild(opt);
  });
  overlayModeSelect.onchange = () => {
    block.overlayMode = overlayModeSelect.value;
    syncExpandableVisibility();
    refreshPreview();
    onChange();
  };
  overlayModeRow.append(overlayModeLabel, overlayModeSelect);
  expFields.appendChild(overlayModeRow);

  // Overlay image
  const { row: overlayImageRow, input: overlayImageInput } = createUrlInputRow({
    id: `${block.blockId}-ev-overlayImage`,
    label: "Overlay Image:",
    value: block.overlayImage || "",
    placeholder: "Paste an image URL or select from Media Library",
    tooltip: "Image shown on top of the collapsed video, used when Overlay is set to Image.",
    pickerOptions: {
      directory: "assets/images/page-blocks",
      extensions: IMAGE_PICKER_EXTENSIONS,
      title: "Select Overlay Image",
    },
  });
  overlayImageInput.addEventListener("input", () => { block.overlayImage = overlayImageInput.value; });
  overlayImageInput.addEventListener("blur", () => { refreshPreview(); onChange(); });
  expFields.appendChild(overlayImageRow);

  // Overlay text: the full text-block WYSIWYG editor (multi-line, headings,
  // B/I/U, alignment, inline font/size/colour), bound to a nested sub-block
  // so createTextConfig() needs no changes - it only ever touches
  // bodyHtml / alignment / blockId on whatever object it's handed. Built
  // lazily the first time Overlay = Text is selected. The old single-line
  // block.overlayText (+ overlay* style fields) is still rendered as a
  // fallback for blocks saved before this - see decorateExpandableVideo().
  const overlayTextSlot = document.createElement("div");
  expFields.appendChild(overlayTextSlot);
  let overlayTextBuilt = false;
  function ensureOverlayTextEditor() {
    if (overlayTextBuilt) return;
    overlayTextBuilt = true;
    if (!block.overlayTextBlock) {
      // One-time migration, same idea as initialEditableHtml()'s legacy-
      // field seed for the real text block: a block saved with the old
      // single-line overlayText (pre-rich-editor) gets that text carried
      // into bodyHtml, rather than opening this editor blank. This matters
      // beyond cosmetics - decorateExpandableVideo() only takes the rich
      // render path (with line-height/weight/etc. support) when bodyHtml is
      // non-empty; leaving it blank here meant every edit made in this
      // editor (Line spacing included) was silently applied to a field the
      // renderer never looked at, because it was still rendering the old
      // overlayText through the legacy <span> path (fixed line-height,
      // no per-role sizing) underneath.
      let bodyHtml = "";
      if (block.overlayText) {
        const p = document.createElement("p");
        p.textContent = block.overlayText;
        bodyHtml = p.outerHTML;
      }
      block.overlayTextBlock = { blockId: `${block.blockId}-ovl`, bodyHtml, alignment: "center" };
    }
    overlayTextSlot.appendChild(
      createTextConfig(block.overlayTextBlock, page, () => { refreshPreview(); onChange(); }, refreshPreview, { editableClass: "ev-overlay-text-editable" })
    );
  }

  function syncExpandableVisibility() {
    const on = block.expandable === true;
    expFields.style.display = on ? "flex" : "none";
    if (!on) return;
    syncClosedBgModeOptions();
    const mode = block.closedBgMode || "thumbnail";
    closedImageRow.style.display = mode === "custom" ? "" : "none";
    const overlay = block.overlayMode || "none";
    overlayImageRow.style.display = overlay === "image" ? "" : "none";
    if (overlay === "text") ensureOverlayTextEditor();
    overlayTextSlot.style.display = overlay === "text" ? "" : "none";
  }

  // Seed the overlay-mode select from saved state, then apply visibility.
  overlayModeSelect.value = block.overlayMode || "none";
  syncExpandableVisibility();

  return wrap;
}

function createButtonConfig(block, page, onChange, refreshPreview) {
  const wrap = document.createElement("div");

  const labelRow = document.createElement("div");
  labelRow.className = "color-row";
  const labelLabel = document.createElement("span");
  labelLabel.textContent = "Label:";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = block.label || "";
  labelInput.placeholder = "Click Here";
  labelInput.title = "The text shown on the button.";
  labelInput.style.cssText = "flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";
  labelInput.oninput = () => { block.label = labelInput.value; };
  labelInput.onblur = () => { refreshPreview(); onChange(); };
  labelRow.append(labelLabel, labelInput);
  wrap.appendChild(labelRow);

  const urlRow = document.createElement("div");
  urlRow.className = "color-row";
  urlRow.style.marginTop = "0.5rem";
  const urlLabel = document.createElement("span");
  urlLabel.textContent = "Link URL:";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.value = block.url || "";
  urlInput.placeholder = "https://example.com";
  urlInput.title = "Where clicking the button leads - opens in a new tab.";
  urlInput.style.cssText = "flex:1;padding:0.5rem;border:1px solid #444;border-radius:4px;font-size:var(--builder-text-md);background:#1e1e1e;color:#fff;";
  // Always opens in a new tab (renderButtonBlock() sets target="_blank"
  // unconditionally, no per-block toggle) - the scheme is normalized the
  // same way the toolbar's own link button does, so a pasted "example.com"
  // still becomes a real, followable https:// URL rather than a broken
  // page-relative one.
  urlInput.oninput = () => { block.url = urlInput.value; };
  urlInput.onblur = () => {
    const trimmed = urlInput.value.trim();
    block.url = trimmed && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? `https://${trimmed}` : trimmed;
    urlInput.value = block.url;
    refreshPreview();
    onChange();
  };
  urlRow.append(urlLabel, urlInput);
  wrap.appendChild(urlRow);

  // Same icon-toggle-group/.align-icon pattern the text block's own
  // alignment control uses (createTextConfig() above), plus a third
  // "right" option - a single button has no equivalent to text's natural
  // ragged-right reading flow, so right-alignment is a genuinely useful
  // placement here in a way it isn't for a paragraph.
  const alignRow = document.createElement("div");
  alignRow.className = "color-row";
  alignRow.style.marginTop = "0.5rem";
  const alignLabel = document.createElement("span");
  alignLabel.textContent = "Alignment:";
  alignRow.appendChild(alignLabel);
  const alignGroup = document.createElement("span");
  alignGroup.className = "icon-toggle-group";
  const alignIcons = {};
  [["left", "format_align_left", "Left"], ["center", "format_align_center", "Center"], ["right", "format_align_right", "Right"]].forEach(([value, glyph, title]) => {
    const icon = document.createElement("span");
    icon.className = "align-icon";
    icon.title = title;
    icon.innerHTML = `<span class="material-symbols-outlined">${glyph}</span>`;
    icon.onclick = () => {
      block.alignment = value;
      updateAlignIcons();
      refreshPreview();
      onChange();
    };
    alignIcons[value] = icon;
    alignGroup.appendChild(icon);
  });
  alignRow.appendChild(alignGroup);
  wrap.appendChild(alignRow);

  function updateAlignIcons() {
    const align = block.alignment || "center";
    Object.entries(alignIcons).forEach(([value, icon]) => icon.classList.toggle("active", align === value));
  }
  updateAlignIcons();

  // Text Style (js/modules/pageTextStyles.js's ASSIGNABLE_TEXT_ROLES, the
  // same h1/h2/h3/body/link set the Customize Text Styles dialog edits)
  // plus - only when "Custom" - Font/Size/Weight/Color, laid out as one
  // compact toolbar row via the shared createTextStyleToolbar()
  // (js/modules/styleToolbarWidgets.js - also used by the reel player's
  // Title/Track Name config), rather than a stack of full-width labeled
  // rows like the rest of this block's config. Assigning a role drives
  // Font/Size/Weight/Color all together via renderButtonBlock()/page.css,
  // tracking the same page-wide edits a real h1/h2/h3/p/a would - so
  // those four controls are meaningless (and hidden) once a role's chosen.
  const { toolbar: styleToolbar } = createTextStyleToolbar({
    idPrefix: `${block.blockId}-button`,
    roleDefs: page?.textStyleDefs,
    getRole: () => block.textStyleRole,
    setRole: (role) => { block.textStyleRole = role; },
    getFontFamily: () => block.fontFamily,
    setFontFamily: (value) => { block.fontFamily = value; },
    getFontSize: () => block.fontSize,
    setFontSize: (value) => { block.fontSize = value; },
    getFontWeight: () => block.fontWeight,
    setFontWeight: (value) => { block.fontWeight = value; },
    getColor: () => block.textColor,
    setColor: (value) => { block.textColor = value; },
    pickrInstances: toolbarPickrInstances,
    onCommit: () => { refreshPreview(); onChange(); },
  });
  wrap.appendChild(styleToolbar);

  // Independent of the label's own text styling (role or custom) - a
  // button's fill color isn't part of any text role, so this stays
  // visible and editable regardless of the Text Style choice above.
  const bgRow = document.createElement("div");
  bgRow.className = "color-row";
  bgRow.style.marginTop = "0.5rem";
  const bgLabel = document.createElement("span");
  bgLabel.textContent = "Background:";
  bgRow.appendChild(bgLabel);
  const bgPickr = createColorPickrButton(block.backgroundColor || "#4a90e2", (hex) => {
    block.backgroundColor = hex;
    refreshPreview();
    onChange();
  }, toolbarPickrInstances);
  bgPickr.btn.title = "The button's fill color.";
  bgPickr.btn.setAttribute("aria-label", "Button background color");
  bgRow.appendChild(bgPickr.btn);
  wrap.appendChild(bgRow);

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
