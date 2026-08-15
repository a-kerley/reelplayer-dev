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
      titleEl.textContent =
        track.title ||
        track.url
          .split("/")
          .pop()
          .split("?")[0]
          .replace(/[_-]/g, " ")
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

    // Update scrollbar position and size
    const updateScrollbar = () => {
      updateScrollbarPosition();

      const scrollHeight = playlistEl.scrollHeight;
      const clientHeight = playlistEl.clientHeight;

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
      if (!isDragging) {
        updateScrollbar();
      }
    });

    // Prevent page scroll when playlist reaches top/bottom + add smooth momentum
    playlistEl.addEventListener('wheel', (e) => {
      const scrollHeight = playlistEl.scrollHeight;
      const scrollTop = playlistEl.scrollTop;
      const clientHeight = playlistEl.clientHeight;

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
      const scrollHeight = playlistEl.scrollHeight;
      const clientHeight = playlistEl.clientHeight;
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

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      moveDrag(e.clientY);
      e.preventDefault();
    });
    // Not passive - dragging the thumb must be able to suppress the page's
    // own touch-scroll, otherwise the drag and a background scroll fight
    // over the same gesture.
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      moveDrag(e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    // Initial update immediately
    updateScrollbar();

    // Additional delayed updates for both modes to handle layout transitions
    setTimeout(updateScrollbar, 100);
    setTimeout(updateScrollbar, 500);

    // Update on window resize
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(playlistEl);
  },
};
