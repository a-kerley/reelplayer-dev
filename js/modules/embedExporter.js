// embedExporter.js - Handles exporting embed code for Squarespace and other platforms
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { REEL_COLOR_DEFAULTS } from "./colorUtils.js";
import { hashContent } from "./contentHash.js";

export class EmbedExporter {
  constructor() {
    this.baseURL = window.location.origin + window.location.pathname;
  }

  // Validates the reel, then POSTs it to the Worker and returns
  // { iframe, reelId } - the one method that actually publishes. Callers
  // that want to track publish state (e.g. js/main.js's "is this reel's
  // live embed up to date with the current draft" indicator) compare a
  // fresh generateReelId(reel) call against the reelId returned here the
  // last time this actually succeeded, rather than this module tracking
  // that itself.
  async publishReel(reel) {
    const playlist = (reel.playlist || []).filter(
      track => track.url && track.url.trim() !== ""
    );
    if (playlist.length === 0) {
      throw new Error("No valid tracks found in the reel. Please add some tracks before exporting.");
    }

    const reelId = this.generateReelId(reel);
    await this.postReelToWorker(reelId, reel);
    return { iframe: this.buildIframeMarkup(reel, reelId), reelId };
  }

  // Builds the embed <iframe> markup for a reel id that's already published
  // (no network call) - used by "Get Embed Code" to show the current live
  // embed without re-publishing. publishReel() above uses this too, right
  // after actually publishing.
  buildIframeMarkup(reel, reelId) {
    // Determine height based on mode
    let height;
    const isExpandable = reel.mode === 'expandable';
    
    if (isExpandable) {
      // Use collapsed height for expandable mode embeds
      height = reel.expandableCollapsedHeight || 120;
    } else {
      // Use player height from reel settings for static mode
      height = reel.playerHeight || 500;
    }
    
    // reel.playerHeight/expandableCollapsedHeight may come through as a string
    if (typeof height === 'string') {
      height = parseInt(height);
    }
    
    // Generate unique ID for this iframe
    const iframeId = `reelplayer-${reelId}`;
    
    // For expandable mode, include resize script
    const resizeScript = isExpandable ? `
<script>
  // Listen for resize/scroll-compensation messages from the iframe
  window.addEventListener('message', function(event) {
    const iframe = document.getElementById('${iframeId}');
    if (!iframe || event.source !== iframe.contentWindow || !event.data) return;
    if (event.data.type === 'reelplayer:resize') {
      iframe.style.height = event.data.height + 'px';
    } else if (event.data.type === 'reelplayer:scrollCompensate') {
      // The iframe's own collapse-height shrink retracts space from this
      // host page below it - without this, the page would visibly jump as
      // that space disappears. The iframe can't call this page's scrollBy()
      // directly (cross-origin), so it asks via postMessage instead, same as
      // the resize message above.
      window.scrollBy(0, event.data.delta);
    }
  });
</script>` : '';
    
    // Extensionless "player" (not "player.html") - matches the canonical
    // clean-URL form the static-assets Worker's default html_handling
    // serves directly, so embeds never take the .html -> extensionless
    // redirect hop that requesting "player.html" literally would trigger.
    //
    // border-radius lives on the wrapping <div>, not the <iframe> itself -
    // border-radius applied directly to an iframe (a "replaced element")
    // isn't reliably clipped by every browser, older mobile Safari
    // especially confirmed to just ignore it and render square corners
    // regardless. A <div> clipping via the ordinary overflow:hidden +
    // border-radius combo is the standard, cross-browser-reliable way to
    // round an iframe's corners. The div needs no explicit height of its
    // own - it's a block-level parent, so it naturally sizes to fit the
    // iframe (its only child) at whatever height the iframe currently has,
    // frame by frame, as the iframe's own JS-driven height transition
    // below plays out - no separate transition needed on the div itself.
    const iframe = `<div style="border-radius: 8px; overflow: hidden;"><iframe id="${iframeId}" src="${this.baseURL.replace('index.html', '')}player?id=${reelId}"
           width="100%" height="${height}px" frameborder="0"
           style="display: block; border: none; min-height: ${height}px; transition: height 0.3s ease;">
          </iframe></div>${resizeScript}`;
    return iframe;
  }

  // Confirms the same public, unauthenticated endpoint player.html itself
  // fetches (GET /reels/:id) can actually see what was just published -
  // called right after postReelToWorker()'s POST resolves, so a publish
  // click can report "confirmed live" rather than just "request accepted".
  async verifyPublished(reelId) {
    const response = await fetch(`${WORKER_BASE_URL}/reels/${reelId}`);
    return response.ok;
  }

  generateReelId(reel) {
    // Generate a short unique ID based on reel content
    return hashContent({
      title: reel.title,
      playlist: reel.playlist?.map(t => ({
        title: t.title,
        url: t.url,
        backgroundImage: t.backgroundImage,
        backgroundZoom: t.backgroundZoom
      })),
      settings: {
        accent: reel.varUiAccent,
        waveform: reel.varWaveformUnplayed,
        background: reel.backgroundImage,
        mode: reel.mode,
        waveformBars: reel.settings?.waveform
      }
    });
  }

