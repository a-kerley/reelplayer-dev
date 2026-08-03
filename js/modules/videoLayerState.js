// Dual-layer (A/B) video bookkeeping — which layer is current/next per video type ('main'
// or 'track'), what URL each layer holds, and which track/reel video should be active.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
export const videoLayerState = {
  /**
   * Determine which video should be displayed based on track and reel settings
   * @param {Object} track - Current track object with backgroundVideo property
   * @param {Object} reel - Current reel settings with backgroundVideo and enabled flags
   * @returns {Object} - { url, type } where type is 'closed-idle', 'main', 'track', or null
   */
  getActiveVideo(track, reel) {
    // Check closed idle video first (highest priority) - only used during player-closed-idle state
    if (reel?.playerClosedIdleVideo && reel.playerClosedIdleVideo.trim()) {
      const wrapper = this.elements.playerWrapper;
      if (wrapper && wrapper.classList.contains('player-closed-idle')) {
        return { url: reel.playerClosedIdleVideo.trim(), type: 'closed-idle' };
      }
    }

    // Check main video second (high priority)
    if (reel?.backgroundVideoEnabled && reel?.backgroundVideo && reel.backgroundVideo.trim()) {
      return { url: reel.backgroundVideo.trim(), type: 'main' };
    }

    // Check track video as fallback
    if (track?.backgroundVideo && track.backgroundVideo.trim()) {
      return { url: track.backgroundVideo.trim(), type: 'track' };
    }

    return { url: null, type: null };
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
    } else {
      this.videoState.currentMainLayer = this.videoState.currentMainLayer === 'a' ? 'b' : 'a';
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
};
