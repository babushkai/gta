import * as THREE from 'three';
import { Game } from '@/core/Game';
import {
  ChunkData,
  ChunkState,
  ChunkCoord,
  ChunkManagerConfig,
  ChunkUtils,
  DEFAULT_CHUNK_CONFIG,
  MOBILE_CHUNK_CONFIG,
  DistrictType,
  DistrictBounds,
  BuildingDefinition,
  StreetFurnitureDefinition,
  SeededRandom
} from './ChunkData';

/**
 * Detect Apple Silicon for configuration
 */
function detectAppleSilicon(): boolean {
  const ua = navigator.userAgent;
  const isMac = /Macintosh/.test(ua);
  if (!isMac) return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return /Apple M\d|Apple GPU/i.test(renderer) ||
               (/Apple/.test(renderer) && !/Intel/.test(renderer)) ||
               (/ANGLE.*Apple.*M\d/i.test(renderer));
      }
    }
  } catch (e) { /* ignore */ }
  return true;
}

const isAppleSilicon = detectAppleSilicon();
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window);

/**
 * ChunkManager - Handles dynamic loading/unloading of world chunks
 *
 * Features:
 * - Chunk-based world streaming for large maps
 * - State machine for chunk lifecycle (UNLOADED → LOADING → LOADED → ACTIVE)
 * - Hysteresis to prevent load/unload thrashing
 * - Priority queue for closest chunks first
 * - Frame budget to prevent stutters
 * - Memory budget enforcement
 */
export class ChunkManager {
  private game: Game;
  private config: ChunkManagerConfig;

  // Chunk storage
  private chunks: Map<string, ChunkData> = new Map();

  // State tracking
  private chunksByState: {
    loading: Set<string>;
    loaded: Set<string>;
    active: Set<string>;
    unloading: Set<string>;
  } = {
    loading: new Set(),
    loaded: new Set(),
    active: new Set(),
    unloading: new Set()
  };

  // Player tracking
  private lastPlayerChunk: ChunkCoord = { cx: 0, cz: 0 };
  private playerPosition: THREE.Vector3 = new THREE.Vector3();

  // Loading queue (priority based)
  private loadQueue: ChunkCoord[] = [];
  private unloadQueue: string[] = [];

  // District definitions for the expanded map
  private districtBounds: DistrictBounds[] = [];

  // Statistics
  private stats = {
    totalChunks: 0,
    loadedChunks: 0,
    activeChunks: 0,
    memoryUsageMB: 0,
    avgLoadTimeMs: 0,
    loadTimes: [] as number[]
  };

  // World seed for deterministic generation
  private worldSeed: number = 12345;

  // Reference to Three.js groups
  private chunksContainer: THREE.Group;

  constructor(game: Game) {
    this.game = game;

    // Select config based on device
    this.config = isMobile ? MOBILE_CHUNK_CONFIG :
                  isAppleSilicon ? { ...DEFAULT_CHUNK_CONFIG, memoryBudgetMb: 512 } :
                  { ...DEFAULT_CHUNK_CONFIG, memoryBudgetMb: 256 };

    // Container for all chunk content
    this.chunksContainer = new THREE.Group();
    this.chunksContainer.name = 'ChunksContainer';

    // Initialize district bounds for expanded 5000x5000 map
    this.initializeDistrictBounds();
  }

  /**
   * Initialize district boundaries for the expanded map
   * IMPORTANT: Only covers areas OUTSIDE the existing World.ts city
   * The existing city covers roughly -400 to +400 in X, -500 to +500 in Z
   * We use a 600-unit buffer to avoid any overlap
   */
  private initializeDistrictBounds(): void {
    // ONLY generate buildings in NEW areas OUTSIDE the existing city
    // World.ts handles the core city (~±300), ChunkManager handles expansion from ±350
    // Map size: 2000x2000 (±1000 from center) for performance
    this.districtBounds = [
      // North expansion (z > 350)
      { type: 'uptown', minX: -1000, maxX: 1000, minZ: 350, maxZ: 1000 },

      // South expansion (z < -350)
      { type: 'industrial', minX: -1000, maxX: 1000, minZ: -1000, maxZ: -350 },

      // East expansion (x > 350)
      { type: 'residential', minX: 350, maxX: 1000, minZ: -350, maxZ: 350 },

      // West expansion (x < -350)
      { type: 'waterfront', minX: -1000, maxX: -350, minZ: -350, maxZ: 350 },

      // Corner expansions (within 2000x2000 bounds)
      { type: 'residential', minX: -1000, maxX: -350, minZ: 350, maxZ: 1000 },
      { type: 'uptown', minX: 350, maxX: 1000, minZ: 350, maxZ: 1000 },
      { type: 'industrial', minX: 350, maxX: 1000, minZ: -1000, maxZ: -350 },
      { type: 'warehouse', minX: -1000, maxX: -350, minZ: -1000, maxZ: -350 }
    ];
  }

  /**
   * Initialize the chunk manager
   */
  async initialize(): Promise<void> {
    // Add container to scene
    this.game.scene.add(this.chunksContainer);

    // Load initial chunks around spawn point (0, 0)
    const spawnChunk = ChunkUtils.worldToChunk(0, 0, this.config.chunkSize);
    this.lastPlayerChunk = spawnChunk;

    // Queue initial chunks
    const initialChunks = ChunkUtils.getChunksInRadius(spawnChunk, this.config.loadRadius);

    // Sort by distance (closest first)
    initialChunks.sort((a, b) => {
      const distA = ChunkUtils.chunkDistance(a, spawnChunk);
      const distB = ChunkUtils.chunkDistance(b, spawnChunk);
      return distA - distB;
    });

    // Load initial chunks synchronously for startup
    console.log(`🌍 ChunkManager: Loading ${initialChunks.length} initial chunks...`);

    for (const coord of initialChunks) {
      await this.loadChunk(coord);
      const dist = ChunkUtils.chunkDistance(coord, spawnChunk);
      if (dist <= this.config.activeRadius) {
        const chunk = this.chunks.get(ChunkUtils.getChunkKey(coord));
        if (chunk) {
          this.activateChunk(chunk);
        }
      }
    }

    console.log(`✅ ChunkManager: Initialized with ${this.chunks.size} chunks`);
  }

  /**
   * Main update loop - call every frame (or every 2 frames for performance)
   */
  update(playerPosition: THREE.Vector3): void {
    this.playerPosition.copy(playerPosition);
    const currentChunk = ChunkUtils.worldToChunk(
      playerPosition.x,
      playerPosition.z,
      this.config.chunkSize
    );

    // Check if player moved to a new chunk
    if (currentChunk.cx !== this.lastPlayerChunk.cx ||
        currentChunk.cz !== this.lastPlayerChunk.cz) {
      this.onPlayerChunkChange(currentChunk);
      this.lastPlayerChunk = currentChunk;
    }

    // Process loading queue (with frame budget)
    this.processLoadQueue();

    // Process unloading queue
    this.processUnloadQueue();

    // Update chunk states based on distance
    this.updateChunkStates(currentChunk);

    // Update statistics
    this.updateStats();
  }

