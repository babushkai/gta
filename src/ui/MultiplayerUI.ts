import gsap from 'gsap';
import { Game } from '@/core/Game';
import { RemotePlayer } from '@/network/RemotePlayer';

export class MultiplayerUI {
  private game: Game;
  private container: HTMLDivElement | null = null;
  private statusIndicator: HTMLDivElement | null = null;
  private playerList: HTMLDivElement | null = null;
  private roomLinkButton: HTMLButtonElement | null = null;
  private leaveButton: HTMLButtonElement | null = null;
  private joinPanel: HTMLDivElement | null = null;

  private isVisible: boolean = false;
  private lastPlayerCount: number = 0;

  constructor(game: Game) {
    this.game = game;
  }

  initialize(): void {
    this.createUI();
    this.setupEventListeners();
    this.checkURLForRoom();
  }

  private createUI(): void {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'multiplayer-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 100;
      font-family: 'Rajdhani', sans-serif;
      color: white;
    `;

    // Connection status indicator
    this.statusIndicator = document.createElement('div');
    this.statusIndicator.id = 'mp-status';
    this.statusIndicator.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
    `;
    this.statusIndicator.innerHTML = `
      <div id="status-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #666;"></div>
      <span id="status-text">Offline</span>
    `;
    this.container.appendChild(this.statusIndicator);

    // Player list (hidden by default)
    this.playerList = document.createElement('div');
    this.playerList.id = 'mp-player-list';
    this.playerList.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 4px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
      margin-bottom: 8px;
      max-height: 200px;
      overflow-y: auto;
    `;
    this.container.appendChild(this.playerList);

    // Room link button (hidden by default)
    this.roomLinkButton = document.createElement('button');
    this.roomLinkButton.id = 'mp-room-link';
    this.roomLinkButton.style.cssText = `
      display: none;
      width: 100%;
      padding: 10px;
      background: rgba(233, 69, 96, 0.8);
      border: none;
      border-radius: 8px;
      color: white;
      font-family: 'Rajdhani', sans-serif;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      margin-bottom: 8px;
      transition: background 0.2s;
    `;
    this.roomLinkButton.textContent = 'Copy Room Link';
    this.roomLinkButton.addEventListener('mouseenter', () => {
      if (this.roomLinkButton) this.roomLinkButton.style.background = 'rgba(233, 69, 96, 1)';
    });
    this.roomLinkButton.addEventListener('mouseleave', () => {
      if (this.roomLinkButton) this.roomLinkButton.style.background = 'rgba(233, 69, 96, 0.8)';
    });
    this.container.appendChild(this.roomLinkButton);

    // Leave button (hidden by default)
    this.leaveButton = document.createElement('button');
    this.leaveButton.id = 'mp-leave';
    this.leaveButton.style.cssText = `
      display: none;
      width: 100%;
      padding: 8px;
      background: rgba(100, 100, 100, 0.6);
      border: none;
      border-radius: 8px;
      color: white;
      font-family: 'Rajdhani', sans-serif;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    this.leaveButton.textContent = 'Leave Session';
    this.leaveButton.addEventListener('mouseenter', () => {
      if (this.leaveButton) this.leaveButton.style.background = 'rgba(100, 100, 100, 0.8)';
    });
    this.leaveButton.addEventListener('mouseleave', () => {
      if (this.leaveButton) this.leaveButton.style.background = 'rgba(100, 100, 100, 0.6)';
    });
    this.container.appendChild(this.leaveButton);

    // Join panel (shown when offline)
    this.joinPanel = document.createElement('div');
    this.joinPanel.id = 'mp-join-panel';
    this.joinPanel.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
    `;
    this.joinPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">Join Multiplayer</div>
      <button id="mp-create-room" style="
        padding: 10px;
        background: rgba(233, 69, 96, 0.8);
        border: none;
        border-radius: 6px;
        color: white;
        font-family: 'Rajdhani', sans-serif;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
      ">Create Room</button>
      <div style="text-align: center; font-size: 12px; opacity: 0.7;">or join via shared link</div>
    `;
    this.container.appendChild(this.joinPanel);

    document.body.appendChild(this.container);
  }

  private setupEventListeners(): void {
    // Status indicator click - toggle player list or join panel
    this.statusIndicator?.addEventListener('click', () => {
      if (this.game.network.connected) {
        this.togglePlayerList();
      } else {
        this.toggleJoinPanel();
      }
    });

    // Room link button
    this.roomLinkButton?.addEventListener('click', () => {
      this.copyRoomLink();
    });

    // Leave button
    this.leaveButton?.addEventListener('click', () => {
      this.leaveSession();
    });

    // Create room button
    const createButton = document.getElementById('mp-create-room');
    createButton?.addEventListener('click', () => {
      this.createRoom();
    });

    // Network events
    this.game.network.on('connected', () => {
      this.onConnected();
    });

    this.game.network.on('disconnected', () => {
      this.onDisconnected();
    });

    this.game.network.on('playerJoined', (data: { player: { name: string } }) => {
      this.showPlayerJoinedNotification(data.player.name);
    });

    this.game.network.on('playerLeft', () => {
      this.updatePlayerList();
    });
  }

