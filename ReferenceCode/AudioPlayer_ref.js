// AudioPlayer.js
// Encapsulated audio player using WaveSurfer.js

/**
 * AudioPlayer - Handles all audio playback functionality
 * Manages WaveSurfer instance, tracks, controls, and UI updates
 */
export class AudioPlayer {
  constructor(container, tracks, options = {}) {
    this.container = container;
    this.tracks = tracks;
    this.wavesurfer = null;
    this.currentTrackIndex = 0;
    this.previousVolume = 1;
    this.targetVolume = 1;
    this.hasPlayedOnce = false; // Track if user has played audio yet

    // Options with defaults
    this.options = {
      // Waveform colors
      waveColor: options.waveColor || "rgba(255, 255, 255, 0.9)",
      progressColor: options.progressColor || "#4a4a4a",

      // UI colors
      iconColor: options.iconColor || "rgba(255, 255, 255, 0.95)",
      iconHoverColor: options.iconHoverColor || "rgba(255, 255, 255, 1)",
      textColor: options.textColor || "rgba(255, 255, 255, 0.8)",

      // Volume slider colors
      sliderTrackColor: options.sliderTrackColor || "rgba(255, 255, 255, 0.3)",
      sliderThumbColor: options.sliderThumbColor || "rgba(255, 255, 255, 0.95)",

      // Playlist colors
      playlistHoverBg: options.playlistHoverBg || "rgba(0, 0, 0, 0.05)",
      playlistActiveBg: options.playlistActiveBg || "rgba(255, 255, 255, 0.1)",
      scrollbarColor: options.scrollbarColor || "rgba(255, 255, 255, 0.3)",

      // Loading spinner colors
      spinnerBorder: options.spinnerBorder || "rgba(255, 255, 255, 0.2)",
      spinnerBorderTop: options.spinnerBorderTop || "rgba(255, 255, 255, 0.9)",

      // Other options
      height: options.height || 100,
      fallbackBackgroundImage: options.fallbackBackgroundImage || null, // Fallback image when track has no custom background
      onTrackChange: options.onTrackChange || null,
      onReady: options.onReady || null,
      onPlay: options.onPlay || null,
      onPause: options.onPause || null,
    };

    this.elements = {};
    this.init();
  }

  /**
   * Initialize the audio player
   */
  init() {
    this.cacheElements();
    this.initWaveSurfer();
    this.attachEventListeners();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    // Find the project card container (parent of the reel-player)
    const projectCard = this.container.closest('.project-card');
    
    this.elements = {
      waveform: this.container.querySelector('[id^="waveform-"]'),
      playPauseBtn: this.container.querySelector(".play-pause-btn"),
      playIcon: this.container.querySelector(".play-icon"),
      pauseIcon: this.container.querySelector(".pause-icon"),
      volumeToggle: this.container.querySelector(".volume-toggle"),
      volumeSlider: this.container.querySelector(".volume-slider"),
      volumeLoud: this.container.querySelector(".volume-loud"),
      volumeMuted: this.container.querySelector(".volume-muted"),
      volumeControl: this.container.querySelector(".volume-control"),
      loadingIndicator: this.container.querySelector(".loading-indicator"),
      trackInfo: this.container.querySelector(".track-info"),
      totalTime: this.container.querySelector(".total-time"),
      playheadTime: this.container.querySelector(".playhead-time"),
      hoverTime: this.container.querySelector(".hover-time"),
      hoverOverlay: this.container.querySelector(".hover-overlay"),
      waveformWrapper: this.container.querySelector(".waveform-wrapper"),
      playlistItems: this.container.querySelectorAll(".playlist-item"),
      // Track backgrounds are in the card-main section, not in the player container
      trackBackgrounds: projectCard ? projectCard.querySelectorAll(".track-background-image") : [],
    };
  }

