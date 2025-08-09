// embedExporter.js - Handles exporting embed code for Squarespace and other platforms

export class EmbedExporter {
  constructor() {
    this.baseURL = window.location.origin + window.location.pathname;
  }

  // Generate embed options - both iframe and standalone
  generateEmbedOptions(reel) {
    // Filter valid tracks
    const playlist = (reel.playlist || []).filter(
      track => track.url && track.url.trim() !== ""
    );

    if (playlist.length === 0) {
      throw new Error("No valid tracks found in the reel. Please add some tracks before exporting.");
    }

    return {
      // Option 1: Simple iframe (recommended for concise embeds)
      iframe: this.generateIframeEmbed(reel),
      
      // Option 2: Full standalone (current method)
      standalone: this.generateStandaloneHTML(reel, playlist)
    };
  }

  // Generate a complete standalone HTML player for embedding (legacy method)
  generateEmbedCode(reel) {
    const options = this.generateEmbedOptions(reel);
    return options.standalone; // Keep backward compatibility
  }

  generateIframeEmbed(reel) {
    const reelId = this.generateReelId(reel);
    this.storeReelData(reelId, reel);
    
    return `<iframe src="${this.baseURL.replace('index.html', '')}player.html?id=${reelId}" 
           width="100%" height="400" frameborder="0" 
           style="border-radius: 8px; border: none;">
          </iframe>`;
  }

