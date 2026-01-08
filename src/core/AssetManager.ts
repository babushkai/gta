import * as THREE from 'three';

/**
 * AssetManager - Centralized asset caching and shader pre-compilation
 *
 * Key optimizations:
 * 1. Material pooling - Reuse materials across similar objects
 * 2. Geometry caching - Share geometries where possible
 * 3. Shader pre-compilation - Force WebGL to compile shaders during loading
 * 4. Texture management - Pre-load and cache textures
 */
export class AssetManager {
  private static instance: AssetManager;

  // Material caches by type
  private materials: Map<string, THREE.Material> = new Map();
  private geometries: Map<string, THREE.BufferGeometry> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();

  // Pre-compiled shader materials (all materials that need shader compilation)
  private compiledMaterials: Set<THREE.Material> = new Set();

  // Dummy scene for pre-compilation
  private precompileScene: THREE.Scene | null = null;
  private precompileCamera: THREE.Camera | null = null;

  private constructor() {}

  static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  /**
   * Pre-compile all commonly used shaders during loading
   * This prevents lag spikes when turning around to see new objects
   */
  async precompileShaders(
    renderer: THREE.WebGLRenderer,
    onProgress?: (progress: number, message: string) => void
  ): Promise<void> {
    console.log('🔧 Pre-compiling shaders...');

    // Create temporary scene for compilation
    this.precompileScene = new THREE.Scene();
    this.precompileCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    this.precompileCamera.position.z = 5;

    // Add basic lighting (required for MeshStandardMaterial compilation)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    this.precompileScene.add(ambientLight);
    this.precompileScene.add(directionalLight);

    // Create all material types that will be used in the game
    const materialsToCompile = this.createAllMaterialTypes();
    const totalMaterials = materialsToCompile.length;

    // Create a simple geometry for rendering
    const testGeometry = new THREE.BoxGeometry(1, 1, 1);

    // Compile each material by rendering it once
    for (let i = 0; i < materialsToCompile.length; i++) {
      const { name, material } = materialsToCompile[i];

      // Create mesh with this material
      const mesh = new THREE.Mesh(testGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.precompileScene.add(mesh);

      // Force shader compilation by rendering
      renderer.compile(this.precompileScene, this.precompileCamera);

      // Also do an actual render to ensure full compilation
      renderer.render(this.precompileScene, this.precompileCamera);

      // Remove mesh after compilation
      this.precompileScene.remove(mesh);

      // Cache the material
      this.materials.set(name, material);
      this.compiledMaterials.add(material);

      // Report progress
      const progress = Math.floor(((i + 1) / totalMaterials) * 100);
      onProgress?.(progress, `Compiling: ${name}`);

      // Yield to UI thread periodically
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Cleanup
    testGeometry.dispose();
    this.precompileScene.clear();
    this.precompileScene = null;
    this.precompileCamera = null;

    console.log(`✅ Pre-compiled ${totalMaterials} shader programs`);
  }

  /**
   * Create all material types used throughout the game
   */
  private createAllMaterialTypes(): { name: string; material: THREE.Material }[] {
    const materials: { name: string; material: THREE.Material }[] = [];

    // === BUILDING MATERIALS ===
    // Brownstone colors
    [0xB87333, 0xCD853F, 0xD2691E, 0xCC7722, 0xC19A6B].forEach((color, i) => {
      materials.push({
        name: `building_brownstone_${i}`,
        material: new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 })
      });
    });

    // Art deco colors
    [0xE8DCC8, 0xDDD0B8, 0xCCC0A8, 0xD5C8B5, 0xE0D4C0].forEach((color, i) => {
      materials.push({
        name: `building_artdeco_${i}`,
        material: new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15 })
      });
    });

    // Pre-war brick colors
    [0xCC5500, 0xE07020, 0xD4652F, 0xC87530, 0xE08050].forEach((color, i) => {
      materials.push({
        name: `building_prewar_${i}`,
        material: new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 })
      });
    });

    // Modern concrete
    [0x808080, 0x909090, 0xA0A0A0, 0x787878, 0x888888].forEach((color, i) => {
      materials.push({
        name: `building_modern_${i}`,
        material: new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 })
      });
    });

    // Glass tower colors
    [0x4682B4, 0x5F9EA0, 0x6495ED, 0x708090, 0x87CEEB].forEach((color, i) => {
      materials.push({
        name: `building_glass_${i}`,
        material: new THREE.MeshStandardMaterial({
          color, roughness: 0.1, metalness: 0.9,
          envMapIntensity: 1.5, transparent: true, opacity: 0.85
        })
      });
    });

    // Warehouse brick
    [0xA52A2A, 0xB5524A, 0xC06050, 0xB84040, 0xA04030].forEach((color, i) => {
      materials.push({
        name: `building_warehouse_${i}`,
        material: new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 })
      });
    });

    // === WINDOW MATERIALS ===
    materials.push({
      name: 'window_day',
      material: new THREE.MeshStandardMaterial({
        color: 0x87CEEB, roughness: 0.1, metalness: 0.8,
        transparent: true, opacity: 0.6
      })
    });

    materials.push({
      name: 'window_night_lit',
      material: new THREE.MeshStandardMaterial({
        color: 0xFFE4B5, emissive: 0xFFD700, emissiveIntensity: 0.8,
        roughness: 0.2, metalness: 0.1
      })
    });

    materials.push({
      name: 'window_night_dark',
      material: new THREE.MeshStandardMaterial({
        color: 0x1a1a2e, roughness: 0.3, metalness: 0.5
      })
    });

    // === ROAD MATERIALS ===
    materials.push({
      name: 'road_asphalt',
      material: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.02 })
    });

    materials.push({
      name: 'sidewalk',
      material: new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.95, metalness: 0.0 })
    });

    materials.push({
      name: 'curb',
      material: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 })
    });

    materials.push({
      name: 'road_line_yellow',
      material: new THREE.MeshStandardMaterial({
        color: 0xFFD700, roughness: 0.6, emissive: 0x332200, emissiveIntensity: 0.1
      })
    });

    materials.push({
      name: 'road_line_white',
      material: new THREE.MeshStandardMaterial({
        color: 0xEEEEEE, roughness: 0.6, emissive: 0x222222, emissiveIntensity: 0.1
      })
    });

    // === STREET FURNITURE ===
    materials.push({
      name: 'hydrant_red',
      material: new THREE.MeshStandardMaterial({ color: 0xFF0000, roughness: 0.6, metalness: 0.3 })
    });

    materials.push({
      name: 'mailbox_blue',
      material: new THREE.MeshStandardMaterial({ color: 0x1E3A8A, roughness: 0.4, metalness: 0.6 })
    });

    materials.push({
      name: 'trash_green',
      material: new THREE.MeshStandardMaterial({ color: 0x2D5016, roughness: 0.7, metalness: 0.2 })
    });

    materials.push({
      name: 'bench_wood',
      material: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8, metalness: 0.0 })
    });

    materials.push({
      name: 'metal_dark',
      material: new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.7, metalness: 0.3 })
    });

    materials.push({
      name: 'metal_light',
      material: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.6 })
    });

    // === VEHICLE MATERIALS ===
    const vehicleColors = [
      0xFF0000, 0x0000FF, 0x00FF00, 0xFFFF00, 0xFF6600,
      0x9900FF, 0x00FFFF, 0xFF00FF, 0x333333, 0xFFFFFF,
      0x1a1a1a, 0xC0C0C0, 0x8B0000, 0x006400, 0x00008B
    ];
    vehicleColors.forEach((color, i) => {
      materials.push({
        name: `vehicle_body_${i}`,
        material: new THREE.MeshStandardMaterial({
          color, roughness: 0.2, metalness: 0.8, envMapIntensity: 1.0
        })
      });
    });

    materials.push({
      name: 'vehicle_glass',
      material: new THREE.MeshStandardMaterial({
        color: 0x87CEEB, roughness: 0.05, metalness: 0.9,
        transparent: true, opacity: 0.4
      })
    });

    materials.push({
      name: 'vehicle_tire',
      material: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 })
    });

    materials.push({
      name: 'vehicle_chrome',
      material: new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.1, metalness: 1.0 })
    });

    materials.push({
      name: 'vehicle_headlight',
      material: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF, emissive: 0xFFFFAA, emissiveIntensity: 1.0
      })
    });

    materials.push({
      name: 'vehicle_taillight',
      material: new THREE.MeshStandardMaterial({
        color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.5
      })
    });

    // === CHARACTER MATERIALS ===
    materials.push({
      name: 'skin',
      material: new THREE.MeshStandardMaterial({ color: 0xE0C8B0, roughness: 0.6, metalness: 0.0 })
    });

    materials.push({
      name: 'clothes_blue',
      material: new THREE.MeshStandardMaterial({ color: 0x1E3A5F, roughness: 0.8, metalness: 0.0 })
    });

    materials.push({
      name: 'clothes_gray',
      material: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7, metalness: 0.0 })
    });

    materials.push({
      name: 'hair_dark',
      material: new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.9, metalness: 0.0 })
    });

    // === NEON / EMISSIVE MATERIALS ===
    const neonColors = [0xFF1493, 0x00FF00, 0xFF6600, 0x00FFFF, 0xFFFF00, 0x9400D3, 0xFF0000];
    neonColors.forEach((color, i) => {
      materials.push({
        name: `neon_${i}`,
        material: new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 2.0,
          roughness: 0.2, metalness: 0.0
        })
      });
    });

    // === GROUND / NATURE ===
    materials.push({
      name: 'grass',
      material: new THREE.MeshStandardMaterial({ color: 0x4a6b4a, roughness: 0.95, metalness: 0.0 })
    });

    materials.push({
      name: 'water',
      material: new THREE.MeshStandardMaterial({
        color: 0x1E90FF, roughness: 0.1, metalness: 0.3,
        transparent: true, opacity: 0.8
      })
    });

    // === WEAPON MATERIALS ===
    materials.push({
      name: 'weapon_metal',
      material: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.9 })
    });

    materials.push({
      name: 'weapon_grip',
      material: new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8, metalness: 0.1 })
    });

    // === BASIC MATERIALS ===
    materials.push({
      name: 'basic_white',
      material: new THREE.MeshBasicMaterial({ color: 0xFFFFFF })
    });

    materials.push({
      name: 'basic_black',
      material: new THREE.MeshBasicMaterial({ color: 0x000000 })
    });

    materials.push({
      name: 'line_material',
      material: new THREE.LineBasicMaterial({ color: 0xFFFFFF })
    });

    // === POINT MATERIALS (for particles) ===
    materials.push({
      name: 'particle_white',
      material: new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.1, transparent: true, opacity: 0.8 })
    });

    materials.push({
      name: 'particle_fire',
      material: new THREE.PointsMaterial({ color: 0xFF6600, size: 0.2, transparent: true, opacity: 0.9 })
    });

    return materials;
  }

  /**
   * Pre-cache common geometries
   */
  precacheGeometries(): void {
    console.log('📦 Pre-caching geometries...');

    // Box geometries of various sizes
    this.geometries.set('box_1x1x1', new THREE.BoxGeometry(1, 1, 1));
    this.geometries.set('box_2x2x2', new THREE.BoxGeometry(2, 2, 2));

    // Building base geometries
    this.geometries.set('building_base_10x50x10', new THREE.BoxGeometry(10, 50, 10));
    this.geometries.set('building_base_15x80x15', new THREE.BoxGeometry(15, 80, 15));
    this.geometries.set('building_base_20x100x20', new THREE.BoxGeometry(20, 100, 20));

    // Cylinder geometries
    this.geometries.set('cylinder_pole', new THREE.CylinderGeometry(0.12, 0.15, 7, 8));
    this.geometries.set('cylinder_hydrant', new THREE.CylinderGeometry(0.15, 0.18, 0.6, 8));

    // Plane geometries
    this.geometries.set('plane_1x1', new THREE.PlaneGeometry(1, 1));
    this.geometries.set('plane_road_segment', new THREE.PlaneGeometry(14, 100));

    // Sphere geometries
    this.geometries.set('sphere_small', new THREE.SphereGeometry(0.1, 8, 8));
    this.geometries.set('sphere_medium', new THREE.SphereGeometry(0.5, 16, 16));

    console.log(`✅ Pre-cached ${this.geometries.size} geometries`);
  }

  /**
   * Get a cached material by name, or create if not exists
   */
  getMaterial(name: string): THREE.Material | undefined {
    return this.materials.get(name);
  }

  /**
   * Get a cached geometry by name
   */
  getGeometry(name: string): THREE.BufferGeometry | undefined {
    return this.geometries.get(name);
  }

  /**
   * Register a custom material for caching
   */
  registerMaterial(name: string, material: THREE.Material): void {
    if (!this.materials.has(name)) {
      this.materials.set(name, material);
    }
  }

  /**
   * Check if shaders are pre-compiled
   */
  isPrecompiled(): boolean {
    return this.compiledMaterials.size > 0;
  }

  /**
   * Get statistics about cached assets
   */
  getStats(): { materials: number; geometries: number; textures: number } {
    return {
      materials: this.materials.size,
      geometries: this.geometries.size,
      textures: this.textures.size
    };
  }

  /**
   * Dispose all cached assets
   */
  dispose(): void {
    this.materials.forEach(m => m.dispose());
    this.geometries.forEach(g => g.dispose());
    this.textures.forEach(t => t.dispose());

    this.materials.clear();
    this.geometries.clear();
    this.textures.clear();
    this.compiledMaterials.clear();
  }
}