  private checkURLForRoom(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
      // Auto-join room from URL
      this.joinRoom(roomId);
    }
  }

  private async createRoom(): Promise<void> {
    this.updateStatus('connecting');
    const success = await this.game.network.connect();
    if (!success) {
      this.updateStatus('offline');
      this.game.ui.showNotification('Failed to create room');
    }
  }

  private async joinRoom(roomId: string): Promise<void> {
    this.updateStatus('connecting');
    const success = await this.game.network.connect(undefined, roomId);
    if (!success) {
      this.updateStatus('offline');
      this.game.ui.showNotification('Failed to join room');
      // Remove room param from URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  private onConnected(): void {
    this.updateStatus('online');
    this.hideJoinPanel();

    if (this.roomLinkButton) this.roomLinkButton.style.display = 'block';
    if (this.leaveButton) this.leaveButton.style.display = 'block';

    this.updatePlayerList();
    this.game.ui.showNotification('Connected to multiplayer!');

    // Update URL with room ID
    const roomId = this.game.network.roomId;
    if (roomId) {
      const newUrl = `${window.location.pathname}?room=${roomId}`;
      window.history.replaceState({}, '', newUrl);
    }
  }

  private onDisconnected(): void {
    this.updateStatus('offline');

    if (this.playerList) this.playerList.style.display = 'none';
    if (this.roomLinkButton) this.roomLinkButton.style.display = 'none';
    if (this.leaveButton) this.leaveButton.style.display = 'none';

    // Remove room param from URL
    window.history.replaceState({}, '', window.location.pathname);

    this.game.ui.showNotification('Disconnected from multiplayer');
  }

  private updateStatus(status: 'offline' | 'connecting' | 'online'): void {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    if (!dot || !text) return;

    switch (status) {
      case 'offline':
        dot.style.background = '#666';
        text.textContent = 'Offline';
        break;
      case 'connecting':
        dot.style.background = '#ffa500';
        text.textContent = 'Connecting...';
        break;
      case 'online':
        const playerCount = this.game.network.playerCount;
        dot.style.background = '#00ff00';
        text.textContent = `Online (${playerCount} player${playerCount !== 1 ? 's' : ''})`;
        break;
    }
  }

  private togglePlayerList(): void {
    if (!this.playerList) return;

    const isShowing = this.playerList.style.display === 'flex';
    this.playerList.style.display = isShowing ? 'none' : 'flex';

    if (!isShowing) {
      this.updatePlayerList();
    }
  }

  private toggleJoinPanel(): void {
    if (!this.joinPanel) return;

    const isShowing = this.joinPanel.style.display === 'flex';
    this.joinPanel.style.display = isShowing ? 'none' : 'flex';
  }

  private hideJoinPanel(): void {
    if (this.joinPanel) {
      this.joinPanel.style.display = 'none';
    }
  }

  private updatePlayerList(): void {
    if (!this.playerList) return;

    const remotePlayers = this.game.network.getRemotePlayers();

    this.playerList.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
        Players (${remotePlayers.length + 1})
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ff00;"></div>
        <span>You</span>
      </div>
    `;

    remotePlayers.forEach((player: RemotePlayer) => {
      const playerDiv = document.createElement('div');
      playerDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
      playerDiv.innerHTML = `
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #4dabf7;"></div>
        <span>${player.name}</span>
      `;
      this.playerList?.appendChild(playerDiv);
    });

    // Update status text with player count
    this.updateStatus('online');
  }

  private async copyRoomLink(): Promise<void> {
    const link = this.game.network.getRoomLink();
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);

      if (this.roomLinkButton) {
        const originalText = this.roomLinkButton.textContent;
        this.roomLinkButton.textContent = 'Copied!';
        this.roomLinkButton.style.background = 'rgba(0, 200, 0, 0.8)';

        setTimeout(() => {
          if (this.roomLinkButton) {
            this.roomLinkButton.textContent = originalText;
            this.roomLinkButton.style.background = 'rgba(233, 69, 96, 0.8)';
          }
        }, 2000);
      }

      this.game.ui.showNotification('Room link copied to clipboard!');
    } catch {
      this.game.ui.showNotification('Failed to copy link');
    }
  }

  private leaveSession(): void {
    this.game.network.disconnect();
  }

  private showPlayerJoinedNotification(name: string): void {
    this.game.ui.showNotification(`${name} joined the game`);
    this.updatePlayerList();

    // Flash the status indicator
    if (this.statusIndicator) {
      gsap.to(this.statusIndicator, {
        background: 'rgba(0, 255, 0, 0.3)',
        duration: 0.2,
        yoyo: true,
        repeat: 1
      });
    }
  }

  update(): void {
    // Check for player count changes
    if (this.game.network.connected) {
      const currentCount = this.game.network.playerCount;
      if (currentCount !== this.lastPlayerCount) {
        this.lastPlayerCount = currentCount;
        this.updateStatus('online');
      }
    }
  }

  dispose(): void {
    this.container?.remove();
  }
}
