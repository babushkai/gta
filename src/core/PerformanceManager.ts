import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * PerformanceManager - Advanced rendering optimizations for smooth gameplay
 *
 * Implements 2025 best practices:
 * 1. Geometry merging - Reduces draw calls by combining static meshes
 * 2. LOD (Level of Detail) - Simpler geometry for distant objects
 * 3. Distance culling - Hide objects beyond view distance
 * 4. Material batching - Share materials between similar objects
 * 5. Adaptive quality - Automatically adjust quality based on FPS
 */
export class PerformanceManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  // FPS tracking for adaptive quality
  private frameTimeHistory: number[] = [];
  private lastFrameTime: number = 0;
  private targetFPS: number = 60;
  private currentQuality: 'high' | 'medium' | 'low' = 'high';

  // Distance culling
  private cullDistance: number = 400;
  private nearDistance: number = 100;
  private mediumDistance: number = 200;

  // Merged geometry groups
  private mergedMeshes: Map<string, THREE.Mesh> = new Map();
  private originalMeshes: Map<string, THREE.Object3D[]> = new Map();

  // LOD objects
  private lodObjects: THREE.LOD[] = [];

  // Material cache for batching
  private materialCache: Map<string, THREE.Material> = new Map();

  // Performance stats
  private stats = {
    drawCalls: 0,
    triangles: 0,
    geometriesMerged: 0,
    objectsCulled: 0,
    lodSwitches: 0
  };

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Merge static geometries by material type to reduce draw calls dramatically
   * This is one of the most effective optimizations for city scenes
   */
  mergeStaticGeometries(objects: THREE.Object3D[], groupKey: string): THREE.Mesh | null {
    const geometriesByMaterial: Map<string, {
      geometries: THREE.BufferGeometry[];
      material: THREE.Material;
    }> = new Map();

    // Collect all geometries grouped by material
    objects.forEach(obj => {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh && child.geometry && child.material) {
          const material = child.material as THREE.Material;
          const matKey = this.getMaterialKey(material);

          if (!geometriesByMaterial.has(matKey)) {
            geometriesByMaterial.set(matKey, {
              geometries: [],
              material: material.clone()
            });
          }

          // Clone geometry and apply world transform
          const geo = child.geometry.clone();
          child.updateMatrixWorld(true);
          geo.applyMatrix4(child.matrixWorld);

          geometriesByMaterial.get(matKey)!.geometries.push(geo);
        }
      });
    });

    // Merge geometries for each material group
    const mergedMeshes: THREE.Mesh[] = [];

    geometriesByMaterial.forEach(({ geometries, material }, matKey) => {
      if (geometries.length > 1) {
        try {
          const mergedGeo = mergeGeometries(geometries, false);
          if (mergedGeo) {
            const mesh = new THREE.Mesh(mergedGeo, material);
            mesh.name = `merged_${groupKey}_${matKey}`;
            mesh.frustumCulled = true;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            mergedMeshes.push(mesh);
            this.stats.geometriesMerged += geometries.length;
          }
        } catch (e) {
          console.warn(`Failed to merge geometries for ${matKey}:`, e);
        }
      }

      // Dispose cloned geometries
      geometries.forEach(g => g.dispose());
    });

    if (mergedMeshes.length === 0) return null;

    // Create a group containing all merged meshes
    const group = new THREE.Group();
    group.name = `merged_group_${groupKey}`;
    mergedMeshes.forEach(m => group.add(m));

    // Store references
    this.originalMeshes.set(groupKey, objects);

    // Hide original objects
    objects.forEach(obj => {
      obj.visible = false;
    });

    this.scene.add(group);
    console.log(`✅ Merged ${objects.length} objects into ${mergedMeshes.length} batched meshes (${groupKey})`);

    return mergedMeshes[0];
  }

  /**
   * Create a unique key for material batching
   */
  private getMaterialKey(material: THREE.Material): string {
    if (material instanceof THREE.MeshStandardMaterial) {
      return `std_${material.color.getHex()}_${material.roughness.toFixed(1)}_${material.metalness.toFixed(1)}`;
    }
    if (material instanceof THREE.MeshBasicMaterial) {
      return `basic_${material.color.getHex()}`;
    }
    return `other_${material.uuid.slice(0, 8)}`;
  }

  /**
   * Create LOD object with multiple detail levels
   */
  createLOD(
    highDetail: THREE.Object3D,
    mediumDetail: THREE.Object3D,
    lowDetail: THREE.Object3D,
    position: THREE.Vector3
  ): THREE.LOD {
    const lod = new THREE.LOD();

    lod.addLevel(highDetail, 0);
    lod.addLevel(mediumDetail, this.nearDistance);
    lod.addLevel(lowDetail, this.mediumDistance);

    lod.position.copy(position);
    lod.autoUpdate = true;

    this.lodObjects.push(lod);
    this.scene.add(lod);

    return lod;
  }

  /**
   * Create simplified geometry for LOD
   */
  createSimplifiedGeometry(geometry: THREE.BufferGeometry, reductionFactor: number): THREE.BufferGeometry {
    // For box geometries, use lower segment counts
    if (geometry instanceof THREE.BoxGeometry) {
      const params = geometry.parameters;
      return new THREE.BoxGeometry(
        params.width,
        params.height,
        params.depth,
        1, 1, 1 // Minimal segments
      );
    }

    // For other geometries, return a simplified box approximation
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);

    return new THREE.BoxGeometry(size.x, size.y, size.z, 1, 1, 1);
  }

  /**
   * Distance-based culling update - call every frame
   */
  updateDistanceCulling(objects: THREE.Object3D[]): void {
    const cameraPos = this.camera.position;
    let culled = 0;

    objects.forEach(obj => {
      if (!obj.userData.cullable) return;

      const distance = cameraPos.distanceTo(obj.position);

      if (distance > this.cullDistance) {
        if (obj.visible) {
          obj.visible = false;
          culled++;
        }
      } else {
        if (!obj.visible) {
          obj.visible = true;
        }
      }
    });

    this.stats.objectsCulled = culled;
  }

  /**
   * Adaptive quality based on FPS
   */
  updateAdaptiveQuality(deltaTime: number): void {
    const frameTime = deltaTime * 1000; // Convert to ms
    this.frameTimeHistory.push(frameTime);

    // Keep last 60 frames
    if (this.frameTimeHistory.length > 60) {
      this.frameTimeHistory.shift();
    }

    // Calculate average FPS
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    const currentFPS = 1000 / avgFrameTime;

    // Adjust quality based on FPS
    if (currentFPS < 30 && this.currentQuality !== 'low') {
      this.setQuality('low');
    } else if (currentFPS < 45 && this.currentQuality === 'high') {
      this.setQuality('medium');
    } else if (currentFPS > 55 && this.currentQuality === 'low') {
      this.setQuality('medium');
    } else if (currentFPS > 58 && this.currentQuality === 'medium') {
      this.setQuality('high');
    }
  }

  /**
   * Set quality level
   */
  setQuality(quality: 'high' | 'medium' | 'low'): void {
    if (quality === this.currentQuality) return;

    console.log(`🎮 Quality changed: ${this.currentQuality} -> ${quality}`);
    this.currentQuality = quality;

    // Adjust culling distances
    switch (quality) {
      case 'high':
        this.cullDistance = 500;
        this.nearDistance = 150;
        this.mediumDistance = 300;
        break;
      case 'medium':
        this.cullDistance = 350;
        this.nearDistance = 100;
        this.mediumDistance = 200;
        break;
      case 'low':
        this.cullDistance = 200;
        this.nearDistance = 50;
        this.mediumDistance = 100;
        break;
    }
  }

  /**
   * Get shared material from cache
   */
  getSharedMaterial(config: {
    type: 'standard' | 'basic';
    color: number;
    roughness?: number;
    metalness?: number;
  }): THREE.Material {
    const key = `${config.type}_${config.color}_${config.roughness ?? 0.5}_${config.metalness ?? 0}`;

    if (!this.materialCache.has(key)) {
      let material: THREE.Material;

      if (config.type === 'standard') {
        material = new THREE.MeshStandardMaterial({
          color: config.color,
          roughness: config.roughness ?? 0.5,
          metalness: config.metalness ?? 0
        });
      } else {
        material = new THREE.MeshBasicMaterial({ color: config.color });
      }

      this.materialCache.set(key, material);
    }

    return this.materialCache.get(key)!;
  }

  /**
   * Update LOD objects
   */
  updateLOD(): void {
    let switches = 0;

    this.lodObjects.forEach(lod => {
      const prevLevel = lod.getCurrentLevel();
      lod.update(this.camera);
      if (lod.getCurrentLevel() !== prevLevel) {
        switches++;
      }
    });

    this.stats.lodSwitches = switches;
  }

  /**
   * Main update function - call every frame
   */
  update(deltaTime: number): void {
    this.updateAdaptiveQuality(deltaTime);
    this.updateLOD();
  }

  /**
   * Get current performance stats
   */
  getStats(): typeof this.stats & { fps: number; quality: string } {
    const avgFrameTime = this.frameTimeHistory.length > 0
      ? this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length
      : 16.67;

    return {
      ...this.stats,
      fps: Math.round(1000 / avgFrameTime),
      quality: this.currentQuality
    };
  }

  /**
   * Get current quality level
   */
  getQuality(): string {
    return this.currentQuality;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.mergedMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    });
    this.mergedMeshes.clear();

    this.materialCache.forEach(m => m.dispose());
    this.materialCache.clear();

    this.lodObjects.forEach(lod => {
      this.scene.remove(lod);
    });
    this.lodObjects = [];
  }
}

