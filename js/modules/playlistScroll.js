import { colorToRgba, REEL_COLOR_DEFAULTS } from './colorUtils.js';

// Playlist rendering and its custom scrollbar (drag thumb + momentum wheel scrolling).
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
export const playlistScroll = {
  renderPlaylist(playlist) {
    const playlistEl = this.elements.playlist;
    playlistEl.innerHTML = "";
    playlist.forEach((track, index) => {
      const trackEl = document.createElement("div");
      trackEl.className = "playlist-item";
      trackEl.dataset.index = index;

      const titleEl = document.createElement("span");
      titleEl.className = "playlist-item-title";
      // Same fallback-name cleanup as urlUtils.js's extractFileName() -
      // underscores become spaces, hyphens are left alone (often an
      // intentional part of a name, not just a space substitute).
      titleEl.textContent =
        track.title ||
        track.url
          .split("/")
          .pop()
          .split("?")[0]
          .replace(/_/g, " ")
          .replace(/\.[^/.]+$/, "");

      const durationEl = document.createElement("span");
      durationEl.className = "playlist-duration";
      durationEl.textContent = "...";

      trackEl.appendChild(titleEl);
      trackEl.appendChild(durationEl);

      trackEl.addEventListener("click", () => {
        const url = this.convertDropboxLinkToDirect(track.url);
        this.initializePlayer(url, track.title, index, true); // userSelected - always starts playback once ready
      });

      playlistEl.appendChild(trackEl);
    });
    // Preload durations after rendering playlist items
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => this.preloadDurations(playlist));
    } else {
      setTimeout(() => this.preloadDurations(playlist), 200);
    }

    // Preload background images for first track and adjacent tracks
    if (playlist.length > 0) {
      // Use idle callback for image preloading to avoid blocking
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => this.preloadBackgroundImages(0, playlist));
      } else {
        setTimeout(() => this.preloadBackgroundImages(0, playlist), 300);
      }
    }

    // Initialize custom scrollbar immediately - DOM is ready after innerHTML
    this.initCustomScrollbar(playlistEl);
  },

  initCustomScrollbar(playlistEl) {
    // This runs on every renderPlaylist() call, which itself runs on every
    // builder preview re-render, not once per session (same pattern
    // js/player.js's setupMediaCoordination()/setupWaveformEvents() own
    // comments document elsewhere in this codebase). Without tearing down
    // the previous instance's ResizeObserver and document-level drag
    // listeners first, every settings tweak during normal builder use
    // would permanently leak one more of each - the document listeners in
    // particular are bound to a target that's never destroyed, so they
    // (and everything their closure references: old scrollbarContainer/
    // scrollbarThumb elements, etc.) are kept alive forever, each one
    // still running on every mousemove/touchmove anywhere on the page.
    this._playlistScrollCleanup?.();

    // Remove any existing custom scrollbar
    const existingScrollbar = playlistEl.querySelector('.custom-scrollbar');
    if (existingScrollbar) {
      existingScrollbar.remove();
    }

    // Get UI accent color from CSS variable
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim() || REEL_COLOR_DEFAULTS.uiAccent;
    const thumbColor = colorToRgba(accentColor, 0.3);

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

    // scrollHeight/clientHeight only change on a real layout change
    // (resize, expand/collapse, a fresh render, content reflow) - never
    // from scrolling or dragging itself, same reasoning as
    // updateScrollbarPosition() above. Cached here and refreshed at the
    // same layout-changing moments (see refreshScrollMetricsCache()'s own
    // call sites below) so the hot scroll/wheel/drag paths never force a
    // live read - each one still forces a layout flush if anything's
    // dirty regardless of how "cheap" the property looks, the same bug
    // class already fixed once in js/player.js's waveform code.
    let cachedScrollHeight = 0;
    let cachedClientHeight = 0;
    const refreshScrollMetricsCache = () => {
      cachedScrollHeight = playlistEl.scrollHeight;
      cachedClientHeight = playlistEl.clientHeight;
    };

    // Thumb size/position + at-top/at-bottom masking classes - split out
    // from updateScrollbarPosition() (below) so the 'scroll' listener can
    // drive just this on every tick without also paying for a
    // getBoundingClientRect() pair every time. Reads the cached
    // scrollHeight/clientHeight above rather than the live DOM properties -
    // only scrollTop is read live, since that's the one value that
    // actually changes on every tick.
    const updateScrollbarMetrics = () => {
      const scrollHeight = cachedScrollHeight;
      const clientHeight = cachedClientHeight;

      if (scrollHeight <= clientHeight) {
        scrollbarContainer.style.display = 'none';
        playlistEl.classList.remove('scrollable');
        playlistEl.classList.remove('scroll-at-top');
        playlistEl.classList.remove('scroll-at-bottom');
        return;
      }

      scrollbarContainer.style.display = 'block';
      playlistEl.classList.add('scrollable');

      const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * clientHeight);
      const scrollPercentage = playlistEl.scrollTop / (scrollHeight - clientHeight);
      const thumbTop = scrollPercentage * (clientHeight - thumbHeight);

      scrollbarThumb.style.height = thumbHeight + 'px';
      scrollbarThumb.style.top = thumbTop + 'px';

      // Update scroll position classes for dynamic masking
      const scrollTop = playlistEl.scrollTop;
      const atTop = scrollTop <= 1; // Small threshold for rounding
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if (atTop) {
        playlistEl.classList.add('scroll-at-top');
      } else {
        playlistEl.classList.remove('scroll-at-top');
      }

      if (atBottom) {
        playlistEl.classList.add('scroll-at-bottom');
      } else {
        playlistEl.classList.remove('scroll-at-bottom');
      }
    };

    // Position (top offset + height relative to the parent) only actually
    // changes when layout does - resize, expand/collapse settling, a fresh
    // playlist render - never just from scrolling, since scrolling never
    // moves playlistEl relative to its own parent. Call sites that are
    // layout-changing moments (init, ResizeObserver, the settle timeouts
    // below) get both; the 'scroll' listener itself only needs metrics.
    const updateScrollbar = () => {
      updateScrollbarPosition();
      refreshScrollMetricsCache();
      updateScrollbarMetrics();
    };

    // Initial position
    updateScrollbarPosition();

    // Smooth scrolling with momentum for mouse wheel
    let scrollVelocity = 0;
    let isScrolling = false;
    let scrollAnimationFrame = null;

    const smoothScroll = () => {
      if (Math.abs(scrollVelocity) > 0.1) {
        playlistEl.scrollTop += scrollVelocity;
        scrollVelocity *= 0.92; // Friction/deceleration factor
        scrollAnimationFrame = requestAnimationFrame(smoothScroll);
        isScrolling = true;
      } else {
        scrollVelocity = 0;
        isScrolling = false;
        cancelAnimationFrame(scrollAnimationFrame);
      }
    };

    // Handle scroll events
    playlistEl.addEventListener('scroll', () => {
      // The playback-idle timer (idleState.js) only resets on
      // mousemove/mouseenter/touchstart on the player wrapper - a wheel or
      // trackpad scroll fires neither of those if the cursor itself never
      // moves, so scrolling the playlist alone used to let the idle timer
      // keep counting right through active scrolling. 'scroll' fires for
      // every source (wheel, momentum coast, thumb drag, keyboard), so
      // this one call covers all of them; resetPlaybackIdleTimer() itself
      // already no-ops when nothing's playing, and its own CSS-var read is
      // cached (idleState.js) rather than re-read on every tick.
      this.resetPlaybackIdleTimer();
      if (!isDragging) {
        updateScrollbarMetrics();
      }
    });

    // Prevent page scroll when playlist reaches top/bottom + add smooth momentum
    playlistEl.addEventListener('wheel', (e) => {
      const scrollHeight = cachedScrollHeight;
      const scrollTop = playlistEl.scrollTop;
      const clientHeight = cachedClientHeight;

      const atTop = scrollTop === 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1; // -1 for rounding

      // If scrolling up at top, or scrolling down at bottom, prevent propagation
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Apply smooth momentum scrolling
      e.preventDefault();
      e.stopPropagation();

      // Add to velocity (scaled down for smooth control)
      scrollVelocity += e.deltaY * 0.5;

      // Start smooth scroll animation if not already running
      if (!isScrolling) {
        smoothScroll();
      }
    }, { passive: false });

    // Handle thumb dragging
    let isDragging = false;
    let startY = 0;
    let startThumbTop = 0;

    const startDrag = (clientY) => {
      isDragging = true;
      startY = clientY;
      startThumbTop = parseInt(scrollbarThumb.style.top) || 0;
      scrollbarThumb.style.background = colorToRgba(accentColor, 0.5);
    };

    const moveDrag = (clientY) => {
      if (!isDragging) return;

      const deltaY = clientY - startY;
      const scrollHeight = cachedScrollHeight;
      const clientHeight = cachedClientHeight;
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
    };

    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        scrollbarThumb.style.background = colorToRgba(accentColor, 0.3);
      }
    };

    scrollbarThumb.addEventListener('mousedown', (e) => {
      startDrag(e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });
    scrollbarThumb.addEventListener('touchstart', (e) => {
      startDrag(e.touches[0].clientY);
      e.stopPropagation();
    }, { passive: true });

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

    // Named (not inline) so cleanup below can actually remove them -
    // bound to `document`, not scrollbarThumb, since a drag can continue
    // past the thumb's own bounds once the pointer is down (same reasoning
    // as endDrag below).
    const handleDragMouseMove = (e) => {
      if (!isDragging) return;
      moveDrag(e.clientY);
      e.preventDefault();
    };
    const handleDragTouchMove = (e) => {
      if (!isDragging) return;
      moveDrag(e.touches[0].clientY);
      e.preventDefault();
    };
    document.addEventListener('mousemove', handleDragMouseMove);
    // Not passive - dragging the thumb must be able to suppress the page's
    // own touch-scroll, otherwise the drag and a background scroll fight
    // over the same gesture.
    document.addEventListener('touchmove', handleDragTouchMove, { passive: false });

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    // Initial update immediately
    updateScrollbar();

    // Additional delayed updates for both modes to handle layout transitions
    const settleTimeout1 = setTimeout(updateScrollbar, 100);
    const settleTimeout2 = setTimeout(updateScrollbar, 500);

    // Update on window resize
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(playlistEl);

    // See the top of this method - torn down at the START of the next
    // initCustomScrollbar() call (or never, if this is the last render of
    // the player's lifetime, which is fine: page teardown reclaims it).
    this._playlistScrollCleanup = () => {
      resizeObserver.disconnect();
      clearTimeout(settleTimeout1);
      clearTimeout(settleTimeout2);
      document.removeEventListener('mousemove', handleDragMouseMove);
      document.removeEventListener('touchmove', handleDragTouchMove);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchend', endDrag);
    };
  },
};
