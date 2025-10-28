// previewManager.js - Handles preview functionality with template-based approach

export class PreviewManager {
  constructor() {
    this.container = null;
    this.currentStyles = {};
    this.noTracksTemplate = `
      <div style="padding: 1rem; font-style: italic; color: #666; text-align: center;">
        No tracks available. Please add some tracks in the builder.
      </div>
    `;
  }

  // Helper function to convert hex to HSL and calculate hue rotation for Lottie
  hexToHue(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Convert hex to RGB
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

  // Helper function to get appropriate color filters for Lottie
  getColorFilters(hexColor) {
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
    
    // For colored values, use hue rotation
    const baseHue = this.hexToHue("#2a0026");
    const targetHue = this.hexToHue(hexColor);
    const hueRotation = targetHue - baseHue;
    
    return {
      brightness: 1,
      saturation: 1.2,
      hueRotation: hueRotation
    };
  }

  initialize(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Preview container with id "${containerId}" not found`);
      return false;
    }
    return true;
  }

  showPreview(reel, playerApp) {
    if (!this.container || !reel) return;

    // Stop and reset playback when refreshing preview
    if (playerApp.wavesurfer) {
      playerApp.wavesurfer.pause();
      playerApp.wavesurfer.seekTo(0);
    }

    // Filter valid tracks
    const playlist = (reel.playlist || []).filter(
      (track) => track.url && track.url.trim() !== ""
    );

    // Show message if no tracks
    if (playlist.length === 0) {
      this.container.innerHTML = this.noTracksTemplate;
      return;
    }

    // Apply styles efficiently
    this.applyPreviewStyles(reel);

    // Render player
    playerApp.renderPlayer({
      showTitle: reel.showTitle,
      title: reel.title,
      playlist,
      reel: reel  // Pass the full reel object for settings access
    });
  }

  applyPreviewStyles(reel) {
    const newStyles = this.generateStyleConfig(reel);
    
    // Only update CSS properties that have changed
    Object.entries(newStyles).forEach(([property, value]) => {
      if (this.currentStyles[property] !== value) {
        document.documentElement.style.setProperty(property, value);
        this.currentStyles[property] = value;
      }
    });
  }

  generateStyleConfig(reel) {
    const ta = reel.titleAppearance || {};
    
    // Process padding value
    let paddingBottom = ta.paddingBottom;
    if (!paddingBottom || paddingBottom === "") {
      paddingBottom = "1.5rem";
    } else if (typeof paddingBottom === "string" && !paddingBottom.match(/[a-z%]+$/)) {
      paddingBottom = paddingBottom + "px";
    }

    // Process background image - only if enabled
    const backgroundImage = (reel.backgroundImageEnabled && reel.backgroundImage && reel.backgroundImage.trim()) 
      ? `url("${reel.backgroundImage}")` 
      : "none";

    // Process overlay color - acts as background when background image is disabled
    let overlayColor = "rgba(255, 255, 255, 0)";
    let backgroundColor = `rgba(255, 255, 255, ${reel.backgroundOpacity || "1"})`;
    
    if (reel.overlayColorEnabled && reel.overlayColor) {
      if (reel.backgroundImageEnabled && reel.backgroundImage && reel.backgroundImage.trim()) {
        // Background image enabled: overlay color acts as overlay
        overlayColor = reel.overlayColor;
      } else {
        // Background image disabled: overlay color acts as background
        backgroundColor = reel.overlayColor;
        overlayColor = "rgba(255, 255, 255, 0)";
      }
    }

    const uiAccentColor = reel.varUiAccent || "#2a0026";
    
    // For better color matching, especially with white/light colors
    const colorFilters = this.getColorFilters(uiAccentColor);

    return {
      // Color variables
      "--ui-accent": uiAccentColor,
      "--waveform-unplayed": reel.varWaveformUnplayed || "#929292",
      "--waveform-hover": reel.varWaveformHover || "rgba(0, 31, 103, 0.13)",
      "--player-border-color": reel.varPlayerBorder || "#ffffff",
      
      // Title appearance variables
      "--reel-title-size": ta.fontSize || "1.3rem",
      "--reel-title-weight": ta.fontWeight || "700",
      "--reel-title-align": ta.align || "center",
      "--reel-title-padding-bottom": paddingBottom,
      
      // Background effects variables
      "--background-image": backgroundImage,
      "--background-color": backgroundColor,
      "--background-opacity": reel.backgroundOpacity || "1",
      "--background-blur": `${reel.backgroundBlur || "2"}px`,
      "--overlay-color": overlayColor,
      
      // Player height (used for static mode)
      "--player-height": `${reel.playerHeight || 500}px`,
      
      // Expandable mode variables
      "--expandable-collapsed-height": `${reel.expandableCollapsedHeight || 120}px`,
      "--expandable-expanded-height": `${reel.expandableExpandedHeight || 500}px`,
      
      // Lottie animation color variables
      "--lottie-brightness": colorFilters.brightness,
      "--lottie-saturation": colorFilters.saturation,
      "--lottie-hue-rotation": `${colorFilters.hueRotation}deg`,
    };
  }

  clearPreview() {
    if (this.container) {
      this.container.innerHTML = "";
    }
  }

  // Reset all applied styles
  resetStyles() {
    Object.keys(this.currentStyles).forEach(property => {
      document.documentElement.style.removeProperty(property);
    });
    this.currentStyles = {};
  }
}
