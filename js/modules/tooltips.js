// tooltips.js - Simple tooltip functionality

let tooltipEl = null;
let lastTarget = null;

export function initTooltips() {
  function showTooltip(e) {
    let target = e.target;
    while (target && target !== document.body && !target.hasAttribute("data-tooltip")) {
      target = target.parentElement;
    }
    if (!target || !target.hasAttribute("data-tooltip")) return;
    
    const text = target.getAttribute("data-tooltip");
    if (!text) return;
    
    // Remove existing tooltip
    if (tooltipEl) tooltipEl.remove();
    
    tooltipEl = document.createElement("div");
    tooltipEl.className = "custom-tooltip";
    tooltipEl.textContent = text;
    
    // Apply styles
    Object.assign(tooltipEl.style, {
      position: "absolute",
      zIndex: "10010",
      pointerEvents: "none",
      background: "#222",
      color: "#fff",
      fontSize: "0.9em",
      padding: "4px 10px",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
      opacity: "0.97",
      transition: "opacity 0.13s",
      whiteSpace: "nowrap"
    });
    
    document.body.appendChild(tooltipEl);
    
    // Position tooltip
    requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const ttRect = tooltipEl.getBoundingClientRect();
      let top = rect.top + window.scrollY - ttRect.height - 8;
      let left = rect.left + window.scrollX + rect.width / 2 - ttRect.width / 2;
      
      // Keep within viewport
      left = Math.max(4, Math.min(left, window.innerWidth - ttRect.width - 4));
      
      tooltipEl.style.left = left + "px";
      tooltipEl.style.top = top + "px";
    });
    
    lastTarget = target;
  }
  
  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
      lastTarget = null;
    }
  }
  
  // Event listeners
  document.addEventListener("mouseover", showTooltip, true);
  document.addEventListener("focusin", showTooltip, true);
  document.addEventListener("mouseout", hideTooltip, true);
  document.addEventListener("focusout", hideTooltip, true);
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("mousedown", hideTooltip, true);
}
