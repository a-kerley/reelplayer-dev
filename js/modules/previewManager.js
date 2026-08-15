// previewManager.js - Handles preview functionality with template-based approach
import { getColorFilters, REEL_COLOR_DEFAULTS } from './colorUtils.js';
import { TEXT_FONT_OPTIONS, ensureInlineGoogleFont } from './pageTextStyles.js';

// Shared by generateStyleConfig() below and player.html's identical copy
// (applyReelStyles()) - the one real duplication this feature couldn't
// avoid, since the builder app and the standalone embed bootstrap don't
// share a module loading path. Kept textually identical between the two;
// if you change one, change the other.
//
// `unit` is a { role, fontFamily, fontSize, fontWeight, color } object
// (reel.playerTextStyles.title/.trackName - see
// js/modules/playerTextStyles.js). A defined `role` IS "inherit mode" -
// there's no separate mode flag, same convention the page button block
// already uses (block.textStyleRole itself is the custom/inherit
// switch - see pageBlocksEditor.js's createButtonConfig()).
// `pageRoleStyles` is the embedding page's page.textStyleDefs, forwarded
// only when this reel is actually inside a page's Player block
// (js/modules/pageBlockRenderer.js's renderPlayer()) - null/undefined
// here in the builder's own preview, since a reel has no fixed page to
// inherit from at edit time.
//
// Returns font-family/-size/-weight/color, each possibly undefined -
// callers must OMIT (not set-to-"undefined") any undefined key, letting
// the corresponding css/player.css var(--x, <today's-current-look>)
// fallback apply instead. That's the whole fallback story for this
// feature: no page context, or a page that hasn't customized this
// particular role, both just look exactly like they always have.
function resolveTextUnit(unit, pageRoleStyles) {
  const role = unit?.role;
  const fromPage = role && pageRoleStyles?.[role];
  const source = fromPage || unit || {};
  return {
    fontFamily: source.fontFamily,
    fontSize: source.fontSize,
    fontWeight: source.fontWeight,
    color: source.color,
  };
}

// Turns a resolved { fontFamily, fontSize, fontWeight, color } (see
// resolveTextUnit() above) into the actual --{varPrefix}-* CSS custom
// properties, loading the Google Font stylesheet if the resolved family
// needs one. Always returns all four keys, with value `undefined` for
// anything unresolved - NOT omitted - so applyPreviewStyles()'s diff loop
// (which only visits keys actually present in the object it's given)
// still sees, and clears, a var that was previously set but should now
// fall back to CSS's own default (e.g. switching a unit from a role back
// to an empty "Custom").
function textUnitStyleVars(varPrefix, resolved) {
  let fontFamily;
  if (resolved.fontFamily) {
    const font = TEXT_FONT_OPTIONS.find((f) => f.value === resolved.fontFamily);
    if (font) {
      fontFamily = font.stack;
      ensureInlineGoogleFont(font.value);
    }
  }
  return {
    [`--${varPrefix}-font-family`]: fontFamily,
    [`--${varPrefix}-size`]: resolved.fontSize ? `${resolved.fontSize}px` : undefined,
    [`--${varPrefix}-weight`]: resolved.fontWeight,
    [`--${varPrefix}-color`]: resolved.color,
  };
}

