/**
 * Player Closed Idle Module
 * 
 * Manages the player-closed-idle state - a special mode that activates when:
 * - Player is in expandable mode and collapsed
 * - Audio playback has stopped
 * - Feature is enabled in settings
 * 
 * When active, plays background videos with enhanced blur/overlay effects
 * and hides background images to create a clean idle experience.
 */

const CONSTANTS = {
  CSS_CLASSES: {
    PLAYER_CLOSED_IDLE: 'player-closed-idle',
    PLAYER_CLOSED_IDLE_ENABLED: 'player-closed-idle-enabled',
    ACTIVE: 'active'
  },
  
  CSS_VARIABLES: {
    FADE_IN_DURATION: '--player-closed-idle-fade-in-duration',
    FADE_OUT_DURATION: '--player-closed-idle-fade-out-duration',
    BG_OPACITY: '--player-closed-idle-bg-opacity'
  },
  
  TIMEOUTS: {
    FADE_COMPLETE_CHECK: 50, // Check interval for fade completion
    CONDITION_RECHECK: 1300  // Delay before rechecking conditions after video fade-out
  }
};

/**
 * Player Closed Idle State Manager
 */
export class PlayerClosedIdleManager {
  constructor(player) {
    this.player = player;
    this.isActivatingVideo = false;
    this.conditionCheckTimeout = null;
  }

  /**
   * Initialize the closed idle system
   */
  initialize() {
    this.updateCSSClass();
  }

  /**
   * Update CSS class based on feature enablement
   */
  updateCSSClass() {
    const wrapper = this.player.elements.playerWrapper;
    if (!wrapper) return;
    
    const isEnabled = this.player.currentReelSettings?.enablePlayerClosedIdle;
    
    if (isEnabled) {
      wrapper.classList.add(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE_ENABLED);
      console.log('[Player Closed Idle] Feature enabled - background images will auto-hide when collapsed');
    } else {
      wrapper.classList.remove(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE_ENABLED);
      console.log('[Player Closed Idle] Feature disabled - background images always visible');
    }
  }

  /**
   * Check if conditions are met for entering closed idle state
   */
  checkConditions() {
    // Clear any pending condition checks
    if (this.conditionCheckTimeout) {
      clearTimeout(this.conditionCheckTimeout);
      this.conditionCheckTimeout = null;
    }

    // Core conditions validation
    if (!this._areBasicConditionsMet()) {
      return;
    }

    // Check for conflicting video states
    const videoState = this._getVideoState();
    
    if (videoState.hasActiveVideos || videoState.activeFadesCount > 0) {
      console.log('[Player Closed Idle] ⏳ Waiting for playback videos to complete fade-out');
      
      // Schedule delayed recheck
      this.conditionCheckTimeout = setTimeout(() => {
        this.checkConditions();
      }, CONSTANTS.TIMEOUTS.CONDITION_RECHECK);
      
      return;
    }

    console.log('[Player Closed Idle] Conditions met - entering state');
    this.enter();
  }

  /**
   * Enter closed idle state
   */
  enter() {
    const wrapper = this.player.elements.playerWrapper;
    if (!wrapper || !this.player.expandable.enabled) return;

    // Prevent duplicate entries
    if (wrapper.classList.contains(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE)) return;

    // Final validation
    if (!this._areBasicConditionsMet()) return;

    console.log('[Player Closed Idle] ✓ Entering state');
    
    // Clean up conflicting states
    this.player.exitPlaybackIdle();
    
    // Activate state
    wrapper.classList.add(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE);
    this._activateVideo();
  }

  /**
   * Exit closed idle state
   */
  exit() {
    const wrapper = this.player.elements.playerWrapper;
    if (!wrapper || !wrapper.classList.contains(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE)) {
      return;
    }
    
    console.log('[Player Closed Idle] ❌ Exiting state');
    
    // Remove state class
    wrapper.classList.remove(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE);
    
    // Deactivate video
    this._deactivateVideo();
  }

  /**
   * Get the highest priority video for closed idle state
   */
  _getActiveVideo() {
    const track = this.player.currentReelSettings?.playlist?.[this.player.currentTrackIndex];
    const reel = this.player.currentReelSettings;
    
    return this.player.getActiveVideo(track, reel);
  }

  /**
   * Activate video for closed idle state
   */
  _activateVideo() {
    const activeVideo = this._getActiveVideo();
    
    if (!activeVideo.url) {
      console.log('[Player Closed Idle] No video available');
      return;
    }

    console.log('[Player Closed Idle] Activating video:', activeVideo.url);
    
    const videoElement = this._getVideoElement(activeVideo.type);
    if (!videoElement) {
      console.log('[Player Closed Idle] ❌ Video element not found');
      return;
    }

    // Check if video is currently fading out
    if (this.player.activeFades?.has(videoElement)) {
      console.log('[Player Closed Idle] ⏳ Waiting for fade-out completion');
      this._waitForFadeCompletion(videoElement, activeVideo);
    } else {
      this._startVideo(videoElement, activeVideo);
    }
  }

