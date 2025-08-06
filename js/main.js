// main.js
import { playerApp } from "./player.js";
import {
  loadPlaylistFromFile,
  convertDropboxLinkToDirect,
} from "./playlist.js";
import { renderSidebar, loadReels, saveReels } from "./sidebar.js";
import { renderBuilder, createEmptyReel } from "./builder.js";
import { PreviewManager } from "./modules/previewManager.js";
import { dialog } from "./modules/dialogSystem.js";
import { embedExporter } from "./modules/embedExporter.js";

document.addEventListener("DOMContentLoaded", async () => {
  // If the builder UI exists, use builder mode. Otherwise, use classic playlist.txt mode.
  const builderRoot = document.querySelector(".builder-app");
  if (builderRoot) {
    // --- Reel Builder SPA mode ---
    let reels = loadReels();
    let savedId = localStorage.getItem('currentReelId');

    // Make reels and saveReels globally accessible for blend mode controls
    window.reels = reels;
    window.saveReels = saveReels;

    // Initialize preview manager
    const previewManager = new PreviewManager();
    if (!previewManager.initialize("reelPlayerPreview")) {
      console.error("Failed to initialize preview manager");
      return;
    }

    let currentId = null;
    if (savedId && reels.some(r => r.id === savedId)) {
      currentId = savedId;
    } else if (reels.length) {
      currentId = reels[0].id;
    }

    if (!reels.length) {
      const first = createEmptyReel();
      reels.push(first);
      currentId = first.id;
      saveReels(reels);
    }

    function setCurrent(id) {
      currentId = id;
      localStorage.setItem('currentReelId', currentId);
      render();
    }

    function createNew() {
      const newReel = createEmptyReel();
      reels.push(newReel);
      currentId = newReel.id;
      saveReels(reels);
      render();
    }

    function handleDelete(id) {
      if (reels.length === 1) {
        dialog.alert("At least one reel must remain.", "OK");
        return;
      }
      const idx = reels.findIndex((r) => r.id === id);
      if (idx !== -1) {
        reels.splice(idx, 1);
        // If deleted reel was selected, select the next available one
        if (currentId === id) {
          currentId = reels.length ? reels[0].id : null;
        }
        saveReels(reels);
        render();
      }
    }

    function updateCurrentReel() {
      saveReels(reels);
      window.reels = reels; // Keep global reference updated
      renderSidebar(reels, currentId, setCurrent, createNew, handleDelete); // re-render sidebar with updated titles
      renderBuilder(reels.find(r => r.id === currentId), updateCurrentReel);
    }

    function render() {
      renderSidebar(reels, currentId, setCurrent, createNew, handleDelete);
      const current = reels.find((r) => r.id === currentId);
      renderBuilder(current, updateCurrentReel);
      setupRefreshPreviewButton();
      setupExportEmbedButton();
      // showPreview(); // preview is only refreshed via button now
      showPreview();
    }

    function setupRefreshPreviewButton() {
      const btn = document.getElementById('refreshPreviewBtn');
      if (btn) {
        btn.onclick = () => showPreview();
      }
    }

    function setupExportEmbedButton() {
      const btn = document.getElementById('exportEmbedBtn');
      if (btn) {
        btn.onclick = () => exportEmbedCode();
      }
    }

    function exportEmbedCode() {
      const current = reels.find((r) => r.id === currentId);
      if (!current) {
        dialog.alert("No reel selected for export.");
        return;
      }

      try {
        const embedHTML = embedExporter.generateEmbedCode(current);
        
        dialog.createDialog({
          type: 'custom',
          message: "Copy the code below and paste it into your Squarespace code block or website:",
          content: `<textarea readonly style="width: 100%; height: 300px; font-family: monospace; font-size: 12px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;">${embedHTML.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>`,
          buttons: [
            {
              text: "Copy to Clipboard",
              type: "primary",
              onClick: () => {
                navigator.clipboard.writeText(embedHTML).then(() => {
                  dialog.closeDialog();
                  setTimeout(() => {
                    dialog.alert("Embed code copied to clipboard!");
                  }, 200);
                }).catch(() => {
                  dialog.closeDialog();
                  setTimeout(() => {
                    dialog.alert("Failed to copy to clipboard. Please manually select and copy the code.");
                  }, 200);
                });
              }
            },
            {
              text: "Download as HTML",
              type: "secondary",
              onClick: () => {
                try {
                  const blob = new Blob([embedHTML], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(current.title || 'reel').replace(/[^a-zA-Z0-9]/g, '_')}_embed.html`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  dialog.closeDialog();
                } catch (error) {
                  console.error('Download failed:', error);
                  dialog.closeDialog();
                  setTimeout(() => {
                    dialog.alert("Download failed. Please try copying to clipboard instead.");
                  }, 200);
                }
              }
            },
            {
              text: "Close",
              type: "secondary",
              onClick: () => {
                dialog.closeDialog();
              }
            }
          ]
        });
      } catch (error) {
        dialog.alert(`Export Error: ${error.message}`);
      }
    }

    function showPreview() {
      const current = reels.find((r) => r.id === currentId);
      previewManager.showPreview(current, playerApp);
    }

    render();
  } else {
    // --- Classic playlist.txt mode ---
    // Load and render playlist
    const playlist = await loadPlaylistFromFile("playlist.txt");
    if (!playlist.length) return;
    playerApp.renderPlaylist(playlist);

    // Highlight first track as active on load
    const items = document.querySelectorAll(".playlist-item");
    if (items.length > 0) items[0].classList.add("active");

    const firstTrack = playlist[0];
    const convertedURL = convertDropboxLinkToDirect(firstTrack.url);
    playerApp.initializePlayer(convertedURL, firstTrack.title, 0);

    // Show track info for the first track on load
    const trackInfo = playerApp.elements.trackInfo;
    const fileName =
      firstTrack.title ||
      firstTrack.url
        .split("/")
        .pop()
        .split("?")[0]
        .replace(/[_-]/g, " ")
        .replace(/\.[^/.]+$/, "");
    if (trackInfo) {
      trackInfo.textContent = fileName;
      trackInfo.classList.add("visible");
    }
  }

  // --- Custom events ---
  document.addEventListener("track:change", (e) => {
    const { audioURL, title, index } = e.detail;
    const trackInfo = playerApp.elements.trackInfo;
    const fileName =
      title ||
      audioURL
        .split("/")
        .pop()
        .split("?")[0]
        .replace(/[_-]/g, " ")
        .replace(/\.[^/.]+$/, "");
    if (trackInfo) {
      trackInfo.textContent = fileName;
    }
    const items = document.querySelectorAll(".playlist-item");
    items.forEach((el) => el.classList.remove("active"));
    if (typeof index === "number") {
      const activeItem = document.querySelector(
        `.playlist-item[data-index="${index}"]`
      );
      if (activeItem) activeItem.classList.add("active");
    }
  });

  document.addEventListener("volume:mute", () => {
    const volumeToggle = playerApp.elements.volumeToggle;
    const volumeIconMuted = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
    </svg>
    `;
    if (volumeToggle) volumeToggle.innerHTML = volumeIconMuted;
  });

  document.addEventListener("volume:unmute", () => {
    const volumeToggle = playerApp.elements.volumeToggle;
    const volumeIconLoud = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
        <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
    </svg>
    `;
    if (volumeToggle) volumeToggle.innerHTML = volumeIconLoud;
  });

  document.addEventListener("playback:play", () => {
    const playPauseBtn = playerApp.elements.playPauseBtn;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z" clip-rule="evenodd" />
        </svg>
      `;
    }
  });

  document.addEventListener("playback:pause", () => {
    const playPauseBtn = playerApp.elements.playPauseBtn;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd" />
        </svg>
      `;
    }
  });

  document.addEventListener("playback:play", () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = "1";
  });
  document.addEventListener("playback:pause", () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = "0";
  });
  document.addEventListener("playback:finish", () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = "0";
  });

// Keyboard shortcut for play/pause (space), except when in input/textarea
document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  const isTyping =
    active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable
    );
  if (!isTyping && (e.code === "Space" || e.key === " ")) {
    e.preventDefault();
    if (playerApp.wavesurfer && playerApp.isWaveformReady) {
      playerApp.wavesurfer.playPause();
    }
  }
});
});
