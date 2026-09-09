# Project Card System - Documentation

## Overview
This is a fully modular, reusable project card component system. Each card displays project information with hover effects, video playback, and expandable content sections.

## Architecture

### Files Structure
```
├── project-card.js       # ProjectCard class (component logic)
├── project-card.css      # All card styles
├── projects-data.js      # Centralized project data
├── script.js             # Main app script (initializes cards)
└── index.html            # HTML structure
```

## How It Works

### 1. Data Definition (`projects-data.js`)
Define your project data in one centralized location:

```javascript
export const projectsData = {
  projectId: {
    id: 'unique-id',
    title: 'Project Title',
    video: 'path/to/video.mp4',
    image: 'path/to/image.jpg',
    logo: 'path/to/logo.svg',
    logoAlt: 'Logo alt text',
    partnerLogos: [
      { src: 'logo1.png', alt: 'Partner 1' },
      { src: 'logo2.png', alt: 'Partner 2' }
    ],
    composers: 'Composer Names',
    description: [
      'First paragraph...',
      'Second paragraph...'
    ],
    releaseDate: 'Date',
    platforms: 'Platform names'
  }
};
```

### 2. Component Class (`project-card.js`)
The `ProjectCard` class handles:
- ✅ Rendering HTML from data
- ✅ Managing all interactions (hover, expand/collapse)
- ✅ Video playback control
- ✅ Animations and transitions
- ✅ State management

**Key Methods:**
- `constructor(containerId, projectData)` - Initialize card
- `expand()` - Expand to show extra content
- `collapse()` - Collapse to hide extra content
- `destroy()` - Cleanup when removing card

### 3. Styling (`project-card.css`)
All card styles in one organized file:
- Base card structure
- Hover effects & transitions
- Video/image layers
- Logo positioning
- Expand/collapse animations
- Responsive behavior

## Usage

### Basic Usage

#### Step 1: Add Container in HTML
```html
<section class="project-cards-block">
  <div class="project-cards-container" id="my-card-container"></div>
</section>
```

#### Step 2: Initialize Card in JavaScript
```javascript
import { ProjectCard } from './project-card.js';
import { projectsData } from './projects-data.js';

// Initialize one card
new ProjectCard('my-card-container', projectsData.hcotm);
```

### Adding New Projects

#### Option 1: Add to existing data file
```javascript
// In projects-data.js
export const projectsData = {
  hcotm: { /* existing data */ },
  
  newProject: {
    id: 'new-project',
    title: 'New Amazing Game',
    video: 'assets/projectcards/newgame/video.mp4',
    // ... rest of data
  }
};
```

#### Option 2: Create inline
```javascript
const customProjectData = {
  id: 'custom',
  title: 'Custom Project',
  // ... data
};

new ProjectCard('container-id', customProjectData);
```

### Multiple Cards

```html
<!-- Add multiple containers -->
<div class="project-cards-container" id="card-1"></div>
<div class="project-cards-container" id="card-2"></div>
<div class="project-cards-container" id="card-3"></div>
```

```javascript
// Initialize multiple cards
new ProjectCard('card-1', projectsData.hcotm);
new ProjectCard('card-2', projectsData.project2);
new ProjectCard('card-3', projectsData.project3);
```

## Features

### 🎬 Automatic Video Playback
- Video fades in on hover (0.8s delay)
- Auto-plays when mouse enters
- Pauses when mouse leaves
- Preloaded for smooth playback

### 🎯 Hover Effects
- Card lifts up (-10px)
- Logo scales and repositions
- Partner logos fade in
- Gradient overlay intensifies
- All with smooth transitions

### 📖 Expand/Collapse
- Click expand button to show more content
- Smooth height animations
- Auto-collapses when mouse leaves
- Container adapts height automatically

### ♿ Accessibility
- Semantic HTML structure
- ARIA labels on buttons
- Alt text on all images
- Keyboard navigable

