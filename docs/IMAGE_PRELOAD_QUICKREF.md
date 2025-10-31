# Image Preloading Quick Reference

## Quick Commands

### Check Cache Status
```javascript
// View number of cached images
playerApp.imageCache.preloadedImages.size;

// View all cached URLs
[...playerApp.imageCache.preloadedImages.keys()];

// Check if preloading is active
playerApp.imageCache.isPreloading;

// Check queue length
playerApp.imageCache.preloadQueue.length;
```

### Trigger Manual Preload
```javascript
// Preload for specific track
const reelSettings = window.currentReelSettings;
playerApp.preloadBackgroundImages(2, reelSettings.playlist); // Track index 2

// Preload for current track
playerApp.preloadBackgroundImages(
  playerApp.currentTrackIndex, 
  reelSettings.playlist
);
```

### Cache Management
```javascript
// Clear entire cache
playerApp.clearImageCache();

// Change cache size (default: 10)
playerApp.imageCache.maxCacheSize = 15; // Increase to 15
```

## Console Monitoring

### Enable Logging
All preload operations automatically log to console:

```
[Image Preload] Queued 5 images for preloading
[Image Preload] ✓ Loaded: background.jpg
[Image Preload] ✗ Failed to load: missing.jpg
[Image Preload] Cache full, removed: old.jpg
[Image Preload] Cache cleared
```

### Filter Console
In DevTools, filter console by: `[Image Preload]`

## What Gets Preloaded

For any track, these images are automatically queued:

- ✓ Current track background
- ✓ Next track background (with wrap-around)
- ✓ Previous track background (with wrap-around)
- ✓ Project title image (if exists)
- ✓ Main background image (if enabled)

## Integration Points

### Automatic Triggers

1. **On playlist render** (initial load)
   ```javascript
   playerApp.renderPlaylist(playlist);
   // → Preloads images for first track
   ```

2. **On track change** (during playback)
   ```javascript
   playerApp.initializePlayer(url, title, index);
   // → Preloads images for new track
   ```

Both use `requestIdleCallback()` for non-blocking operation.

## Testing

### Test Page
Open `test-image-preload.html` for interactive testing interface.

### Network Tab Test
1. Open DevTools → Network tab
2. Filter by "Img"
3. Load player
4. Watch images load automatically
5. Switch tracks → observe instant display

### Cache Verification
```javascript
// After loading first track:
console.log(playerApp.imageCache.preloadedImages.size);
// Should show 3-5 images (current + adjacent + global)
```

## Troubleshooting

### Images Not Preloading?

```javascript
// Check if feature is working
playerApp.preloadBackgroundImages(0, [
  { backgroundImage: 'assets/images/test.jpg' }
]);

// Check console for errors
// Should see: [Image Preload] Queued 1 images for preloading
```

### Cache Not Clearing?

```javascript
// Force clear
playerApp.imageCache.preloadedImages.clear();
playerApp.imageCache.preloadQueue = [];
console.log('Force cleared');
```

### Memory Issues?

```javascript
// Reduce cache size
playerApp.imageCache.maxCacheSize = 5;

// Or clear cache frequently
setInterval(() => playerApp.clearImageCache(), 60000); // Every minute
```

## Configuration Examples

### Large Playlist (20+ tracks)
```javascript
playerApp.imageCache.maxCacheSize = 20;
```

### Memory-Constrained Device
```javascript
playerApp.imageCache.maxCacheSize = 5;
```

### Disable Preloading (Emergency)
```javascript
// Override the preload function to do nothing
playerApp.preloadBackgroundImages = () => {
  console.log('Preloading disabled');
};
```

## Performance Tips

### Do's ✓
- Let the system manage preloading automatically
- Monitor cache size on long playlists
- Use requestIdleCallback timing

### Don'ts ✗
- Don't manually preload all images at once
- Don't set maxCacheSize too high (>30)
- Don't call processImagePreloadQueue() directly

## API Reference

### `preloadBackgroundImages(currentIndex, playlist)`
Main entry point - identifies and queues images.

**Parameters:**
- `currentIndex` (number) - Current track index
- `playlist` (Array) - Playlist with backgroundImage properties

### `processImagePreloadQueue()`
Internal - processes queue sequentially. **Don't call directly.**

### `clearImageCache()`
Clears all cached images and empties queue.

## Files

- **Implementation**: `js/player.js`
- **Documentation**: `docs/IMAGE_PRELOADING.md`
- **Flow Diagram**: `docs/IMAGE_PRELOAD_FLOW.txt`
- **Test Page**: `test-image-preload.html`
- **This Reference**: `docs/IMAGE_PRELOAD_QUICKREF.md`

## Support

For detailed information, see `docs/IMAGE_PRELOADING.md`
