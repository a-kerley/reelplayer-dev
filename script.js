// Convert Dropbox share link to direct download link
function convertDropboxLinkToDirect(url) {
  if (!url.includes("dropbox.com")) return url;

  return url
    .replace("www.dropbox.com", "dl.dropboxusercontent.com")
    .replace("dropbox.com", "dl.dropboxusercontent.com")
    .replace("?dl=0", "?dl=1")
    .replace("&dl=0", "&dl=1");
}

const rootStyles = getComputedStyle(document.documentElement);
const accentColor = rootStyles.getPropertyValue("--ui-accent").trim();
const unplayedColor = rootStyles.getPropertyValue("--waveform-unplayed").trim();

const wavesurfer = WaveSurfer.create({
  container: "#waveform",
  waveColor: unplayedColor,
  progressColor: accentColor,
  height: 100,
  responsive: true,
});

const waveformEl = document.getElementById("waveform");
const hoverOverlay = document.querySelector(".hover-overlay");
const hoverTime = document.querySelector(".hover-time");

document.addEventListener("DOMContentLoaded", () => {
  const playPauseBtn = document.getElementById("playPause");
  const volumeControl = document.querySelector(".volume-control");
  const playheadTime = document.querySelector(".playhead-time");

  const loadingIndicator = document.getElementById("loading");

  // Load playlist and initialize first track
  fetch('playlist.json')
    .then(res => res.json())
    .then(playlist => {
      if (!playlist.length) return;
      renderPlaylist(playlist);
      const firstTrack = playlist[0];
      const convertedURL = convertDropboxLinkToDirect(firstTrack.url);
      initializePlayer(convertedURL, firstTrack.title, 0);
    });

  function renderPlaylist(playlist) {
    const playlistEl = document.getElementById('playlist');
    playlistEl.innerHTML = '';
    playlist.forEach((track, index) => {
      const trackEl = document.createElement('div');
      trackEl.className = 'playlist-item';
      trackEl.textContent = track.title || track.url.split('/').pop();
      trackEl.dataset.index = index;

      trackEl.addEventListener('click', () => {
        const url = convertDropboxLinkToDirect(track.url);
        initializePlayer(url, track.title, index);
      });

      playlistEl.appendChild(trackEl);
    });
  }

  function initializePlayer(audioURL, title, index) {
    const fileName = title || audioURL.split("/").pop().split("?")[0].replace(/_/g, " ").replace(/\.[^/.]+$/, "");
    document.querySelector(".track-info").textContent = fileName;
    wavesurfer.load(audioURL);

    // Highlight active playlist item
    const items = document.querySelectorAll(".playlist-item");
    items.forEach(el => el.classList.remove("active"));
    if (typeof index === "number") {
      const activeItem = document.querySelector(`.playlist-item[data-index="${index}"]`);
      if (activeItem) activeItem.classList.add("active");
    }
  }

  playheadTime.style.opacity = "0"; // start hidden

  wavesurfer.on("ready", () => {
    if (loadingIndicator) {
      loadingIndicator.classList.add("hidden");
    }
    playPauseBtn.style.display = "inline-block";
    if (volumeControl) volumeControl.classList.remove("hidden");
    // Fade in waveform, play button, and volume control
    setTimeout(() => {
      const canvas = document.querySelector("#waveform canvas");
      if (canvas) canvas.style.opacity = "1";
      // Reset play button opacity to visible after display set
      playPauseBtn.style.opacity = "1";
      playPauseBtn.style.color = accentColor;
    }, 50);

    if (volumeControl) {
      volumeControl.style.opacity = "1";
      volumeControl.style.color = accentColor;
    }
    playheadTime.style.opacity = "0";
    const trackInfo = document.querySelector(".track-info");
    if (trackInfo) {
      trackInfo.classList.add("visible");
    }

    // Add total time display update
    const totalTime = document.getElementById("total-time");
    const duration = wavesurfer.getDuration();
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60)
      .toString()
      .padStart(2, "0");
    if (totalTime) totalTime.textContent = `${minutes}:${seconds}`;
    if (totalTime) totalTime.classList.add("visible");

    // Enable hover time display only after waveform is ready
    waveformEl.addEventListener("mousemove", (e) => {
      const rect = waveformEl.getBoundingClientRect();
      const percent = Math.min(
        Math.max((e.clientX - rect.left) / rect.width, 0),
        1
      );
      const duration = wavesurfer.getDuration();
      const time = duration * percent;

      // Update overlay width
      hoverOverlay.style.width = `${percent * 100}%`;

      // Update hover time text
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60)
        .toString()
        .padStart(2, "0");
      const timeText = `${minutes}:${seconds}`;
      hoverTime.textContent = timeText;

      const pixelX = e.clientX - rect.left;
      hoverTime.style.left = `${Math.max(
        Math.min(pixelX, rect.width - 40),
        30
      )}px`;

      // Hide hover time if close to current playhead time to avoid overlap
      const isPlaying = wavesurfer.isPlaying();
      const currentTime = wavesurfer.getCurrentTime();
      const hoverDiff = Math.abs(time - currentTime);

      const threshold = 5;

      if (isPlaying && hoverDiff < threshold) {
        hoverTime.style.opacity = "0";
      } else {
        hoverTime.style.opacity = "1";
      }
    });

    waveformEl.addEventListener("mouseleave", () => {
      hoverOverlay.style.width = `0%`;
      hoverTime.style.opacity = "0";
    });
  });

  wavesurfer.on("play", () => {
    playheadTime.style.opacity = "1";
  });

  wavesurfer.on("pause", () => {
    playheadTime.style.opacity = "0";
  });

  wavesurfer.on("finish", () => {
    playheadTime.style.opacity = "0";
  });

  wavesurfer.on("audioprocess", () => {
    const currentTime = wavesurfer.getCurrentTime();
    const duration = wavesurfer.getDuration();
    const minutes = Math.floor(currentTime / 60);
    const seconds = Math.floor(currentTime % 60)
      .toString()
      .padStart(2, "0");

    playheadTime.textContent = `${minutes}:${seconds}`;

    // position the playhead time relative to playhead
    const percent = currentTime / duration;
    const pixelX = percent * waveformEl.clientWidth;

    // Adjust left to center the label (assuming ~40px wide)
    const clampedX = Math.min(
      Math.max(pixelX, 20), // min left boundary
      waveformEl.clientWidth - 40 // max right boundary
    );
    playheadTime.style.left = `${clampedX}px`;
  });

  playPauseBtn.onclick = () => {
    wavesurfer.playPause();
  };

  wavesurfer.on("play", () => {
    playPauseBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z" clip-rule="evenodd" />
      </svg>
    `;
  });

  wavesurfer.on("pause", () => {
    playPauseBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd" />
      </svg>
    `;
  });

  let hideSliderTimeout;
  let isDraggingSlider = false;
  let isHoveringSlider = false;
  let isHoveringIcon = false;

  // Volume control elements

  const volumeIconLoud = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
    <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
  </svg>
