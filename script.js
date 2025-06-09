const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#ddd',
  progressColor: '#333',
  height: 100,
  responsive: true,
});

wavesurfer.load('https://dl.dropboxusercontent.com/scl/fi/aac6ay1oyy2qp1cpfj93t/Sparkle_Sun_CharachterSuite_FullMix_-BoxedApe.wav?rlkey=dcz7tuj5i4z63kubay79yx89p&st=mbhllbd1');

const playPauseBtn = document.getElementById('playPause');

playPauseBtn.onclick = () => {
  wavesurfer.playPause();
};

wavesurfer.on('play', () => {
  playPauseBtn.textContent = '⏸️';
});

wavesurfer.on('pause', () => {
  playPauseBtn.textContent = '▶️';
});
