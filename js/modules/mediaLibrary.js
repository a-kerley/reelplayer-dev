// mediaLibrary.js - "Media Library" tab: owns the sidebar-tab toggle wiring;
// the actual browsing/upload/organize UI is the shared mediaBrowser component.
import { renderMediaBrowser } from "./mediaBrowser.js";

export function setupMediaLibraryTab() {
  const tabReelsBtn = document.getElementById("tabReelsBtn");
  const tabMediaBtn = document.getElementById("tabMediaBtn");
  const reelsPanel = document.getElementById("reelsPanel");
  const reelBuilderView = document.getElementById("reelBuilderView");
  const mediaLibraryView = document.getElementById("mediaLibraryView");
  const builderMain = document.querySelector(".builder-main");

  if (!tabReelsBtn || !tabMediaBtn) return;

  tabReelsBtn.onclick = () => {
    tabReelsBtn.classList.add("active");
    tabMediaBtn.classList.remove("active");
    reelsPanel.style.display = "";
    reelBuilderView.style.display = "";
    mediaLibraryView.style.display = "none";
    builderMain.classList.remove("media-library-active");
  };

  tabMediaBtn.onclick = () => {
    tabMediaBtn.classList.add("active");
    tabReelsBtn.classList.remove("active");
    reelsPanel.style.display = "none";
    reelBuilderView.style.display = "none";
    mediaLibraryView.style.display = "";
    builderMain.classList.add("media-library-active");
    renderMediaBrowser(mediaLibraryView, { mode: "manage" });
  };
}
