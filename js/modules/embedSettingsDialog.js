// embedSettingsDialog.js - the "Advanced Embed Settings" cog dialog for a
// page's embedded-video block (js/modules/pageBlocksEditor.js's
// createEmbeddedVideoConfig()). Edits block.embedOptions, a flat object the
// URL builders in pageBlockRenderer.js consume; an absent key = that
// provider's own default, so a block that never opens this dialog produces
// exactly the same iframe src it always did.
//
// Live: every control mutates `options` in place and calls onChange()
// immediately (which re-renders the preview - and thus reloads the embed
// iframe - on each change, matching the rest of the block editor).

import { dialog } from "./dialogSystem.js";
import { createToggleSwitch } from "./domUtils.js";
import { createValueControl } from "./valueControl.js";
import { createColorPickrButton } from "./styleToolbarWidgets.js";

// defaultOn: the value that matches the provider's own default (so it's
// stored as "absent"). A toggle at its default deletes its key; otherwise
// it writes the opposite boolean.
const OPTION_SPECS = {
  // Deliberately excludes annotations (iv_load_policy) - YouTube retired
  // annotations entirely in 2019 - and the red/white progress bar (color) -
  // still in Google's docs but the current player ignores it.
  youtube: [
    { kind: "toggle", key: "controls", label: "Player controls", defaultOn: true, tooltip: "Show YouTube's built-in play/pause, seek, and volume controls." },
    { kind: "toggle", key: "fullscreenButton", label: "Fullscreen button", defaultOn: true, tooltip: "Show the fullscreen button in the player controls." },
    { kind: "toggle", key: "keyboardControls", label: "Keyboard shortcuts", defaultOn: true, tooltip: "Allow keyboard shortcuts (space, arrows) to control playback." },
    { kind: "toggle", key: "captionsDefault", label: "Captions on by default", defaultOn: false, tooltip: "Turn on closed captions automatically when the video loads." },
    { kind: "toggle", key: "relChannelOnly", label: "Limit end-screen videos to this channel", defaultOn: false, tooltip: "Restrict the end-screen 'related videos' to this same channel, not any channel." },
    { kind: "toggle", key: "playsInline", label: "Play inline on iOS (no forced fullscreen)", defaultOn: false, tooltip: "Play within the page on iOS Safari instead of forcing fullscreen." },
    { kind: "number", key: "startTime", label: "Start at (sec)", min: 0, max: 86400, tooltip: "Second in the video playback starts from." },
    { kind: "number", key: "endTime", label: "End at (sec)", min: 0, max: 86400, tooltip: "Second in the video playback stops at." },
  ],
  vimeo: [
    { kind: "toggle", key: "controls", label: "Player controls", defaultOn: true, tooltip: "Show Vimeo's built-in play/pause, seek, and volume controls." },
    { kind: "toggle", key: "title", label: "Title", defaultOn: true, tooltip: "Show the video's title over the player." },
    { kind: "toggle", key: "byline", label: "Byline", defaultOn: true, tooltip: "Show the uploader's name over the player." },
    { kind: "toggle", key: "portrait", label: "Uploader avatar", defaultOn: true, tooltip: "Show the uploader's avatar over the player." },
    { kind: "toggle", key: "doNotTrack", label: "Do not track", defaultOn: false, tooltip: "Block Vimeo from setting tracking cookies for this embed." },
    { kind: "color", key: "accentColor", label: "Accent colour", tooltip: "Colour used for Vimeo's play button and progress bar." },
    { kind: "number", key: "startTime", label: "Start at (sec)", min: 0, max: 86400, tooltip: "Second in the video playback starts from." },
  ],
  // Cloudflare Stream iframe params (streamEmbedUrl in pageBlockRenderer.js).
  // Autoplay is muted-only by browser policy, so its label says so; there's
  // no end-time param on the Stream iframe.
  stream: [
    { kind: "toggle", key: "controls", label: "Player controls", defaultOn: true, tooltip: "Show Cloudflare Stream's built-in play/pause, seek, and volume controls." },
    { kind: "toggle", key: "autoplay", label: "Autoplay (muted)", defaultOn: false, tooltip: "Start playing automatically - browsers require this to be muted." },
    { kind: "toggle", key: "loop", label: "Loop", defaultOn: false, tooltip: "Restart the video automatically when it finishes." },
    { kind: "toggle", key: "muted", label: "Start muted", defaultOn: false, tooltip: "Start the video with the sound muted." },
    { kind: "color", key: "accentColor", label: "Player colour", tooltip: "Colour used for the player's progress bar and controls." },
    { kind: "number", key: "startTime", label: "Start at (sec)", min: 0, max: 86400, tooltip: "Second in the video playback starts from." },
  ],
};

const SLOT_ID = "embedSettingsSlot";

