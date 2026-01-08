import gsap from 'gsap';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';
import { MultiplayerUI } from './MultiplayerUI';

interface Notification {
  id: number;
  message: string;
  element: HTMLDivElement;
  timeout: number;
}

export class UIManager {
  private game: Game;
  private notifications: Notification[] = [];
  private notificationId: number = 0;
  private multiplayerUI: MultiplayerUI;

  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapSize: number = 200;
  private minimapScale: number = 2;

  private elements: {
    healthBar: HTMLElement | null;
    armorBar: HTMLElement | null;
    moneyDisplay: HTMLElement | null;
    wantedStars: HTMLElement[];
    missionDisplay: HTMLElement | null;
    missionTitle: HTMLElement | null;
    missionObjective: HTMLElement | null;
    pauseMenu: HTMLElement | null;
    crosshair: HTMLElement | null;
    notificationContainer: HTMLElement | null;
    fpsCounter: HTMLElement | null;
  };

  // FPS tracking
  private fpsHistory: number[] = [];
  private lastFpsUpdate: number = 0;
  private showDebugStats: boolean = false;

  constructor(game: Game) {
    this.game = game;
    this.multiplayerUI = new MultiplayerUI(game);
    this.elements = {
      healthBar: null,
      armorBar: null,
      moneyDisplay: null,
      wantedStars: [],
      missionDisplay: null,
      missionTitle: null,
      missionObjective: null,
      pauseMenu: null,
      crosshair: null,
      notificationContainer: null,
      fpsCounter: null
    };
  }

  async initialize(): Promise<void> {
    this.cacheElements();
    this.setupMinimap();
    this.setupEventListeners();
    this.setupPauseMenu();
    this.createFpsCounter();
    this.multiplayerUI.initialize();
  }

