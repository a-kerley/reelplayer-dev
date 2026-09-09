// project-card.js
// Modular, reusable project card component

import { AudioPlayer } from './AudioPlayer.js';
import { projectConfig } from './projects-data.js';

/**
 * Animation timing constants
 */
const ANIMATION_TIMINGS = {
  VIDEO_FADE_OUT: 150,        // Video fade during expand (slightly longer for smoothness)
  EXPAND_DELAY: 60,            // Delay before height animation
  COLLAPSE_CLEANUP: 600,       // Cleanup after collapse (longer for staggered exits)
  COLLAPSE_TRANSITION: 450,    // Collapse animation duration
  EXTRA_CONTENT_BUFFER: 300,   // Extra space for expanded content
  MOUSE_LEAVE_DELAY: 2000,     // Delay before collapsing after mouse leave (2 seconds)
  PLAYER_CONTROLS_HEIGHT: 120  // Approximate height of waveform and audio controls
};

/**
 * ProjectCard - Encapsulated project card component
 * Handles rendering, animations, and user interactions
 */
export class ProjectCard {
  constructor(containerId, projectData) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }
    
    // Validate required project data fields
    const requiredFields = ['id', 'title', 'video', 'image', 'logo'];
    const missingFields = requiredFields.filter(field => !projectData[field]);
    if (missingFields.length > 0) {
      console.error(`ProjectCard: Missing required fields: ${missingFields.join(', ')}`);
      return;
    }
    
    this.data = projectData;
    this.card = null;
    this.video = null;
    this.expandBtn = null;
    this.isExpanded = false;
    this.audioPlayer = null;
    this.collapseTimeout = null;
    
    this.init();
  }
  
  /**
   * Initialize the card - render and attach event listeners
   */
  init() {
    this.render();
    this.cacheElements();
    this.attachEventListeners();
    this.preloadVideo();
  }
  
  /**
   * Cache DOM elements for better performance
   */
  cacheElements() {
    this.card = this.container.querySelector('.project-card');
    this.video = this.card?.querySelector('.project-card-video');
    this.expandBtn = this.card?.querySelector('.expand-icon');
    this.infoBtn = this.card?.querySelector('.info-btn');
    this.listenBtn = this.card?.querySelector('.listen-btn');
    this.extraContent = this.card?.querySelector('.project-card-extra');
  }
  
  /**
   * Render the card HTML
   */
  render() {
    this.container.innerHTML = this.template();
  }
  
  /**
   * Generate the card HTML template
   */
  template() {
    return `
      <div class="project-card" data-project-id="${this.data.id}">
        <div class="project-card-main">
          <video
            class="project-card-video"
            src="${this.data.video}"
            muted
            loop
            playsinline
            preload="auto"
          ></video>
          <img
            src="${this.data.image}"
            alt="${this.data.title}"
            class="project-card-image project-card-image-info"
          />
          ${this.data.listenImage ? `
          <img
            src="${this.data.listenImage}"
            alt="${this.data.title} - Listen"
            class="project-card-image project-card-image-listen"
          />
          ` : ''}
          ${this.renderTrackBackgroundImages()}
          <img
            src="${this.data.logo}"
            alt="${this.data.logoAlt || this.data.title}"
            class="project-card-logo"
          />
          <div class="project-card-hover-text" data-composers="Music by ${this.data.composers || 'Unknown'}">
            <div class="hover-logos">
              ${this.renderPartnerLogos()}
            </div>
          </div>
          <button class="expand-icon info-btn" aria-label="Show more">
            <span class="expand-icon-label">Info</span>
          </button>
          ${this.data.enableListenTab !== false ? `
          <button class="expand-icon listen-btn" aria-label="Listen">
            <span class="expand-icon-label">Listen</span>
          </button>
          ` : ''}
        </div>
        <div class="project-card-spacer"></div>
        <div class="project-card-extra">
          ${this.renderExtraContent()}
        </div>
      </div>
    `;
  }
  
  /**
   * Render partner logos
   */
  renderPartnerLogos() {
    return this.data.partnerLogos
      .map(logo => `<img src="${logo.src}" alt="${logo.alt}" />`)
      .join('');
  }

  /**
   * Render track-specific background images
   */
  renderTrackBackgroundImages() {
    if (!this.data.audioTracks || this.data.audioTracks.length === 0) {
      return '';
    }

    return this.data.audioTracks
      .map((track, index) => {
        if (track.backgroundImage) {
          return `
          <img
            src="${track.backgroundImage}"
            alt="${track.title} - Background"
            class="project-card-image track-background-image"
            data-track-index="${index}"
          />
          `;
        }
        return '';
      })
      .join('');
  }
  
  /**
   * Render expanded content section
   */
  renderExtraContent() {
    const descriptions = this.data.description
      .map(para => `<p>${para}</p>`)
      .join('');
    
    const hasListenTab = this.data.enableListenTab !== false;
    
    return `
      ${hasListenTab ? `
      <div class="tab-toggle">
        <button class="tab-btn active" data-tab="info">
          <img class="tab-icon-outline" src="assets/icons/tab-info-icon.svg" alt="Info" />
          <img class="tab-icon-filled" src="assets/icons/tab-info-icon-filled.svg" alt="Info" />
        </button>
        <button class="tab-btn" data-tab="listen">
          <img class="tab-icon-outline" src="assets/icons/tab-listen-icon.svg" alt="Listen" />
          <img class="tab-icon-filled" src="assets/icons/tab-listen-icon-filled.svg" alt="Listen" />
        </button>
      </div>
      ` : ''}
      
      <div class="tab-content active" data-tab-content="info">
        <h3>${this.data.title}</h3>
        ${descriptions}
        <div class="extra-stats">
          ${this.renderStats()}
        </div>
        ${this.renderLinks()}
      </div>
      
      ${hasListenTab ? `
      <div class="tab-content" data-tab-content="listen">
        <div class="reel-player" id="reel-player-${this.data.id}">
          <div class="loading-indicator">
            <div class="spinner"></div>
          </div>
          
          <div class="track-info"></div>
          
          <div class="waveform-section">
            <button class="play-pause-btn" aria-label="Play/Pause">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="play-icon">
                <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd"/>
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="pause-icon" style="display: none;">
                <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd"/>
              </svg>
            </button>
            
            <div class="waveform-wrapper">
              <div id="waveform-${this.data.id}"></div>
              <div class="hover-overlay"></div>
              <div class="hover-time"></div>
              <div class="playhead-time"></div>
              <div class="total-time"></div>
            </div>
            
            <div class="volume-control">
              <button class="volume-toggle" aria-label="Volume">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="volume-loud">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                  <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="volume-muted" style="display: none;">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
                </svg>
              </button>
              <input type="range" min="0" max="100" value="100" class="volume-slider" orient="vertical" aria-label="Volume Slider">
            </div>
          </div>
          
          ${this.renderPlaylist()}
        </div>
      </div>
      ` : ''}
    `;
  }
  
  /**
   * Render stats badges dynamically
   */
  renderStats() {
    if (!this.data.stats || this.data.stats.length === 0) return '';
    
    return this.data.stats
      .map(stat => {
        if (stat.label) {
          return `<div><strong>${stat.label}</strong>${stat.value}</div>`;
        } else {
          // Badge-style stat without label
          return `<div>${stat.value}</div>`;
        }
      })
      .join('');
  }
  
  /**
   * Render links section
   */
  renderLinks() {
    if (!this.data.links || this.data.links.length === 0) return '';
    
    const linksHtml = this.data.links
      .map(link => `
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="extra-link" aria-label="${link.alt || 'External link'}">
          <img src="assets/link_icons/${link.icon}" alt="${link.alt || ''}" class="link-icon-svg" />
        </a>
      `)
      .join('');
    
    return `
      <div class="extra-links">
        ${linksHtml}
      </div>
    `;
  }
  
  /**
   * Render playlist
   */
  renderPlaylist() {
    if (!this.data.audioTracks || this.data.audioTracks.length === 0) return '';
    
    const items = this.data.audioTracks
      .map((track, index) => `
        <div class="playlist-item ${index === 0 ? 'active' : ''}" data-track-index="${index}">
          <span class="playlist-title">${track.title}</span>
          <span class="playlist-duration" data-duration="${index}">--:--</span>
        </div>
      `)
      .join('');
    
    return `
      <div class="playlist">
        ${items}
      </div>
    `;
  }
  
  /**
   * Attach all event listeners
   */
  attachEventListeners() {
    if (!this.card) return;
    
    this.card.addEventListener('mouseenter', () => this.handleMouseEnter());
    this.card.addEventListener('mouseleave', () => this.handleMouseLeave());
    
    // Click anywhere on closed card to expand
    this.card.addEventListener('click', (e) => {
      // Only expand if card is not already expanded
      if (!this.isExpanded) {
        this.expand();
      }
    });
    
    if (this.infoBtn) {
      this.infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Always expand and switch to info tab
        if (!this.isExpanded) {
          this.expand();
        }
        this.switchTab('info');
      });
    }
    
    if (this.listenBtn) {
      this.listenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Always expand and switch to listen tab
        if (!this.isExpanded) {
          this.expand();
        }
        this.switchTab('listen');
      });
    }
    
    // Tab switching
    const tabButtons = this.card.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchTab(btn.dataset.tab);
      });
    });
  }
  
  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    if (!this.card) return;
    
    // Get info tab height before switching
    const infoTab = this.card.querySelector('[data-tab-content="info"]');
    const listenTab = this.card.querySelector('[data-tab-content="listen"]');
    let infoTabHeight = 0;
    
    if (infoTab) {
      // Temporarily show info tab to measure its height
      const wasActive = infoTab.classList.contains('active');
      if (!wasActive) {
        infoTab.style.display = 'block';
        infoTab.style.visibility = 'hidden';
      }
      infoTabHeight = infoTab.scrollHeight;
      if (!wasActive) {
        infoTab.style.display = '';
        infoTab.style.visibility = '';
      }
    }
    
    // Update button states
    const tabButtons = this.card.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Update content visibility
    const tabContents = this.card.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      if (content.dataset.tabContent === tabName) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
    
    // Set both tabs to have consistent height and enable playlist scrolling
    if (infoTabHeight > 0) {
      // Set both tabs to the same minimum height to prevent size changes
      if (infoTab) {
        infoTab.style.minHeight = `${infoTabHeight}px`;
      }
      if (listenTab) {
        listenTab.style.minHeight = `${infoTabHeight}px`;
        const playlist = listenTab.querySelector('.playlist');
        if (playlist) {
          // Calculate available height for playlist (info height - player controls height)
          const playlistMaxHeight = infoTabHeight - ANIMATION_TIMINGS.PLAYER_CONTROLS_HEIGHT;
          playlist.style.maxHeight = `${playlistMaxHeight}px`;
        }
      }
    }
    
    // Handle background image crossfade
    if (this.data.listenImage) {
      const infoImage = this.card.querySelector('.project-card-image-info');
      const listenImage = this.card.querySelector('.project-card-image-listen');
      
      if (infoImage && listenImage) {
        if (tabName === 'listen') {
          infoImage.classList.remove('active');
          listenImage.classList.add('active');
        } else {
          infoImage.classList.add('active');
          listenImage.classList.remove('active');
        }
      }
    }
    
    // Initialize AudioPlayer when switching to listen tab
    if (tabName === 'listen' && !this.audioPlayer && this.data.audioTracks && this.data.enableListenTab !== false) {
      setTimeout(() => this.initAudioPlayer(), 100);
    }
  }
  
  /**
   * Initialize AudioPlayer
   */
  initAudioPlayer() {
    // Skip if listen tab is disabled
    if (this.data.enableListenTab === false) {
      return;
    }
    
    const playerContainer = this.card.querySelector(`#reel-player-${this.data.id}`);
    if (!playerContainer) {
      console.error('Audio player container not found');
      return;
    }
    
    // Use colors from project data or fallback to defaults
    const colors = this.data.audioPlayerColors || {};
    
    this.audioPlayer = new AudioPlayer(playerContainer, this.data.audioTracks, {
      // Waveform colors
      waveColor: colors.waveColor || 'rgba(255, 255, 255, 0.9)',
      progressColor: colors.progressColor || '#4a4a4a',
      
      // UI colors
      iconColor: colors.iconColor,
      iconHoverColor: colors.iconHoverColor,
      textColor: colors.textColor,
      
      // Volume slider colors
      sliderTrackColor: colors.sliderTrackColor,
      sliderThumbColor: colors.sliderThumbColor,
      
      // Playlist colors
      playlistHoverBg: colors.playlistHoverBg,
      playlistActiveBg: colors.playlistActiveBg,
      scrollbarColor: colors.scrollbarColor,
      
      // Loading spinner colors
      spinnerBorder: colors.spinnerBorder,
      spinnerBorderTop: colors.spinnerBorderTop,
      
      // Background image
      fallbackBackgroundImage: this.data.listenImage || this.data.image,
      
      height: 80
    });
    
    // Apply card theme colors
    this.applyThemeColors();
  }
  
  /**
   * Apply theme colors to card elements
   */
  applyThemeColors() {
    if (!this.data.themeColors) return;
    
    const theme = this.data.themeColors;
    
    // Apply CSS variables for theme colors
    if (theme.textPrimary) {
      this.card.style.setProperty('--card-text-primary', theme.textPrimary);
    }
    if (theme.textSecondary) {
      this.card.style.setProperty('--card-text-secondary', theme.textSecondary);
    }
    if (theme.gradientBottom) {
      this.card.style.setProperty('--card-gradient-bottom', theme.gradientBottom);
    }
    if (theme.gradientTop) {
      this.card.style.setProperty('--card-gradient-top', theme.gradientTop);
    }
    if (theme.tabToggleBg) {
      this.card.style.setProperty('--card-tab-toggle-bg', theme.tabToggleBg);
    }
    if (theme.tabActiveBg) {
      this.card.style.setProperty('--card-tab-active-bg', theme.tabActiveBg);
    }
    if (theme.iconFilter) {
      this.card.style.setProperty('--card-icon-filter', theme.iconFilter);
    }
  }
  
  /**
   * Handle mouse enter - play video
   */
  handleMouseEnter() {
    // Clear any pending collapse timeout
    if (this.collapseTimeout) {
      clearTimeout(this.collapseTimeout);
      this.collapseTimeout = null;
    }
    
    if (this.video) {
      this.video.play().catch(e => console.log('Video play failed:', e));
    }
    
    if (this.isExpanded) {
      this.card.classList.add('expanded-hovered');
    }
  }
  
  /**
   * Handle mouse leave - pause video and auto-collapse if expanded (with delay)
   */
  handleMouseLeave() {
    if (this.video) {
      this.video.pause();
    }
    
    this.card.classList.remove('expanded-hovered');
    
    // Auto-collapse when mouse leaves (with delay from project data, global config, or default)
    if (this.isExpanded) {
      const delay = this.data.mouseLeaveDelay || projectConfig.mouseLeaveDelay || ANIMATION_TIMINGS.MOUSE_LEAVE_DELAY;
      this.collapseTimeout = setTimeout(() => {
        this.collapse();
        this.collapseTimeout = null;
      }, delay);
    }
  }
  
  /**
   * Toggle expand/collapse state
   */
  toggleExpand() {
    if (this.isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }
  
  /**
   * Expand the card to show extra content
   */
  expand() {
    if (this.isExpanded || !this.card || !this.extraContent) return;
    
    // First fade out the video
    this.card.classList.add('video-fading-out');
    
    // Wait for video to fade out before expanding
    setTimeout(() => {
      // Remove the fading class and start expansion immediately
      this.card.classList.remove('video-fading-out');
      this.card.classList.add('expanded');
      this.isExpanded = true;
    }, ANIMATION_TIMINGS.VIDEO_FADE_OUT);
  }
  
  /**
   * Collapse the card to hide extra content
   */
  collapse() {
    if (!this.isExpanded || !this.card || !this.extraContent) return;
    
    // Pause audio playback when collapsing
    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }
    
    // Hide all track background images and switch back to main card image
    const trackBackgrounds = this.card.querySelectorAll('.track-background-image');
    trackBackgrounds.forEach(bg => {
      bg.classList.remove('active');
    });
    
    // Switch back to info image when collapsing
    const infoImage = this.card.querySelector('.project-card-image-info');
    const listenImage = this.card.querySelector('.project-card-image-listen');
    
    if (infoImage) {
      infoImage.classList.add('active');
    }
    
    if (listenImage) {
      listenImage.classList.remove('active');
    }
    
    // Add collapsing class for animation
    this.card.classList.add('collapsing');
    
    // Wait for collapse animations to complete, then remove expanded class
    setTimeout(() => {
      this.card.classList.remove('expanded');
      this.isExpanded = false;
      
      // Remove collapsing class after max-height transition completes
      // The card will stay at translateY(-5px) due to .collapsing !important
      setTimeout(() => {
        this.card.classList.remove('collapsing');
        // The base transition will smoothly animate transform back to 0
      }, ANIMATION_TIMINGS.COLLAPSE_CLEANUP);
    }, ANIMATION_TIMINGS.COLLAPSE_TRANSITION);
  }
  
  /**
   * Preload video for smoother first play
   */
  preloadVideo() {
    if (this.video) {
      this.video.load();
    }
  }
  
  /**
   * Cleanup method - call when removing card
   */
  destroy() {
    // Cleanup AudioPlayer
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }
    
    // Remove event listeners and cleanup
    if (this.card) {
      this.card.remove();
    }
    this.card = null;
    this.video = null;
    this.expandBtn = null;
    this.extraContent = null;
  }
}

