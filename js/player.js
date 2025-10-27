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
    let accentColor = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim() || '#2a0026';
    
    console.log('Raw accent color from CSS:', accentColor);
    
    // Convert color to rgba with opacity
    const colorToRgba = (color, opacity) => {
      // If already rgba/rgb, extract the rgb values
      if (color.startsWith('rgb')) {
        const match = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        if (match) {
          const r = Math.round(parseFloat(match[1]));
          const g = Math.round(parseFloat(match[2]));
          const b = Math.round(parseFloat(match[3]));
          const result = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          console.log('Converted rgba color:', result);
          return result;
        }
      }
      // If hex, convert to rgba
      color = color.replace('#', '');
      const r = parseInt(color.substring(0, 2), 16);
      const g = parseInt(color.substring(2, 4), 16);
      const b = parseInt(color.substring(4, 6), 16);
      const result = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      console.log('Converted hex color:', result);
      return result;
    };
    
    const thumbColor = colorToRgba(accentColor, 0.3);
    console.log('Final thumb color:', thumbColor);

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
        return;
      }
      
      scrollbarContainer.style.display = 'block';
      playlistEl.classList.add('scrollable');
      
      const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * clientHeight);
      const scrollPercentage = playlistEl.scrollTop / (scrollHeight - clientHeight);
      const thumbTop = scrollPercentage * (clientHeight - thumbHeight);
      
      scrollbarThumb.style.height = thumbHeight + 'px';
      scrollbarThumb.style.top = thumbTop + 'px';
    };
    
    // Initial position
    updateScrollbarPosition();

    // Handle scroll events
    playlistEl.addEventListener('scroll', () => {
      if (!isDragging) {
        updateScrollbar();
      }
    });
    
    // Prevent page scroll when playlist reaches top/bottom
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
    
    // Update current track index
    this.currentTrackIndex = index;
    
    // Update active playlist item
    this.updateActivePlaylistItem(index);
    
    // Update track info display
    this.updateTrackInfo(audioURL, title);
    
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
        canvases.forEach(canvas => canvas.style.opacity = "1");
        playPauseBtn.style.opacity = "1";
        playPauseBtn.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-accent")
          .trim();
      }, 50);
      if (volumeControl) {
        volumeControl.style.opacity = "1";
        volumeControl.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-accent")
          .trim();
      }
      const trackInfo = this.elements.trackInfo;
      if (trackInfo) {
        trackInfo.classList.add("visible");
      }
      
      // Update total time - wait for accurate duration
      const updateTotalTime = () => {
        const totalTime = this.elements.totalTime;
        const duration = this.wavesurfer.getDuration();
        console.log('[Player] getDuration returned:', duration);
        if (duration && isFinite(duration)) {
          if (totalTime) {
            totalTime.textContent = this.formatTime(duration);
            totalTime.classList.add("visible");
            console.log('[Player] Total time set to:', this.formatTime(duration));
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
      document.dispatchEvent(new CustomEvent("playback:play"));
    });
    this.wavesurfer.on("pause", () => {
      // Hide cursor when paused by making it transparent
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
      document.dispatchEvent(new CustomEvent("playback:pause"));
    });
    this.wavesurfer.on("finish", () => {
      // Hide cursor when finished
      this.wavesurfer.setOptions({ cursorColor: 'transparent' });
      this.elements.waveform.classList.remove('playing');
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
      responsive: true,
      hideScrollbar: true,
      interact: true,
      fillParent: true,
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
  renderPlayer({ showTitle, title, playlist, reel }) {
    // Store reel reference for accessing settings
    this.reel = reel || {};
    
    const container = document.getElementById("reelPlayerPreview");
    if (!container) return;
    
    const shouldHideTitle = !(showTitle && title && title.trim());
    
    container.innerHTML = `
    <div class="player-wrapper${shouldHideTitle ? ' no-title' : ''}">
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
