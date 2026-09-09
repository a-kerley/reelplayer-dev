// masonry-layout.js
// Handles masonry-style layout where expanded cards only push down cards in their column

export class MasonryLayout {
  constructor(containerSelector, itemSelector, options = {}) {
    this.container = document.querySelector(containerSelector);
    this.itemSelector = itemSelector;
    this.options = {
      gap: options.gap || 20,
      columns: options.columns || this.getColumnCount(),
      transitionDuration: options.transitionDuration || 500,
      ...options
    };
    
    this.items = [];
    this.columnHeights = [];
    this.resizeTimeout = null;
    
    if (this.container) {
      this.init();
    }
  }
  
  /**
   * Initialize the masonry layout
   */
  init() {
    this.cacheItems();
    this.bindEvents();
    this.layout();
  }
  
  /**
   * Cache all card wrapper elements
   */
  cacheItems() {
    this.items = Array.from(this.container.querySelectorAll(this.itemSelector));
  }
  
  /**
   * Bind resize and mutation events
   */
  bindEvents() {
    // Debounced resize handler
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        const newColumnCount = this.getColumnCount();
        if (newColumnCount !== this.options.columns) {
          this.options.columns = newColumnCount;
        }
        this.layout();
      }, 100);
    });
    
    // Track the last layout state to avoid redundant calculations
    this.lastLayoutState = null;
    
    // Watch for card expansions/collapses
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList.contains('project-card')) {
            const isExpanded = target.classList.contains('expanded');
            const isCollapsing = target.classList.contains('collapsing');
            const isVideoFading = target.classList.contains('video-fading-out');
            
            // Skip layout during video fade - wait for actual expansion
            if (isVideoFading) {
              return;
            }
            
            // Create a state key to avoid duplicate layouts
            const stateKey = `${isExpanded}-${isCollapsing}`;
            if (this.lastLayoutState === stateKey) {
              return; // Skip if same state as last layout
            }
            this.lastLayoutState = stateKey;
            
            if (isExpanded && !isCollapsing) {
              // Card just expanded - immediately calculate new positions with expanded height
              requestAnimationFrame(() => {
                this.layoutWithExpandedCard(target);
              });
            } else if (isCollapsing) {
              // Collapse started - immediately start moving other cards back
              // Calculate positions using collapsed height for this card
              requestAnimationFrame(() => {
                this.layoutWithCollapsingCard(target);
              });
            }
            // Don't do anything when both classes are removed - 
            // layoutWithCollapsingCard already set the correct positions
          }
        }
      });
    });
    
    // Observe all cards for class changes
    this.items.forEach(item => {
      const card = item.querySelector('.project-card');
      if (card) {
        this.observer.observe(card, { attributes: true, attributeFilter: ['class'] });
      }
    });
  }
  
  /**
   * Layout with special handling for an expanding card
   * Calculates the expanded height before CSS transition completes
   */
  layoutWithExpandedCard(expandingCard) {
    if (!this.container || this.items.length === 0) return;
    
    const columns = this.getColumnCount();
    const gap = this.getGap();
    
    // Skip absolute positioning on mobile (single column)
    if (columns === 1) {
      this.container.style.height = 'auto';
      return;
    }
    
    const containerWidth = this.container.offsetWidth;
    const maxCardWidth = 500;
    const availableWidth = containerWidth - (gap * (columns - 1));
    const columnWidth = Math.min(availableWidth / columns, maxCardWidth);
    const totalGridWidth = (columnWidth * columns) + (gap * (columns - 1));
    const offsetX = (containerWidth - totalGridWidth) / 2;
    
    // Reset column heights
    this.columnHeights = new Array(columns).fill(0);
    
    // Position each item
    this.items.forEach((item, index) => {
      const column = index % columns;
      const card = item.querySelector('.project-card');
      
      let itemHeight;
      
      if (card === expandingCard) {
        // For the expanding card, get its scrollHeight (full expanded height)
        // or calculate based on the expanded content
        const extraContent = card.querySelector('.project-card-extra');
        const mainHeight = 312; // Base card height
        
        if (extraContent) {
          // Temporarily make extra content visible to measure
          const originalMaxHeight = extraContent.style.maxHeight;
          extraContent.style.maxHeight = '1000px';
          itemHeight = mainHeight + extraContent.scrollHeight;
          extraContent.style.maxHeight = originalMaxHeight;
        } else {
          itemHeight = card.scrollHeight || card.offsetHeight;
        }
      } else {
        itemHeight = card ? card.offsetHeight : item.offsetHeight;
      }
      
      const x = offsetX + (column * (columnWidth + gap));
      const y = this.columnHeights[column];
      
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      item.style.width = `${columnWidth}px`;
      
      this.columnHeights[column] = y + itemHeight + gap;
    });
    
    const maxHeight = Math.max(...this.columnHeights);
    this.container.style.height = `${maxHeight}px`;
  }
  
  /**
   * Layout with special handling for a collapsing card
   * Uses the collapsed height (312px) even though card is still visually expanded
   * This allows other cards to start moving while collapse animation plays
   */
  layoutWithCollapsingCard(collapsingCard) {
    if (!this.container || this.items.length === 0) return;
    
    const columns = this.getColumnCount();
    const gap = this.getGap();
    
    // Skip absolute positioning on mobile (single column)
    if (columns === 1) {
      this.container.style.height = 'auto';
      return;
    }
    
    const containerWidth = this.container.offsetWidth;
    const maxCardWidth = 500;
    const availableWidth = containerWidth - (gap * (columns - 1));
    const columnWidth = Math.min(availableWidth / columns, maxCardWidth);
    const totalGridWidth = (columnWidth * columns) + (gap * (columns - 1));
    const offsetX = (containerWidth - totalGridWidth) / 2;
    const collapsedHeight = 312; // Target collapsed height
    
    // Reset column heights
    this.columnHeights = new Array(columns).fill(0);
    
    // Position each item
    this.items.forEach((item, index) => {
      const column = index % columns;
      const card = item.querySelector('.project-card');
      
      let itemHeight;
      
      if (card === collapsingCard) {
        // For the collapsing card, use the target collapsed height
        itemHeight = collapsedHeight;
      } else if (card && card.classList.contains('expanded')) {
        // Another card is expanded - use its actual height
        itemHeight = card.offsetHeight;
      } else {
        // For all other collapsed cards, use the standard collapsed height
        // This ensures consistent alignment regardless of measurement timing
        itemHeight = collapsedHeight;
      }
      
      const x = offsetX + (column * (columnWidth + gap));
      const y = this.columnHeights[column];
      
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      item.style.width = `${columnWidth}px`;
      
      this.columnHeights[column] = y + itemHeight + gap;
    });
    
    const maxHeight = Math.max(...this.columnHeights);
    this.container.style.height = `${maxHeight}px`;
  }
  
  /**
   * Get number of columns based on viewport width
   */
  getColumnCount() {
    const width = window.innerWidth;
    if (width >= 1200) return 3;
    if (width >= 900) return 2;
    return 1;
  }
  
  /**
   * Get gap size based on viewport
   */
  getGap() {
    const width = window.innerWidth;
    if (width >= 1200) return 40; // 2.5rem
    return window.innerWidth * 0.025; // 2.5vw
  }
  
  /**
   * Calculate and apply positions to all items
   */
  layout() {
    if (!this.container || this.items.length === 0) return;
    
    const columns = this.getColumnCount();
    const gap = this.getGap();
    
    // Skip absolute positioning on mobile (single column)
    if (columns === 1) {
      this.container.style.height = 'auto';
      return;
    }
    
    const containerWidth = this.container.offsetWidth;
    const maxCardWidth = 500; // Max width per card
    
    // Calculate actual column width (capped at maxCardWidth)
    const availableWidth = containerWidth - (gap * (columns - 1));
    const columnWidth = Math.min(availableWidth / columns, maxCardWidth);
    
    // Calculate total grid width and offset to center it
    const totalGridWidth = (columnWidth * columns) + (gap * (columns - 1));
    const offsetX = (containerWidth - totalGridWidth) / 2;
    
    // Reset column heights
    this.columnHeights = new Array(columns).fill(0);
    
    const collapsedHeight = 312; // Standard collapsed card height
    
    // Position each item
    this.items.forEach((item, index) => {
      // Determine which column this item belongs to (left-to-right order)
      const column = index % columns;
      
      // Get the height of the card
      const card = item.querySelector('.project-card');
      let itemHeight;
      
      if (card && card.classList.contains('expanded')) {
        // Expanded card - use actual height
        itemHeight = card.offsetHeight;
      } else {
        // Collapsed cards use standard height for consistent alignment
        itemHeight = collapsedHeight;
      }
      
      // Calculate position (with centering offset)
      const x = offsetX + (column * (columnWidth + gap));
      const y = this.columnHeights[column];
      
      // Apply position
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      item.style.width = `${columnWidth}px`;
      
      // Update column height
      this.columnHeights[column] = y + itemHeight + gap;
    });
    
    // Set container height to tallest column
    const maxHeight = Math.max(...this.columnHeights);
    this.container.style.height = `${maxHeight}px`;
  }
  
  /**
   * Force a layout recalculation
   */
  refresh() {
    this.cacheItems();
    this.layout();
  }
  
  /**
   * Clean up observers and event listeners
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    window.removeEventListener('resize', this.handleResize);
  }
}
