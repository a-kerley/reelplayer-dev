const playerApp = {
  elements: {},
  isWaveformReady: false,
  wavesurfer: null,
  previousVolume: 1,
  isDraggingSlider: false,
  isHoveringSlider: false,
  isHoveringIcon: false,

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

  convertDropboxLinkToDirect(url) {
    if (!url.includes("dropbox.com")) return url;
    return url
      .replace("www.dropbox.com", "dl.dropboxusercontent.com")
      .replace("dropbox.com", "dl.dropboxusercontent.com")
      .replace("?dl=0", "?dl=1")
      .replace("&dl=0", "&dl=1");
  },

  renderPlaylist(playlist) {
    const playlistEl = this.elements.playlist;
    playlistEl.innerHTML = '';
    playlist.forEach((track, index) => {
      const trackEl = document.createElement('div');
      trackEl.className = 'playlist-item';
      trackEl.dataset.index = index;

      const titleEl = document.createElement('span');
      titleEl.textContent = track.title || track.url.split("/").pop().split("?")[0].replace(/[_-]/g, " ").replace(/\.[^/.]+$/, "");
      titleEl.style.flex = '1';

      const durationEl = document.createElement('span');
      durationEl.className = 'playlist-duration';
      durationEl.textContent = '...';

      trackEl.appendChild(titleEl);
      trackEl.appendChild(durationEl);

      trackEl.addEventListener('click', () => {
        const url = playerApp.convertDropboxLinkToDirect(track.url);
        playerApp.initializePlayer(url, track.title, index);
      });

      playlistEl.appendChild(trackEl);
    });
    // Preload durations after rendering playlist items
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.preloadDurations(playlist));
    } else {
      setTimeout(() => this.preloadDurations(playlist), 200);
    }
  },

  preloadDurations(playlist) {
    playlist.forEach((track, index) => {
      const durationEl = this.elements.playlist.querySelector(`.playlist-item[data-index="${index}"] .playlist-duration`);
      if (!durationEl) return;
      const audio = new Audio(this.convertDropboxLinkToDirect(track.url));
      audio.addEventListener('loadedmetadata', () => {
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        durationEl.textContent = `${minutes}:${seconds}`;
      });
    });
  },

  initializePlayer(audioURL, title, index) {
    this.showLoading(true);
    playerApp.wavesurfer.load(audioURL);
    const event = new CustomEvent('track:change', { detail: { audioURL, title, index } });
    document.dispatchEvent(event);
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
        document.dispatchEvent(new CustomEvent('volume:unmute'));
        volumeSlider.value = playerApp.previousVolume;
      } else {
        document.dispatchEvent(new CustomEvent('volume:mute'));
        playerApp.previousVolume = currentVolume;
        volumeSlider.value = 0;
      }
      volumeSlider.dispatchEvent(new Event("input"));
    });
    if (volumeControl && volumeSlider && volumeToggle) {
      volumeSlider.addEventListener("input", (e) => {
        const volume = parseFloat(e.target.value);
        playerApp.wavesurfer.setVolume(volume);
        volumeToggle.innerHTML = volume === 0 ? volumeIconMuted : volumeIconLoud;
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
          if (!playerApp.isDraggingSlider && !playerApp.isHoveringSlider && !playerApp.isHoveringIcon) {
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
          if (!playerApp.isDraggingSlider && !playerApp.isHoveringSlider && !playerApp.isHoveringIcon) {
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
          if (!playerApp.isDraggingSlider && !playerApp.isHoveringSlider && !playerApp.isHoveringIcon) {
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
    this.wavesurfer.on('ready', () => {
      this.isWaveformReady = true;
      this.showLoading(false);
      playPauseBtn.style.display = "inline-block";
      if (volumeControl) volumeControl.classList.remove("hidden");
      setTimeout(() => {
        const canvas = document.querySelector("#waveform canvas");
        if (canvas) canvas.style.opacity = "1";
        playPauseBtn.style.opacity = "1";
        playPauseBtn.style.color = getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim();
      }, 50);
      if (volumeControl) {
        volumeControl.style.opacity = "1";
        volumeControl.style.color = getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim();
      }
      const trackInfo = this.elements.trackInfo;
      if (trackInfo) {
        trackInfo.classList.add("visible");
      }
      const totalTime = this.elements.totalTime;
      const duration = this.wavesurfer.getDuration();
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60).toString().padStart(2, "0");
      if (totalTime) {
        totalTime.textContent = `${minutes}:${seconds}`;
        totalTime.classList.add("visible");
      }
      waveformEl.addEventListener("mousemove", (e) => {
        const rect = waveformEl.getBoundingClientRect();
        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        const duration = this.wavesurfer.getDuration();
        const time = duration * percent;
        hoverOverlay.style.width = `${percent * 100}%`;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60).toString().padStart(2, "0");
        hoverTime.textContent = `${minutes}:${seconds}`;
        const pixelX = e.clientX - rect.left;
        hoverTime.style.left = `${Math.max(Math.min(pixelX, rect.width - 40), 30)}px`;
        const isPlaying = this.wavesurfer.isPlaying();
        const currentTime = this.wavesurfer.getCurrentTime();
        const hoverDiff = Math.abs(time - currentTime);
        const threshold = 5;
        hoverTime.style.opacity = (isPlaying && hoverDiff < threshold) ? "0" : "1";
      });
      waveformEl.addEventListener("mouseleave", () => {
        hoverOverlay.style.width = `0%`;
        hoverTime.style.opacity = "0";
      });
    });
    this.wavesurfer.on('play', () => {
      document.dispatchEvent(new CustomEvent('playback:play'));
    });
    this.wavesurfer.on('pause', () => {
      document.dispatchEvent(new CustomEvent('playback:pause'));
    });
    this.wavesurfer.on('finish', () => {
      document.dispatchEvent(new CustomEvent('playback:finish'));
    });
    this.wavesurfer.on("audioprocess", () => {
      const currentTime = this.wavesurfer.getCurrentTime();
      const duration = this.wavesurfer.getDuration();
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60).toString().padStart(2, "0");
      this.elements.playheadTime.textContent = `${minutes}:${seconds}`;
      const percent = currentTime / duration;
      const pixelX = percent * this.elements.waveform.clientWidth;
      const clampedX = Math.min(Math.max(pixelX, 20), this.elements.waveform.clientWidth - 40);
      this.elements.playheadTime.style.left = `${clampedX}px`;
    });
  },


  formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  },

  setupPlayPauseUI() {
    const playPauseBtn = this.elements.playPauseBtn;
    playPauseBtn.onclick = () => {
      this.wavesurfer.playPause();
    };
  },

  setupWaveSurfer() {
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue("--ui-accent").trim();
    const unplayedColor = rootStyles.getPropertyValue("--waveform-unplayed").trim();
    this.wavesurfer = WaveSurfer.create({
      container: "#waveform",
      waveColor: unplayedColor,
      progressColor: accentColor,
      height: 100,
      responsive: true,
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

  init() {
    this.cacheElements();
    this.showLoading(true);
    this.setupWaveSurfer();
    this.setupWaveformEvents();
    this.loadPlaylistFromFile();
    this.setupPlayPauseUI();
    this.setupVolumeControls();
    setTimeout(() => {
      const loadingFallback = this.elements.loadingIndicator;
      if (playerApp.wavesurfer.isReady && loadingFallback) {
        playerApp.showLoading(false);
      }
    }, 5000);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (playerApp.wavesurfer && playerApp.isWaveformReady) {
          playerApp.wavesurfer.playPause();
        }
      }
    });
  },

  loadPlaylistFromFile(filePath = 'playlist.txt') {
    fetch(filePath)
      .then(res => res.text())
      .then(text => {
        const links = text
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        const playlist = links.map(url => ({
          title: null,
          url: url
        }));
        if (!playlist.length) return;
        this.renderPlaylist(playlist);
        const firstTrack = playlist[0];
        const convertedURL = this.convertDropboxLinkToDirect(firstTrack.url);
        this.initializePlayer(convertedURL, firstTrack.title, 0);
      });
  }
};

