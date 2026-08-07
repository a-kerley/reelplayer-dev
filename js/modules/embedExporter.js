// embedExporter.js - Handles exporting embed code for Squarespace and other platforms
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

export class EmbedExporter {
  constructor() {
    this.baseURL = window.location.origin + window.location.pathname;
  }

  // Generate iframe embed code
  async generateEmbedOptions(reel) {
    // Filter valid tracks
    const playlist = (reel.playlist || []).filter(
      track => track.url && track.url.trim() !== ""
    );

    if (playlist.length === 0) {
      throw new Error("No valid tracks found in the reel. Please add some tracks before exporting.");
    }

    return {
      iframe: await this.generateIframeEmbed(reel)
    };
  }

  async generateIframeEmbed(reel) {
    const reelId = this.generateReelId(reel);
    await this.storeReelData(reelId, reel);

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
    return `<div style="border-radius: 8px; overflow: hidden;"><iframe id="${iframeId}" src="${this.baseURL.replace('index.html', '')}player?id=${reelId}"
           width="100%" height="${height}px" frameborder="0"
           style="display: block; border: none; min-height: ${height}px; transition: height 0.3s ease;">
          </iframe></div>${resizeScript}`;
  }

  generateReelId(reel) {
    // Generate a short unique ID based on reel content
    const content = JSON.stringify({
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
    
    // Simple hash function to create short ID
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  async storeReelData(reelId, reel) {
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
      playlist: playlist,
      playerHeight: reel.playerHeight || 500, // Player height setting
      mode: reel.mode || "static", // Player mode: "static" or "expandable"
      // Store backgroundColor at top level for easy access (matches PreviewManager)
      backgroundColor: reel.backgroundColor || "rgba(255, 255, 255, 1)",
      settings: {
        // Color settings
        varUiAccent: reel.varUiAccent || "#2a0026",
        varWaveformUnplayed: reel.varWaveformUnplayed || "#929292",
        varWaveformHover: reel.varWaveformHover || "rgba(0, 31, 103, 0.13)",

        // Background settings
        backgroundColor: reel.backgroundColor || "rgba(255, 255, 255, 1)", // Also in settings for backwards compatibility
        backgroundImage: reel.backgroundImage,
        backgroundImageEnabled: reel.backgroundImageEnabled,
        backgroundVideo: reel.backgroundVideo,
        backgroundVideoEnabled: reel.backgroundVideoEnabled,
        overlayColor: reel.overlayColor,
        overlayColorEnabled: reel.overlayColorEnabled,
        backgroundOpacity: reel.backgroundOpacity,
        backgroundBlur: reel.backgroundBlur,
        backgroundZoom: reel.backgroundZoom,
        hoverDarkenEnabled: reel.hoverDarkenEnabled === true,
        hoverDarkenAmount: reel.hoverDarkenAmount ?? 15,
        idleUnblurEnabled: reel.idleUnblurEnabled === true,
        idleUnblurAmount: reel.idleUnblurAmount ?? 50,

        // Title appearance
        titleAppearance: reel.titleAppearance || {},

        // Expandable mode settings
        expandableCollapsedHeight: reel.expandableCollapsedHeight || 120,
        expandableExpandedHeight: reel.expandableExpandedHeight || 500,
        projectTitleImage: reel.projectTitleImage || "",
        showWaveformOnCollapse: reel.showWaveformOnCollapse !== false, // Default to true
        enablePlayerClosedIdle: reel.enablePlayerClosedIdle === true,
        playerClosedIdleVideo: reel.playerClosedIdleVideo || "",
        playerClosedIdleOverlayColor: reel.playerClosedIdleOverlayColor || "rgba(0, 0, 0, 0.7)",
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
