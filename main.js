// main.js
import { playerApp } from './player.js';
import { loadPlaylistFromFile, convertDropboxLinkToDirect } from './playlist.js';

document.addEventListener("DOMContentLoaded", async () => {
  playerApp.cacheElements();
  playerApp.showLoading(true);
  playerApp.setupWaveSurfer();
  playerApp.setupWaveformEvents();
  playerApp.setupPlayPauseUI();
  playerApp.setupVolumeControls();

  // Load and render playlist
  const playlist = await loadPlaylistFromFile('playlist.txt');
  if (!playlist.length) return;
  playerApp.renderPlaylist(playlist);
  const firstTrack = playlist[0];
  const convertedURL = convertDropboxLinkToDirect(firstTrack.url);
  playerApp.initializePlayer(convertedURL, firstTrack.title, 0);

  // Custom events previously at bottom of script.js
  document.addEventListener('track:change', (e) => {
    const { audioURL, title, index } = e.detail;
    const trackInfo = playerApp.elements.trackInfo;
    const fileName = title || audioURL.split("/").pop().split("?")[0].replace(/[_-]/g, " ").replace(/\.[^/.]+$/, "");
    if (trackInfo) {
      trackInfo.textContent = fileName;
    }
    const items = document.querySelectorAll(".playlist-item");
    items.forEach(el => el.classList.remove("active"));
    if (typeof index === "number") {
      const activeItem = document.querySelector(`.playlist-item[data-index="${index}"]`);
      if (activeItem) activeItem.classList.add("active");
    }
  });

  document.addEventListener('volume:mute', () => {
    const volumeToggle = playerApp.elements.volumeToggle;
    const volumeIconMuted = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
      </svg>
    `;
    if (volumeToggle) volumeToggle.innerHTML = volumeIconMuted;
  });

  document.addEventListener('volume:unmute', () => {
    const volumeToggle = playerApp.elements.volumeToggle;
    const volumeIconLoud = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
        <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
      </svg>
    `;
    if (volumeToggle) volumeToggle.innerHTML = volumeIconLoud;
  });

  document.addEventListener('playback:play', () => {
    const playPauseBtn = playerApp.elements.playPauseBtn;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z" clip-rule="evenodd" />
        </svg>
      `;
    }
  });

  document.addEventListener('playback:pause', () => {
    const playPauseBtn = playerApp.elements.playPauseBtn;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd" />
        </svg>
      `;
    }
  });

  document.addEventListener('playback:play', () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = '1';
  });
  document.addEventListener('playback:pause', () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = '0';
  });
  document.addEventListener('playback:finish', () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = '0';
  });

  // Keyboard shortcut for play/pause (space)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (playerApp.wavesurfer && playerApp.isWaveformReady) {
        playerApp.wavesurfer.playPause();
      }
    }
  });
});