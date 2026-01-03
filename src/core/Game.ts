import * as THREE from 'three';
import { GameConfig, SaveData, GameEventType } from '@/types';
import { EventEmitter, globalEvents } from './EventEmitter';
import { InputManager } from './InputManager';
import { Renderer } from './Renderer';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { RapierVehiclePhysics } from '@/physics/RapierVehiclePhysics';
import { Player } from '@/player/Player';
import { VehicleManager } from '@/vehicles/VehicleManager';
import { AIManager } from '@/ai/AIManager';
import { TrafficManager } from '@/traffic/TrafficManager';
import { MissionManager } from '@/missions/MissionManager';
import { InventoryManager } from '@/inventory/InventoryManager';
import { WeatherSystem } from '@/weather/WeatherSystem';
import { AudioManager } from '@/audio/AudioManager';
import { UIManager } from '@/ui/UIManager';
import { World } from '@/world/World';
import { SaveManager } from './SaveManager';
import { WeaponSystem } from '@/weapons/WeaponSystem';
import { NetworkManager } from '@/network/NetworkManager';

export class Game extends EventEmitter {
  private static instance: Game;

  public config: GameConfig;
  public renderer: Renderer;
  public physics: PhysicsWorld;
  public vehiclePhysics: RapierVehiclePhysics;
  public input: InputManager;
  public player: Player;
  public vehicles: VehicleManager;
  public ai: AIManager;
  public traffic: TrafficManager;
  public missions: MissionManager;
  public inventory: InventoryManager;
  public weather: WeatherSystem;
  public audio: AudioManager;
  public ui: UIManager;
  public world: World;
  public save: SaveManager;
  public weapons: WeaponSystem;
  public network: NetworkManager;

  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  private clock: THREE.Clock;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private animationFrameId: number | null = null;
  private loadingProgress: number = 0;

  private constructor() {
    super();
    this.config = this.createDefaultConfig();
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.config.graphics.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      this.config.graphics.drawDistance
    );

