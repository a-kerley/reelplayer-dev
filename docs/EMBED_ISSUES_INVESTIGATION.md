# Embed Issues Investigation & Fixes

## Date: October 19, 2025

This document investigates and fixes the reported issues with embedded player output.

---

## 🔴 Reported Issues

1. **Waveforms not loading** - Not appearing or rendering
2. **Buttons not appearing** - Play button or volume controls missing/invisible
3. **Track lengths not loading** - Playlist durations stuck at "--:--" (especially with .ogg files)
4. **Inconsistent player sizes** - Height/width variations
5. **Volume icon chopped** - SVG being clipped or cut off

---

## 🔍 Root Cause Analysis

### Issue #1: Waveforms Not Loading

**Likely Causes:**
1. CSS `overflow: hidden` on parent containers cutting off waveform
2. WaveSurfer container height not set properly
3. Canvas element not getting proper dimensions
4. Z-index issues hiding waveform behind other elements
5. Opacity staying at 0 (initial fade-in state not triggering)

**Investigation:**
- Check if `#waveform` has proper `height: 100%` and parent has fixed height
- Verify `.waveform-and-volume { height: 85px }` is present
- Check if `ready` event fires to set `canvas { opacity: 1 }`

---

### Issue #2: Buttons Not Appearing

**Likely Causes:**
1. Initial `opacity: 0` not being changed to `opacity: 1`
2. `ready` event not firing properly
3. Color set to background color (invisible)
4. CSS transitions failing
5. SVG viewBox issues

**Investigation:**
- Play button starts with `opacity: 0; color: #888888`
- Should change to `opacity: 1; color: var(--ui-accent)` on ready
- Check if `setTimeout(() => { playPauseBtn.style.opacity = '1'; }, 50)` is executing

---

### Issue #3: Track Lengths Not Loading (.ogg files)

**Root Cause: CORS and Format Issues**

The `preloadDurations()` function uses:
```javascript
const audio = new Audio(convertDropboxLink(track.url));
audio.addEventListener('loadedmetadata', () => {
  // Get duration here
});
```

**Problems:**
1. **OGG files** may not trigger `loadedmetadata` in Safari (unsupported format)
2. **CORS issues** - Dropbox may block metadata loading without proper headers
3. **No timeout** - If metadata never loads, duration stays at "--:--"
4. **Network errors** - Poor connection can prevent metadata load
5. **Async timing** - Metadata may load after player is already initialized

**Better Approach:**
- Use WaveSurfer's loaded track duration instead of separate Audio element
- Add timeout fallback
- Add error handling
- Use `canplaythrough` event in addition to `loadedmetadata`

---

### Issue #4: Inconsistent Player Sizes

**Likely Causes:**
1. Missing fixed height on `.waveform-and-volume`
2. Flexbox sizing issues
3. Different CSS being applied in different contexts
4. Missing `box-sizing: border-box`

**Check:**
```css
.waveform-and-volume {
  height: 85px;  /* MUST be fixed height */
  flex-grow: 1;
}
```

---

### Issue #5: Volume Icon Chopped

**Root Cause: SVG viewBox and Container Size**

Current code:
```css
#volumeToggle .heroicon {
  width: 32px;
  height: 32px;
}

.volume-control {
  height: 100%;  /* 100% of what? */
}
```

**Problems:**
1. `height: 100%` inherits from `.waveform-and-volume { height: 85px }`
2. SVG might overflow 85px height
3. Volume slider positioning might clip the icon
4. `overflow: hidden` somewhere cutting it off

---

## 🛠️ Fixes to Apply

### Fix #1: Robust Duration Loading

Replace the `preloadDurations()` function with a more robust version:

```javascript
function preloadDurations() {
  playlist.forEach((track, index) => {
    const durationEl = document.querySelector(
      `.playlist-item[data-index="${index}"] .playlist-duration`
    );
    if (!durationEl || durationEl.textContent !== '--:--') return;
    
    const audio = new Audio(convertDropboxLink(track.url));
    let loaded = false;
    
    // Set timeout fallback
    const timeout = setTimeout(() => {
      if (!loaded) {
        durationEl.textContent = '?:??';
        console.warn(`Duration timeout for track ${index}`);
      }
    }, 10000); // 10 second timeout
    
    // Try loadedmetadata first (fastest)
    audio.addEventListener('loadedmetadata', () => {
      if (!loaded && !isNaN(audio.duration) && audio.duration > 0) {
        loaded = true;
        clearTimeout(timeout);
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        durationEl.textContent = `${minutes}:${seconds}`;
      }
    });
    
    // Fallback to canplaythrough (slower but more reliable)
    audio.addEventListener('canplaythrough', () => {
      if (!loaded && !isNaN(audio.duration) && audio.duration > 0) {
        loaded = true;
        clearTimeout(timeout);
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        durationEl.textContent = `${minutes}:${seconds}`;
      }
    });
    
    // Handle errors gracefully
    audio.addEventListener('error', (e) => {
      if (!loaded) {
        loaded = true;
        clearTimeout(timeout);
        durationEl.textContent = '--:--';
        console.warn(`Duration load error for track ${index}:`, e);
      }
    });
    
    // Trigger load
    audio.load();
  });
}
```

