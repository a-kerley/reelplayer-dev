// mediaLibrary.js - Media Library tab content. Sidebar-tab switching itself
// is owned by js/modules/tabController.js (wired once in js/main.js); this
// module only renders the actual browsing UI when that tab becomes active.
import { renderMediaBrowser } from "./mediaBrowser.js";

export function renderMediaLibraryTab() {
  const mediaLibraryView = document.getElementById("mediaLibraryView");
  if (mediaLibraryView) renderMediaBrowser(mediaLibraryView, { mode: "manage" });
}
