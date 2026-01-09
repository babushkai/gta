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
import { CityEventsManager } from '@/world/CityEventsManager';
import { CityDetailsManager } from '@/world/CityDetailsManager';
import { ChunkManager } from '@/world/ChunkManager';
import { InteriorManager } from '@/interiors/InteriorManager';
import { SaveManager } from './SaveManager';
import { WeaponSystem } from '@/weapons/WeaponSystem';
import { NetworkManager } from '@/network/NetworkManager';
import { AssetManager } from './AssetManager';
import { PerformanceManager } from './PerformanceManager';

/**
 * Detect Apple Silicon Mac (M1/M2/M3/M4 chips)
 * Uses WebGL renderer info to identify Apple GPU
 * Works with Chrome (ANGLE), Safari, and Firefox
 */
function detectAppleSilicon(): boolean {
  const ua = navigator.userAgent;
  const isMac = /Macintosh/.test(ua);

  if (!isMac) {
    console.log('🔍 GPU Detection: Not a Mac');
    return false;
  }

  // Check for Apple GPU via WebGL
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

        console.log('🔍 GPU Detection - Renderer:', renderer);
        console.log('🔍 GPU Detection - Vendor:', vendor);

        // Check for Apple Silicon patterns:
        // Safari: "Apple M1 Pro" or "Apple GPU"
        // Chrome: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, ...)"
        // Firefox: "Apple M4 Max" or similar
        const isAppleGPU = /Apple M\d|Apple GPU/i.test(renderer) ||
                          (/Apple/.test(renderer) && !/Intel/.test(renderer)) ||
                          (/ANGLE.*Apple.*M\d/i.test(renderer));

        if (isAppleGPU) {
          console.log('🍎 Apple Silicon detected:', renderer);
          return true;
        }

        // Check if it's an Intel Mac
        if (/Intel/.test(renderer)) {
          console.log('💻 Intel Mac detected:', renderer);
          return false;
        }
      }
    }
  } catch (e) {
    console.log('🔍 GPU Detection: WebGL error', e);
  }

  // Fallback: Modern Macs (2020+) are likely Apple Silicon
  // Check Safari on Mac as strong indicator
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  if (isSafari) {
    console.log('🍎 Apple Silicon assumed (Safari on Mac)');
    return true;
  }

  // Final fallback: Assume Apple Silicon for Macs (most new Macs are M-series)
  console.log('🍎 Apple Silicon assumed (Mac detected, likely M-series)');
  return true;
}

