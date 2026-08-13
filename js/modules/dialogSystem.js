// dialogSystem.js - Modern dialog system to replace browser alerts/confirms

export class DialogSystem {
  constructor() {
    this.activeDialog = null;
  }

  /**
   * Shows a confirmation dialog
   * @param {string} message - The message to display
   * @param {string} confirmText - Text for confirm button (default: "Confirm")
   * @param {string} cancelText - Text for cancel button (default: "Cancel")
   * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
   */
  confirm(message, confirmText = "Confirm", cancelText = "Cancel") {
    return new Promise((resolve) => {
      this.createDialog({
        type: 'confirm',
        message,
        buttons: [
          {
            text: cancelText,
            type: 'secondary',
            onClick: () => {
              this.closeDialog();
              resolve(false);
            }
          },
          {
            text: confirmText,
            type: 'danger',
            onClick: () => {
              this.closeDialog();
              resolve(true);
            }
          }
        ]
      });
    });
  }

  /**
   * Shows an alert dialog
   * @param {string} message - The message to display
   * @param {string} buttonText - Text for the button (default: "OK")
   * @returns {Promise<void>} - Resolves when the dialog is closed
   */
  alert(message, buttonText = "OK") {
    return new Promise((resolve) => {
      this.createDialog({
        type: 'alert',
        message,
        buttons: [
          {
            text: buttonText,
            type: 'primary',
            onClick: () => {
              this.closeDialog();
              resolve();
            }
          }
        ]
      });
    });
  }

  /**
   * Shows a single-line text-input dialog.
   * @param {string} message - The message/label to display
   * @param {string} defaultValue - Pre-filled input value
   * @returns {Promise<string|null>} - Resolves to the trimmed input, or null if cancelled/empty
   */
  prompt(message, defaultValue = "") {
    return new Promise((resolve) => {
      this.createDialog({
        type: "custom",
        message,
        content: `<input type="text" id="dialogPromptInput" value="${String(defaultValue).replace(/"/g, "&quot;")}"
          style="width:100%;padding:0.6em;border:1px solid #444;border-radius:4px;font-size:0.95rem;box-sizing:border-box;background:#1e1e1e;color:#fff;" />`,
        buttons: [
          { text: "Cancel", type: "secondary", onClick: () => { this.closeDialog(); resolve(null); } },
          {
            text: "OK",
            type: "primary",
            onClick: () => {
              const input = document.getElementById("dialogPromptInput");
              const value = input ? input.value.trim() : "";
              this.closeDialog();
              resolve(value || null);
            }
          }
        ]
      });
      setTimeout(() => {
        const input = document.getElementById("dialogPromptInput");
        if (input) { input.focus(); input.select(); }
      }, 150);
    });
  }

