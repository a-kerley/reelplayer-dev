// validation.js - Input validation utilities

export class ValidationUtils {
  
  /**
   * Validates if a URL appears to be a valid audio file URL
   * @param {string} url - The URL to validate
   * @returns {boolean} - True if URL appears valid for audio
   */
  static isValidAudioUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const trimmed = url.trim();
    if (trimmed === '') return false;
    
    // Basic URL pattern check
    try {
      new URL(trimmed);
    } catch {
      return false;
    }
    
    // Check for common audio file extensions or known audio hosting patterns
    const audioExtensions = /\.(mp3|wav|ogg|m4a|aac|flac|webm)(\?.*)?$/i;
    const audioHosts = /(dropbox\.com|soundcloud\.com|drive\.google\.com)/i;
    
    return audioExtensions.test(trimmed) || audioHosts.test(trimmed);
  }

  /**
   * Validates if a URL appears to be a valid image file URL
   * @param {string} url - The URL to validate
   * @returns {boolean} - True if URL appears valid for images
   */
  static isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const trimmed = url.trim();
    if (trimmed === '') return true; // Allow empty for no background
    
    // Basic URL pattern check
    try {
      new URL(trimmed);
    } catch {
      return false;
    }
    
    // Check for common image file extensions or known image hosting patterns
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i;
    const imageHosts = /(unsplash\.com|imgur\.com|cloudinary\.com|amazonaws\.com)/i;
    
    return imageExtensions.test(trimmed) || imageHosts.test(trimmed);
  }

  /**
   * Validates if a URL appears to be a valid video file URL
   * @param {string} url - The URL to validate
   * @returns {boolean} - True if URL appears valid for videos
   */
  static isValidVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const trimmed = url.trim();
    if (trimmed === '') return true; // Allow empty for no video
    
    // Basic URL pattern check
    try {
      new URL(trimmed);
    } catch {
      return false;
    }
    
    // Check for common video file extensions or known video hosting patterns
    const videoExtensions = /\.(mp4|webm|mov|avi|mkv|m4v|ogv)(\?.*)?$/i;
    const videoHosts = /(youtube\.com|vimeo\.com|cloudinary\.com|amazonaws\.com|wistia\.com)/i;
    
    return videoExtensions.test(trimmed) || videoHosts.test(trimmed);
  }
  
  /**
   * Validates and sanitizes a color value
   * @param {string} color - The color value to validate
   * @returns {string|null} - Sanitized color value or null if invalid
   */
  static validateColor(color) {
    if (!color || typeof color !== 'string') return null;
    
    const trimmed = color.trim();
    
    // Check for hex colors
    if (/^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    
    // Check for rgba/rgb colors
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[0-9.]+\s*)?\)$/i.test(trimmed)) {
      return trimmed;
    }
    
    // Check for named colors (basic set)
    const namedColors = [
      'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
      'transparent', 'inherit', 'initial', 'unset'
    ];
    
    if (namedColors.includes(trimmed.toLowerCase())) {
      return trimmed.toLowerCase();
    }
    
    return null;
  }
  
  /**
   * Validates a reel title
   * @param {string} title - The title to validate
   * @returns {string} - Sanitized title
   */
  static validateTitle(title) {
    if (!title || typeof title !== 'string') return '';
    
    // Remove potentially dangerous characters and trim
    return title.trim()
      .replace(/[<>]/g, '') // Remove potential HTML
      .slice(0, 100); // Limit length
  }
  
  /**
   * Validates font size value
   * @param {string|number} size - Font size value
   * @returns {string|null} - Valid CSS font size or null
   */
  static validateFontSize(size) {
    if (!size) return null;
    
    const numericSize = parseInt(size, 10);
    if (isNaN(numericSize) || numericSize < 8 || numericSize > 72) {
      return null;
    }
    
    return (numericSize * 1.333).toFixed(1) + 'px';
  }
  
  /**
   * Validates padding value
   * @param {string|number} padding - Padding value
   * @returns {string|null} - Valid CSS padding or null
   */
  static validatePadding(padding) {
    if (!padding) return null;
    
    const numericPadding = parseInt(padding, 10);
    if (isNaN(numericPadding) || numericPadding < 0 || numericPadding > 100) {
      return null;
    }
    
    return numericPadding + 'px';
  }
  
  /**
   * Shows user-friendly validation feedback
   * @param {HTMLElement} element - The input element
   * @param {string} message - The validation message
   * @param {boolean} isValid - Whether the input is valid
   */
  static showValidationFeedback(element, message, isValid = false) {
    if (!element) return;
    
    // Remove existing feedback
    const existingFeedback = element.parentNode.querySelector('.validation-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }
    
    // Don't show anything for valid inputs
    if (isValid) {
      element.classList.remove('validation-error');
      return;
    }
    
    // Add error styling
    element.classList.add('validation-error');
    
    // Create feedback element
    const feedback = document.createElement('div');
    feedback.className = 'validation-feedback';
    feedback.textContent = message;
    feedback.style.cssText = `
      color: #dc3545;
      font-size: 0.875em;
      margin-top: 0.25rem;
      display: block;
    `;
    
    // Insert after the input
    element.parentNode.insertBefore(feedback, element.nextSibling);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
        element.classList.remove('validation-error');
      }
    }, 3000);
  }
}
