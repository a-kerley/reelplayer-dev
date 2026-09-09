// projects-data.js
// Central data store for all project cards

/**
 * Global configuration for all project cards
 */
export const projectConfig = {
  mouseLeaveDelay: 1000 // Time in milliseconds before card collapses after mouse leaves (default: 2000ms / 2 seconds)
};

export const projectsData = {
  hcotm: {
    id: 'hcotm',
    order: 1,
    title: 'Horizon Call of the Mountain',
    enableListenTab: true, // Set to false to disable listen tab, player, and listen button
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    listenImage: 'assets/projectcards/hcotm/ellen-shelley-12.webp', // Optional: Different image for listen tab
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Horizon Call of the Mountain',
    partnerLogos: [
      { src: 'assets/projectcards/hcotm/Firesprite_logo.webp', alt: 'Firesprite' },
      { src: 'assets/projectcards/hcotm/Guerrilla_logo.webp', alt: 'Guerrilla' },
      { src: 'assets/projectcards/hcotm/PlayStation_Studios_logo.webp', alt: 'PlayStation Studios' },
      { src: 'assets/projectcards/hcotm/PS5_PSVR_Icon.webp', alt: 'PlayStation 5 PlayStation VR2' }
    ],
    composers: 'Alistair Kerley & Frankie Harper',
    description: [
      'A PlayStation VR2 launch title set in the Horizon universe. Players take on the role of Ryas, a former Shadow Carja warrior who must investigate a new threat to the Sundom.',
      'Working with Guerrilla and Firesprite, we composed an adaptive score that responds dynamically to player actions and environments.'
    ],
    stats: [
      { label: 'Released', value: 'February 22, 2023' },
      { label: 'Platforms', value: 'PlayStation VR2' },
      { label: 'Genre', value: 'Action-Adventure VR' },
      { value: 'Launch Title' } // Stat without label (badge-style)
    ],
    links: [
      { url: 'https://spotify.com', icon: 'spotify.svg', alt: 'Listen on Spotify' },
      { url: 'https://music.apple.com', icon: 'apple-music.svg', alt: 'Listen on Apple Music' },
      { url: 'https://www.tidal.com', icon: 'tidal.svg', alt: 'Listen on Tidal' },
      { url: 'https://www.playstation.com/games/horizon-call-of-the-mountain/', icon: 'playstation.svg', alt: 'View on PlayStation' }
    ],
    audioTracks: [
      { 
        title: "Ryas' Theme", 
        file: "assets/audio/hcotm/Ryas' Theme.ogg",
        //backgroundImage: "assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp" // Example: Using existing image as custom background
      },
      { 
        title: "Freedom's Call", 
        file: "assets/audio/hcotm/Freedom's Call.ogg",
        backgroundImage: "assets/projectcards/hcotm/TJ Arena.webp" // Optional: Custom background for this track
      },
      { 
        title: "Red Eyes", 
        file: "assets/audio/hcotm/Red Eyes.ogg",
        backgroundImage: "assets/projectcards/hcotm/Watcher.webp" // Optional: Custom background for this track
      },
      { 
        title: "Ring of Fire", 
        file: "assets/audio/hcotm/Ring of Fire.ogg",
        backgroundImage: "assets/projectcards/hcotm/Fireclaw.webp" // Optional: Custom background for this track
      },
      { 
        title: "Step Into the Light", 
        file: "assets/audio/hcotm/Step Into the Light.ogg"
        // backgroundImage: "path/to/custom-background.webp" // Optional: Custom background for this track
      },
      { 
        title: "The Elders", 
        file: "assets/audio/hcotm/The Elders.ogg",
        backgroundImage: "assets/projectcards/hcotm/Thunderjaw.webp" // Optional: Custom background for this track
      }
    ],
    
    // Audio player color configuration
    audioPlayerColors: {
      // Waveform colors
      waveColor: 'rgba(255, 255, 255, 0.9)',
      progressColor: '#4a4a4a',
      
      // UI element colors
      iconColor: 'rgba(255, 255, 255, 0.95)',           // Play button, volume icon
      iconHoverColor: 'rgba(255, 255, 255, 1)',         // Icon hover state
      textColor: 'rgba(255, 255, 255, 0.8)',            // Time displays, playlist text
      
      // Volume slider colors
      sliderTrackColor: 'rgba(255, 255, 255, 0.3)',     // Volume slider track
      sliderThumbColor: 'rgba(255, 255, 255, 0.95)',    // Volume slider thumb
      
      // Playlist colors
      playlistHoverBg: 'rgba(0, 0, 0, 0.05)',           // Playlist item hover background
      playlistActiveBg: 'rgba(255, 255, 255, 0.1)',     // Active track background
      scrollbarColor: 'rgba(255, 255, 255, 0.3)',       // Scrollbar thumb
      
      // Loading spinner colors
      spinnerBorder: 'rgba(255, 255, 255, 0.2)',        // Spinner border
      spinnerBorderTop: 'rgba(255, 255, 255, 0.9)'      // Spinner animated border
    },
    
    // Card theme colors
    themeColors: {
      // Text colors
      textPrimary: '#ffffff',                           // Main text color
      textSecondary: 'rgba(255, 255, 255, 0.85)',       // Secondary text
      
      // Overlay gradients (gradientBottom shows on expand, gradientTop shows by default)
      gradientBottom: 'linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.832) 40%, rgba(0, 0, 0, 0) 100%)',
      gradientTop: 'linear-gradient(to top, rgba(0, 0, 0, 0.87) 0%, rgba(0, 0, 0, 0) 70%)',
      
      // Tab toggle colors
      tabToggleBg: 'rgba(0, 0, 0, 0.3)',                // Tab toggle background
      tabActiveBg: 'rgba(255, 255, 255, 0.1)',          // Active tab background
      
      // Icon filter (for coloring SVGs)
      iconFilter: 'brightness(0) invert(1)'             // Makes icons white
    }
  },

  // ============================================
  // PLACEHOLDER PROJECTS FOR TESTING LAYOUT
  // ============================================
  
  placeholder1: {
    id: 'placeholder-1',
    order: 2,
    title: 'Project Alpha',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Alpha',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  },

  placeholder2: {
    id: 'placeholder-2',
    order: 3,
    title: 'Project Beta',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Beta',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  },

  placeholder3: {
    id: 'placeholder-3',
    order: 4,
    title: 'Project Gamma',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Gamma',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  },

  placeholder4: {
    id: 'placeholder-4',
    order: 5,
    title: 'Project Delta',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Delta',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  },

  placeholder5: {
    id: 'placeholder-5',
    order: 6,
    title: 'Project Epsilon',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Epsilon',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  },

  placeholder6: {
    id: 'placeholder-6',
    order: 7,
    title: 'Project Zeta',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Zeta',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  },

  placeholder7: {
    id: 'placeholder-7',
    order: 8,
    title: 'Project Eta',
    enableListenTab: false,
    video: 'assets/projectcards/hcotm/hcotm_thumbvid_optimized_h264_origfps.mp4',
    image: 'assets/projectcards/hcotm/horizon-call-of-the-mountain-secondary-keyart-wallpaper-2400x1350.webp',
    logo: 'assets/projectcards/hcotm/hzn_com_logo_white_screen.svg',
    logoAlt: 'Project Eta',
    partnerLogos: [],
    composers: 'Placeholder Composer',
    description: [
      'This is a placeholder project card for testing the dynamic grid layout.',
      'Replace this data with real project information when ready.'
    ],
    stats: [
      { label: 'Status', value: 'Placeholder' },
      { value: 'Test Card' }
    ],
    links: []
  }
};
