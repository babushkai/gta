import * as THREE from 'three';

/**
 * Chunk state lifecycle for streaming world content
 */
export enum ChunkState {
  UNLOADED = 'unloaded',     // Not in memory
  LOADING = 'loading',       // Being generated
  LOADED = 'loaded',         // Meshes visible, no physics
  ACTIVE = 'active',         // Full physics simulation
  UNLOADING = 'unloading'    // Being cleaned up
}

/**
 * Chunk coordinate in the chunk grid
 */
export interface ChunkCoord {
  cx: number;
  cz: number;
}

/**
 * Building definition for chunk generation (serializable for Web Workers)
 */
export interface BuildingDefinition {
  id: string;
  position: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
  style: string;
  district: string;
}

/**
 * Street furniture definition for chunk generation
 */
export interface StreetFurnitureDefinition {
  type: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

/**
 * Road segment definition for chunk generation
 */
export interface RoadDefinition {
  type: 'avenue' | 'street' | 'sidewalk' | 'crosswalk';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  width: number;
}

/**
 * Complete chunk data with all content and state
 */
export interface ChunkData {
  // Identity
  coord: ChunkCoord;
  key: string;

  // State
  state: ChunkState;

  // World bounds (in world coordinates)
  bounds: {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  };

  // Visual content (THREE.js objects)
  buildingsGroup: THREE.Group | null;
  roadsGroup: THREE.Group | null;
  detailsGroup: THREE.Group | null;

  // Physics tracking (IDs for batch removal)
  physicsBodyIds: string[];
  rapierColliderHandles: number[];

  // Building data
  buildings: Map<string, BuildingDefinition>;

  // Instanced object tracking
  instancedData: Map<string, {
    positions: THREE.Vector3[];
    rotations: THREE.Euler[];
    scales: THREE.Vector3[];
  }>;

  // Timing and priority
  loadStartTime: number;
  lastAccessTime: number;
  priority: number;

  // Memory tracking (approximate bytes)
  memoryUsage: number;
}

/**
 * Chunk generation result from Web Worker
 */
export interface ChunkGenerationResult {
  coord: ChunkCoord;
  buildings: BuildingDefinition[];
  streetFurniture: StreetFurnitureDefinition[];
  roads: RoadDefinition[];
  seed: number;
}

/**
 * Chunk generation request for Web Worker
 */
export interface ChunkGenerationRequest {
  coord: ChunkCoord;
  bounds: {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  };
  districtType: string;
  seed: number;
}

/**
 * District type for world region
 */
export type DistrictType =
  | 'midtown'
  | 'downtown'
  | 'residential'
  | 'industrial'
  | 'uptown'
  | 'waterfront'
  | 'warehouse'
  | 'highway'
  | 'empty';

/**
 * District boundary definition
 */
export interface DistrictBounds {
  type: DistrictType;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Chunk manager configuration
 */
export interface ChunkManagerConfig {
  chunkSize: number;           // Size of each chunk in world units
  loadRadius: number;          // Chunks to load around player (meshes only)
  activeRadius: number;        // Chunks with active physics
  unloadRadius: number;        // Chunks to keep in memory (hysteresis)
  maxConcurrentLoads: number;  // Max async loads at once
  frameBudgetMs: number;       // Max ms per frame for chunk work
  memoryBudgetMb: number;      // Total memory budget
}

/**
 * Default configuration for Apple Silicon M4
 * Reduced loadRadius to prevent lag at startup - chunks load as you explore
 */
export const DEFAULT_CHUNK_CONFIG: ChunkManagerConfig = {
  chunkSize: 180,              // 3 avenues (60 each) or 4 streets (45 each)
  loadRadius: 2,               // 360 units - load meshes (reduced from 4)
  activeRadius: 1,             // 180 units - enable physics (reduced from 2)
  unloadRadius: 4,             // 720 units - keep in memory (reduced from 6)
  maxConcurrentLoads: 2,       // Limit concurrent async loads
  frameBudgetMs: 4,            // Max 4ms per frame
  memoryBudgetMb: 512          // 512 MB for M4
};

/**
 * Mobile configuration (reduced)
 */
export const MOBILE_CHUNK_CONFIG: ChunkManagerConfig = {
  chunkSize: 180,
  loadRadius: 2,               // 360 units
  activeRadius: 1,             // 180 units
  unloadRadius: 3,             // 540 units
  maxConcurrentLoads: 1,
  frameBudgetMs: 2,
  memoryBudgetMb: 128
};

/**
 * Utility functions for chunk operations
 */
export const ChunkUtils = {
  /**
   * Convert world position to chunk coordinate
   */
  worldToChunk(x: number, z: number, chunkSize: number): ChunkCoord {
    return {
      cx: Math.floor(x / chunkSize),
      cz: Math.floor(z / chunkSize)
    };
  },

  /**
   * Convert chunk coordinate to world bounds
   */
  chunkToBounds(coord: ChunkCoord, chunkSize: number): ChunkData['bounds'] {
    return {
      minX: coord.cx * chunkSize,
      minZ: coord.cz * chunkSize,
      maxX: (coord.cx + 1) * chunkSize,
      maxZ: (coord.cz + 1) * chunkSize
    };
  },

  /**
   * Get unique key for chunk coordinate
   */
  getChunkKey(coord: ChunkCoord): string {
    return `${coord.cx},${coord.cz}`;
  },

  /**
   * Parse chunk key to coordinate
   */
  parseChunkKey(key: string): ChunkCoord {
    const [cx, cz] = key.split(',').map(Number);
    return { cx, cz };
  },

  /**
   * Get all chunk coordinates within radius of center
   */
  getChunksInRadius(center: ChunkCoord, radius: number): ChunkCoord[] {
    const chunks: ChunkCoord[] = [];
    for (let x = center.cx - radius; x <= center.cx + radius; x++) {
      for (let z = center.cz - radius; z <= center.cz + radius; z++) {
        chunks.push({ cx: x, cz: z });
      }
    }
    return chunks;
  },

  /**
   * Get Manhattan distance between two chunk coordinates
   */
  chunkDistance(a: ChunkCoord, b: ChunkCoord): number {
    return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
  },

  /**
   * Generate deterministic seed for chunk based on coordinates
   */
  getChunkSeed(coord: ChunkCoord, baseSeed: number = 12345): number {
    // Simple hash combining coordinates with base seed
    return ((coord.cx * 73856093) ^ (coord.cz * 19349663) ^ baseSeed) >>> 0;
  },

  /**
   * Create empty chunk data structure
   */
  createEmptyChunk(coord: ChunkCoord, chunkSize: number): ChunkData {
    const key = ChunkUtils.getChunkKey(coord);
    const bounds = ChunkUtils.chunkToBounds(coord, chunkSize);

    return {
      coord,
      key,
      state: ChunkState.UNLOADED,
      bounds,
      buildingsGroup: null,
      roadsGroup: null,
      detailsGroup: null,
      physicsBodyIds: [],
      rapierColliderHandles: [],
      buildings: new Map(),
      instancedData: new Map(),
      loadStartTime: 0,
      lastAccessTime: 0,
      priority: 0,
      memoryUsage: 0
    };
  }
};

/**
 * Seeded random number generator for deterministic chunk generation
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Returns a random float between 0 and 1
   */
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  /**
   * Returns a random float between min and max
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a random integer between min and max (inclusive)
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Returns a random element from array
   */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Returns true with given probability (0-1)
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
