// Idle-state timers for the player wrapper — enters/exits the "playback idle" and
// "collapsed idle" CSS states that slow the background zoom animation after inactivity.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
export const idleState = {
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
};
