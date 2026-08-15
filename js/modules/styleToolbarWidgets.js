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
import { dialog } from "./dialogSystem.js";
import { ROLE_LABELS, TEXT_FONT_OPTIONS, WEIGHT_LABELS, fontWeightsFor, ASSIGNABLE_TEXT_ROLES, ROLE_DEFAULT_SIZE_PX, ROLE_DEFAULT_WEIGHT, ROLE_DEFAULT_COLOR, ensureInlineGoogleFont } from "./pageTextStyles.js";

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

// Name only ("Bold"), not "700 Bold" - the number was redundant once every
// dropdown already shows the weight visually (each menu item previews
// itself at that actual font-weight), and dropping it shortens every
// label enough that .weight-picker-btn's fixed width rarely needs to
// truncate anything. Falls back to the raw number for a stored value with
// no standard name (WEIGHT_LABELS only covers the 9 round-hundred
// OpenType classes) - only reachable here for a Google Font weight list
// that somehow included a non-standard value, since the free-typing
// spinner (system/serif/mono) never calls this at all.
function weightLabelFor(weight) {
  const w = weight || "400";
  return WEIGHT_LABELS[w] || w;
}

// A Weight control that adapts to whatever font is currently selected -
// system/serif/mono have no fixed weight list (no Google Fonts request at
// all backs them - see fontWeightsFor()/TEXT_FONT_OPTIONS' own comment,
// pageTextStyles.js), so the browser will render, or synthetically bold,
// whatever numeric value it's given; a free-typing spinner (same
// createValueControl() widget Size uses) fits that. A Google Font, though,
// was only ever actually requested at specific static weights - anything
// else either silently falls back to Google's own nearest match or (for a
// weight the family doesn't ship at all) fails to apply - so those get a
// dropdown restricted to exactly that font's real list instead, each
// labeled with its standard OpenType name (WEIGHT_LABELS).
//
// Returned as {control, refresh} rather than a single static element -
// which mode applies depends on getFontFamily(), which this control has
// no way to be notified of changing on its own; the caller (e.g.
// createTextStyleToolbar()'s Font menu onPick below) calls refresh()
// itself right after a font change, rebuilding control's contents in
// place so the wrapper element callers already appended stays valid.
export function createWeightControl({ idPrefix, getFontFamily, getWeight, setWeight, onCommit }) {
  const wrap = document.createElement("span");
  wrap.className = "weight-control-wrap";

  function render() {
    wrap.innerHTML = "";
    const weights = fontWeightsFor(getFontFamily());
    let current = getWeight() || "400";

    // A weight stored while a *different* font was selected (or before
    // switching to one with a narrower list - e.g. Lato only ships 300/
    // 400/700) may no longer be one this font actually has. Snapping to
    // the closest real value here - not just displaying a fallback label -
    // keeps what's stored in sync with what the dropdown shows, the same
    // "don't let it silently drift" reasoning behind this whole control.
    if (weights && !weights.includes(current)) {
      current = weights.reduce((closest, w) => (Math.abs(w - current) < Math.abs(closest - current) ? w : closest));
      setWeight(current);
      onCommit();
    }

    if (weights) {
      const btn = createDropdownMenuButton(weightLabelFor(current));
      btn.classList.add("weight-picker-btn");
      // The numeric value's still one hover away, now that the label
      // itself only shows the name.
      btn.title = current;
      btn.onclick = () => {
        openContextMenu(btn, weights.map((w) => ({
          label: weightLabelFor(w),
          style: `font-weight: ${w};`,
          onClick: () => {
            setWeight(w);
            setDropdownLabel(btn, weightLabelFor(w));
            btn.title = w;
            onCommit();
          },
        })));
      };
      wrap.appendChild(btn);
    } else {
      const control = createValueControl({
        id: `${idPrefix}-fontWeight`,
        label: "",
        value: parseInt(current, 10) || 400,
        min: 100,
        max: 900,
        step: 100,
      });
      control.control.classList.add("weight-control-spinner");
      // createValueControl() sizes the input to its own digit count
      // (measureWidth() in valueControl.js) via an inline style - cleared
      // here so css/builder.css's .weight-control-spinner rules can size
      // it to fill .weight-control-wrap's fixed width instead, the same
      // full-width look the dropdown-menu-btn mode above already has.
      control.input.style.width = "";
      control.input.addEventListener("input", () => {
        const val = parseInt(control.input.value, 10);
        setWeight(!isNaN(val) ? String(val) : undefined);
        onCommit();
      });
      wrap.appendChild(control.control);
    }
  }

  render();
  return { control: wrap, refresh: render };
}

