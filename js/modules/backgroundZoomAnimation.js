// Web Animations API zoom effect for the player background and per-track background layers,
// driven by CSS custom properties (speed, ease, multiplier) and sped up/slowed down on idle.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
export const backgroundZoomAnimation = {
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
};
