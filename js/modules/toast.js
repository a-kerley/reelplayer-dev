// toast.js - Lightweight, auto-dismissing confirmation ("Copied!", etc.),
// replacing the close-dialog-then-alert() pattern previously used for
// anything that isn't worth interrupting the user for. Only one shown at a
// time - a second call replaces rather than stacks, since these are meant
// to be glanced at, not queued or read back later.
let toastEl = null;
let hideTimer = null;

export function showToast(message, duration = 2200) {
  if (toastEl) {
    clearTimeout(hideTimer);
    toastEl.remove();
    toastEl = null;
  }

  const el = document.createElement("div");
  el.className = "app-toast";
  el.textContent = message;
  document.body.appendChild(el);
  toastEl = el;

  // Force a layout flush so the browser registers the initial (no
  // .visible) state as a real frame before adding the class - otherwise
  // both states can land in the same frame and the transition never plays.
  void el.offsetWidth;
  el.classList.add("visible");

  hideTimer = setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => {
      el.remove();
      if (toastEl === el) toastEl = null;
    }, 200); // matches the CSS transition duration below
  }, duration);
}
