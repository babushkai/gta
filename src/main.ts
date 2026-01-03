import { Game } from './core/Game';

let game: Game | null = null;

async function startGame(playerName: string): Promise<void> {
  console.log('🎮 GTA Browser - Starting game for:', playerName);

  try {
    game = Game.getInstance();
    await game.initialize();

    // Set player name in network manager and connect to multiplayer
    if (game.network) {
      game.network.setConfig({ playerName, enabled: true, autoConnect: true });
      try {
        const connected = await game.network.connect();
        if (connected) {
          console.log('✅ Connected to multiplayer server!');
        } else {
          console.warn('⚠️ Could not connect to multiplayer server');
        }
      } catch (err) {
        console.error('❌ Multiplayer connection error:', err);
      }
    }

    // Hide start screen
    const startScreen = document.getElementById('start-screen');
    if (startScreen) {
      startScreen.classList.add('hidden');
    }

    // Setup mobile controls
    setupMobileControls();

    console.log('✅ Game started!');
    (window as unknown as { game: Game }).game = game;

  } catch (error) {
    console.error('❌ Failed to start game:', error);
    alert('Failed to start game. Check console for details.');
  }
}

function setupMobileControls(): void {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                   ('ontouchstart' in window);

  if (!isMobile) return;

  const joystickZone = document.getElementById('joystick-zone');
  const joystickStick = document.getElementById('joystick-stick');
  const btnJump = document.getElementById('btn-jump');
  const btnAction = document.getElementById('btn-action');
  const btnShoot = document.getElementById('btn-shoot');

  if (!joystickZone || !joystickStick) return;

  let joystickActive = false;
  let joystickOrigin = { x: 0, y: 0 };
  const maxDistance = 40;

  // Joystick touch handling
  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    const rect = joystickZone.getBoundingClientRect();
    joystickOrigin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    e.preventDefault();

    const touch = e.touches[0];
    let dx = touch.clientX - joystickOrigin.x;
    let dy = touch.clientY - joystickOrigin.y;

    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > maxDistance) {
      dx = (dx / distance) * maxDistance;
      dy = (dy / distance) * maxDistance;
    }

    joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Send input to game
    if (game) {
      const threshold = 15;

      // Simulate keyboard input
      simulateKey('w', dy < -threshold);
      simulateKey('s', dy > threshold);
      simulateKey('a', dx < -threshold);
      simulateKey('d', dx > threshold);
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (joystickActive) {
      joystickActive = false;
      joystickStick.style.transform = 'translate(-50%, -50%)';
      // Release all movement keys
      simulateKey('w', false);
      simulateKey('s', false);
      simulateKey('a', false);
      simulateKey('d', false);
    }
  });

  // Action buttons
  btnJump?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    simulateKey(' ', true);
  }, { passive: false });

  btnJump?.addEventListener('touchend', () => {
    simulateKey(' ', false);
  });

  btnAction?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    simulateKey('f', true);
    setTimeout(() => simulateKey('f', false), 100);
  }, { passive: false });

  btnShoot?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    simulateMouseDown();
  }, { passive: false });

  btnShoot?.addEventListener('touchend', () => {
    simulateMouseUp();
  });
}

// Track pressed keys to avoid duplicate events
const pressedKeys = new Set<string>();

function simulateKey(key: string, pressed: boolean): void {
  if (pressed && pressedKeys.has(key)) return;
  if (!pressed && !pressedKeys.has(key)) return;

  if (pressed) {
    pressedKeys.add(key);
  } else {
    pressedKeys.delete(key);
  }

  const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
    key: key,
    code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`,
    bubbles: true
  });
  document.dispatchEvent(event);
}

function simulateMouseDown(): void {
  const event = new MouseEvent('mousedown', {
    button: 0,
    bubbles: true
  });
  document.dispatchEvent(event);
}

function simulateMouseUp(): void {
  const event = new MouseEvent('mouseup', {
    button: 0,
    bubbles: true
  });
  document.dispatchEvent(event);
}

function init(): void {
  const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
  const startButton = document.getElementById('start-button');

  if (!nameInput || !startButton) {
    console.error('Start screen elements not found');
    return;
  }

  // Focus input on load
  nameInput.focus();

  // Generate random default name
  const randomNum = Math.floor(Math.random() * 9999);
  nameInput.placeholder = `Player${randomNum}`;

  // Start on button click
  startButton.addEventListener('click', () => {
    const name = nameInput.value.trim() || nameInput.placeholder;
    startGame(name);
  });

  // Start on Enter key
  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const name = nameInput.value.trim() || nameInput.placeholder;
      startGame(name);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
