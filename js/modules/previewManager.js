// previewManager.js - Handles preview functionality with template-based approach
import { getColorFilters } from './colorUtils.js';

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

    // Process overlay color and background color
    // backgroundColor is ALWAYS the base solid color behind everything
    let backgroundColor = reel.backgroundColor || "rgba(255, 255, 255, 1)";
    
    // overlayColor is ALWAYS applied to the ::before pseudo-element (with blur)
    // It works whether background image is on or off
    let overlayColor = "rgba(255, 255, 255, 0)"; // Transparent by default
    if (reel.overlayColorEnabled && reel.overlayColor) {
      overlayColor = reel.overlayColor;
    }

    const uiAccentColor = reel.varUiAccent || "#2a0026";
    
    // For better color matching, especially with white/light colors
    const colorFilters = getColorFilters(uiAccentColor);

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
      "--background-zoom": reel.backgroundZoom || "1",
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
