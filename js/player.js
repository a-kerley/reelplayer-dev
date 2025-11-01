// player.js
import { colorToRgba } from './modules/colorUtils.js';

export const playerApp = {
  elements: {},
  isWaveformReady: false,
  wavesurfer: null,
  previousVolume: 1,
  isDraggingSlider: false,
  isHoveringSlider: false,
  isHoveringIcon: false,
  currentTrackIndex: 0,
  activeFadeOut: null, // Track active fade-out to allow cancellation
  wasPlayingBeforeTrackSwitch: false, // Track if we need to auto-resume with fade-in
  isTrackSwitching: false, // Flag to prevent pause event from interfering during track switch
  
  // Expandable mode state - consolidated
  expandable: {
    enabled: false,
    isExpanded: false,
    isPlaying: false,
    showWaveformOnCollapse: true,
    settings: null,
    listeners: null,
    playbackIdleTimeout: null,       // Single timeout for playback-idle transitions
    collapsedIdleTimeout: null,      // Single timeout for collapsed-idle transitions
    collapseDelayTimeout: null,      // Timeout for collapse delay
    collapseFadeTimeout: null        // Timeout for collapse fade
  },

  // Static mode state - for idle state management
  static: {
    listeners: null,
    playbackIdleTimeout: null        // Timeout for playback-idle in static mode
  },

  // Background zoom animations (Web Animations API)
  backgroundAnimations: {
    main: null,        // Animation for main background (::after)
    layerA: null,      // Animation for track background layer A
    layerB: null       // Animation for track background layer B
  },

  // Video background state - dual layer architecture for crossfade
  videoState: {
    // Layer A references
    mainVideoA: null,
    trackVideoA: null,
    // Layer B references
    mainVideoB: null,
    trackVideoB: null,
    // Current layer tracking ('a' or 'b')
    currentMainLayer: 'a',
    currentTrackLayer: 'a',
    // URL tracking per layer
    mainVideoA_Url: '',
    mainVideoB_Url: '',
    trackVideoA_Url: '',
    trackVideoB_Url: '',
    // Playback state
    mainVideoPlaying: false,
    trackVideoPlaying: false,
    // In-progress fade tracking (to handle interruptions)
    activeFades: new Map() // Maps videoElement -> {type: 'in'|'out', abort: Function}
  },

  // Image preloading cache - stores Image objects to keep images in browser cache
  imageCache: {
    preloadedImages: new Map(), // Map of URL -> Image object
    preloadQueue: [],           // Array of URLs pending preload
    isPreloading: false,        // Flag to prevent concurrent preload operations
    maxCacheSize: 10            // Maximum number of images to keep in cache
  },

  cacheElements() {
    this.elements.waveform = document.getElementById("waveform");
    this.elements.playPauseBtn = document.getElementById("playPause");
    this.elements.volumeControl = document.querySelector(".volume-control");
    this.elements.volumeToggle = document.getElementById("volumeToggle");
    this.elements.volumeSlider = document.getElementById("volumeSlider");
    this.elements.hoverOverlay = document.querySelector(".hover-overlay");
    this.elements.hoverTime = document.querySelector(".hover-time");
    this.elements.playheadTime = document.querySelector(".playhead-time");
    this.elements.loadingIndicator = document.getElementById("loading");
    this.elements.trackInfo = document.querySelector(".track-info");
    this.elements.totalTime = document.getElementById("total-time");
    this.elements.playlist = document.getElementById("playlist");
    this.elements.playerWrapper = document.querySelector(".player-wrapper");
    this.elements.projectTitleOverlay = document.querySelector(".project-title-overlay");
    
    // Cache video elements - dual layer architecture
    this.videoState.mainVideoA = document.querySelector(".main-video-a");
    this.videoState.mainVideoB = document.querySelector(".main-video-b");
    this.videoState.trackVideoA = document.querySelector(".track-video-a");
    this.videoState.trackVideoB = document.querySelector(".track-video-b");
  },

  renderPlaylist(playlist) {
    const playlistEl = this.elements.playlist;
    playlistEl.innerHTML = "";
    playlist.forEach((track, index) => {
      const trackEl = document.createElement("div");
      trackEl.className = "playlist-item";
      trackEl.dataset.index = index;

      const titleEl = document.createElement("span");
      titleEl.textContent =
        track.title ||
        track.url
          .split("/")
          .pop()
          .split("?")[0]
          .replace(/[_-]/g, " ")
          .replace(/\.[^/.]+$/, "");
      titleEl.style.flex = "1";

      const durationEl = document.createElement("span");
      durationEl.className = "playlist-duration";
      durationEl.textContent = "...";

      trackEl.appendChild(titleEl);
      trackEl.appendChild(durationEl);

      trackEl.addEventListener("click", () => {
        const url = playerApp.convertDropboxLinkToDirect(track.url);
        playerApp.initializePlayer(url, track.title, index);
      });

      playlistEl.appendChild(trackEl);
    });
    // Preload durations after rendering playlist items
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => this.preloadDurations(playlist));
    } else {
      setTimeout(() => this.preloadDurations(playlist), 200);
    }
    
    // Preload background images for first track and adjacent tracks
    if (playlist.length > 0) {
      // Use idle callback for image preloading to avoid blocking
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => this.preloadBackgroundImages(0, playlist));
      } else {
        setTimeout(() => this.preloadBackgroundImages(0, playlist), 300);
      }
    }
    
    // Initialize custom scrollbar immediately - DOM is ready after innerHTML
    this.initCustomScrollbar(playlistEl);
  },

  initCustomScrollbar(playlistEl) {
    // Remove any existing custom scrollbar
    const existingScrollbar = playlistEl.querySelector('.custom-scrollbar');
    if (existingScrollbar) {
      existingScrollbar.remove();
    }

    // Get UI accent color from CSS variable
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim() || '#2a0026';
    const thumbColor = colorToRgba(accentColor, 0.3);

    // Create custom scrollbar elements - position relative to playlist's parent
    const playlistParent = playlistEl.parentElement;
    const scrollbarContainer = document.createElement('div');
    scrollbarContainer.className = 'custom-scrollbar';
    scrollbarContainer.style.cssText = 'position: absolute; right: 15px; width: 6px; background: transparent; z-index: 1000; pointer-events: none;';
    
    const scrollbarThumb = document.createElement('div');
    scrollbarThumb.className = 'custom-scrollbar-thumb';
    scrollbarThumb.style.cssText = `position: absolute; right: 0; width: 6px; background: ${thumbColor}; border-radius: 3px; pointer-events: auto; cursor: pointer; transition: background 0.2s ease;`;
    
    scrollbarContainer.appendChild(scrollbarThumb);
    playlistParent.appendChild(scrollbarContainer);
    
    // Position scrollbar to match playlist position
    const updateScrollbarPosition = () => {
      const playlistRect = playlistEl.getBoundingClientRect();
      const parentRect = playlistParent.getBoundingClientRect();
      const topOffset = playlistRect.top - parentRect.top;
      scrollbarContainer.style.top = topOffset + 'px';
      scrollbarContainer.style.height = playlistRect.height + 'px';
    };

    // Update scrollbar position and size
    const updateScrollbar = () => {
      updateScrollbarPosition();
      
      const scrollHeight = playlistEl.scrollHeight;
      const clientHeight = playlistEl.clientHeight;
      
      if (scrollHeight <= clientHeight) {
        scrollbarContainer.style.display = 'none';
        playlistEl.classList.remove('scrollable');
        playlistEl.classList.remove('scroll-at-top');
        playlistEl.classList.remove('scroll-at-bottom');
        return;
      }
      
      scrollbarContainer.style.display = 'block';
      playlistEl.classList.add('scrollable');
      
      const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * clientHeight);
      const scrollPercentage = playlistEl.scrollTop / (scrollHeight - clientHeight);
      const thumbTop = scrollPercentage * (clientHeight - thumbHeight);
      
      scrollbarThumb.style.height = thumbHeight + 'px';
      scrollbarThumb.style.top = thumbTop + 'px';
      
      // Update scroll position classes for dynamic masking
      const scrollTop = playlistEl.scrollTop;
      const atTop = scrollTop <= 1; // Small threshold for rounding
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      
      if (atTop) {
        playlistEl.classList.add('scroll-at-top');
      } else {
        playlistEl.classList.remove('scroll-at-top');
      }
      
      if (atBottom) {
        playlistEl.classList.add('scroll-at-bottom');
      } else {
        playlistEl.classList.remove('scroll-at-bottom');
      }
    };
    
    // Initial position
    updateScrollbarPosition();

    // Smooth scrolling with momentum for mouse wheel
    let scrollVelocity = 0;
    let isScrolling = false;
    let scrollAnimationFrame = null;

    const smoothScroll = () => {
      if (Math.abs(scrollVelocity) > 0.1) {
        playlistEl.scrollTop += scrollVelocity;
        scrollVelocity *= 0.92; // Friction/deceleration factor
        scrollAnimationFrame = requestAnimationFrame(smoothScroll);
        isScrolling = true;
      } else {
        scrollVelocity = 0;
        isScrolling = false;
        cancelAnimationFrame(scrollAnimationFrame);
      }
    };

    // Handle scroll events
    playlistEl.addEventListener('scroll', () => {
      if (!isDragging) {
        updateScrollbar();
      }
    });
    
    // Prevent page scroll when playlist reaches top/bottom + add smooth momentum
    playlistEl.addEventListener('wheel', (e) => {
      const scrollHeight = playlistEl.scrollHeight;
      const scrollTop = playlistEl.scrollTop;
      const clientHeight = playlistEl.clientHeight;
      
      const atTop = scrollTop === 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1; // -1 for rounding
      
      // If scrolling up at top, or scrolling down at bottom, prevent propagation
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Apply smooth momentum scrolling
      e.preventDefault();
      e.stopPropagation();
      
      // Add to velocity (scaled down for smooth control)
      scrollVelocity += e.deltaY * 0.5;
      
      // Start smooth scroll animation if not already running
      if (!isScrolling) {
        smoothScroll();
      }
    }, { passive: false });
    
    // Handle thumb dragging
    let isDragging = false;
    let startY = 0;
    let startThumbTop = 0;

    scrollbarThumb.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startThumbTop = parseInt(scrollbarThumb.style.top) || 0;
      scrollbarThumb.style.background = colorToRgba(accentColor, 0.5);
      e.preventDefault();
      e.stopPropagation();
    });

    scrollbarThumb.addEventListener('mouseenter', () => {
      if (!isDragging) {
        scrollbarThumb.style.background = colorToRgba(accentColor, 0.4);
      }
    });

    scrollbarThumb.addEventListener('mouseleave', () => {
      if (!isDragging) {
        scrollbarThumb.style.background = colorToRgba(accentColor, 0.3);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaY = e.clientY - startY;
      const scrollHeight = playlistEl.scrollHeight;
      const clientHeight = playlistEl.clientHeight;
      const thumbHeight = parseInt(scrollbarThumb.style.height);
      const maxThumbTop = clientHeight - thumbHeight;
      const scrollRange = scrollHeight - clientHeight;
      
      // Calculate new thumb position based on drag
      let newThumbTop = startThumbTop + deltaY;
      newThumbTop = Math.max(0, Math.min(maxThumbTop, newThumbTop));
      
      // Update thumb position visually
      scrollbarThumb.style.top = `${newThumbTop}px`;
      
      // Update scroll position based on thumb position
      const scrollPercentage = newThumbTop / maxThumbTop;
      playlistEl.scrollTop = scrollPercentage * scrollRange;
      
      e.preventDefault();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        scrollbarThumb.style.background = colorToRgba(accentColor, 0.3);
      }
    });

    // Initial update immediately
    updateScrollbar();
    
    // Additional delayed updates for both modes to handle layout transitions
    setTimeout(updateScrollbar, 100);
    setTimeout(updateScrollbar, 500);
    
    // Update on window resize
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(playlistEl);
  },

  preloadDurations(playlist) {
    playlist.forEach((track, index) => {
      const durationEl = this.elements.playlist.querySelector(
        `.playlist-item[data-index="${index}"] .playlist-duration`
      );
      if (!durationEl) return;
      
      // Use WaveSurfer to decode duration for accurate results (especially for OGG files)
      const tempWavesurfer = WaveSurfer.create({
        container: document.createElement("div"),
        height: 0,
        backend: "WebAudio",
      });

      tempWavesurfer.once("ready", () => {
        const duration = tempWavesurfer.getDuration();
        if (duration && isFinite(duration)) {
          durationEl.textContent = this.formatTime(duration);
        } else {
          durationEl.textContent = "—";
        }
        tempWavesurfer.destroy(); // Clean up
      });

      tempWavesurfer.on("error", () => {
        durationEl.textContent = "—";
        tempWavesurfer.destroy();
      });

      const audioURL = this.convertDropboxLinkToDirect(track.url);
      tempWavesurfer.load(audioURL);
    });
  },

  /**
   * Preload background images for current and upcoming tracks
   * @param {number} currentIndex - Current track index
   * @param {Array} playlist - Playlist array with track data
   */
  preloadBackgroundImages(currentIndex, playlist) {
    if (!playlist || playlist.length === 0) return;

    const imagesToPreload = [];
    
    // Get current track image
    const currentTrack = playlist[currentIndex];
    if (currentTrack?.backgroundImage) {
      imagesToPreload.push(currentTrack.backgroundImage);
    }
    
    // Get next track image (loop to start if at end)
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];
    if (nextTrack?.backgroundImage) {
      imagesToPreload.push(nextTrack.backgroundImage);
    }
    
    // Get previous track image (loop to end if at start)
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    const prevTrack = playlist[prevIndex];
    if (prevTrack?.backgroundImage) {
      imagesToPreload.push(prevTrack.backgroundImage);
    }
    
    // Get project title image from reel settings
    const reelSettings = this.currentReelSettings || window.currentReelSettings;
    if (reelSettings?.projectTitleImage) {
      imagesToPreload.push(reelSettings.projectTitleImage);
    }
    
    // Get main background image
    if (reelSettings?.backgroundImage && reelSettings?.backgroundImageEnabled) {
      imagesToPreload.push(reelSettings.backgroundImage);
    }
    
    // Remove duplicates
    const uniqueImages = [...new Set(imagesToPreload)];
    
    // Add to preload queue
    this.imageCache.preloadQueue = uniqueImages;
    
    // Start preloading
    this.processImagePreloadQueue();
    
    console.log(`[Image Preload] Queued ${uniqueImages.length} images for preloading`);
  },

  /**
   * Process the image preload queue
   */
  processImagePreloadQueue() {
    // Already preloading, skip
    if (this.imageCache.isPreloading) return;
    
    // No images to preload
    if (this.imageCache.preloadQueue.length === 0) return;
    
    this.imageCache.isPreloading = true;
    
    // Process images one at a time to avoid overwhelming the browser
    const preloadNext = () => {
      if (this.imageCache.preloadQueue.length === 0) {
        this.imageCache.isPreloading = false;
        return;
      }
      
      const imageUrl = this.imageCache.preloadQueue.shift();
      
      // Skip if already cached
      if (this.imageCache.preloadedImages.has(imageUrl)) {
        preloadNext();
        return;
      }
      
      // Create new Image object to trigger browser cache
      const img = new Image();
      
      img.onload = () => {
        console.log(`[Image Preload] ✓ Loaded: ${imageUrl.split('/').pop()}`);
        
        // Add to cache
        this.imageCache.preloadedImages.set(imageUrl, img);
        
        // Enforce cache size limit (remove oldest entries)
        if (this.imageCache.preloadedImages.size > this.imageCache.maxCacheSize) {
          const firstKey = this.imageCache.preloadedImages.keys().next().value;
          this.imageCache.preloadedImages.delete(firstKey);
          console.log(`[Image Preload] Cache full, removed: ${firstKey.split('/').pop()}`);
        }
        
        // Preload next image
        preloadNext();
      };
      
      img.onerror = () => {
        console.warn(`[Image Preload] ✗ Failed to load: ${imageUrl}`);
        // Continue with next image even if one fails
        preloadNext();
      };
      
      // Start loading
      img.src = imageUrl;
    };
    
    // Start the preload chain
    preloadNext();
  },

  /**
   * Clear the image cache
   */
  clearImageCache() {
    this.imageCache.preloadedImages.clear();
    this.imageCache.preloadQueue = [];
    console.log('[Image Preload] Cache cleared');
  },

  convertDropboxLinkToDirect(url) {
    if (!url.includes("dropbox.com")) return url;
    return url
      .replace("www.dropbox.com", "dl.dropboxusercontent.com")
      .replace("dropbox.com", "dl.dropboxusercontent.com")
      .replace("?dl=0", "?dl=1")
      .replace("&dl=0", "&dl=1");
  },

  async initializePlayer(audioURL, title, index) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[TRACK SWITCH] 🎵 Starting track switch to index ${index}: "${title}"`);
    console.log(`[TRACK SWITCH] Audio URL: ${audioURL}`);
    console.log(`${'='.repeat(80)}\n`);
    
    this.showLoading(true);
    
    // Initialize main background animation on first load
    if (!this.backgroundAnimations.main) {
      this.initMainBackgroundAnimation();
    }
    
    // Check if playback is active
    const isPlaybackActive = this.wavesurfer?.isPlaying() || false;
    console.log(`[TRACK SWITCH] Playback state: ${isPlaybackActive ? '▶️ PLAYING' : '⏸️ STOPPED'}`);
    
    // Store state for auto-resume with fade-in after load
    // Don't overwrite if already set (e.g., by auto-play from finish event)
    if (!this.wasPlayingBeforeTrackSwitch) {
      this.wasPlayingBeforeTrackSwitch = isPlaybackActive;
    }
    console.log(`[TRACK SWITCH] wasPlayingBeforeTrackSwitch flag: ${this.wasPlayingBeforeTrackSwitch}`);
    
    // Set flag to prevent pause event from interfering with video transitions
    if (isPlaybackActive) {
      this.isTrackSwitching = true;
      console.log('[TRACK SWITCH] 🚩 Set isTrackSwitching flag to prevent pause event interference');
    }
    
    // If switching tracks during playback, fade out audio and pause to prevent pop
    if (isPlaybackActive) {
      console.log('[TRACK SWITCH] Applying audio fade-out before track switch');
      await this.applyAudioFadeOut(true); // Pass true to pause after fade
      // Note: Pause event will fire but will skip stopVideo() due to isTrackSwitching flag
    }
    
    // Crossfade videos when switching tracks
    // This happens in background, no need to wait - new track loads while fade occurs
    if (isPlaybackActive) {
      // During playback: crossfade old video out (revealing background)
      // New video will be preloaded and ready to fade in when playback starts
      const fadeOutDuration = this.getVideoTransitionDuration('trackSwitch');
      console.log(`[TRACK SWITCH] Using track-switch fade duration: ${fadeOutDuration}ms`);
      
      // Fade out current layers (both track and main if active)
      // Use getActiveOrFadingVideo to catch videos that are mid-fade
      const currentTrackLayer = this.getActiveOrFadingVideo('track');
      const currentMainLayer = this.getActiveOrFadingVideo('main');
      
      console.log(`[TRACK SWITCH] Current video layer state:`, {
        trackLayer: this.videoState.currentTrackLayer,
        mainLayer: this.videoState.currentMainLayer,
        trackVideo: currentTrackLayer ? {
          className: currentTrackLayer.className,
          hasActive: currentTrackLayer.classList.contains('active'),
          opacity: window.getComputedStyle(currentTrackLayer).opacity,
          src: currentTrackLayer.src ? currentTrackLayer.src.substring(currentTrackLayer.src.lastIndexOf('/') + 1) : 'none'
        } : 'null',
        mainVideo: currentMainLayer ? {
          className: currentMainLayer.className,
          hasActive: currentMainLayer.classList.contains('active'),
          opacity: window.getComputedStyle(currentMainLayer).opacity,
          src: currentMainLayer.src ? currentMainLayer.src.substring(currentMainLayer.src.lastIndexOf('/') + 1) : 'none'
        } : 'null'
      });
      
      // Check if track video needs fade-out (either fully active OR currently fading)
      if (currentTrackLayer) {
        const trackFadeState = this.videoState.activeFades.get(currentTrackLayer);
        const hasActiveClass = currentTrackLayer.classList.contains('active');
        const currentOpacity = parseFloat(window.getComputedStyle(currentTrackLayer).opacity);
        
        if (hasActiveClass || trackFadeState || currentOpacity > 0) {
          if (trackFadeState) {
            console.log(`[TRACK SWITCH] 🔄 Interrupting ${trackFadeState.type === 'in' ? 'fade-in' : 'fade-out'} on track video (${this.videoState.currentTrackLayer})`);
          } else {
            console.log(`[TRACK SWITCH] 🎬 Fading out track video (${this.videoState.currentTrackLayer})`);
          }
          this.fadeOutVideo(currentTrackLayer, fadeOutDuration, true).catch(err => 
            console.error('[TRACK SWITCH] ❌ Track video fadeout error:', err)
          );
        } else {
          console.log(`[TRACK SWITCH] ⏭️ No active track video to fade out`);
        }
      } else {
        console.log(`[TRACK SWITCH] ⏭️ No track video layer found`);
      }
      
      // Check if main video needs fade-out (either fully active OR currently fading)
      if (currentMainLayer) {
        const mainFadeState = this.videoState.activeFades.get(currentMainLayer);
        const hasActiveClass = currentMainLayer.classList.contains('active');
        const currentOpacity = parseFloat(window.getComputedStyle(currentMainLayer).opacity);
        
        if (hasActiveClass || mainFadeState || currentOpacity > 0) {
          if (mainFadeState) {
            console.log(`[TRACK SWITCH] 🔄 Interrupting ${mainFadeState.type === 'in' ? 'fade-in' : 'fade-out'} on main video (${this.videoState.currentMainLayer})`);
          } else {
            console.log(`[TRACK SWITCH] 🎬 Fading out main video (${this.videoState.currentMainLayer})`);
          }
          this.fadeOutVideo(currentMainLayer, fadeOutDuration, true).catch(err =>
            console.error('[TRACK SWITCH] ❌ Main video fadeout error:', err)
          );
        } else {
          console.log(`[TRACK SWITCH] ⏭️ No active main video to fade out`);
        }
      } else {
        console.log(`[TRACK SWITCH] ⏭️ No main video layer found`);
      }
      
      // Clear the track switching flag after video fade-outs have been initiated
      // The fades will complete in the background
      console.log('[TRACK SWITCH] ✓ Video fade-outs initiated, clearing isTrackSwitching flag');
      this.isTrackSwitching = false;
    } else {
      console.log(`[TRACK SWITCH] 🧹 Playback stopped - cleaning up active videos immediately`);
      // When stopped: clean up any active videos immediately
      ['track', 'main'].forEach(type => {
        const currentLayer = this.getCurrentLayerVideo(type);
        if (currentLayer?.classList.contains('active')) {
          console.log(`[TRACK SWITCH] 🗑️ Cleaning up ${type} video`);
          this.cleanupVideo(currentLayer, type);
        }
      });
    }
    
    // Update current track index
    this.currentTrackIndex = index;
    
    // Update active playlist item
    this.updateActivePlaylistItem(index);
    
    // Update track info display
    this.updateTrackInfo(audioURL, title);
    
    // Update track background with cross-dissolve
    this.updateTrackBackground(index);
    
    // Preload background images for current and adjacent tracks
    const reelSettings = this.currentReelSettings || window.currentReelSettings;
    if (reelSettings?.playlist) {
      this.preloadBackgroundImages(index, reelSettings.playlist);
    }
    
    // Pre-load video for the new track (will play when audio starts)
    // SKIP preloading if playback is active - let it load when play is pressed
    // This prevents loading on a layer that's currently fading out
    if (!isPlaybackActive) {
      this.preloadVideos();
    } else {
      console.log(`[TRACK SWITCH] ⏭️ Skipping preload during playback - will load when play is pressed`);
    }
    
    // Reset playhead to beginning when changing tracks
    if (playerApp.wavesurfer) {
      playerApp.wavesurfer.seekTo(0);
    }
    
    // Fade out current waveform before loading new track
    // Find the WaveSurfer wrapper (last child div without a class/id)
    const waveformContainer = document.querySelector("#waveform");
    const waveformWrapper = Array.from(waveformContainer?.children || [])
      .find(child => child.tagName === 'DIV' && !child.className && !child.id);
    
    console.log(`[WAVEFORM FADE] Found waveform wrapper to fade out:`, waveformWrapper);
    
    if (waveformWrapper) {
      console.log(`[WAVEFORM FADE] Setting wrapper opacity to 0, current: ${waveformWrapper.style.opacity}`);
      waveformWrapper.style.opacity = "0";
    }
    
    // Show loading indicator while new waveform loads
    this.showLoading(true);
    
    playerApp.wavesurfer.load(audioURL);
    const event = new CustomEvent("track:change", {
      detail: { audioURL, title, index },
    });
    document.dispatchEvent(event);
  },

  /**
   * Check if there's a next track in the playlist
   * @returns {boolean} True if there's a next track
   */
  hasNextTrack() {
    const playlist = this.currentReelSettings?.playlist;
    if (!playlist || playlist.length === 0) return false;
    
    const nextIndex = this.currentTrackIndex + 1;
    return nextIndex < playlist.length;
  },

  /**
   * Play the next track in the playlist
   * Called automatically when a track finishes
   */
  playNextTrack() {
    // Get the current playlist
    const playlist = this.currentReelSettings?.playlist;
    
    if (!playlist || playlist.length === 0) {
      console.log('[Auto-play] No playlist available');
      return;
    }
    
    // Check if there's a next track
    const nextIndex = this.currentTrackIndex + 1;
    
    if (nextIndex >= playlist.length) {
      console.log('[Auto-play] Reached end of playlist, stopping playback');
      return;
    }
    
    console.log(`[Auto-play] Moving to next track: ${nextIndex}`);
    
    // Get the next track
    const nextTrack = playlist[nextIndex];
    const url = this.convertDropboxLinkToDirect(nextTrack.url);
    
    // Set flag to indicate we should auto-resume playback
    console.log('[Auto-play] Setting wasPlayingBeforeTrackSwitch = true');
    this.wasPlayingBeforeTrackSwitch = true;
    
    // Initialize the next track (will auto-play due to flag)
    console.log('[Auto-play] Calling initializePlayer');
    this.initializePlayer(url, nextTrack.title, nextIndex);
  },

  updateTrackBackground(trackIndex) {
    // Get both track background layer elements
    const layerA = document.querySelector('.track-bg-layer-a');
    const layerB = document.querySelector('.track-bg-layer-b');
    if (!layerA || !layerB) return;
    
    // Initialize current layer tracker if not exists
    if (!this.currentTrackBgLayer) {
      this.currentTrackBgLayer = 'a';
    }
    
    // Get current reel settings (from global or stored settings)
    const reelSettings = this.currentReelSettings || window.currentReelSettings;
    if (!reelSettings) return;
    
    // Get the track's background image and zoom
    const playlist = reelSettings.playlist || [];
    const track = playlist[trackIndex];
    const trackBackgroundImage = track?.backgroundImage;
    const trackBackgroundZoom = track?.backgroundZoom || 1;
    

    
    // Determine which layers are current and next
    const currentLayer = this.currentTrackBgLayer === 'a' ? layerA : layerB;
    const nextLayer = this.currentTrackBgLayer === 'a' ? layerB : layerA;
    
    // Get current background image
    const currentBgImage = currentLayer.style.backgroundImage;
    const targetBgImage = trackBackgroundImage && trackBackgroundImage.trim() 
      ? `url("${trackBackgroundImage}")`
      : 'none';
    
    // Check if the background image is actually changing
    const isChanging = currentBgImage !== targetBgImage;
    
    // Check if track has its own background
    if (trackBackgroundImage && trackBackgroundImage.trim()) {
      // If background is changing, crossfade to next layer
      if (isChanging) {
        // Set the new image on the next layer (hidden)
        nextLayer.style.backgroundImage = targetBgImage;
        
        // Set up animation for the next layer
        const zoomMultiplier = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--playback-idle-zoom-multiplier') || 1.2);
        const maxZoom = trackBackgroundZoom * zoomMultiplier;
        
        // Initialize Web Animations API animation for this layer
        this.initTrackLayerAnimation(nextLayer, trackBackgroundZoom, maxZoom);
        
        // Crossfade: fade in next layer while keeping old layer animation active
        requestAnimationFrame(() => {
          nextLayer.classList.add('active');
          // Don't remove 'active' yet - change to 'fading-out' to keep animation
          currentLayer.classList.remove('active');
          currentLayer.classList.add('fading-out');
        });
        
        // Switch the current layer reference
        this.currentTrackBgLayer = this.currentTrackBgLayer === 'a' ? 'b' : 'a';
        
        // Add class and pause main background animation when per-track bg is visible
        if (this.elements.playerWrapper) {
          this.elements.playerWrapper.classList.add('has-track-bg');
          this.backgroundAnimations.main?.pause();
        }
        
        // Clean up the old layer after transition completes
        setTimeout(() => {
          currentLayer.classList.remove('fading-out');
          currentLayer.style.backgroundImage = 'none';
          // Cancel old layer animation
          const oldLayerId = currentLayer.classList.contains('track-bg-layer-a') ? 'layerA' : 'layerB';
          this.backgroundAnimations[oldLayerId]?.cancel();
        }, 800);
      } else {
        // Same image, just ensure current layer is active and update animation
        if (!currentLayer.classList.contains('active')) {
          currentLayer.classList.add('active');
        }
        
        // Update animation for current layer
        const zoomMultiplier = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--playback-idle-zoom-multiplier') || 1.2);
        const maxZoom = trackBackgroundZoom * zoomMultiplier;
        this.initTrackLayerAnimation(currentLayer, trackBackgroundZoom, maxZoom);
      }
    } else {
      // Track doesn't have a custom background - fade out both layers to show main background
      layerA.classList.remove('active');
      layerB.classList.remove('active');
      
      // Remove class to resume main background animation
      if (this.elements.playerWrapper) {
        this.elements.playerWrapper.classList.remove('has-track-bg');
      }
      
      // Clear both layers after fade completes
      setTimeout(() => {
        if (!layerA.classList.contains('active')) {
          layerA.style.backgroundImage = 'none';
        }
        if (!layerB.classList.contains('active')) {
          layerB.style.backgroundImage = 'none';
        }
      }, 800);
    }
  },

  updateTrackInfo(audioURL, title) {
    const trackInfo = this.elements.trackInfo;
    if (trackInfo) {
      const fileName = title || 
        audioURL.split('/').pop().split('?')[0]
          .replace(/[_-]/g, ' ')
          .replace(/\.[^/.]+$/, '');
      trackInfo.textContent = fileName;
      trackInfo.classList.add('visible');
    }
  },

  updateActivePlaylistItem(index) {
    // Remove active class from all items
    const allItems = document.querySelectorAll('.playlist-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    // Add active class to current item
    const activeItem = document.querySelector(`.playlist-item[data-index="${index}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  },

  setupVolumeControls() {
    const volumeControl = this.elements.volumeControl;
    const volumeToggle = this.elements.volumeToggle;
    const volumeSlider = this.elements.volumeSlider;
    const volumeIconLoud = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
        <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
      </svg>
    `;
    const volumeIconMuted = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
      </svg>
    `;
    let hideSliderTimeout;
    volumeToggle.addEventListener("click", () => {
      const currentVolume = parseFloat(volumeSlider.value);
      if (currentVolume === 0) {
        document.dispatchEvent(new CustomEvent("volume:unmute"));
        volumeSlider.value = playerApp.previousVolume;
      } else {
        document.dispatchEvent(new CustomEvent("volume:mute"));
        playerApp.previousVolume = currentVolume;
        volumeSlider.value = 0;
      }
      volumeSlider.dispatchEvent(new Event("input"));
    });
    if (volumeControl && volumeSlider && volumeToggle) {
      volumeSlider.addEventListener("input", (e) => {
        const volume = parseFloat(e.target.value);
        playerApp.wavesurfer.setVolume(volume);
        volumeToggle.innerHTML =
          volume === 0 ? volumeIconMuted : volumeIconLoud;
      });
      volumeSlider.addEventListener("mousedown", () => {
        playerApp.isDraggingSlider = true;
      });
      document.addEventListener("mouseup", () => {
        playerApp.isDraggingSlider = false;
      });
      volumeControl.addEventListener("mouseenter", () => {
        clearTimeout(hideSliderTimeout);
        volumeControl.classList.add("show-slider");
      });
      volumeControl.addEventListener("mouseleave", () => {
        hideSliderTimeout = setTimeout(() => {
          if (
            !playerApp.isDraggingSlider &&
            !playerApp.isHoveringSlider &&
            !playerApp.isHoveringIcon
          ) {
            volumeControl.classList.remove("show-slider");
          }
        }, 300);
      });
      volumeSlider.addEventListener("mouseenter", () => {
        playerApp.isHoveringSlider = true;
        clearTimeout(hideSliderTimeout);
      });
      volumeSlider.addEventListener("mouseleave", () => {
        playerApp.isHoveringSlider = false;
        hideSliderTimeout = setTimeout(() => {
          if (
            !playerApp.isDraggingSlider &&
            !playerApp.isHoveringSlider &&
            !playerApp.isHoveringIcon
          ) {
            volumeControl.classList.remove("show-slider");
          }
        }, 300);
      });
      volumeToggle.addEventListener("mouseenter", () => {
        playerApp.isHoveringIcon = true;
        clearTimeout(hideSliderTimeout);
      });
      volumeToggle.addEventListener("mouseleave", () => {
        playerApp.isHoveringIcon = false;
        hideSliderTimeout = setTimeout(() => {
          if (
            !playerApp.isDraggingSlider &&
            !playerApp.isHoveringSlider &&
            !playerApp.isHoveringIcon
          ) {
            volumeControl.classList.remove("show-slider");
          }
        }, 300);
      });
    }
  },

  setupWaveformEvents() {
    const waveformEl = this.elements.waveform;
    const hoverOverlay = this.elements.hoverOverlay;
    const hoverTime = this.elements.hoverTime;
    const playPauseBtn = this.elements.playPauseBtn;
    const volumeControl = this.elements.volumeControl;
    const playheadTime = this.elements.playheadTime;
    this.wavesurfer.on("ready", () => {
      this.isWaveformReady = true;
      this.showLoading(false);
      playPauseBtn.style.display = "inline-block";
      if (volumeControl) volumeControl.classList.remove("hidden");
      
      // Find the WaveSurfer wrapper element (div without class/id)
      const waveformContainer = document.querySelector("#waveform");
      const waveformWrapper = Array.from(waveformContainer?.children || [])
        .find(child => child.tagName === 'DIV' && !child.className && !child.id);
      
      console.log(`[WAVEFORM FADE] Ready - Found waveform wrapper:`, waveformWrapper);
      console.log(`[WAVEFORM FADE] Ready - expandable enabled: ${this.expandable.enabled}`);
      
      // Ensure waveform starts at opacity 0
      if (waveformWrapper) {
        console.log(`[WAVEFORM FADE] Setting wrapper opacity to 0 initially`);
        waveformWrapper.style.opacity = "0";
      }
      
      setTimeout(() => {
        // Fade in the new waveform after it's fully loaded
        console.log(`[WAVEFORM FADE] Fading in waveform wrapper`);
        
        // Fade in the waveform wrapper
        if (waveformWrapper) {
          console.log(`[WAVEFORM FADE] Setting wrapper opacity to 1`);
          waveformWrapper.style.opacity = "1";
        }
        
        // Only fade in controls in static mode
        if (!this.expandable.enabled) {
          playPauseBtn.style.opacity = "1";
          if (volumeControl) {
            volumeControl.style.opacity = "1";
          }
        }
        // Set color for all modes
        playPauseBtn.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-accent")
          .trim();
      }, 50);
      if (volumeControl) {
        // Set color for all modes
        volumeControl.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-accent")
          .trim();
      }
      const trackInfo = this.elements.trackInfo;
      if (trackInfo) {
        trackInfo.classList.add("visible");
      }
      
      /**
       * Update total time display with accurate duration
       * Called multiple times to handle OGG file duration quirks
       */
      const updateTotalTime = () => {
        const totalTime = this.elements.totalTime;
        const duration = this.wavesurfer.getDuration();
        if (duration && isFinite(duration)) {
          if (totalTime) {
            totalTime.textContent = this.formatTime(duration);
            totalTime.classList.add("visible");
          }
        }
      };
      
      updateTotalTime();
      // Update again after a delay for OGG files
      setTimeout(updateTotalTime, 100);
      setTimeout(updateTotalTime, 500);
      
      // Auto-resume with fade-in if track was switched during playback
      console.log('[Track Ready] Checking auto-resume flag:', this.wasPlayingBeforeTrackSwitch);
      if (this.wasPlayingBeforeTrackSwitch) {
        console.log('[Track Ready] Auto-resuming playback with fade-in after track switch');
        this.wasPlayingBeforeTrackSwitch = false; // Reset flag
        
        // Set volume to 0, start playback, then fade in
        const targetVolume = this.wavesurfer.getVolume();
        console.log('[Track Ready] Target volume:', targetVolume);
        this.wavesurfer.setVolume(0);
        this.wavesurfer.play();
        
        requestAnimationFrame(() => {
          this.applyAudioFadeInFromZero(targetVolume);
        });
      }
      waveformEl.addEventListener("mousemove", (e) => {
        const rect = waveformEl.getBoundingClientRect();
        const percent = Math.min(
          Math.max((e.clientX - rect.left) / rect.width, 0),
          1
        );
        const duration = this.wavesurfer.getDuration();
        const time = duration * percent;
        hoverOverlay.style.width = `${percent * 100}%`;
        hoverTime.textContent = this.formatTime(time);
        hoverTime.style.opacity = "1";
        const pixelX = e.clientX - rect.left;
        hoverTime.style.left = `${Math.max(
          Math.min(pixelX, rect.width - 40),
          30
        )}px`;
        const isPlaying = this.wavesurfer.isPlaying();
        const currentTime = this.wavesurfer.getCurrentTime();
        const hoverDiff = Math.abs(time - currentTime);
        const threshold = 5;
      });
      waveformEl.addEventListener("mouseleave", () => {
        hoverOverlay.style.width = `0%`;
        hoverTime.style.opacity = "0";
      });
    });
    this.wavesurfer.on("play", () => {
      // Cancel any active audio fade-out
      if (this.activeFadeOut) {
        console.log('[Play Event] 🔄 Cancelling active audio fade-out');
        this.activeFadeOut.cancel = true;
        this.activeFadeOut = null;
      }
      
      // Show cursor when playing using UI accent color
      const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--ui-accent")
        .trim();
      this.wavesurfer.setOptions({ cursorColor: accentColor });
      this.elements.waveform.classList.add('playing');
      this.updatePlayingState(true);
      
      // Start video playback
      // Note: playVideo() has built-in interruption handling via activeFades Map
      // It will gracefully cancel any in-flight video fade-outs and start fresh
      console.log('[Play Event] 🎬 Starting video playback');
      this.playVideo();
      
      document.dispatchEvent(new CustomEvent("playback:play"));
    });
    this.wavesurfer.on("pause", () => {
      console.log('[Pause Event] ⏸️ Pause event triggered');
      
      // Hide cursor when paused by making it transparent
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      
      // Skip video fade-out if we're in the middle of a track switch
      // Track switch handles its own video transitions with specific timing
      if (this.isTrackSwitching) {
        console.log('[Pause Event] ⏭️ Skipping stopVideo() - track switch will handle video transitions');
        this.updatePlayingState(false);
        document.dispatchEvent(new CustomEvent("playback:pause"));
        return;
      }
      
      console.log('[Pause Event] 🎬 Stopping videos (normal pause)');
      this.updatePlayingState(false);
      
      // Stop video playback with fade-out
      // Note: stopVideo() has built-in interruption handling via activeFades Map
      // Audio has already faded out by this point (sequenced in button handler)
      this.stopVideo();
      
      document.dispatchEvent(new CustomEvent("playback:pause"));
    });
    this.wavesurfer.on("finish", () => {
      // Check if we should auto-play next track BEFORE updating state
      const shouldAutoPlay = this.hasNextTrack();
      console.log('[Finish] Should auto-play next track:', shouldAutoPlay);
      
      // Hide cursor when finished
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      
      // Only update playing state to false if NOT auto-playing next track
      if (!shouldAutoPlay) {
        this.updatePlayingState(false);
      }
      
      // Stop video playback
      this.stopVideo();
      
      document.dispatchEvent(new CustomEvent("playback:finish"));
      
      // Auto-play next track if available
      if (shouldAutoPlay) {
        console.log('[Finish] Calling playNextTrack()');
        this.playNextTrack();
      }
    });
    this.wavesurfer.on("seek", () => {
      // Update playhead time immediately when seeking
      const currentTime = this.wavesurfer.getCurrentTime();
      this.elements.playheadTime.textContent = this.formatTime(currentTime);
      
      // Position playhead at seek location
      const duration = this.wavesurfer.getDuration();
      const percent = currentTime / duration;
      const pixelX = percent * this.elements.waveform.clientWidth;
      const clampedX = Math.min(
        Math.max(pixelX, 20),
        this.elements.waveform.clientWidth - 40
      );
      this.elements.playheadTime.style.left = `${clampedX}px`;
      // Show playhead briefly when seeking
      if (!this.wavesurfer.isPlaying()) {
        this.elements.playheadTime.style.opacity = "1";
        // Hide after a moment if not playing
        setTimeout(() => {
          if (!this.wavesurfer.isPlaying()) {
            this.elements.playheadTime.style.opacity = "0";
          }
        }, 1000);
      }
    });
    this.wavesurfer.on("audioprocess", () => {
      const currentTime = this.wavesurfer.getCurrentTime();
      const duration = this.wavesurfer.getDuration();
      
      this.elements.playheadTime.textContent = this.formatTime(currentTime);
      
      // Show playhead only when playing
      this.elements.playheadTime.style.opacity = this.wavesurfer.isPlaying() ? "1" : "0";
      
      const percent = currentTime / duration;
      const pixelX = percent * this.elements.waveform.clientWidth;
      const clampedX = Math.min(
        Math.max(pixelX, 20),
        this.elements.waveform.clientWidth - 40
      );
      this.elements.playheadTime.style.left = `${clampedX}px`;
    });
  },

  formatTime(seconds) {
    // Safety check for invalid durations
    if (isNaN(seconds) || seconds === Infinity || !isFinite(seconds)) {
      return "0:00";
    }
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${min}:${sec}`;
  },

  setupPlayPauseUI() {
    const playPauseBtn = this.elements.playPauseBtn;
    playPauseBtn.onclick = () => {
      if (this.wavesurfer.isPlaying()) {
        // Sequential approach: Audio fade → Pause (triggers video fade via event)
        // This ensures proper sequencing without requiring matching durations
        console.log('[Play/Pause] 🎵 Starting pause sequence with audio fade-out');
        this.applyAudioFadeOut().then(() => {
          console.log('[Play/Pause] ⏸️ Audio fade complete, pausing (will trigger video fade)');
          this.wavesurfer.pause();
        });
      } else {
        // Check if resuming from pause (not at start)
        const currentTime = this.wavesurfer.getCurrentTime();
        const isResuming = currentTime > 0;
        
        console.log('[Play/Pause] ▶️ Starting play sequence', { isResuming });
        
        if (isResuming) {
          // Resuming from pause: fade in both audio and video
          const targetVolume = this.wavesurfer.getVolume();
          this.wavesurfer.setVolume(0);
          this.wavesurfer.play(); // Triggers 'play' event which starts video
          requestAnimationFrame(() => {
            console.log('[Play/Pause] 🎵 Starting audio fade-in');
            this.applyAudioFadeInFromZero(targetVolume);
          });
        } else {
          // Starting from beginning: no fade
          this.wavesurfer.play(); // Triggers 'play' event which starts video
        }
      }
    };
  },

  setupWaveSurfer() {
    // Destroy existing WaveSurfer instance if it exists
    if (this.wavesurfer) {
      this.wavesurfer.destroy();
      this.wavesurfer = null;
    }
    
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue("--ui-accent").trim();
    const unplayedColor = rootStyles
      .getPropertyValue("--waveform-unplayed")
      .trim();
    
    // Smooth waveform configuration
    const waveformContainer = document.querySelector("#waveform");
    
    this.wavesurfer = WaveSurfer.create({
      container: "#waveform",
      waveColor: unplayedColor,
      progressColor: accentColor,
      cursorWidth: 1,
      cursorColor: 'transparent', // Start with transparent, show on play
      barWidth: 0,
      barGap: 0,
      barHeight: 1,
      barRadius: 0,
      height: 86, // Even number helps Safari render without gaps
      responsive: !this.expandable.enabled, // Disable responsive in expandable mode to prevent redraws
      hideScrollbar: true,
      interact: true,
      fillParent: true, // Re-enable fillParent for proper width
      normalize: true,
      backend: "WebAudio", // Use WebAudio for accurate duration/playback
      minPxPerSec: 1,
      pixelRatio: Math.ceil(window.devicePixelRatio || 1), // Ensure whole number for Safari
    });
    
    // Fix Safari-specific sub-pixel rendering gap at origin line
    this.wavesurfer.on("ready", () => {
      const canvases = document.querySelectorAll("#waveform canvas");
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          // Safari-specific: ensure canvas dimensions are whole pixels
          const rect = canvas.getBoundingClientRect();
          if (rect.height % 2 !== 0) {
            canvas.style.transform = 'translateY(0.5px)';
          }
        }
      });
      
      // In expandable mode, ensure canvases fill width but prevent resize loops
      if (this.expandable.enabled && waveformContainer) {
        canvases.forEach(canvas => {
          canvas.style.width = '100%'; // Fill the container width
          canvas.style.height = '100%'; // Fill the container height
          canvas.style.willChange = 'auto'; // Prevent unnecessary GPU acceleration
        });
      }
    });
  },

  showLoading(isLoading) {
    const loadingIndicator = this.elements.loadingIndicator;
    if (!loadingIndicator) return;
    
    if (isLoading) {
      loadingIndicator.classList.remove("hidden");
      // Force opacity to 1 immediately to override any lingering transition
      loadingIndicator.style.opacity = "1";
    } else {
      loadingIndicator.classList.add("hidden");
      // Let CSS transition handle the fade out
      loadingIndicator.style.opacity = "";
    }
  },

  setupExpandableModeInteractions() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    // Clean up old listeners if they exist
    this.cleanupExpandableModeListeners();

    // Create new listener functions and store references for cleanup
    const handleMouseEnter = () => {
      if (!this.expandable.isExpanded) {
        this.expandPlayer();
      }
      // Exit both playback-idle and collapsed-idle states on mouse enter
      this.exitPlaybackIdle();
      this.exitCollapsedIdle();
    };

    const handleMouseLeave = () => {
      if (this.expandable.isExpanded) {
        this.collapsePlayer();
      }
      // Clear idle timeout when mouse leaves
      this.clearPlaybackIdleTimeout();
    };

    const handleMouseMove = () => {
      // Reset idle timer on mouse movement
      this.resetPlaybackIdleTimer();
    };

    // Store listener references for cleanup
    this.expandable.listeners = {
      wrapper,
      mouseEnter: handleMouseEnter,
      mouseLeave: handleMouseLeave,
      mouseMove: handleMouseMove
    };

    // Attach event listeners
    wrapper.addEventListener('mouseenter', handleMouseEnter);
    wrapper.addEventListener('mouseleave', handleMouseLeave);
    wrapper.addEventListener('mousemove', handleMouseMove);
  },

  cleanupExpandableModeListeners() {
    if (this.expandable.listeners) {
      const { wrapper, mouseEnter, mouseLeave, mouseMove } = this.expandable.listeners;
      if (wrapper) {
        wrapper.removeEventListener('mouseenter', mouseEnter);
        wrapper.removeEventListener('mouseleave', mouseLeave);
        wrapper.removeEventListener('mousemove', mouseMove);
      }
      this.expandable.listeners = null;
    }
    
    // Clear all idle-related timeouts
    this.clearAllIdleTimeouts();
  },

  setupStaticModeInteractions() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    // Clean up old listeners if they exist
    this.cleanupStaticModeListeners();

    // Create new listener functions and store references for cleanup
    const handleMouseEnter = () => {
      // Exit playback-idle state on mouse enter
      this.exitPlaybackIdle();
    };

    const handleMouseLeave = () => {
      // Clear idle timeout when mouse leaves
      this.clearPlaybackIdleTimeout();
    };

    const handleMouseMove = () => {
      // Reset idle timer on mouse movement
      this.resetPlaybackIdleTimer();
    };

    // Store listener references for cleanup
    this.static.listeners = {
      wrapper,
      mouseEnter: handleMouseEnter,
      mouseLeave: handleMouseLeave,
      mouseMove: handleMouseMove
    };

    // Attach event listeners
    wrapper.addEventListener('mouseenter', handleMouseEnter);
    wrapper.addEventListener('mouseleave', handleMouseLeave);
    wrapper.addEventListener('mousemove', handleMouseMove);
  },

  cleanupStaticModeListeners() {
    if (this.static.listeners) {
      const { wrapper, mouseEnter, mouseLeave, mouseMove } = this.static.listeners;
      if (wrapper) {
        wrapper.removeEventListener('mouseenter', mouseEnter);
        wrapper.removeEventListener('mouseleave', mouseLeave);
        wrapper.removeEventListener('mousemove', mouseMove);
      }
      this.static.listeners = null;
    }
    
    // Clear static mode idle timeout
    if (this.static.playbackIdleTimeout) {
      clearTimeout(this.static.playbackIdleTimeout);
      this.static.playbackIdleTimeout = null;
    }
  },

  clearAllIdleTimeouts() {
    // Clear expandable mode idle timeouts
    if (this.expandable.playbackIdleTimeout) {
      clearTimeout(this.expandable.playbackIdleTimeout);
      this.expandable.playbackIdleTimeout = null;
    }
    if (this.expandable.collapsedIdleTimeout) {
      clearTimeout(this.expandable.collapsedIdleTimeout);
      this.expandable.collapsedIdleTimeout = null;
    }
    
    // Clear static mode idle timeout
    if (this.static.playbackIdleTimeout) {
      clearTimeout(this.static.playbackIdleTimeout);
      this.static.playbackIdleTimeout = null;
    }
  },

  clearPlaybackIdleTimeout() {
    // Clear all idle timeouts (simplified - no separate entry/exit tracking)
    this.clearAllIdleTimeouts();
  },

  resetPlaybackIdleTimer() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    const isPlaying = this.wavesurfer?.isPlaying();
    if (!isPlaying) return;

    // Clear existing timeout and exit current idle state
    this.clearPlaybackIdleTimeout();
    this.exitPlaybackIdle();

    // Set new timeout to enter idle state
    const styles = getComputedStyle(document.documentElement);
    const idleDelay = parseInt(styles.getPropertyValue('--playback-idle-delay')) || 1000;
    
    // Store timeout in the appropriate mode state
    const timeoutRef = setTimeout(() => {
      this.enterPlaybackIdle();
    }, idleDelay);
    
    if (this.expandable.enabled) {
      this.expandable.playbackIdleTimeout = timeoutRef;
    } else {
      this.static.playbackIdleTimeout = timeoutRef;
    }
  },

  // ========================================
  // IDLE STATE MANAGEMENT
  // ========================================

  // Enter playback idle state (works for both expandable and static modes)
  enterPlaybackIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    const isPlaying = this.wavesurfer?.isPlaying();
    if (!isPlaying) return;

    // Add idle class and start background animations
    wrapper.classList.add('playback-idle');
    const duration = this.parseCssDuration('--playback-idle-zoom-speed-up-duration', 800);
    this.playBackgroundAnimations(true, duration);
  },

  // Exit playback idle state (works for both expandable and static modes)
  exitPlaybackIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper || !wrapper.classList.contains('playback-idle')) return;

    // Clear any pending timeouts from either mode
    if (this.expandable.playbackIdleTimeout) {
      clearTimeout(this.expandable.playbackIdleTimeout);
      this.expandable.playbackIdleTimeout = null;
    }
    if (this.static.playbackIdleTimeout) {
      clearTimeout(this.static.playbackIdleTimeout);
      this.static.playbackIdleTimeout = null;
    }

    // Remove idle class to trigger CSS transitions
    wrapper.classList.remove('playback-idle');

    // Resume background animations
    const duration = this.parseCssDuration('--playback-idle-zoom-slow-down-duration', 800);
    this.pauseBackgroundAnimations(true, duration);
  },

  // Enter collapsed idle state (when player is collapsed and idle during playback)
  enterCollapsedIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    const isPlaying = this.wavesurfer?.isPlaying();
    if (!isPlaying || this.expandable.isExpanded) return;

    // Add idle class and start background animations
    wrapper.classList.add('collapsed-idle');
    const duration = this.parseCssDuration('--playback-idle-zoom-speed-up-duration', 800);
    this.playBackgroundAnimations(true, duration);
  },

  // Exit collapsed idle state
  exitCollapsedIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper || !wrapper.classList.contains('collapsed-idle')) return;

    // Clear any pending timeouts
    if (this.expandable.collapsedIdleTimeout) {
      clearTimeout(this.expandable.collapsedIdleTimeout);
      this.expandable.collapsedIdleTimeout = null;
    }

    // Remove idle class to trigger CSS transitions
    wrapper.classList.remove('collapsed-idle');

    // Resume background animations
    const duration = this.parseCssDuration('--playback-idle-zoom-slow-down-duration', 800);
    this.pauseBackgroundAnimations(true, duration);
  },

  // ========================================
  // BACKGROUND ZOOM ANIMATION SYSTEM
  // ========================================

  // Parse CSS duration value (handles 's' and 'ms' units)
  parseCssDuration(cssVariable, defaultValue = 800) {
    const styles = getComputedStyle(document.documentElement);
    const value = styles.getPropertyValue(cssVariable).trim();
    
    if (!value) return defaultValue;
    
    if (value.endsWith('ms')) {
      return parseFloat(value);
    } else if (value.endsWith('s')) {
      return parseFloat(value) * 1000;
    }
    
    return parseFloat(value) || defaultValue;
  },

  // Create a Web Animations API zoom animation for a background element
  initBackgroundAnimation(element, minZoom, maxZoom) {
    if (!element) return null;

    const styles = getComputedStyle(document.documentElement);
    const duration = this.parseCssDuration('--playback-idle-zoom-speed', 60000);
    const easing = styles.getPropertyValue('--playback-idle-zoom-ease')?.trim() || 'ease-in-out';

    // Create animation with per-keyframe easing for smooth transitions at peak zoom
    const animation = element.animate([
      { transform: `scale(${minZoom})`, easing },
      { transform: `scale(${maxZoom})`, easing },
      { transform: `scale(${minZoom})` }
    ], {
      duration,
      iterations: Infinity
    });

    animation.pause();
    return animation;
  },

  // Initialize main background zoom animation (uses CSS custom property for pseudo-element)
  initMainBackgroundAnimation() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    const styles = getComputedStyle(document.documentElement);
    const baseZoom = parseFloat(styles.getPropertyValue('--background-zoom')) || 1;
    const multiplier = parseFloat(styles.getPropertyValue('--playback-idle-zoom-multiplier')) || 1.2;
    const duration = this.parseCssDuration('--playback-idle-zoom-speed', 60000);
    const easing = styles.getPropertyValue('--playback-idle-zoom-ease')?.trim() || 'ease-in-out';

    const minZoom = baseZoom;
    const maxZoom = baseZoom * multiplier;

    // Animate CSS custom property (::after pseudo-element uses this via var())
    const keyframes = [
      { '--animated-zoom': minZoom, easing },
      { '--animated-zoom': maxZoom, easing },
      { '--animated-zoom': minZoom }
    ];

    this.backgroundAnimations.main = wrapper.animate(keyframes, {
      duration,
      iterations: Infinity
    });
    
    this.backgroundAnimations.main.pause();
  },

  // Initialize or update track layer zoom animation
  initTrackLayerAnimation(layer, minZoom, maxZoom) {
    if (!layer) return;

    const layerId = layer.classList.contains('track-bg-layer-a') ? 'layerA' : 'layerB';
    
    // Cancel and replace existing animation
    if (this.backgroundAnimations[layerId]) {
      this.backgroundAnimations[layerId].cancel();
    }

    this.backgroundAnimations[layerId] = this.initBackgroundAnimation(layer, minZoom, maxZoom);

    // Auto-play if currently in idle state
    if (this.elements.playerWrapper?.classList.contains('playback-idle')) {
      this.backgroundAnimations[layerId].play();
    }
  },

  // Smoothly transition animation playback rate (for speed up/slow down effects)
  smoothTransitionPlaybackRate(animation, targetRate, duration = 800) {
    if (!animation) return Promise.resolve();

    const startRate = animation.playbackRate;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const tick = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        
        animation.playbackRate = startRate + (targetRate - startRate) * eased;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  },

  // Start an animation with optional smooth speed transition
  startAnimation(animation, smooth, duration) {
    if (!animation) return null;

    if (smooth) {
      animation.playbackRate = 0;
      if (animation.playState === 'paused') {
        animation.play();
      }
      return this.smoothTransitionPlaybackRate(animation, 1, duration);
    } else {
      animation.playbackRate = 1;
      if (animation.playState === 'paused') {
        animation.play();
      }
      return null;
    }
  },

  // Stop an animation with optional smooth speed transition
  stopAnimation(animation, smooth, duration) {
    if (!animation) return;

    if (smooth) {
      this.smoothTransitionPlaybackRate(animation, 0, duration).then(() => {
        animation.pause();
        animation.playbackRate = 1; // Reset for next play
      });
    } else {
      animation.pause();
    }
  },

  // Play all active background zoom animations
  playBackgroundAnimations(smooth = false, duration = 800) {
    const promises = [];

    // Play main background if no track background is active
    if (!this.elements.playerWrapper?.classList.contains('has-track-bg')) {
      const promise = this.startAnimation(this.backgroundAnimations.main, smooth, duration);
      if (promise) promises.push(promise);
    }

    // Play active track layer animations
    const layerA = document.querySelector('.track-bg-layer-a');
    const layerB = document.querySelector('.track-bg-layer-b');
    
    if (layerA?.classList.contains('active') || layerA?.classList.contains('fading-out')) {
      const promise = this.startAnimation(this.backgroundAnimations.layerA, smooth, duration);
      if (promise) promises.push(promise);
    }
    
    if (layerB?.classList.contains('active') || layerB?.classList.contains('fading-out')) {
      const promise = this.startAnimation(this.backgroundAnimations.layerB, smooth, duration);
      if (promise) promises.push(promise);
    }

    return Promise.all(promises);
  },

  // Pause all background zoom animations
  pauseBackgroundAnimations(smooth = false, duration = 800) {
    this.stopAnimation(this.backgroundAnimations.main, smooth, duration);
    this.stopAnimation(this.backgroundAnimations.layerA, smooth, duration);
    this.stopAnimation(this.backgroundAnimations.layerB, smooth, duration);
  },

  // ========================================
  // VIDEO BACKGROUND MANAGEMENT
  // ========================================

  /**
   * Get video transition duration from CSS variables
   * @param {string} type - 'fadeIn' or 'fadeOut'
   * @returns {number} - Duration in milliseconds
   */
  getVideoTransitionDuration(type = 'fadeIn') {
    let varName;
    switch(type) {
      case 'fadeIn':
        varName = '--video-fade-in-duration';
        break;
      case 'trackSwitch':
        varName = '--video-track-switch-fade-duration';
        break;
      case 'fadeOut':
      default:
        varName = '--video-fade-out-duration';
        break;
    }
    return this.parseCssDuration(varName, 800);
  },

  /**
   * Start video playback with crossfade (tied to audio playback)
   * Uses dual-layer system for seamless transitions
   */
  async playVideo() {
    const track = this.currentReelSettings?.playlist?.[this.currentTrackIndex];
    const reel = this.currentReelSettings;
    const activeVideo = this.getActiveVideo(track, reel);
    
    if (!activeVideo.url) {
      console.log('[Play Video] ⏭️ No video URL configured, skipping');
      return;
    }
    
    console.log(`\n${'▶'.repeat(40)}`);
    console.log(`[Play Video] 🎬 START - ${activeVideo.type} video playback`);
    console.log(`[Play Video] URL: ${activeVideo.url.substring(activeVideo.url.lastIndexOf('/') + 1)}`);
    console.log(`${'▶'.repeat(40)}\n`);

    // Get current layer (might be active) and next layer (preloaded)
    const currentLayer = this.getCurrentLayerVideo(activeVideo.type);
    const nextLayer = this.getNextLayerVideo(activeVideo.type);
    const currentLayerName = activeVideo.type === 'track' ? this.videoState.currentTrackLayer : this.videoState.currentMainLayer;
    const nextLayerName = activeVideo.type === 'track'
      ? (this.videoState.currentTrackLayer === 'a' ? 'b' : 'a')
      : (this.videoState.currentMainLayer === 'a' ? 'b' : 'a');
    
    console.log(`[Play Video] Layer info:`, {
      type: activeVideo.type,
      currentLayer: currentLayerName,
      nextLayer: nextLayerName,
      currentLayerState: currentLayer ? {
        className: currentLayer.className,
        hasActive: currentLayer.classList.contains('active'),
        opacity: window.getComputedStyle(currentLayer).opacity,
        src: currentLayer.src ? currentLayer.src.substring(currentLayer.src.lastIndexOf('/') + 1) : 'none'
      } : 'null',
      nextLayerState: nextLayer ? {
        className: nextLayer.className,
        hasActive: nextLayer.classList.contains('active'),
        opacity: window.getComputedStyle(nextLayer).opacity,
        src: nextLayer.src ? nextLayer.src.substring(nextLayer.src.lastIndexOf('/') + 1) : 'none'
      } : 'null'
    });
    
    // Get opposite video type (main vs track) to fade it out
    const oppositeType = activeVideo.type === 'track' ? 'main' : 'track';
    const oppositeLayer = this.getCurrentLayerVideo(oppositeType);
    
    console.log(`[Play Video] Opposite type: ${oppositeType}, hasActive: ${oppositeLayer?.classList.contains('active') || false}`);

    // Fade out opposite type if active (e.g., fade out main when track video plays)
    if (oppositeLayer?.classList.contains('active')) {
      const fadeOutDuration = this.getVideoTransitionDuration('fadeOut');
      console.log(`[Play Video] 🎬 Fading out opposite ${oppositeType} video (duration: ${fadeOutDuration}ms)`);
      this.fadeOutVideo(oppositeLayer, fadeOutDuration, true);
    } else {
      console.log(`[Play Video] ⏭️ No opposite ${oppositeType} video to fade out`);
    }

    // Check if current layer already has the right video playing
    const currentLayerUrl = this.getLayerUrl(activeVideo.type, currentLayerName);
    const isAlreadyActive = currentLayer?.classList.contains('active') && 
                           currentLayerUrl === activeVideo.url &&
                           currentLayer.src && 
                           currentLayer.readyState >= 2;
    
    console.log(`[Play Video] Checking if already active:`, {
      hasActiveClass: currentLayer?.classList.contains('active'),
      currentLayerUrl: currentLayerUrl ? currentLayerUrl.substring(currentLayerUrl.lastIndexOf('/') + 1) : 'none',
      targetUrl: activeVideo.url.substring(activeVideo.url.lastIndexOf('/') + 1),
      urlsMatch: currentLayerUrl === activeVideo.url,
      hasSrc: !!currentLayer?.src,
      readyState: currentLayer?.readyState,
      isAlreadyActive
    });
    
    if (isAlreadyActive) {
      console.log(`[Play Video] ✅ ${activeVideo.type} video already active on layer ${currentLayerName}, resuming`);
      this.resumeVideo(currentLayer);
      return;
    }

    // Check if next layer has the video preloaded
    const nextLayerUrl = this.getLayerUrl(activeVideo.type, nextLayerName);
    const isPreloaded = nextLayerUrl === activeVideo.url && 
                       nextLayer.src === activeVideo.url;
    
    console.log(`[Play Video] Checking preload status:`, {
      nextLayerUrl: nextLayerUrl ? nextLayerUrl.substring(nextLayerUrl.lastIndexOf('/') + 1) : 'none',
      targetUrl: activeVideo.url.substring(activeVideo.url.lastIndexOf('/') + 1),
      urlsMatch: nextLayerUrl === activeVideo.url,
      elementSrc: nextLayer.src ? nextLayer.src.substring(nextLayer.src.lastIndexOf('/') + 1) : 'none',
      isPreloaded
    });
    
    try {
      // Load video on next layer if not already preloaded
      if (!isPreloaded) {
        console.log(`[Play Video] ⚠️ Video not preloaded, loading on layer ${nextLayerName}...`);
        const loadStart = performance.now();
        await this.loadVideo(nextLayer, activeVideo.url, activeVideo.type);
        this.setLayerUrl(activeVideo.type, nextLayerName, activeVideo.url);
        console.log(`[Play Video] ✓ Loaded in ${(performance.now() - loadStart).toFixed(0)}ms`);
      } else {
        console.log(`[Play Video] ✓ Using preloaded video on layer ${nextLayerName}`);
      }
      
      // Crossfade: fade out old layer while fading in new layer
      const fadeInDuration = this.getVideoTransitionDuration('fadeIn');
      console.log(`[Play Video] Starting crossfade sequence (duration: ${fadeInDuration}ms)`);
      
      // Start fade-in on next layer
      console.log(`[Play Video] 📈 Starting fade-in on layer ${nextLayerName}`);
      const fadeInPromise = this.fadeInVideo(nextLayer, fadeInDuration);
      
      // If current layer is active, fade it out simultaneously (crossfade)
      if (currentLayer?.classList.contains('active')) {
        console.log(`[Play Video] 🔀 CROSSFADE: Fading out layer ${currentLayerName} while fading in layer ${nextLayerName}`);
        this.fadeOutVideo(currentLayer, fadeInDuration, true).catch(err =>
          console.error('[Play Video] ❌ Crossfade out error:', err)
        );
      } else {
        console.log(`[Play Video] 📈 Simple fade-in (no current layer to crossfade)`);
      }
      
      console.log(`[Play Video] ⏳ Waiting for fade-in to complete...`);
      await fadeInPromise;
      console.log(`[Play Video] ✓ Fade-in complete`);
      
      // Switch to the new layer as current
      console.log(`[Play Video] 🔄 Switching current ${activeVideo.type} layer: ${currentLayerName} → ${nextLayerName}`);
      this.switchToNextLayer(activeVideo.type);
      
      // Update playback state
      if (activeVideo.type === 'track') {
        this.videoState.trackVideoPlaying = true;
        console.log(`[Play Video] ✓ Track video playing state = true`);
      } else {
        this.videoState.mainVideoPlaying = true;
        console.log(`[Play Video] ✓ Main video playing state = true`);
      }
      
      console.log(`\n${'✅'.repeat(20)}`);
      console.log(`[Play Video] ✅ SUCCESS - ${activeVideo.type} video now playing on layer ${nextLayerName}`);
      console.log(`${'✅'.repeat(20)}\n`);
      
      // Pause background animations when video is playing
      this.pauseBackgroundAnimations(false, 0);
    } catch (err) {
      console.error(`\n${'❌'.repeat(20)}`);
      console.error('[Play Video] ❌ ERROR playing video:', err);
      console.error(`${'❌'.repeat(20)}\n`);
    }
  },

  /**
   * Stop video playback (tied to audio playback)
   * Fades out and cleans up any active videos
   */
  async stopVideo() {
    console.log(`\n${'⏹'.repeat(40)}`);
    console.log(`[Stop Video] ⏹️ Stopping all active videos`);
    console.log(`${'⏹'.repeat(40)}\n`);
    
    const fadeOutDuration = this.getVideoTransitionDuration('fadeOut');
    console.log(`[Stop Video] Fade-out duration: ${fadeOutDuration}ms`);
    const promises = [];

    // Check BOTH layers (A and B) for each video type
    // This is critical because fade-in happens on the "next" layer while "current" points to the old layer
    const trackVideoA = this.videoState.trackVideoA;
    const trackVideoB = this.videoState.trackVideoB;
    const mainVideoA = this.videoState.mainVideoA;
    const mainVideoB = this.videoState.mainVideoB;
    
    console.log(`[Stop Video] Checking all video layers:`, {
      trackVideoA: trackVideoA ? {
        className: trackVideoA.className,
        hasActive: trackVideoA.classList.contains('active'),
        hasFade: this.videoState.activeFades.has(trackVideoA),
        opacity: window.getComputedStyle(trackVideoA).opacity
      } : 'null',
      trackVideoB: trackVideoB ? {
        className: trackVideoB.className,
        hasActive: trackVideoB.classList.contains('active'),
        hasFade: this.videoState.activeFades.has(trackVideoB),
        opacity: window.getComputedStyle(trackVideoB).opacity
      } : 'null',
      mainVideoA: mainVideoA ? {
        className: mainVideoA.className,
        hasActive: mainVideoA.classList.contains('active'),
        hasFade: this.videoState.activeFades.has(mainVideoA),
        opacity: window.getComputedStyle(mainVideoA).opacity
      } : 'null',
      mainVideoB: mainVideoB ? {
        className: mainVideoB.className,
        hasActive: mainVideoB.classList.contains('active'),
        hasFade: this.videoState.activeFades.has(mainVideoB),
        opacity: window.getComputedStyle(mainVideoB).opacity
      } : 'null'
    });
    
    // Stop track video A if it's active OR has a fade in progress
    const shouldStopTrackA = trackVideoA && 
                            (trackVideoA.classList.contains('active') || this.videoState.activeFades.has(trackVideoA));
    
    if (shouldStopTrackA) {
      const hasFade = this.videoState.activeFades.has(trackVideoA);
      console.log(`[Stop Video] 🎬 Stopping track video A${hasFade ? ' [interrupting fade]' : ''}`);
      promises.push(this.fadeOutVideo(trackVideoA, fadeOutDuration, true));
    }

    // Stop track video B if it's active OR has a fade in progress
    const shouldStopTrackB = trackVideoB && 
                            (trackVideoB.classList.contains('active') || this.videoState.activeFades.has(trackVideoB));
    
    if (shouldStopTrackB) {
      const hasFade = this.videoState.activeFades.has(trackVideoB);
      console.log(`[Stop Video] 🎬 Stopping track video B${hasFade ? ' [interrupting fade]' : ''}`);
      promises.push(this.fadeOutVideo(trackVideoB, fadeOutDuration, true));
    }

    // Stop main video A if it's active OR has a fade in progress
    const shouldStopMainA = mainVideoA && 
                           (mainVideoA.classList.contains('active') || this.videoState.activeFades.has(mainVideoA));
    
    if (shouldStopMainA) {
      const hasFade = this.videoState.activeFades.has(mainVideoA);
      console.log(`[Stop Video] 🎬 Stopping main video A${hasFade ? ' [interrupting fade]' : ''}`);
      promises.push(this.fadeOutVideo(mainVideoA, fadeOutDuration, true));
    }

    // Stop main video B if it's active OR has a fade in progress
    const shouldStopMainB = mainVideoB && 
                           (mainVideoB.classList.contains('active') || this.videoState.activeFades.has(mainVideoB));
    
    if (shouldStopMainB) {
      const hasFade = this.videoState.activeFades.has(mainVideoB);
      console.log(`[Stop Video] 🎬 Stopping main video B${hasFade ? ' [interrupting fade]' : ''}`);
      promises.push(this.fadeOutVideo(mainVideoB, fadeOutDuration, true));
    }
    
    if (!shouldStopTrackA && !shouldStopTrackB && !shouldStopMainA && !shouldStopMainB) {
      console.log(`[Stop Video] ⏭️ No active videos to stop`);
    }

    if (promises.length > 0) {
      console.log(`[Stop Video] ⏳ Waiting for ${promises.length} video(s) to fade out...`);
      await Promise.all(promises);
      console.log(`[Stop Video] ✓ All videos stopped`);
    } else {
      console.log(`[Stop Video] ✓ No videos were active`);
    }
    
    // Resume background animations when video stops
    const duration = this.parseCssDuration('--playback-idle-zoom-slow-down-duration', 800);
    console.log(`[Stop Video] 🎨 Resuming background animations (duration: ${duration}ms)`);
    this.pauseBackgroundAnimations(true, duration);
    
    console.log(`\n${'✅'.repeat(20)}`);
    console.log(`[Stop Video] ✅ Complete`);
    console.log(`${'✅'.repeat(20)}\n`);
  },

  /**
   * Pre-load videos for the current track to enable smooth playback
   * Uses dual-layer system - loads on next inactive layer
   * Called automatically when player renders and when tracks change
   */
  preloadVideos() {
    const track = this.currentReelSettings?.playlist?.[this.currentTrackIndex];
    const reel = this.currentReelSettings;
    
    if (!track || !reel) return;
    
    const activeVideo = this.getActiveVideo(track, reel);
    if (!activeVideo.url) return;
    
    // Get the next (inactive) layer to load the new video
    const nextLayer = this.getNextLayerVideo(activeVideo.type);
    const nextLayerName = activeVideo.type === 'track'
      ? (this.videoState.currentTrackLayer === 'a' ? 'b' : 'a')
      : (this.videoState.currentMainLayer === 'a' ? 'b' : 'a');
    
    // Check if this URL is already loaded on the next layer
    const nextLayerUrl = this.getLayerUrl(activeVideo.type, nextLayerName);
    const needsLoad = nextLayerUrl !== activeVideo.url || 
                      !nextLayer.src || 
                      nextLayer.src !== activeVideo.url;
    
    if (needsLoad) {
      console.log(`[Preload Video] Loading ${activeVideo.type} video on layer ${nextLayerName}:`, activeVideo.url);
      // Pre-load in background on inactive layer (stays hidden with opacity: 0)
      this.loadVideo(nextLayer, activeVideo.url, activeVideo.type)
        .then(() => {
          this.setLayerUrl(activeVideo.type, nextLayerName, activeVideo.url);
          console.log(`[Preload Video] ✓ ${activeVideo.type} video ready on layer ${nextLayerName}`);
        })
        .catch(err => {
          console.error(`[Preload Video] Failed on layer ${nextLayerName}:`, err);
        });
    } else {
      console.log(`[Preload Video] ${activeVideo.type} video already loaded on layer ${nextLayerName}`);
    }
  },

  /**
   * Load a video URL into a video element
   * @param {HTMLVideoElement} videoElement - The video element to load into
   * @param {string} videoUrl - The URL of the video to load
   * @param {string} type - 'main' or 'track' for tracking purposes
   * @returns {Promise} - Resolves when video is ready to play
   */
  loadVideo(videoElement, videoUrl, type = 'main') {
    if (!videoElement || !videoUrl || !videoUrl.trim()) {
      return Promise.reject(new Error('Invalid video element or URL'));
    }

    return new Promise((resolve, reject) => {
      // Log buffering progress
      let progressHandler;
      
      const cleanup = () => {
        videoElement.removeEventListener('loadedmetadata', handleSuccess);
        videoElement.removeEventListener('canplay', handleSuccess);
        videoElement.removeEventListener('canplaythrough', handleSuccess);
        videoElement.removeEventListener('error', handleError);
        if (progressHandler) {
          videoElement.removeEventListener('progress', progressHandler);
        }
        clearTimeout(timeoutId);
      };

      const handleSuccess = () => {
        cleanup();
        resolve();
      };

      const handleError = (e) => {
        cleanup();
        console.error(`Video load error (${type}):`, e, videoElement.error);
        reject(new Error(`Failed to load video: ${videoUrl}`));
      };

      const handleTimeout = () => {
        cleanup();
        console.warn(`Video load timeout (${type}): ${videoUrl}. ReadyState: ${videoElement.readyState}`);
        // If we have at least metadata, allow it to proceed
        if (videoElement.readyState >= 1) {
          resolve();
        } else {
          reject(new Error('Video load timeout'));
        }
      };

      // Set 10 second timeout (increased for large videos)
      const timeoutId = setTimeout(handleTimeout, 10000);

      // Listen for various ready states (canplaythrough = fully buffered)
      videoElement.addEventListener('loadedmetadata', handleSuccess, { once: true });
      videoElement.addEventListener('canplay', handleSuccess, { once: true });
      videoElement.addEventListener('canplaythrough', handleSuccess, { once: true });
      videoElement.addEventListener('error', handleError, { once: true });

      // Track buffering progress
      progressHandler = () => {
        if (videoElement.buffered.length > 0) {
          const bufferedEnd = videoElement.buffered.end(0);
          const duration = videoElement.duration;
          const percentBuffered = duration > 0 ? (bufferedEnd / duration * 100).toFixed(1) : 0;
          console.log(`[Video Load] ${type} buffering: ${percentBuffered}% (${bufferedEnd.toFixed(1)}s / ${duration.toFixed(1)}s) - ReadyState: ${videoElement.readyState}`);
        }
      };
      videoElement.addEventListener('progress', progressHandler);

      // Ensure video stays hidden during load (in case of any glitches)
      videoElement.classList.remove('active');
      
      // Set video source and trigger load with aggressive preload
      videoElement.src = videoUrl;
      videoElement.preload = 'auto'; // Tell browser to buffer as much as possible
      console.log(`[Video Load] Starting load for ${type} video:`, videoUrl);
      videoElement.load();
    });
  },

  /**
   * Fade in a video element and start playback
   * 
   * Architecture:
   * - Uses CSS transitions for smooth fades (controlled by .active class)
   * - Tracks in-progress fades in activeFades Map with abort callbacks
   * - Interruption safe: can be interrupted by fadeOutVideo mid-transition
   * 
   * @param {HTMLVideoElement} videoElement - The video element to fade in
   * @param {number} duration - Fade duration in milliseconds
   * @returns {Promise} - Resolves when fade completes
   */
  async fadeInVideo(videoElement, duration = 800) {
    if (!videoElement) {
      console.warn('[Fade In Video] ⚠️ Called with null/undefined videoElement');
      return Promise.resolve();
    }

    // Identify which video element this is
    const videoId = videoElement.className.split(' ').filter(c => c.includes('video')).join(' ');
    console.log(`[Fade In Video] 🎬 START for ${videoId}, duration: ${duration}ms`);
    console.log(`[Fade In Video] Initial state:`, {
      hasActiveClass: videoElement.classList.contains('active'),
      currentOpacity: window.getComputedStyle(videoElement).opacity,
      paused: videoElement.paused,
      currentTime: videoElement.currentTime.toFixed(2) + 's',
      readyState: videoElement.readyState,
      src: videoElement.src ? videoElement.src.substring(videoElement.src.lastIndexOf('/') + 1) : 'none'
    });

    // Cancel any in-progress fade on this element
    if (this.videoState.activeFades.has(videoElement)) {
      const previousFade = this.videoState.activeFades.get(videoElement);
      console.log(`[Fade In Video] 🔄 INTERRUPTING previous ${previousFade.type} fade on ${videoId}`);
      previousFade.abort();
      this.videoState.activeFades.delete(videoElement);
      console.log(`[Fade In Video] ✓ Previous fade aborted`);
      
      // CRITICAL: Clear any inline styles from previous fade-out interruption
      // Without this, inline opacity/transition styles override CSS transitions
      if (previousFade.type === 'out') {
        console.log(`[Fade In Video] 🧹 Clearing inline styles from interrupted fade-out`);
        videoElement.style.opacity = '';
        videoElement.style.transition = '';
        // Force reflow to ensure styles are cleared before starting new fade
        void videoElement.offsetHeight;
        console.log(`[Fade In Video] ✓ Inline styles cleared, ready for CSS fade-in`);
      }
    }

    // Ensure video is ready to play (readyState >= 2 means we have current frame data)
    if (videoElement.readyState < 2) {
      await new Promise((resolve) => {
        const checkReady = () => {
          if (videoElement.readyState >= 2) {
            videoElement.removeEventListener('loadeddata', checkReady);
            resolve();
          }
        };
        
        // If already ready, resolve immediately
        if (videoElement.readyState >= 2) {
          resolve();
        } else {
          videoElement.addEventListener('loadeddata', checkReady, { once: true });
          // Fallback timeout after 2 seconds
          setTimeout(() => {
            videoElement.removeEventListener('loadeddata', checkReady);
            resolve();
          }, 2000);
        }
      });
    }

    return new Promise(async (resolve) => {
      const startTime = performance.now();
      const getTimestamp = () => `+${(performance.now() - startTime).toFixed(0)}ms`;
      
      console.log(`[Fade In Video] ${getTimestamp()} Starting playback - paused: ${videoElement.paused}, currentTime: ${videoElement.currentTime.toFixed(2)}s`);
      
      // Seek past first frame to avoid black/frozen frame (common with Cloudinary/streaming)
      if (videoElement.currentTime === 0) {
        videoElement.currentTime = 0.1;
        console.log(`[Fade In Video] ${getTimestamp()} Seeked to 0.1s to skip first frame`);
        
        // Wait for seek to complete before playing
        await new Promise(seekResolve => {
          const seekHandler = () => {
            console.log(`[Fade In Video] ${getTimestamp()} Seek completed`);
            seekResolve();
          };
          videoElement.addEventListener('seeked', seekHandler, { once: true });
          
          // Timeout fallback
          setTimeout(() => {
            videoElement.removeEventListener('seeked', seekHandler);
            console.log(`[Fade In Video] ${getTimestamp()} Seek timeout, proceeding anyway`);
            seekResolve();
          }, 500);
        });
      }
      
      console.log(`[Fade In Video] ${getTimestamp()} Starting play() call`);
      
      // Start video playback
      const playPromise = videoElement.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[Fade In Video] ${getTimestamp()} ✓ Video playing successfully - paused: ${videoElement.paused}`);
            
            // Force webkit to render frames (common fix for video rendering issues)
            videoElement.style.transform = 'translateZ(0)';
            
            // Force a repaint by toggling a property
            requestAnimationFrame(() => {
              videoElement.style.webkitTransform = 'translateZ(0)';
              console.log(`[Fade In Video] ${getTimestamp()} Hardware acceleration forced`);
            });
            
            // Check if video is progressing at multiple intervals
            [100, 250, 500].forEach(delay => {
              setTimeout(() => {
                const computed = window.getComputedStyle(videoElement);
                console.log(`[Fade In Video] ${getTimestamp()} (${delay}ms check)`, {
                  currentTime: videoElement.currentTime.toFixed(2) + 's',
                  paused: videoElement.paused,
                  videoWidth: videoElement.videoWidth,
                  videoHeight: videoElement.videoHeight,
                  opacity: computed.opacity,
                  display: computed.display,
                  visibility: computed.visibility,
                  zIndex: computed.zIndex,
                  transform: computed.transform
                });
              }, delay);
            });
          })
          .catch(err => {
            console.error(`[Fade In Video] ${getTimestamp()} ✗ Video play error:`, err);
            console.error('Video state:', {
              paused: videoElement.paused,
              readyState: videoElement.readyState,
              networkState: videoElement.networkState,
              error: videoElement.error
            });
          });
      }

      // Track this fade operation for potential interruption
      let fadeTimeout;
      let isAborted = false;
      
      const abortFade = () => {
        console.log(`[Fade In Video] ❌ ABORT called for ${videoId} at ${getTimestamp()}`);
        isAborted = true;
        clearTimeout(fadeTimeout);
        this.videoState.activeFades.delete(videoElement);
        console.log(`[Fade In Video] ✓ Fade aborted, timeout cleared`);
      };
      
      this.videoState.activeFades.set(videoElement, { type: 'in', abort: abortFade });
      console.log(`[Fade In Video] 📝 Registered in activeFades Map (size: ${this.videoState.activeFades.size})`);
      
      // Add active class to trigger CSS fade-in
      videoElement.classList.add('active');
      console.log(`[Fade In Video] ${getTimestamp()} ✓ 'active' class added`);
      console.log(`[Fade In Video] ${getTimestamp()} classList: ${videoElement.classList.toString()}`);
      console.log(`[Fade In Video] ${getTimestamp()} Computed opacity: ${window.getComputedStyle(videoElement).opacity}`);

      // Resolve after fade duration (unless aborted)
      fadeTimeout = setTimeout(() => {
        if (!isAborted) {
          console.log(`[Fade In Video] ✅ COMPLETE for ${videoId} at ${getTimestamp()}`);
          console.log(`[Fade In Video] Final state:`, {
            opacity: window.getComputedStyle(videoElement).opacity,
            paused: videoElement.paused,
            currentTime: videoElement.currentTime.toFixed(2) + 's',
            hasActiveClass: videoElement.classList.contains('active')
          });
          this.videoState.activeFades.delete(videoElement);
          resolve();
        } else {
          console.log(`[Fade In Video] ⏭️ Skipping completion (was aborted) for ${videoId}`);
        }
      }, duration);
    });
  },

  /**
   * Fade out a video element and pause playback
   * 
   * Architecture:
   * - Normally fades via CSS (removing .active class)
   * - Interruption handling: freezes current opacity, animates via inline styles
   * - Supports both partial (pause only) and full cleanup (clear source)
   * - Skip cleanup when interrupted (interrupting fade handles cleanup)
   * 
   * @param {HTMLVideoElement} videoElement - The video element to fade out
   * @param {number} duration - Fade duration in milliseconds
   * @param {boolean} fullCleanup - Whether to fully cleanup video (clear source and state)
   * @returns {Promise} - Resolves when fade completes
   */
  fadeOutVideo(videoElement, duration = 2000, fullCleanup = false) {
    if (!videoElement) {
      console.warn('[Fade Out Video] ⚠️ Called with null/undefined videoElement');
      return Promise.resolve();
    }

    // Identify which video element this is
    const videoId = videoElement.className.split(' ').filter(c => c.includes('video')).join(' ');
    console.log(`[Fade Out Video] 🎬 START for ${videoId}, duration: ${duration}ms, fullCleanup: ${fullCleanup}`);
    console.log(`[Fade Out Video] Initial state:`, {
      hasActiveClass: videoElement.classList.contains('active'),
      currentOpacity: window.getComputedStyle(videoElement).opacity,
      paused: videoElement.paused,
      currentTime: videoElement.currentTime.toFixed(2) + 's',
      src: videoElement.src ? videoElement.src.substring(videoElement.src.lastIndexOf('/') + 1) : 'none'
    });

    // Cancel any in-progress fade on this element
    if (this.videoState.activeFades.has(videoElement)) {
      const previousFade = this.videoState.activeFades.get(videoElement);
      console.log(`[Fade Out Video] 🔄 INTERRUPTING previous ${previousFade.type} fade on ${videoId}`);
      previousFade.abort();
      this.videoState.activeFades.delete(videoElement);
      console.log(`[Fade Out Video] ✓ Previous fade aborted`);
      
      // Interruption Strategy: "Freeze & Animate"
      // 1. Capture current opacity (mid-transition state)
      // 2. Set as inline style to freeze it (stops CSS transition)
      // 3. Trigger reflow to apply frozen state
      // 4. Set new inline transition and target opacity (smooth continuation)
      // This prevents jarring jumps when interrupting in-progress fades
      
      // If interrupting a fade-in, we need special handling
      if (previousFade.type === 'in') {
        console.log(`[Fade Out Video] ⚠️ Interrupting FADE-IN - forcing immediate fade-out`);
        // Remove active class immediately to start fade-out
        videoElement.classList.remove('active');
        // Get current opacity and freeze it
        const currentOpacity = window.getComputedStyle(videoElement).opacity;
        console.log(`[Fade Out Video] 🔒 Freezing opacity at ${currentOpacity}`);
        videoElement.style.opacity = currentOpacity;
        // Trigger reflow
        void videoElement.offsetHeight;
        // Now animate to 0
        videoElement.style.transition = `opacity ${duration}ms ease-in-out`;
        videoElement.style.opacity = '0';
        console.log(`[Fade Out Video] ✓ Animating from ${currentOpacity} → 0`);
      } else {
        // For fade-out interrupting another fade-out, check if transition has started
        const currentOpacity = window.getComputedStyle(videoElement).opacity;
        console.log(`[Fade Out Video] 🔒 Current opacity: ${currentOpacity}`);
        
        // If opacity is still at original value (1 for fade-out), transition hasn't started yet
        // Animate from 1 to 0 using inline styles (similar to fade-in interruption)
        if (parseFloat(currentOpacity) === 1.0) {
          console.log(`[Fade Out Video] ⚠️ Previous transition never started (opacity still 1), animating manually`);
          videoElement.style.transition = `opacity ${duration}ms ease-in-out`;
          videoElement.style.opacity = '0';
          console.log(`[Fade Out Video] ✓ Animating from 1 → 0 with ${duration}ms duration`);
        } else {
          // Transition has started, freeze at current value then restart via CSS
          console.log(`[Fade Out Video] 🔒 Freezing opacity at ${currentOpacity} to prevent transition conflict`);
          videoElement.style.opacity = currentOpacity;
          // Trigger reflow to apply the style
          void videoElement.offsetHeight;
          // Now animate to 0 via inline styles (CSS transition already removed by previous fade)
          videoElement.style.transition = `opacity ${duration}ms ease-in-out`;
          videoElement.style.opacity = '0';
          console.log(`[Fade Out Video] ✓ Animating from ${currentOpacity} → 0 with ${duration}ms duration`);
        }
      }
    }

    return new Promise((resolve) => {
      // Determine video type for cleanup
      const videoType = videoElement.classList.contains('track-video') ? 'track' : 'main';
      
      let fallbackTimeout;
      let isCompleted = false;
      let isAborted = false;
      
      const complete = (skipCleanup = false) => {
        if (isCompleted) {
          console.log(`[Fade Out Video] ⏭️ complete() called again for ${videoId}, skipping (already completed)`);
          return;
        }
        isCompleted = true;
        
        console.log(`[Fade Out Video] ✅ COMPLETE for ${videoId}${skipCleanup ? ' [skip cleanup - interrupted]' : ''}`);
        console.log(`[Fade Out Video] Final state:`, {
          opacity: window.getComputedStyle(videoElement).opacity,
          hasActiveClass: videoElement.classList.contains('active'),
          paused: videoElement.paused,
          fullCleanup: fullCleanup,
          skipCleanup
        });
        
        videoElement.removeEventListener('transitionend', handleTransitionEnd);
        clearTimeout(fallbackTimeout);
        this.videoState.activeFades.delete(videoElement);
        console.log(`[Fade Out Video] 🗑️ Removed from activeFades Map (size: ${this.videoState.activeFades.size})`);
        
        if (!skipCleanup) {
          if (fullCleanup) {
            console.log(`[Fade Out Video] 🧹 Performing full cleanup for ${videoId}`);
            this.cleanupVideo(videoElement, videoType);
          } else {
            console.log(`[Fade Out Video] ⏸️ Pausing video (no cleanup) for ${videoId}`);
            videoElement.pause();
          }
        } else {
          console.log(`[Fade Out Video] ⏭️ Skipping cleanup - will be handled by interrupting fade`);
        }
        resolve();
      };
      
      const abortFade = () => {
        console.log(`[Fade Out Video] ❌ ABORT called for ${videoId} (being interrupted by new fade)`);
        isAborted = true;
        // Complete WITHOUT cleanup - let the interrupting fade handle it
        complete(true);
        console.log(`[Fade Out Video] ✓ Fade aborted, cleanup skipped`);
      };
      
      // Track this fade operation
      this.videoState.activeFades.set(videoElement, { type: 'out', abort: abortFade });
      console.log(`[Fade Out Video] 📝 Registered in activeFades Map (size: ${this.videoState.activeFades.size})`);
      
      // Listen for transition end to ensure video pauses AFTER opacity reaches 0
      const handleTransitionEnd = (e) => {
        if (e.propertyName === 'opacity') {
          console.log(`[Fade Out Video] 🎯 transitionend event fired for ${videoId}`);
          complete();
        }
      };
      
      videoElement.addEventListener('transitionend', handleTransitionEnd);
      console.log(`[Fade Out Video] 👂 Listening for transitionend`);
      
      // Check if we already set inline opacity during interruption handling
      const hasInlineOpacity = videoElement.style.opacity !== '';
      
      if (hasInlineOpacity) {
        // Interruption case: inline styles already set, just wait for transitionend
        console.log(`[Fade Out Video] ℹ️ Fading via inline style (interruption), waiting for transitionend`);
        fallbackTimeout = setTimeout(() => {
          console.log(`[Fade Out Video] ⏰ FALLBACK TIMEOUT triggered for ${videoId} (transitionend didn't fire)`);
          complete();
        }, duration + 500);
      } else {
        // Normal case: start fade-out by removing active class
        console.log(`[Fade Out Video] 📉 Normal fade-out via class removal`);
        videoElement.classList.remove('active');
        console.log(`[Fade Out Video] ✓ 'active' class removed`);
        console.log(`[Fade Out Video] classList: ${videoElement.classList.toString()}`);
        console.log(`[Fade Out Video] Computed opacity: ${window.getComputedStyle(videoElement).opacity}`);
        
        fallbackTimeout = setTimeout(() => {
          console.log(`[Fade Out Video] ⏰ FALLBACK TIMEOUT triggered for ${videoId} (transitionend didn't fire)`);
          complete();
        }, duration + 500);
      }
    });
  },

  /**
   * Resume video playback from current position
   * @param {HTMLVideoElement} videoElement - The video element to resume
   */
  resumeVideo(videoElement) {
    if (!videoElement) return;

    try {
      // Check if video has ended, restart if so
      if (videoElement.currentTime >= videoElement.duration - 0.1) {
        videoElement.currentTime = 0;
      }
      
      videoElement.play().catch(err => {
        console.error('Video resume error:', err);
      });
    } catch (err) {
      console.error('Video resume error:', err);
    }
  },

  /**
   * Determine which video should be displayed based on track and reel settings
   * @param {Object} track - Current track object with backgroundVideo property
   * @param {Object} reel - Current reel settings with backgroundVideo and enabled flags
   * @returns {Object} - { url, type } where type is 'track', 'main', or null
   */
  getActiveVideo(track, reel) {
    // Check track video first (highest priority)
    if (track?.backgroundVideo && track.backgroundVideo.trim()) {
      return { url: track.backgroundVideo.trim(), type: 'track' };
    }

    // Check main video if enabled
    if (reel?.backgroundVideoEnabled && reel?.backgroundVideo && reel.backgroundVideo.trim()) {
      return { url: reel.backgroundVideo.trim(), type: 'main' };
    }

    return { url: null, type: null };
  },

  /**
   * Properly cleanup and unload a video element
   * Removes source, aborts loading, and resets state tracking
   * @param {HTMLVideoElement} videoElement - The video element to cleanup
   * @param {string} type - 'main' or 'track' for state tracking
   */
  cleanupVideo(videoElement, type) {
    if (!videoElement) {
      console.warn(`[Cleanup Video] ⚠️ Called with null/undefined videoElement`);
      return;
    }
    
    // Determine which layer this element belongs to
    const isLayerA = videoElement.classList.contains(`${type}-video-a`);
    const isLayerB = videoElement.classList.contains(`${type}-video-b`);
    const layerName = isLayerA ? 'a' : (isLayerB ? 'b' : 'unknown');
    
    console.log(`\n${'🧹'.repeat(30)}`);
    console.log(`[Cleanup Video] 🧹 START - ${type} video layer ${layerName}`);
    console.log(`[Cleanup Video] State before cleanup:`, {
      className: videoElement.className,
      hasActive: videoElement.classList.contains('active'),
      opacity: window.getComputedStyle(videoElement).opacity,
      paused: videoElement.paused,
      currentTime: videoElement.currentTime.toFixed(2) + 's',
      src: videoElement.src ? videoElement.src.substring(videoElement.src.lastIndexOf('/') + 1) : 'none',
      readyState: videoElement.readyState
    });
    
    // Cancel any in-progress fade operations on this element
    if (this.videoState.activeFades.has(videoElement)) {
      const fade = this.videoState.activeFades.get(videoElement);
      console.log(`[Cleanup Video] ❌ Aborting in-progress ${fade.type} fade on ${type} layer ${layerName}`);
      fade.abort();
      this.videoState.activeFades.delete(videoElement);
      console.log(`[Cleanup Video] ✓ Fade aborted and removed from activeFades (size: ${this.videoState.activeFades.size})`);
    } else {
      console.log(`[Cleanup Video] ℹ️ No active fade to cancel`);
    }
    
    // Pause playback
    console.log(`[Cleanup Video] ⏸️ Pausing playback`);
    videoElement.pause();
    
    // Remove active class and force-hidden class
    if (videoElement.classList.contains('active')) {
      console.log(`[Cleanup Video] 🏷️ Removing 'active' class`);
      videoElement.classList.remove('active');
    }
    if (videoElement.classList.contains('force-hidden')) {
      console.log(`[Cleanup Video] 🏷️ Removing 'force-hidden' class`);
      videoElement.classList.remove('force-hidden');
    }
    
    // Clear inline styles that may have been set
    videoElement.style.opacity = '';
    videoElement.style.transition = '';
    
    // Clear the source and force unload to free memory
    console.log(`[Cleanup Video] 🗑️ Clearing source and unloading media`);
    videoElement.removeAttribute('src');
    videoElement.load(); // Aborts current loading and clears buffered data
    
    // Reset current time
    videoElement.currentTime = 0;
    
    // Clear URL tracking for this specific layer
    if (layerName !== 'unknown') {
      console.log(`[Cleanup Video] 📝 Clearing URL tracking for ${type} layer ${layerName}`);
      this.setLayerUrl(type, layerName, '');
    }
    
    // Clear playback state if this was the active layer
    const isCurrentLayer = (type === 'track' && videoElement === this.getCurrentLayerVideo('track')) ||
                          (type === 'main' && videoElement === this.getCurrentLayerVideo('main'));
    
    if (isCurrentLayer) {
      if (type === 'track') {
        console.log(`[Cleanup Video] 📝 Setting trackVideoPlaying = false`);
        this.videoState.trackVideoPlaying = false;
      } else if (type === 'main') {
        console.log(`[Cleanup Video] 📝 Setting mainVideoPlaying = false`);
        this.videoState.mainVideoPlaying = false;
      }
    } else {
      console.log(`[Cleanup Video] ℹ️ Not the current active layer, playback state unchanged`);
    }
    
    console.log(`[Cleanup Video] ✅ Complete - ${type} video layer ${layerName} cleaned up`);
    console.log(`${'✅'.repeat(30)}\n`);
  },

  /**
   * Get the current active layer video element
   * @param {string} type - 'main' or 'track'
   * @returns {HTMLVideoElement} The current layer's video element
   */
  getCurrentLayerVideo(type) {
    if (type === 'track') {
      return this.videoState.currentTrackLayer === 'a' 
        ? this.videoState.trackVideoA 
        : this.videoState.trackVideoB;
    } else {
      return this.videoState.currentMainLayer === 'a'
        ? this.videoState.mainVideoA
        : this.videoState.mainVideoB;
    }
  },

  /**
   * Get the active or fading video element (handles in-progress fades)
   * This checks BOTH layers to find which one is actually visible/fading
   * @param {string} type - 'main' or 'track'
   * @returns {HTMLVideoElement|null} The active/fading video element or null
   */
  getActiveOrFadingVideo(type) {
    const videoA = type === 'track' ? this.videoState.trackVideoA : this.videoState.mainVideoA;
    const videoB = type === 'track' ? this.videoState.trackVideoB : this.videoState.mainVideoB;
    
    // Check both layers for active class, active fade, or visible opacity
    const checkVideo = (video) => {
      if (!video) return { video: null, priority: -1 };
      
      const hasActiveClass = video.classList.contains('active');
      const hasFade = this.videoState.activeFades.has(video);
      const opacity = parseFloat(window.getComputedStyle(video).opacity);
      
      // Priority: active class (fully visible) > fading > has opacity
      if (hasActiveClass) return { video, priority: 3 };
      if (hasFade) return { video, priority: 2 };
      if (opacity > 0) return { video, priority: 1 };
      
      return { video: null, priority: -1 };
    };
    
    const resultA = checkVideo(videoA);
    const resultB = checkVideo(videoB);
    
    // Return the video with highest priority
    return resultA.priority >= resultB.priority ? resultA.video : resultB.video;
  },

  /**
   * Get the next (inactive) layer video element for loading
   * @param {string} type - 'main' or 'track'
   * @returns {HTMLVideoElement} The next layer's video element
   */
  getNextLayerVideo(type) {
    if (type === 'track') {
      return this.videoState.currentTrackLayer === 'a'
        ? this.videoState.trackVideoB
        : this.videoState.trackVideoA;
    } else {
      return this.videoState.currentMainLayer === 'a'
        ? this.videoState.mainVideoB
        : this.videoState.mainVideoA;
    }
  },

  /**
   * Switch to the next layer after crossfade completes
   * @param {string} type - 'main' or 'track'
   */
  switchToNextLayer(type) {
    if (type === 'track') {
      this.videoState.currentTrackLayer = this.videoState.currentTrackLayer === 'a' ? 'b' : 'a';
      console.log(`[Switch Layer] Track video now on layer ${this.videoState.currentTrackLayer}`);
    } else {
      this.videoState.currentMainLayer = this.videoState.currentMainLayer === 'a' ? 'b' : 'a';
      console.log(`[Switch Layer] Main video now on layer ${this.videoState.currentMainLayer}`);
    }
  },

  /**
   * Get the URL stored for a specific layer
   * @param {string} type - 'main' or 'track'
   * @param {string} layer - 'a' or 'b'
   * @returns {string} The URL stored for that layer
   */
  getLayerUrl(type, layer) {
    if (type === 'track') {
      return layer === 'a' ? this.videoState.trackVideoA_Url : this.videoState.trackVideoB_Url;
    } else {
      return layer === 'a' ? this.videoState.mainVideoA_Url : this.videoState.mainVideoB_Url;
    }
  },

  /**
   * Set the URL for a specific layer
   * @param {string} type - 'main' or 'track'
   * @param {string} layer - 'a' or 'b'
   * @param {string} url - The video URL
   */
  setLayerUrl(type, layer, url) {
    if (type === 'track') {
      if (layer === 'a') {
        this.videoState.trackVideoA_Url = url;
      } else {
        this.videoState.trackVideoB_Url = url;
      }
    } else {
      if (layer === 'a') {
        this.videoState.mainVideoA_Url = url;
      } else {
        this.videoState.mainVideoB_Url = url;
      }
    }
  },

  validateProjectTitleImage() {
    const overlay = this.elements.projectTitleOverlay;
    if (!overlay) return;
    
    const imageUrl = overlay.dataset.imageUrl;
    if (!imageUrl) return;
    
    // Add loading class
    overlay.classList.add('loading');
    
    // Create a test image to validate the URL
    const testImage = new Image();
    
    testImage.onload = () => {
      // Image loaded successfully
      overlay.classList.remove('loading');
      overlay.classList.add('loaded');
    };
    
    testImage.onerror = () => {
      // Image failed to load - hide overlay and show fallback
      console.warn('[Player] Failed to load project title image:', imageUrl);
      overlay.classList.remove('loading');
      overlay.classList.add('error');
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    };
    
    // Start loading the image
    testImage.src = imageUrl;
  },

  expandPlayer() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    // Clear any pending collapse timeouts
    if (this.expandable.collapseDelayTimeout) {
      clearTimeout(this.expandable.collapseDelayTimeout);
      this.expandable.collapseDelayTimeout = null;
    }
    if (this.expandable.collapseFadeTimeout) {
      clearTimeout(this.expandable.collapseFadeTimeout);
      this.expandable.collapseFadeTimeout = null;
    }
    if (this.expandable.collapsedIdleTimeout) {
      clearTimeout(this.expandable.collapsedIdleTimeout);
      this.expandable.collapsedIdleTimeout = null;
    }

    // Check if we're in collapsed idle state with video playing
    const wasInCollapsedIdleWithVideo = wrapper.classList.contains('collapsed-idle') && 
                                         (this.videoState.mainVideoPlaying || this.videoState.trackVideoPlaying);

    // Exit collapsed idle state if active (but keep video playing)
    this.exitCollapsedIdle(false);

    // Remove collapsing classes and ensure expanded state
    wrapper.classList.remove('pre-collapsing');
    wrapper.classList.remove('collapsing');
    this.expandable.isExpanded = true;
    wrapper.classList.add('expanded');
    
    // If we were in collapsed idle with video, transition to playback idle
    if (wasInCollapsedIdleWithVideo) {
      // Video is already playing, just need to apply the playback-idle class
      // after a brief delay to ensure expand transition completes
      setTimeout(() => {
        if (this.wavesurfer?.isPlaying() && this.expandable.isExpanded) {
          wrapper.classList.add('playback-idle');
        }
      }, 100);
    }
    
    // Notify parent window if in iframe (for iframe height adjustment)
    if (window.self !== window.top) {
      const expandedHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--expandable-expanded-height')) || 500;
      window.parent.postMessage({ type: 'reelplayer:resize', height: expandedHeight }, '*');
    }
  },

  collapsePlayer() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    this.expandable.isExpanded = false;
    
    // Check playing state immediately to set playing-collapsed class
    const isCurrentlyPlaying = this.wavesurfer?.isPlaying();
    const shouldShowWaveform = isCurrentlyPlaying && this.expandable.settings?.showWaveformOnCollapse !== false;
    
    if (shouldShowWaveform) {
      wrapper.classList.add('playing-collapsed');
    } else {
      wrapper.classList.remove('playing-collapsed');
    }
    
    // Add pre-collapsing class for initial opacity reduction
    wrapper.classList.add('pre-collapsing');
    
    // Get timing values from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const collapseDelay = parseInt(styles.getPropertyValue('--expandable-collapse-delay')) || 1000;
    const fadeDuration = parseFloat(styles.getPropertyValue('--expandable-collapse-fade-duration')) * 1000 || 200;
    const collapsedIdleDelay = parseInt(styles.getPropertyValue('--playback-idle-collapsed-delay')) || 1000;
    
    // Wait for delay, then trigger fade-out
    this.expandable.collapseDelayTimeout = setTimeout(() => {
      wrapper.classList.remove('pre-collapsing');
      wrapper.classList.add('collapsing');
      
      // Wait for fade-out to complete, then collapse height
      this.expandable.collapseFadeTimeout = setTimeout(() => {
        wrapper.classList.remove('expanded');
        wrapper.classList.remove('collapsing');
        
        // Clear timeout references
        this.expandable.collapseDelayTimeout = null;
        this.expandable.collapseFadeTimeout = null;
        
        // Notify parent window if in iframe (for iframe height adjustment)
        if (window.self !== window.top) {
          const collapsedHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--expandable-collapsed-height')) || 120;
          window.parent.postMessage({ type: 'reelplayer:resize', height: collapsedHeight }, '*');
        }
        
        // Re-enter idle state after collapse if still playing
        this.expandable.collapsedIdleTimeout = setTimeout(() => {
          const isPlaying = this.wavesurfer?.isPlaying();
          if (isPlaying && !this.expandable.isExpanded) {
            this.enterCollapsedIdle();
          }
        }, collapsedIdleDelay);
      }, fadeDuration);
    }, collapseDelay);
  },

  updatePlayingState(playing) {
    this.expandable.isPlaying = playing;
    const wrapper = this.elements.playerWrapper;
    
    if (wrapper && this.expandable.enabled) {
      // Update collapsed state based on playing status (only when not expanded)
      const shouldShowWaveform = playing && this.expandable.settings?.showWaveformOnCollapse !== false;
      
      if (!this.expandable.isExpanded && shouldShowWaveform) {
        wrapper.classList.add('playing-collapsed');
      } else {
        wrapper.classList.remove('playing-collapsed');
      }
    }

    // Handle playback-idle state for BOTH expandable and static modes
    if (wrapper) {
      if (playing) {
        // Start idle timer when playback starts
        this.resetPlaybackIdleTimer();
      } else {
        // Clear idle state and timer when playback stops
        this.clearPlaybackIdleTimeout();
        this.exitPlaybackIdle();
      }
    }
  },

  /**
   * Apply audio fade-in effect from current volume 0 to target
   * Assumes volume is already set to 0 before calling
   * @param {number} targetVolume - The target volume to fade to
   */
  applyAudioFadeInFromZero(targetVolume) {
    if (!this.wavesurfer) return;

    // Get the fade-in duration from CSS variables
    const fadeDuration = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--audio-fade-in-duration') || '0.4'
    ) * 1000; // Convert to milliseconds
    
    console.log(`[Audio Fade-In] Starting fade from 0 to ${targetVolume} over ${fadeDuration}ms`);
    
    // Animate volume increase
    const startTime = performance.now();
    
    const fadeStep = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / fadeDuration, 1);
      
      // Use ease-in curve for smooth fade
      const easedProgress = progress * progress;
      const currentVolume = targetVolume * easedProgress;
      
      this.wavesurfer.setVolume(currentVolume);
      
      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        console.log(`[Audio Fade-In] Complete at volume ${targetVolume}`);
      }
    };
    
    requestAnimationFrame(fadeStep);
  },

  /**
   * Apply audio fade-out effect when playback stops
   * Smoothly ramps down volume from current level to 0
   * @param {boolean} pauseAfterFade - Whether to pause playback after fade completes
   * @returns {Promise} Resolves when fade-out completes
   */
  applyAudioFadeOut(pauseAfterFade = false) {
    if (!this.wavesurfer) return Promise.resolve();

    // Get the fade-out duration from CSS variables
    const fadeDuration = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--audio-fade-out-duration') || '0.3'
    ) * 1000; // Convert to milliseconds

    // Store the starting volume
    const startVolume = this.wavesurfer.getVolume();
    
    console.log(`[Audio Fade-Out] Starting fade from ${startVolume} to 0 over ${fadeDuration}ms (pauseAfter: ${pauseAfterFade})`);
    
    return new Promise((resolve) => {
      // Track this fade-out for potential cancellation
      const fadeState = { cancel: false };
      this.activeFadeOut = fadeState;
      
      const startTime = performance.now();
      
      const fadeStep = () => {
        // Check if fade was cancelled
        if (fadeState.cancel) {
          console.log('[Audio Fade-Out] Cancelled');
          resolve();
          return;
        }
        
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / fadeDuration, 1);
        
        // Use ease-out curve for smooth fade
        const easedProgress = 1 - Math.pow(1 - progress, 2);
        const currentVolume = startVolume * (1 - easedProgress);
        
        this.wavesurfer.setVolume(currentVolume);
        
        if (progress < 1) {
          requestAnimationFrame(fadeStep);
        } else {
          console.log('[Audio Fade-Out] Complete');
          
          // If pausing after fade (track switch), keep volume at 0 and pause immediately
          if (pauseAfterFade) {
            console.log('[Audio Fade-Out] Pausing playback to prevent audio pop');
            this.wavesurfer.pause();
            // Restore volume for next track (will start at 0 and fade in)
            this.wavesurfer.setVolume(startVolume);
          } else {
            // For manual pause, restore volume for next play
            this.wavesurfer.setVolume(startVolume);
          }
          
          this.activeFadeOut = null;
          resolve();
        }
      };
      
      requestAnimationFrame(fadeStep);
    });
  },

  renderPlayer({ showTitle, title, playlist, reel }) {
    // Clean up old event listeners before re-rendering
    this.cleanupExpandableModeListeners();
    this.cleanupStaticModeListeners();
    
    // Set expandable mode state - consolidated
    this.expandable.enabled = reel?.mode === 'expandable';
    this.expandable.isExpanded = false;
    this.expandable.isPlaying = false;
    this.expandable.settings = reel;
    this.expandable.showWaveformOnCollapse = reel?.showWaveformOnCollapse !== false;
    
    const container = document.getElementById("reelPlayerPreview");
    if (!container) return;
    
    const shouldHideTitle = !(showTitle && title && title.trim());
    
    // Determine player wrapper classes
    let wrapperClasses = 'player-wrapper';
    if (shouldHideTitle) wrapperClasses += ' no-title';
    if (this.expandable.enabled) wrapperClasses += ' expandable-mode';
    
    // Build project title overlay HTML for expandable mode
    let projectTitleOverlayHTML = '';
    if (this.expandable.enabled && reel.projectTitleImage) {
      projectTitleOverlayHTML = `
        <div class="project-title-overlay" style="background-image: url('${reel.projectTitleImage}');" data-image-url="${reel.projectTitleImage}"></div>
      `;
    }
    
    container.innerHTML = `
    <div class="${wrapperClasses}">
      <div class="track-background-layer track-bg-layer-a"></div>
      <div class="track-background-layer track-bg-layer-b"></div>
      <video class="background-video main-video main-video-a" preload="auto" loop muted playsinline></video>
      <video class="background-video main-video main-video-b" preload="auto" loop muted playsinline></video>
      <video class="background-video track-video track-video-a" preload="auto" loop muted playsinline></video>
      <video class="background-video track-video track-video-b" preload="auto" loop muted playsinline></video>
      ${projectTitleOverlayHTML}
      <div class="player-content">
        ${
          showTitle && title && title.trim()
            ? `<div class="reel-title">${title}</div>`
            : ""
        }
        <div class="track-info"></div>
        <div class="player-container">
          <button id="playPause" class="icon-button">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
              <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd"/>
            </svg>
          </button>
          <div class="waveform-and-volume">
            <div id="waveform">
              <div class="hover-overlay"></div>
              <div class="hover-time">0:00</div>
              <div class="playhead-time">0:00</div>
              <div id="total-time" class="total-time">0:00</div>
            </div>
            <div class="volume-control hidden">
              <button id="volumeToggle" class="icon-button">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"/>
                  <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
              <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="1"/>
            </div>
          </div>
        </div>
        <div id="loading" class="loading">
          <div class="spinner"></div>
        </div>
      </div>
      <div id="playlist" class="playlist${shouldHideTitle ? ' no-title' : ''}"></div>
    </div>
  `;
    this.elements = {};
    this.cacheElements();
    
    // Store current reel settings for background transitions
    this.currentReelSettings = reel;
    
    // Set up mode-specific interactions
    if (this.expandable.enabled) {
      this.setupExpandableModeInteractions();
      this.validateProjectTitleImage();
    } else {
      // Set up static mode interactions for idle state
      this.setupStaticModeInteractions();
    }
    
    this.setupWaveSurfer();
    this.setupWaveformEvents();
    this.setupPlayPauseUI();
    this.setupVolumeControls();

    if (playlist && playlist.length) {
      this.renderPlaylist(playlist);
      const firstTrack = playlist[0];
      const url = this.convertDropboxLinkToDirect(firstTrack.url);
      this.initializePlayer(url, firstTrack.title, 0);
      
      // Pre-buffer video for first track
      this.preloadVideos();
      
      // Set track info for preview
      const trackInfo = this.elements.trackInfo;
      const fileName =
        firstTrack.title ||
        firstTrack.url
          .split("/")
          .pop()
          .split("?")[0]
          .replace(/[_-]/g, " ")
          .replace(/\.[^/.]+$/, "");
      if (trackInfo) {
        trackInfo.textContent = fileName;
        trackInfo.classList.add("visible");
      }
    }
  },
};
