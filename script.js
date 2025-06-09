const audioURL =
  "https://dl.dropboxusercontent.com/scl/fi/aac6ay1oyy2qp1cpfj93t/Sparkle_Sun_CharachterSuite_FullMix_-BoxedApe.wav?rlkey=dcz7tuj5i4z63kubay79yx89p&st=mbhllbd1";

const wavesurfer = WaveSurfer.create({
  container: "#waveform",
  waveColor: "#ddd",
  progressColor: "#333",
  height: 100,
  responsive: true,
});

const loadingIndicator = document.getElementById("loading");
loadingIndicator.style.display = "block";

document.addEventListener("DOMContentLoaded", () => {
  const playPauseBtn = document.getElementById("playPause");
  const volumeControl = document.querySelector(".volume-control");
  wavesurfer.on("ready", () => {
    if (loadingIndicator) loadingIndicator.remove();
    playPauseBtn.style.display = "inline-block";
    if (volumeControl) volumeControl.classList.remove("hidden");
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

wavesurfer.load(audioURL);

// Fallback in case 'ready' doesn't fire
setTimeout(() => {
  if (wavesurfer.isReady && loadingIndicator) {
    loadingIndicator.remove();
  }
}, 5000);

const fileName = audioURL.split("/").pop().split("?")[0];
document.querySelector(".track-info").textContent = fileName;

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    wavesurfer.playPause();
  }
});