---

### Fix #2: Ensure Waveform Container Has Proper Structure

Make sure the CSS is explicit about dimensions:

```css
.waveform-and-volume {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-grow: 1;
  height: 85px;  /* Fixed height - critical! */
  min-height: 85px;  /* Prevent collapsing */
  max-height: 85px;  /* Prevent expansion */
}

#waveform {
  position: relative;
  overflow: visible;  /* Don't clip */
  width: 100%;
  height: 100%;  /* Fill parent (85px) */
  flex: 1;  /* Take available space */
}
```

---

### Fix #3: Fix Volume Icon Clipping

Update volume control styles:

```css
.volume-control {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
  height: 85px;  /* Match waveform height explicitly */
  min-width: 40px;  /* Prevent squishing */
  opacity: 0.5;
  color: #888888;
  transition: opacity 0.4s ease, color 0.4s ease;
}

#volumeToggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;  /* Fixed width */
  height: 40px;  /* Fixed height */
}

#volumeToggle .heroicon {
  width: 28px;  /* Smaller to fit comfortably */
  height: 28px;
  flex-shrink: 0;  /* Don't shrink */
}
```

---

### Fix #4: Debug Logging for Ready Event

Add console logging to track if ready event fires:

```javascript
wavesurfer.on('ready', () => {
  console.log('🎵 WaveSurfer ready event fired');
  console.log('Duration:', wavesurfer.getDuration());
  
  const canvas = waveformEl.querySelector('canvas');
  console.log('Canvas element:', canvas);
  console.log('Canvas opacity before:', canvas.style.opacity);
  
  // Existing ready code...
  
  setTimeout(() => {
    canvas.style.opacity = '1';
    console.log('Canvas opacity after:', canvas.style.opacity);
    playPauseBtn.style.opacity = '1';
    console.log('Play button opacity:', playPauseBtn.style.opacity);
  }, 50);
});
```

---

### Fix #5: Ensure Container Structure is Correct

Double-check the HTML structure matches:

```html
<div class="player-controls">
  <button id="playPause">...</button>
  <div class="waveform-and-volume">  <!-- MUST exist -->
    <div id="waveform">  <!-- MUST be direct child -->
      <!-- waveform content -->
    </div>
    <div class="volume-control">  <!-- MUST be direct child -->
      <!-- volume controls -->
    </div>
  </div>
</div>
```

**Common Mistake:**
```html
<!-- WRONG - missing .waveform-and-volume wrapper -->
<div class="player-controls">
  <button id="playPause">...</button>
  <div id="waveform">...</div>
  <div class="volume-control">...</div>
</div>
```

---

### Fix #6: Add Explicit Box-Sizing

```css
* {
  box-sizing: border-box;
}

.reel-player {
  box-sizing: border-box;
}
```

---

### Fix #7: Remove Conflicting Waveform-Container Class

I notice there's both `.waveform-and-volume` and `.waveform-container` in the CSS. This might be causing conflicts:

```css
/* REMOVE THIS - it's from the old structure */
.waveform-container {
  flex: 1;
  position: relative;
  height: 85px;
}
```

Only keep `.waveform-and-volume` and `#waveform`.

---

## 📋 Quick Fix Checklist

### player.html:
- [ ] Update `preloadDurations()` with robust version
- [ ] Add debug logging to ready event
- [ ] Fix volume control height (85px explicit)
- [ ] Fix volume icon size (28px)
- [ ] Remove old `.waveform-container` CSS
- [ ] Add `box-sizing: border-box`
- [ ] Add `min-height` and `max-height` to `.waveform-and-volume`

### embedExporter.js:
- [ ] Same fixes as player.html
- [ ] Ensure HTML structure is correct
- [ ] Verify no extra wrapper elements

---

## 🧪 Testing Steps

1. **Export a reel** with 3-4 tracks including .ogg files
2. **Open in new tab** (standalone HTML)
3. **Check console** for:
   - "WaveSurfer ready event fired"
   - Duration logs
   - Canvas opacity changes
4. **Visually inspect**:
   - Waveform visible
   - Play button visible and colored
   - Volume icon not cut off
   - Track durations loaded (or timeout message)
5. **Test iframe version** at `player.html?id=X`
6. **Compare with builder preview** side-by-side

---

## 🎯 Expected Results After Fixes

✅ **Waveforms:** Visible, 85px height, properly rendered
✅ **Buttons:** Play button visible with accent color, transforms on hover
✅ **Track Lengths:** Load within 10 seconds or show "?:??" 
✅ **Player Size:** Consistent 85px waveform height everywhere
✅ **Volume Icon:** Fully visible, 28x28px, not clipped

---

**Next Step:** Apply these fixes to both `player.html` and `embedExporter.js`
