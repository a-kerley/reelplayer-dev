// Background image preloading — keeps upcoming track/background images warm in the browser cache.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
export const imagePreload = {
  /**
   * Preload background images for current and upcoming tracks
   * @param {number} currentIndex - Current track index
   * @param {Array} playlist - Playlist array with track data
   */
  preloadBackgroundImages(currentIndex, playlist) {
    if (!playlist || playlist.length === 0) return;

    const imagesToPreload = [];

    // Get current track image
    const currentTrack = playlist[currentIndex];
    if (currentTrack?.backgroundImage) {
      imagesToPreload.push(currentTrack.backgroundImage);
    }

    // Get next track image (loop to start if at end)
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];
    if (nextTrack?.backgroundImage) {
      imagesToPreload.push(nextTrack.backgroundImage);
    }

    // Get previous track image (loop to end if at start)
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    const prevTrack = playlist[prevIndex];
    if (prevTrack?.backgroundImage) {
      imagesToPreload.push(prevTrack.backgroundImage);
    }

    // Get project title image from reel settings
    const reelSettings = this.currentReelSettings || window.currentReelSettings;
    if (reelSettings?.projectTitleImage) {
      imagesToPreload.push(reelSettings.projectTitleImage);
    }

    // Get main background image
    if (reelSettings?.backgroundImage && reelSettings?.backgroundImageEnabled) {
      imagesToPreload.push(reelSettings.backgroundImage);
    }

    // Remove duplicates
    const uniqueImages = [...new Set(imagesToPreload)];

    // Add to preload queue
    this.imageCache.preloadQueue = uniqueImages;

    // Start preloading
    this.processImagePreloadQueue();
  },

  /**
   * Process the image preload queue
   */
  processImagePreloadQueue() {
    // Already preloading, skip
    if (this.imageCache.isPreloading) return;

    // No images to preload
    if (this.imageCache.preloadQueue.length === 0) return;

    this.imageCache.isPreloading = true;

    // Process images one at a time to avoid overwhelming the browser
    const preloadNext = () => {
      if (this.imageCache.preloadQueue.length === 0) {
        this.imageCache.isPreloading = false;
        return;
      }

      const imageUrl = this.imageCache.preloadQueue.shift();

      // Skip if already cached
      if (this.imageCache.preloadedImages.has(imageUrl)) {
        preloadNext();
        return;
      }

      // Create new Image object to trigger browser cache
      const img = new Image();

      img.onload = () => {
        // Add to cache
        this.imageCache.preloadedImages.set(imageUrl, img);

        // Enforce cache size limit (remove oldest entries)
        if (this.imageCache.preloadedImages.size > this.imageCache.maxCacheSize) {
          const firstKey = this.imageCache.preloadedImages.keys().next().value;
          this.imageCache.preloadedImages.delete(firstKey);
        }

        // Preload next image
        preloadNext();
      };

      img.onerror = () => {
        console.warn(`[Image Preload] ✗ Failed to load: ${imageUrl}`);
        // Continue with next image even if one fails
        preloadNext();
      };

      // Start loading
      img.src = imageUrl;
    };

    // Start the preload chain
    preloadNext();
  },

  /**
   * Clear the image cache
   */
  clearImageCache() {
    this.imageCache.preloadedImages.clear();
    this.imageCache.preloadQueue = [];
  },
};