## Customization

### Adjusting Animation Timings
In `project-card.js`:
```javascript
const ANIMATION_TIMINGS = {
  VIDEO_FADE_OUT: 100,        // Video fade during expand
  EXPAND_DELAY: 50,            // Delay before height animation
  COLLAPSE_CLEANUP: 500,       // Cleanup after collapse
  COLLAPSE_TRANSITION: 400,    // Collapse animation duration
  EXTRA_CONTENT_BUFFER: 300    // Extra space for expanded content
};
```

### Custom Styling
Override in your own CSS:
```css
.project-card[data-project-id="custom-id"] {
  /* Custom styles for specific project */
}

.project-card-logo {
  /* Adjust logo positioning */
  top: 150px;
  width: 70%;
}
```

### Composer Attribution
Edit the `::after` pseudo-element in CSS:
```css
.project-card-hover-text::after {
  content: "Music by Your Name";
}
```

## Benefits of This System

### ✅ Truly Modular
- Separate concerns: data, logic, presentation
- Reusable across projects
- Easy to maintain

### ✅ Scalable
- Add unlimited cards with minimal code
- No code duplication
- Centralized data management

### ✅ Encapsulated
- All card logic in one class
- No global state pollution
- Event listeners properly managed

### ✅ Maintainable
- Clear file organization
- Well-documented code
- Easy to debug

### ✅ Performant
- DOM element caching
- Efficient event handling
- Optimized animations

## Migration from Old System

### Before (Non-modular)
```javascript
// Hardcoded HTML string
export function createHCOTMCard() {
  return `<div>...hardcoded...</div>`;
}

// Event listeners scattered in script.js
document.querySelector('.project-card').addEventListener(...);
```

### After (Modular)
```javascript
// Clean, data-driven
new ProjectCard('container', projectData);
// Everything handled internally!
```

## Troubleshooting

### Card Not Appearing
- ✓ Check container ID matches in HTML and JS
- ✓ Verify data object has all required fields
- ✓ Check browser console for errors

### Video Not Playing
- ✓ Verify video path is correct
- ✓ Check video format (MP4/H.264 recommended)
- ✓ Ensure video is accessible (CORS)

### Styles Look Wrong
- ✓ Confirm `project-card.css` is loaded in HTML
- ✓ Check for CSS conflicts with other stylesheets
- ✓ Verify CSS order in `<head>`

### Expand/Collapse Issues
- ✓ Check container has proper height constraints
- ✓ Verify extra content has data
- ✓ Look for console errors

## Future Enhancements

Potential improvements:
- [ ] Lazy load videos for performance
- [ ] Add swipe gestures for mobile
- [ ] Implement card filtering/sorting
- [ ] Add animation customization per project
- [ ] Create card templates for different types
- [ ] Add loading states
- [ ] Implement error boundaries

## Example: Complete Implementation

```javascript
// projects-data.js
export const projectsData = {
  game1: {
    id: 'game1',
    title: 'Epic Adventure',
    video: 'assets/game1/video.mp4',
    image: 'assets/game1/image.jpg',
    logo: 'assets/game1/logo.svg',
    logoAlt: 'Epic Adventure',
    partnerLogos: [
      { src: 'assets/game1/studio.png', alt: 'Studio' }
    ],
    composers: 'You',
    description: ['Amazing game!'],
    releaseDate: '2024',
    platforms: 'All platforms'
  }
};

// script.js
import { ProjectCard } from './project-card.js';
import { projectsData } from './projects-data.js';

document.addEventListener('DOMContentLoaded', () => {
  new ProjectCard('card-container', projectsData.game1);
});
```

```html
<!-- index.html -->
<link rel="stylesheet" href="project-card.css" />
<script type="module" src="script.js"></script>

<section class="project-cards-block">
  <div class="project-cards-container" id="card-container"></div>
</section>
```

---

**That's it!** You now have a professional, modular card system. 🎉
