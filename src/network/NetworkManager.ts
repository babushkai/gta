import { Client, Room } from 'colyseus.js';
import * as THREE from 'three';
import { EventEmitter } from '@/core/EventEmitter';
import { Game } from '@/core/Game';
import { RemotePlayer } from './RemotePlayer';

// Server state types (mirrors server schema)
interface PlayerState {
  id: string;
  sessionId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  health: number;
  armor: number;
  money: number;
  wantedLevel: number;
  state: string;
  isInVehicle: boolean;
  vehicleId: string;
  currentWeapon: string;
  timestamp: number;
}

interface VehicleState {
  id: string;
  configId: string;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  health: number;
  currentSpeed: number;
  destroyed: boolean;
  driverId: string;
  timestamp: number;
}

// Colyseus MapSchema interface (client-side)
interface MapSchema<T> extends Map<string, T> {
  onAdd: (callback: (item: T, key: string) => void) => void;
  onRemove: (callback: (item: T, key: string) => void) => void;
  onChange: (callback: (item: T, key: string) => void) => void;
}

interface GameState {
  players: MapSchema<PlayerState>;
  vehicles: MapSchema<VehicleState>;
  collectedPickups: string[];
  timeOfDay: number;
  weather: string;
  roomId: string;
  serverTime: number;
}

export interface MultiplayerConfig {
  enabled: boolean;
  serverUrl: string;
  playerName: string;
  autoConnect: boolean;
}

export class NetworkManager extends EventEmitter {
  private game: Game;
  private client: Client | null = null;
  private room: Room<GameState> | null = null;
  private config: MultiplayerConfig;

  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private localPlayerId: string = '';
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  // Position sync throttle
  private lastPositionSend: number = 0;
  private positionSendInterval: number = 50; // 20 Hz

  // Input state for sending
  private lastInputState: Record<string, boolean> = {};

  constructor(game: Game) {
    super();
    this.game = game;
    this.config = {
      enabled: false,
      serverUrl: 'ws://localhost:2567',
      playerName: 'Player',
      autoConnect: false,
    };
  }

  setConfig(config: Partial<MultiplayerConfig>) {
    this.config = { ...this.config, ...config };
  }

  async connect(serverUrl?: string, roomId?: string): Promise<boolean> {
    if (this.isConnected) {
      console.warn('Already connected to server');
      return true;
    }

    const url = serverUrl || this.config.serverUrl;

    try {
      console.log(`Connecting to multiplayer server: ${url}`);
      this.client = new Client(url);

      // Join or create room
      if (roomId) {
        this.room = await this.client.joinById<GameState>(roomId, {
          name: this.config.playerName,
        });
      } else {
        this.room = await this.client.joinOrCreate<GameState>('game', {
          name: this.config.playerName,
        });
      }

      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.setupRoomHandlers();

      console.log(`Connected to room: ${this.room.roomId}`);
      this.emit('connected', { roomId: this.room.roomId });

      return true;
    } catch (error) {
      console.error('Failed to connect to server:', error);
      this.emit('connectionError', { error });
      return false;
    }
  }

  disconnect() {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    if (this.client) {
      this.client = null;
    }
    this.isConnected = false;
    this.remotePlayers.forEach((player) => player.dispose());
    this.remotePlayers.clear();
    this.emit('disconnected', {});
  }

