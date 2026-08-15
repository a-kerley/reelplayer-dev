// styleToolbarWidgets.js - Shared UI-building blocks for a compact "Text
// Style" toolbar (role dropdown + conditional Font/Size/Weight/Color), and
// the smaller widgets it's built from (dropdown-menu button, toolbar
// divider, Pickr color swatch, font-preview menu items). Used by both
// js/modules/pageBlocksEditor.js's button block config and
// js/modules/playerTextStyles.js's reel Title/Track Name config - broken
// out here specifically so a UI pattern used across two independent
// builder domains (page blocks, reel player) isn't hand-copied a second
// or third time.
import { createValueControl } from "./valueControl.js";
import { openContextMenu } from "./contextMenu.js";
import { ROLE_LABELS, TEXT_FONT_OPTIONS, FONT_WEIGHT_OPTIONS, ASSIGNABLE_TEXT_ROLES, ROLE_DEFAULT_SIZE_PX, ROLE_DEFAULT_WEIGHT, ROLE_DEFAULT_COLOR, ensureInlineGoogleFont } from "./pageTextStyles.js";

const TEXT_COLOR_SWATCHES = ["#ffffff", "#000000", "#4a90e2", "#dc3545", "#219e36", "#f4cd2a"];

// Renders as the same small square .pickr-button used throughout the reel
// builder (css/builder.css), opening the same nano-themed Pickr popup -
// instead of a plain native <input type="color">. Pickr needs the button
// actually attached to the DOM to position/measure its popup, so creation
// is deferred a tick (same setTimeout(...,0) "DOM readiness" pattern
// colorPicker.js uses), after the caller has synchronously appended the
// returned .btn to the document.
export function createColorPickrButton(initialColor, onApply, instanceList) {
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

export function createToolbarDivider() {
  const divider = document.createElement("span");
  divider.className = "page-block-toolbar-divider";
  return divider;
}

// A menu-trigger button styled like the builder's segmented value-control
// spinners (css/builder.css's .value-control-number/.value-control-spin) -
// a bordered, dark label segment plus a distinct chevron segment on the
// right - rather than a plain solid-accent action button, so it visually
// reads as "opens a dropdown" the same way the rest of the builder's
// dropdown-shaped controls do. js/modules/contextMenu.js still supplies
// the actual menu popup - this only changes the trigger's look.
export function createDropdownMenuButton(label, icon = "") {
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
// reflect the current selection's actual style/font back into the menu
// buttons.
export function setDropdownLabel(btn, text) {
  const labelText = btn.querySelector(".dropdown-menu-btn-label-text");
  if (labelText) labelText.textContent = text;
}

// Shared by every Font dropdown menu (text block toolbar, button block,
// reel player Title/Track Name) - each item previews in its own actual
// typeface (openContextMenu()'s optional `style`), so picking a font is a
// real visual choice, not just reading a name off a list. Preloads every
// option's Google Font stylesheet up front (not just the one eventually
// picked) so those previews render correctly the moment the menu opens
// rather than reflowing into place as each stylesheet finishes loading;
// ensureInlineGoogleFont() is additive/idempotent (see pageTextStyles.js),
// so calling it for every option on every menu open is cheap and never
// re-fetches an already-loaded font.
export function fontMenuItems(onPick) {
  TEXT_FONT_OPTIONS.forEach((f) => ensureInlineGoogleFont(f.value));
  return TEXT_FONT_OPTIONS.map((f) => ({
    label: f.label,
    style: `font-family: ${f.stack};`,
    onClick: () => onPick(f),
  }));
}

function fontLabelFor(value) {
  return (TEXT_FONT_OPTIONS.find((f) => f.value === value) || TEXT_FONT_OPTIONS[0]).label;
}

// createTextStyleToolbar()'s own role menu, same preview treatment as
// fontMenuItems() above (js/modules/pageBlocksEditor.js's text block
// "Apply style..." menu does the identical thing for its own, separate
// role picker - see that file's styleMenuItems()). "Custom" has no role
// to preview (it means "use the Font/Size/Weight/Color controls below
// instead"), so it's left as a plain label.
//
// `page` is optional - the button block (js/modules/pageBlocksEditor.js's
// createButtonConfig()) has a real page.textStyleDefs to preview against,
// but a reel's Title/Track Name/Playlist toolbar (js/modules/
// playerTextStyles.js) has no page context at all (a reel isn't tied to
// any one page - see that file's own header comment), so it's simply
// omitted there and every role preview falls back to ROLE_DEFAULT_*.
export function roleMenuItems(page, onPick) {
  return [
    { label: "Custom", onClick: () => onPick(undefined) },
    ...ASSIGNABLE_TEXT_ROLES.map((role) => {
      const def = page?.textStyleDefs?.[role] || {};
      const font = TEXT_FONT_OPTIONS.find((f) => f.value === def.fontFamily);
      const styleParts = [
        `font-size:${def.fontSize || ROLE_DEFAULT_SIZE_PX[role]}px`,
        `font-weight:${def.fontWeight || ROLE_DEFAULT_WEIGHT[role]}`,
        `color:${def.color || ROLE_DEFAULT_COLOR[role]}`,
      ];
      if (font) styleParts.push(`font-family:${font.stack}`);
      return { label: ROLE_LABELS[role], style: styleParts.join(";"), onClick: () => onPick(role) };
    }),
  ];
}

/**
 * The full "Text Style" toolbar row: a role dropdown (Custom + every
 * ASSIGNABLE_TEXT_ROLES entry) plus, only when "Custom", Font/Size/
 * Weight/Color controls - hidden entirely once a role's picked, since a
 * role drives all four together elsewhere (page.css's --page-text-{role}
 * vars, or player.css's --reel-title/--reel-track vars, depending on
 * caller).
 *
 * Every field is read/written via a getter/setter pair rather than one
 * fixed object shape, since callers store this data differently - page
 * blocks keep it flat on the block (block.textStyleRole, block.fontFamily,
 * ...), reel player units are nested under reel.playerTextStyles.{title,
 * trackName} - so this stays agnostic to both. `onCommit` is called after
 * every change (the caller's own refreshPreview()+onChange() combo).
 *
 * @returns {{toolbar: HTMLElement}}
 */
export function createTextStyleToolbar({
  idPrefix,
  page,
  getRole, setRole,
  getFontFamily, setFontFamily,
  getFontSize, setFontSize,
  getFontWeight, setFontWeight,
  getColor, setColor,
  pickrInstances,
  onCommit,
}) {
  const toolbar = document.createElement("div");
  toolbar.className = "text-style-toolbar";

  const styleBtn = createDropdownMenuButton(getRole() ? ROLE_LABELS[getRole()] : "Custom");
  styleBtn.onclick = () => {
    openContextMenu(styleBtn, roleMenuItems(page, selectRole));
  };
  toolbar.appendChild(styleBtn);
  toolbar.appendChild(createToolbarDivider());

  function selectRole(role) {
    setRole(role);
    setDropdownLabel(styleBtn, role ? ROLE_LABELS[role] : "Custom");
    updateVisibility();
    onCommit();
  }

  // Only meaningful (and only shown) when the role is "Custom" - see
  // above for why a role makes these redundant.
  const customControls = [];

  const fontBtn = createDropdownMenuButton(fontLabelFor(getFontFamily()));
  fontBtn.classList.add("font-picker-btn");
  fontBtn.onclick = () => {
    openContextMenu(fontBtn, fontMenuItems((f) => {
      setFontFamily(f.value === "system" ? undefined : f.value);
      setDropdownLabel(fontBtn, f.label);
      onCommit();
    }));
  };
  toolbar.appendChild(fontBtn);
  customControls.push(fontBtn);

  // Same segmented number+spin control (and slider-suppression, see
  // .text-style-toolbar-size-control in builder.css) as the Customize
  // Text Styles dialog's own per-role Size field.
  const sizeControl = createValueControl({
    id: `${idPrefix}-fontSize`,
    label: "",
    value: getFontSize() || 16,
    min: 8,
    max: 96,
    step: 1,
    unit: "px",
  });
  sizeControl.control.classList.add("text-style-toolbar-size-control");
  sizeControl.input.addEventListener("input", () => {
    const val = parseInt(sizeControl.input.value, 10);
    setFontSize(!isNaN(val) ? val : undefined);
    onCommit();
  });
  toolbar.appendChild(sizeControl.control);
  customControls.push(sizeControl.control);

  const weightBtn = createDropdownMenuButton(getFontWeight() || "600");
  weightBtn.onclick = () => {
    openContextMenu(weightBtn, FONT_WEIGHT_OPTIONS.map((w) => ({
      label: w,
      style: `font-weight: ${w};`,
      onClick: () => {
        setFontWeight(w);
        setDropdownLabel(weightBtn, w);
        onCommit();
      },
    })));
  };
  toolbar.appendChild(weightBtn);
  customControls.push(weightBtn);

  // Wrapped in a persistent <span>, and visibility toggled on THAT rather
  // than on colorPickr.btn directly - createColorPickrButton() returns btn
  // synchronously, but Pickr.create() (inside it) runs one tick later
  // (setTimeout(...,0)) and, once it does, replaces btn in the live DOM
  // with its own new .pickr wrapper - see that function's own comment.
  // Toggling display on the original btn reference races that swap: if a
  // role was already selected before Pickr's callback fires (e.g. on
  // initial render of an already-configured unit), display:none lands on
  // the soon-to-be-discarded original element, and Pickr's replacement - a
  // brand new element with no such style - stays visibly showing
  // regardless. A wrapper span survives the swap since Pickr only ever
  // touches its child, not the wrapper itself.
  const colorWrap = document.createElement("span");
  const colorPickr = createColorPickrButton(getColor() || "#ffffff", (hex) => {
    setColor(hex);
    onCommit();
  }, pickrInstances);
  colorPickr.btn.title = "Text color";
  colorWrap.appendChild(colorPickr.btn);
  toolbar.appendChild(colorWrap);
  customControls.push(colorWrap);

  function updateVisibility() {
    const hasRole = !!getRole();
    customControls.forEach((el) => { el.style.display = hasRole ? "none" : ""; });
  }
  updateVisibility();

  return { toolbar };
}