  /**
   * Creates and displays a dialog
   * @param {Object} config - Dialog configuration
   */
  createDialog(config) {
    // Close any existing dialog
    this.closeDialog();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
      color-scheme: dark;
    `;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog-box';
    dialog.style.cssText = `
      background: #2f2f2f;
      color: #ccc;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      max-width: ${config.maxWidth || '400px'};
      width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      animation: slideIn 0.2s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 24px;
      text-align: center;
    `;

    // Add icon based on type
    const icon = this.createIcon(config.type);
    if (icon) {
      content.appendChild(icon);
    }

    // Add message
    if (config.message) {
      const messageEl = document.createElement('p');
      messageEl.textContent = config.message;
      messageEl.style.cssText = `
        margin: ${icon ? '16px 0 24px 0' : '0 0 24px 0'};
        font-size: 16px;
        line-height: 1.5;
        color: #fff;
      `;
      content.appendChild(messageEl);
    }

    // Add custom content if provided
    if (config.content) {
      const customContent = document.createElement('div');
      customContent.innerHTML = config.content;
      customContent.style.cssText = `
        margin: 16px 0 24px 0;
        text-align: left;
      `;
      content.appendChild(customContent);
    }

    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    `;

    config.buttons.forEach(buttonConfig => {
      const button = this.createButton(buttonConfig);
      buttonContainer.appendChild(button);
    });

    content.appendChild(buttonContainer);
    dialog.appendChild(content);
    overlay.appendChild(dialog);

    // Add CSS animations
    this.addDialogStyles();

    // Add to document
    document.body.appendChild(overlay);
    this.activeDialog = overlay;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeDialog();
        // For confirm dialogs, treat overlay click as cancel
        if (config.type === 'confirm' && config.buttons[0]) {
          config.buttons[0].onClick();
        }
      }
    });

    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escapeHandler);
        this.closeDialog();
        // For confirm dialogs, treat escape as cancel
        if (config.type === 'confirm' && config.buttons[0]) {
          config.buttons[0].onClick();
        }
      }
    };
    document.addEventListener('keydown', escapeHandler);

    // Focus first button
    setTimeout(() => {
      const firstButton = buttonContainer.querySelector('button');
      if (firstButton) firstButton.focus();
    }, 100);
  }

  /**
   * Creates an icon for the dialog
   * @param {string} type - Dialog type
   * @returns {HTMLElement|null} - Icon element or null
   */
  createIcon(type) {
    if (type !== 'confirm') return null;

    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #fef3cd;
      color: #856404;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
      font-size: 24px;
    `;
    icon.innerHTML = '⚠️';
    return icon;
  }

  /**
   * Creates a button element
   * @param {Object} buttonConfig - Button configuration
   * @returns {HTMLElement} - Button element
   */
  createButton(buttonConfig) {
    const button = document.createElement('button');
    button.textContent = buttonConfig.text;
    button.type = 'button';

    const baseStyles = `
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      min-width: 80px;
    `;

    const typeStyles = {
      primary: `
        background: var(--builder-accent, #000);
        color: white;
      `,
      secondary: `
        background: #3a3a3a;
        color: #ccc;
        border: 1px solid #444;
      `,
      danger: `
        background: #dc3545;
        color: white;
      `
    };

    button.style.cssText = baseStyles + (typeStyles[buttonConfig.type] || typeStyles.primary);

    // Hover effects
    button.addEventListener('mouseenter', () => {
      if (buttonConfig.type === 'secondary') {
        button.style.background = '#4a4a4a';
        button.style.borderColor = '#555';
      } else if (buttonConfig.type === 'danger') {
        button.style.background = '#c82333';
      } else {
        button.style.background = '#5aa0f2';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (buttonConfig.type === 'secondary') {
        button.style.background = '#3a3a3a';
        button.style.borderColor = '#444';
      } else if (buttonConfig.type === 'danger') {
        button.style.background = '#dc3545';
      } else {
        button.style.background = 'var(--builder-accent, #000)';
      }
    });

    button.onclick = buttonConfig.onClick;
    return button;
  }

  /**
   * Adds CSS animations for dialogs
   */
  addDialogStyles() {
    if (document.querySelector('#dialog-styles')) return;

    const style = document.createElement('style');
    style.id = 'dialog-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideIn {
        from { 
          opacity: 0;
          transform: scale(0.9) translateY(-10px);
        }
        to { 
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      
      @keyframes slideOut {
        from { 
          opacity: 1;
          transform: scale(1) translateY(0);
        }
        to { 
          opacity: 0;
          transform: scale(0.9) translateY(-10px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Closes the active dialog
   */
  closeDialog() {
    if (!this.activeDialog) return;

    // Capture the specific overlay being closed, rather than relying on
    // this.activeDialog inside the timeout below - if a new dialog is opened
    // before this timeout fires (e.g. one dialog's button handler
    // immediately triggers another), this.activeDialog will have moved on to
    // point at that new overlay, and using it here would remove the wrong one.
    const overlayToClose = this.activeDialog;
    this.activeDialog = null;

    // Add exit animation
    overlayToClose.style.animation = 'fadeOut 0.15s ease-out';
    const dialogBox = overlayToClose.querySelector('.dialog-box');
    if (dialogBox) {
      dialogBox.style.animation = 'slideOut 0.15s ease-out';
    }

    // Remove after animation
    setTimeout(() => {
      if (overlayToClose.parentNode) {
        overlayToClose.parentNode.removeChild(overlayToClose);
      }
    }, 150);
  }
}

// Create global instance
export const dialog = new DialogSystem();