  private createFpsCounter(): void {
    // Create FPS counter element
    const fpsCounter = document.createElement('div');
    fpsCounter.id = 'fps-counter';
    fpsCounter.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #00ff00;
      padding: 8px 12px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      border-radius: 4px;
      z-index: 9999;
      pointer-events: none;
      min-width: 80px;
    `;
    fpsCounter.textContent = 'FPS: --';
    document.body.appendChild(fpsCounter);
    this.elements.fpsCounter = fpsCounter;
  }

  private cacheElements(): void {
    this.elements.healthBar = document.getElementById('health-bar');
    this.elements.armorBar = document.getElementById('armor-bar');
    this.elements.moneyDisplay = document.getElementById('money-display');
    this.elements.wantedStars = Array.from(document.querySelectorAll('#wanted-level .star'));
    this.elements.missionDisplay = document.getElementById('mission-display');
    this.elements.missionTitle = document.querySelector('.mission-title');
    this.elements.missionObjective = document.querySelector('.mission-objective');
    this.elements.pauseMenu = document.getElementById('pause-menu');
    this.elements.crosshair = document.getElementById('crosshair');
    this.elements.notificationContainer = document.getElementById('notification-container');
  }

  private setupMinimap(): void {
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (this.minimapCanvas) {
      this.minimapCanvas.width = this.minimapSize;
      this.minimapCanvas.height = this.minimapSize;
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
  }

  private setupEventListeners(): void {
    globalEvents.on('wanted_level_change', (data: { level: number }) => {
      this.updateWantedLevel(data.level);
    });

    globalEvents.on('damage_taken', () => {
      this.flashDamage();
    });

    this.game.input.on('aim', (data: { pressed: boolean }) => {
      this.setCrosshairAiming(data.pressed);
    });
  }

  // Update crosshair visibility based on current weapon
  updateCrosshairForWeapon(): void {
    const weapon = this.game.weapons.getCurrentWeapon();
    if (!weapon) {
      this.setCrosshairVisible(false);
      return;
    }

    // Show crosshair for firearms, hide for melee
    const isFirearm = weapon.config.type !== 'melee' && weapon.config.type !== 'thrown';
    this.setCrosshairVisible(isFirearm);
  }

  private setupPauseMenu(): void {
    const menuOptions = document.querySelectorAll('.menu-option');
    menuOptions.forEach(option => {
      option.addEventListener('click', () => {
        const action = option.getAttribute('data-action');
        this.handleMenuAction(action);
      });
    });
  }

  private handleMenuAction(action: string | null): void {
    switch (action) {
      case 'resume':
        this.game.resume();
        break;
      case 'save':
        this.game.saveGame(0);
        break;
      case 'load':
        this.game.loadGame(0);
        this.game.resume();
        break;
      case 'settings':
        this.showNotification('Settings coming soon!');
        break;
      case 'quit':
        window.location.reload();
        break;
    }
  }

  update(deltaTime: number): void {
    this.updateHealthBar();
    this.updateArmorBar();
    this.updateMoney();
    this.updateMinimap();
    this.updateMissionTimer();
    this.updateFpsCounter(deltaTime);
    this.multiplayerUI.update();
  }

  private updateFpsCounter(deltaTime: number): void {
    if (!this.elements.fpsCounter) return;

    // Calculate FPS
    const fps = deltaTime > 0 ? Math.round(1 / deltaTime) : 0;
    this.fpsHistory.push(fps);

    // Keep last 30 frames for average
    if (this.fpsHistory.length > 30) {
      this.fpsHistory.shift();
    }

    // Update display every 250ms to avoid flicker
    const now = performance.now();
    if (now - this.lastFpsUpdate > 250) {
      const avgFps = Math.round(
        this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
      );

      // Color based on performance
      let color = '#00ff00'; // Green for 50+
      if (avgFps < 30) {
        color = '#ff0000'; // Red for <30
      } else if (avgFps < 50) {
        color = '#ffff00'; // Yellow for 30-50
      }

      // Get quality level from performance manager
      const quality = this.game.performance?.getQuality() || 'high';

      // Get render stats
      const renderStats = this.game.renderer.getRenderStats();

      this.elements.fpsCounter.style.color = color;
      this.elements.fpsCounter.innerHTML = `
        FPS: ${avgFps}<br>
        Quality: ${quality}<br>
        Draw: ${renderStats.drawCalls}<br>
        Tris: ${(renderStats.triangles / 1000).toFixed(1)}K
      `;

      this.lastFpsUpdate = now;
    }
  }

  toggleDebugStats(): void {
    this.showDebugStats = !this.showDebugStats;
    if (this.elements.fpsCounter) {
      this.elements.fpsCounter.style.display = this.showDebugStats ? 'block' : 'none';
    }
  }

  private updateHealthBar(): void {
    if (!this.elements.healthBar) return;

    const { health, maxHealth } = this.game.player.stats;
    const percentage = (health / maxHealth) * 100;
    this.elements.healthBar.style.width = `${percentage}%`;
  }

  private updateArmorBar(): void {
    if (!this.elements.armorBar) return;

    const { armor, maxArmor } = this.game.player.stats;
    const percentage = (armor / maxArmor) * 100;
    this.elements.armorBar.style.width = `${percentage}%`;
  }

  private updateMoney(): void {
    if (!this.elements.moneyDisplay) return;

    const money = this.game.player.stats.money;
    this.elements.moneyDisplay.textContent = `$${money.toLocaleString()}`;
  }

  private updateWantedLevel(level: number): void {
    this.elements.wantedStars.forEach((star, index) => {
      if (index < level) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });

    if (level > 0) {
      this.game.audio.playSound('wanted_level');
    }
  }

  private updateMinimap(): void {
    if (!this.minimapCtx || !this.minimapCanvas) return;

    const ctx = this.minimapCtx;
    const size = this.minimapSize;
    const center = size / 2;

    ctx.fillStyle = 'rgba(0, 30, 0, 0.8)';
    ctx.fillRect(0, 0, size, size);

    const playerPos = this.game.player.position;
    const playerRot = this.game.player.rotation.y;

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-playerRot);

    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.lineWidth = 2;

    for (let x = -250; x <= 250; x += 50) {
      const screenX = x / this.minimapScale;
      ctx.beginPath();
      ctx.moveTo(screenX, -center);
      ctx.lineTo(screenX, center);
      ctx.stroke();
    }

    for (let z = -250; z <= 250; z += 50) {
      const screenZ = z / this.minimapScale;
      ctx.beginPath();
      ctx.moveTo(-center, screenZ);
      ctx.lineTo(center, screenZ);
      ctx.stroke();
    }

    this.drawMinimapBlips(ctx, playerPos, center);

    ctx.restore();

    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(center, center - 8);
    ctx.lineTo(center - 5, center + 5);
    ctx.lineTo(center + 5, center + 5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawMinimapBlips(
    ctx: CanvasRenderingContext2D,
    playerPos: THREE.Vector3,
    center: number
  ): void {
    const currentMission = this.game.missions.getCurrentMission();
    if (currentMission) {
      currentMission.objectives.forEach(objective => {
        if (objective.location && !objective.completed) {
          const relX = (objective.location.x - playerPos.x) / this.minimapScale;
          const relZ = (objective.location.z - playerPos.z) / this.minimapScale;

          if (Math.abs(relX) < center && Math.abs(relZ) < center) {
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(relX, relZ, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    ctx.fillStyle = '#ff0000';
    const npcs = this.game.ai.getNPCsInRadius(playerPos, 100);
    npcs.forEach(npc => {
      if (npc.config.hostile && !npc.isDead) {
        const relX = (npc.mesh.position.x - playerPos.x) / this.minimapScale;
        const relZ = (npc.mesh.position.z - playerPos.z) / this.minimapScale;

        if (Math.abs(relX) < center && Math.abs(relZ) < center) {
          ctx.beginPath();
          ctx.arc(relX, relZ, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  private updateMissionTimer(): void {
    const timer = this.game.missions.getMissionTimer();
    if (timer > 0 && this.elements.missionObjective) {
      const minutes = Math.floor(timer / 60);
      const seconds = Math.floor(timer % 60);
      const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      this.elements.missionObjective.textContent += ` - ${timerText}`;
    }
  }

  showMissionStart(title: string, description: string): void {
    this.showBigMessage(title, 'mission_start');

    if (this.elements.missionDisplay && this.elements.missionTitle) {
      this.elements.missionTitle.textContent = title;
      this.elements.missionDisplay.classList.add('visible');
    }
  }

  showMissionComplete(title: string, reward: number): void {
    this.showBigMessage('MISSION PASSED', 'mission_complete');
    this.showNotification(`Reward: $${reward.toLocaleString()}`);

    if (this.elements.missionDisplay) {
      this.elements.missionDisplay.classList.remove('visible');
    }
  }

  showMissionFailed(title: string, reason: string): void {
    this.showBigMessage('MISSION FAILED', 'mission_failed');
    this.showNotification(`Reason: ${reason}`);

    if (this.elements.missionDisplay) {
      this.elements.missionDisplay.classList.remove('visible');
    }
  }

  updateObjective(text: string): void {
    if (this.elements.missionObjective) {
      this.elements.missionObjective.textContent = text;
    }
  }

  private showBigMessage(text: string, type: 'mission_start' | 'mission_complete' | 'mission_failed'): void {
    const colors = {
      mission_start: '#ffff00',
      mission_complete: '#00ff00',
      mission_failed: '#ff0000'
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      pointer-events: none;
      z-index: 200;
    `;

    const message = document.createElement('div');
    message.textContent = text;
    message.style.cssText = `
      font-size: 4rem;
      font-weight: bold;
      color: ${colors[type]};
      text-shadow: 4px 4px 8px rgba(0, 0, 0, 0.8);
      opacity: 0;
      transform: scale(1.5);
    `;

    overlay.appendChild(message);
    document.body.appendChild(overlay);

    gsap.to(message, {
      opacity: 1,
      scale: 1,
      duration: 0.3,
      ease: 'back.out'
    });

    gsap.to(message, {
      opacity: 0,
      scale: 0.8,
      duration: 0.5,
      delay: 2,
      ease: 'power2.in',
      onComplete: () => {
        document.body.removeChild(overlay);
      }
    });
  }