/**
 * Helper to create instanced mesh from array of positions
 */
export function createInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  positions: THREE.Vector3[],
  rotations?: THREE.Euler[]
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();

  positions.forEach((pos, i) => {
    if (rotations && rotations[i]) {
      quaternion.setFromEuler(rotations[i]);
    } else {
      quaternion.identity();
    }

    matrix.compose(pos, quaternion, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = true;

  return mesh;
}

/**
 * Utility to batch similar meshes into instanced mesh
 */
export function batchToInstancedMesh(
  meshes: THREE.Mesh[],
  scene: THREE.Scene
): THREE.InstancedMesh | null {
  if (meshes.length < 2) return null;

  // Use first mesh's geometry and material
  const baseGeometry = meshes[0].geometry;
  const baseMaterial = meshes[0].material;

  const instancedMesh = new THREE.InstancedMesh(
    baseGeometry,
    baseMaterial as THREE.Material,
    meshes.length
  );

  const matrix = new THREE.Matrix4();

  meshes.forEach((mesh, i) => {
    mesh.updateMatrixWorld(true);
    matrix.copy(mesh.matrixWorld);
    instancedMesh.setMatrixAt(i, matrix);

    // Remove original mesh
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
  });

  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.frustumCulled = true;

  scene.add(instancedMesh);

  return instancedMesh;
}
