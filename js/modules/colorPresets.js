// colorPresets.js - Handles color preset management

export function loadColourPresets() {
  try {
    const json = localStorage.getItem("colourPresets");
    return json ? JSON.parse(json) : [];
  } catch (e) {
    return [];
  }
}

export function saveColourPresets(presets) {
  localStorage.setItem("colourPresets", JSON.stringify(presets));
}

export function getDefaultColourPreset() {
  const presets = loadColourPresets();
  return presets.find((p) => p.isDefault) || null;
}
