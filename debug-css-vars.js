// Debugging script to check CSS variable values on the player
// Add this to player.html temporarily to debug overlay color issues

setTimeout(() => {
  const playerWrapper = document.querySelector('.player-wrapper');
  if (playerWrapper) {
    const styles = getComputedStyle(playerWrapper);
    const beforeStyles = getComputedStyle(playerWrapper, '::before');
    const afterStyles = getComputedStyle(playerWrapper, '::after');
    
    console.log('=== PLAYER CSS VARIABLES DEBUG ===');
    console.log('Main element:');
    console.log('  --background-color:', styles.getPropertyValue('--background-color'));
    console.log('  --overlay-color:', styles.getPropertyValue('--overlay-color'));
    console.log('  --background-image:', styles.getPropertyValue('--background-image'));
    console.log('  --background-opacity:', styles.getPropertyValue('--background-opacity'));
    console.log('  --background-blur:', styles.getPropertyValue('--background-blur'));
    console.log('  computed background-color:', styles.backgroundColor);
    
    console.log('::before pseudo-element:');
    console.log('  computed background-color:', beforeStyles.backgroundColor);
    console.log('  computed backdrop-filter:', beforeStyles.backdropFilter);
    
    console.log('::after pseudo-element:');
    console.log('  computed background-color:', afterStyles.backgroundColor);
    console.log('  computed background-image:', afterStyles.backgroundImage);
    console.log('  computed opacity:', afterStyles.opacity);
    console.log('================================');
  }
}, 1000);