  showNotification(message: string, duration: number = 3000): void {
    if (!this.elements.notificationContainer) return;

    const id = this.notificationId++;
    const element = document.createElement('div');
    element.className = 'notification';
    element.textContent = message;

    this.elements.notificationContainer.appendChild(element);

    const notification: Notification = {
      id,
      message,
      element,
      timeout: window.setTimeout(() => {
        this.removeNotification(id);
      }, duration)
    };

    this.notifications.push(notification);

    if (this.notifications.length > 5) {
      this.removeNotification(this.notifications[0].id);
    }
  }

  private removeNotification(id: number): void {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index === -1) return;

    const notification = this.notifications[index];
    clearTimeout(notification.timeout);

    gsap.to(notification.element, {
      opacity: 0,
      x: 50,
      duration: 0.3,
      onComplete: () => {
        notification.element.remove();
      }
    });

    this.notifications.splice(index, 1);
  }

  showPauseMenu(): void {
    if (this.elements.pauseMenu) {
      this.elements.pauseMenu.classList.add('active');
    }
  }

  hidePauseMenu(): void {
    if (this.elements.pauseMenu) {
      this.elements.pauseMenu.classList.remove('active');
    }
  }

  setCrosshairVisible(visible: boolean): void {
    if (this.elements.crosshair) {
      this.elements.crosshair.classList.toggle('visible', visible);
    }
  }

  setCrosshairAiming(aiming: boolean): void {
    if (this.elements.crosshair) {
      this.elements.crosshair.classList.toggle('aiming', aiming);
    }
  }

  private flashDamage(): void {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, transparent 50%, rgba(255, 0, 0, 0.4) 100%);
      pointer-events: none;
      z-index: 150;
    `;

    document.body.appendChild(flash);

    gsap.to(flash, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        document.body.removeChild(flash);
      }
    });
  }

  showWeaponWheel(): void {
    const weaponWheel = document.getElementById('weapon-wheel');
    if (weaponWheel) {
      weaponWheel.classList.add('active');
      this.renderWeaponWheel();
    }
  }

  hideWeaponWheel(): void {
    const weaponWheel = document.getElementById('weapon-wheel');
    if (weaponWheel) {
      weaponWheel.classList.remove('active');
    }
  }

  private renderWeaponWheel(): void {
    const weaponWheel = document.getElementById('weapon-wheel');
    if (!weaponWheel) return;

    weaponWheel.innerHTML = '';

    const weapons = this.game.inventory.getAllWeapons();
    const angleStep = (Math.PI * 2) / Math.max(weapons.length, 1);
    const radius = 120;

    weapons.forEach((weapon, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const x = Math.cos(angle) * radius + 200;
      const y = Math.sin(angle) * radius + 200;

      const slot = document.createElement('div');
      slot.style.cssText = `
        position: absolute;
        left: ${x - 40}px;
        top: ${y - 40}px;
        width: 80px;
        height: 80px;
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
      `;

      slot.innerHTML = `
        <div style="font-size: 1.2rem; margin-bottom: 5px;">🔫</div>
        <div>${weapon.config.name}</div>
        <div style="font-size: 0.7rem; opacity: 0.7;">${weapon.currentAmmo}/${weapon.reserveAmmo}</div>
      `;

      slot.addEventListener('click', () => {
        this.game.inventory.selectWeapon(weapon.config.id);
        this.hideWeaponWheel();
      });

      slot.addEventListener('mouseenter', () => {
        slot.style.transform = 'scale(1.1)';
        slot.style.borderColor = '#e94560';
      });

      slot.addEventListener('mouseleave', () => {
        slot.style.transform = 'scale(1)';
        slot.style.borderColor = 'rgba(255, 255, 255, 0.3)';
      });

      weaponWheel.appendChild(slot);
    });
  }

  dispose(): void {
    this.notifications.forEach(n => {
      clearTimeout(n.timeout);
      n.element.remove();
    });
    this.notifications = [];
    this.multiplayerUI.dispose();
  }
}