  private setupRoomHandlers() {
    if (!this.room) return;

    // Handle welcome message
    this.room.onMessage('welcome', (message: { playerId: string; roomId: string }) => {
      this.localPlayerId = message.playerId;
      console.log(`Joined as player: ${this.localPlayerId}`);
    });

    // Handle player state changes
    this.room.state.players.onAdd((player: PlayerState, sessionId: string) => {
      console.log(`Player added: ${sessionId}`);

      // Don't create remote player for local player
      if (sessionId === this.localPlayerId) return;

      const remotePlayer = new RemotePlayer(this.game, player);
      this.remotePlayers.set(sessionId, remotePlayer);
      this.emit('playerJoined', { player });
    });

    this.room.state.players.onRemove((player: PlayerState, sessionId: string) => {
      console.log(`Player removed: ${sessionId}`);

      const remotePlayer = this.remotePlayers.get(sessionId);
      if (remotePlayer) {
        remotePlayer.dispose();
        this.remotePlayers.delete(sessionId);
      }
      this.emit('playerLeft', { sessionId });
    });

    this.room.state.players.onChange((player: PlayerState, sessionId: string) => {
      // Skip local player
      if (sessionId === this.localPlayerId) return;

      const remotePlayer = this.remotePlayers.get(sessionId);
      if (remotePlayer) {
        remotePlayer.updateFromState(player);
      }
    });

    // Handle vehicle state changes
    this.room.state.vehicles.onChange((vehicle: VehicleState, vehicleId: string) => {
      this.emit('vehicleUpdate', { vehicleId, vehicle });
    });

    // Handle pickup collection
    this.room.onMessage('pickupCollected', (message: { playerId: string; pickupId: string }) => {
      if (message.playerId !== this.localPlayerId) {
        this.emit('pickupCollected', message);
      }
    });

    // Handle pickup respawn
    this.room.onMessage('pickupRespawned', (message: { pickupId: string }) => {
      this.emit('pickupRespawned', message);
    });

    // Handle weapon fire from other players
    this.room.onMessage('weaponFire', (message: any) => {
      if (message.playerId !== this.localPlayerId) {
        this.emit('remoteWeaponFire', message);
      }
    });

    // Handle vehicle events
    this.room.onMessage('vehicleEnter', (message: any) => {
      this.emit('vehicleEnter', message);
    });

    this.room.onMessage('vehicleExit', (message: any) => {
      this.emit('vehicleExit', message);
    });

    // Handle player killed
    this.room.onMessage('playerKilled', (message: any) => {
      this.emit('playerKilled', message);
    });

    // Handle chat
    this.room.onMessage('chat', (message: any) => {
      this.emit('chat', message);
    });

    // Handle disconnection
    this.room.onLeave((code: number) => {
      console.log(`Left room with code: ${code}`);
      this.isConnected = false;

      if (code > 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        // Try to reconnect
        this.reconnectAttempts++;
        console.log(`Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(), 2000);
      } else {
        this.emit('disconnected', { code });
      }
    });

    this.room.onError((code: number, message?: string) => {
      console.error(`Room error: ${code} - ${message || 'Unknown error'}`);
      this.emit('error', { code, message: message || 'Unknown error' });
    });
  }

  update(deltaTime: number) {
    if (!this.isConnected || !this.room) return;

    const now = Date.now();

    // Send position update at throttled rate
    if (now - this.lastPositionSend >= this.positionSendInterval) {
      this.sendPositionUpdate();
      this.lastPositionSend = now;
    }

    // Update remote players interpolation
    this.remotePlayers.forEach((player) => {
      player.update(deltaTime);
    });
  }

  private sendPositionUpdate() {
    if (!this.room) return;

    const player = this.game.player;
    let state = 'idle';

    if (player.state.isDead) state = 'dead';
    else if (player.state.isShooting) state = 'shooting';
    else if (player.state.isRunning) state = 'running';
    else if (player.state.isMoving) state = 'moving';
    else if (player.state.isJumping) state = 'jumping';

    this.room.send('position', {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      rotationY: player.rotation.y,
      velocityX: player.body.velocity.x,
      velocityY: player.body.velocity.y,
      velocityZ: player.body.velocity.z,
      state: state,
    });
  }

  sendInput(input: {
    forward?: boolean;
    backward?: boolean;
    left?: boolean;
    right?: boolean;
    jump?: boolean;
    sprint?: boolean;
    fire?: boolean;
    aim?: boolean;
  }) {
    if (!this.room) return;

    // Only send if changed
    let changed = false;
    for (const key in input) {
      if (this.lastInputState[key] !== (input as any)[key]) {
        changed = true;
        break;
      }
    }

    if (changed) {
      this.room.send('input', input);
      this.lastInputState = { ...input } as any;
    }
  }

  sendWeaponFire(weaponId: string, direction: THREE.Vector3) {
    if (!this.room) return;

    this.room.send('fire', {
      weaponId,
      dirX: direction.x,
      dirY: direction.y,
      dirZ: direction.z,
    });
  }

  sendVehicleEnter(vehicleId: string) {
    if (!this.room) return;
    this.room.send('enterVehicle', { vehicleId });
  }

  sendVehicleExit() {
    if (!this.room) return;
    this.room.send('exitVehicle', {});
  }

  sendVehicleInput(vehicleId: string, throttle: number, steering: number, brake: boolean, handbrake: boolean) {
    if (!this.room) return;

    this.room.send('vehicleInput', {
      vehicleId,
      throttle,
      steering,
      brake,
      handbrake,
    });
  }

  sendPickup(pickupId: string) {
    if (!this.room) return;
    this.room.send('pickup', { pickupId });
  }

  sendDamage(targetId: string, amount: number, type: 'player' | 'vehicle' | 'npc') {
    if (!this.room) return;
    this.room.send('damage', { targetId, amount, type });
  }

  sendChat(text: string) {
    if (!this.room) return;
    this.room.send('chat', { text });
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }

  get playerId(): string {
    return this.localPlayerId;
  }

  get roomId(): string | null {
    return this.room?.roomId || null;
  }

  get playerCount(): number {
    return this.remotePlayers.size + 1;
  }

  getRemotePlayers(): RemotePlayer[] {
    return Array.from(this.remotePlayers.values());
  }

  getRoomLink(): string {
    if (!this.room) return '';
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?room=${this.room.roomId}`;
  }

  dispose() {
    this.disconnect();
    this.removeAllListeners();
  }
}
