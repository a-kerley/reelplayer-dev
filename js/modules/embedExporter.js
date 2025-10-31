// embedExporter.js - Handles exporting embed code for Squarespace and other platforms

export class EmbedExporter {
  constructor() {
    this.baseURL = window.location.origin + window.location.pathname;
  }

  // Generate iframe embed code
  generateEmbedOptions(reel) {
    // Filter valid tracks
    const playlist = (reel.playlist || []).filter(
      track => track.url && track.url.trim() !== ""
    );

    if (playlist.length === 0) {
      throw new Error("No valid tracks found in the reel. Please add some tracks before exporting.");
    }

    return {
      iframe: this.generateIframeEmbed(reel)
    };
  }

  // Generate embed code (for backward compatibility)
  generateEmbedCode(reel) {
    const options = this.generateEmbedOptions(reel);
    return options.iframe;
  }

  generateIframeEmbed(reel) {
    const reelId = this.generateReelId(reel);
    this.storeReelData(reelId, reel);
    
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
    
    // If height is a string (from calculateEmbedHeight), parse it
    if (typeof height === 'string') {
      height = parseInt(height);
    }
    
    // Generate unique ID for this iframe
    const iframeId = `reelplayer-${reelId}`;
    
    // For expandable mode, include resize script
    const resizeScript = isExpandable ? `
<script>
  // Listen for resize messages from the iframe
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'reelplayer:resize') {
      const iframe = document.getElementById('${iframeId}');
      if (iframe && event.source === iframe.contentWindow) {
        iframe.style.height = event.data.height + 'px';
      }
    }
  });
</script>` : '';
    
    return `<iframe id="${iframeId}" src="${this.baseURL.replace('index.html', '')}player.html?id=${reelId}" 
           width="100%" height="${height}px" frameborder="0" 
           style="border-radius: 8px; border: none; min-height: ${height}px; transition: height 0.3s ease;">
          </iframe>${resizeScript}`;
  }

  calculateEmbedHeight(reel) {
    // Base heights
    const titleHeight = (reel.showTitle && reel.title) ? 60 : 0;
    const playerControlsHeight = 180; // Waveform + controls
    const playlistItemHeight = 50;
    
    // Calculate playlist height
    const validTracks = (reel.playlist || []).filter(
      track => track.url && track.url.trim() !== ""
    ).length;
    
    const playlistHeight = validTracks * playlistItemHeight;
    
    // Total with padding
    const totalHeight = titleHeight + playerControlsHeight + playlistHeight + 80;
    
    // Clamp between reasonable min/max and return as number
    return Math.min(Math.max(totalHeight, 300), 800);
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

  storeReelData(reelId, reel) {
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
        varPlayerBorder: reel.varPlayerBorder || "#ffffff",
        
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
        
        // Title appearance
        titleAppearance: reel.titleAppearance || {},
        
        // Blend modes and effects
        backgroundBlendMode: reel.backgroundBlendMode,
        elementBlendMode: reel.elementBlendMode,
        
        // Expandable mode settings
        expandableCollapsedHeight: reel.expandableCollapsedHeight || 120,
        expandableExpandedHeight: reel.expandableExpandedHeight || 500,
        projectTitleImage: reel.projectTitleImage || "",
        showWaveformOnCollapse: reel.showWaveformOnCollapse !== false, // Default to true
        
        // Waveform settings
        waveform: reel.settings?.waveform || {
          barsEnabled: true,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          barHeight: 1
        }
      },
      created: new Date().toISOString()
    };
    
    // Store the reel data in localStorage (in production, this would be a server endpoint)
    localStorage.setItem(`reel_${reelId}`, JSON.stringify(reelData));
    console.log(`🎵 Reel stored with ID: ${reelId}`);
    
    return reelData;
  }

  // Note: generateStandaloneHTML() has been removed to eliminate code duplication.
  // All embeds now use the iframe approach with player.html as the single source of truth.
  // This ensures player fixes automatically apply to embeds without manual synchronization.

  generatePlaylistHTML(playlist) {
    return playlist.map((track, index) => `
      <div class="playlist-item${index === 0 ? ' active' : ''}" data-index="${index}">
        <span>${track.title || 'Untitled Track'}</span>
        <span class="playlist-duration">--:--</span>
      </div>
    `).join('');
  }
}

export const embedExporter = new EmbedExporter();
