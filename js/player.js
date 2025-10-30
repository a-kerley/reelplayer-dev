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
  
  // Expandable mode state - consolidated
  expandable: {
    enabled: false,
    isExpanded: false,
    isPlaying: false,
    showWaveformOnCollapse: true,
    settings: null,
    listeners: null,
    playbackIdleTimeout: null,    // Single timeout for playback-idle transitions
    collapsedIdleTimeout: null    // Single timeout for collapsed-idle transitions
  },

  // Background zoom animations (Web Animations API)
  backgroundAnimations: {
    main: null,        // Animation for main background (::after)
    layerA: null,      // Animation for track background layer A
    layerB: null       // Animation for track background layer B
  },

  // Video background state
  videoState: {
    mainVideo: null,           // Reference to main video element
    trackVideo: null,          // Reference to track video element
    currentMainVideoUrl: '',   // Currently loaded main video URL
    currentTrackVideoUrl: '',  // Currently loaded track video URL
    mainVideoPlaying: false,   // Is main video currently playing
    trackVideoPlaying: false   // Is track video currently playing
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
    
    // Cache video elements
    this.videoState.mainVideo = document.querySelector(".main-video");
    this.videoState.trackVideo = document.querySelector(".track-video");
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
    
    // Additional delayed updates only if in expandable mode (height may change during transitions)
    if (this.expandable.enabled) {
      setTimeout(updateScrollbar, 100);
      setTimeout(updateScrollbar, 500);
    }
    
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

  convertDropboxLinkToDirect(url) {
    if (!url.includes("dropbox.com")) return url;
    return url
      .replace("www.dropbox.com", "dl.dropboxusercontent.com")
      .replace("dropbox.com", "dl.dropboxusercontent.com")
      .replace("?dl=0", "?dl=1")
      .replace("&dl=0", "&dl=1");
  },

  initializePlayer(audioURL, title, index) {
    this.showLoading(true);
    
    // Initialize main background animation on first load
    if (!this.backgroundAnimations.main) {
      this.initMainBackgroundAnimation();
    }
    
    // Update current track index
    this.currentTrackIndex = index;
    
    // Update active playlist item
    this.updateActivePlaylistItem(index);
    
    // Update track info display
    this.updateTrackInfo(audioURL, title);
    
    // Update track background with cross-dissolve
    this.updateTrackBackground(index);
    
    // Pre-load video for the new track (will play when audio starts)
    this.preloadVideos();
    
    // Reset playhead to beginning when changing tracks
    if (playerApp.wavesurfer) {
      playerApp.wavesurfer.seekTo(0);
    }
    
    playerApp.wavesurfer.load(audioURL);
    const event = new CustomEvent("track:change", {
      detail: { audioURL, title, index },
    });
    document.dispatchEvent(event);
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
      setTimeout(() => {
        // Set opacity for all canvases inside waveform (WaveSurfer v7 uses nested structure)
        const canvases = document.querySelectorAll("#waveform canvas");
        // In expandable mode, don't set inline opacity - let CSS handle it completely
        // In static mode, set opacity as normal
        if (!this.expandable.enabled) {
          canvases.forEach(canvas => canvas.style.opacity = "1");
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
      // Show cursor when playing using UI accent color
      const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--ui-accent")
        .trim();
      this.wavesurfer.setOptions({ cursorColor: accentColor });
      this.elements.waveform.classList.add('playing');
      this.updatePlayingState(true);
      
      // Start video playback
      this.playVideo();
      
      document.dispatchEvent(new CustomEvent("playback:play"));
    });
    this.wavesurfer.on("pause", () => {
      // Hide cursor when paused by making it transparent
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      this.updatePlayingState(false);
      
      // Stop video playback
      this.stopVideo();
      
      document.dispatchEvent(new CustomEvent("playback:pause"));
    });
    this.wavesurfer.on("finish", () => {
      // Hide cursor when finished
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      this.updatePlayingState(false);
      
      // Stop video playback
      this.stopVideo();
      
      document.dispatchEvent(new CustomEvent("playback:finish"));
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
      this.wavesurfer.playPause();
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
    } else {
      loadingIndicator.classList.add("hidden");
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

  clearAllIdleTimeouts() {
    // Clear playback idle entry timer
    if (this.expandable.playbackIdleTimeout) {
      clearTimeout(this.expandable.playbackIdleTimeout);
      this.expandable.playbackIdleTimeout = null;
    }
    
    // Clear all idle state timeouts
    if (this.expandable.playbackIdleTimeout) {
      clearTimeout(this.expandable.playbackIdleTimeout);
      this.expandable.playbackIdleTimeout = null;
    }
    if (this.expandable.collapsedIdleTimeout) {
      clearTimeout(this.expandable.collapsedIdleTimeout);
      this.expandable.collapsedIdleTimeout = null;
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
    
    this.expandable.playbackIdleTimeout = setTimeout(() => {
      this.enterPlaybackIdle();
    }, idleDelay);
  },

  // ========================================
  // IDLE STATE MANAGEMENT
  // ========================================

  // Enter expanded playback idle state (when player is open and idle during playback)
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

  // Exit expanded playback idle state
  exitPlaybackIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper || !wrapper.classList.contains('playback-idle')) return;

    // Clear any pending timeouts
    if (this.expandable.playbackIdleTimeout) {
      clearTimeout(this.expandable.playbackIdleTimeout);
      this.expandable.playbackIdleTimeout = null;
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
    const varName = type === 'fadeIn' ? '--video-fade-in-duration' : '--video-fade-out-duration';
    return this.parseCssDuration(varName, 800);
  },

  /**
   * Start video playback (tied to audio playback)
   * Loads and fades in the appropriate video for the current track
   */
  async playVideo() {
    const track = this.currentReelSettings?.playlist?.[this.currentTrackIndex];
    const reel = this.currentReelSettings;
    const activeVideo = this.getActiveVideo(track, reel);
    
    if (!activeVideo.url) {
      console.log('[Play Video] No video URL configured');
      return;
    }
    
    console.log(`[Play Video] Starting ${activeVideo.type} video playback`);

    const targetElement = activeVideo.type === 'track' ? this.videoState.trackVideo : this.videoState.mainVideo;
    const otherElement = activeVideo.type === 'track' ? this.videoState.mainVideo : this.videoState.trackVideo;
    const currentUrlKey = activeVideo.type === 'track' ? 'currentTrackVideoUrl' : 'currentMainVideoUrl';

    // Fade out other video if active
    if (otherElement?.classList.contains('active')) {
      this.fadeOutVideo(otherElement, this.getVideoTransitionDuration('fadeOut'), true);
      this.videoState.mainVideoPlaying = activeVideo.type !== 'track' ? false : this.videoState.mainVideoPlaying;
      this.videoState.trackVideoPlaying = activeVideo.type === 'track' ? false : this.videoState.trackVideoPlaying;
    }

    // If video already active with same URL, just ensure it's playing
    if (targetElement.classList.contains('active') && this.videoState[currentUrlKey] === activeVideo.url) {
      console.log(`[Play Video] ${activeVideo.type} video already active, resuming`);
      this.resumeVideo(targetElement);
      return;
    }

    // Load and fade in new video
    try {
      const loadStart = performance.now();
      console.log(`[Play Video] Loading ${activeVideo.type} video - ReadyState: ${targetElement.readyState}`);
      
      await this.loadVideo(targetElement, activeVideo.url, activeVideo.type);
      const loadTime = performance.now() - loadStart;
      
      console.log(`[Play Video] Video loaded in ${loadTime.toFixed(0)}ms, fading in...`);
      this.videoState[currentUrlKey] = activeVideo.url;
      
      await this.fadeInVideo(targetElement, this.getVideoTransitionDuration('fadeIn'));
      console.log(`[Play Video] ✓ ${activeVideo.type} video now playing`);
      
      if (activeVideo.type === 'track') {
        this.videoState.trackVideoPlaying = true;
      } else {
        this.videoState.mainVideoPlaying = true;
      }
      
      // Pause background animations when video is playing
      this.pauseBackgroundAnimations(false, 0);
    } catch (err) {
      console.error('[Play Video] ✗ Error playing video:', err);
    }
  },

  /**
   * Stop video playback (tied to audio playback)
   * Fades out any active videos
   */
  async stopVideo() {
    const fadeOutDuration = this.getVideoTransitionDuration('fadeOut');
    const promises = [];

    if (this.videoState.mainVideo?.classList.contains('active')) {
      promises.push(this.fadeOutVideo(this.videoState.mainVideo, fadeOutDuration, true));
      this.videoState.mainVideoPlaying = false;
    }

    if (this.videoState.trackVideo?.classList.contains('active')) {
      promises.push(this.fadeOutVideo(this.videoState.trackVideo, fadeOutDuration, true));
      this.videoState.trackVideoPlaying = false;
    }

    await Promise.all(promises);
    
    // Resume background animations when video stops
    const duration = this.parseCssDuration('--playback-idle-zoom-slow-down-duration', 800);
    this.pauseBackgroundAnimations(true, duration);
  },

  /**
   * Pre-load videos for the current track to enable smooth playback
   * Called automatically when player renders and when tracks change
   */
  preloadVideos() {
    const track = this.currentReelSettings?.playlist?.[this.currentTrackIndex];
    const reel = this.currentReelSettings;
    
    if (!track || !reel) return;
    
    const activeVideo = this.getActiveVideo(track, reel);
    if (!activeVideo.url) return;
    
    // Determine which video element to pre-load
    const targetElement = activeVideo.type === 'track' ? this.videoState.trackVideo : this.videoState.mainVideo;
    const currentUrlKey = activeVideo.type === 'track' ? 'currentTrackVideoUrl' : 'currentMainVideoUrl';
    
    // Only pre-load if URL has changed or video element doesn't have source loaded
    const needsLoad = this.videoState[currentUrlKey] !== activeVideo.url || 
                      !targetElement.src || 
                      targetElement.src !== activeVideo.url;
    
    if (needsLoad) {
      // Pre-load in background without blocking
      this.loadVideo(targetElement, activeVideo.url, activeVideo.type)
        .then(() => {
          this.videoState[currentUrlKey] = activeVideo.url;
        })
        .catch(err => {
          console.error('Video pre-load failed (will retry on idle):', err);
        });
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

      // Set video source and trigger load with aggressive preload
      videoElement.src = videoUrl;
      videoElement.preload = 'auto'; // Tell browser to buffer as much as possible
      console.log(`[Video Load] Starting load for ${type} video:`, videoUrl);
      videoElement.load();
    });
  },

  /**
   * Fade in a video element and start playback
   * @param {HTMLVideoElement} videoElement - The video element to fade in
   * @param {number} duration - Fade duration in milliseconds
   * @returns {Promise} - Resolves when fade completes
   */
  async fadeInVideo(videoElement, duration = 800) {
    if (!videoElement) return Promise.resolve();

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

      // Add active class to trigger CSS fade-in
      videoElement.classList.add('active');
      console.log(`[Fade In Video] ${getTimestamp()} Active class added - classList:`, videoElement.classList.toString());

      // Resolve after fade duration
      setTimeout(resolve, duration);
    });
  },

  /**
   * Fade out a video element and pause playback
   * @param {HTMLVideoElement} videoElement - The video element to fade out
   * @param {number} duration - Fade duration in milliseconds
   * @param {boolean} preservePosition - Whether to preserve current playback position
   * @returns {Promise} - Resolves when fade completes
   */
  fadeOutVideo(videoElement, duration = 800, preservePosition = true) {
    if (!videoElement) return Promise.resolve();

    return new Promise((resolve) => {
      videoElement.classList.remove('active');
      
      setTimeout(() => {
        videoElement.pause();
        if (!preservePosition) videoElement.currentTime = 0;
        resolve();
      }, duration);
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

    // Clear all idle transition timeouts to prevent orphaned callbacks
    if (this.expandable.playbackIdleClassTimeout) {
      clearTimeout(this.expandable.playbackIdleClassTimeout);
      this.expandable.playbackIdleClassTimeout = null;
    }
    if (this.expandable.playbackIdleVideoTimeout) {
      clearTimeout(this.expandable.playbackIdleVideoTimeout);
      this.expandable.playbackIdleVideoTimeout = null;
    }
    if (this.expandable.collapsedIdleClassTimeout) {
      clearTimeout(this.expandable.collapsedIdleClassTimeout);
      this.expandable.collapsedIdleClassTimeout = null;
    }
    if (this.expandable.collapsedIdleVideoTimeout) {
      clearTimeout(this.expandable.collapsedIdleVideoTimeout);
      this.expandable.collapsedIdleVideoTimeout = null;
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

    // Clear all playback idle transition timeouts
    if (this.expandable.playbackIdleClassTimeout) {
      clearTimeout(this.expandable.playbackIdleClassTimeout);
      this.expandable.playbackIdleClassTimeout = null;
    }
    if (this.expandable.playbackIdleVideoTimeout) {
      clearTimeout(this.expandable.playbackIdleVideoTimeout);
      this.expandable.playbackIdleVideoTimeout = null;
    }

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

      // Handle playback-idle state
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

  renderPlayer({ showTitle, title, playlist, reel }) {
    // Clean up old event listeners before re-rendering
    this.cleanupExpandableModeListeners();
    
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
      <video class="background-video main-video" preload="auto" loop muted playsinline></video>
      <video class="background-video track-video" preload="auto" loop muted playsinline></video>
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
                <dotlottie-player 
                  src="assets/Insider-loading.lottie" 
                  autoplay 
                  loop
                  style="width: 120px; height: 120px;">
                </dotlottie-player>
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
    </div>
  `;
    this.elements = {};
    this.cacheElements();
    
    // Store current reel settings for background transitions
    this.currentReelSettings = reel;
    
    // Set up expandable mode interactions if enabled
    if (this.expandable.enabled) {
      this.setupExpandableModeInteractions();
      this.validateProjectTitleImage();
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