  /**
   * Called when player moves to a new chunk
   */
  private onPlayerChunkChange(newChunk: ChunkCoord): void {
    // console.log(`📍 Player moved to chunk (${newChunk.cx}, ${newChunk.cz})`);

    // Get all chunks that should be loaded
    const chunksToLoad = ChunkUtils.getChunksInRadius(newChunk, this.config.loadRadius);

    // Filter to only unloaded chunks and sort by distance
    const unloadedChunks = chunksToLoad.filter(coord => {
      const key = ChunkUtils.getChunkKey(coord);
      return !this.chunks.has(key) && !this.loadQueue.some(
        q => q.cx === coord.cx && q.cz === coord.cz
      );
    });

    unloadedChunks.sort((a, b) => {
      const distA = ChunkUtils.chunkDistance(a, newChunk);
      const distB = ChunkUtils.chunkDistance(b, newChunk);
      return distA - distB;
    });

    // Add to load queue
    this.loadQueue.push(...unloadedChunks);

    // Identify chunks to unload (beyond UNLOAD_RADIUS)
    this.chunks.forEach((chunk, key) => {
      const dist = ChunkUtils.chunkDistance(chunk.coord, newChunk);

      if (dist > this.config.unloadRadius &&
          chunk.state !== ChunkState.UNLOADING &&
          !this.unloadQueue.includes(key)) {
        this.unloadQueue.push(key);
      }
    });
  }

  /**
   * Process the load queue with frame budget
   */
  private processLoadQueue(): void {
    if (this.loadQueue.length === 0) return;

    const startTime = performance.now();
    let loaded = 0;

    while (
      this.loadQueue.length > 0 &&
      this.chunksByState.loading.size < this.config.maxConcurrentLoads &&
      performance.now() - startTime < this.config.frameBudgetMs
    ) {
      const coord = this.loadQueue.shift()!;
      const key = ChunkUtils.getChunkKey(coord);

      if (!this.chunks.has(key)) {
        this.loadChunkAsync(coord);
        loaded++;
      }
    }
  }

  /**
   * Process the unload queue
   */
  private processUnloadQueue(): void {
    if (this.unloadQueue.length === 0) return;

    // Unload one chunk per frame to prevent stutters
    const key = this.unloadQueue.shift()!;
    const chunk = this.chunks.get(key);

    if (chunk && chunk.state !== ChunkState.UNLOADING) {
      this.unloadChunk(chunk);
    }
  }

  /**
   * Update chunk states based on distance from player
   */
  private updateChunkStates(playerChunk: ChunkCoord): void {
    this.chunks.forEach((chunk) => {
      const dist = ChunkUtils.chunkDistance(chunk.coord, playerChunk);

      // Activate chunks within ACTIVE_RADIUS
      if (dist <= this.config.activeRadius) {
        if (chunk.state === ChunkState.LOADED) {
          this.activateChunk(chunk);
        }
      }
      // Deactivate chunks beyond ACTIVE_RADIUS but within LOAD_RADIUS
      else if (dist <= this.config.loadRadius) {
        if (chunk.state === ChunkState.ACTIVE) {
          this.deactivateChunk(chunk);
        }
      }
    });
  }

  /**
   * Load a chunk synchronously (used for initial load)
   */
  private async loadChunk(coord: ChunkCoord): Promise<void> {
    const key = ChunkUtils.getChunkKey(coord);
    if (this.chunks.has(key)) return;

    const startTime = performance.now();

    // Create chunk data
    const chunk = ChunkUtils.createEmptyChunk(coord, this.config.chunkSize);
    chunk.state = ChunkState.LOADING;
    chunk.loadStartTime = startTime;

    this.chunks.set(key, chunk);
    this.chunksByState.loading.add(key);

    // Generate content
    await this.generateChunkContent(chunk);

    // Add to scene
    if (chunk.buildingsGroup) {
      this.chunksContainer.add(chunk.buildingsGroup);
    }
    if (chunk.detailsGroup) {
      this.chunksContainer.add(chunk.detailsGroup);
    }

    // Update state
    chunk.state = ChunkState.LOADED;
    chunk.lastAccessTime = performance.now();
    this.chunksByState.loading.delete(key);
    this.chunksByState.loaded.add(key);

    // Track load time
    const loadTime = performance.now() - startTime;
    this.stats.loadTimes.push(loadTime);
    if (this.stats.loadTimes.length > 20) {
      this.stats.loadTimes.shift();
    }
  }