  /**
   * Wait for fade-out completion before starting video
   */
  _waitForFadeCompletion(videoElement, activeVideo) {
    const checkFade = () => {
      if (!this.player.activeFades?.has(videoElement)) {
        console.log('[Player Closed Idle] ✓ Fade-out complete, starting video');
        this._startVideo(videoElement, activeVideo);
      } else {
        setTimeout(checkFade, CONSTANTS.TIMEOUTS.FADE_COMPLETE_CHECK);
      }
    };
    
    checkFade();
  }

  /**
   * Start playing the video
   */
  _startVideo(videoElement, activeVideo) {
    console.log('[Player Closed Idle] Starting video activation');
    
    // Set activation flag to prevent audio event interference
    this.isActivatingVideo = true;
    
    // Configure video element
    videoElement.src = activeVideo.url;
    videoElement.currentTime = 0;
    videoElement.load();
    
    // Start playback
    videoElement.play()
      .then(() => {
        videoElement.classList.add(CONSTANTS.CSS_CLASSES.ACTIVE);
        this._updateVideoState(activeVideo.type, true);
        this._hideBackgroundImages();
        
        console.log('[Player Closed Idle] ✓ Video activated');
        
        // Clear activation flag
        setTimeout(() => {
          this.isActivatingVideo = false;
        }, 100);
      })
      .catch(error => {
        console.warn('[Player Closed Idle] Video activation failed:', error);
        this.isActivatingVideo = false;
      });
  }

  /**
   * Deactivate videos for closed idle state
   */
  _deactivateVideo() {
    console.log('[Player Closed Idle] Deactivating videos');
    
    const fadeOutDuration = this.player.getVideoTransitionDuration('playerClosedIdleFadeOut');
    const promises = [];
    
    // Fade out active videos
    const videoElements = this._getActiveVideoElements();
    
    videoElements.forEach(({ element, type }) => {
      if (element.classList.contains(CONSTANTS.CSS_CLASSES.ACTIVE)) {
        promises.push(this.player.fadeOutVideo(element, fadeOutDuration, true));
      }
    });

    // Update video state
    this.player.videoState.mainVideoPlaying = false;
    this.player.videoState.trackVideoPlaying = false;
    
    // Restore background images
    this._showBackgroundImages();
    
    return Promise.all(promises);
  }

  /**
   * Check if basic conditions are met for closed idle state
   */
  _areBasicConditionsMet() {
    return this.player.expandable.enabled &&
           this.player.currentReelSettings?.enablePlayerClosedIdle &&
           !this.player.expandable.isExpanded &&
           !this.player.wavesurfer?.isPlaying();
  }

  /**
   * Get current video state for condition checking
   */
  _getVideoState() {
    return {
      hasActiveVideos: this.player.videoState.mainVideoPlaying || this.player.videoState.trackVideoPlaying,
      activeFadesCount: this.player.activeFades?.size || 0,
      mainVideoPlaying: this.player.videoState.mainVideoPlaying,
      trackVideoPlaying: this.player.videoState.trackVideoPlaying,
      activeFades: this.player.activeFades ? Array.from(this.player.activeFades.keys()).map(el => el.className) : []
    };
  }

  /**
   * Get video element for the specified type
   */
  _getVideoElement(type) {
    if (type === 'main') {
      return this.player.videoState[`mainVideo${this.player.videoState.currentMainLayer.toUpperCase()}`];
    } else {
      // Use track layers for both 'track' and 'closed-idle' types
      return this.player.videoState[`trackVideo${this.player.videoState.currentTrackLayer.toUpperCase()}`];
    }
  }

  /**
   * Get all currently active video elements
   */
  _getActiveVideoElements() {
    const elements = [];
    
    // Check main videos
    if (this.player.videoState.mainVideoPlaying) {
      elements.push(
        { element: this.player.videoState.mainVideoA, type: 'main' },
        { element: this.player.videoState.mainVideoB, type: 'main' }
      );
    }
    
    // Check track videos
    if (this.player.videoState.trackVideoPlaying) {
      elements.push(
        { element: this.player.videoState.trackVideoA, type: 'track' },
        { element: this.player.videoState.trackVideoB, type: 'track' }
      );
    }
    
    return elements.filter(({ element }) => element);
  }

  /**
   * Update video state tracking
   */
  _updateVideoState(type, isPlaying) {
    if (type === 'main') {
      this.player.videoState.mainVideoPlaying = isPlaying;
    } else {
      this.player.videoState.trackVideoPlaying = isPlaying;
    }
  }

  /**
   * Hide background images during closed idle state
   */
  _hideBackgroundImages() {
    this._setBackgroundImageOpacity(0);
  }

  /**
   * Show background images when exiting closed idle state
   */
  _showBackgroundImages() {
    this._setBackgroundImageOpacity(1);
  }

  /**
   * Set background image opacity via CSS custom property
   */
  _setBackgroundImageOpacity(opacity) {
    const wrapper = this.player.elements.playerWrapper;
    if (wrapper) {
      wrapper.style.setProperty(CONSTANTS.CSS_VARIABLES.BG_OPACITY, opacity.toString());
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.conditionCheckTimeout) {
      clearTimeout(this.conditionCheckTimeout);
      this.conditionCheckTimeout = null;
    }
  }
}

/**
 * Factory function to create and initialize the closed idle manager
 */
export function createPlayerClosedIdleManager(player) {
  return new PlayerClosedIdleManager(player);
}