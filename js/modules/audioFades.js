// Wavesurfer volume fade in/out animations for smooth play/pause and track switches.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
export const audioFades = {
  applyAudioFadeInFromZero(targetVolume) {
    if (!this.wavesurfer) return;

    // Get the fade-in duration from CSS variables
    const fadeDuration = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--audio-fade-in-duration') || '0.4'
    ) * 1000; // Convert to milliseconds

    // Animate volume increase
    const startTime = performance.now();

    const fadeStep = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / fadeDuration, 1);

      // Use ease-in curve for smooth fade
      const easedProgress = progress * progress;
      const currentVolume = targetVolume * easedProgress;

      this.wavesurfer.setVolume(currentVolume);

      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      }
    };

    requestAnimationFrame(fadeStep);
  },

  /**
   * Apply audio fade-out effect when playback stops
   * Smoothly ramps down volume from current level to 0
   * @param {boolean} pauseAfterFade - Whether to pause playback after fade completes
   * @returns {Promise} Resolves when fade-out completes
   */
  applyAudioFadeOut(pauseAfterFade = false) {
    if (!this.wavesurfer) return Promise.resolve();

    // Get the fade-out duration from CSS variables
    const fadeDuration = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--audio-fade-out-duration') || '0.3'
    ) * 1000; // Convert to milliseconds

    // Store the starting volume
    const startVolume = this.wavesurfer.getVolume();

    return new Promise((resolve) => {
      // Track this fade-out for potential cancellation
      const fadeState = { cancel: false };
      this.activeFadeOut = fadeState;

      const startTime = performance.now();

      const fadeStep = () => {
        // Check if fade was cancelled
        if (fadeState.cancel) {
          resolve();
          return;
        }

        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / fadeDuration, 1);

        // Use ease-out curve for smooth fade
        const easedProgress = 1 - Math.pow(1 - progress, 2);
        const currentVolume = startVolume * (1 - easedProgress);

        this.wavesurfer.setVolume(currentVolume);

        if (progress < 1) {
          requestAnimationFrame(fadeStep);
        } else {
          // If pausing after fade (track switch), keep volume at 0 and pause immediately
          if (pauseAfterFade) {
            this.wavesurfer.pause();
            // Restore volume for next track (will start at 0 and fade in)
            this.wavesurfer.setVolume(startVolume);
          } else {
            // For manual pause, restore volume for next play
            this.wavesurfer.setVolume(startVolume);
          }

          this.activeFadeOut = null;
          resolve();
        }
      };

      requestAnimationFrame(fadeStep);
    });
  },
};
