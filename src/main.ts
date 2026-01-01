import { Game } from './core/Game';

async function main(): Promise<void> {
  console.log('🎮 GTA Browser - Initializing...');

  try {
    const game = Game.getInstance();
    await game.initialize();

    console.log('✅ Game initialized successfully!');
    console.log('🎮 Controls:');
    console.log('   WASD - Move');
    console.log('   SHIFT - Sprint');
    console.log('   SPACE - Jump / Handbrake');
    console.log('   E - Interact');
    console.log('   F - Enter/Exit Vehicle');
    console.log('   LMB - Shoot');
    console.log('   RMB - Aim');
    console.log('   R - Reload');
    console.log('   TAB - Weapon Wheel');
    console.log('   N - Change Radio');
    console.log('   ESC - Pause');

    (window as unknown as { game: Game }).game = game;

  } catch (error) {
    console.error('❌ Failed to initialize game:', error);

    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
      loadingText.textContent = 'Failed to initialize. Check console for details.';
      loadingText.style.color = '#ff4444';
    }
  }
}

document.addEventListener('DOMContentLoaded', main);

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
