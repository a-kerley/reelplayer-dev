// Dual-layer video crossfade lifecycle — loading, fading in/out, preloading, and cleaning up
// the main/track background video elements in sync with audio playback.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp,
// including videoLayerState's layer-bookkeeping helpers assigned onto the same object.
export const videoPlayback = {
  /**
   * Get video transition duration from CSS variables
   * @param {string} type - 'fadeIn' or 'fadeOut'
   * @returns {number} - Duration in milliseconds
   */
  getVideoTransitionDuration(type = 'fadeIn') {
    let varName;
    switch(type) {
      case 'fadeIn':
        varName = '--video-fade-in-duration';
        break;
      case 'trackSwitch':
        varName = '--video-track-switch-fade-duration';
        break;
      case 'playerClosedIdleFadeIn':
        varName = '--player-closed-idle-fade-in-duration';
        break;
      case 'playerClosedIdleFadeOut':
        varName = '--player-closed-idle-fade-out-duration';
        break;
      case 'fadeOut':
      default:
        varName = '--video-fade-out-duration';
        break;
    }
    return this.parseCssDuration(varName, 800);
  },

  /**
   * Start video playback with crossfade (tied to audio playback)
   * Uses dual-layer system for seamless transitions
   */
  async playVideo() {
    const track = this.currentReelSettings?.playlist?.[this.currentTrackIndex];
    const reel = this.currentReelSettings;
    const activeVideo = this.getActiveVideo(track, reel);

    if (!activeVideo.url) {
      return;
    }


    // Get current layer (might be active) and next layer (preloaded)
    const currentLayer = this.getCurrentLayerVideo(activeVideo.type);
    const nextLayer = this.getNextLayerVideo(activeVideo.type);
    const currentLayerName = activeVideo.type === 'track' ? this.videoState.currentTrackLayer : this.videoState.currentMainLayer;
    const nextLayerName = activeVideo.type === 'track'
      ? (this.videoState.currentTrackLayer === 'a' ? 'b' : 'a')
      : (this.videoState.currentMainLayer === 'a' ? 'b' : 'a');


    // Get opposite video type (main vs track) to fade it out
    const oppositeType = activeVideo.type === 'track' ? 'main' : 'track';
    const oppositeLayer = this.getCurrentLayerVideo(oppositeType);


    // Fade out opposite type if active (e.g., fade out main when track video plays)
    if (oppositeLayer?.classList.contains('active')) {
      const fadeOutDuration = this.getVideoTransitionDuration('fadeOut');
      this.fadeOutVideo(oppositeLayer, fadeOutDuration, true);
    } else {
    }

    // Check if current layer already has the right video playing
    const currentLayerUrl = this.getLayerUrl(activeVideo.type, currentLayerName);
    const isAlreadyActive = currentLayer?.classList.contains('active') &&
                           currentLayerUrl === activeVideo.url &&
                           currentLayer.src &&
                           currentLayer.readyState >= 2;


    if (isAlreadyActive) {
      this.resumeVideo(currentLayer);
      return;
    }

    // Check if next layer has the video preloaded
    const nextLayerUrl = this.getLayerUrl(activeVideo.type, nextLayerName);
    const isPreloaded = nextLayerUrl === activeVideo.url &&
                       nextLayer.src === activeVideo.url;


    try {
      // Load video on next layer if not already preloaded
      if (!isPreloaded) {
        const loadStart = performance.now();
        await this.loadVideo(nextLayer, activeVideo.url, activeVideo.type);
        this.setLayerUrl(activeVideo.type, nextLayerName, activeVideo.url);
      } else {
      }

      // Crossfade: fade out old layer while fading in new layer
      const fadeInDuration = this.getVideoTransitionDuration('fadeIn');

      // Start fade-in on next layer
      const fadeInPromise = this.fadeInVideo(nextLayer, fadeInDuration);

      // If current layer is active, fade it out simultaneously (crossfade)
      if (currentLayer?.classList.contains('active')) {
        this.fadeOutVideo(currentLayer, fadeInDuration, true).catch(err =>
          console.error('[Play Video] ❌ Crossfade out error:', err)
        );
      } else {
      }

      await fadeInPromise;

      // Switch to the new layer as current
      this.switchToNextLayer(activeVideo.type);

      // Update playback state
      if (activeVideo.type === 'track') {
        this.videoState.trackVideoPlaying = true;
      } else {
        this.videoState.mainVideoPlaying = true;
      }


      // Pause background animations when video is playing
      this.pauseBackgroundAnimations(false, 0);
    } catch (err) {
      console.error(`\n${'❌'.repeat(20)}`);
      console.error('[Play Video] ❌ ERROR playing video:', err);
      console.error(`${'❌'.repeat(20)}\n`);
    }
  },

  /**
   * Stop video playback (tied to audio playback)
   * Fades out and cleans up any active videos
   */
  async stopVideo() {

    const fadeOutDuration = this.getVideoTransitionDuration('fadeOut');
    const promises = [];

    // Check BOTH layers (A and B) for each video type
    // This is critical because fade-in happens on the "next" layer while "current" points to the old layer
    const trackVideoA = this.videoState.trackVideoA;
    const trackVideoB = this.videoState.trackVideoB;
    const mainVideoA = this.videoState.mainVideoA;
    const mainVideoB = this.videoState.mainVideoB;


    // Stop track video A if it's active OR has a fade in progress
    const shouldStopTrackA = trackVideoA &&
                            (trackVideoA.classList.contains('active') || this.videoState.activeFades.has(trackVideoA));

    if (shouldStopTrackA) {
      const hasFade = this.videoState.activeFades.has(trackVideoA);
      promises.push(this.fadeOutVideo(trackVideoA, fadeOutDuration, true));
    }

    // Stop track video B if it's active OR has a fade in progress
    const shouldStopTrackB = trackVideoB &&
                            (trackVideoB.classList.contains('active') || this.videoState.activeFades.has(trackVideoB));

    if (shouldStopTrackB) {
      const hasFade = this.videoState.activeFades.has(trackVideoB);
      promises.push(this.fadeOutVideo(trackVideoB, fadeOutDuration, true));
    }

    // Stop main video A if it's active OR has a fade in progress
    const shouldStopMainA = mainVideoA &&
                           (mainVideoA.classList.contains('active') || this.videoState.activeFades.has(mainVideoA));

    if (shouldStopMainA) {
      const hasFade = this.videoState.activeFades.has(mainVideoA);
      promises.push(this.fadeOutVideo(mainVideoA, fadeOutDuration, true));
    }

    // Stop main video B if it's active OR has a fade in progress
    const shouldStopMainB = mainVideoB &&
                           (mainVideoB.classList.contains('active') || this.videoState.activeFades.has(mainVideoB));

    if (shouldStopMainB) {
      const hasFade = this.videoState.activeFades.has(mainVideoB);
      promises.push(this.fadeOutVideo(mainVideoB, fadeOutDuration, true));
    }

    if (!shouldStopTrackA && !shouldStopTrackB && !shouldStopMainA && !shouldStopMainB) {
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    } else {
    }

    // Resume background animations when video stops
    const duration = this.parseCssDuration('--playback-idle-zoom-slow-down-duration', 800);
    this.pauseBackgroundAnimations(true, duration);

  },

  /**
   * Pre-load videos for the current track to enable smooth playback
   * Uses dual-layer system - loads on next inactive layer
   * Called automatically when player renders and when tracks change
   */
  preloadVideos() {
    const track = this.currentReelSettings?.playlist?.[this.currentTrackIndex];
    const reel = this.currentReelSettings;

    if (!track || !reel) return;

    const activeVideo = this.getActiveVideo(track, reel);
    if (!activeVideo.url) return;

    // Get the next (inactive) layer to load the new video
    const nextLayer = this.getNextLayerVideo(activeVideo.type);
    const nextLayerName = activeVideo.type === 'track'
      ? (this.videoState.currentTrackLayer === 'a' ? 'b' : 'a')
      : (this.videoState.currentMainLayer === 'a' ? 'b' : 'a');

    // Check if this URL is already loaded on the next layer
    const nextLayerUrl = this.getLayerUrl(activeVideo.type, nextLayerName);
    const needsLoad = nextLayerUrl !== activeVideo.url ||
                      !nextLayer.src ||
                      nextLayer.src !== activeVideo.url;

    if (needsLoad) {
      // Pre-load in background on inactive layer (stays hidden with opacity: 0)
      this.loadVideo(nextLayer, activeVideo.url, activeVideo.type)
        .then(() => {
          this.setLayerUrl(activeVideo.type, nextLayerName, activeVideo.url);
        })
        .catch(err => {
          console.error(`[Preload Video] Failed on layer ${nextLayerName}:`, err);
        });
    } else {
    }
  },

  /**
   * Load a video URL into a video element
   * @param {HTMLVideoElement} videoElement - The video element to load into
   * @param {string} videoUrl - The URL of the video to load
   * @param {string} type - 'main' or 'track' for tracking purposes
   * @returns {Promise} - Resolves when video is ready to play
   */
  loadVideo(videoElement, videoUrl, type = 'main') {
    if (!videoElement || !videoUrl || !videoUrl.trim()) {
      return Promise.reject(new Error('Invalid video element or URL'));
    }

    return new Promise((resolve, reject) => {
      // Log buffering progress
      let progressHandler;

      const cleanup = () => {
        videoElement.removeEventListener('loadedmetadata', handleSuccess);
        videoElement.removeEventListener('canplay', handleSuccess);
        videoElement.removeEventListener('canplaythrough', handleSuccess);
        videoElement.removeEventListener('error', handleError);
        if (progressHandler) {
          videoElement.removeEventListener('progress', progressHandler);
        }
        clearTimeout(timeoutId);
      };

      const handleSuccess = () => {
        cleanup();
        resolve();
      };

      const handleError = (e) => {
        cleanup();
        console.error(`Video load error (${type}):`, e, videoElement.error);
        reject(new Error(`Failed to load video: ${videoUrl}`));
      };

      const handleTimeout = () => {
        cleanup();
        console.warn(`Video load timeout (${type}): ${videoUrl}. ReadyState: ${videoElement.readyState}`);
        // If we have at least metadata, allow it to proceed
        if (videoElement.readyState >= 1) {
          resolve();
        } else {
          reject(new Error('Video load timeout'));
        }
      };

      // Set 10 second timeout (increased for large videos)
      const timeoutId = setTimeout(handleTimeout, 10000);

      // Listen for various ready states (canplaythrough = fully buffered)
      videoElement.addEventListener('loadedmetadata', handleSuccess, { once: true });
      videoElement.addEventListener('canplay', handleSuccess, { once: true });
      videoElement.addEventListener('canplaythrough', handleSuccess, { once: true });
      videoElement.addEventListener('error', handleError, { once: true });

      // Track buffering progress
      progressHandler = () => {
        if (videoElement.buffered.length > 0) {
          const bufferedEnd = videoElement.buffered.end(0);
          const duration = videoElement.duration;
          const percentBuffered = duration > 0 ? (bufferedEnd / duration * 100).toFixed(1) : 0;
        }
      };
      videoElement.addEventListener('progress', progressHandler);

      // Ensure video stays hidden during load (in case of any glitches)
      videoElement.classList.remove('active');

      // Set video source and trigger load with aggressive preload
      videoElement.src = videoUrl;
      videoElement.preload = 'auto'; // Tell browser to buffer as much as possible
      videoElement.load();
    });
  },

  /**
   * Fade in a video element and start playback
   *
   * Architecture:
   * - Uses CSS transitions for smooth fades (controlled by .active class)
   * - Tracks in-progress fades in activeFades Map with abort callbacks
   * - Interruption safe: can be interrupted by fadeOutVideo mid-transition
   *
   * @param {HTMLVideoElement} videoElement - The video element to fade in
   * @param {number} duration - Fade duration in milliseconds
   * @returns {Promise} - Resolves when fade completes
   */
  async fadeInVideo(videoElement, duration = 800) {
    if (!videoElement) {
      console.warn('[Fade In Video] ⚠️ Called with null/undefined videoElement');
      return Promise.resolve();
    }

    // Identify which video element this is
    const videoId = videoElement.className.split(' ').filter(c => c.includes('video')).join(' ');

    // Cancel any in-progress fade on this element
    if (this.videoState.activeFades.has(videoElement)) {
      const previousFade = this.videoState.activeFades.get(videoElement);
      previousFade.abort();
      this.videoState.activeFades.delete(videoElement);

      // CRITICAL: Clear any inline styles from previous fade-out interruption
      // Without this, inline opacity/transition styles override CSS transitions
      if (previousFade.type === 'out') {
        videoElement.style.opacity = '';
        videoElement.style.transition = '';
        // Force reflow to ensure styles are cleared before starting new fade
        void videoElement.offsetHeight;
      }
    }

    // Ensure video is ready to play (readyState >= 2 means we have current frame data)
    if (videoElement.readyState < 2) {
      await new Promise((resolve) => {
        const checkReady = () => {
          if (videoElement.readyState >= 2) {
            videoElement.removeEventListener('loadeddata', checkReady);
            resolve();
          }
        };

        // If already ready, resolve immediately
        if (videoElement.readyState >= 2) {
          resolve();
        } else {
          videoElement.addEventListener('loadeddata', checkReady, { once: true });
          // Fallback timeout after 2 seconds
          setTimeout(() => {
            videoElement.removeEventListener('loadeddata', checkReady);
            resolve();
          }, 2000);
        }
      });
    }

    return new Promise(async (resolve) => {
      const startTime = performance.now();
      const getTimestamp = () => `+${(performance.now() - startTime).toFixed(0)}ms`;


      // Seek past first frame to avoid black/frozen frame (common with Cloudinary/streaming)
      if (videoElement.currentTime === 0) {
        videoElement.currentTime = 0.1;

        // Wait for seek to complete before playing
        await new Promise(seekResolve => {
          const seekHandler = () => {
            seekResolve();
          };
          videoElement.addEventListener('seeked', seekHandler, { once: true });

          // Timeout fallback
          setTimeout(() => {
            videoElement.removeEventListener('seeked', seekHandler);
            seekResolve();
          }, 500);
        });
      }


      // Start video playback
      const playPromise = videoElement.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {

            // Force webkit to render frames (common fix for video rendering issues)
            videoElement.style.transform = 'translateZ(0)';

            // Force a repaint by toggling a property
            requestAnimationFrame(() => {
              videoElement.style.webkitTransform = 'translateZ(0)';
            });

            // Check if video is progressing at multiple intervals
            [100, 250, 500].forEach(delay => {
              setTimeout(() => {
                const computed = window.getComputedStyle(videoElement);
              }, delay);
            });
          })
          .catch(err => {
            console.error(`[Fade In Video] ${getTimestamp()} ✗ Video play error:`, err);
            console.error('Video state:', {
              paused: videoElement.paused,
              readyState: videoElement.readyState,
              networkState: videoElement.networkState,
              error: videoElement.error
            });
          });
      }

      // Track this fade operation for potential interruption
      let fadeTimeout;
      let isAborted = false;

      const abortFade = () => {
        isAborted = true;
        clearTimeout(fadeTimeout);
        this.videoState.activeFades.delete(videoElement);
      };

      this.videoState.activeFades.set(videoElement, { type: 'in', abort: abortFade });

      // Add active class to trigger CSS fade-in
      videoElement.classList.add('active');

      // Resolve after fade duration (unless aborted)
      fadeTimeout = setTimeout(() => {
        if (!isAborted) {
          this.videoState.activeFades.delete(videoElement);
          resolve();
        } else {
        }
      }, duration);
    });
  },

  /**
   * Fade out a video element and pause playback
   *
   * Architecture:
   * - Normally fades via CSS (removing .active class)
   * - Interruption handling: freezes current opacity, animates via inline styles
   * - Supports both partial (pause only) and full cleanup (clear source)
   * - Skip cleanup when interrupted (interrupting fade handles cleanup)
   *
   * @param {HTMLVideoElement} videoElement - The video element to fade out
   * @param {number} duration - Fade duration in milliseconds
   * @param {boolean} fullCleanup - Whether to fully cleanup video (clear source and state)
   * @returns {Promise} - Resolves when fade completes
   */
  fadeOutVideo(videoElement, duration = 2000, fullCleanup = false) {
    if (!videoElement) {
      console.warn('[Fade Out Video] ⚠️ Called with null/undefined videoElement');
      return Promise.resolve();
    }

    // Identify which video element this is
    const videoId = videoElement.className.split(' ').filter(c => c.includes('video')).join(' ');

    // Cancel any in-progress fade on this element
    if (this.videoState.activeFades.has(videoElement)) {
      const previousFade = this.videoState.activeFades.get(videoElement);
      previousFade.abort();
      this.videoState.activeFades.delete(videoElement);

      // Interruption Strategy: "Freeze & Animate"
      // 1. Capture current opacity (mid-transition state)
      // 2. Set as inline style to freeze it (stops CSS transition)
      // 3. Trigger reflow to apply frozen state
      // 4. Set new inline transition and target opacity (smooth continuation)
      // This prevents jarring jumps when interrupting in-progress fades

      // If interrupting a fade-in, we need special handling
      if (previousFade.type === 'in') {
        // Remove active class immediately to start fade-out
        videoElement.classList.remove('active');
        // Get current opacity and freeze it
        const currentOpacity = window.getComputedStyle(videoElement).opacity;
        videoElement.style.opacity = currentOpacity;
        // Trigger reflow
        void videoElement.offsetHeight;
        // Now animate to 0
        videoElement.style.transition = `opacity ${duration}ms ease-in-out`;
        videoElement.style.opacity = '0';
      } else {
        // For fade-out interrupting another fade-out, check if transition has started
        const currentOpacity = window.getComputedStyle(videoElement).opacity;

        // If opacity is still at original value (1 for fade-out), transition hasn't started yet
        // Animate from 1 to 0 using inline styles (similar to fade-in interruption)
        if (parseFloat(currentOpacity) === 1.0) {
          videoElement.style.transition = `opacity ${duration}ms ease-in-out`;
          videoElement.style.opacity = '0';
        } else {
          // Transition has started, freeze at current value then restart via CSS
          videoElement.style.opacity = currentOpacity;
          // Trigger reflow to apply the style
          void videoElement.offsetHeight;
          // Now animate to 0 via inline styles (CSS transition already removed by previous fade)
          videoElement.style.transition = `opacity ${duration}ms ease-in-out`;
          videoElement.style.opacity = '0';
        }
      }
    }

    return new Promise((resolve) => {
      // Determine video type for cleanup
      const videoType = videoElement.classList.contains('track-video') ? 'track' : 'main';

      let fallbackTimeout;
      let isCompleted = false;
      let isAborted = false;

      const complete = (skipCleanup = false) => {
        if (isCompleted) {
          return;
        }
        isCompleted = true;


        videoElement.removeEventListener('transitionend', handleTransitionEnd);
        clearTimeout(fallbackTimeout);
        this.videoState.activeFades.delete(videoElement);

        if (!skipCleanup) {
          if (fullCleanup) {
            this.cleanupVideo(videoElement, videoType);
          } else {
            videoElement.pause();
          }
        } else {
        }
        resolve();
      };

      const abortFade = () => {
        isAborted = true;
        // Complete WITHOUT cleanup - let the interrupting fade handle it
        complete(true);
      };

      // Track this fade operation
      this.videoState.activeFades.set(videoElement, { type: 'out', abort: abortFade });

      // Listen for transition end to ensure video pauses AFTER opacity reaches 0
      const handleTransitionEnd = (e) => {
        if (e.propertyName === 'opacity') {
          complete();
        }
      };

      videoElement.addEventListener('transitionend', handleTransitionEnd);

      // Check if we already set inline opacity during interruption handling
      const hasInlineOpacity = videoElement.style.opacity !== '';

      if (hasInlineOpacity) {
        // Interruption case: inline styles already set, just wait for transitionend
        fallbackTimeout = setTimeout(() => {
          complete();
        }, duration + 500);
      } else {
        // Normal case: start fade-out by removing active class
        videoElement.classList.remove('active');

        fallbackTimeout = setTimeout(() => {
          complete();
        }, duration + 500);
      }
    });
  },

  /**
   * Resume video playback from current position
   * @param {HTMLVideoElement} videoElement - The video element to resume
   */
  resumeVideo(videoElement) {
    if (!videoElement) return;

    try {
      // Check if video has ended, restart if so
      if (videoElement.currentTime >= videoElement.duration - 0.1) {
        videoElement.currentTime = 0;
      }

      videoElement.play().catch(err => {
        console.error('Video resume error:', err);
      });
    } catch (err) {
      console.error('Video resume error:', err);
    }
  },

  /**
   * Properly cleanup and unload a video element
   * Removes source, aborts loading, and resets state tracking
   * @param {HTMLVideoElement} videoElement - The video element to cleanup
   * @param {string} type - 'main' or 'track' for state tracking
   */
  cleanupVideo(videoElement, type) {
    if (!videoElement) {
      console.warn(`[Cleanup Video] ⚠️ Called with null/undefined videoElement`);
      return;
    }

    // Determine which layer this element belongs to
    const isLayerA = videoElement.classList.contains(`${type}-video-a`);
    const isLayerB = videoElement.classList.contains(`${type}-video-b`);
    const layerName = isLayerA ? 'a' : (isLayerB ? 'b' : 'unknown');


    // Cancel any in-progress fade operations on this element
    if (this.videoState.activeFades.has(videoElement)) {
      const fade = this.videoState.activeFades.get(videoElement);
      fade.abort();
      this.videoState.activeFades.delete(videoElement);
    } else {
    }

    // Pause playback
    videoElement.pause();

    // Remove active class and force-hidden class
    if (videoElement.classList.contains('active')) {
      videoElement.classList.remove('active');
    }
    if (videoElement.classList.contains('force-hidden')) {
      videoElement.classList.remove('force-hidden');
    }

    // Clear inline styles that may have been set
    videoElement.style.opacity = '';
    videoElement.style.transition = '';

    // Clear the source and force unload to free memory
    videoElement.removeAttribute('src');
    videoElement.load(); // Aborts current loading and clears buffered data

    // Reset current time
    videoElement.currentTime = 0;

    // Clear URL tracking for this specific layer
    if (layerName !== 'unknown') {
      this.setLayerUrl(type, layerName, '');
    }

    // Clear playback state if this was the active layer
    const isCurrentLayer = (type === 'track' && videoElement === this.getCurrentLayerVideo('track')) ||
                          (type === 'main' && videoElement === this.getCurrentLayerVideo('main'));

    if (isCurrentLayer) {
      if (type === 'track') {
        this.videoState.trackVideoPlaying = false;
      } else if (type === 'main') {
        this.videoState.mainVideoPlaying = false;
      }
    } else {
    }

  },
};