  /**
   * Load a chunk asynchronously (used during gameplay)
   */
  private async loadChunkAsync(coord: ChunkCoord): Promise<void> {
    const key = ChunkUtils.getChunkKey(coord);
    if (this.chunks.has(key)) return;

    // Create chunk placeholder
    const chunk = ChunkUtils.createEmptyChunk(coord, this.config.chunkSize);
    chunk.state = ChunkState.LOADING;
    chunk.loadStartTime = performance.now();

    this.chunks.set(key, chunk);
    this.chunksByState.loading.add(key);

    // Use requestIdleCallback for non-critical loading
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (callback: () => void) => number }).requestIdleCallback(async () => {
        await this.generateChunkContent(chunk);
        this.finalizeChunkLoad(chunk, key);
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(async () => {
        await this.generateChunkContent(chunk);
        this.finalizeChunkLoad(chunk, key);
      }, 0);
    }
  }

  /**
   * Finalize chunk loading after content generation
   */
  private finalizeChunkLoad(chunk: ChunkData, key: string): void {
    // Add to scene
    if (chunk.buildingsGroup) {
      this.chunksContainer.add(chunk.buildingsGroup);
    }
    if (chunk.detailsGroup) {
      this.chunksContainer.add(chunk.detailsGroup);
    }

    // Update state
    chunk.state = ChunkState.LOADED;
    chunk.lastAccessTime = performance.now();
    this.chunksByState.loading.delete(key);
    this.chunksByState.loaded.add(key);

    // Track load time
    const loadTime = performance.now() - chunk.loadStartTime;
    this.stats.loadTimes.push(loadTime);
    if (this.stats.loadTimes.length > 20) {
      this.stats.loadTimes.shift();
    }

    // Check if should be immediately activated
    const playerChunk = ChunkUtils.worldToChunk(
      this.playerPosition.x,
      this.playerPosition.z,
      this.config.chunkSize
    );
    const dist = ChunkUtils.chunkDistance(chunk.coord, playerChunk);
    if (dist <= this.config.activeRadius) {
      this.activateChunk(chunk);
    }
  }

  /**
   * Generate content for a chunk
   */
  private async generateChunkContent(chunk: ChunkData): Promise<void> {
    const district = this.getDistrictForChunk(chunk.coord);
    const seed = ChunkUtils.getChunkSeed(chunk.coord, this.worldSeed);
    const rng = new SeededRandom(seed);

    // Create groups (always needed even for empty chunks)
    chunk.buildingsGroup = new THREE.Group();
    chunk.buildingsGroup.name = `buildings_${chunk.key}`;

    chunk.detailsGroup = new THREE.Group();
    chunk.detailsGroup.name = `details_${chunk.key}`;

    // Skip all content for empty district (core city handled by World.ts)
    if (district === 'empty') {
      chunk.memoryUsage = 0;
      // console.log(`📍 Chunk ${chunk.key} is in core city area - skipping content generation`);
      return;
    }

    console.log(`🏗️ Generating content for chunk ${chunk.key} in ${district} district (bounds: ${chunk.bounds.minX},${chunk.bounds.minZ} to ${chunk.bounds.maxX},${chunk.bounds.maxZ})`);

    // Generate buildings based on district type
    const buildings = this.generateBuildingsForDistrict(chunk, district, rng);
    console.log(`   → Generated ${buildings.length} building definitions`);

    // Create meshes for buildings
    let meshCount = 0;
    for (const building of buildings) {
      const mesh = this.createBuildingMesh(building, rng);
      if (mesh) {
        chunk.buildingsGroup.add(mesh);
        chunk.buildings.set(building.id, building);
        meshCount++;
      }
    }
    console.log(`   → Created ${meshCount} building meshes`);

    // Generate roads for this chunk
    this.generateRoadsForChunk(chunk);

    // Add special features based on district
    if (district === 'waterfront') {
      this.generateWaterFeatures(chunk, rng);
    }

    // Chance for a park or plaza
    if (rng.chance(0.15)) {
      this.generateParkOrPlaza(chunk, district, rng);
    }

    // Generate street furniture
    const furniture = this.generateStreetFurniture(chunk, rng);
    for (const item of furniture) {
      const mesh = this.createStreetFurnitureMesh(item);
      if (mesh) {
        chunk.detailsGroup.add(mesh);
      }
    }

    // Add district-specific props
    this.generateDistrictProps(chunk, district, rng);

    // Estimate memory usage
    chunk.memoryUsage = this.estimateChunkMemory(chunk);
  }

  /**
   * Generate water features for waterfront district
   */
  private generateWaterFeatures(chunk: ChunkData, rng: SeededRandom): void {
    const { bounds } = chunk;

    // Water plane at edge of chunk
    const waterWidth = 80;
    const waterDepth = bounds.maxZ - bounds.minZ;

    const waterGeo = new THREE.PlaneGeometry(waterWidth, waterDepth);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a5276,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85
    });

    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(bounds.minX - waterWidth / 2, 0.2, (bounds.minZ + bounds.maxZ) / 2);
    this.markStatic(water);
    chunk.detailsGroup!.add(water);

    // Add pier/dock
    if (rng.chance(0.6)) {
      const pierLength = rng.range(30, 60);
      const pierGeo = new THREE.BoxGeometry(8, 1.5, pierLength);
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
      const pier = new THREE.Mesh(pierGeo, pierMat);
      pier.position.set(bounds.minX - pierLength / 2, 1.5, bounds.minZ + rng.range(20, waterDepth - 20));
      pier.castShadow = true;
      this.markStatic(pier);
      chunk.detailsGroup!.add(pier);

      // Pier posts
      for (let i = 0; i < 4; i++) {
        const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
        const post = new THREE.Mesh(postGeo, pierMat);
        post.position.set(
          bounds.minX - 10 - i * 12,
          0,
          pier.position.z + rng.range(-3, 3)
        );
        this.markStatic(post);
        chunk.detailsGroup!.add(post);
      }
    }

    // Add boats
    if (rng.chance(0.4)) {
      this.createBoat(chunk, bounds.minX - 30, bounds.minZ + rng.range(30, waterDepth - 30), rng);
    }
  }

  /**
   * Create a simple boat
   */
  private createBoat(chunk: ChunkData, x: number, z: number, rng: SeededRandom): void {
    const boatGroup = new THREE.Group();

    // Hull
    const hullGeo = new THREE.BoxGeometry(4, 2, 10);
    const hullMat = new THREE.MeshStandardMaterial({ color: rng.pick([0xFFFFFF, 0x1E90FF, 0x8B0000]) });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 1;
    this.markStatic(hull);
    boatGroup.add(hull);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(3, 2, 4);
    const cabin = new THREE.Mesh(cabinGeo, hullMat);
    cabin.position.set(0, 3, -1);
    this.markStatic(cabin);
    boatGroup.add(cabin);

    boatGroup.position.set(x, 0.5, z);
    boatGroup.rotation.y = rng.range(-0.3, 0.3);
    chunk.detailsGroup!.add(boatGroup);
  }

  /**
   * Generate a park or plaza
   */
  private generateParkOrPlaza(chunk: ChunkData, district: DistrictType, rng: SeededRandom): void {
    const { bounds } = chunk;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    const isPlaza = district === 'downtown' || district === 'midtown' || rng.chance(0.5);

    if (isPlaza) {
      // Urban plaza
      const plazaSize = rng.range(30, 50);
      const plazaGeo = new THREE.PlaneGeometry(plazaSize, plazaSize);
      const plazaMat = new THREE.MeshStandardMaterial({ color: 0xA0A0A0, roughness: 0.9 });
      const plaza = new THREE.Mesh(plazaGeo, plazaMat);
      plaza.rotation.x = -Math.PI / 2;
      plaza.position.set(centerX, 0.05, centerZ);
      this.markStatic(plaza);
      chunk.detailsGroup!.add(plaza);

      // Fountain in center
      if (rng.chance(0.6)) {
        this.createFountain(chunk, centerX, centerZ, rng);
      }

      // Benches around plaza
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const dist = plazaSize * 0.35;
        const benchX = centerX + Math.cos(angle) * dist;
        const benchZ = centerZ + Math.sin(angle) * dist;
        this.createBench(chunk, benchX, benchZ, angle + Math.PI / 2);
      }
    } else {
      // Green park
      const parkSize = rng.range(40, 70);
      const parkGeo = new THREE.PlaneGeometry(parkSize, parkSize);
      const parkMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.95 });
      const park = new THREE.Mesh(parkGeo, parkMat);
      park.rotation.x = -Math.PI / 2;
      park.position.set(centerX, 0.05, centerZ);
      this.markStatic(park);
      chunk.detailsGroup!.add(park);

      // Trees in park
      const treeCount = rng.int(5, 12);
      for (let i = 0; i < treeCount; i++) {
        const treeX = centerX + rng.range(-parkSize / 2.5, parkSize / 2.5);
        const treeZ = centerZ + rng.range(-parkSize / 2.5, parkSize / 2.5);
        this.createTree(chunk, treeX, treeZ, rng);
      }

      // Walking path
      const pathGeo = new THREE.PlaneGeometry(4, parkSize * 0.8);
      const pathMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 0.9 });
      const path = new THREE.Mesh(pathGeo, pathMat);
      path.rotation.x = -Math.PI / 2;
      path.position.set(centerX, 0.06, centerZ);
      this.markStatic(path);
      chunk.detailsGroup!.add(path);

      // Benches along path
      for (let i = 0; i < 3; i++) {
        this.createBench(chunk, centerX + 4, centerZ - parkSize / 3 + i * parkSize / 3, Math.PI / 2);
      }
    }
  }

  /**
   * Create a fountain
   */
  private createFountain(chunk: ChunkData, x: number, z: number, rng: SeededRandom): void {
    const fountainGroup = new THREE.Group();

    // Base pool
    const poolGeo = new THREE.CylinderGeometry(5, 6, 1, 16);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.7 });
    const pool = new THREE.Mesh(poolGeo, stoneMat);
    pool.position.y = 0.5;
    this.markStatic(pool);
    fountainGroup.add(pool);

    // Water in pool
    const waterGeo = new THREE.CylinderGeometry(4.5, 4.5, 0.3, 16);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x4169E1,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.8
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0.85;
    this.markStatic(water);
    fountainGroup.add(water);

    // Center column
    const columnGeo = new THREE.CylinderGeometry(0.8, 1, 4, 12);
    const column = new THREE.Mesh(columnGeo, stoneMat);
    column.position.y = 2.5;
    this.markStatic(column);
    fountainGroup.add(column);

    // Top basin
    const basinGeo = new THREE.CylinderGeometry(2, 1.5, 0.8, 12);
    const basin = new THREE.Mesh(basinGeo, stoneMat);
    basin.position.y = 4.5;
    this.markStatic(basin);
    fountainGroup.add(basin);

    fountainGroup.position.set(x, 0, z);
    chunk.detailsGroup!.add(fountainGroup);
  }

  /**
   * Create a bench
   */
  private createBench(chunk: ChunkData, x: number, z: number, rotation: number): void {
    const benchGroup = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });

    // Seat
    const seatGeo = new THREE.BoxGeometry(2, 0.15, 0.6);
    const seat = new THREE.Mesh(seatGeo, woodMat);
    seat.position.y = 0.5;
    this.markStatic(seat);
    benchGroup.add(seat);

    // Back
    const backGeo = new THREE.BoxGeometry(2, 0.6, 0.1);
    const back = new THREE.Mesh(backGeo, woodMat);
    back.position.set(0, 0.9, -0.25);
    this.markStatic(back);
    benchGroup.add(back);

    // Legs
    for (let i = -1; i <= 1; i += 2) {
      const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.5);
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(i * 0.8, 0.25, 0);
      this.markStatic(leg);
      benchGroup.add(leg);
    }

    benchGroup.position.set(x, 0, z);
    benchGroup.rotation.y = rotation;
    chunk.detailsGroup!.add(benchGroup);
  }

  /**
   * Create a tree
   */
  private createTree(chunk: ChunkData, x: number, z: number, rng: SeededRandom): void {
    const treeGroup = new THREE.Group();

    const trunkHeight = rng.range(3, 6);
    const crownRadius = rng.range(2, 4);

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, trunkHeight, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    this.markStatic(trunk);
    treeGroup.add(trunk);

    // Crown (foliage)
    const crownGeo = new THREE.SphereGeometry(crownRadius, 8, 6);
    const crownMat = new THREE.MeshStandardMaterial({
      color: rng.pick([0x228B22, 0x2E8B57, 0x006400, 0x32CD32]),
      roughness: 0.9
    });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = trunkHeight + crownRadius * 0.5;
    crown.castShadow = true;
    this.markStatic(crown);
    treeGroup.add(crown);

    treeGroup.position.set(x, 0, z);
    chunk.detailsGroup!.add(treeGroup);
  }

  /**
   * Generate district-specific props
   */
  private generateDistrictProps(chunk: ChunkData, district: DistrictType, rng: SeededRandom): void {
    const { bounds } = chunk;

    switch (district) {
      case 'industrial':
      case 'warehouse':
        // Shipping containers
        if (rng.chance(0.4)) {
          const containerCount = rng.int(2, 6);
          for (let i = 0; i < containerCount; i++) {
            const cx = bounds.minX + rng.range(20, bounds.maxX - bounds.minX - 20);
            const cz = bounds.minZ + rng.range(20, bounds.maxZ - bounds.minZ - 20);
            this.createShippingContainer(chunk, cx, cz, rng);
          }
        }

        // Cranes
        if (rng.chance(0.2)) {
          const craneX = bounds.minX + rng.range(30, bounds.maxX - bounds.minX - 30);
          const craneZ = bounds.minZ + rng.range(30, bounds.maxZ - bounds.minZ - 30);
          this.createCrane(chunk, craneX, craneZ, rng);
        }
        break;

      case 'residential':
        // Playgrounds
        if (rng.chance(0.15)) {
          const playX = bounds.minX + rng.range(30, bounds.maxX - bounds.minX - 30);
          const playZ = bounds.minZ + rng.range(30, bounds.maxZ - bounds.minZ - 30);
          this.createPlayground(chunk, playX, playZ, rng);
        }
        break;

      case 'uptown':
        // Elegant lamp posts
        const lampCount = rng.int(3, 6);
        for (let i = 0; i < lampCount; i++) {
          const lx = bounds.minX + rng.range(10, bounds.maxX - bounds.minX - 10);
          const lz = bounds.minZ + rng.range(10, bounds.maxZ - bounds.minZ - 10);
          this.createElegantLamp(chunk, lx, lz);
        }
        break;
    }
  }

  /**
   * Create shipping container
   */
  private createShippingContainer(chunk: ChunkData, x: number, z: number, rng: SeededRandom): void {
    const containerGeo = new THREE.BoxGeometry(12, 3, 2.5);
    const containerMat = new THREE.MeshStandardMaterial({
      color: rng.pick([0x8B0000, 0x00008B, 0x006400, 0xFF8C00, 0x4B0082]),
      roughness: 0.6,
      metalness: 0.4
    });
    const container = new THREE.Mesh(containerGeo, containerMat);

    // Stack containers
    const stackHeight = rng.int(1, 3);
    container.position.set(x, 1.5 + (stackHeight - 1) * 3, z);
    container.rotation.y = rng.pick([0, Math.PI / 2]);
    container.castShadow = true;
    this.markStatic(container);
    chunk.detailsGroup!.add(container);

    // Add more containers in stack
    for (let i = 1; i < stackHeight; i++) {
      const stackContainer = container.clone();
      stackContainer.position.y = 1.5 + (i - 1) * 3;
      stackContainer.material = new THREE.MeshStandardMaterial({
        color: rng.pick([0x8B0000, 0x00008B, 0x006400, 0xFF8C00, 0x4B0082]),
        roughness: 0.6,
        metalness: 0.4
      });
      this.markStatic(stackContainer);
      chunk.detailsGroup!.add(stackContainer);
    }
  }

  /**
   * Create crane
   */
  private createCrane(chunk: ChunkData, x: number, z: number, rng: SeededRandom): void {
    const craneGroup = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.5, metalness: 0.6 });

    // Tower
    const towerHeight = rng.range(40, 60);
    const towerGeo = new THREE.BoxGeometry(3, towerHeight, 3);
    const tower = new THREE.Mesh(towerGeo, metalMat);
    tower.position.y = towerHeight / 2;
    tower.castShadow = true;
    this.markStatic(tower);
    craneGroup.add(tower);

    // Arm
    const armLength = rng.range(25, 40);
    const armGeo = new THREE.BoxGeometry(armLength, 2, 2);
    const arm = new THREE.Mesh(armGeo, metalMat);
    arm.position.set(armLength / 2 - 2, towerHeight - 2, 0);
    arm.castShadow = true;
    this.markStatic(arm);
    craneGroup.add(arm);

    // Counter weight
    const counterGeo = new THREE.BoxGeometry(8, 3, 3);
    const counter = new THREE.Mesh(counterGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    counter.position.set(-8, towerHeight - 3, 0);
    this.markStatic(counter);
    craneGroup.add(counter);

    craneGroup.position.set(x, 0, z);
    craneGroup.rotation.y = rng.range(0, Math.PI * 2);
    chunk.detailsGroup!.add(craneGroup);
  }

  /**
   * Create playground
   */
  private createPlayground(chunk: ChunkData, x: number, z: number, rng: SeededRandom): void {
    const playGroup = new THREE.Group();

    // Ground mat
    const matGeo = new THREE.PlaneGeometry(15, 15);
    const matMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.95 });
    const mat = new THREE.Mesh(matGeo, matMaterial);
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.02;
    this.markStatic(mat);
    playGroup.add(mat);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xFF4500, metalness: 0.5 });

    // Swing set
    const swingFrameGeo = new THREE.BoxGeometry(0.2, 4, 6);
    const frame1 = new THREE.Mesh(swingFrameGeo, metalMat);
    frame1.position.set(-2, 2, 0);
    frame1.rotation.z = 0.2;
    this.markStatic(frame1);
    playGroup.add(frame1);

    const frame2 = frame1.clone();
    frame2.position.x = 2;
    frame2.rotation.z = -0.2;
    this.markStatic(frame2);
    playGroup.add(frame2);

    // Top bar
    const topBarGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.5, 8);
    const topBar = new THREE.Mesh(topBarGeo, metalMat);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.y = 3.8;
    this.markStatic(topBar);
    playGroup.add(topBar);

    // Slide
    const slideGeo = new THREE.BoxGeometry(1.5, 0.1, 5);
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x4169E1, metalness: 0.7 });
    const slide = new THREE.Mesh(slideGeo, slideMat);
    slide.position.set(5, 1.5, 0);
    slide.rotation.x = -0.4;
    this.markStatic(slide);
    playGroup.add(slide);

    playGroup.position.set(x, 0, z);
    chunk.detailsGroup!.add(playGroup);
  }

  /**
   * Create elegant lamp post
   */
  private createElegantLamp(chunk: ChunkData, x: number, z: number): void {
    const lampGroup = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 });

    // Ornate pole
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5, 8);
    const pole = new THREE.Mesh(poleGeo, metalMat);
    pole.position.y = 2.5;
    this.markStatic(pole);
    lampGroup.add(pole);

    // Decorative base
    const baseGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.5, 8);
    const base = new THREE.Mesh(baseGeo, metalMat);
    base.position.y = 0.25;
    this.markStatic(base);
    lampGroup.add(base);

    // Lamp housing
    const housingGeo = new THREE.SphereGeometry(0.4, 12, 8);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0xFFFACD,
      emissive: 0xFFD700,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.y = 5.3;
    this.markStatic(housing);
    lampGroup.add(housing);

    lampGroup.position.set(x, 0, z);
    chunk.detailsGroup!.add(lampGroup);
  }

  /**
   * Get district type for a chunk based on its world position
   */
  private getDistrictForChunk(coord: ChunkCoord): DistrictType {
    const centerX = (coord.cx + 0.5) * this.config.chunkSize;
    const centerZ = (coord.cz + 0.5) * this.config.chunkSize;

    // IMPORTANT: Core city area is handled by World.ts - return 'empty' to skip
    // This prevents duplicate buildings and performance issues
    // World.ts city is ~±300, so we use ±350 buffer zone
    if (centerX > -350 && centerX < 350 && centerZ > -350 && centerZ < 350) {
      return 'empty';
    }

    for (const district of this.districtBounds) {
      if (centerX >= district.minX && centerX < district.maxX &&
          centerZ >= district.minZ && centerZ < district.maxZ) {
        return district.type;
      }
    }

    // Default to residential for far areas not covered by district bounds
    return 'residential';
  }

  /**
   * Generate building definitions for a district
   */
  private generateBuildingsForDistrict(
    chunk: ChunkData,
    district: DistrictType,
    rng: SeededRandom
  ): BuildingDefinition[] {
    const buildings: BuildingDefinition[] = [];

    // Skip building generation for empty district (core city handled by World.ts)
    if (district === 'empty') {
      return buildings;
    }

    const { bounds } = chunk;

    // Grid spacing varies by district
    const gridSpacing = this.getGridSpacingForDistrict(district);

    // Building count varies by district
    const buildingDensity = this.getBuildingDensityForDistrict(district);

    // Generate buildings on a grid
    for (let x = bounds.minX + gridSpacing / 2; x < bounds.maxX; x += gridSpacing) {
      for (let z = bounds.minZ + gridSpacing / 2; z < bounds.maxZ; z += gridSpacing) {
        // Skip some positions randomly based on density
        if (!rng.chance(buildingDensity)) continue;

        // Skip positions too close to roads (every 60 units for avenues, 45 for streets)
        const nearAvenue = Math.abs(x % 60) < 8;
        const nearStreet = Math.abs(z % 45) < 6;
        if (nearAvenue || nearStreet) continue;

        // Get building parameters based on district
        const params = this.getBuildingParamsForDistrict(district, rng);

        // Add some random offset
        const offsetX = rng.range(-5, 5);
        const offsetZ = rng.range(-5, 5);

        buildings.push({
          id: `building_${chunk.key}_${buildings.length}`,
          position: { x: x + offsetX, y: 0, z: z + offsetZ },
          dimensions: {
            width: params.width,
            height: params.height,
            depth: params.depth
          },
          style: params.style,
          district
        });
      }
    }

    return buildings;
  }

  /**
   * Get grid spacing for district type
   */
  private getGridSpacingForDistrict(district: DistrictType): number {
    switch (district) {
      case 'midtown':
      case 'downtown':
        return 25; // Dense
      case 'residential':
      case 'uptown':
        return 35; // Medium
      case 'industrial':
      case 'warehouse':
        return 50; // Sparse, larger buildings
      case 'waterfront':
        return 40;
      default:
        return 35;
    }
  }

  /**
   * Get building density for district type
   */
  private getBuildingDensityForDistrict(district: DistrictType): number {
    switch (district) {
      case 'midtown':
        return 0.9;
      case 'downtown':
        return 0.85;
      case 'residential':
        return 0.7;
      case 'uptown':
        return 0.65;
      case 'industrial':
        return 0.5;
      case 'warehouse':
        return 0.4;
      case 'waterfront':
        return 0.55;
      default:
        return 0.6;
    }
  }

  /**
   * Get building parameters for district type
   */
  private getBuildingParamsForDistrict(
    district: DistrictType,
    rng: SeededRandom
  ): { width: number; height: number; depth: number; style: string } {
    switch (district) {
      case 'midtown':
        return {
          width: rng.range(10, 18),
          height: rng.range(70, 120),
          depth: rng.range(10, 18),
          style: rng.pick(['glass_tower', 'modern', 'glass_tower'])
        };
      case 'downtown':
        return {
          width: rng.range(15, 25),
          height: rng.range(30, 80),
          depth: rng.range(15, 25),
          style: rng.pick(['artdeco', 'prewar', 'modern'])
        };
      case 'residential':
        return {
          width: rng.range(8, 15),
          height: rng.range(12, 35),
          depth: rng.range(10, 18),
          style: rng.pick(['brownstone', 'prewar', 'brownstone'])
        };
      case 'uptown':
        return {
          width: rng.range(12, 20),
          height: rng.range(25, 65),
          depth: rng.range(12, 20),
          style: rng.pick(['prewar', 'modern', 'artdeco'])
        };
      case 'industrial':
      case 'warehouse':
        return {
          width: rng.range(20, 40),
          height: rng.range(8, 25),
          depth: rng.range(25, 45),
          style: 'warehouse'
        };
      case 'waterfront':
        return {
          width: rng.range(12, 25),
          height: rng.range(15, 50),
          depth: rng.range(12, 25),
          style: rng.pick(['warehouse', 'modern', 'glass_tower'])
        };
      default:
        return {
          width: 15,
          height: 30,
          depth: 15,
          style: 'modern'
        };
    }
  }

  /**
   * Create a building mesh from definition with architectural variety
   */
  private createBuildingMesh(building: BuildingDefinition, rng: SeededRandom): THREE.Group | null {
    const group = new THREE.Group();
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    // Get color palette for style
    const palette = this.getColorPaletteForStyle(building.style);
    const mainColor = rng.pick(palette);
    const accentColor = rng.pick(palette);

    // Decide building variation type
    const variation = rng.int(0, 10);

    if (building.style === 'glass_tower' && height > 60) {
      // Tall glass tower with setbacks
      this.createSetbackTower(group, building, mainColor, rng);
    } else if (building.style === 'artdeco' && height > 40) {
      // Art deco with spire
      this.createArtDecoBuilding(group, building, mainColor, accentColor, rng);
    } else if (building.style === 'warehouse' && variation < 3) {
      // Industrial with smokestacks or silos
      this.createIndustrialComplex(group, building, mainColor, rng);
    } else if (building.style === 'brownstone') {
      // Row of brownstones
      this.createBrownstoneRow(group, building, mainColor, rng);
    } else {
      // Standard building with details
      this.createStandardBuilding(group, building, mainColor, rng);
    }

    group.userData.buildingId = building.id;
    group.userData.isStatic = true;

    return group;
  }

  /**
   * Create a setback tower (like Empire State Building style)
   */
  private createSetbackTower(
    group: THREE.Group,
    building: BuildingDefinition,
    color: number,
    rng: SeededRandom
  ): void {
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });

    // Base (wider)
    const baseHeight = height * 0.3;
    const baseGeo = new THREE.BoxGeometry(width * 1.2, baseHeight, depth * 1.2);
    const base = new THREE.Mesh(baseGeo, material);
    base.position.set(x, baseHeight / 2, z);
    base.castShadow = true;
    this.markStatic(base);
    group.add(base);

    // Middle section
    const midHeight = height * 0.4;
    const midGeo = new THREE.BoxGeometry(width * 0.85, midHeight, depth * 0.85);
    const mid = new THREE.Mesh(midGeo, material);
    mid.position.set(x, baseHeight + midHeight / 2, z);
    mid.castShadow = true;
    this.markStatic(mid);
    group.add(mid);

    // Top section (narrower)
    const topHeight = height * 0.25;
    const topGeo = new THREE.BoxGeometry(width * 0.5, topHeight, depth * 0.5);
    const top = new THREE.Mesh(topGeo, material);
    top.position.set(x, baseHeight + midHeight + topHeight / 2, z);
    top.castShadow = true;
    this.markStatic(top);
    group.add(top);

    // Spire on top
    if (rng.chance(0.5)) {
      const spireHeight = height * 0.1;
      const spireGeo = new THREE.ConeGeometry(width * 0.1, spireHeight, 4);
      const spire = new THREE.Mesh(spireGeo, new THREE.MeshStandardMaterial({ color: 0xCCCCCC, metalness: 0.9 }));
      spire.position.set(x, baseHeight + midHeight + topHeight + spireHeight / 2, z);
      this.markStatic(spire);
      group.add(spire);
    }
  }

  /**
   * Create Art Deco building with ornate top
   */
  private createArtDecoBuilding(
    group: THREE.Group,
    building: BuildingDefinition,
    color: number,
    accentColor: number,
    rng: SeededRandom
  ): void {
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xD4AF37, roughness: 0.3, metalness: 0.7 }); // Gold

    // Main body
    const bodyHeight = height * 0.85;
    const bodyGeo = new THREE.BoxGeometry(width, bodyHeight, depth);
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.set(x, bodyHeight / 2, z);
    body.castShadow = true;
    this.markStatic(body);
    group.add(body);

    // Decorative crown
    const crownHeight = height * 0.15;
    const crownGeo = new THREE.BoxGeometry(width * 0.7, crownHeight, depth * 0.7);
    const crown = new THREE.Mesh(crownGeo, material);
    crown.position.set(x, bodyHeight + crownHeight / 2, z);
    this.markStatic(crown);
    group.add(crown);

    // Gold accent band
    const bandGeo = new THREE.BoxGeometry(width * 1.02, 1, depth * 1.02);
    const band = new THREE.Mesh(bandGeo, accentMat);
    band.position.set(x, bodyHeight - 2, z);
    this.markStatic(band);
    group.add(band);

    // Sunburst decoration on top
    if (rng.chance(0.6)) {
      const sunburstGeo = new THREE.ConeGeometry(width * 0.3, crownHeight * 0.8, 8);
      const sunburst = new THREE.Mesh(sunburstGeo, accentMat);
      sunburst.position.set(x, bodyHeight + crownHeight + crownHeight * 0.4, z);
      this.markStatic(sunburst);
      group.add(sunburst);
    }
  }

  /**
   * Create industrial complex with smokestacks/silos
   */
  private createIndustrialComplex(
    group: THREE.Group,
    building: BuildingDefinition,
    color: number,
    rng: SeededRandom
  ): void {
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.3 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5, metalness: 0.7 });

    // Main warehouse building
    const mainGeo = new THREE.BoxGeometry(width, height, depth);
    const main = new THREE.Mesh(mainGeo, material);
    main.position.set(x, height / 2, z);
    main.castShadow = true;
    this.markStatic(main);
    group.add(main);

    // Add smokestacks
    const stackCount = rng.int(1, 3);
    for (let i = 0; i < stackCount; i++) {
      const stackHeight = height * rng.range(0.8, 1.5);
      const stackRadius = rng.range(1, 2.5);
      const stackGeo = new THREE.CylinderGeometry(stackRadius * 0.8, stackRadius, stackHeight, 8);
      const stack = new THREE.Mesh(stackGeo, metalMat);
      const offsetX = rng.range(-width / 3, width / 3);
      const offsetZ = rng.range(-depth / 3, depth / 3);
      stack.position.set(x + offsetX, height + stackHeight / 2, z + offsetZ);
      stack.castShadow = true;
      this.markStatic(stack);
      group.add(stack);
    }

    // Add silos if large enough
    if (width > 25 && rng.chance(0.5)) {
      const siloRadius = rng.range(3, 5);
      const siloHeight = height * 1.2;
      const siloGeo = new THREE.CylinderGeometry(siloRadius, siloRadius, siloHeight, 12);
      const silo = new THREE.Mesh(siloGeo, metalMat);
      silo.position.set(x + width / 2 + siloRadius + 2, siloHeight / 2, z);
      silo.castShadow = true;
      this.markStatic(silo);
      group.add(silo);

      // Silo dome
      const domeGeo = new THREE.SphereGeometry(siloRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const dome = new THREE.Mesh(domeGeo, metalMat);
      dome.position.set(x + width / 2 + siloRadius + 2, siloHeight, z);
      this.markStatic(dome);
      group.add(dome);
    }

    // Add loading dock
    const dockGeo = new THREE.BoxGeometry(width * 0.3, 3, 8);
    const dock = new THREE.Mesh(dockGeo, new THREE.MeshStandardMaterial({ color: 0x555555 }));
    dock.position.set(x, 1.5, z + depth / 2 + 4);
    this.markStatic(dock);
    group.add(dock);
  }

  /**
   * Create row of brownstones
   */
  private createBrownstoneRow(
    group: THREE.Group,
    building: BuildingDefinition,
    color: number,
    rng: SeededRandom
  ): void {
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    // Create 2-3 connected brownstones
    const count = rng.int(2, 3);
    const unitWidth = width / count;

    for (let i = 0; i < count; i++) {
      const unitColor = this.adjustColor(color, rng.range(-20, 20));
      const material = new THREE.MeshStandardMaterial({ color: unitColor, roughness: 0.8 });

      const unitHeight = height + rng.range(-2, 2);
      const unitX = x - width / 2 + unitWidth / 2 + i * unitWidth;

      // Main body
      const bodyGeo = new THREE.BoxGeometry(unitWidth - 0.3, unitHeight, depth);
      const body = new THREE.Mesh(bodyGeo, material);
      body.position.set(unitX, unitHeight / 2, z);
      body.castShadow = true;
      this.markStatic(body);
      group.add(body);

      // Stoop (front stairs)
      const stoopGeo = new THREE.BoxGeometry(3, 2, 4);
      const stoop = new THREE.Mesh(stoopGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
      stoop.position.set(unitX, 1, z + depth / 2 + 2);
      this.markStatic(stoop);
      group.add(stoop);

      // Cornice at top
      const corniceGeo = new THREE.BoxGeometry(unitWidth, 1, depth + 0.5);
      const cornice = new THREE.Mesh(corniceGeo, material);
      cornice.position.set(unitX, unitHeight + 0.5, z);
      this.markStatic(cornice);
      group.add(cornice);

      // Window frames
      this.addBrownstoneWindows(group, unitX, unitHeight, depth, z, rng);
    }
  }

  /**
   * Add windows to brownstone
   */
  private addBrownstoneWindows(
    group: THREE.Group,
    x: number,
    height: number,
    depth: number,
    z: number,
    rng: SeededRandom
  ): void {
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x2F4F4F,
      roughness: 0.3,
      emissive: rng.chance(0.3) ? 0x332200 : 0x000000,
      emissiveIntensity: 0.5
    });

    const floors = Math.floor(height / 4);
    for (let floor = 1; floor < floors; floor++) {
      const windowGeo = new THREE.PlaneGeometry(1.2, 2);
      const window1 = new THREE.Mesh(windowGeo, windowMat);
      window1.position.set(x - 1.5, floor * 4, z + depth / 2 + 0.01);
      this.markStatic(window1);
      group.add(window1);

      const window2 = new THREE.Mesh(windowGeo, windowMat);
      window2.position.set(x + 1.5, floor * 4, z + depth / 2 + 0.01);
      this.markStatic(window2);
      group.add(window2);
    }
  }

  /**
   * Create standard building with some details
   */
  private createStandardBuilding(
    group: THREE.Group,
    building: BuildingDefinition,
    color: number,
    rng: SeededRandom
  ): void {
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });

    // Main body
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.set(x, height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.markStatic(body);
    group.add(body);

    // Add rooftop elements
    if (rng.chance(0.4)) {
      // Water tower
      const towerGeo = new THREE.CylinderGeometry(2, 2.5, 5, 8);
      const tower = new THREE.Mesh(towerGeo, new THREE.MeshStandardMaterial({ color: 0x4A3728 }));
      tower.position.set(x + rng.range(-width / 4, width / 4), height + 2.5, z + rng.range(-depth / 4, depth / 4));
      this.markStatic(tower);
      group.add(tower);
    }

    if (rng.chance(0.3)) {
      // AC units
      for (let i = 0; i < rng.int(1, 3); i++) {
        const acGeo = new THREE.BoxGeometry(2, 1, 1.5);
        const ac = new THREE.Mesh(acGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
        ac.position.set(x + rng.range(-width / 3, width / 3), height + 0.5, z + rng.range(-depth / 3, depth / 3));
        this.markStatic(ac);
        group.add(ac);
      }
    }

    // Add windows
    if (building.style === 'glass_tower' || building.style === 'modern') {
      this.addWindowsToBuilding(group, body, building, rng);
    }
  }

  /**
   * Helper to mark mesh as static
   */
  private markStatic(mesh: THREE.Mesh): void {
    mesh.userData.isStatic = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
  }

  /**
   * Adjust color brightness
   */
  private adjustColor(color: number, amount: number): number {
    const r = Math.min(255, Math.max(0, ((color >> 16) & 0xFF) + amount));
    const g = Math.min(255, Math.max(0, ((color >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (color & 0xFF) + amount));
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Get color palette for building style
   */
  private getColorPaletteForStyle(style: string): number[] {
    const palettes: Record<string, number[]> = {
      brownstone: [0xB87333, 0xCD853F, 0xD2691E, 0xCC7722, 0xC19A6B],
      artdeco: [0xE8DCC8, 0xDDD0B8, 0xCCC0A8, 0xD5C8B5, 0xE0D4C0],
      prewar: [0xCC5500, 0xE07020, 0xD4652F, 0xC87530, 0xE08050],
      modern: [0x808080, 0x909090, 0xA0A0A0, 0x787878, 0x888888],
      glass_tower: [0x4682B4, 0x5F9EA0, 0x6495ED, 0x708090, 0x87CEEB],
      warehouse: [0xA52A2A, 0xB5524A, 0xC06050, 0xB84040, 0xA04030]
    };
    return palettes[style] || palettes.modern;
  }

  /**
   * Add windows to a building
   */
  private addWindowsToBuilding(
    group: THREE.Group,
    buildingMesh: THREE.Mesh,
    building: BuildingDefinition,
    rng: SeededRandom
  ): void {
    const { width, height, depth } = building.dimensions;
    const { x, z } = building.position;

    // Window material
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      roughness: 0.1,
      metalness: 0.8,
      emissive: 0x111133,
      emissiveIntensity: 0.1
    });

    // Calculate window grid
    const windowWidth = 1.5;
    const windowHeight = 2;
    const windowSpacingH = 3;
    const windowSpacingV = 4;

    const windowsPerFloor = Math.floor((width - 2) / windowSpacingH);
    const floors = Math.floor((height - 4) / windowSpacingV);

    // Create windows on front and back
    for (let floor = 0; floor < Math.min(floors, 20); floor++) { // Limit windows for performance
      for (let w = 0; w < windowsPerFloor; w++) {
        const windowX = -width / 2 + 1.5 + w * windowSpacingH;
        const windowY = 3 + floor * windowSpacingV;

        // Front window
        const frontWindow = new THREE.Mesh(
          new THREE.PlaneGeometry(windowWidth, windowHeight),
          windowMaterial
        );
        frontWindow.position.set(x + windowX, windowY, z + depth / 2 + 0.01);
        frontWindow.userData.isStatic = true;
        frontWindow.matrixAutoUpdate = false;
        frontWindow.updateMatrix();
        group.add(frontWindow);

        // Back window (50% chance)
        if (rng.chance(0.5)) {
          const backWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(windowWidth, windowHeight),
            windowMaterial
          );
          backWindow.position.set(x + windowX, windowY, z - depth / 2 - 0.01);
          backWindow.rotation.y = Math.PI;
          backWindow.userData.isStatic = true;
          backWindow.matrixAutoUpdate = false;
          backWindow.updateMatrix();
          group.add(backWindow);
        }
      }
    }
  }

  /**
   * Generate roads for a chunk
   */
  private generateRoadsForChunk(chunk: ChunkData): void {
    // Roads are generated as part of the ground plane
    // This method can be extended to add road markings
  }

  /**
   * Generate street furniture for a chunk
   */
  private generateStreetFurniture(chunk: ChunkData, rng: SeededRandom): StreetFurnitureDefinition[] {
    const furniture: StreetFurnitureDefinition[] = [];
    const { bounds } = chunk;

    // Place items along road edges
    for (let x = bounds.minX; x < bounds.maxX; x += 30) {
      for (let z = bounds.minZ; z < bounds.maxZ; z += 30) {
        // Fire hydrant
        if (rng.chance(0.2)) {
          furniture.push({
            type: 'fireHydrant',
            position: { x: x + rng.range(-2, 2), y: 0, z: z + rng.range(-2, 2) }
          });
        }

        // Trash can
        if (rng.chance(0.3)) {
          furniture.push({
            type: 'trashCan',
            position: { x: x + rng.range(5, 10), y: 0, z: z + rng.range(-2, 2) }
          });
        }

        // Street lamp
        if (rng.chance(0.25)) {
          furniture.push({
            type: 'lampPole',
            position: { x: x + rng.range(-1, 1), y: 0, z: z + rng.range(8, 12) }
          });
        }

        // Tree
        if (rng.chance(0.15)) {
          furniture.push({
            type: 'tree',
            position: { x: x + rng.range(3, 8), y: 0, z: z + rng.range(3, 8) }
          });
        }
      }
    }

    return furniture;
  }

  /**
   * Create street furniture mesh
   */
  private createStreetFurnitureMesh(item: StreetFurnitureDefinition): THREE.Mesh | null {
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;

    switch (item.type) {
      case 'fireHydrant':
        geometry = new THREE.CylinderGeometry(0.12, 0.15, 0.6, 8);
        material = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.4 });
        break;
      case 'trashCan':
        geometry = new THREE.CylinderGeometry(0.25, 0.22, 0.7, 8);
        material = new THREE.MeshStandardMaterial({ color: 0x228822, roughness: 0.6 });
        break;
      case 'lampPole':
        geometry = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
        material = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
        break;
      case 'tree':
        geometry = new THREE.ConeGeometry(2, 5, 8);
        material = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
        break;
      default:
        return null;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      item.position.x,
      item.type === 'lampPole' ? 3 : item.type === 'tree' ? 4 : 0.3,
      item.position.z
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isStatic = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
  }

  /**
   * Activate a chunk (enable physics)
   */
  private activateChunk(chunk: ChunkData): void {
    if (chunk.state !== ChunkState.LOADED) return;

    const key = chunk.key;

    // Create physics bodies for buildings
    chunk.buildings.forEach((building) => {
      const { width, height, depth } = building.dimensions;
      const { x, z } = building.position;

      // Create physics body
      const bodyId = `phys_${building.id}`;
      this.game.physics.createBoxBody(
        bodyId,
        width,
        height,
        depth,
        0, // Static body (mass = 0)
        new THREE.Vector3(x, height / 2, z),
        0x0002 // COLLISION_GROUPS.STATIC
      );

      chunk.physicsBodyIds.push(bodyId);
    });

    // Update state
    chunk.state = ChunkState.ACTIVE;
    this.chunksByState.loaded.delete(key);
    this.chunksByState.active.add(key);

    // console.log(`✅ Activated chunk ${key} with ${chunk.physicsBodyIds.length} physics bodies`);
  }

  /**
   * Deactivate a chunk (remove physics, keep meshes)
   */
  private deactivateChunk(chunk: ChunkData): void {
    if (chunk.state !== ChunkState.ACTIVE) return;

    const key = chunk.key;

    // Remove physics bodies
    chunk.physicsBodyIds.forEach(bodyId => {
      this.game.physics.removeBody(bodyId);
    });
    chunk.physicsBodyIds = [];

    // Update state
    chunk.state = ChunkState.LOADED;
    this.chunksByState.active.delete(key);
    this.chunksByState.loaded.add(key);

    // console.log(`⏸️ Deactivated chunk ${key}`);
  }

  /**
   * Unload a chunk completely
   */
  private unloadChunk(chunk: ChunkData): void {
    const key = chunk.key;

    // Deactivate first if active
    if (chunk.state === ChunkState.ACTIVE) {
      this.deactivateChunk(chunk);
    }

    chunk.state = ChunkState.UNLOADING;
    this.chunksByState.loaded.delete(key);
    this.chunksByState.unloading.add(key);

    // Remove from scene
    if (chunk.buildingsGroup) {
      this.chunksContainer.remove(chunk.buildingsGroup);

      // Dispose geometries and materials
      chunk.buildingsGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }

    if (chunk.detailsGroup) {
      this.chunksContainer.remove(chunk.detailsGroup);

      chunk.detailsGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }

    // Clear data
    chunk.buildingsGroup = null;
    chunk.detailsGroup = null;
    chunk.buildings.clear();
    chunk.instancedData.clear();

    // Remove from maps
    this.chunksByState.unloading.delete(key);
    this.chunks.delete(key);

    // console.log(`🗑️ Unloaded chunk ${key}`);
  }

  /**
   * Estimate memory usage of a chunk
   */
  private estimateChunkMemory(chunk: ChunkData): number {
    let bytes = 0;

    // Estimate based on building count
    bytes += chunk.buildings.size * 50000; // ~50KB per building

    // Estimate details
    if (chunk.detailsGroup) {
      bytes += chunk.detailsGroup.children.length * 5000; // ~5KB per detail
    }

    return bytes;
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalChunks = this.chunks.size;
    this.stats.loadedChunks = this.chunksByState.loaded.size + this.chunksByState.active.size;
    this.stats.activeChunks = this.chunksByState.active.size;

    // Calculate memory usage
    let totalMemory = 0;
    this.chunks.forEach(chunk => {
      totalMemory += chunk.memoryUsage;
    });
    this.stats.memoryUsageMB = totalMemory / (1024 * 1024);

    // Calculate average load time
    if (this.stats.loadTimes.length > 0) {
      this.stats.avgLoadTimeMs = this.stats.loadTimes.reduce((a, b) => a + b, 0) /
                                  this.stats.loadTimes.length;
    }
  }

  /**
   * Get statistics for debugging
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get chunk at world position
   */
  getChunkAtPosition(x: number, z: number): ChunkData | null {
    const coord = ChunkUtils.worldToChunk(x, z, this.config.chunkSize);
    const key = ChunkUtils.getChunkKey(coord);
    return this.chunks.get(key) || null;
  }

  /**
   * Get all loaded chunks
   */
  getLoadedChunks(): ChunkData[] {
    return Array.from(this.chunks.values()).filter(
      chunk => chunk.state === ChunkState.LOADED || chunk.state === ChunkState.ACTIVE
    );
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    // Unload all chunks
    this.chunks.forEach(chunk => {
      if (chunk.state !== ChunkState.UNLOADED) {
        this.unloadChunk(chunk);
      }
    });

    // Remove container from scene
    this.game.scene.remove(this.chunksContainer);

    // Clear all data
    this.chunks.clear();
    this.loadQueue = [];
    this.unloadQueue = [];

    console.log('🗑️ ChunkManager disposed');
  }
}