export function openEmbedSettingsDialog({ provider, options, onChange }) {
  const specs = OPTION_SPECS[provider];
  if (!specs) return;

  const pickrInstances = [];
  const form = document.createElement("div");
  // No gap - every row appended below (labelledRow()/createValueControl)
  // carries .color-row, whose own margin-bottom is already this same
  // 0.6rem (css/builder.css, "the single source of truth for row
  // spacing"). A gap on top of that doubles every row's spacing - same
  // bug as js/modules/expandableMode.js's Mode Settings containers.
  form.style.cssText = "display:flex;flex-direction:column;text-align:left;";

  const commit = () => onChange();
  const setOrDelete = (key, value, isDefault) => {
    if (isDefault) delete options[key];
    else options[key] = value;
    commit();
  };

  for (const spec of specs) {
    if (spec.kind === "toggle") {
      form.appendChild(buildToggleRow(spec, options, setOrDelete));
    } else if (spec.kind === "select") {
      form.appendChild(buildSelectRow(spec, options, setOrDelete));
    } else if (spec.kind === "number") {
      form.appendChild(buildNumberRow(spec, options, commit));
    } else if (spec.kind === "color") {
      form.appendChild(buildColorRow(spec, options, setOrDelete, pickrInstances));
    }
  }

  dialog.createDialog({
    type: "custom",
    message: "Advanced Embed Settings",
    content: `<div id="${SLOT_ID}"></div>`,
    buttons: [{ text: "Done", type: "primary", onClick: () => { destroyPickrs(pickrInstances); dialog.closeDialog(); } }],
    maxWidth: "460px",
  });
  document.getElementById(SLOT_ID)?.appendChild(form);
}

function destroyPickrs(list) {
  list.forEach((p) => { try { p.destroy(); } catch (e) {} });
  list.length = 0;
}

function labelledRow(labelText, tooltip) {
  const row = document.createElement("div");
  row.className = "color-row";
  const label = document.createElement("span");
  label.textContent = labelText;
  if (tooltip) label.title = tooltip;
  row.appendChild(label);
  return { row, label };
}

function buildToggleRow(spec, options, setOrDelete) {
  const { row, label } = labelledRow(spec.label, spec.tooltip);
  const id = `embedopt-${spec.key}`;
  label.setAttribute("for", id);
  label.style.cursor = "pointer";
  const checked = (options[spec.key] ?? spec.defaultOn) === true;
  const toggle = createToggleSwitch({
    id,
    checked,
    tooltip: spec.tooltip,
    onChange: () => {
      const on = toggle.querySelector("input").checked;
      setOrDelete(spec.key, on, on === spec.defaultOn);
    },
  });
  row.appendChild(toggle);
  return row;
}

function buildSelectRow(spec, options, setOrDelete) {
  const { row } = labelledRow(spec.label, spec.tooltip);
  const select = document.createElement("select");
  select.className = "builder-select";
  if (spec.tooltip) select.title = spec.tooltip;
  const current = options[spec.key] ?? spec.default;
  for (const [value, text] of spec.choices) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (value === current) opt.selected = true;
    select.appendChild(opt);
  }
  select.onchange = () => setOrDelete(spec.key, select.value, select.value === spec.default);
  row.appendChild(select);
  return row;
}

function buildNumberRow(spec, options, commit) {
  const { row: valueRow, input } = createValueControl({
    id: `embedopt-${spec.key}`,
    label: spec.label + ":",
    value: options[spec.key] ?? "",
    min: spec.min,
    max: spec.max,
    step: 1,
    tooltip: spec.tooltip,
  });
  const apply = () => {
    const raw = input.value.trim();
    if (raw === "") delete options[spec.key];
    else {
      const n = Math.max(spec.min, Math.min(spec.max, Math.floor(Number(raw)) || 0));
      options[spec.key] = n;
    }
    commit();
  };
  input.addEventListener("change", apply);
  input.addEventListener("blur", apply);
  return valueRow;
}

function buildColorRow(spec, options, setOrDelete, pickrInstances) {
  // Toggle-gated, same shape as the collapsed-overlay colour row in
  // pageBlocksEditor.js: an absent value = provider default (no param).
  const { row, label } = labelledRow(spec.label, spec.tooltip);
  const id = `embedopt-${spec.key}`;
  label.setAttribute("for", id);
  label.style.cursor = "pointer";

  const enabled = !!options[spec.key];
  const pickr = createColorPickrButton(
    options[spec.key] || "#00adef",
    (hex) => setOrDelete(spec.key, hex, false),
    pickrInstances,
  );
  if (spec.tooltip) {
    pickr.btn.title = spec.tooltip;
    pickr.btn.setAttribute("aria-label", spec.label);
  }
  const applyEnabled = (on) => {
    pickr.btn.disabled = !on;
    pickr.btn.style.opacity = on ? "1" : "0.5";
  };
  const toggle = createToggleSwitch({
    id,
    checked: enabled,
    tooltip: spec.tooltip,
    onChange: () => {
      const on = toggle.querySelector("input").checked;
      applyEnabled(on);
      if (on) setOrDelete(spec.key, pickr.btn.style.background || "#00adef", false);
      else setOrDelete(spec.key, null, true);
    },
  });
  row.appendChild(toggle);
  row.appendChild(pickr.btn);
  applyEnabled(enabled);
  return row;
}
