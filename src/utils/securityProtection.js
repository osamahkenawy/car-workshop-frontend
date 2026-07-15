/**
 * Security Protection Utilities
 * These provide basic deterrents against casual users attempting to:
 * - Take screenshots
 * - Open DevTools/Inspect Element
 * - Copy sensitive content
 * 
 * NOTE: These are NOT foolproof and can be bypassed by determined users.
 * Real security should be implemented server-side.
 */

// Disable right-click context menu
export const disableRightClick = () => {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showSecurityWarning('Right-click is disabled for security purposes.');
    return false;
  });
};

// Disable common DevTools keyboard shortcuts
export const disableDevToolsShortcuts = () => {
  document.addEventListener('keydown', (e) => {
    // F12 - DevTools
    if (e.keyCode === 123) {
      e.preventDefault();
      showSecurityWarning('Developer tools are disabled.');
      return false;
    }
    
    // Ctrl+Shift+I - DevTools
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
      e.preventDefault();
      showSecurityWarning('Developer tools are disabled.');
      return false;
    }
    
    // Ctrl+Shift+J - Console
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
      e.preventDefault();
      showSecurityWarning('Developer tools are disabled.');
      return false;
    }
    
    // Ctrl+Shift+C - Inspect Element
    if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
      e.preventDefault();
      showSecurityWarning('Inspect element is disabled.');
      return false;
    }
    
    // Ctrl+U - View Source
    if (e.ctrlKey && e.keyCode === 85) {
      e.preventDefault();
      showSecurityWarning('View source is disabled.');
      return false;
    }
    
    // Cmd+Option+I - DevTools (Mac)
    if (e.metaKey && e.altKey && e.keyCode === 73) {
      e.preventDefault();
      showSecurityWarning('Developer tools are disabled.');
      return false;
    }
    
    // Cmd+Option+J - Console (Mac)
    if (e.metaKey && e.altKey && e.keyCode === 74) {
      e.preventDefault();
      showSecurityWarning('Developer tools are disabled.');
      return false;
    }
    
    // Cmd+Option+C - Inspect Element (Mac)
    if (e.metaKey && e.altKey && e.keyCode === 67) {
      e.preventDefault();
      showSecurityWarning('Inspect element is disabled.');
      return false;
    }
    
    // PrintScreen key (limited effectiveness)
    if (e.keyCode === 44) {
      showSecurityWarning('Screenshots are monitored for security purposes.');
    }
  });
};

// Detect if DevTools is open (not 100% reliable)
export const detectDevTools = (callback) => {
  const threshold = 160;
  let devToolsOpen = false;
  
  const checkDevTools = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    const orientation = widthThreshold ? 'vertical' : 'horizontal';
    
    if (!(heightThreshold && widthThreshold) &&
        ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) || 
         widthThreshold || heightThreshold)) {
      if (!devToolsOpen) {
        devToolsOpen = true;
        if (callback) callback(true, orientation);
        showSecurityWarning('Developer tools detected. Your activity is being monitored.');
      }
    } else {
      if (devToolsOpen) {
        devToolsOpen = false;
        if (callback) callback(false, orientation);
      }
    }
  };
  
  // Check every 500ms
  setInterval(checkDevTools, 500);
  
  // Alternative detection using console
  const element = new Image();
  Object.defineProperty(element, 'id', {
    get: function() {
      devToolsOpen = true;
      if (callback) callback(true);
      showSecurityWarning('Developer tools detected. Your activity is being monitored.');
    }
  });
  
  // Trigger the getter periodically
  setInterval(() => {
    console.clear();
    console.log(element);
  }, 1000);
};

// Disable text selection for sensitive content
export const disableTextSelection = (selector = 'body') => {
  const elements = document.querySelectorAll(selector);
  elements.forEach(element => {
    element.style.userSelect = 'none';
    element.style.webkitUserSelect = 'none';
    element.style.mozUserSelect = 'none';
    element.style.msUserSelect = 'none';
  });
};

// Disable copy and cut operations
export const disableCopyPaste = () => {
  document.addEventListener('copy', (e) => {
    e.preventDefault();
    showSecurityWarning('Copying is disabled for security purposes.');
    return false;
  });
  
  document.addEventListener('cut', (e) => {
    e.preventDefault();
    showSecurityWarning('Cutting is disabled for security purposes.');
    return false;
  });
};

// Show security warning message
let warningTimeout;
export const showSecurityWarning = (message) => {
  // Remove existing warning if any
  const existingWarning = document.getElementById('security-warning-overlay');
  if (existingWarning) {
    existingWarning.remove();
  }
  
  // Clear existing timeout
  if (warningTimeout) {
    clearTimeout(warningTimeout);
  }
  
  // Create warning overlay
  const overlay = document.createElement('div');
  overlay.id = 'security-warning-overlay';
  overlay.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff4757 0%, #ff6348 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(255, 71, 87, 0.4);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 320px;
      animation: slideIn 0.3s ease-out;
      border: 2px solid rgba(255, 255, 255, 0.3);
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
        <span>${message}</span>
      </div>
    </div>
  `;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(overlay);
  
  // Auto-remove after 3 seconds
  warningTimeout = setTimeout(() => {
    overlay.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => {
      overlay.remove();
    }, 300);
  }, 3000);
};

// Add watermark overlay
export const addWatermark = (text = 'CONFIDENTIAL') => {
  const watermark = document.createElement('div');
  watermark.id = 'security-watermark';
  watermark.textContent = text;
  watermark.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 120px;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.05);
    pointer-events: none;
    z-index: 999998;
    white-space: nowrap;
    user-select: none;
  `;
  
  document.body.appendChild(watermark);
};

// Initialize all protections
export const initializeSecurityProtections = (options = {}) => {
  const {
    disableRightClickMenu = true,
    disableKeyboardShortcuts = true,
    detectDevToolsOpen = true,
    disableSelection = false,
    disableCopyPasteOperations = false,
    showWatermark = false,
    watermarkText = 'CONFIDENTIAL',
    onDevToolsOpen = null
  } = options;
  
  if (disableRightClickMenu) {
    disableRightClick();
  }
  
  if (disableKeyboardShortcuts) {
    disableDevToolsShortcuts();
  }
  
  if (detectDevToolsOpen) {
    detectDevTools(onDevToolsOpen);
  }
  
  if (disableSelection) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        disableTextSelection();
      });
    } else {
      disableTextSelection();
    }
  }
  
  if (disableCopyPasteOperations) {
    disableCopyPaste();
  }
  
  if (showWatermark) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        addWatermark(watermarkText);
      });
    } else {
      addWatermark(watermarkText);
    }
  }
  
  console.clear();
  console.log('%c⚠️ SECURITY WARNING', 'color: red; font-size: 30px; font-weight: bold;');
  console.log('%cUnauthorized access to this application is prohibited.', 'font-size: 16px;');
  console.log('%cAll activities are monitored and logged.', 'font-size: 16px;');
};

export default {
  disableRightClick,
  disableDevToolsShortcuts,
  detectDevTools,
  disableTextSelection,
  disableCopyPaste,
  showSecurityWarning,
  addWatermark,
  initializeSecurityProtections
};


