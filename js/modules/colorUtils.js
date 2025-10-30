// colorUtils.js - Shared color utility functions for consistent color handling

/**
 * Convert hex color to HSL hue value
 * @param {string} hex - Hex color code (with or without #)
 * @returns {number} Hue value in degrees (0-360)
 */
export function hexToHue(hex) {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert hex to RGB (0-1 range)
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  
  // Find max and min values
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  
  let h = 0;
  if (max !== min) {
    const delta = max - min;
    switch (max) {
      case r: h = ((g - b) / delta + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / delta + 2) / 6; break;
      case b: h = ((r - g) / delta + 4) / 6; break;
    }
  }
  
  // Convert to degrees
  return Math.round(h * 360);
}

/**
 * Get appropriate color filters for Lottie animations
 * Adjusts brightness, saturation, and hue rotation based on target color
 * @param {string} hexColor - Hex color code (with or without #)
 * @returns {Object} Filter values { brightness, saturation, hueRotation }
 */
export function getColorFilters(hexColor) {
  // Remove # if present
  hexColor = hexColor.replace('#', '');
  
  // Convert hex to RGB
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  
  // Calculate brightness (perceived luminance)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // For white/light colors (brightness > 200), use a simpler approach
  if (brightness > 200) {
    return {
      brightness: brightness / 128, // Scale to appropriate brightness
      saturation: 0, // Remove saturation for neutral colors
      hueRotation: 0
    };
  }
  
  // For colored values, use hue rotation from base color
  const baseHue = hexToHue("#2a0026"); // Base purple color
  const targetHue = hexToHue(hexColor);
  const hueRotation = targetHue - baseHue;
  
  return {
    brightness: 1,
    saturation: 1.2, // Slight saturation boost
    hueRotation: hueRotation
  };
}

/**
 * Convert any color format to rgba with specified opacity
 * @param {string} color - Color in hex, rgb, or rgba format
 * @param {number} opacity - Opacity value between 0 and 1
 * @returns {string} Color in rgba format
 */
export function colorToRgba(color, opacity) {
  // If already rgba/rgb, extract the rgb values
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (match) {
      const r = Math.round(parseFloat(match[1]));
      const g = Math.round(parseFloat(match[2]));
      const b = Math.round(parseFloat(match[3]));
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }
  
  // If hex, convert to rgba
  color = color.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
