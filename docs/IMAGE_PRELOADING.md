# Image Preloading System

## Overview

The Reel Player implements an intelligent image preloading system that preemptively loads background images into the browser cache before they're needed. This ensures smooth, instantaneous transitions between tracks without visible loading delays.

---

## How It Works

### Architecture

The preloading system uses native browser caching by creating `Image()` objects for upcoming assets:

```javascript
imageCache: {
  preloadedImages: new Map(), // Map of URL -> Image object
  preloadQueue: [],           // Array of URLs pending preload
  isPreloading: false,        // Flag to prevent concurrent operations
  maxCacheSize: 10            // Maximum cached images (LRU eviction)
}
```

### What Gets Preloaded

When a track is loaded, the system automatically preloads:

1. **Current track background** - The background for the currently playing/selected track
2. **Next track background** - The next track in the playlist (wraps to first track at end)
3. **Previous track background** - The previous track (wraps to last track at start)
4. **Project title image** - The reel's project title overlay image
5. **Main background image** - The global background if enabled

### Preload Timing

Images are preloaded at two key moments:

- **On playlist render** - When the playlist UI is first rendered, images for track 0 and adjacent tracks are queued
- **On track change** - When switching tracks, images for the new track and its neighbors are queued

Both use `requestIdleCallback()` (or fallback `setTimeout`) to avoid blocking the main thread.

---

## Key Features

### Sequential Processing

Images are loaded **one at a time** to prevent overwhelming the browser's network stack:

```javascript
processImagePreloadQueue() {
  // Loads images sequentially, not in parallel
  // Each image must complete before the next starts
}
```

### LRU Cache with Size Limit

The cache maintains a maximum of **10 images** (configurable via `maxCacheSize`):

- When the cache is full, the **oldest entry** is removed
- This prevents excessive memory usage on long playlists

### Duplicate Prevention

Images are only loaded once - duplicate URLs in the queue are automatically filtered out.

### Graceful Failure Handling

If an image fails to load:
- A warning is logged to the console
- The preload queue continues processing
- The failed image doesn't block subsequent preloads

---

## Console Logging

The system provides detailed logging for debugging:

```
[Image Preload] Queued 5 images for preloading
[Image Preload] ✓ Loaded: background-01.jpg
[Image Preload] ✓ Loaded: background-02.jpg
[Image Preload] Cache full, removed: background-old.jpg
[Image Preload] ✗ Failed to load: missing-image.jpg
```

---

## API Reference

### `preloadBackgroundImages(currentIndex, playlist)`

Main entry point for preloading.

**Parameters:**
- `currentIndex` (number) - Current track index
- `playlist` (Array) - Array of track objects with `backgroundImage` properties

**Behavior:**
- Identifies images to preload (current + adjacent tracks + global images)
- Removes duplicates
- Adds images to preload queue
- Triggers queue processing

### `processImagePreloadQueue()`

Processes the preload queue sequentially.

**Behavior:**
- Loads one image at a time
- Skips already-cached images
- Enforces cache size limits
- Automatically chains to next image on completion

### `clearImageCache()`

Clears all cached images and empties the queue.

**Use Cases:**
- Freeing memory when switching reels
- Resetting the cache during development

---

## Configuration

### Cache Size

Adjust `maxCacheSize` to control memory usage:

```javascript
playerApp.imageCache.maxCacheSize = 15; // Store up to 15 images
```

**Recommendations:**
- **Small playlists (5-10 tracks)**: 10 images (default)
- **Large playlists (20+ tracks)**: 15-20 images
- **Memory-constrained devices**: 5-8 images

---

## Performance Considerations

### Network Usage

- Images are loaded over the network only once per session
- Browser HTTP cache handles subsequent requests
- No additional network overhead for already-cached images

### Memory Usage

- Each cached `Image` object consumes memory
- Typical background image: 200KB-2MB compressed, ~10-50MB decoded
- With 10 images cached: ~100-500MB RAM typical usage

### CPU/GPU Impact

- Minimal - browser handles image decoding efficiently
- Sequential loading prevents thread contention
- `requestIdleCallback` defers work during busy periods

---

## Integration with Existing Systems

### Works Alongside CSS Background Images

The preload system **complements** the existing CSS-based background system:

1. Image is preloaded → stored in browser cache
2. CSS `background-image: url(...)` is applied
3. Browser retrieves from cache instantly → no visible load delay

### Dual-Layer Crossfade System

Preloading ensures both layers of the crossfade system have instant access to images:

- **Layer A** and **Layer B** can both retrieve images from cache
- No delay when switching between layers during transitions

---

## Debugging

### Check Cache Status

```javascript
// In browser console:
console.log(playerApp.imageCache.preloadedImages);
// Map(5) { 'assets/images/bg1.jpg' => img, ... }

console.log(playerApp.imageCache.preloadQueue);
// ['assets/images/bg2.jpg', ...]
```

### Force Preload

```javascript
// Manually trigger preload for current track:
const reelSettings = window.currentReelSettings;
playerApp.preloadBackgroundImages(playerApp.currentTrackIndex, reelSettings.playlist);
```

### Clear Cache

```javascript
playerApp.clearImageCache();
```

---

## Future Enhancements

### Potential Improvements

1. **Adaptive preloading** - Load more images on fast connections
2. **Prefetch on hover** - Preload when user hovers over playlist item
3. **Progressive image loading** - Load low-res placeholder, then full-res
4. **Service Worker integration** - Persistent cache across sessions
5. **WebP with JPEG fallback** - Automatic format detection and fallback

### Configuration Options

Future versions could expose settings:

```javascript
imagePreloadSettings: {
  enabled: true,
  maxCacheSize: 10,
  lookAhead: 1,        // How many tracks ahead to preload
  lookBehind: 1,       // How many tracks behind to preload
  parallelLoads: 2,    // Number of concurrent loads
  priority: 'network'  // 'network' | 'memory' | 'balanced'
}
```

---

## See Also

- [ASSET_MANAGEMENT.md](./ASSET_MANAGEMENT.md) - Asset organization and manifest system
- [PLAYER_DESIGN_SPEC.md](./PLAYER_DESIGN_SPEC.md) - Overall player architecture
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Testing procedures