  generateReelId(reel) {
    // Generate a short unique ID based on reel content
    const content = JSON.stringify({
      title: reel.title,
      playlist: reel.playlist?.map(t => ({ title: t.title, url: t.url })),
      settings: {
        accent: reel.varUiAccent,
        waveform: reel.varWaveformUnplayed,
        background: reel.backgroundImage
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
    const reelData = {
      id: reelId,
      title: reel.title,
      showTitle: reel.showTitle,
      playlist: reel.playlist?.filter(track => track.url && track.url.trim() !== "") || [],
      settings: {
        // Color settings
        varUiAccent: reel.varUiAccent || "#2a0026",
        varWaveformUnplayed: reel.varWaveformUnplayed || "#929292",
        varWaveformHover: reel.varWaveformHover || "rgba(0, 31, 103, 0.13)",
        
        // Background settings
        backgroundImage: reel.backgroundImage,
        backgroundImageEnabled: reel.backgroundImageEnabled,
        overlayColor: reel.overlayColor,
        overlayColorEnabled: reel.overlayColorEnabled,
        backgroundOpacity: reel.backgroundOpacity,
        backgroundBlur: reel.backgroundBlur,
        
        // Title appearance
        titleAppearance: reel.titleAppearance || {},
        
        // Blend modes and effects
        backgroundBlendMode: reel.backgroundBlendMode,
        elementBlendMode: reel.elementBlendMode
      },
      created: new Date().toISOString()
    };
    
    // Store the reel data in localStorage (in production, this would be a server endpoint)
    localStorage.setItem(`reel_${reelId}`, JSON.stringify(reelData));
    console.log(`🎵 Reel stored with ID: ${reelId}`);
    
    return reelData;
  }

  generateStandaloneHTML(reel, playlist) {
    const ta = reel.titleAppearance || {};
    
    // Process values similar to previewManager
    let paddingBottom = ta.paddingBottom || "1.5rem";
    if (typeof paddingBottom === "string" && !paddingBottom.match(/[a-z%]+$/)) {
      paddingBottom = paddingBottom + "px";
    }

    const uiAccentColor = reel.varUiAccent || "#2a0026";
    const waveformUnplayed = reel.varWaveformUnplayed || "#929292";
    const waveformHover = reel.varWaveformHover || "rgba(0, 31, 103, 0.13)";
    
    // Process background settings
    const backgroundImage = (reel.backgroundImageEnabled && reel.backgroundImage && reel.backgroundImage.trim()) 
      ? reel.backgroundImage 
      : null;

    let backgroundColor = `rgba(255, 255, 255, ${reel.backgroundOpacity || "1"})`;
    let overlayColor = "rgba(255, 255, 255, 0)";
    
    if (reel.overlayColorEnabled && reel.overlayColor) {
      if (backgroundImage) {
        overlayColor = reel.overlayColor;
      } else {
        backgroundColor = reel.overlayColor;
      }
    }

    const backgroundBlur = reel.backgroundBlur || "2";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reel.title || 'Audio Reel'}</title>
  <style>
    :root {
      --ui-accent: ${uiAccentColor};
      --waveform-unplayed: ${waveformUnplayed};
      --waveform-hover: ${waveformHover};
      --reel-title-size: ${ta.fontSize || "1.3rem"};
      --reel-title-weight: ${ta.fontWeight || "700"};
      --reel-title-align: ${ta.align || "center"};
      --reel-title-padding-bottom: ${paddingBottom};
      --background-color: ${backgroundColor};
      --background-blur: ${backgroundBlur}px;
      --overlay-color: ${overlayColor};
    }
    
    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    
    .reel-player {
      max-width: 800px;
      margin: 0 auto;
      position: relative;
      background-color: var(--background-color);
      ${backgroundImage ? `background-image: url("${backgroundImage}");` : ''}
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      border-radius: 8px;
      overflow: hidden;
      padding: 1rem;
    }
    
    .reel-player::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: var(--overlay-color);
      backdrop-filter: blur(var(--background-blur));
      -webkit-backdrop-filter: blur(var(--background-blur));
      pointer-events: none;
      z-index: 1;
      border-radius: 8px;
    }
    
    .reel-player > * {
      position: relative;
      z-index: 2;
    }
    
    .reel-title {
      text-align: var(--reel-title-align);
      font-size: var(--reel-title-size);
      font-weight: var(--reel-title-weight);
      margin-bottom: var(--reel-title-padding-bottom);
      color: var(--ui-accent);
    }
    
    .player-content${!reel.showTitle ? '.no-title' : ''} {
      ${!reel.showTitle ? 'padding-top: 3rem;' : ''}
    }
    
    .track-info {
      min-height: 1.2rem;
      margin-bottom: 0.75rem;
      margin-left: 3.7rem;
      padding-left: 0.5rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--ui-accent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .player-container {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .icon-button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      color: var(--ui-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
    }
    
    .icon-button:hover {
      transform: scale(1.1);
    }
    
    .heroicon {
      width: 46px;
      height: 46px;
      padding-top: 0.2rem;
      color: var(--ui-accent);
    }
    
    .waveform-container {
      flex: 1;
      position: relative;
      height: 85px;
    }
    
    #waveform {
      position: relative;
      overflow: visible;
      width: 100%;
      height: 100%;
    }
    
    .playlist {
      margin-top: 2.5rem;
      ${!reel.showTitle ? 'padding-bottom: 2.5rem;' : ''}
    }
    
    .playlist-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      cursor: pointer;
      color: var(--ui-accent);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform: scale(0.95);
      opacity: 0.7;
      border-radius: 4px;
      margin-bottom: 0px;
      transform-origin: center;
    }
    
    .playlist-item:first-child {
      margin-top: 4px;
    }
    
    .playlist-item:hover {
      transform: scale(0.98);
      opacity: 0.85;
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    .playlist-item.active {
      transform: scale(1);
      opacity: 1;
      font-weight: 600;
      background-color: rgba(255, 255, 255, 0.05);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .playlist-duration {
      margin-left: 1rem;
      color: var(--ui-accent);
      font-size: 0.85rem;
      opacity: 0.8;
    }
    
    .playlist-item.active .playlist-duration {
      font-weight: 600;
      opacity: 1;
    }
    
    .loading {
      position: absolute;
      top: 0; left: 0;
      z-index: 10;
      background: rgba(255, 255, 255, 0.9);
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    
    .loading.show {
      opacity: 1;
      pointer-events: auto;
    }
    
    .volume-control {
      display: flex;
      position: relative;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s ease;
      height: 100%;
    }
    
    .volume-control.show-slider #volumeSlider {
      opacity: 1;
      transform: scaleY(1);
      pointer-events: auto;
    }
    
    #volumeToggle .heroicon {
      width: 32px;
      height: 32px;
    }
    
    #volumeSlider {
      opacity: 0;
      transform: scaleY(0);
      transform-origin: bottom center;
      transition: opacity 0.2s ease, transform 0.2s ease;
      writing-mode: vertical-rl;
      direction: rtl;
      -webkit-appearance: none;
      appearance: none;
      width: 6px;
      height: 80px;
      position: absolute;
      bottom: 80%;
      margin-bottom: 0.01rem;
      background: var(--waveform-unplayed);
      border-radius: 6px;
      outline: none;
      cursor: pointer;
      pointer-events: none;
    }
    
    #volumeSlider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ui-accent);
      border: none;
      cursor: pointer;
    }
    
    #volumeSlider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ui-accent);
      border: none;
      cursor: pointer;
    }
    
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="reel-player">
    <div class="player-content${!reel.showTitle ? ' no-title' : ''}">
      ${reel.showTitle && reel.title && reel.title.trim() ? `<div class="reel-title">${reel.title}</div>` : ''}
      <div class="track-info" id="trackInfo"></div>
      <div class="player-container">
        <button id="playPause" class="icon-button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
            <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd"/>
          </svg>
        </button>
        <div class="waveform-container">
          <div id="waveform"></div>
          <div id="loading" class="loading">
            <div style="width: 60px; height: 60px; border: 4px solid #f3f3f3; border-top: 4px solid var(--ui-accent); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <style>
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </div>
        </div>
        <div class="volume-control" id="volumeControl">
          <button id="volumeToggle" class="icon-button">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
              <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
          <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="1"/>
        </div>
      </div>
    </div>
    <div class="playlist" id="playlist">
      ${this.generatePlaylistHTML(playlist)}
    </div>
  </div>

