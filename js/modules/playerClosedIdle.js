/**
 * Player Closed Idle Module
 *
 * Manages the player-closed-idle state - a special mode that activates when:
 * - Player is in expandable mode and collapsed
 * - Audio playback has stopped
 * - Feature is enabled in settings
 *
 * When active, plays the configured idle background video through the same
 * dual-layer crossfade system (playVideo/stopVideo) used for normal track
 * background videos, so it shares the one source of truth for fade state,
 * layer bookkeeping, and interruption handling instead of racing it.
 */

const CONSTANTS = {
  CSS_CLASSES: {
    PLAYER_CLOSED_IDLE: 'player-closed-idle',
    PLAYER_CLOSED_IDLE_ENABLED: 'player-closed-idle-enabled',
    IDLE_VIDEO: 'player-closed-idle-video'
  },

  TIMEOUTS: {
    CONDITION_RECHECK: 1300  // Delay before rechecking conditions after video fade-out
  }
};

/**
 * Player Closed Idle State Manager
 */
export class PlayerClosedIdleManager {
  constructor(player) {
    this.player = player;
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
    } else {
      wrapper.classList.remove(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE_ENABLED);
    }
  }

  /**
   * Proactively preload the configured idle video onto the inactive track layer,
   * so it's likely already buffered by the time idle conditions are actually met.
   * checkConditions()'s own trigger chain only starts once collapsed AND paused
   * (with several seconds of built-in delays on top), and loadVideo() now waits
   * for a genuine canplaythrough before it'll resolve (see the media-readiness
   * fix) - so a cold, unpreloaded load can leave the idle video visibly late to
   * appear. Gated on "player is currently collapsed," not called unconditionally
   * on every render, specifically to avoid spending bandwidth on a video that
   * might never get shown if the player stays expanded.
   *
   * Note: this targets the same "next" (inactive) track layer normal per-track
   * background videos preload onto (preloadVideos() in videoPlayback.js). If a
   * track has both its own real background video *and* the idle feature enabled,
   * whichever of the two calls this layer last wins, and the other's preload
   * gets overwritten - a missed optimization in that combination, not a
   * correctness bug (the loser just reloads from scratch when it's actually
   * needed instead of hitting an already-warm layer).
   */
  preloadIdleVideo() {
    if (!this.player.expandable.enabled || this.player.expandable.isExpanded) return;

    const reel = this.player.currentReelSettings;
    if (!reel?.enablePlayerClosedIdle) return;

    const url = reel.playerClosedIdleVideo?.trim();
    if (!url) return;

    const nextLayer = this.player.getNextLayerVideo('track');
    if (!nextLayer) return;

    const nextLayerName = this.player.videoState.currentTrackLayer === 'a' ? 'b' : 'a';
    const alreadyLoaded = this.player.getLayerUrl('track', nextLayerName) === url && nextLayer.src === url;
    if (alreadyLoaded) return;

    this.player.loadVideo(nextLayer, url, 'track')
      .then(() => {
        this.player.setLayerUrl('track', nextLayerName, url);
      })
      .catch((err) => {
        console.warn('[Player Closed Idle] Preload failed:', err);
      });
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

      // Schedule delayed recheck
      this.conditionCheckTimeout = setTimeout(() => {
        this.checkConditions();
      }, CONSTANTS.TIMEOUTS.CONDITION_RECHECK);

      return;
    }

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

    // Clean up conflicting states
    this.player.exitPlaybackIdle();

    // Activate state. With the class present, getActiveVideo() (videoLayerState.js)
    // resolves playerClosedIdleVideo as the highest-priority video, so the normal
    // playVideo() crossfade path picks it up - same layer tracking, fade
    // registration, and interruption handling as any other background video. If no
    // idle video (or fallback) resolves, playVideo() just no-ops and the track's own
    // background image/video shows through underneath, unmodified.
    wrapper.classList.add(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE);

    // Mark both track layers with the idle-video marker *before* playVideo() picks
    // which one it lands on (next-inactive-layer selection lives inside playVideo()
    // itself, so it isn't knowable from out here without duplicating that logic).
    // Tagging the currently-inactive layer has no visual effect since its opacity
    // stays 0 regardless. This marker - not the .player-closed-idle wrapper class,
    // and not .active - is what the idle blur override (css/player.css) keys off
    // of, specifically so it survives exit() removing the wrapper class AND
    // fadeOutVideo() removing .active, both of which happen synchronously at the
    // *start* of the fade-out, well before the video is actually done fading. The
    // marker only gets removed in cleanupVideo() (videoPlayback.js), once this
    // element's fade-out has actually finished.
    const trackA = this.player.videoState.trackVideoA;
    const trackB = this.player.videoState.trackVideoB;
    if (trackA) trackA.classList.add(CONSTANTS.CSS_CLASSES.IDLE_VIDEO);
    if (trackB) trackB.classList.add(CONSTANTS.CSS_CLASSES.IDLE_VIDEO);

    // Once playVideo() has resolved which layer it actually landed on, strip the
    // marker back off the other one. Without this, a layer tagged here but never
    // activated this cycle (e.g. playVideo() picked the other layer, or no URL
    // resolved at all) would carry a stale marker indefinitely - since it never
    // fades, cleanupVideo() never runs on it to clear the mark - and could later
    // leak the idle blur onto an unrelated real (non-idle) video if that layer
    // gets reused before another idle cycle claims it first.
    this.player.playVideo().then(() => {
      const activeLayer = this.player.getCurrentLayerVideo('track');
      [trackA, trackB].forEach((el) => {
        if (el && el !== activeLayer) {
          el.classList.remove(CONSTANTS.CSS_CLASSES.IDLE_VIDEO);
        }
      });

      // playVideo() above is an async load+fade chain that can take a couple
      // seconds (longer on a cold load). If exit() ran while it was still in
      // flight - e.g. playback resumed or the player expanded - the wrapper's
      // .player-closed-idle class will already be gone by the time we get
      // here, meaning the idle video has just faded in *after* we were
      // supposed to have left idle. Without this check it would sit there
      // stuck on screen instead of showing the real track/main video exit()
      // tried to hand off to. Fade it back out immediately to correct course.
      if (!wrapper.classList.contains(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE)) {
        this.player.stopVideo();
      }
    });
  }

  /**
   * Exit closed idle state
   */
  exit() {
    const wrapper = this.player.elements.playerWrapper;
    if (!wrapper || !wrapper.classList.contains(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE)) {
      return;
    }

    // Remove state class first so getActiveVideo() stops prioritizing the idle video -
    // any playVideo() call made right after this (e.g. from the audio 'play' handler)
    // will resolve the real track/main video instead.
    wrapper.classList.remove(CONSTANTS.CSS_CLASSES.PLAYER_CLOSED_IDLE);

    // Always fade out/clean up whatever's active, regardless of whether a playVideo()
    // call follows. stopVideo() only touches elements that are actually .active or
    // mid-fade, so it's a no-op here if nothing's playing, and interruption-safe if a
    // subsequent playVideo() call targets the same layer element.
    this.player.stopVideo();
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
      activeFadesCount: this.player.videoState.activeFades?.size || 0
    };
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