  /**
   * Initialize WaveSurfer instance
   */
  initWaveSurfer() {
    if (typeof WaveSurfer === "undefined") {
      console.error("WaveSurfer is not loaded. Please include WaveSurfer.js");
      return;
    }

    if (!this.elements.waveform) {
      console.error("Waveform container not found");
      return;
    }

    this.wavesurfer = WaveSurfer.create({
      container: this.elements.waveform,
      waveColor: this.options.waveColor,
      progressColor: this.options.progressColor,
      cursorWidth: 0,
      barWidth: 0,
      barGap: 0,
      barHeight: 0.8,
      barRadius: 0,
      height: this.options.height,
      normalize: true,
      responsive: true,
      backend: "WebAudio",
    });

    // Setup event handlers
    this.wavesurfer.on("ready", () => this.onAudioReady());
    this.wavesurfer.on("audioprocess", () => this.updatePlayheadTime());
    this.wavesurfer.on("play", () => this.onPlay());
    this.wavesurfer.on("pause", () => this.onPause());
    this.wavesurfer.on("finish", () => this.playNextTrack());

    // Setup waveform hover effects
    this.setupWaveformHover();

    // Apply custom colors
    this.applyColors();

    // Pre-load all track durations
    this.loadAllDurations();

    // Load first track (but don't show its background yet)
    this.loadTrack(0, { skipBackgroundUpdate: true });
  }

  /**
   * Apply custom colors to player UI elements
   */
  applyColors() {
    const player = this.container;

    // Apply CSS variables for easier color management
    player.style.setProperty("--player-icon-color", this.options.iconColor);
    player.style.setProperty(
      "--player-icon-hover-color",
      this.options.iconHoverColor
    );
    player.style.setProperty("--player-text-color", this.options.textColor);
    player.style.setProperty(
      "--player-slider-track-color",
      this.options.sliderTrackColor
    );
    player.style.setProperty(
      "--player-slider-thumb-color",
      this.options.sliderThumbColor
    );
    player.style.setProperty(
      "--player-playlist-hover-bg",
      this.options.playlistHoverBg
    );
    player.style.setProperty(
      "--player-playlist-active-bg",
      this.options.playlistActiveBg
    );
    player.style.setProperty(
      "--player-scrollbar-color",
      this.options.scrollbarColor
    );
    player.style.setProperty(
      "--player-spinner-border",
      this.options.spinnerBorder
    );
    player.style.setProperty(
      "--player-spinner-border-top",
      this.options.spinnerBorderTop
    );
  }

  /**
   * Attach event listeners to controls
   */
  attachEventListeners() {
    // Play/pause button
    if (this.elements.playPauseBtn) {
      this.elements.playPauseBtn.addEventListener("click", () =>
        this.togglePlayPause()
      );
    }

    // Volume toggle
    if (this.elements.volumeToggle) {
      this.elements.volumeToggle.addEventListener("click", () =>
        this.toggleMute()
      );
    }

    // Volume slider
    if (this.elements.volumeSlider) {
      this.elements.volumeSlider.addEventListener("input", (e) => {
        this.setVolume(parseInt(e.target.value) / 100);
      });
    }

    // Volume control hover (show/hide slider)
    if (this.elements.volumeControl) {
      let hideTimeout;
      this.elements.volumeControl.addEventListener("mouseenter", () => {
        clearTimeout(hideTimeout);
        this.elements.volumeControl.classList.add("show-slider");
      });
      this.elements.volumeControl.addEventListener("mouseleave", () => {
        hideTimeout = setTimeout(() => {
          this.elements.volumeControl.classList.remove("show-slider");
        }, 300);
      });
    }

    // Playlist items
    this.elements.playlistItems.forEach((item, index) => {
      item.addEventListener("click", () => {
        this.loadAndPlayTrack(index);
      });
    });
  }

  /**
   * Audio ready handler
   */
  onAudioReady() {
    // Hide loading indicator
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.style.opacity = "0";
      this.elements.loadingIndicator.style.pointerEvents = "none";
    }

    // Show controls
    if (this.elements.playPauseBtn)
      this.elements.playPauseBtn.style.opacity = "1";
    if (this.elements.volumeControl)
      this.elements.volumeControl.style.opacity = "1";

    // Show and update track info
    if (this.elements.trackInfo) {
      const track = this.tracks[this.currentTrackIndex];
      this.elements.trackInfo.textContent = track.title;
      this.elements.trackInfo.style.opacity = "1";
      this.elements.trackInfo.style.visibility = "visible";
    }