// Cache detection result
const isAppleSilicon = detectAppleSilicon();

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
  public cityEvents: CityEventsManager;
  public cityDetails: CityDetailsManager;
  public chunkManager: ChunkManager | null = null;
  public interiors: InteriorManager;
  public save: SaveManager;
  public weapons: WeaponSystem;
  public network: NetworkManager;
  public assets: AssetManager;
  public performance: PerformanceManager | null = null;

  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  private clock: THREE.Clock;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private animationFrameId: number | null = null;
  private loadingProgress: number = 0;

  // Store bound handler for cleanup
  private boundOnResize: (() => void) | null = null;

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
    this.cityEvents = new CityEventsManager(this);
    this.cityDetails = new CityDetailsManager(this);
    this.interiors = new InteriorManager(this);
    this.save = new SaveManager();
    this.weapons = new WeaponSystem(this);
    this.network = new NetworkManager(this);
    this.assets = AssetManager.getInstance();
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

    // Apple Silicon M-series: Maximum quality settings
    if (isAppleSilicon && !isMobile) {
      console.log('🚀 Using Apple Silicon M4 hyper-optimized settings');
      return {
        debug: false,
        graphics: {
          antialias: true,          // Enable MSAA - M4 handles it easily
          shadows: true,
          shadowMapSize: 4096,      // 4K shadow maps for crisp shadows
          postProcessing: true,
          bloom: true,
          ssao: true,               // Full SSAO enabled
          dof: false,               // Keep disabled for responsiveness
          motionBlur: false,
          fov: 75,
          drawDistance: 8000        // Extended visibility
        },
        audio: {
          masterVolume: 1.0,
          musicVolume: 0.7,
          sfxVolume: 0.8,
          radioVolume: 0.6
        },
        physics: {
          gravity: -30,
          substeps: 3,              // Higher physics accuracy
          friction: 0.5,
          restitution: 0.3
        },
        gameplay: {
          difficulty: 'normal',
          autoAim: false,
          invertY: false,
          mouseSensitivity: 0.5
        }
      };
    }

    // Standard desktop/mobile config
    return {
      debug: false,
      graphics: {
        antialias: false,           // Disable for performance
        shadows: !isMobile,
        shadowMapSize: isMobile ? 256 : 1024,
        postProcessing: !isMobile,
        bloom: !isMobile,
        ssao: false,
        dof: false,
        motionBlur: false,
        fov: 75,
        drawDistance: isMobile ? 500 : 5000
      },
      audio: {
        masterVolume: 1.0,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        radioVolume: 0.6
      },
      physics: {
        gravity: -30,
        substeps: 2,
        friction: 0.5,
        restitution: 0.3
      },
      gameplay: {
        difficulty: 'normal',
        autoAim: isMobile,
        invertY: false,
        mouseSensitivity: 0.5
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      this.updateLoadingProgress(2, 'Initializing renderer...');
      await this.renderer.initialize(this.scene, this.camera);
      this.input.initialize(this.renderer.getCanvas());

      // Pre-compile shaders during loading to prevent lag when turning around
      this.updateLoadingProgress(5, 'Pre-compiling shaders...');
      await this.assets.precompileShaders(
        this.renderer.getRenderer(),
        (progress, message) => {
          // Map shader compilation progress (0-100) to loading progress (5-15)
          const loadProgress = 5 + (progress / 100) * 10;
          this.updateLoadingProgress(loadProgress, message);
        }
      );
      this.assets.precacheGeometries();

      this.updateLoadingProgress(18, 'Setting up physics...');
      await this.physics.initialize();
      await this.vehiclePhysics.initialize();
      this.vehiclePhysics.createGroundPlane();

      this.updateLoadingProgress(25, 'Loading world...');
      await this.world.initialize();

      this.updateLoadingProgress(27, 'Initializing world streaming...');
      this.chunkManager = new ChunkManager(this);
      await this.chunkManager.initialize();

      this.updateLoadingProgress(30, 'Bringing city to life...');
      await this.cityEvents.initialize();

      this.updateLoadingProgress(35, 'Adding city details...');
      await this.cityDetails.initialize();

      this.updateLoadingProgress(38, 'Setting up interiors...');
      await this.interiors.initialize();

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
      // Background lofi music disabled for now
      // this.audio.startBackgroundMusic();

      this.updateLoadingProgress(93, 'Setting up UI...');
      await this.ui.initialize();

      this.setupEventListeners();
      this.setupWindowResize();

      // Final scene optimization pass
      this.updateLoadingProgress(97, 'Optimizing scene...');
      this.world.optimizeStaticObjects();
      this.cityDetails.optimizeStaticObjects();
      this.renderer.optimizeScene(this.scene);

      // Initialize performance manager for adaptive quality
      this.performance = new PerformanceManager(this.scene, this.camera);

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
    this.boundOnResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.resize(width, height);
    };
    window.addEventListener('resize', this.boundOnResize);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.gameLoop();
    console.log('Game started!');
  }

  // Performance: frame counter for staggered updates
  private frameCounter: number = 0;

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
    this.frameCounter++;

    // === CRITICAL PATH (every frame) ===
    // 1. Process vehicle input (sets forces for physics)
    this.vehicles.update(deltaTime);

    // 2. Step physics simulation (applies velocities/forces, detects collisions)
    this.physics.update(deltaTime);
    this.vehiclePhysics.update(deltaTime);

    // 3. Sync mesh positions from physics bodies BEFORE player update
    this.vehicles.syncWithPhysics();
    this.player.syncWithPhysics();

    // 4. Update player (uses synced vehicle position for camera)
    this.player.update(deltaTime);

    // 5. Update weapons (critical for combat responsiveness)
    this.weapons.update(deltaTime);

    // === HIGH PRIORITY (every frame) ===
    // 6. Update AI and traffic
    this.ai.update(deltaTime);
    this.traffic.update(deltaTime);

    // === MEDIUM PRIORITY (staggered updates) ===
    // 7. Update world systems (stagger across frames)
    const frame2 = this.frameCounter % 2;
    const frame3 = this.frameCounter % 3;

    if (frame2 === 0) {
      // Update chunk streaming based on player position
      this.chunkManager?.update(this.player.position);
      this.world.update(deltaTime * 2);
      this.cityDetails.update(deltaTime * 2);
    }

    if (frame2 === 1) {
      this.cityEvents.update(deltaTime * 2);
      this.interiors.update(deltaTime * 2);
    }

    // === LOW PRIORITY (every 3rd frame) ===
    if (frame3 === 0) {
      this.missions.update(deltaTime * 3);
      this.weather.update(deltaTime * 3);
    }

    // === UI (every frame but lightweight) ===
    this.ui.update(deltaTime);

    // === NETWORK (every 2nd frame) ===
    if (frame2 === 0) {
      this.network.update(deltaTime * 2);
    }

    // === PERFORMANCE (every 10th frame) ===
    if (this.frameCounter % 10 === 0) {
      this.performance?.update(deltaTime * 10);
    }
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

    // Remove window resize listener to prevent memory leak
    if (this.boundOnResize) {
      window.removeEventListener('resize', this.boundOnResize);
      this.boundOnResize = null;
    }

    this.renderer.dispose();
    this.physics.dispose();
    this.vehiclePhysics.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.world.dispose();
    this.cityEvents.dispose();
    this.cityDetails.dispose();
    this.interiors.dispose();
    this.network.dispose();
  }
}
