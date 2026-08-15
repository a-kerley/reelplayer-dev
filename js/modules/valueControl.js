// valueControl.js - Combined number-spinner + hover-reveal slider control.
// One value, two ways to edit it: type a precise number, or hover/focus to
// reveal a slider for quick dragging. Arrow keys step by `step`; hold Shift
// for a coarser step, Ctrl for a finer one. External code binds to the
// number input's id exactly as it would a plain <input type="number">  -
// the slider is a secondary input that drives the same element and fires
// the same native "input"/"change" events, so existing wiring needs no
// changes beyond swapping the row-builder that creates it.
//
// createValueControl() builds fresh DOM and wires it in one step - use this
// when you're appending real element references into the page. If instead
// you're assembling markup via a template string (innerHTML), listeners
// attached to the original elements are lost when the string is re-parsed;
// build the row with `.row`/`.control.outerHTML`, mount the string, then
// call wireValueControl() on the resulting `.value-control` element(s) to
// attach behavior after the fact (see js/builder.js, backgroundEffects.js).

function stepDecimals(step) {
  if (Number.isInteger(step)) return 0;
  return String(step).split('.')[1].length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step) {
  const decimals = stepDecimals(step);
  return parseFloat(value.toFixed(decimals));
}

function effectiveStep(baseStep, e) {
  if (e.shiftKey) return baseStep * 10;
  if (e.ctrlKey) return baseStep / 10;
  return baseStep;
}

const CHEVRON_UP = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>';
const CHEVRON_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>';

// One uniform width for every plain-number field in the app, not sized
// per-field to its own min/max/step - previously a field's box grew or
// shrank with however many digits its own range could reach, so no two
// fields necessarily lined up even when sitting in adjacent rows. Fixed
// at 4 digits' worth of room (every field in this codebase maxes out at
// 4 digits or fewer - nothing here actually needs more), center-aligned
// via .value-control-input in css/builder.css; a 5th digit just scrolls
// within the field like any input whose content exceeds its width,
// rather than growing the box to fit it.
function measureWidth() {
  return "6.5ch";
}

/**
 * Builds the input+slider markup only - no behavior attached yet. Use this
 * (with .row/.control.outerHTML) when assembling a template string, then
 * call wireValueControl() on the mounted result.
 * @returns {{row: HTMLDivElement, control: HTMLDivElement, input: HTMLInputElement, slider: HTMLInputElement, labelEl: HTMLSpanElement}}
 */
export function buildValueControl({ id, label, value, min, max, step = 1, unit = '' }) {
  const row = document.createElement('div');
  row.className = 'color-row value-control-row';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const control = document.createElement('div');
  control.className = 'value-control';

  // Set via setAttribute (not just the .value property) so the initial
  // value survives an outerHTML round-trip for template-string callers -
  // the "value" attribute is the input's default value, and only that
  // gets serialized; the live .value property does not.
  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('value', String(value));
  input.className = 'value-control-input';
  input.style.width = measureWidth();

  const numberWrap = document.createElement('div');
  numberWrap.className = 'value-control-number';

  const spinWrap = document.createElement('div');
  spinWrap.className = 'value-control-spin';

  const spinUp = document.createElement('button');
  spinUp.type = 'button';
  spinUp.className = 'value-control-spin-btn value-control-spin-up';
  spinUp.tabIndex = -1;
  spinUp.setAttribute('aria-label', 'Increase');
  spinUp.innerHTML = CHEVRON_UP;

  const spinDown = document.createElement('button');
  spinDown.type = 'button';
  spinDown.className = 'value-control-spin-btn value-control-spin-down';
  spinDown.tabIndex = -1;
  spinDown.setAttribute('aria-label', 'Decrease');
  spinDown.innerHTML = CHEVRON_DOWN;

  spinWrap.appendChild(spinUp);
  spinWrap.appendChild(spinDown);
  numberWrap.appendChild(input);
  numberWrap.appendChild(spinWrap);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'value-control-slider-wrap';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = `${id}Slider`;
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.setAttribute('value', String(isNaN(value) ? min : clamp(value, min, max)));
  slider.tabIndex = -1;

  sliderWrap.appendChild(slider);

  control.appendChild(numberWrap);
  if (unit) {
    const unitEl = document.createElement('span');
    unitEl.className = 'value-control-unit';
    unitEl.textContent = unit;
    control.appendChild(unitEl);
  }
  control.appendChild(sliderWrap);

  row.appendChild(labelEl);
  row.appendChild(control);

  return { row, control, input, slider, labelEl };
}