export class PreviewManager {
  constructor() {
    this.container = null;
    this.currentStyles = {};
    this.noTracksTemplate = `
      <div class="builder-empty-state builder-empty-state--block">
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

    // Only update CSS properties that have changed. A value of undefined
    // (title/track-name font-family/size/weight/color when nothing's
    // resolved - see resolveTextUnit()) means "unset this override, let
    // the CSS fallback apply" - explicitly removeProperty rather than
    // setProperty(..., undefined), which would otherwise write the
    // literal string "undefined" as the property's value. Needed because
    // this object is long-lived across re-renders (this.currentStyles) -
    // a property that WAS set (e.g. switched to a role) and now resolves
    // to nothing must actually be cleared, not just skipped.
    Object.entries(newStyles).forEach(([property, value]) => {
      if (this.currentStyles[property] === value) return;
      if (value === undefined) {
        document.documentElement.style.removeProperty(property);
      } else {
        document.documentElement.style.setProperty(property, value);
      }
      this.currentStyles[property] = value;
    });
  }

  generateStyleConfig(reel) {
    const pts = reel.playerTextStyles || { title: {}, trackName: {} };

    // Process padding value - a plain px number (or undefined) in the new
    // data model, unlike the old reel.titleAppearance.paddingBottom's
    // unit-suffixed string. 13px (not the previous, inconsistent 1.5rem
    // fallback here) matches css/player.css's own --reel-title-padding-
    // bottom default (0.8rem) and js/modules/playerTextStyles.js's own
    // padding control default - the three were quietly out of sync before.
    const paddingBottom = pts.title.paddingBottom !== undefined
      ? `${pts.title.paddingBottom}px`
      : "13px";

    const titleVars = textUnitStyleVars("reel-title", resolveTextUnit(pts.title, null));
    const trackNameVars = textUnitStyleVars("reel-track", resolveTextUnit(pts.trackName, null));

    // Process background image - only if enabled
    const backgroundImage = (reel.backgroundImageEnabled && reel.backgroundImage && reel.backgroundImage.trim()) 
      ? `url("${reel.backgroundImage}")` 
      : "none";

    // Process overlay color and background color
    // backgroundColor is ALWAYS the base solid color behind everything
    let backgroundColor = reel.backgroundColor || REEL_COLOR_DEFAULTS.backgroundColor;
    
    // overlayColor is ALWAYS applied to the ::before pseudo-element (with blur)
    // It works whether background image is on or off
    let overlayColor = "rgba(255, 255, 255, 0)"; // Transparent by default
    if (reel.overlayColorEnabled && reel.overlayColor) {
      overlayColor = reel.overlayColor;
    }

    // Extract RGB and alpha values from overlayColor for separated control
    const parseRGBA = (rgbaString) => {
      const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]), 
          b: parseInt(match[3]),
          a: match[4] !== undefined ? parseFloat(match[4]) : 1
        };
      }
      return { r: 255, g: 255, b: 255, a: 0 }; // Default fallback
    };

    const overlayRGBA = parseRGBA(overlayColor);
    const overlayBaseColor = `${overlayRGBA.r}, ${overlayRGBA.g}, ${overlayRGBA.b}`;
    const overlayOpacity = overlayRGBA.a;

    const closedIdleOverlayRGBA = parseRGBA(reel.playerClosedIdleOverlayColor || REEL_COLOR_DEFAULTS.playerClosedIdleOverlayColor);
    const closedIdleOverlayBaseColor = `${closedIdleOverlayRGBA.r}, ${closedIdleOverlayRGBA.g}, ${closedIdleOverlayRGBA.b}`;
    const closedIdleOverlayOpacity = closedIdleOverlayRGBA.a;

    const uiAccentColor = reel.varUiAccent || REEL_COLOR_DEFAULTS.uiAccent;

    // For better color matching, especially with white/light colors
    const colorFilters = getColorFilters(uiAccentColor);

    return {
      // Color variables
      "--ui-accent": uiAccentColor,
      "--waveform-unplayed": reel.varWaveformUnplayed || REEL_COLOR_DEFAULTS.waveformUnplayed,
      "--waveform-hover": reel.varWaveformHover || REEL_COLOR_DEFAULTS.waveformHoverRgba,

      // Title/Track Name text style variables (js/modules/playerTextStyles.js)
      // - font-family/size/weight/color are omitted entirely (not set to
      // "undefined") when unresolved, so css/player.css's own var(...,
      // <default>) fallback applies; see resolveTextUnit()'s comment above.
      "--reel-title-align": pts.title.align || "center",
      "--reel-title-padding-bottom": paddingBottom,
      ...titleVars,
      ...trackNameVars,

      // Background effects variables
      "--background-image": backgroundImage,
      "--background-color": backgroundColor,
      "--background-opacity": reel.backgroundOpacity || "1",
      "--background-blur": `${reel.backgroundBlur || "2"}px`,
      "--background-zoom": reel.backgroundZoom || "1",
      "--overlay-color": overlayColor, // Keep for backward compatibility
      "--overlay-base-color": overlayBaseColor,
      "--overlay-opacity": overlayOpacity,
      
      // Player height (used for static mode)
      "--player-height": `${reel.playerHeight || 500}px`,
      
      // Expandable mode variables
      "--expandable-collapsed-height": `${reel.expandableCollapsedHeight || 120}px`,
      "--expandable-expanded-height": `${reel.expandableExpandedHeight || 500}px`,

      // Player closed idle variables
      "--player-closed-idle-overlay-base-color": closedIdleOverlayBaseColor,
      "--player-closed-idle-overlay-opacity": closedIdleOverlayOpacity,
      "--player-closed-idle-blur": `${reel.playerClosedIdleBlur ?? 8}px`,

      // Hover darken - amount is a 0-100 darkness percentage; brightness() wants
      // 1 (no change) down to 0 (black), so it's inverted here.
      "--hover-darken-target-brightness": 1 - (reel.hoverDarkenAmount ?? 15) / 100,

      // Idle unblur - amount is a 0-100 "how much of the background blur to
      // remove once playback-idle/collapsed-idle" percentage, used directly
      // as a reduction fraction against --background-blur in css/player.css
      // (100 = fully sharp, 0 = no change).
      "--idle-unblur-target-reduction": (reel.idleUnblurAmount ?? 50) / 100,

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