document.addEventListener("DOMContentLoaded", () => playerApp.init());

document.addEventListener('track:change', (e) => {
  const { audioURL, title, index } = e.detail;
  const trackInfo = playerApp.elements.trackInfo;
  const fileName = title || audioURL.split("/").pop().split("?")[0].replace(/[_-]/g, " ").replace(/\.[^/.]+$/, "");
  if (trackInfo) {
    trackInfo.textContent = fileName;
  }
  const items = document.querySelectorAll(".playlist-item");
  items.forEach(el => el.classList.remove("active"));
  if (typeof index === "number") {
    const activeItem = document.querySelector(`.playlist-item[data-index="${index}"]`);
    if (activeItem) activeItem.classList.add("active");
  }
});

document.addEventListener('volume:mute', () => {
  const volumeToggle = playerApp.elements.volumeToggle;
  const volumeIconMuted = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
    </svg>
  `;
  if (volumeToggle) volumeToggle.innerHTML = volumeIconMuted;
});

document.addEventListener('volume:unmute', () => {
  const volumeToggle = playerApp.elements.volumeToggle;
  const volumeIconLoud = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
      <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
    </svg>
  `;
  if (volumeToggle) volumeToggle.innerHTML = volumeIconLoud;
});

document.addEventListener('playback:play', () => {
  const playPauseBtn = playerApp.elements.playPauseBtn;
  if (playPauseBtn) {
    playPauseBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z" clip-rule="evenodd" />
      </svg>
    `;
  }
});

document.addEventListener('playback:pause', () => {
  const playPauseBtn = playerApp.elements.playPauseBtn;
  if (playPauseBtn) {
    playPauseBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd" />
      </svg>
    `;
  }
});

document.addEventListener('playback:play', () => {
  const playheadTime = playerApp.elements.playheadTime;
  if (playheadTime) playheadTime.style.opacity = '1';
});
document.addEventListener('playback:pause', () => {
  const playheadTime = playerApp.elements.playheadTime;
  if (playheadTime) playheadTime.style.opacity = '0';
});
document.addEventListener('playback:finish', () => {
  const playheadTime = playerApp.elements.playheadTime;
  if (playheadTime) playheadTime.style.opacity = '0';
});