  async postReelToWorker(reelId, reel) {
    // Store complete reel configuration for iframe player
    // Ensure playlist tracks include all properties (background images, videos, zoom, etc.)
    const playlist = (reel.playlist || [])
      .filter(track => track.url && track.url.trim() !== "")
      .map(track => ({
        url: track.url,
        title: track.title,
        backgroundImage: track.backgroundImage || "",
        backgroundVideo: track.backgroundVideo || "",
        backgroundZoom: track.backgroundZoom || 1
      }));
    
    const reelData = {
      id: reelId,
      title: reel.title,
      showTitle: reel.showTitle,
      analyticsEnabled: reel.analyticsEnabled === true,
      playlist: playlist,
      playerHeight: reel.playerHeight || 500, // Player height setting
      mode: reel.mode || "static", // Player mode: "static" or "expandable"
      // Store backgroundColor at top level for easy access (matches PreviewManager)
      backgroundColor: reel.backgroundColor || REEL_COLOR_DEFAULTS.backgroundColor,
      settings: {
        // Color settings
        varUiAccent: reel.varUiAccent || REEL_COLOR_DEFAULTS.uiAccent,
        varWaveformUnplayed: reel.varWaveformUnplayed || REEL_COLOR_DEFAULTS.waveformUnplayed,
        varWaveformHover: reel.varWaveformHover || REEL_COLOR_DEFAULTS.waveformHoverRgba,

        // Background settings
        backgroundColor: reel.backgroundColor || REEL_COLOR_DEFAULTS.backgroundColor, // Also in settings for backwards compatibility
        backgroundColorEnabled: reel.backgroundColorEnabled !== false,
        backgroundImage: reel.backgroundImage,
        backgroundImageEnabled: reel.backgroundImageEnabled,
        backgroundVideo: reel.backgroundVideo,
        backgroundVideoEnabled: reel.backgroundVideoEnabled,
        overlayColor: reel.overlayColor,
        overlayColorEnabled: reel.overlayColorEnabled,
        playerOutlineEnabled: reel.playerOutlineEnabled ?? (reel.playerOutlineWidth > 0),
        playerOutlineWidth: reel.playerOutlineWidth || 0,
        playerOutlineColor: reel.playerOutlineColor || REEL_COLOR_DEFAULTS.outlineColor,
        backgroundOpacity: reel.backgroundOpacity,
        backgroundBlur: reel.backgroundBlur,
        backgroundZoom: reel.backgroundZoom,
        hoverDarkenEnabled: reel.hoverDarkenEnabled === true,
        hoverDarkenAmount: reel.hoverDarkenAmount ?? 15,
        idleUnblurEnabled: reel.idleUnblurEnabled === true,
        idleUnblurAmount: reel.idleUnblurAmount ?? 50,

        // Player text styles (title + track name) - js/modules/
        // playerTextStyles.js. Always populated by the time this runs:
        // "Export Embed Code" only exists inside the reel builder form
        // itself, and createPlayerTextStylesSection() (part of that same
        // form) migrates any legacy reel.titleAppearance into this field
        // the moment the reel's opened, before publish is even reachable.
        playerTextStyles: reel.playerTextStyles || {},

        // Expandable mode settings
        expandableCollapsedHeight: reel.expandableCollapsedHeight || 120,
        expandableExpandedHeight: reel.expandableExpandedHeight || 500,
        projectTitleImage: reel.projectTitleImage || "",
        showWaveformOnCollapse: reel.showWaveformOnCollapse !== false, // Default to true
        enablePlayerClosedIdle: reel.enablePlayerClosedIdle === true,
        playerClosedIdleVideo: reel.playerClosedIdleVideo || "",
        playerClosedIdleOverlayColor: reel.playerClosedIdleOverlayColor || REEL_COLOR_DEFAULTS.playerClosedIdleOverlayColor,
        playerClosedIdleOverlayColorEnabled: reel.playerClosedIdleOverlayColorEnabled !== false,
        playerClosedIdleBlur: reel.playerClosedIdleBlur ?? 8
      },
      created: new Date().toISOString()
    };

    const password = await getBuilderPassword();
    if (!password) {
      throw new Error("A password is required to publish this reel.");
    }

    const response = await fetch(`${WORKER_BASE_URL}/reels/${reelId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${password}`
      },
      body: JSON.stringify(reelData)
    });

    if (response.status === 401) {
      clearBuilderPassword();
      throw new Error("Incorrect password. Please try exporting again.");
    }

    if (!response.ok) {
      throw new Error(`Failed to publish reel (server responded with status ${response.status}).`);
    }

    return reelData;
  }

  // Note: generateStandaloneHTML() has been removed to eliminate code duplication.
  // All embeds now use the iframe approach with player.html as the single source of truth.
  // This ensures player fixes automatically apply to embeds without manual synchronization.
}

export const embedExporter = new EmbedExporter();

/** The canonical, shareable public URL for a published reel embed id -
 * same extensionless "player" convention as js/modules/pagePublish.js's
 * publicPageUrl()/js/modules/cardPublish.js's publicCardPlayerUrl(). */
export function publicReelPlayerUrl(reelId) {
  const baseURL = (window.location.origin + window.location.pathname).replace(/index\.html$/, "");
  return `${baseURL}player?id=${reelId}`;
}