`;

  const volumeIconMuted = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
  </svg>
`;

  let previousVolume = 1; // start with full volume
  const volumeToggle = document.getElementById("volumeToggle");
  const volumeSlider = document.getElementById("volumeSlider");

  volumeToggle.addEventListener("click", () => {
    const currentVolume = parseFloat(volumeSlider.value);

    if (currentVolume === 0) {
      // Restore previous volume
      volumeSlider.value = previousVolume;
    } else {
      // Save and mute
      previousVolume = currentVolume;
      volumeSlider.value = 0;
    }

    // Trigger input event manually to update waveform volume and icon
    volumeSlider.dispatchEvent(new Event("input"));
  });

  if (volumeControl && volumeSlider && volumeToggle) {
    // Volume update
    volumeSlider.addEventListener("input", (e) => {
      const volume = parseFloat(e.target.value);
      wavesurfer.setVolume(volume);
      volumeToggle.innerHTML = volume === 0 ? volumeIconMuted : volumeIconLoud;
    });

    // Drag start
    volumeSlider.addEventListener("mousedown", () => {
      isDraggingSlider = true;
    });

    // Drag end
    document.addEventListener("mouseup", () => {
      isDraggingSlider = false;
    });

    // Hover on full control container
    volumeControl.addEventListener("mouseenter", () => {
      clearTimeout(hideSliderTimeout);
      volumeControl.classList.add("show-slider");
    });

    volumeControl.addEventListener("mouseleave", () => {
      hideSliderTimeout = setTimeout(() => {
        if (!isDraggingSlider && !isHoveringSlider && !isHoveringIcon) {
          volumeControl.classList.remove("show-slider");
        }
      }, 300);
    });

    // Hover over the slider itself
    volumeSlider.addEventListener("mouseenter", () => {
      isHoveringSlider = true;
      clearTimeout(hideSliderTimeout);
    });

    volumeSlider.addEventListener("mouseleave", () => {
      isHoveringSlider = false;
      hideSliderTimeout = setTimeout(() => {
        if (!isDraggingSlider && !isHoveringSlider && !isHoveringIcon) {
          volumeControl.classList.remove("show-slider");
        }
      }, 300);
    });

    // Hover over the icon button
    volumeToggle.addEventListener("mouseenter", () => {
      isHoveringIcon = true;
      clearTimeout(hideSliderTimeout);
    });

    volumeToggle.addEventListener("mouseleave", () => {
      isHoveringIcon = false;
      hideSliderTimeout = setTimeout(() => {
        if (!isDraggingSlider && !isHoveringSlider && !isHoveringIcon) {
          volumeControl.classList.remove("show-slider");
        }
      }, 300);
    });
  }
});

// Fallback in case 'ready' doesn't fire
setTimeout(() => {
  const loadingFallback = document.getElementById("loading");
  if (wavesurfer.isReady && loadingFallback) {
    loadingFallback.classList.add("hidden");
  }
}, 5000);

// Track info is set in initializePlayer after loading playlist

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    wavesurfer.playPause();
  }
});