    this.renderer = new Renderer(this.config.graphics);
    this.input = new InputManager();
    this.physics = new PhysicsWorld(this.config.physics);
    this.vehiclePhysics = new RapierVehiclePhysics(this.config.physics);
    this.player = new Player(this);
    this.vehicles = new VehicleManager(this);
    this.ai = new AIManager(this);
    this.traffic = new TrafficManager(this);
    this.missions = new MissionManager(this);
    this.inventory = new InventoryManager(this);
    this.weather = new WeatherSystem(this);
    this.audio = new AudioManager(this.config.audio);
    this.ui = new UIManager(this);
    this.world = new World(this);
    this.save = new SaveManager();
    this.weapons = new WeaponSystem(this);
    this.network = new NetworkManager(this);
  }

  static getInstance(): Game {
    if (!Game.instance) {
      Game.instance = new Game();
    }
    return Game.instance;
  }

  private createDefaultConfig(): GameConfig {
    // Detect mobile for performance optimization
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                     ('ontouchstart' in window) ||
                     window.innerWidth < 768;

    return {
      debug: false,
      graphics: {
        antialias: !isMobile, // Disable on mobile
        shadows: !isMobile, // Disable shadows on mobile
        shadowMapSize: isMobile ? 512 : 2048,
        postProcessing: !isMobile, // Disable post-processing on mobile
        bloom: !isMobile,
        ssao: false, // Disable SSAO everywhere (expensive)
        dof: false,
        motionBlur: false, // Disable motion blur
        fov: 75,
        drawDistance: isMobile ? 300 : 1000 // Reduce draw distance on mobile
      },
      audio: {
        masterVolume: 1.0,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        radioVolume: 0.6
      },
      physics: {
        gravity: -30,
        substeps: isMobile ? 3 : 5, // Fewer physics substeps on mobile
        friction: 0.5,
        restitution: 0.3
      },
      gameplay: {
        difficulty: 'normal',
        autoAim: isMobile, // Enable auto-aim on mobile
        invertY: false,
        mouseSensitivity: 0.5
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      this.updateLoadingProgress(5, 'Initializing renderer...');
      await this.renderer.initialize(this.scene, this.camera);
      this.input.initialize(this.renderer.getCanvas());

      this.updateLoadingProgress(15, 'Setting up physics...');
      await this.physics.initialize();
      await this.vehiclePhysics.initialize();
      this.vehiclePhysics.createGroundPlane();

      this.updateLoadingProgress(25, 'Loading world...');
      await this.world.initialize();

      this.updateLoadingProgress(40, 'Creating player...');
      await this.player.initialize();

      this.updateLoadingProgress(50, 'Setting up vehicles...');
      await this.vehicles.initialize();

      this.updateLoadingProgress(60, 'Initializing AI...');
      await this.ai.initialize();

      this.updateLoadingProgress(70, 'Setting up traffic...');
      await this.traffic.initialize();

      this.updateLoadingProgress(75, 'Loading missions...');
      await this.missions.initialize();

      this.updateLoadingProgress(80, 'Setting up inventory...');
      await this.inventory.initialize();

      this.updateLoadingProgress(82, 'Loading weapons...');
      await this.weapons.initialize();

      this.updateLoadingProgress(85, 'Initializing weather...');
      await this.weather.initialize();

      this.updateLoadingProgress(90, 'Loading audio...');
      await this.audio.initialize();

      this.updateLoadingProgress(95, 'Setting up UI...');
      await this.ui.initialize();

      this.setupEventListeners();
      this.setupWindowResize();

      this.updateLoadingProgress(100, 'Ready!');

      setTimeout(() => {
        this.hideLoadingScreen();
        this.start();
      }, 500);

    } catch (error) {
      console.error('Failed to initialize game:', error);
      throw error;
    }
  }

  private updateLoadingProgress(progress: number, text: string): void {
    this.loadingProgress = progress;
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');
    if (loadingBar) loadingBar.style.width = `${progress}%`;
    if (loadingText) loadingText.textContent = text;
  }

  private hideLoadingScreen(): void {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
    }
  }

  private setupEventListeners(): void {
    this.input.on('pause', () => this.togglePause());

    globalEvents.on('player_death', () => {
      this.handlePlayerDeath();
    });

    globalEvents.on('mission_complete', (data: unknown) => {
      this.handleMissionComplete(data as { missionId: string });
    });
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.resize(width, height);
    });
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.gameLoop();
    console.log('Game started!');
  }

  private gameLoop(): void {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());

    const deltaTime = Math.min(this.clock.getDelta(), 0.1);

    if (!this.isPaused) {
      this.update(deltaTime);
    }

    this.render();
    this.input.resetDeltas();
  }

  private update(deltaTime: number): void {
    // 1. Process vehicle input (sets forces for physics)
    this.vehicles.update(deltaTime);

    // 2. Step physics simulation (applies velocities/forces, detects collisions)
    this.physics.update(deltaTime);
    this.vehiclePhysics.update(deltaTime);

    // 3. Sync mesh positions from physics bodies BEFORE player update
    //    This ensures player camera sees the correct vehicle position
    this.vehicles.syncWithPhysics();
    this.player.syncWithPhysics();

    // 4. Update player (uses synced vehicle position for camera)
    this.player.update(deltaTime);

    // 5. Update AI and traffic
    this.ai.update(deltaTime);
    this.traffic.update(deltaTime);

    // 6. Update non-physics systems
    this.missions.update(deltaTime);
    this.weather.update(deltaTime);
    this.world.update(deltaTime);
    this.weapons.update(deltaTime);
    this.ui.update(deltaTime);
    this.network.update(deltaTime);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  togglePause(): void {
    this.isPaused = !this.isPaused;
    this.emit('pauseChange', { paused: this.isPaused });

    if (this.isPaused) {
      this.input.unlock();
      this.audio.pauseAll();
      this.ui.showPauseMenu();
    } else {
      this.audio.resumeAll();
      this.ui.hidePauseMenu();
    }
  }

  pause(): void {
    if (!this.isPaused) {
      this.togglePause();
    }
  }

  resume(): void {
    if (this.isPaused) {
      this.togglePause();
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.clock.stop();
  }

  private handlePlayerDeath(): void {
    this.player.respawn();
    this.missions.failCurrentMission('death');
  }

  private handleMissionComplete(data: { missionId: string }): void {
    this.ui.showNotification(`Mission Complete: ${data.missionId}`);
  }

  emitGameEvent(type: GameEventType, data?: unknown): void {
    globalEvents.emit(type, data);
  }

  async saveGame(slot: number): Promise<void> {
    const saveData = this.createSaveData();
    await this.save.save(slot, saveData);
    this.ui.showNotification('Game Saved');
  }

  async loadGame(slot: number): Promise<void> {
    const saveData = await this.save.load(slot);
    if (saveData) {
      await this.applySaveData(saveData);
      this.ui.showNotification('Game Loaded');
    }
  }

  private createSaveData(): SaveData {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      player: {
        stats: this.player.stats,
        position: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z
        },
        rotation: this.player.rotation.y,
        inventory: this.inventory.serialize()
      },
      world: {
        weather: this.weather.getCurrentWeather(),
        timeOfDay: this.weather.getTimeOfDay(),
        completedMissions: this.missions.getCompletedMissions(),
        unlockedAreas: this.world.getUnlockedAreas(),
        garageVehicles: this.vehicles.getGarageVehicles()
      },
      settings: this.config
    };
  }

  private async applySaveData(data: SaveData): Promise<void> {
    this.player.stats = { ...data.player.stats };
    this.player.setPosition(
      data.player.position.x,
      data.player.position.y,
      data.player.position.z
    );
    this.player.setRotation(data.player.rotation);
    this.inventory.deserialize(data.player.inventory);
    this.weather.setWeather(data.world.weather);
    this.weather.setTimeOfDay(data.world.timeOfDay);
    this.missions.setCompletedMissions(data.world.completedMissions);
    this.config = data.settings;
  }

  getElapsedTime(): number {
    return this.clock.elapsedTime;
  }

  getDeltaTime(): number {
    return this.clock.getDelta();
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.physics.dispose();
    this.vehiclePhysics.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.world.dispose();
    this.network.dispose();
  }
}
