import * as THREE from 'three';

/**
 * Manages instanced meshes for efficient rendering of repeated objects
 * Dramatically reduces draw calls by batching similar objects
 */
export class InstancedRenderer {
  private instancedMeshes: Map<string, {
    mesh: THREE.InstancedMesh;
    count: number;
    maxCount: number;
    positions: THREE.Vector3[];
    rotations: THREE.Euler[];
    scales: THREE.Vector3[];
  }> = new Map();

  private group: THREE.Group;
  private matrix: THREE.Matrix4 = new THREE.Matrix4();
  private quaternion: THREE.Quaternion = new THREE.Quaternion();

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'InstancedObjects';
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Register a new instanced mesh type
   */
  registerType(
    key: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxInstances: number = 100
  ): void {
    if (this.instancedMeshes.has(key)) return;

    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    mesh.count = 0;
    mesh.frustumCulled = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.instancedMeshes.set(key, {
      mesh,
      count: 0,
      maxCount: maxInstances,
      positions: [],
      rotations: [],
      scales: []
    });

    this.group.add(mesh);
  }

  /**
   * Add an instance at the specified position
   */
  addInstance(
    key: string,
    position: THREE.Vector3,
    rotation: THREE.Euler = new THREE.Euler(),
    scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
  ): number {
    const data = this.instancedMeshes.get(key);
    if (!data || data.count >= data.maxCount) return -1;

    const index = data.count;

    this.quaternion.setFromEuler(rotation);
    this.matrix.compose(position, this.quaternion, scale);
    data.mesh.setMatrixAt(index, this.matrix);

    data.positions.push(position.clone());
    data.rotations.push(rotation.clone());
    data.scales.push(scale.clone());

    data.count++;
    data.mesh.count = data.count;
    data.mesh.instanceMatrix.needsUpdate = true;

    return index;
  }

  /**
   * Update all instances (for animations/visibility)
   */
  updateInstance(
    key: string,
    index: number,
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): void {
    const data = this.instancedMeshes.get(key);
    if (!data || index >= data.count) return;

    if (position) data.positions[index].copy(position);
    if (rotation) data.rotations[index].copy(rotation);
    if (scale) data.scales[index].copy(scale);

    this.quaternion.setFromEuler(data.rotations[index]);
    this.matrix.compose(data.positions[index], this.quaternion, data.scales[index]);
    data.mesh.setMatrixAt(index, this.matrix);
    data.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Finalize all instances after adding (call once after all adds)
   */
  finalize(): void {
    this.instancedMeshes.forEach(data => {
      data.mesh.instanceMatrix.needsUpdate = true;
      data.mesh.computeBoundingSphere();
    });
  }

  /**
   * Get instance count for a type
   */
  getInstanceCount(key: string): number {
    return this.instancedMeshes.get(key)?.count ?? 0;
  }

  /**
   * Clear all instances of a type
   */
  clearType(key: string): void {
    const data = this.instancedMeshes.get(key);
    if (!data) return;

    data.count = 0;
    data.mesh.count = 0;
    data.positions = [];
    data.rotations = [];
    data.scales = [];
  }

  /**
   * Get total instance count across all types
   */
  getTotalInstanceCount(): number {
    let total = 0;
    this.instancedMeshes.forEach(data => {
      total += data.count;
    });
    return total;
  }

  /**
   * Get statistics for debugging
   */
  getStats(): { types: number; totalInstances: number; drawCalls: number } {
    return {
      types: this.instancedMeshes.size,
      totalInstances: this.getTotalInstanceCount(),
      drawCalls: this.instancedMeshes.size // One draw call per instanced mesh type
    };
  }

  dispose(): void {
    this.instancedMeshes.forEach(data => {
      data.mesh.geometry.dispose();
      if (data.mesh.material instanceof THREE.Material) {
        data.mesh.material.dispose();
      }
    });
    this.instancedMeshes.clear();

    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

/**
 * Detect Apple Silicon for higher quality geometries
 * Works with Chrome (ANGLE), Safari, and Firefox
 */
function detectAppleSiliconGeo(): boolean {
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
        // Check for Apple Silicon patterns (Safari, Chrome ANGLE, Firefox)
        const isAppleGPU = /Apple M\d|Apple GPU/i.test(renderer) ||
                          (/Apple/.test(renderer) && !/Intel/.test(renderer)) ||
                          (/ANGLE.*Apple.*M\d/i.test(renderer));
        if (isAppleGPU) return true;
        if (/Intel/.test(renderer)) return false;
      }
    }
  } catch (e) { /* ignore */ }
  // Fallback: Assume Apple Silicon for Macs
  return true;
}

