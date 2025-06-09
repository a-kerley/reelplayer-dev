const audioURL = 'https://dl.dropboxusercontent.com/scl/fi/aac6ay1oyy2qp1cpfj93t/Sparkle_Sun_CharachterSuite_FullMix_-BoxedApe.wav?rlkey=dcz7tuj5i4z63kubay79yx89p&st=mbhllbd1';

const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#ddd',
  progressColor: '#333',
  height: 100,
  responsive: true,
});

const loadingIndicator = document.getElementById('loading');
loadingIndicator.style.display = 'block';

document.addEventListener('DOMContentLoaded', () => {
  const playPauseBtn = document.getElementById('playPause');
  const volumeControl = document.querySelector('.volume-control');
  wavesurfer.on('ready', () => {
    if (loadingIndicator) loadingIndicator.remove();
    playPauseBtn.style.display = 'inline-block';
    if (volumeControl) volumeControl.style.display = 'flex';
  });

  playPauseBtn.onclick = () => {
    wavesurfer.playPause();
  };

  wavesurfer.on('play', () => {
    playPauseBtn.textContent = '⏸️';
  });

  wavesurfer.on('pause', () => {
    playPauseBtn.textContent = '▶️';
  });

  // Volume controls
  const volumeToggle = document.getElementById('volumeToggle');
  const volumeSlider = document.getElementById('volumeSlider');
  if (volumeToggle && volumeSlider) {
    volumeToggle.addEventListener('click', () => {
      volumeSlider.style.display = 'block';
    });
    volumeSlider.addEventListener('mouseleave', () => {
      volumeSlider.style.display = 'none';
    });
    volumeSlider.addEventListener('input', (e) => {
      wavesurfer.setVolume(e.target.value);
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

const fileName = audioURL.split('/').pop().split('?')[0];
document.querySelector('.track-info').textContent = fileName;
