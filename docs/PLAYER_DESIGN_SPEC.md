# Reel Player - Design & Functionality Specification

This document provides a complete specification of the audio player's aesthetics and functionality. Use this as a reference to recreate the player's design and behavior in other projects.

---

## Table of Contents
1. [Overview](#overview)
2. [Visual Design](#visual-design)
3. [Player Components](#player-components)
4. [Interactions & Animations](#interactions--animations)
5. [Functionality](#functionality)
6. [Technical Implementation](#technical-implementation)

---

## Overview

The Reel Player is a modern, minimalist audio player with an integrated waveform visualizer and playlist support. It features smooth animations, intuitive controls, and a clean aesthetic using a white/grey color scheme.

### Key Features
- WaveSurfer.js-based waveform visualization
- Play/Pause with icon toggling
- Vertical volume slider with hover reveal
- Playlist with smooth scaling animations
- Real-time time indicators
- Loading states with spinner
- Responsive hover effects

---

## Visual Design

### Color Scheme (White/Grey UI)
```css
--ui-accent: #4a4a4a;              /* Main UI color (grey) */
--waveform-unplayed: #929292;      /* Unplayed waveform (medium grey) */
--waveform-hover: rgba(0, 0, 0, 0.05); /* Hover overlay (light grey) */
--background-color: rgba(255, 255, 255, 1); /* White background */
```

### Typography
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

**Title Styling:**
- Font size: `1.3rem`
- Font weight: `700`
- Text align: `center`
- Padding bottom: `1.5rem`
- Color: `var(--ui-accent)`

**Track Info:**
- Font size: `0.9rem`
- Font weight: `600`
- Margin left: `3.7rem` (aligned with waveform)
- Padding left: `0.5rem`
- Color: `var(--ui-accent)`
- Truncates with ellipsis on overflow

**Playlist Items:**
- Font size: `1rem` (default body size)
- Font weight: `normal` (600 when active)
- Color: `var(--ui-accent)`

**Time Indicators:**
- Font size: `0.75rem`
- Font weight: `400`
- Color: `var(--ui-accent)`

**Total Time:**
- Font size: `0.65rem`
- Font weight: `200`
- Color: `var(--waveform-unplayed)`

### Layout Structure
```
┌─────────────────────────────────────────────────┐
│  Reel Title (optional, centered)               │
│                                                  │
│  Track Name (left-aligned)                      │
│                                                  │
│  [▶] ───────waveform──────── [🔊]              │
│       (with hover/playhead indicators)          │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ Track 1                         3:45   │    │
│  │ Track 2 (active, scaled up)     2:30   │    │
│  │ Track 3                         4:12   │    │
│  └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Container Properties
```css
border-radius: 8px;
padding: 1rem;
background-color: rgba(255, 255, 255, 1);
box-sizing: border-box;
overflow: hidden;
```

---

## Player Components

### 1. Play/Pause Button

**Visual Specifications:**
- Size: `46px × 46px` (SVG icon)
- Padding top: `0.2rem`
- Background: `none` (transparent)
- Border: `none`
- Color: `var(--ui-accent)`
- Cursor: `pointer`

**States:**
- **Initial:** Opacity `0`, fades in on ready
- **Ready:** Opacity `1`, transition `0.4s ease`
- **Hover:** Scale `1.1`, transition `0.2s ease`

**Icons:**
- **Play Icon:** Circle with right-pointing triangle (Heroicon filled)
- **Pause Icon:** Circle with two vertical bars (Heroicon filled)

**SVG Play Icon:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd"/>
</svg>
```

**SVG Pause Icon:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd"/>
</svg>
```

### 2. Waveform Container

**Specifications:**
- Height: `85px`
- Display: `flex`
- Align items: `center`
- Gap: `0.5rem` (between waveform and volume)
- Position: `relative`
- Overflow: `visible`

**Waveform Canvas:**
- Initial opacity: `0`
- Ready state: Opacity `1`
- Transition: `0.4s ease`
- Wave color (unplayed): `var(--waveform-unplayed)`
- Progress color (played): `var(--ui-accent)`
- Bar width: `2px`
- Bar gap: `1px`
- Bar radius: `1px`
- Height: `100px`
- Responsive: `true`
- Normalize: `true`

**Hover Overlay:**
- Position: `absolute`
- Top: `0`, Left: `0`
- Height: `100%`
- Background: `var(--waveform-hover)`
- Pointer events: `none`
- Width: Dynamic (based on mouse position)
- Z-index: `4`

**Hover Time Indicator:**
- Position: `absolute`
- Bottom: `-1.5rem`
- Font size: `0.75rem`
- Font weight: `400`
- Color: `var(--ui-accent)`
- Padding: `0 0.3rem`
- Opacity: `0` (visible on hover)
- Transition: `0.2s ease`
- Transform: `translateX(-50%)` (centered on cursor)
- Z-index: `10`
- Clamped between 30px and (width - 40px)

**Playhead Time Indicator:**
- Position: `absolute`
- Bottom: `-1.5rem`
- Font size: `0.75rem`
- Font weight: `400`
- Color: `var(--ui-accent)`
- Padding: `0 0.5rem`
- Opacity: Dynamic (visible when playing)
- Transform: `translateX(-50%)`
- Z-index: `10`
- Clamped between 20px and (width - 40px)

**Total Time Display:**
- Position: `absolute`
- Bottom: `60%`
- Right: `0.3rem`
- Font size: `0.65rem`
- Font weight: `200`
- Color: `var(--waveform-unplayed)`
- Opacity: `0` initially, `1` when ready
- Transition: `0.4s ease`
- Z-index: `10`
- User-select: `none`

### 3. Volume Control

**Container Specifications:**
- Display: `flex` (inline)
- Position: `relative`
- Align items: `center`
- Justify content: `center`
- Height: `100%`
- Initial opacity: `0.5`
- Ready opacity: `1`
- Transition: `0.4s ease`

**Volume Toggle Button:**
- Size: `32px × 32px` (icon)
- Background: `none`
- Border: `none`
- Cursor: `pointer`
- Color: `var(--ui-accent)`

**Volume Icons:**

*Loud (unmuted):*
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
  <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
</svg>
```

*Muted:*
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
</svg>
```

**Volume Slider:**
- Width: `6px`
- Height: `80px`
- Position: `absolute`
- Bottom: `80%` (appears above button)
- Margin bottom: `0.01rem`
- Writing mode: `vertical-rl`
- Direction: `rtl`
- Background: `var(--waveform-unplayed)`
- Border radius: `6px`
- Initial opacity: `0`
- Initial transform: `scaleY(0)`
- Transform origin: `bottom center`
- Transition: `0.2s ease`

**Slider Thumb:**
- Width: `16px`
- Height: `16px`
- Border radius: `50%` (circle)
- Background: `var(--ui-accent)`
- Border: `none`
- Cursor: `pointer`

**Slider States:**
- Hidden: `opacity: 0`, `transform: scaleY(0)`, `pointer-events: none`
- Visible: `opacity: 1`, `transform: scaleY(1)`, `pointer-events: auto`
- Class `.show-slider` added on hover/interaction

### 4. Loading Indicator

**Specifications:**
- Position: `absolute`
- Top: `0`, Left: `0`
- Width: `100%`
- Height: `100%`
- Z-index: `10`
- Background: `rgba(255, 255, 255, 0.9)`
- Display: `flex`
- Align items: `center`
- Justify content: `center`
- Border radius: `8px`
- Initial state: Visible
- Ready state: `opacity: 0`, `pointer-events: none`
- Transition: `0.3s ease`

**Spinner:**
- Size: `60px × 60px`
- Border: `4px solid #f3f3f3`
- Border top: `4px solid var(--ui-accent)`
- Border radius: `50%`
- Animation: `spin 1s linear infinite`

```css
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### 5. Track Info Display

**Specifications:**
- Display: `block`
- Min height: `1.2rem`
- Margin bottom: `0.75rem`
- Margin left: `3.7rem` (aligned with waveform)
- Padding left: `0.5rem`
- Font size: `0.9rem`
- Font weight: `600`
- Color: `var(--ui-accent)`
- White space: `nowrap`
- Overflow: `hidden`
- Text overflow: `ellipsis`
- Initial opacity: `0`, visibility: `hidden`
- Visible state: `opacity: 1`, visibility: `visible`
- Transition: `0.4s ease`

### 6. Playlist

**Container Specifications:**
- Margin top: `2.5rem`
- Max height: `200px` (scrollable)
- Overflow Y: `auto`
- Text align: `left`

**Playlist Item:**
- Display: `flex`
- Justify content: `space-between`
- Align items: `center`
- Padding: `0.75rem 1rem`
- Cursor: `pointer`
- Color: `var(--ui-accent)`
- Border radius: `4px`
- Margin bottom: `0px`
- Transform origin: `center`

**States:**

*Default (Inactive):*
- Transform: `scale(0.95)`
- Opacity: `0.7`
- Background: `transparent`
- Font weight: `normal`

*Hover:*
- Transform: `scale(0.98)`
- Opacity: `0.85`
- Background: `rgba(255, 255, 255, 0.1)`

*Active (Currently Playing):*
- Transform: `scale(1)`
- Opacity: `1`
- Font weight: `600`
- Background: `rgba(255, 255, 255, 0.05)`
- Box shadow: `0 2px 8px rgba(0, 0, 0, 0.1)`

**All transitions:** `0.3s cubic-bezier(0.4, 0, 0.2, 1)`

**Playlist Duration:**
- Margin left: `1rem`
- Font size: `0.85rem`
- Color: `var(--ui-accent)`
- Opacity: `0.8` (inactive), `1` (active)
- Font weight: `normal` (inactive), `600` (active)
- Flex shrink: `0`

**First Item Spacing:**
- Margin top: `4px`

---

## Interactions & Animations

### 1. Initial Load Animation

**Sequence:**
1. Loading spinner visible (`opacity: 1`)
2. All controls hidden (`opacity: 0`)
3. On audio ready:
   - Loading fades out (300ms)
   - Canvas fades in (400ms, 50ms delay)
   - Play button fades in (400ms, 50ms delay)
   - Volume control fades in (400ms)
   - Track info fades in (400ms)
   - Total time fades in (400ms)

### 2. Play/Pause Interaction

**On Click:**
- Toggle between play/pause icons
- Scale up to `1.1` on hover
- Transition: `0.2s ease`
- Icon swap occurs on `play` and `pause` events

### 3. Waveform Hover Behavior

**On Mouse Move:**
1. Calculate hover position percentage
2. Update hover overlay width
3. Calculate time at hover position
4. Display hover time indicator
5. Position indicator horizontally (clamped)
6. Fade in indicator (`opacity: 1`)

**On Mouse Leave:**
1. Reset overlay width to `0%`
2. Fade out indicator (`opacity: 0`)

### 4. Volume Control Hover Behavior

**Show Slider Trigger:**
- Mouse enters volume control container
- Mouse enters volume toggle button
- Mouse enters volume slider
- Slider is being dragged

**Hide Slider Trigger:**
- Mouse leaves all volume areas for 300ms
- Not currently dragging

**Animation:**
- Opacity: `0` → `1` (200ms)
- Transform: `scaleY(0)` → `scaleY(1)` (200ms)
- Easing: `ease`

**Persistence Logic:**
- Clear hide timeout on any hover
- Start 300ms timeout on leave
- Cancel timeout if interaction detected

### 5. Playlist Item Interactions

**Hover Animation:**
- Scale: `0.95` → `0.98`
- Opacity: `0.7` → `0.85`
- Background: `transparent` → `rgba(255, 255, 255, 0.1)`
- Transition: `0.3s cubic-bezier(0.4, 0, 0.2, 1)`

**Active State Animation:**
- Scale: `0.95` → `1`
- Opacity: `0.7` → `1`
- Background: `transparent` → `rgba(255, 255, 255, 0.05)`
- Font weight: `normal` → `600`
- Box shadow appears

**Click Behavior:**
1. Remove `.active` class from all items
2. Add `.active` class to clicked item
3. Load and play new track
4. Update track info display

### 6. Track Change Animation

**Sequence:**
1. Show loading spinner
2. Update playlist active state
3. Update track info text
4. Load new audio
5. Hide loading spinner on ready
6. Update total time display
7. Reset playhead position

### 7. Playhead Time Indicator

**Behavior:**
- Updates on `audioprocess` event
- Position calculated as: `(currentTime / duration) * waveformWidth`
- Clamped between `20px` and `(width - 40px)`
- Transform: `translateX(-50%)` for centering
- Opacity based on playing state

---

## Functionality

### 1. Audio Playback

**Features:**
- WaveSurfer.js integration
- Click waveform to seek
- Play/pause toggle
- Auto-play next track on finish
- Volume control (0-1 range)
- Mute/unmute toggle

**Events Handled:**
- `ready` - Audio loaded and ready
- `play` - Playback started
- `pause` - Playback paused
- `finish` - Track completed
- `audioprocess` - Real-time playback updates
- `loading` - Loading progress

### 2. Volume System

**Capabilities:**
- Vertical slider (0.0 to 1.0)
- Click toggle to mute/unmute
- Remembers previous volume when muting
- Hover to reveal slider
- Auto-hide after 300ms
- Persistent while dragging or hovering

**Behavior:**
- Default volume: `1.0` (100%)
- Step: `0.01`
- Icon changes based on volume state
- Volume applies immediately on change

### 3. Playlist Management

**Features:**
- Display track titles or file names
- Show track durations (preloaded)
- Visual active state
- Click to switch tracks
- Smooth scaling animations
- Auto-scroll support (max height with overflow)

**Duration Preloading:**
- Uses separate Audio objects
- Loads metadata only
- Displays `--:--` until loaded
- Format: `M:SS` (e.g., `3:45`)

### 4. Time Display System

**Three Time Indicators:**

1. **Hover Time:**
   - Shows time at mouse position
   - Only visible when hovering waveform
   - Follows cursor with bounds

2. **Playhead Time:**
   - Shows current playback position
   - Follows playhead during playback
   - Clamped to waveform bounds

3. **Total Time:**
   - Shows total track duration
   - Fixed position (bottom right of waveform)
   - Visible when audio is ready

**Time Format:** `M:SS` or `MM:SS`
- Minutes (no leading zero)
- Seconds (always 2 digits with leading zero)
- Examples: `0:05`, `3:45`, `12:30`

### 5. Loading States

**Loading Indicator Shown When:**
- Initial player load
- Track is loading
- Audio is buffering

**Loading Indicator Hidden When:**
- Audio is ready
- Playback can begin

### 6. Track Information

**Display Logic:**
- Shows current track title
- Falls back to filename if no title
- Filename processing:
  - Remove file extension
  - Replace underscores and hyphens with spaces
  - Truncate with ellipsis if too long

### 7. URL Handling

**Dropbox Link Conversion:**
- Detects `dropbox.com` URLs
- Converts to direct download links
- Changes domain to `dl.dropboxusercontent.com`
- Ensures `?dl=1` parameter
- Supports both `www.dropbox.com` and `dropbox.com`

---

## Technical Implementation

### Dependencies

**Required Library:**
```html
<script src="https://cdn.jsdelivr.net/npm/wavesurfer.js@7"></script>
```

### WaveSurfer Configuration

```javascript
WaveSurfer.create({
  container: '#waveform',
  waveColor: '#929292',        // Unplayed wave color
  progressColor: '#4a4a4a',    // Played wave color (UI accent)
  height: 85,                  // Waveform height in pixels
  barWidth: 2,                 // Width of each waveform bar
  barGap: 1,                   // Gap between bars
  barRadius: 1,                // Border radius of bars
  responsive: true,            // Responsive to container size
  normalize: true              // Normalize waveform amplitude
});
```

### CSS Variables System

```css
:root {
  --ui-accent: #4a4a4a;
  --waveform-unplayed: #929292;
  --waveform-hover: rgba(0, 0, 0, 0.05);
  --background-color: rgba(255, 255, 255, 1);
}
```

### Event System

**Custom Events Dispatched:**
```javascript
// Track change
new CustomEvent('track:change', {
  detail: { audioURL, title, index }
});

// Playback events
new CustomEvent('playback:play');
new CustomEvent('playback:pause');
new CustomEvent('playback:finish');

// Volume events
new CustomEvent('volume:mute');
new CustomEvent('volume:unmute');
```

### State Management

**Player State:**
```javascript
{
  wavesurfer: WaveSurfer,      // WaveSurfer instance
  isWaveformReady: boolean,    // Audio ready state
  previousVolume: number,      // For mute/unmute
  isDraggingSlider: boolean,   // Volume slider drag state
  isHoveringSlider: boolean,   // Volume slider hover state
  isHoveringIcon: boolean      // Volume icon hover state
}
```

### HTML Structure Template

```html
<div class="player-wrapper">
  <div class="player-content">
    <div class="reel-title">Title</div>
    <div class="track-info"></div>
    <div class="player-container">
      <button id="playPause" class="icon-button">
        <!-- Play/Pause SVG -->
      </button>
      <div class="waveform-and-volume">
        <div id="waveform">
          <div class="hover-overlay"></div>
          <div class="hover-time">0:00</div>
          <div class="playhead-time">0:00</div>
          <div id="total-time" class="total-time">0:00</div>
          <div id="loading" class="loading">
            <!-- Spinner -->
          </div>
        </div>
        <div class="volume-control">
          <button id="volumeToggle" class="icon-button">
            <!-- Volume SVG -->
          </button>
          <input type="range" id="volumeSlider" 
                 min="0" max="1" step="0.01" value="1"/>
        </div>
      </div>
    </div>
  </div>
  <div class="playlist">
    <div class="playlist-item active">
      <span>Track Name</span>
      <span class="playlist-duration">3:45</span>
    </div>
    <!-- More playlist items -->
  </div>
</div>
```

### Key Measurements

**Spacing:**
- Container padding: `1rem`
- Title padding bottom: `1.5rem`
- Track info margin bottom: `0.75rem`
- Track info margin left: `3.7rem`
- Player container gap: `1rem`
- Playlist margin top: `2.5rem`
- Playlist item padding: `0.75rem 1rem`

**Sizes:**
- Play button icon: `46px × 46px`
- Volume icon: `32px × 32px`
- Volume slider: `6px × 80px`
- Slider thumb: `16px × 16px`
- Waveform height: `85px`
- Loading spinner: `60px × 60px`
- Border radius: `8px`

**Opacity Levels:**
- Hidden: `0`
- Inactive playlist item: `0.7`
- Hover playlist item: `0.85`
- Active playlist item: `1`
- Duration (inactive): `0.8`
- Duration (active): `1`
- Loading background: `0.9`

**Z-Index Layers:**
1. Background: `0` (implicit)
2. Backdrop filter/overlay: `1`
3. Player content: `2`
4. Hover overlay: `4`
5. Time indicators: `10`
6. Loading spinner: `10`

---

## Responsive Behavior

### Waveform
- Automatically scales to container width
- Maintains aspect ratio
- Bar count adjusts to available space

### Text Truncation
- Track info uses ellipsis on overflow
- Playlist items truncate long titles
- Time indicators use fixed-width formatting

### Playlist Scrolling
- Max height: `200px`
- Vertical scroll when exceeded
- Smooth scrolling support

---

## Browser Compatibility Notes

### Webkit-specific Properties
```css
-webkit-appearance: none;
-webkit-backdrop-filter: blur(var(--background-blur));
```

### CSS Properties Used
- Flexbox (widely supported)
- CSS Grid (not used)
- CSS Custom Properties/Variables
- Transform (scale, translate)
- Backdrop filter (modern browsers)
- Transitions and animations

### JavaScript Features
- ES6+ syntax (const, let, arrow functions)
- Template literals
- Destructuring
- Custom events
- Audio API
- requestIdleCallback (with fallback)

---

## Performance Considerations

### Optimizations
- Canvas opacity transition instead of display toggle
- Will-change on frequently animated elements
- Backface-visibility: hidden for smoother transforms
- RequestIdleCallback for duration preloading
- Debounced hide timeout for volume slider

### Smooth Animations
- Use transform instead of position changes
- GPU-accelerated properties (transform, opacity)
- Cubic-bezier easing: `cubic-bezier(0.4, 0, 0.2, 1)`

---

## Accessibility Notes

While not explicitly implemented in this spec, consider adding:
- ARIA labels for icon buttons
- Keyboard navigation support
- Focus indicators
- Screen reader announcements
- Alt text for visual elements
- Skip to content functionality

---

## Summary

This player combines:
- **Modern aesthetics** with clean white/grey design
- **Smooth animations** using scale and opacity transitions
- **Intuitive interactions** with hover reveals and visual feedback
- **Professional UI** with proper spacing and typography
- **Responsive behavior** that adapts to content
- **Performant rendering** with optimized CSS and JS

The design prioritizes user experience through clear visual hierarchy, subtle animations, and predictable behavior patterns.
