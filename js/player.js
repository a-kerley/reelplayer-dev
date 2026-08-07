// player.js
import { createPlayerClosedIdleManager } from './modules/playerClosedIdle.js';
import { imagePreload } from './modules/imagePreload.js';
import { audioFades } from './modules/audioFades.js';
import { idleState } from './modules/idleState.js';
import { backgroundZoomAnimation } from './modules/backgroundZoomAnimation.js';
import { playlistScroll } from './modules/playlistScroll.js';
import { videoLayerState } from './modules/videoLayerState.js';
import { videoPlayback } from './modules/videoPlayback.js';

const playerAppCore = {
  elements: {},
  isWaveformReady: false,
  wavesurfer: null,
  previousVolume: 1,
  // The "nominal" volume - what the volume should be when nothing is
  // actively fading. Tracked separately from the live GainNode value
  // (read via wavesurfer.getVolume()) because that reflects whatever a
  // fade is doing to it moment-to-moment; if a fade-out gets interrupted
  // mid-ramp (rapid pause->resume click), getVolume() would read back
  // whatever partial value the fade had reached, not the real volume - and
  // the next fade-in would then ramp up to that reduced value instead of
  // back to full, quietly ratcheting the volume down on repeated interrupts.
  lastKnownVolume: 1,
  isDraggingSlider: false,
  isHoveringSlider: false,
  isHoveringIcon: false,
  currentTrackIndex: 0,
  activeFadeOut: null, // Track active fade-out to allow cancellation
  activeFadeIn: null, // Track active fade-in to allow cancellation
  wasPlayingBeforeTrackSwitch: false, // Track if we need to auto-resume with fade-in
  isTrackSwitching: false, // Flag to prevent pause event from interfering during track switch
  isFirstLoad: true, // Flag to track if this is the initial player load for intro animation
  lastProjectTitleImageUrl: null, // Track the last project title image URL for new reel detection
  
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

  // Player closed idle manager
  closedIdleManager: null,

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
    activeFades: new Map(), // Maps videoElement -> {type: 'in'|'out', abort: Function}
    // In-flight loadVideo() calls, so a second caller targeting the same element+url
    // (e.g. playVideo() racing a preloadIdleVideo()/preloadVideos() still buffering)
    // awaits the existing canplaythrough wait instead of restarting it via .load()
    // or skipping it outright. Maps videoElement -> {url, promise}
    pendingLoads: new Map()
  },

  // Image preloading cache - stores Image objects to keep images in browser cache
  imageCache: {
    preloadedImages: new Map(), // Map of URL -> Image object
    preloadQueue: [],           // Array of URLs pending preload
    isPreloading: false,        // Flag to prevent concurrent preload operations
    maxCacheSize: 10            // Maximum number of images to keep in cache
  },

  // Primary input has no hover and a coarse pointer - the correct signal for
  // "should this use tap/scroll-driven interactions instead of hover", as
  // opposed to merely checking for touch support (which would also flag
  // touchscreen laptops that are still mouse-primary).
  isTouchDevice() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  },

  // #waveform is flex:1 in the stylesheet (see the CSS comments on that rule
  // for the fuller theory), but nested flex:1 items resolving fractional
  // leftover space can round slightly differently across successive layout
  // passes in some engines - on a narrow, tightly-packed mobile layout, that
  // shows up as WaveSurfer's own ResizeObserver seeing a genuinely different
  // measured width from one frame to the next and redrawing the bars each
  // time, tied to whatever's forcing repeated layout passes during playback
  // (the playhead-time label's per-tick text/position updates). Freezing the
  // width as an explicit, rounded, whole-pixel inline style removes it from
  // flex's fractional distribution entirely, so it can no longer wobble
  // between frames - only updateWaveformWidth() itself changes it, and only
  // in response to an actual resize or expand/collapse transition, never a
  // playback tick.
  updateWaveformWidth() {
    const waveformEl = this.elements.waveform;
    if (!waveformEl) return;

    // Clear any previously frozen width so the stylesheet's flex: 1 computes
    // a fresh, current share of the available space to measure.
    waveformEl.style.width = '';
    waveformEl.style.flex = '';

    const measuredWidth = waveformEl.getBoundingClientRect().width;
    if (!measuredWidth) return;

    waveformEl.style.flex = '0 0 auto';
    waveformEl.style.width = `${Math.round(measuredWidth)}px`;

    // #total-time's position is anchored to #waveform's own right edge
    // (right: 0.1rem), so a width change here shifts where it actually
    // lands - keep the mask hole (css/player.css's #waveform > div:last-child
    // rule) in sync with it.
    this.updateTotalTimeMaskHole();
  },

  // Keeps the squared hole punched through the rendered waveform (see
  // #waveform > div:last-child in css/player.css) aligned with #total-time's
  // actual rendered box, so a loud passage near the end of the track can
  // never obscure the digits - re-measures on every call rather than
  // assuming a fixed size, since duration text width varies ("0:42" vs
  // "12:34" vs "1:23:45"). Sets custom properties on #waveform (this
  // element's parent in the DOM, not the masked element itself) so they
  // reach the mask rule via normal CSS inheritance.
  updateTotalTimeMaskHole() {
    const waveformEl = this.elements.waveform;
    const totalTimeEl = this.elements.totalTime;
    if (!waveformEl || !totalTimeEl) return;

    // Expandable-and-collapsed gets no hole - #total-time no longer dims
    // there either (see css/expandable.css), so it stays legible on its own
    // in that smaller, glanceable banner view without needing the waveform
    // punched through underneath it. Static mode has no collapsed state, so
    // always gets the hole. Re-evaluated on every call (this runs again
    // whenever expand/collapse settles, via updateWaveformWidth()) rather
    // than cached, so it flips correctly in both directions.
    if (this.expandable.enabled && !this.expandable.isExpanded) {
      waveformEl.style.setProperty('--total-time-hole-width', '0px');
      waveformEl.style.setProperty('--total-time-hole-height', '0px');
      return;
    }

    const waveformRect = waveformEl.getBoundingClientRect();
    const labelRect = totalTimeEl.getBoundingClientRect();
    if (!waveformRect.width || !labelRect.width) return;

    waveformEl.style.setProperty('--total-time-hole-x', `${labelRect.left - waveformRect.left}px`);
    waveformEl.style.setProperty('--total-time-hole-y', `${labelRect.top - waveformRect.top}px`);
    waveformEl.style.setProperty('--total-time-hole-width', `${labelRect.width}px`);
    waveformEl.style.setProperty('--total-time-hole-height', `${labelRect.height}px`);
  },

  cleanupWaveformWidthTracking() {
    if (this.waveformWidthTracking) {
      window.removeEventListener('resize', this.waveformWidthTracking.handler);
      clearTimeout(this.waveformWidthTracking.debounceTimeout);
      this.waveformWidthTracking = null;
    }
  },

  // Debounced (150ms) so a continuous resize/orientation-change gesture only
  // triggers one re-freeze at the end, not one per intermediate frame -
  // exactly the kind of per-frame churn updateWaveformWidth() exists to
  // avoid in the first place.
  setupWaveformWidthTracking() {
    this.cleanupWaveformWidthTracking();

    this.waveformWidthTracking = { handler: null, debounceTimeout: null };
    const handler = () => {
      clearTimeout(this.waveformWidthTracking.debounceTimeout);
      this.waveformWidthTracking.debounceTimeout = setTimeout(() => {
        this.updateWaveformWidth();
      }, 150);
    };
    this.waveformWidthTracking.handler = handler;
    window.addEventListener('resize', handler);
  },

  // Called on THIS instance, right after its own playback starts, to stop any
  // other reelplayer embed already playing elsewhere on the same host page.
  // Sibling <iframe>s are same-origin to each other (all served from this
  // same player domain) regardless of what origin the actual host page is,
  // so direct property access across them is allowed by the same-origin
  // policy - no postMessage relay through the host page needed. window.top
  // itself, or any individual frame in it, can still throw (unusual sandbox
  // attributes, or a frame that's genuinely cross-origin to us because it's
  // not a reelplayer embed at all) - both are caught and simply skipped
  // rather than treated as an error.
  pauseOtherPlayers() {
    let frames;
    try {
      frames = window.top.frames;
    } catch (e) {
      return;
    }
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame === window) continue;
      try {
        frame.playerApp?.pauseForOtherPlayer?.();
      } catch (e) {
        // Not a same-origin reelplayer embed - ignore.
      }
    }
  },

  // Called on the OTHER instance (via pauseOtherPlayers() above) to stop it
  // in favor of whichever player just started. Reuses the same fade-out
  // pause the play/pause button itself uses, rather than a hard stop, so it
  // doesn't sound like anything broke.
  pauseForOtherPlayer() {
    if (this.wavesurfer?.isPlaying()) {
      this.applyAudioFadeOut(true);
    }
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

  convertDropboxLinkToDirect(url) {
    if (!url.includes("dropbox.com")) return url;
    return url
      .replace("www.dropbox.com", "dl.dropboxusercontent.com")
      .replace("dropbox.com", "dl.dropboxusercontent.com")
      .replace("?dl=0", "?dl=1")
      .replace("&dl=0", "&dl=1");
  },

  // userSelected: true only when a user explicitly picked this track from the
  // playlist (see playlistScroll.js's click handler) - that should always
  // start playback once the track is ready, whether something else was
  // already playing (stopped/crossfaded below, same as before) or the player
  // was sitting paused/idle (previously stayed paused - the actual behavior
  // change this flag exists for). The very first, unrequested load (initial
  // track-0 render in renderPlayer()/initializeEmbedPlayer()) never passes
  // this, so it's unaffected - it should still wait for an explicit
  // play/spacebar press.
  async initializePlayer(audioURL, title, index, userSelected = false) {

    this.showLoading(true);

    // Initialize main background animation on first load
    if (!this.backgroundAnimations.main) {
      this.initMainBackgroundAnimation();
    }

    // Check if playback is active
    const isPlaybackActive = this.wavesurfer?.isPlaying() || false;

    // Store state for auto-resume with fade-in after load
    if (userSelected) {
      this.wasPlayingBeforeTrackSwitch = true;
    } else if (!this.wasPlayingBeforeTrackSwitch) {
      // Don't overwrite if already set (e.g., by auto-play from finish event)
      this.wasPlayingBeforeTrackSwitch = isPlaybackActive;
    }

    // Set flag to prevent pause event from interfering with video transitions
    if (isPlaybackActive) {
      this.isTrackSwitching = true;
    }

    // If switching tracks during playback, fade out audio and pause to prevent pop
    if (isPlaybackActive) {
      await this.applyAudioFadeOut(true); // Pass true to pause after fade
      // Note: Pause event will fire but will skip stopVideo() due to isTrackSwitching flag
    }
    
    // Crossfade videos when switching tracks
    // This happens in background, no need to wait - new track loads while fade occurs
    if (isPlaybackActive) {
      // During playback: crossfade old video out (revealing background)
      // New video will be preloaded and ready to fade in when playback starts
      const fadeOutDuration = this.getVideoTransitionDuration('trackSwitch');
      
      // Fade out current layers (both track and main if active)
      // Use getActiveOrFadingVideo to catch videos that are mid-fade
      const currentTrackLayer = this.getActiveOrFadingVideo('track');
      const currentMainLayer = this.getActiveOrFadingVideo('main');
      
      
      // Check if track video needs fade-out (either fully active OR currently fading)
      if (currentTrackLayer) {
        const trackFadeState = this.videoState.activeFades.get(currentTrackLayer);
        const hasActiveClass = currentTrackLayer.classList.contains('active');
        const currentOpacity = parseFloat(window.getComputedStyle(currentTrackLayer).opacity);
        
        if (hasActiveClass || trackFadeState || currentOpacity > 0) {
          if (trackFadeState) {
          } else {
          }
          this.fadeOutVideo(currentTrackLayer, fadeOutDuration, true).catch(err => 
            console.error('[TRACK SWITCH] ❌ Track video fadeout error:', err)
          );
        } else {
        }
      } else {
      }
      
      // Check if main video needs fade-out (either fully active OR currently fading)
      if (currentMainLayer) {
        const mainFadeState = this.videoState.activeFades.get(currentMainLayer);
        const hasActiveClass = currentMainLayer.classList.contains('active');
        const currentOpacity = parseFloat(window.getComputedStyle(currentMainLayer).opacity);
        
        if (hasActiveClass || mainFadeState || currentOpacity > 0) {
          if (mainFadeState) {
          } else {
          }
          this.fadeOutVideo(currentMainLayer, fadeOutDuration, true).catch(err =>
            console.error('[TRACK SWITCH] ❌ Main video fadeout error:', err)
          );
        } else {
        }
      } else {
      }
      
      // Clear the track switching flag after video fade-outs have been initiated
      // The fades will complete in the background
      this.isTrackSwitching = false;
    } else {
      // When stopped: clean up any active videos immediately
      ['track', 'main'].forEach(type => {
        const currentLayer = this.getCurrentLayerVideo(type);
        if (currentLayer?.classList.contains('active')) {
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
    
    
    if (waveformWrapper) {
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
      return;
    }
    
    // Check if there's a next track
    const nextIndex = this.currentTrackIndex + 1;
    
    if (nextIndex >= playlist.length) {
      return;
    }
    
    
    // Get the next track
    const nextTrack = playlist[nextIndex];
    const url = this.convertDropboxLinkToDirect(nextTrack.url);
    
    // Set flag to indicate we should auto-resume playback
    this.wasPlayingBeforeTrackSwitch = true;
    
    // Initialize the next track (will auto-play due to flag)
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
        playerApp.lastKnownVolume = volume;
        volumeToggle.innerHTML =
          volume === 0 ? volumeIconMuted : volumeIconLoud;
      });
      volumeSlider.addEventListener("mousedown", () => {
        playerApp.isDraggingSlider = true;
      });
      document.addEventListener("mouseup", () => {
        playerApp.isDraggingSlider = false;
      });

      if (this.isTouchDevice()) {
        // KNOWN ISSUE - DO NOT STRIP THE [vol-debug] console.log/trace CALLS
        // BELOW WITHOUT RE-TESTING FIRST. On mobile expandable, tapping the
        // volume icon while collapsed used to reveal the slider and then
        // near-instantly hide it again - reopening the player worked, only
        // the slider reveal was affected. Adding the [vol-debug] logging
        // below (pure console.log/console.trace, no behavior change) made
        // the bug stop reproducing, which points to a timing/race condition
        // that the logging's own synchronous execution happens to perturb
        // just enough to avoid - not an actual fix. The real cause was never
        // isolated (candidates: a duplicate/ghost touchstart being seen as
        // "outside" volumeControl by the listener below, or the scroll
        // observer's collapse branch firing on a timing this logging
        // delays). If touching this code, keep the logging in place (or
        // replace it with an equivalent deliberate delay) until the actual
        // race is found and fixed properly.
        //
        // No hover on touch, so reveal is tap-driven instead: the first tap
        // on the icon just reveals the slider (captured ahead of the
        // mute-toggle click handler above, and swallowed so that tap doesn't
        // also mute); a second tap, with the slider already visible, falls
        // through to that mute-toggle handler normally. Dragging the
        // revealed <input type="range"> itself needs no extra wiring - touch
        // dragging is native range-input behavior. Hiding on tap-outside
        // reuses the same hideSliderTimeout/300ms delay as the desktop
        // mouseleave bookend below, instead of hiding instantly, so the
        // close feels the same on both. There's also a longer auto-hide
        // backstop (~2.5s) in case the user reveals it and never taps
        // anywhere else at all - without one, a revealed slider would stay
        // open indefinitely with nothing to dismiss it.
        const scheduleAutoHide = () => {
          clearTimeout(hideSliderTimeout);
          console.log('[vol-debug] scheduleAutoHide: 2500ms timer (re)armed');
          hideSliderTimeout = setTimeout(() => {
            console.log('[vol-debug] 2500ms auto-hide FIRED - removing show-slider');
            volumeControl.classList.remove("show-slider");
          }, 2500);
        };

        volumeToggle.addEventListener("click", (e) => {
          console.log('[vol-debug] volumeToggle click - isExpanded before:', playerApp.expandable.isExpanded);
          // Tapping volume while collapsed should reopen the player (unlike
          // play/pause, which deliberately has no such trigger) - see
          // expandFromMobileTap()'s own comment. No-ops once already
          // expanded, via that method's own isExpanded guard.
          playerApp.expandFromMobileTap();
          console.log('[vol-debug] volumeToggle click - isExpanded after expandFromMobileTap:', playerApp.expandable.isExpanded);
          if (!volumeControl.classList.contains("show-slider")) {
            volumeControl.classList.add("show-slider");
            console.log('[vol-debug] show-slider ADDED');
            e.stopImmediatePropagation();
            e.preventDefault();
            scheduleAutoHide();
          }
        }, true);

        // Dragging resets the auto-hide countdown so it can't fire mid-drag.
        volumeSlider.addEventListener("input", () => {
          if (volumeControl.classList.contains("show-slider")) {
            scheduleAutoHide();
          }
        });

        document.addEventListener("touchstart", (e) => {
          const inside = volumeControl.contains(e.target);
          console.log('[vol-debug] document touchstart - target:', e.target?.id || e.target?.className, ', inside volumeControl:', inside);
          if (inside) {
            // Touching the control itself (icon or slider) resets the
            // countdown rather than cancelling it outright, so the slider
            // still eventually hides even if the user just keeps tapping
            // the icon to mute/unmute without ever tapping away.
            scheduleAutoHide();
            return;
          }
          console.log('[vol-debug] touchstart OUTSIDE volumeControl - scheduling 300ms hide');
          hideSliderTimeout = setTimeout(() => {
            console.log('[vol-debug] 300ms outside-touch hide FIRED - removing show-slider');
            volumeControl.classList.remove("show-slider");
          }, 300);
        }, { passive: true });
      } else {
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
    }
  },

  setupWaveformEvents() {
    const waveformEl = this.elements.waveform;
    const hoverOverlay = this.elements.hoverOverlay;
    const hoverTime = this.elements.hoverTime;
    const playPauseBtn = this.elements.playPauseBtn;
    const volumeControl = this.elements.volumeControl;
    const playheadTime = this.elements.playheadTime;

    // Attached once here, NOT inside the "ready" handler below: "ready" fires on
    // every wavesurfer.load() call, i.e. every track switch (track switching
    // reuses this same persistent instance/DOM node, it doesn't destroy and
    // recreate them - see js/player.js:299). These previously lived inside that
    // handler, so every track switch permanently stacked another pair of
    // listeners onto waveformEl with no removal - after enough track switches in
    // one session, each mousemove over the waveform (a continuous, high-frequency
    // event) fired every accumulated duplicate, saturating the main thread enough
    // to visibly degrade audio timing and eventually make playback stop working.
    const updateScrubPreview = (clientX) => {
      const rect = waveformEl.getBoundingClientRect();
      const percent = Math.min(
        Math.max((clientX - rect.left) / rect.width, 0),
        1
      );
      const duration = this.wavesurfer.getDuration();
      const time = duration * percent;
      hoverOverlay.style.width = `${percent * 100}%`;
      hoverTime.textContent = this.formatTime(time);
      hoverTime.style.opacity = "1";
      const pixelX = clientX - rect.left;
      hoverTime.style.left = `${Math.max(
        Math.min(pixelX, rect.width - 40),
        30
      )}px`;
    };
    const hideScrubPreview = () => {
      hoverOverlay.style.width = `0%`;
      hoverTime.style.opacity = "0";
    };

    waveformEl.addEventListener("mousemove", (e) => updateScrubPreview(e.clientX));
    waveformEl.addEventListener("mouseleave", hideScrubPreview);

    // Touch equivalent of the hover preview above - WaveSurfer's own tap-to-seek
    // (interact: true) already handles the actual seek natively via touch, this
    // just drives the same scrub-preview overlay/time label while the finger
    // is down, since touch has no hover to trigger it otherwise.
    waveformEl.addEventListener("touchstart", (e) => updateScrubPreview(e.touches[0].clientX), { passive: true });
    waveformEl.addEventListener("touchmove", (e) => updateScrubPreview(e.touches[0].clientX), { passive: true });
    waveformEl.addEventListener("touchend", hideScrubPreview);

    this.wavesurfer.on("ready", () => {
      this.isWaveformReady = true;
      // Freeze #waveform's width as an explicit pixel value now that the DOM
      // has settled for this track - see updateWaveformWidth()'s own comment
      // for why. Re-measuring here means every track switch re-freezes to
      // whatever's current, which is correct/idempotent either way.
      this.updateWaveformWidth();
      this.showLoading(false);
      playPauseBtn.style.display = "inline-block";
      if (volumeControl) volumeControl.classList.remove("hidden");
      
      // Find the WaveSurfer wrapper element (div without class/id)
      const waveformContainer = document.querySelector("#waveform");
      const waveformWrapper = Array.from(waveformContainer?.children || [])
        .find(child => child.tagName === 'DIV' && !child.className && !child.id);
      
      
      // Ensure waveform starts at opacity 0
      if (waveformWrapper) {
        waveformWrapper.style.opacity = "0";
      }
      
      setTimeout(() => {
        // Fade in the new waveform after it's fully loaded
        
        // Fade in the waveform wrapper
        if (waveformWrapper) {
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
        
        // Give the idle video a head start on buffering - the player starts collapsed
        // by default, and checkConditions() below won't fire enter() for several more
        // seconds (its own delay chain), so this is otherwise wasted lead time.
        this.closedIdleManager?.preloadIdleVideo();

        // Check for player-closed-idle state after initial load (with additional delay)
        setTimeout(() => {
          this.closedIdleManager?.checkConditions();
        }, 200); // Extra delay to ensure all initialization is complete
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
            // Text width varies by duration ("0:42" vs "12:34") - resync the
            // waveform mask hole (see updateTotalTimeMaskHole()) to the
            // label's actual new box now that it's set.
            this.updateTotalTimeMaskHole();
          }
        }
      };
      
      updateTotalTime();
      // Update again after a delay for OGG files
      setTimeout(updateTotalTime, 100);
      setTimeout(updateTotalTime, 500);
      
      // Auto-resume with fade-in if track was switched during playback
      if (this.wasPlayingBeforeTrackSwitch) {
        this.wasPlayingBeforeTrackSwitch = false; // Reset flag

        // Set volume to 0, start playback, then fade in. Read the nominal
        // volume (not wavesurfer.getVolume(), which reflects whatever a
        // fade currently has gain at, not necessarily the real volume).
        const targetVolume = this.lastKnownVolume;
        // Cancel any still-active fade automation first - wavesurfer's own
        // setVolume() does a direct gainNode.gain.value= write, which throws
        // if it lands inside an active setValueCurveAtTime's time range.
        this.cancelActiveFades();
        this.wavesurfer.setVolume(0);
        this.wavesurfer.play();

        // A short delay, not requestAnimationFrame, before scheduling the
        // fade-in curve: verified directly (50+ run stress test) that
        // scheduling new GainNode automation via rAF (or with no delay at
        // all) shortly after play() starts a fresh AudioBufferSourceNode
        // hits a real, intermittent Chromium bug where gain briefly reads
        // back as the node's construction-time default (1) - an audible
        // full-volume blip before the ramp takes over. A plain setTimeout of
        // 16ms+ reliably avoided it every time (rAF did not, despite being a
        // similar delay) in the same test; 20ms is inaudible here since gain
        // is already at 0 throughout the wait.
        setTimeout(() => {
          this.applyAudioFadeInFromZero(targetVolume);
        }, 20);
      }
    });
    this.wavesurfer.on("play", () => {
      // Deliberately NOT calling cancelActiveFades() here. This handler
      // fires asynchronously relative to whatever called wavesurfer.play()
      // (that call isn't awaited, and 'play' can fire anywhere from
      // immediately to some delay later depending on the browser's audio
      // context resume timing). Every resume/track-switch path that starts
      // a fade-in already calls cancelActiveFades() explicitly BEFORE
      // calling play() and BEFORE scheduling the fade-in - a cancel here
      // was purely redundant with that, and being timing-dependent, it
      // could just as easily fire *after* a fade-in had already been
      // scheduled and silently cancel it mid-ramp, with gain left frozen
      // wherever it was interrupted and no error to show for it. If a
      // genuinely new, unmanaged play() call ever needs a fade cancelled,
      // that call site should cancel explicitly, not rely on this event.

      // Show cursor when playing using UI accent color
      const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--ui-accent")
        .trim();
      this.wavesurfer.setOptions({ cursorColor: accentColor });
      this.elements.waveform.classList.add('playing');
      this.updatePlayingState(true);

      // Stop any other reelplayer embed already playing elsewhere on the
      // same host page - see pauseOtherPlayers()'s own comment for how.
      this.pauseOtherPlayers();

      // Start video playback
      // Note: playVideo() has built-in interruption handling via activeFades Map
      // It will gracefully cancel any in-flight video fade-outs and start fresh
      
      // Exit player-closed-idle state when audio starts playing. exit() removes the
      // idle-video priority class before playVideo() runs below, so playVideo()
      // resolves and crossfades to the real track/main video instead.
      this.closedIdleManager?.exit();

      this.playVideo();
      
      document.dispatchEvent(new CustomEvent("playback:play"));
    });
    this.wavesurfer.on("pause", () => {
      
      // Hide cursor when paused by making it transparent
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      
      // Skip video fade-out if we're in the middle of a track switch
      // Track switch handles its own video transitions with specific timing
      if (this.isTrackSwitching) {
        this.updatePlayingState(false);
        document.dispatchEvent(new CustomEvent("playback:pause"));
        return;
      }
      
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
        // pauseAfterFade: true so the actual pause() (and the 'pause' event
        // that triggers video fade-out) happens *inside* the fade-out, right
        // after gain reaches silence - not in a separate .then() here, which
        // left a window where gain got restored to full volume while audio
        // was still actually playing, audible as a pop right before pausing.
        this.applyAudioFadeOut(true);
      } else {
        // Check if resuming from pause (not at start)
        const currentTime = this.wavesurfer.getCurrentTime();
        const isResuming = currentTime > 0;
        
        
        if (isResuming) {
          // Resuming from pause: fade in both audio and video. Read the
          // nominal volume, not wavesurfer.getVolume() - see the lastKnownVolume
          // comment in playerAppCore for why (interrupted-fade edge case).
          const targetVolume = this.lastKnownVolume;
          // Cancel any still-active fade automation first - see comment on
          // the equivalent call above (wasPlayingBeforeTrackSwitch branch).
          this.cancelActiveFades();
          this.wavesurfer.setVolume(0);
          this.wavesurfer.play(); // Triggers 'play' event which starts video
          // See the equivalent comment above (wasPlayingBeforeTrackSwitch
          // branch) - a plain delay here, not rAF, avoids a real Chromium
          // GainNode automation bug.
          setTimeout(() => {
            this.applyAudioFadeInFromZero(targetVolume);
          }, 20);
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

    if (this.isTouchDevice()) {
      this.setupExpandableModeTouchInteractions(wrapper);
      return;
    }

    // Create new listener functions and store references for cleanup
    const handleMouseEnter = () => {
      if (!this.expandable.isExpanded) {
        this.expandPlayer();
      }
      // Exit playback-related idle states on mouse enter, but not player-closed-idle
      // (player-closed-idle should only exit when audio starts or player expands)
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

  // Mobile has no hover, so expandable mode instead expands/collapses based on
  // overlap with the middle third of the viewport (rootMargin of -33% top/bottom
  // shrinks the observer's root down to that middle-third band). With
  // threshold: 0, isIntersecting is already exactly "any overlap at all" vs
  // "zero overlap" - so this single boolean naturally gives the asymmetric
  // behavior wanted: the player expands (or stays expanded) as soon as any
  // part of it touches the band, and only collapses once it has completely
  // left the band on either side, rather than triggering off a single crossing
  // line. A tap on the bottom handle bar (or the reel heading, once visible)
  // can override this at any time.
  //
  // The override used to release itself once intersection state "agreed"
  // with the manually-set expand/collapse state again
  // (entry.isIntersecting === this.expandable.isExpanded) - but the observer
  // doesn't only fire on genuine scrolling, it also fires repeatedly during
  // the collapse/expand animation itself, since the box's geometry keeps
  // changing as it grows/shrinks. A tap-to-collapse could hit a transient
  // intermediate frame where the shrinking box briefly read as
  // non-intersecting, which matched isExpanded:false and released the
  // override early - then, once the shrink settled and the small collapsed
  // banner turned out to still overlap the band, the *next* firing reported
  // isIntersecting:true with the override already (wrongly) gone, silently
  // re-triggering expandPlayer() and undoing the tap. Trying to infer "has
  // the animation finished" from intersection state is exactly what was
  // unreliable - a flat time-based cooldown sidesteps it entirely: every
  // firing within TAP_COOLDOWN_MS of a manual tap is ignored outright,
  // regardless of what it reports, and normal scroll-driven behavior only
  // resumes once that's elapsed.
  // Expands a collapsed player from a deliberate mobile tap elsewhere in the
  // UI (the tap-bar/heading tap handler below, and setupVolumeControls()'s
  // volume-icon tap while collapsed-and-playing). Sets the same
  // mobileManualOverrideUntil cooldown handleTap() below does, so the
  // scroll-driven IntersectionObserver in setupExpandableModeTouchInteractions()
  // doesn't immediately fight a deliberate tap by re-collapsing/re-expanding
  // off scroll position alone right after it. No-ops in static mode (no
  // expand/collapse concept there) or if already expanded -
  // setupVolumeControls() calls this unconditionally on every volume-icon
  // tap, relying on this guard rather than checking mode/state itself.
  expandFromMobileTap() {
    if (!this.expandable.enabled || this.expandable.isExpanded) {
      console.log('[vol-debug] expandFromMobileTap bailed - enabled:', this.expandable.enabled, ', isExpanded:', this.expandable.isExpanded);
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const fadeDuration = parseFloat(styles.getPropertyValue('--expandable-collapse-fade-duration')) * 1000 || 200;
    const transitionDuration = (parseFloat(styles.getPropertyValue('--expandable-transition-duration')) || 0.3) * 1000;
    this.expandable.mobileManualOverrideUntil = Date.now() + fadeDuration + transitionDuration + 150;
    console.log('[vol-debug] expandFromMobileTap - override cooldown until', this.expandable.mobileManualOverrideUntil, '(now =', Date.now(), ')');
    this.expandPlayer();
    this.exitPlaybackIdle();
    this.exitCollapsedIdle();
  },

  setupExpandableModeTouchInteractions(wrapper) {
    const styles = getComputedStyle(document.documentElement);
    const fadeDuration = parseFloat(styles.getPropertyValue('--expandable-collapse-fade-duration')) * 1000 || 200;
    const transitionDuration = (parseFloat(styles.getPropertyValue('--expandable-transition-duration')) || 0.3) * 1000;
    // Covers the immediate-collapse fade + the height transition it's
    // followed by (the longer of the two animations this can trigger), plus
    // a small buffer.
    const TAP_COOLDOWN_MS = fadeDuration + transitionDuration + 150;

    // Tracks whether the wrapper currently overlaps the top half of the
    // viewport - used below to decide whether a collapse exited off the top
    // or bottom of the screen. Deliberately NOT using
    // entry.boundingClientRect/entry.rootBounds for this (an earlier attempt
    // did, and it was broken): confirmed via direct testing that inside an
    // embedded iframe, boundingClientRect is reported relative to the
    // iframe's OWN local viewport (e.g. top:0/bottom:500 - exactly the
    // iframe's own content height), while rootBounds is correctly
    // top-level-page-relative - two different, incompatible coordinate
    // systems on the same entry, silently making any direct comparison
    // between them meaningless. isIntersecting, on the other hand, IS
    // reliably correct cross-frame (that's what the whole scroll-trigger
    // feature already depends on) - so this uses a second observer and only
    // ever reads its isIntersecting boolean, never its rect numbers.
    let isInTopHalf = true; // default true - err on the side of compensating until a real reading arrives
    const topHalfObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isInTopHalf = entry.isIntersecting;
      });
    }, { threshold: 0, rootMargin: '0px 0px -50% 0px' });
    topHalfObserver.observe(wrapper);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (Date.now() < (this.expandable.mobileManualOverrideUntil || 0)) {
          console.log('[vol-debug] scroll observer fired but BLOCKED by cooldown - isIntersecting:', entry.isIntersecting, ', ms remaining:', this.expandable.mobileManualOverrideUntil - Date.now());
          return;
        }
        console.log('[vol-debug] scroll observer fired and NOT blocked - isIntersecting:', entry.isIntersecting, ', isExpanded:', this.expandable.isExpanded);
        if (entry.isIntersecting) {
          if (!this.expandable.isExpanded) this.expandPlayer();
          this.exitPlaybackIdle();
          this.exitCollapsedIdle();
        } else if (this.expandable.isExpanded) {
          console.log('[vol-debug] scroll observer TRIGGERING COLLAPSE');
          // immediate - by the time the default ~1.2s pre-collapsing/fade
          // dead-time (built for an incidental desktop mouseleave) elapsed,
          // a scrolling user could easily have moved well past where the
          // collapse was actually triggered, making the scroll-compensated
          // shrink (see compensateScrollDuringCollapse()) fire somewhere off
          // their current screen instead of where they left it.
          //
          // Only actually worth compensating if it exited off the TOP of the
          // screen - that's the only direction where there's meaningful
          // visible viewport space below the player for the shrink to
          // visibly pull upward. Exiting off the bottom means the player was
          // already down near the edge of the screen with little to no
          // visible space below it, so nothing perceptible needs anchoring.
          this.collapsePlayer(true, isInTopHalf);
        }
      });
    }, { threshold: 0, rootMargin: '-33% 0px -33% 0px' });

    observer.observe(wrapper);

    const handleTap = () => {
      if (this.expandable.isExpanded) {
        this.expandable.mobileManualOverrideUntil = Date.now() + TAP_COOLDOWN_MS;
        this.collapsePlayer(true); // immediate - explicit tap, not incidental hover-leave
        this.exitPlaybackIdle();
        this.exitCollapsedIdle();
      } else {
        this.expandFromMobileTap();
      }
    };

    // Primary tap target: the bottom handle bar, present regardless of
    // collapse state or whether the reel even has a title. The reel heading
    // is wired as a secondary target when present, but it can only ever
    // fire once already expanded - expandable.css hides it entirely
    // (opacity 0, max-height 0, pointer-events none) while collapsed, so
    // it has no hit area to tap until after expansion already happened.
    const tapBar = wrapper.querySelector('.expandable-tap-bar');
    const heading = wrapper.querySelector('.reel-title');
    if (tapBar) tapBar.addEventListener('click', handleTap);
    if (heading) heading.addEventListener('click', handleTap);

    const handleTouchMove = () => this.resetPlaybackIdleTimer();
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: true });

    this.expandable.listeners = { wrapper, observer, topHalfObserver, tap: handleTap, tapBar, heading, touchMove: handleTouchMove };
  },

  cleanupExpandableModeListeners() {
    if (this.expandable.listeners) {
      const { wrapper, mouseEnter, mouseLeave, mouseMove, observer, topHalfObserver, tap, tapBar, heading, touchMove } = this.expandable.listeners;
      if (wrapper) {
        if (mouseEnter) wrapper.removeEventListener('mouseenter', mouseEnter);
        if (mouseLeave) wrapper.removeEventListener('mouseleave', mouseLeave);
        if (mouseMove) wrapper.removeEventListener('mousemove', mouseMove);
        if (touchMove) wrapper.removeEventListener('touchmove', touchMove);
      }
      if (tap) {
        if (tapBar) tapBar.removeEventListener('click', tap);
        if (heading) heading.removeEventListener('click', tap);
      }
      if (observer) observer.disconnect();
      if (topHalfObserver) topHalfObserver.disconnect();
      this.expandable.listeners = null;
    }
    this.expandable.mobileManualOverrideUntil = 0;

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
      // Exit playback-related idle states on mouse enter, but not player-closed-idle
      // (player-closed-idle should only exit when audio starts or player expands)
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

    // Touch has no hover, so there's no equivalent of "mouse entered/left the
    // wrapper" - instead, any touch just exits idle and resets the same
    // activity timer mouseenter/mousemove drive. Attached unconditionally
    // (not gated behind isTouchDevice()) since touch events simply never
    // fire on a mouse-only device, so this is a no-op there.
    const handleTouchStart = () => {
      this.exitPlaybackIdle();
      this.resetPlaybackIdleTimer();
    };

    // Store listener references for cleanup
    this.static.listeners = {
      wrapper,
      mouseEnter: handleMouseEnter,
      mouseLeave: handleMouseLeave,
      mouseMove: handleMouseMove,
      touchStart: handleTouchStart
    };

    // Attach event listeners
    wrapper.addEventListener('mouseenter', handleMouseEnter);
    wrapper.addEventListener('mouseleave', handleMouseLeave);
    wrapper.addEventListener('mousemove', handleMouseMove);
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
  },

  cleanupStaticModeListeners() {
    if (this.static.listeners) {
      const { wrapper, mouseEnter, mouseLeave, mouseMove, touchStart } = this.static.listeners;
      if (wrapper) {
        wrapper.removeEventListener('mouseenter', mouseEnter);
        wrapper.removeEventListener('mouseleave', mouseLeave);
        wrapper.removeEventListener('mousemove', mouseMove);
        wrapper.removeEventListener('touchstart', touchStart);
      }
      this.static.listeners = null;
    }
    
    // Clear static mode idle timeout
    if (this.static.playbackIdleTimeout) {
      clearTimeout(this.static.playbackIdleTimeout);
      this.static.playbackIdleTimeout = null;
    }
  },

  cleanupHoverDarkenTouchListeners() {
    if (this.hoverDarkenTouch) {
      const { wrapper, handler, timeoutId } = this.hoverDarkenTouch;
      if (wrapper) {
        wrapper.removeEventListener('touchstart', handler);
      }
      clearTimeout(timeoutId);
      this.hoverDarkenTouch = null;
    }
  },

  // Independent of expandable/static mode - hoverDarkenEnabled is a standalone
  // reel setting either mode can turn on, so this is wired separately from
  // both of setupExpandableModeInteractions()/setupStaticModeInteractions()
  // rather than folded into either. Touch has no real hover, and some mobile
  // browsers fake a sticky :hover on tap that never clears until tapping
  // elsewhere - worse than nothing for a background darken effect (a
  // permanently-stuck-dark background). Instead: darken on touch activity,
  // then undarken again after a few seconds of no further activity, mirroring
  // the idle-timer pattern used elsewhere (resetPlaybackIdleTimer) rather than
  // a sustained press-and-hold or a state tied to expand/collapse.
  setupHoverDarkenTouchInteractions() {
    this.cleanupHoverDarkenTouchListeners();

    const wrapper = this.elements.playerWrapper;
    if (!wrapper || !this.isTouchDevice() || !wrapper.classList.contains('hover-darken-enabled')) {
      return;
    }

    this.hoverDarkenTouch = { wrapper, handler: null, timeoutId: null };

    const handler = () => {
      wrapper.classList.add('touch-darkened');
      clearTimeout(this.hoverDarkenTouch.timeoutId);
      this.hoverDarkenTouch.timeoutId = setTimeout(() => {
        wrapper.classList.remove('touch-darkened');
      }, 3000);
    };
    this.hoverDarkenTouch.handler = handler;

    // touchstart only, deliberately not touchmove - touchmove fires
    // continuously for the whole duration of any scroll gesture that started
    // on the player, which would keep resetting the undarken timer for as
    // long as the user is scrolling past it (e.g. carrying it through the
    // expandable scroll-trigger), never letting it lighten during that time.
    wrapper.addEventListener('touchstart', handler, { passive: true });
  },

  cleanupIdleUnblurTouchListeners() {
    if (this.idleUnblurTouch) {
      const { wrapper, handler, timeoutId } = this.idleUnblurTouch;
      if (wrapper) {
        wrapper.removeEventListener('touchstart', handler);
        wrapper.classList.remove('touch-settled');
      }
      clearTimeout(timeoutId);
      this.idleUnblurTouch = null;
    }
  },

  // Touch equivalent of idle-unblur's desktop :not(:hover)/:not(.expanded)
  // CSS rules (see css/player.css) - touch has no hover to react to, so
  // "settled" here means "no touch activity for a few seconds" instead.
  // Deliberately the inverse timing of setupHoverDarkenTouchInteractions()
  // above: that one ADDS its class on touch and removes it after the
  // cooldown; this one REMOVES .touch-settled immediately on touch and only
  // adds it back once the cooldown elapses without further touches, since
  // the desired end state here is unblurred-when-untouched rather than
  // darkened-when-touched. Independent of expandable/static mode - both
  // read .touch-settled in css/player.css, combined with :not(.expanded)
  // there for the expandable-specific "and actually contracted" requirement.
  setupIdleUnblurTouchInteractions() {
    this.cleanupIdleUnblurTouchListeners();

    const wrapper = this.elements.playerWrapper;
    if (!wrapper || !this.isTouchDevice() || !wrapper.classList.contains('idle-unblur-enabled')) {
      return;
    }

    this.idleUnblurTouch = { wrapper, handler: null, timeoutId: null };

    const scheduleSettle = () => {
      clearTimeout(this.idleUnblurTouch.timeoutId);
      this.idleUnblurTouch.timeoutId = setTimeout(() => {
        wrapper.classList.add('touch-settled');
      }, 3000);
    };

    const handler = () => {
      wrapper.classList.remove('touch-settled');
      scheduleSettle();
    };
    this.idleUnblurTouch.handler = handler;

    wrapper.addEventListener('touchstart', handler, { passive: true });
    // Arm the initial timer too, so a touch device that loads with playback
    // already underway (rather than the play tap itself firing touchstart)
    // still eventually settles.
    scheduleSettle();
  },

  validateProjectTitleImage() {
    const overlay = this.elements.projectTitleOverlay;
    if (!overlay) return;
    
    const imageUrl = overlay.dataset.imageUrl;
    if (!imageUrl) return;
    
    // Check if overlay needs intro animation
    const needsIntro = overlay.classList.contains('needs-intro');
    
    // Add loading class
    overlay.classList.add('loading');
    
    // Create a test image to validate the URL
    const testImage = new Image();
    
    testImage.onload = () => {
      // Image loaded successfully
      overlay.classList.remove('loading');
      overlay.classList.add('loaded');
      
      // Apply intro animation if needed
      if (needsIntro) {
        // Add intro animation class to trigger the animation
        overlay.classList.add('intro-animation');
        
        // Clean up after animation completes
        setTimeout(() => {
          overlay.classList.remove('intro-animation', 'needs-intro');
          this.isFirstLoad = false;
          this.lastProjectTitleImageUrl = imageUrl;
        }, 800); // Match animation duration
      } else {
        // Not animating, just update the tracking
        this.lastProjectTitleImageUrl = imageUrl;
      }
    };
    
    testImage.onerror = () => {
      // Image failed to load - hide overlay and show fallback
      console.warn('[Player] Failed to load project title image:', imageUrl);
      overlay.classList.remove('loading');
      overlay.classList.add('error');
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      
      // Still mark first load as done even if image fails
      this.isFirstLoad = false;
      this.lastProjectTitleImageUrl = imageUrl;
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

    // Exit player closed idle state if active
    this.closedIdleManager?.exit();

    // Remove collapsing classes and ensure expanded state
    wrapper.classList.remove('pre-collapsing');
    wrapper.classList.remove('collapsing');
    this.expandable.isExpanded = true;
    // Hint before the height transition starts, cleared once it settles
    // (below) rather than left on permanently - will-change keeps a
    // dedicated compositing layer around for as long as it's set, which
    // costs memory for no benefit outside of an actual transition.
    wrapper.style.willChange = 'height';
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

    // .player-content's horizontal padding animates in on expand (see
    // expandable.css), which changes the waveform's available width - the
    // frozen width from updateWaveformWidth() needs refreshing once that
    // settles, not before, so this waits out the same transition duration.
    const transitionDuration = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--expandable-transition-duration')) || 0.3) * 1000;
    setTimeout(() => {
      this.updateWaveformWidth();
      wrapper.style.willChange = '';
    }, transitionDuration + 50);
  },

  // Shrinking the wrapper's height (about to be triggered by the caller removing
  // 'expanded' right after this runs) retracts space from the page below it -
  // uncompensated, whatever's below just visibly jumps upward as that space
  // disappears. Watches the wrapper's *actual* rendered height via
  // ResizeObserver (rather than assuming the CSS transition's own easing
  // curve) and scrolls by the same delta on each reported change, so content
  // below stays visually anchored throughout the shrink regardless of curve.
  // Deliberately not a rAF + getBoundingClientRect() polling loop - that reads
  // layout on every single frame, forcing a synchronous layout flush right in
  // the middle of the browser's own transition work each frame. ResizeObserver
  // instead gets the post-layout size for free, after the browser has already
  // computed it. In a real embed the player runs inside a same-origin-or-not
  // <iframe>, so it can't call the host page's scrollBy() directly - it asks
  // via postMessage instead, same pattern as the existing resize handshake
  // below.
  compensateScrollDuringCollapse(wrapper) {
    const inIframe = window.self !== window.top;
    let previousHeight = wrapper.getBoundingClientRect().height;

    const applyDelta = (delta) => {
      if (delta === 0) return;
      if (inIframe) {
        window.parent.postMessage({ type: 'reelplayer:scrollCompensate', delta: -delta }, '*');
      } else {
        window.scrollBy(0, -delta);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      // wrapper has no padding/border (see expandable.css), so contentRect's
      // height is equivalent to the border-box height getBoundingClientRect()
      // would give - using it directly avoids an extra forced layout read.
      const currentHeight = entries[entries.length - 1].contentRect.height;
      applyDelta(previousHeight - currentHeight);
      previousHeight = currentHeight;
    });

    const stop = () => {
      resizeObserver.disconnect();
      wrapper.removeEventListener('transitionend', onTransitionEnd);
    };

    const onTransitionEnd = (e) => {
      if (e.target === wrapper && (e.propertyName === 'height' || e.propertyName === 'max-height')) {
        stop();
      }
    };
    wrapper.addEventListener('transitionend', onTransitionEnd);
    resizeObserver.observe(wrapper);

    // Fallback in case transitionend never fires (e.g. an interrupted
    // transition, or a browser/OS reduced-motion setting that removes the
    // transition entirely) - stop regardless shortly after the CSS
    // transition's own configured duration.
    const fallbackDuration = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--expandable-transition-duration')) || 0.4) * 1000;
    setTimeout(stop, fallbackDuration + 150);
  },

  // immediate skips the pre-collapsing dead-time below (--expandable-collapse-delay,
  // ~1s by default) - that delay exists so an incidental mouseleave doesn't snap the
  // player shut instantly, but a deliberate tap-to-close is already an explicit
  // signal and shouldn't sit unresponsive for a second-plus before anything visible
  // happens. compensateScroll defaults to true (desktop, and a tap-to-close, both
  // just always compensate) - only the scroll-triggered auto-collapse passes false
  // when it detects the player exited off the bottom of the screen, see the
  // observer callback in setupExpandableModeTouchInteractions() for why.
  collapsePlayer(immediate = false, compensateScroll = true) {
    console.trace('[vol-debug] collapsePlayer() called - immediate:', immediate);
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    this.expandable.isExpanded = false;

    // Give the idle video a head start on buffering - it won't actually be needed
    // until the collapse animation and idle delay below finish (several seconds),
    // and starting the load now uses that dead time instead of wasting it.
    this.closedIdleManager?.preloadIdleVideo();

    // Check playing state immediately to set playing-collapsed class
    const isCurrentlyPlaying = this.wavesurfer?.isPlaying();
    const shouldShowWaveform = isCurrentlyPlaying && this.expandable.settings?.showWaveformOnCollapse !== false;
    
    if (shouldShowWaveform) {
      wrapper.classList.add('playing-collapsed');
    } else {
      wrapper.classList.remove('playing-collapsed');
    }
    
    // Get timing values from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const fadeDuration = parseFloat(styles.getPropertyValue('--expandable-collapse-fade-duration')) * 1000 || 200;
    const collapsedIdleDelay = parseInt(styles.getPropertyValue('--playback-idle-collapsed-delay')) || 1000;

    const startFadeOut = () => {
      wrapper.classList.remove('pre-collapsing');
      wrapper.classList.add('collapsing');

      // Wait for fade-out to complete, then collapse height
      this.expandable.collapseFadeTimeout = setTimeout(() => {
        // Start compensating BEFORE removing 'expanded' - that removal is what
        // triggers the CSS height transition, so the rAF loop needs to already
        // be watching in order to catch the very first frame of the shrink.
        if (compensateScroll) {
          this.compensateScrollDuringCollapse(wrapper);
        }
        // Same will-change reasoning as expandPlayer() - set right before the
        // transition starts, cleared once it settles below.
        wrapper.style.willChange = 'height';
        wrapper.classList.remove('expanded');
        wrapper.classList.remove('collapsing');

        // Same reasoning as the equivalent call in expandPlayer() - waits out
        // .player-content's padding transition before re-measuring.
        const transitionDuration = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--expandable-transition-duration')) || 0.3) * 1000;
        setTimeout(() => {
          this.updateWaveformWidth();
          wrapper.style.willChange = '';
        }, transitionDuration + 50);

        // Clear timeout references
        this.expandable.collapseDelayTimeout = null;
        this.expandable.collapseFadeTimeout = null;

        // Notify parent window if in iframe (for iframe height adjustment)
        if (window.self !== window.top) {
          const collapsedHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--expandable-collapsed-height')) || 120;
          window.parent.postMessage({ type: 'reelplayer:resize', height: collapsedHeight }, '*');
        }

        // Re-enter idle state after collapse if still playing, or player-closed-idle if not playing
        this.expandable.collapsedIdleTimeout = setTimeout(() => {
          const isPlaying = this.wavesurfer?.isPlaying();
          if (!this.expandable.isExpanded) {
            if (isPlaying) {
              this.enterCollapsedIdle();
            } else {
              // Check if we should enter player-closed-idle state when collapsed and not playing
              this.closedIdleManager?.checkConditions();
            }
          }
        }, collapsedIdleDelay);
      }, fadeDuration);
    };

    if (immediate) {
      // Skip the pre-collapsing dead-time entirely rather than collapsing it to a
      // 0ms timeout - swapping pre-collapsing straight to collapsing within the
      // same tick risks the browser coalescing both class mutations into a single
      // style recalc, silently dropping the pre-collapsing opacity transition
      // instead of actually rendering it for a frame (which read as the whole
      // player snapping shut with no animation at all, rather than just losing
      // the lead-in dim). Going straight into the real collapsing fade (opacity
      // 1 -> 0 over fadeDuration, a transition that's guaranteed to have a real
      // starting frame since it's applied synchronously here, not inside another
      // pending timeout) sidesteps that risk entirely.
      startFadeOut();
    } else {
      // Add pre-collapsing class for initial opacity reduction
      wrapper.classList.add('pre-collapsing');
      const collapseDelay = parseInt(styles.getPropertyValue('--expandable-collapse-delay')) || 1000;
      this.expandable.collapseDelayTimeout = setTimeout(startFadeOut, collapseDelay);
    }
  },

  updatePlayingState(playing) {
    this.expandable.isPlaying = playing;
    const wrapper = this.elements.playerWrapper;

    // Generic play-state marker, independent of mode - gates idle-unblur
    // (css/player.css) so it never activates while nothing is playing,
    // regardless of hover/touch/expanded state.
    if (wrapper) {
      wrapper.classList.toggle('is-playing', playing);
    }

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
        // Don't exit player-closed-idle on audio playback - videos should continue independently
      } else {
        // Clear idle state and timer when playback stops
        this.clearPlaybackIdleTimeout();
        this.exitPlaybackIdle();
        
        // Check if we should enter player-closed-idle after playback stops (with delay)
        if (this.expandable.enabled && !this.expandable.isExpanded) {
          setTimeout(() => {
            this.closedIdleManager?.checkConditions();
          }, 1000); // Delay to allow for user interaction
        }
      }
    }
  },

  /**
   * Apply audio fade-in effect from current volume 0 to target
   * Assumes volume is already set to 0 before calling
   * @param {number} targetVolume - The target volume to fade to
   */
  renderPlayer({ showTitle, title, playlist, reel }) {
    // Clean up old event listeners before re-rendering
    this.cleanupExpandableModeListeners();
    this.cleanupStaticModeListeners();
    this.cleanupHoverDarkenTouchListeners();
    this.cleanupIdleUnblurTouchListeners();
    this.cleanupWaveformWidthTracking();

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
    if (reel?.hoverDarkenEnabled) wrapperClasses += ' hover-darken-enabled';
    if (reel?.idleUnblurEnabled) wrapperClasses += ' idle-unblur-enabled';

    // Build project title overlay HTML for expandable mode
    let projectTitleOverlayHTML = '';
    if (this.expandable.enabled && reel.projectTitleImage) {
      // Add needs-intro class if this is first load or new image
      const needsIntro = this.isFirstLoad || this.lastProjectTitleImageUrl !== reel.projectTitleImage;
      const introClass = needsIntro ? ' needs-intro' : '';
      projectTitleOverlayHTML = `
        <div class="project-title-overlay${introClass}" style="background-image: url('${reel.projectTitleImage}');" data-image-url="${reel.projectTitleImage}"></div>
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
      <div class="player-closed-idle-overlay"></div>
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
              <div id="loading" class="loading">
                <div class="spinner"></div>
              </div>
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
      </div>
      <div id="playlist" class="playlist${shouldHideTitle ? ' no-title' : ''}"></div>
      ${this.expandable.enabled ? '<div class="expandable-tap-bar"></div>' : ''}
    </div>
  `;
    this.elements = {};
    this.cacheElements();

    // The innerHTML rebuild above just discarded the previous video elements
    // (main/track A+B) without ever pausing/fading them - cacheElements() re-points
    // videoState's element refs at the fresh, blank replacements, but the *tracked*
    // state (playing flags, in-flight fades, per-layer URLs) is core-level and
    // survives a re-render untouched. Left stale, a "trackVideoPlaying: true" left
    // over from before a mid-idle refresh makes checkConditions() believe a video is
    // still active forever (nothing will ever flip it back), so it just reschedules
    // its recheck indefinitely and never calls enter() - the idle video can never
    // start again until a full page reload. Reset it to match the actually-blank DOM.
    this.videoState.activeFades.clear();
    this.videoState.mainVideoPlaying = false;
    this.videoState.trackVideoPlaying = false;
    this.videoState.mainVideoA_Url = '';
    this.videoState.mainVideoB_Url = '';
    this.videoState.trackVideoA_Url = '';
    this.videoState.trackVideoB_Url = '';
    this.videoState.currentMainLayer = 'a';
    this.videoState.currentTrackLayer = 'a';

    // Store current reel settings for background transitions
    this.currentReelSettings = reel;
    
    // Initialize player closed idle manager
    if (!this.closedIdleManager) {
      this.closedIdleManager = createPlayerClosedIdleManager(this);
    }
    this.closedIdleManager.initialize();
    
    // Set up mode-specific interactions
    if (this.expandable.enabled) {
      this.setupExpandableModeInteractions();
      this.validateProjectTitleImage();
    } else {
      // Set up static mode interactions for idle state
      this.setupStaticModeInteractions();
    }
    this.setupHoverDarkenTouchInteractions();
    this.setupIdleUnblurTouchInteractions();
    this.setupWaveformWidthTracking();

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

export const playerApp = Object.assign(
  playerAppCore,
  imagePreload,
  audioFades,
  idleState,
  backgroundZoomAnimation,
  playlistScroll,
  videoLayerState,
  videoPlayback
);