                <script src="https://cdn.jsdelivr.net/npm/wavesurfer.js@7"></script>
                <script>
                  // Network and loading diagnostics
                  console.log('🌐 Environment:', {
                    location: window.location.href,
                    protocol: window.location.protocol,
                    userAgent: navigator.userAgent.substring(0, 50) + '...'
                  });
                  
                  // Multiple CDN fallback approach
                  async function loadWaveSurferWithFallback() {
                    // Try different CDN sources
                    const sources = [
                      'https://cdn.jsdelivr.net/npm/wavesurfer.js@7',
                      'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js',
                      'https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.8.2/wavesurfer.min.js'
                    ];
                    
                    for (const src of sources) {
                      try {
                        console.log('🔄 Trying WaveSurfer from:', src);
                        const response = await fetch(src, { method: 'HEAD' });
                        if (response.ok) {
                          console.log('✅ CDN source available:', src);
                          return true;
                        }
                      } catch (error) {
                        console.log('❌ CDN source failed:', src, error.message);
                      }
                    }
                    return false;
                  }
                  
                  // Test CDN connectivity
                  loadWaveSurferWithFallback().then(available => {
                    if (!available) {
                      console.error('❌ All CDN sources failed');
                      console.log('💡 This might be a network/CORS issue with localhost');
                    }
                  });
                  
