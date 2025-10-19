# Quick Diagnostic - Copy/Paste into Browser Console

If you're still seeing issues, copy this entire script and paste it into your browser's DevTools Console while viewing an embedded player:

```javascript
// ============================================
// REEL PLAYER DIAGNOSTIC SCRIPT
// ============================================

console.log('%c🔍 Running Reel Player Diagnostics...', 'color: blue; font-size: 16px; font-weight: bold');

// 1. Check if WaveSurfer is loaded
console.log('\n%c1. WaveSurfer Status:', 'color: green; font-weight: bold');
if (typeof WaveSurfer !== 'undefined') {
  console.log('✅ WaveSurfer is loaded (version 7)');
} else {
  console.error('❌ WaveSurfer is NOT loaded!');
}

// 2. Check HTML Structure
console.log('\n%c2. HTML Structure Check:', 'color: green; font-weight: bold');

const playerControls = document.querySelector('.player-controls');
const waveformAndVolume = document.querySelector('.waveform-and-volume');
const waveform = document.getElementById('waveform');
const playButton = document.getElementById('playPause');
const volumeControl = document.getElementById('volumeControl');
const canvas = document.querySelector('#waveform canvas');

console.log('.player-controls exists:', playerControls ? '✅ YES' : '❌ NO');
console.log('.waveform-and-volume exists:', waveformAndVolume ? '✅ YES' : '❌ NO');
console.log('#waveform exists:', waveform ? '✅ YES' : '❌ NO');
console.log('#playPause exists:', playButton ? '✅ YES' : '❌ NO');
console.log('#volumeControl exists:', volumeControl ? '✅ YES' : '❌ NO');
console.log('canvas element exists:', canvas ? '✅ YES' : '❌ NO');

// 3. Check CSS Computed Styles
console.log('\n%c3. CSS Styles Check:', 'color: green; font-weight: bold');

if (waveformAndVolume) {
  const waveformStyles = window.getComputedStyle(waveformAndVolume);
  console.log('.waveform-and-volume height:', waveformStyles.height);
  console.log('.waveform-and-volume min-height:', waveformStyles.minHeight);
  console.log('.waveform-and-volume max-height:', waveformStyles.maxHeight);
  
  if (waveformStyles.height === '85px') {
    console.log('✅ Waveform height is correct');
  } else {
    console.error('❌ Waveform height is wrong! Expected: 85px, Got:', waveformStyles.height);
  }
}

if (volumeControl) {
  const volumeStyles = window.getComputedStyle(volumeControl);
  console.log('.volume-control height:', volumeStyles.height);
  console.log('.volume-control min-width:', volumeStyles.minWidth);
  
  if (volumeStyles.height === '85px') {
    console.log('✅ Volume control height is correct');
  } else {
    console.error('❌ Volume control height is wrong! Expected: 85px, Got:', volumeStyles.height);
  }
}

if (playButton) {
  const buttonStyles = window.getComputedStyle(playButton);
  console.log('#playPause opacity:', buttonStyles.opacity);
  console.log('#playPause color:', buttonStyles.color);
}

if (canvas) {
  const canvasStyles = window.getComputedStyle(canvas);
  console.log('canvas opacity:', canvasStyles.opacity);
  
  if (canvasStyles.opacity === '0') {
    console.warn('⚠️ Canvas opacity is 0 - waveform is invisible!');
  } else if (canvasStyles.opacity === '1') {
    console.log('✅ Canvas is visible');
  }
}

// 4. Check Interactive Elements
console.log('\n%c4. Interactive Elements:', 'color: green; font-weight: bold');

const hoverOverlay = document.querySelector('.hover-overlay');
const hoverTime = document.querySelector('.hover-time');
const playheadTime = document.querySelector('.playhead-time');
const totalTime = document.getElementById('total-time');

console.log('.hover-overlay exists:', hoverOverlay ? '✅ YES' : '❌ NO');
console.log('.hover-time exists:', hoverTime ? '✅ YES' : '❌ NO');
console.log('.playhead-time exists:', playheadTime ? '✅ YES' : '❌ NO');
console.log('#total-time exists:', totalTime ? '✅ YES' : '❌ NO');

// 5. Check Playlist Durations
console.log('\n%c5. Playlist Durations:', 'color: green; font-weight: bold');

const playlistItems = document.querySelectorAll('.playlist-item');
const durations = document.querySelectorAll('.playlist-duration');

console.log('Playlist items found:', playlistItems.length);
console.log('Duration elements found:', durations.length);

durations.forEach((el, i) => {
  const text = el.textContent;
  if (text === '--:--') {
    console.warn(`⚠️ Track ${i}: Duration not loaded (still --:--)`);
  } else if (text === '?:??') {
    console.warn(`⚠️ Track ${i}: Duration timed out`);
  } else {
    console.log(`✅ Track ${i}: ${text}`);
  }
});

// 6. Check localStorage
console.log('\n%c6. LocalStorage Check:', 'color: green; font-weight: bold');

const urlParams = new URLSearchParams(window.location.search);
const reelId = urlParams.get('id');

if (reelId) {
  console.log('Reel ID from URL:', reelId);
  const storedData = localStorage.getItem(`reel_${reelId}`);
  if (storedData) {
    console.log('✅ Reel data found in localStorage');
    try {
      const parsed = JSON.parse(storedData);
      console.log('Reel title:', parsed.title);
      console.log('Playlist tracks:', parsed.playlist?.length || 0);
    } catch (e) {
      console.error('❌ Error parsing reel data:', e);
    }
  } else {
    console.error('❌ No reel data in localStorage for this ID');
  }
} else {
  console.log('No reel ID in URL (might be standalone HTML)');
}

// 7. Summary
console.log('\n%c📊 DIAGNOSTIC SUMMARY:', 'color: blue; font-size: 14px; font-weight: bold');

let issues = [];

if (typeof WaveSurfer === 'undefined') issues.push('WaveSurfer not loaded');
if (!waveformAndVolume) issues.push('Missing .waveform-and-volume wrapper');
if (!canvas) issues.push('Canvas element missing');
if (canvas && window.getComputedStyle(canvas).opacity === '0') issues.push('Canvas invisible (opacity 0)');
if (playButton && window.getComputedStyle(playButton).opacity === '0') issues.push('Play button invisible');
if (waveformAndVolume && window.getComputedStyle(waveformAndVolume).height !== '85px') {
  issues.push('Incorrect waveform height');
}

if (issues.length === 0) {
  console.log('%c✅ NO CRITICAL ISSUES FOUND!', 'color: green; font-size: 14px; font-weight: bold');
  console.log('If you still see visual problems, it might be:');
  console.log('  - Cache issue (try hard refresh)');
  console.log('  - Custom CSS overriding styles');
  console.log('  - Audio files not loading (check Network tab)');
} else {
  console.log('%c❌ ISSUES FOUND:', 'color: red; font-size: 14px; font-weight: bold');
  issues.forEach(issue => console.error('  -', issue));
  
  console.log('\n%cSUGGESTED FIXES:', 'color: orange; font-weight: bold');
  
  if (issues.includes('WaveSurfer not loaded')) {
    console.log('  1. Check Network tab for wavesurfer.js CDN request');
    console.log('  2. Verify internet connection');
  }
  
  if (issues.includes('Missing .waveform-and-volume wrapper')) {
    console.log('  1. You are testing an OLD exported file');
    console.log('  2. Create a NEW reel and export again');
    console.log('  3. Hard refresh the builder page first');
  }
  
  if (issues.includes('Canvas element missing') || issues.includes('Canvas invisible (opacity 0)')) {
    console.log('  1. Wait for "🎵 WaveSurfer ready" message in console');
    console.log('  2. Check if audio file is loading (Network tab)');
    console.log('  3. Try with a simple MP3 file');
  }
  
  if (issues.includes('Incorrect waveform height')) {
    console.log('  1. Clear browser cache');
    console.log('  2. Create NEW reel (old localStorage data has old CSS)');
  }
}

console.log('\n%c✨ Diagnostics Complete!', 'color: blue; font-size: 16px; font-weight: bold');
```

## How to Use This Diagnostic:

1. **Open your embedded player** (iframe or standalone HTML)
2. **Open DevTools** (press F12)
3. **Go to Console tab**
4. **Copy the entire script above** (everything in the code block)
5. **Paste into console** and press Enter
6. **Read the output** - it will tell you exactly what's wrong

## What to Look For:

### ✅ Good Output (Everything Working):
```
✅ WaveSurfer is loaded
✅ .player-controls exists
✅ .waveform-and-volume exists
✅ Waveform height is correct (85px)
✅ Volume control height is correct (85px)
✅ Canvas is visible
✅ NO CRITICAL ISSUES FOUND!
```

### ❌ Bad Output (Problems Found):
```
❌ Missing .waveform-and-volume wrapper
  → You're testing an OLD file, create NEW reel

❌ Canvas invisible (opacity 0)
  → Audio not loaded yet, or error loading

❌ Incorrect waveform height
  → Old CSS from cache, hard refresh needed
```

## Next Steps After Running Diagnostic:

1. **Take a screenshot** of the console output
2. **Share the results** if you need help
3. **Follow suggested fixes** in the output

---

This diagnostic will tell you **exactly** what's working and what's not!
