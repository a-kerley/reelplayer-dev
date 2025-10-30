// player.js
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
    listeners: null
  },

  // Background zoom animations (Web Animations API)
  backgroundAnimations: {
    main: null,        // Animation for main background (::after)
    layerA: null,      // Animation for track background layer A
    layerB: null       // Animation for track background layer B
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
    
    // Initialize custom scrollbar with delay to ensure DOM is ready
    setTimeout(() => {
      this.initCustomScrollbar(playlistEl);
    }, 300);
  },

  initCustomScrollbar(playlistEl) {
    // Remove any existing custom scrollbar
    const existingScrollbar = playlistEl.querySelector('.custom-scrollbar');
    if (existingScrollbar) {
      existingScrollbar.remove();
    }

    // Get UI accent color from CSS variable
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim() || '#2a0026';
    
    /**
     * Convert any color format to rgba with specified opacity
     * @param {string} color - Color in hex, rgb, or rgba format
     * @param {number} opacity - Opacity value between 0 and 1
     * @returns {string} Color in rgba format
     */
    const colorToRgba = (color, opacity) => {
      // If already rgba/rgb, extract the rgb values
      if (color.startsWith('rgb')) {
        const match = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        if (match) {
          const r = Math.round(parseFloat(match[1]));
          const g = Math.round(parseFloat(match[2]));
          const b = Math.round(parseFloat(match[3]));
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
      }
      // If hex, convert to rgba
      color = color.replace('#', '');
      const r = parseInt(color.substring(0, 2), 16);
      const g = parseInt(color.substring(2, 4), 16);
      const b = parseInt(color.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };
    
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

    // Initial update with delay to ensure playlist is rendered
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
      document.dispatchEvent(new CustomEvent("playback:play"));
    });
    this.wavesurfer.on("pause", () => {
      // Hide cursor when paused by making it transparent
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      this.updatePlayingState(false);
      document.dispatchEvent(new CustomEvent("playback:pause"));
    });
    this.wavesurfer.on("finish", () => {
      // Hide cursor when finished
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      this.updatePlayingState(false);
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
      // Exit playback-idle state on mouse enter
      this.exitPlaybackIdle();
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
    // Clear any pending idle timeout
    this.clearPlaybackIdleTimeout();
  },

  resetPlaybackIdleTimer() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    // Only set idle timer during playback
    const isPlaying = this.wavesurfer?.isPlaying();
    if (!isPlaying) return;

    // Clear existing timeout
    this.clearPlaybackIdleTimeout();

    // Exit idle state immediately on movement
    this.exitPlaybackIdle();

    // Get idle delay from CSS variable
    const styles = getComputedStyle(document.documentElement);
    const idleDelay = parseInt(styles.getPropertyValue('--playback-idle-delay')) || 1000;

    // Set new timeout
    this.expandable.playbackIdleTimeout = setTimeout(() => {
      this.enterPlaybackIdle();
    }, idleDelay);
  },

  clearPlaybackIdleTimeout() {
    if (this.expandable.playbackIdleTimeout) {
      clearTimeout(this.expandable.playbackIdleTimeout);
      this.expandable.playbackIdleTimeout = null;
    }
  },

  // ========================================
  // PLAYBACK-IDLE STATE MANAGEMENT
  // ========================================

  enterPlaybackIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    // Only enter idle during playback
    const isPlaying = this.wavesurfer?.isPlaying();
    if (!isPlaying) return;

    wrapper.classList.add('playback-idle');
    
    // Get speed-up duration from CSS and resume animations with smooth transition
    const duration = this.parseCssDuration('--playback-idle-zoom-speed-up-duration', 800);
    this.playBackgroundAnimations(true, duration);
  },

  exitPlaybackIdle() {
    const wrapper = this.elements.playerWrapper;
    if (!wrapper) return;

    wrapper.classList.remove('playback-idle');
    
    // Get slow-down duration from CSS and pause animations with smooth transition
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

    // Remove collapsing classes and ensure expanded state
    wrapper.classList.remove('pre-collapsing');
    wrapper.classList.remove('collapsing');
    this.expandable.isExpanded = true;
    wrapper.classList.add('expanded');
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