/**
 * Attaches the number<->slider sync and keyboard-modifier stepping to an
 * already-mounted `.value-control` element (found via querySelector, so it
 * works whether the element was built directly or parsed from an innerHTML
 * string). Safe to call more than once per element only if you don't mind
 * duplicate listeners - call it exactly once per mounted control.
 * @param {HTMLElement} control - a `.value-control` element
 */
export function wireValueControl(control) {
  const input = control.querySelector('.value-control-input');
  const slider = control.querySelector('input[type="range"]');
  if (!input || !slider) return;

  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const step = parseFloat(input.step) || 1;

  input.addEventListener('input', () => {
    const parsed = parseFloat(input.value);
    if (!isNaN(parsed)) {
      slider.value = String(clamp(parsed, min, max));
    }
  });

  slider.addEventListener('input', () => {
    input.value = slider.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  slider.addEventListener('change', () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  function computeNext(e, current, dir) {
    const useStep = effectiveStep(step, e);
    return roundToStep(clamp(current + dir * useStep, min, max), useStep);
  }

  function stepFromKey(e, current) {
    let dir = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') dir = -1;
    else return null;
    e.preventDefault();
    return computeNext(e, current, dir);
  }

  input.addEventListener('keydown', (e) => {
    const current = parseFloat(input.value);
    const next = stepFromKey(e, isNaN(current) ? min : current);
    if (next === null) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  slider.addEventListener('keydown', (e) => {
    const current = parseFloat(slider.value);
    const next = stepFromKey(e, isNaN(current) ? min : current);
    if (next === null) return;
    slider.value = String(next);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Custom spin buttons (native ones are tiny and unstylable in most
  // browsers). Same Shift/Ctrl modifier support as the keyboard, since
  // mouse events carry shiftKey/ctrlKey too. Stepping happens on mousedown,
  // not click: on macOS, Ctrl+click is remapped to a context-menu gesture
  // and never fires a "click" event at all, which would silently break the
  // Ctrl (fine-step) modifier for mouse users.
  const spinUp = control.querySelector('.value-control-spin-up');
  const spinDown = control.querySelector('.value-control-spin-down');
  [spinUp, spinDown].forEach((btn, i) => {
    if (!btn) return;
    const dir = i === 0 ? 1 : -1;
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // don't steal focus off the number input
      if (input.disabled) return;
      const current = parseFloat(input.value);
      const next = computeNext(e, isNaN(current) ? min : current, dir);
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // Keep the slider visible for the whole drag even if the pointer strays
  // outside the row bounds (CSS :hover alone would hide it mid-drag).
  slider.addEventListener('mousedown', () => control.classList.add('value-control-active'));
  window.addEventListener('mouseup', () => {
    control.classList.remove('value-control-active');
    // Dragging leaves the slider focused, which (via :focus-within) would
    // otherwise keep it revealed after the mouse leaves. It's unreachable
    // by Tab (tabIndex -1), so this can only follow a pointer drag - safe
    // to release focus once that drag ends.
    slider.blur();
  });
}

/**
 * Builds and wires a value control in one step - use for direct DOM
 * construction (the element references stay live, no innerHTML round-trip).
 * @param {Object} options
 * @param {string} options.id - Number input id; external code binds to this
 * @param {string} options.label - Row label text
 * @param {number} options.value - Initial value
 * @param {number} options.min
 * @param {number} options.max
 * @param {number} [options.step=1] - Base increment; Shift = x10, Ctrl = /10
 * @param {string} [options.unit] - Suffix shown next to the input (px, pt, %...)
 * @param {string} [options.tooltip]
 * @returns {{row: HTMLDivElement, control: HTMLDivElement, input: HTMLInputElement, slider: HTMLInputElement}}
 *   `row` is a ready-to-use .color-row (label + control). `control` is just
 *   the input+slider, for embedding in a custom layout instead.
 */
export function createValueControl(options) {
  const { row, control, input, slider, labelEl } = buildValueControl(options);
  if (options.tooltip) labelEl.dataset.tooltip = options.tooltip;
  wireValueControl(control);
  return { row, control, input, slider };
}