    // Show and update total time
    if (this.elements.totalTime) {
      this.elements.totalTime.textContent = this.formatTime(
        this.wavesurfer.getDuration()
      );
      this.elements.totalTime.style.opacity = "1";
    }

    // Update duration in playlist
    this.updatePlaylistDuration(
      this.currentTrackIndex,
      this.wavesurfer.getDuration()
    );

    // Call custom ready callback
    if (this.options.onReady) {
      this.options.onReady(this.currentTrackIndex);
    }
  }

  /**
   * Play handler
   */
  onPlay() {
    this.fadeIn();
    this.updatePlayPauseIcon(true);
    
    // On first play, update the background to show track image
    if (!this.hasPlayedOnce) {
      this.hasPlayedOnce = true;
      this.updateTrackBackground(this.currentTrackIndex);
    }
    
    if (this.options.onPlay) {
      this.options.onPlay(this.currentTrackIndex);
    }
  }

  /**
   * Pause handler
   */
  onPause() {
    this.updatePlayPauseIcon(false);
    if (this.options.onPause) {
      this.options.onPause(this.currentTrackIndex);
    }
  }

  /**
   * Fade in audio volume
   */
  fadeIn(duration = 200) {
    if (!this.wavesurfer) return;

    const steps = 20;
    const stepDuration = duration / steps;
    const volumeIncrement = this.targetVolume / steps;
    let currentStep = 0;

    this.wavesurfer.setVolume(0);

    const fadeInterval = setInterval(() => {
      currentStep++;
      const newVolume = Math.min(
        volumeIncrement * currentStep,
        this.targetVolume
      );
      this.wavesurfer.setVolume(newVolume);

      if (currentStep >= steps) {
        clearInterval(fadeInterval);
        this.wavesurfer.setVolume(this.targetVolume);
      }
    }, stepDuration);
  }

  /**
   * Fade out audio volume
   */
  fadeOut(duration = 200, callback) {
    if (!this.wavesurfer) return;

    const startVolume = this.wavesurfer.getVolume();
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeDecrement = startVolume / steps;
    let currentStep = 0;

    const fadeInterval = setInterval(() => {
      currentStep++;
      const newVolume = Math.max(
        startVolume - volumeDecrement * currentStep,
        0
      );
      this.wavesurfer.setVolume(newVolume);

      if (currentStep >= steps) {
        clearInterval(fadeInterval);
        this.wavesurfer.setVolume(0);
        if (callback) callback();
      }
    }, stepDuration);
  }

  /**
   * Load a specific track
   */
  loadTrack(trackIndex, options = {}) {
    if (!this.wavesurfer || !this.tracks || !this.tracks[trackIndex]) return;

    this.currentTrackIndex = trackIndex;
    const track = this.tracks[trackIndex];

    // Show loading
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.style.opacity = "1";
      this.elements.loadingIndicator.style.pointerEvents = "auto";
    }

    // Load audio
    this.wavesurfer.load(track.file);

    // Update playlist active state
    this.updatePlaylistActive(trackIndex);

    // Update track background image (unless explicitly skipped for initial load)
    if (!options.skipBackgroundUpdate) {
      this.updateTrackBackground(trackIndex);
    }

    // Call custom track change callback
    if (this.options.onTrackChange) {
      this.options.onTrackChange(trackIndex, track);
    }
  }

  /**
   * Pre-load all track durations using HTML5 Audio
   */
  loadAllDurations() {
    // Use WaveSurfer to decode durations since HTML5 Audio doesn't support Ogg Vorbis in all browsers
    this.tracks.forEach((track, index) => {
      // Skip the current track as it's already loaded
      if (index === this.currentTrackIndex) return;

      // Create a temporary WaveSurfer instance to decode the audio
      const tempWavesurfer = WaveSurfer.create({
        container: document.createElement("div"),
        height: 0,
        backend: "WebAudio",
      });

      tempWavesurfer.once("ready", () => {
        const duration = tempWavesurfer.getDuration();
        this.updatePlaylistDuration(index, duration);
        tempWavesurfer.destroy();
      });

      tempWavesurfer.load(track.file);
    });
  }

  /**
   * Load and play a track
   */
  loadAndPlayTrack(trackIndex) {
    // Stop current playback first
    if (this.wavesurfer && this.wavesurfer.isPlaying()) {
      this.wavesurfer.pause();
    }

    this.loadTrack(trackIndex);
    this.wavesurfer.once("ready", () => {
      // Seek to beginning and play
      this.wavesurfer.seekTo(0);
      this.wavesurfer.play();
    });
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause() {
    if (!this.wavesurfer) return;

    if (this.wavesurfer.isPlaying()) {
      this.pause();
    } else {
      this.wavesurfer.play();
    }
  }

  /**
   * Update play/pause icon
   */
  updatePlayPauseIcon(isPlaying) {
    if (this.elements.playIcon && this.elements.pauseIcon) {
      if (isPlaying) {
        this.elements.playIcon.style.display = "none";
        this.elements.pauseIcon.style.display = "block";
      } else {
        this.elements.playIcon.style.display = "block";
        this.elements.pauseIcon.style.display = "none";
      }
    }
  }

  /**
   * Play next track
   */
  playNextTrack() {
    const nextIndex = (this.currentTrackIndex + 1) % this.tracks.length;
    this.loadAndPlayTrack(nextIndex);
  }

  /**
   * Play previous track
   */
  playPreviousTrack() {
    const prevIndex =
      (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;
    this.loadAndPlayTrack(prevIndex);
  }

  /**
   * Update playlist active state
   */
  updatePlaylistActive(trackIndex) {
    this.elements.playlistItems.forEach((item, index) => {
      if (index === trackIndex) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    if (!this.wavesurfer) return;

    const currentVolume = this.wavesurfer.getVolume();

    if (currentVolume > 0) {
      this.previousVolume = currentVolume;
      this.setVolume(0);
    } else {
      const restoreVolume = this.previousVolume || 1;
      this.setVolume(restoreVolume);
    }
  }

  /**
   * Set volume
   */
  setVolume(volume) {
    if (!this.wavesurfer) return;

    this.targetVolume = volume;
    this.wavesurfer.setVolume(volume);

    // Update volume slider
    if (this.elements.volumeSlider) {
      this.elements.volumeSlider.value = volume * 100;
    }

    // Update volume icon
    if (this.elements.volumeLoud && this.elements.volumeMuted) {
      if (volume === 0) {
        this.elements.volumeLoud.style.display = "none";
        this.elements.volumeMuted.style.display = "block";
      } else {
        this.elements.volumeLoud.style.display = "block";
        this.elements.volumeMuted.style.display = "none";
      }
    }
  }

  /**
   * Setup waveform hover effects
   */
  setupWaveformHover() {
    if (
      !this.elements.waveformWrapper ||
      !this.elements.hoverOverlay ||
      !this.elements.hoverTime
    ) {
      return;
    }

    this.elements.waveformWrapper.addEventListener("mousemove", (e) => {
      const rect = this.elements.waveformWrapper.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;

      // Update overlay
      this.elements.hoverOverlay.style.width = `${percentage * 100}%`;

      // Update hover time
      const duration = this.wavesurfer ? this.wavesurfer.getDuration() : 0;
      const hoverSeconds = duration * percentage;
      this.elements.hoverTime.textContent = this.formatTime(hoverSeconds);
      this.elements.hoverTime.style.opacity = "1";

      // Position hover time (clamped)
      const clampedX = Math.max(30, Math.min(x, rect.width - 40));
      this.elements.hoverTime.style.left = `${clampedX}px`;
    });

    this.elements.waveformWrapper.addEventListener("mouseleave", () => {
      this.elements.hoverOverlay.style.width = "0%";
      this.elements.hoverTime.style.opacity = "0";
    });
  }

  /**
   * Update playhead time display
   */
  updatePlayheadTime() {
    if (
      !this.wavesurfer ||
      !this.elements.playheadTime ||
      !this.elements.waveformWrapper
    ) {
      return;
    }

    const currentTime = this.wavesurfer.getCurrentTime();
    const duration = this.wavesurfer.getDuration();
    const percentage = currentTime / duration;

    this.elements.playheadTime.textContent = this.formatTime(currentTime);
    this.elements.playheadTime.style.opacity = this.wavesurfer.isPlaying()
      ? "1"
      : "0";

    const rect = this.elements.waveformWrapper.getBoundingClientRect();
    const position = percentage * rect.width;
    const clampedPosition = Math.max(20, Math.min(position, rect.width - 40));
    this.elements.playheadTime.style.left = `${clampedPosition}px`;
  }

  /**
   * Format time in MM:SS
   */
  formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Get current track info
   */
  getCurrentTrack() {
    return this.tracks[this.currentTrackIndex];
  }

  /**
   * Get player state
   */
  getState() {
    if (!this.wavesurfer) return null;

    return {
      isPlaying: this.wavesurfer.isPlaying(),
      currentTime: this.wavesurfer.getCurrentTime(),
      duration: this.wavesurfer.getDuration(),
      volume: this.wavesurfer.getVolume(),
      currentTrackIndex: this.currentTrackIndex,
      currentTrack: this.getCurrentTrack(),
    };
  }

  /**
   * Seek to a specific time
   */
  seekTo(seconds) {
    if (!this.wavesurfer) return;
    const duration = this.wavesurfer.getDuration();
    const progress = seconds / duration;
    this.wavesurfer.seekTo(progress);
  }

  /**
   * Update playlist item duration display
   */
  updatePlaylistDuration(trackIndex, duration) {
    const playlistItems = this.container.querySelectorAll(".playlist-item");
    if (playlistItems[trackIndex]) {
      const durationSpan =
        playlistItems[trackIndex].querySelector(".playlist-duration");
      if (durationSpan) {
        durationSpan.textContent = this.formatTime(duration);
      }
    }
  }

  /**
   * Update track background image with fade transition
   */
  updateTrackBackground(trackIndex) {
    console.log('[AudioPlayer] updateTrackBackground called for track index:', trackIndex);
    
    if (!this.elements.trackBackgrounds || this.elements.trackBackgrounds.length === 0) {
      console.log('[AudioPlayer] No track backgrounds found');
      return;
    }

    console.log('[AudioPlayer] Track backgrounds available:', this.elements.trackBackgrounds.length);
    
    const track = this.tracks[trackIndex];
    console.log('[AudioPlayer] Current track:', track);
    
    // If track has a custom background image, show it
    if (track && track.backgroundImage) {
      console.log('[AudioPlayer] Track has custom background:', track.backgroundImage);
      this.elements.trackBackgrounds.forEach((bg, index) => {
        const bgTrackIndex = parseInt(bg.getAttribute('data-track-index'));
        console.log('[AudioPlayer] Checking background:', { bgTrackIndex, trackIndex, matches: bgTrackIndex === trackIndex });
        
        if (bgTrackIndex === trackIndex) {
          console.log('[AudioPlayer] Activating background for track', trackIndex);
          bg.classList.add('active');
        } else {
          bg.classList.remove('active');
        }
      });
    } else {
      console.log('[AudioPlayer] Track has no custom background, using fallback');
      // No custom background for this track, hide all track backgrounds to show fallback
      this.elements.trackBackgrounds.forEach(bg => {
        bg.classList.remove('active');
      });
    }
  }

  /**
   * Play
   */
  play() {
    if (this.wavesurfer) {
      this.wavesurfer.play();
    }
  }

  /**
   * Pause
   */
  pause() {
    if (this.wavesurfer && this.wavesurfer.isPlaying()) {
      this.fadeOut(200, () => {
        this.wavesurfer.pause();
        // Restore volume after pause
        this.wavesurfer.setVolume(this.targetVolume);
      });
    }
  }

  /**
   * Stop
   */
  stop() {
    if (this.wavesurfer) {
      this.wavesurfer.stop();
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.wavesurfer) {
      this.wavesurfer.destroy();
      this.wavesurfer = null;
    }
    this.elements = {};
  }
}