// createTextStyleToolbar()'s own role menu, same preview treatment as
// fontMenuItems() above (js/modules/pageBlocksEditor.js's text block
// "Apply style..." menu does the identical thing for its own, separate
// role picker - see that file's styleMenuItems()). "Custom" has no role
// to preview (it means "use the Font/Size/Weight/Color controls below
// instead"), so it's left as a plain label.
//
// `defs` is optional and, when given, a plain per-role bag like
// page.textStyleDefs or reel.playerTextStyles.roleFallbacks - the button
// block (js/modules/pageBlocksEditor.js's createButtonConfig()) passes the
// former, the reel builder's Title/Track Name/Playlist toolbar (js/modules/
// playerTextStyles.js) passes the latter (a reel isn't tied to any one
// page, so it has no page.textStyleDefs to preview against at all - see
// that file's own header comment), so each preview reflects whichever
// defs object actually governs that toolbar's own "inherit" resolution.
// Omitted entirely falls back to ROLE_DEFAULT_* for every role.
export function roleMenuItems(defs, onPick) {
  return [
    { label: "Custom", onClick: () => onPick(undefined) },
    ...ASSIGNABLE_TEXT_ROLES.map((role) => {
      const def = defs?.[role] || {};
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
 * `roleDefs` (optional) is whatever per-role bag this toolbar's own role
 * menu should preview against - see roleMenuItems()'s own comment above
 * for what each caller actually passes.
 *
 * @returns {{toolbar: HTMLElement}}
 */
export function createTextStyleToolbar({
  idPrefix,
  roleDefs,
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
    openContextMenu(styleBtn, roleMenuItems(roleDefs, selectRole));
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
      // Which weights are even offered depends on the font just picked -
      // see createWeightControl()'s own comment below.
      weightControl.refresh();
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

  const weightControl = createWeightControl({
    idPrefix,
    getFontFamily,
    getWeight: getFontWeight,
    setWeight: setFontWeight,
    onCommit,
  });
  toolbar.appendChild(weightControl.control);
  customControls.push(weightControl.control);

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

// The "Style / Font / Size / Weight / Color / Reset" table shared by
// js/modules/pageBlocksEditor.js's "Customize Text Styles" dialog
// (page.textStyleDefs) and js/modules/playerTextStyles.js's "Edit
// Fallback Text Styles" dialog (reel.playerTextStyles.roleFallbacks) -
// both edit the exact same shape (one {fontFamily?,fontSize?,fontWeight?,
// color?} bag per ASSIGNABLE_TEXT_ROLES entry), just stored on a
// different object, so this only ever touches `defs` itself and never
// needs to know which of the two it's holding.
//
// `onCommit()` is called after every field edit - each caller supplies
// its own (refreshPreview()+onChange(), plus whatever else that specific
// context needs re-applied, e.g. the page dialog's open text-block
// editors/player-block row previews, which this shared function has no
// business knowing about).
export function openTextStyleDefsDialog({ title, defs, onCommit }) {
  const pickrInstances = [];
  function destroyPickrInstances() {
    pickrInstances.forEach((p) => p.destroy());
    pickrInstances.length = 0;
  }

  // Same "you haven't touched this one" dimming + real resolved-style
  // preview as the label itself - see updateLabelStates()'s original
  // comment (pageBlocksEditor.js's git history) for the reasoning; kept
  // here now that both dialogs share this exact behavior.
  const labelRows = [];
  function updateLabelStates() {
    labelRows.forEach(({ role, def, labelTd }) => {
      labelTd.classList.toggle("customize-styles-label-default", Object.keys(def).length === 0);
      const font = TEXT_FONT_OPTIONS.find((f) => f.value === def.fontFamily);
      labelTd.style.fontSize = `${def.fontSize || ROLE_DEFAULT_SIZE_PX[role]}px`;
      labelTd.style.fontWeight = def.fontWeight || ROLE_DEFAULT_WEIGHT[role];
      labelTd.style.color = def.color || ROLE_DEFAULT_COLOR[role];
      labelTd.style.fontFamily = font ? font.stack : "";
    });
  }

  function commitAll() {
    onCommit();
    updateLabelStates();
  }

  // Font linking - session-only (not part of `defs`, so it resets every
  // time this dialog is reopened): while linked, changing any one row's
  // font immediately applies the same choice to every other visible role
  // too, for the common case of wanting one consistent typeface across
  // everything rather than setting it role-by-role.
  let fontsLinked = false;
  const fontRows = [];
  function fontLabelForValue(value) {
    return (TEXT_FONT_OPTIONS.find((f) => f.value === (value || "system")) || TEXT_FONT_OPTIONS[0]).label;
  }
  function syncLinkedFonts(value) {
    fontRows.forEach(({ def, fontBtn, weightControl }) => {
      setDropdownLabel(fontBtn, fontLabelForValue(value));
      def.fontFamily = value === "system" ? undefined : value;
      weightControl.refresh();
    });
    commitAll();
  }

  const content = document.createElement("div");
  content.style.cssText = "max-height:60vh;overflow-y:auto;";

  const table = document.createElement("table");
  // table-layout:fixed, not the default auto - auto sizes each column to
  // fit whatever its widest cell currently needs, which treats a <td>'s
  // own `width` (.text-style-defs-label's 220px, see below) as only a
  // starting suggestion it'll happily exceed for a large font-size
  // preview - exactly the "column keeps growing anyway" symptom that
  // defeated the fix. Fixed layout takes column widths from this first
  // row's <th> widths instead and holds every cell in every row to them
  // regardless of content, which is what actually makes overflow:hidden/
  // text-overflow:ellipsis below take effect.
  table.style.cssText = "width:100%;table-layout:fixed;border-collapse:collapse;font-size:var(--builder-text-base);";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th style="width:220px;text-align:left;padding:0.3rem;">Style</th>
      <th style="width:170px;text-align:center;padding:0.3rem;"><span style="display:inline-flex;align-items:center;justify-content:center;gap:0.3rem;">Font<span id="fontLinkToggleSlot"></span></span></th>
      <th style="width:90px;text-align:center;padding:0.3rem;">Size</th>
      <th style="width:110px;text-align:center;padding:0.3rem;">Weight</th>
      <th style="width:60px;text-align:center;padding:0.3rem;">Color</th>
      <th style="width:80px;padding:0.3rem;"></th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  ASSIGNABLE_TEXT_ROLES.forEach((role) => {
    if (!defs[role]) defs[role] = {};
    const def = defs[role];
    // Center-aligned to sit under their (also center-aligned) column
    // headers - Style and Reset (plain text/a button, not a field to line
    // up with a header) are left as their default alignment.
    const cellStyle = "padding:0.3rem;text-align:center;";

    const tr = document.createElement("tr");
    tr.style.borderTop = "1px solid #444";

    const labelTd = document.createElement("td");
    labelTd.className = "text-style-defs-label";
    labelTd.style.cssText = "padding:0.4rem 0.3rem;white-space:nowrap;";
    labelTd.textContent = ROLE_LABELS[role];
    tr.appendChild(labelTd);
    labelRows.push({ role, def, labelTd });

    const fontTd = document.createElement("td");
    fontTd.style.cssText = cellStyle;
    const fontBtn = createDropdownMenuButton(fontLabelForValue(def.fontFamily));
    fontBtn.classList.add("font-picker-btn");
    fontBtn.onclick = () => {
      openContextMenu(fontBtn, fontMenuItems((f) => {
        if (fontsLinked) {
          syncLinkedFonts(f.value);
        } else {
          def.fontFamily = f.value === "system" ? undefined : f.value;
          setDropdownLabel(fontBtn, f.label);
          // Which weights are even offered depends on the font just
          // picked - see createWeightControl()'s own comment.
          weightControl.refresh();
          commitAll();
        }
      }));
    };
    fontTd.appendChild(fontBtn);
    tr.appendChild(fontTd);

    const sizeTd = document.createElement("td");
    sizeTd.style.cssText = cellStyle;
    const sizeControl = createValueControl({
      id: `${role}-textStyleDefsSize`,
      label: "",
      value: def.fontSize || ROLE_DEFAULT_SIZE_PX[role],
      min: 8,
      max: 96,
      step: 1,
      unit: "px",
    });
    sizeControl.control.classList.add("customize-styles-size-control");
    sizeControl.input.addEventListener("input", () => {
      const val = parseInt(sizeControl.input.value, 10);
      def.fontSize = !isNaN(val) ? val : undefined;
      commitAll();
    });
    sizeTd.appendChild(sizeControl.control);
    tr.appendChild(sizeTd);

    const weightTd = document.createElement("td");
    weightTd.style.cssText = cellStyle;
    const weightControl = createWeightControl({
      idPrefix: `textStyleDefs-${role}`,
      getFontFamily: () => def.fontFamily,
      getWeight: () => def.fontWeight || String(ROLE_DEFAULT_WEIGHT[role]),
      setWeight: (value) => { def.fontWeight = value; },
      onCommit: commitAll,
    });
    weightTd.appendChild(weightControl.control);
    tr.appendChild(weightTd);
    fontRows.push({ def, fontBtn, weightControl });

    const colorTd = document.createElement("td");
    colorTd.style.cssText = cellStyle;
    const colorPickr = createColorPickrButton(def.color || ROLE_DEFAULT_COLOR[role], (hex) => { def.color = hex; commitAll(); }, pickrInstances);
    colorTd.appendChild(colorPickr.btn);
    tr.appendChild(colorTd);

    // A Pickr swatch/select/spinner always holds a concrete value, so
    // there's no way to "unset" any of them back to the CSS default from
    // the field alone - this clears all four fields for the row at once
    // instead of adding a separate per-field reset control for just one
    // property.
    const resetTd = document.createElement("td");
    resetTd.style.cssText = "padding:0.3rem;";
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
      // Mutate `def` in place rather than replacing defs[role] with a new
      // object - every control's onchange closure above captured this
      // exact `def` reference, so reassigning would silently orphan them
      // from then on.
      Object.keys(def).forEach((key) => delete def[key]);
      setDropdownLabel(fontBtn, fontLabelForValue(undefined));
      sizeControl.input.value = ROLE_DEFAULT_SIZE_PX[role];
      weightControl.refresh();
      colorPickr.reset(ROLE_DEFAULT_COLOR[role]);
      commitAll();
    };
    resetTd.appendChild(resetBtn);
    tr.appendChild(resetTd);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  content.appendChild(table);
  updateLabelStates();

  dialog.createDialog({
    type: "custom",
    message: title,
    content: '<div id="textStyleDefsSlot"></div>',
    buttons: [{ text: "Done", type: "primary", onClick: () => { destroyPickrInstances(); dialog.closeDialog(); } }],
    // Wide enough for the table's own fixed column widths (thead's own
    // inline widths above, table-layout:fixed) plus dialogSystem.js's 24px
    // content padding on each side, with a little headroom - too tight a
    // match here is exactly what forced a horizontal scrollbar in past
    // the table's real rendered width (each column's padding adds to its
    // th's declared width, so the table always ends up a bit wider than
    // the raw column-width sum).
    maxWidth: "860px",
  });
  // createDialog's `content` option only innerHTML's an HTML string - these
  // rows need real onchange handlers, so an empty placeholder slot is
  // filled with the real DOM built above once the dialog shell exists
  // (same technique as the block-presets manager dialog).
  document.getElementById("textStyleDefsSlot")?.appendChild(content);

  // Font link-toggle button - built after the dialog shell exists, same
  // reason as the slot pattern just above: needs to be a real element with
  // a real click handler, not part of thead's innerHTML string.
  const fontLinkToggle = document.createElement("span");
  fontLinkToggle.className = "format-icon";
  fontLinkToggle.title = "Link font across all styles";
  fontLinkToggle.innerHTML = `<span class="material-symbols-outlined">link</span>`;
  fontLinkToggle.onclick = () => {
    fontsLinked = !fontsLinked;
    fontLinkToggle.classList.toggle("active", fontsLinked);
    fontLinkToggle.title = fontsLinked ? "Unlink font per style" : "Link font across all styles";
    if (fontsLinked && fontRows.length) syncLinkedFonts(fontRows[0].def.fontFamily || "system");
  };
  document.getElementById("fontLinkToggleSlot")?.replaceWith(fontLinkToggle);
}
