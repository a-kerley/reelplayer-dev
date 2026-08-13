// pageBlockPresets.js - localStorage-backed presets for page-builder blocks
// (js/modules/pageBlocksEditor.js). Each preset is a saved block config
// (everything except blockId/type) that can seed a new block of the same
// type later. Mirrors colorPresets.js's storage shape/pattern, but a
// preset here also carries `blockType` since (unlike a color preset) it
// only ever applies to one specific block type.

const STORAGE_KEY = "pageBlockPresets";

export function loadBlockPresets() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export function saveBlockPresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function presetsForType(blockType) {
  return loadBlockPresets().filter((p) => p.blockType === blockType);
}

/** @param {string} name @param {string} blockType @param {Object} config - block data minus blockId/type */
export function addBlockPreset(name, blockType, config) {
  const presets = loadBlockPresets();
  presets.push({ name, blockType, config });
  saveBlockPresets(presets);
}

export function deleteBlockPreset(index) {
  const presets = loadBlockPresets();
  presets.splice(index, 1);
  saveBlockPresets(presets);
}