                  // Wait for WaveSurfer to load, then initialize
                  function initializePlayer() {
                    console.log('🎵 Initializing player...');
                    console.log('WaveSurfer available:', typeof WaveSurfer !== 'undefined');
                    console.log('WaveSurfer object type:', typeof WaveSurfer);
                    
                    if (typeof WaveSurfer === 'undefined') {
                      console.error('❌ WaveSurfer failed to load');
                      console.log('💡 This is likely due to localhost CORS restrictions');
                      console.log('💡 The embed will work properly when hosted on a real domain');
                      document.getElementById('waveform').innerHTML = 
                        '<div style="color: #856404; background: #fff3cd; border: 1px solid #ffeaa7; text-align: center; padding: 20px; border-radius: 8px; font-size: 14px; line-height: 1.5;">' +
                          '<strong>⚠️ Development Environment Limitation</strong><br>' +
                          'WaveSurfer cannot load due to localhost CORS restrictions.<br>' +
                          '<strong>This embed will work properly when uploaded to a real website.</strong><br>' +
                          '<small>For testing purposes, try the exported HTML file directly in browser.</small>' +
                        '</div>';
                      return;
                    }
                    
                    console.log('✅ WaveSurfer loaded successfully, proceeding with initialization...');
                    
                    const playlist = ${JSON.stringify(playlist, null, 2)};
                    let currentTrackIndex = 0;
                    let wavesurfer = null;
                    let isPlaying = false;
                    
                    console.log('📋 Playlist data:', playlist.length, 'tracks');
                  
                  // Preload durations for playlist items
                  function preloadDurations() {
                    playlist.forEach((track, index) => {
                      const durationEl = document.querySelector(\`.playlist-item[data-index="\${index}"] .playlist-duration\`);
                      if (!durationEl || durationEl.textContent !== '--:--') return;
                      
                      const audio = new Audio(convertDropboxLink(track.url));
                      audio.addEventListener('loadedmetadata', () => {
                        const minutes = Math.floor(audio.duration / 60);
                        const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
                        durationEl.textContent = \`\${minutes}:\${seconds}\`;
                      });
                      
                      audio.addEventListener('error', () => {
                        durationEl.textContent = '0:00';
                      });
                    });
                  }
                  
                  // Initialize durations
                  if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => preloadDurations());
                  } else {
                    setTimeout(() => preloadDurations(), 200);
                  }
                  function convertDropboxLink(url) {
                    if (url.includes('dropbox.com') && !url.includes('&dl=1')) {
                      return url.replace(/[?&]dl=0/, '').replace(/[?&]dl=1/, '') + (url.includes('?') ? '&' : '?') + 'dl=1';
                    }
                    return url;
                  }
                  
                  // Initialize player
                  async function initPlayer() {
                    console.log('🚀 initPlayer() called');
                    const waveformContainer = document.getElementById('waveform');
                    const playPauseBtn = document.getElementById('playPause');
                    const trackInfo = document.getElementById('trackInfo');
                    const loading = document.getElementById('loading');
                    const volumeControl = document.getElementById('volumeControl');
                    const volumeToggle = document.getElementById('volumeToggle');
                    const volumeSlider = document.getElementById('volumeSlider');
                    
                    console.log('🔍 DOM elements found:', {
                      waveform: !!waveformContainer,
                      playPause: !!playPauseBtn,
                      trackInfo: !!trackInfo,
                      loading: !!loading,
                      volumeControl: !!volumeControl,
                      volumeToggle: !!volumeToggle,
                      volumeSlider: !!volumeSlider
                    });
                    
                    if (!waveformContainer || !playPauseBtn || !trackInfo) {
                      console.error('❌ Required elements not found:', {
                        waveform: !!waveformContainer,
                        playPause: !!playPauseBtn,
                        trackInfo: !!trackInfo
                      });
                      return;
                    }
                    
                    console.log('✅ All required elements found, creating WaveSurfer...');
                    
                    try {
                      wavesurfer = WaveSurfer.create({
                        container: waveformContainer,
                        waveColor: '${waveformUnplayed}',
                        progressColor: '${uiAccentColor}',
                        height: 85,
                        barWidth: 2,
                        barGap: 1,
                        barRadius: 1,
                        responsive: true,
                        normalize: true
                      });
                      
                      console.log('✅ WaveSurfer created successfully');
                      
                      // Setup volume controls
                      if (volumeControl && volumeToggle && volumeSlider) {
                        let previousVolume = 1;
                        let isDraggingSlider = false;
                        let isHoveringSlider = false;
                        let isHoveringIcon = false;
                        let hideSliderTimeout;
                        
                        const volumeIconLoud = \`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
                            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
                            <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
                          </svg>
                        \`;
                        
                        const volumeIconMuted = \`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
                            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L19.22 12l-1.44-1.22Z"/>
                          </svg>
                        \`;
                        
                        volumeToggle.addEventListener('click', () => {
                          const currentVolume = parseFloat(volumeSlider.value);
                          if (currentVolume === 0) {
                            volumeSlider.value = previousVolume;
                          } else {
                            previousVolume = currentVolume;
                            volumeSlider.value = 0;
                          }
                          volumeSlider.dispatchEvent(new Event('input'));
                        });
                        
                        volumeSlider.addEventListener('input', (e) => {
                          const volume = parseFloat(e.target.value);
                          wavesurfer.setVolume(volume);
                          volumeToggle.innerHTML = volume === 0 ? volumeIconMuted : volumeIconLoud;
                        });
                        
                        volumeSlider.addEventListener('mousedown', () => {
                          isDraggingSlider = true;
                        });
                        
                        document.addEventListener('mouseup', () => {
                          isDraggingSlider = false;
                        });
                        
                        volumeControl.addEventListener('mouseenter', () => {
                          clearTimeout(hideSliderTimeout);
                          volumeControl.classList.add('show-slider');
                        });
                        
                        volumeControl.addEventListener('mouseleave', () => {
                          hideSliderTimeout = setTimeout(() => {
                            if (!isDraggingSlider && !isHoveringSlider && !isHoveringIcon) {
                              volumeControl.classList.remove('show-slider');
                            }
                          }, 300);
                        });
                        
                        volumeSlider.addEventListener('mouseenter', () => {
                          isHoveringSlider = true;
                          clearTimeout(hideSliderTimeout);
                        });
                        
                        volumeSlider.addEventListener('mouseleave', () => {
                          isHoveringSlider = false;
                          hideSliderTimeout = setTimeout(() => {
                            if (!isDraggingSlider && !isHoveringSlider && !isHoveringIcon) {
                              volumeControl.classList.remove('show-slider');
                            }
                          }, 300);
                        });
                        
                        volumeToggle.addEventListener('mouseenter', () => {
                          isHoveringIcon = true;
                          clearTimeout(hideSliderTimeout);
                        });
                        
                        volumeToggle.addEventListener('mouseleave', () => {
                          isHoveringIcon = false;
                          hideSliderTimeout = setTimeout(() => {
                            if (!isDraggingSlider && !isHoveringSlider && !isHoveringIcon) {
                              volumeControl.classList.remove('show-slider');
                            }
                          }, 300);
                        });
                      }
                      
                      // Load first track
                      loadTrack(0);
                      
                      // Play/pause button
                      playPauseBtn.addEventListener('click', () => {
                        if (wavesurfer) {
                          wavesurfer.playPause();
                        }
                      });
                      
                      // Wavesurfer events
                      wavesurfer.on('play', () => {
                        isPlaying = true;
                        playPauseBtn.innerHTML = \`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
                            <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd"/>
                          </svg>
                        \`;
                      });
                      
                      wavesurfer.on('pause', () => {
                        isPlaying = false;
                        playPauseBtn.innerHTML = \`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
                            <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd"/>
                          </svg>
                        \`;
                      });
                      
                      wavesurfer.on('finish', () => {
                        // Auto-advance to next track
                        if (currentTrackIndex < playlist.length - 1) {
                          loadTrack(currentTrackIndex + 1);
                          setTimeout(() => wavesurfer.play(), 100);
                        }
                      });
                      
                      wavesurfer.on('loading', (percent) => {
                        if (loading) {
                          if (percent < 100) {
                            loading.classList.add('show');
                          } else {
                            loading.classList.remove('show');
                          }
                        }
                      });
                      
                      // Playlist click handlers
                      document.querySelectorAll('.playlist-item').forEach((item, index) => {
                        item.addEventListener('click', () => {
                          loadTrack(index);
                        });
                      });
                      
                    } catch (error) {
                      console.error('Error initializing player:', error);
                      waveformContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">Failed to initialize audio player.</div>';
                    }
                  }
                  
                  function loadTrack(index) {
                    if (index < 0 || index >= playlist.length) return;
                    
                    currentTrackIndex = index;
                    const track = playlist[index];
                    const convertedURL = convertDropboxLink(track.url);
                    
                    // Update UI
                    document.querySelectorAll('.playlist-item').forEach((item, i) => {
                      item.classList.toggle('active', i === index);
                    });
                    
                    const trackInfo = document.getElementById('trackInfo');
                    if (trackInfo) {
                      trackInfo.textContent = track.title || 'Untitled Track';
                    }
                    
                    // Load audio
                    if (wavesurfer) {
                      try {
                        wavesurfer.load(convertedURL);
                      } catch (error) {
                        console.error('Error loading track:', error);
                      }
                    }
                  }
                  
                  // Now call initPlayer to actually start the player
                  console.log('🔄 About to call initPlayer()...');
                  initPlayer();
                  
                  } // End of initializePlayer function
                  
                  // Start initialization when WaveSurfer script loads
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                      // Small delay to ensure WaveSurfer script is loaded
                      setTimeout(initializePlayer, 100);
                    });
                  } else {
                    setTimeout(initializePlayer, 100);
                  }
                </script>
</body>
</html>`;
  }

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