// Higher segment counts for Apple Silicon M4
const isHighQuality = detectAppleSiliconGeo();
const SEGMENTS = isHighQuality ? 12 : 6;
const SEGMENTS_HIGH = isHighQuality ? 16 : 8;

/**
 * Pre-built optimized geometries for common city objects
 * Apple Silicon uses higher polygon counts for smoother geometry
 */
export const OptimizedGeometries = {
  // Fire hydrant - higher segments on M4
  fireHydrant: (): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(0.12, 0.15, 0.6, SEGMENTS);
    geo.translate(0, 0.3, 0);
    return geo;
  },

  // Trash can - higher segments on M4
  trashCan: (): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(0.25, 0.22, 0.7, SEGMENTS_HIGH);
    geo.translate(0, 0.35, 0);
    return geo;
  },

  // Mailbox
  mailbox: (): THREE.BufferGeometry => {
    const geo = new THREE.BoxGeometry(0.4, 1.1, 0.35);
    geo.translate(0, 0.55, 0);
    return geo;
  },

  // Parking meter - higher segments on M4
  parkingMeter: (): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 1.2, SEGMENTS);
    geo.translate(0, 0.6, 0);
    return geo;
  },

  // Street lamp pole - higher segments on M4
  lampPole: (): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(0.08, 0.1, 6, SEGMENTS);
    geo.translate(0, 3, 0);
    return geo;
  },

  // Tree (cone shape) - higher segments on M4
  tree: (): THREE.BufferGeometry => {
    const geo = new THREE.ConeGeometry(2, 5, SEGMENTS);
    geo.translate(0, 4, 0);
    return geo;
  },

  // Bush - higher segments on M4
  bush: (): THREE.BufferGeometry => {
    const geo = new THREE.SphereGeometry(0.8, SEGMENTS, isHighQuality ? 8 : 4);
    geo.translate(0, 0.8, 0);
    return geo;
  },

  // Billboard pole - higher segments on M4
  billboardPole: (): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(0.15, 0.18, 8, SEGMENTS);
    geo.translate(0, 4, 0);
    return geo;
  },

  // AC unit (box)
  acUnit: (): THREE.BufferGeometry => {
    return new THREE.BoxGeometry(1.2, 0.6, 0.8);
  },

  // Antenna - higher segments on M4
  antenna: (): THREE.BufferGeometry => {
    const geo = new THREE.CylinderGeometry(0.02, 0.02, 3, SEGMENTS);
    geo.translate(0, 1.5, 0);
    return geo;
  }
};

/**
 * Pre-built optimized materials for common city objects
 */
export const OptimizedMaterials = {
  fireHydrant: new THREE.MeshStandardMaterial({
    color: 0xff3333,
    roughness: 0.4,
    metalness: 0.3
  }),

  trashCan: new THREE.MeshStandardMaterial({
    color: 0x228822,
    roughness: 0.6,
    metalness: 0.4
  }),

  mailbox: new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.4,
    metalness: 0.3
  }),

  parkingMeter: new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.4,
    metalness: 0.6
  }),

  lampPole: new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.5,
    metalness: 0.7
  }),

  treeFoliage: new THREE.MeshStandardMaterial({
    color: 0x2d5a27,
    roughness: 0.9
  }),

  bush: new THREE.MeshStandardMaterial({
    color: 0x3a7a34,
    roughness: 0.9
  }),

  acUnit: new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.7,
    metalness: 0.3
  }),

  antenna: new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.5,
    metalness: 0.8
  }),

  concrete: new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.9
  })
};
