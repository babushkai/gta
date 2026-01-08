import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WorldObject, Pickup, PickupType } from '@/types';
import { Game } from '@/core/Game';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';
import { globalEvents } from '@/core/EventEmitter';

// NYC Building styles
type NYCBuildingStyle = 'brownstone' | 'artdeco' | 'prewar' | 'modern' | 'glass_tower' | 'warehouse';

interface Building {
  mesh: THREE.Group;
  body: CANNON.Body;
  type: 'residential' | 'commercial' | 'industrial';
  style: NYCBuildingStyle;
}

interface StreetLight {
  mesh: THREE.Group;
  light: THREE.PointLight;
  position: THREE.Vector3;
}

// Building metadata for CityDetailsManager to attach details to actual buildings
export interface BuildingMetadata {
  id: string;
  position: THREE.Vector3;  // Ground position (y=0)
  actualY: number;          // Actual mesh Y position (height/2)
  width: number;
  height: number;
  depth: number;
  style: NYCBuildingStyle;
  district: string;
  mesh: THREE.Group;
}

// NYC Color palettes - warm, vibrant NYC character
const NYC_PALETTES = {
  brownstone: [0xB87333, 0xCD853F, 0xD2691E, 0xCC7722, 0xC19A6B], // Warm brownstone
  artdeco: [0xE8DCC8, 0xDDD0B8, 0xCCC0A8, 0xD5C8B5, 0xE0D4C0], // Cream/stone
  prewar: [0xCC5500, 0xE07020, 0xD4652F, 0xC87530, 0xE08050], // Warm brick/terracotta
  modern: [0x808080, 0x909090, 0xA0A0A0, 0x787878, 0x888888], // Light gray concrete
  glass_tower: [0x4682B4, 0x5F9EA0, 0x6495ED, 0x708090, 0x87CEEB], // Blue glass
  warehouse: [0xA52A2A, 0xB5524A, 0xC06050, 0xB84040, 0xA04030] // Red brick
};

// NYC grime/weathering colors - subtle accents
const NYC_GRIME = {
  waterStain: 0x606060,
  soot: 0x505050,
  rust: 0xB87333,
  mold: 0x4A6A4A,
  graffiti: [0xFF1493, 0x00FF00, 0xFF6600, 0x00FFFF, 0xFFFF00, 0x9400D3]
};

export class World {
  private game: Game;
  private objects: Map<string, WorldObject> = new Map();
  private pickups: Map<string, Pickup> = new Map();
  private buildings: Building[] = [];
  private streetLights: StreetLight[] = [];

  // Container for all world objects (for hiding during interior)
  private worldGroup: THREE.Group;

  // Building registry for CityDetailsManager to attach details to actual buildings
  private buildingRegistry: Map<string, BuildingMetadata> = new Map();
  private currentDistrict: string = 'midtown'; // Track current district during creation

  private ground: THREE.Mesh | null = null;
  private roads: THREE.Mesh[] = [];

  // InstancedMesh for performance optimization
  private hydrantInstances: THREE.InstancedMesh | null = null;
  private trafficLightInstances: THREE.InstancedMesh | null = null;
  private crosswalkStripeInstances: THREE.InstancedMesh | null = null;

  // Instance tracking
  private hydrantIndex = 0;
  private trafficLightIndex = 0;
  private crosswalkStripeIndex = 0;

  private objectIdCounter: number = 0;
  private pickupIdCounter: number = 0;

  private unlockedAreas: string[] = ['downtown'];
  private hospitalLocations: THREE.Vector3[] = [
    new THREE.Vector3(0, 1, 50),
    new THREE.Vector3(-100, 1, -100),
    new THREE.Vector3(150, 1, 80)
  ];

  constructor(game: Game) {
    this.game = game;
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'worldGroup';
  }

  getWorldGroup(): THREE.Group {
    return this.worldGroup;
  }

  async initialize(): Promise<void> {
    this.createGround();
    this.initializeInstancedMeshes();
    this.createRoads();
    this.createBuildings();
    this.createStreetLights();
    this.createPickups();
    this.createDestructibles();

    this.game.physics.createGroundPlane(1000);

    // Add worldGroup to scene (allows hiding entire world for interiors)
    this.game.scene.add(this.worldGroup);
  }

  private initializeInstancedMeshes(): void {
    // Pre-allocate instanced meshes for street furniture
    // Calculate max instances based on grid size
    const maxHydrants = 200;
    const maxCrosswalkStripes = 3000;

    // Fire hydrants - merged geometry for body, cap, nozzles, base
    const hydrantGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.6, 8);
    const hydrantMaterial = new THREE.MeshStandardMaterial({
      color: 0xFF0000,
      roughness: 0.6,
      metalness: 0.3
    });
    this.hydrantInstances = new THREE.InstancedMesh(hydrantGeometry, hydrantMaterial, maxHydrants);
    this.hydrantInstances.castShadow = true;
    this.hydrantInstances.count = 0; // Start with 0 visible
    this.worldGroup.add(this.hydrantInstances);

    // Crosswalk stripes
    const stripeGeometry = new THREE.PlaneGeometry(0.6, 1);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.7,
      emissive: 0x111111,
      emissiveIntensity: 0.1
    });
    this.crosswalkStripeInstances = new THREE.InstancedMesh(stripeGeometry, stripeMaterial, maxCrosswalkStripes);
    this.crosswalkStripeInstances.rotation.x = -Math.PI / 2;
    this.crosswalkStripeInstances.position.y = 0.028;
    this.crosswalkStripeInstances.count = 0;
    this.worldGroup.add(this.crosswalkStripeInstances);

    // Traffic light poles (just the main pole cylinder for instancing)
    const poleGeometry = new THREE.CylinderGeometry(0.12, 0.15, 7, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.7, metalness: 0.3 });
    this.trafficLightInstances = new THREE.InstancedMesh(poleGeometry, poleMaterial, 200);
    this.trafficLightInstances.castShadow = true;
    this.trafficLightInstances.count = 0;
    this.worldGroup.add(this.trafficLightInstances);
  }

  private createGround(): void {
    const groundSize = 1000;

    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 200, 200);

    // Create procedural grass texture
    const grassTexture = this.createGrassTexture();
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(100, 100);

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a6b4a,
      map: grassTexture,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.2
    });

    // Add slight height variation for realism
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      // Gentle rolling hills
      const noise = Math.sin(x * 0.01) * Math.cos(y * 0.01) * 0.3;
      positions.setZ(i, noise);
    }
    groundGeometry.computeVertexNormals();

    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;

    this.worldGroup.add(this.ground);
  }

  private createGrassTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Base green
    ctx.fillStyle = '#3a5a3a';
    ctx.fillRect(0, 0, 256, 256);

    // Add grass blade variations
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const shade = Math.floor(Math.random() * 40) + 40;
      ctx.fillStyle = `rgb(${shade}, ${shade + 30}, ${shade})`;
      ctx.fillRect(x, y, 1, 2);
    }

    // Add some darker patches
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const radius = Math.random() * 20 + 10;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(30, 50, 30, 0.3)');
      gradient.addColorStop(1, 'rgba(30, 50, 30, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createAsphaltTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Base dark gray
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 256, 256);

    // Add asphalt grain
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const shade = Math.floor(Math.random() * 30) + 25;
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Add occasional lighter spots (gravel)
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const shade = Math.floor(Math.random() * 20) + 50;
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Add subtle cracks
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, Math.random() * 256);
      for (let j = 0; j < 3; j++) {
        ctx.lineTo(
          ctx.canvas.width * Math.random(),
          ctx.canvas.height * Math.random()
        );
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createRoads(): void {
    // Create NYC-style grid with avenues (wider, N-S) and streets (narrower, E-W)
    const asphaltTexture = this.createAsphaltTexture();
    asphaltTexture.wrapS = THREE.RepeatWrapping;
    asphaltTexture.wrapT = THREE.RepeatWrapping;

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      map: asphaltTexture,
      roughness: 0.9,
      metalness: 0.02
    });

    const sidewalkTexture = this.createSidewalkTexture();
    sidewalkTexture.wrapS = THREE.RepeatWrapping;
    sidewalkTexture.wrapT = THREE.RepeatWrapping;

    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      map: sidewalkTexture,
      roughness: 0.95,
      metalness: 0.0
    });

    const curbMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.8
    });

    const yellowLineMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      roughness: 0.6,
      emissive: 0x332200,
      emissiveIntensity: 0.1
    });

    const whiteLineMaterial = new THREE.MeshStandardMaterial({
      color: 0xEEEEEE,
      roughness: 0.6,
      emissive: 0x222222,
      emissiveIntensity: 0.1
    });

    const avenueWidth = 14; // Wider avenues (like 5th Ave)
    const streetWidth = 10;  // Narrower streets
    const sidewalkWidth = 4;
    const blockSizeX = 60;   // Blocks are longer E-W
    const blockSizeZ = 45;   // Blocks are shorter N-S

    // Create avenues (North-South, vertical on map)
    for (let i = -5; i <= 5; i++) {
      const avenueX = i * blockSizeX;

      // Main avenue road
      const avenue = new THREE.Mesh(
        new THREE.PlaneGeometry(avenueWidth, 600),
        roadMaterial
      );
      avenue.rotation.x = -Math.PI / 2;
      avenue.position.set(avenueX, 0.02, 0);
      avenue.receiveShadow = true;
      this.roads.push(avenue);
      this.worldGroup.add(avenue);

      // Yellow center line (double yellow for avenues)
      const centerLine1 = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 600), yellowLineMaterial);
      centerLine1.rotation.x = -Math.PI / 2;
      centerLine1.position.set(avenueX - 0.2, 0.025, 0);
      this.worldGroup.add(centerLine1);

      const centerLine2 = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 600), yellowLineMaterial);
      centerLine2.rotation.x = -Math.PI / 2;
      centerLine2.position.set(avenueX + 0.2, 0.025, 0);
      this.worldGroup.add(centerLine2);

      // Sidewalks on both sides
      for (const side of [-1, 1]) {
        const sidewalk = new THREE.Mesh(
          new THREE.PlaneGeometry(sidewalkWidth, 600),
          sidewalkMaterial
        );
        sidewalk.rotation.x = -Math.PI / 2;
        sidewalk.position.set(avenueX + side * (avenueWidth / 2 + sidewalkWidth / 2), 0.08, 0);
        sidewalk.receiveShadow = true;
        this.worldGroup.add(sidewalk);

        // Curb
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 600), curbMaterial);
        curb.position.set(avenueX + side * (avenueWidth / 2 + 0.15), 0.075, 0);
        this.worldGroup.add(curb);
      }
    }

    // Create streets (East-West, horizontal on map)
    for (let j = -6; j <= 6; j++) {
      const streetZ = j * blockSizeZ;

      // Main street road
      const street = new THREE.Mesh(
        new THREE.PlaneGeometry(600, streetWidth),
        roadMaterial
      );
      street.rotation.x = -Math.PI / 2;
      street.position.set(0, 0.02, streetZ);
      street.receiveShadow = true;
      this.roads.push(street);
      this.worldGroup.add(street);

      // White dashed center line
      for (let k = -30; k <= 30; k++) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.12), whiteLineMaterial);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(k * 10, 0.025, streetZ);
        this.worldGroup.add(dash);
      }

      // Sidewalks
      for (const side of [-1, 1]) {
        const sidewalk = new THREE.Mesh(
          new THREE.PlaneGeometry(600, sidewalkWidth),
          sidewalkMaterial
        );
        sidewalk.rotation.x = -Math.PI / 2;
        sidewalk.position.set(0, 0.08, streetZ + side * (streetWidth / 2 + sidewalkWidth / 2));
        sidewalk.receiveShadow = true;
        this.worldGroup.add(sidewalk);

        // Curb
        const curb = new THREE.Mesh(new THREE.BoxGeometry(600, 0.15, 0.3), curbMaterial);
        curb.position.set(0, 0.075, streetZ + side * (streetWidth / 2 + 0.15));
        this.worldGroup.add(curb);
      }
    }

    // Create intersections with crosswalks
    for (let x = -5; x <= 5; x++) {
      for (let z = -6; z <= 6; z++) {
        const intX = x * blockSizeX;
        const intZ = z * blockSizeZ;

        // Intersection
        const intersection = new THREE.Mesh(
          new THREE.PlaneGeometry(avenueWidth + 2, streetWidth + 2),
          roadMaterial
        );
        intersection.rotation.x = -Math.PI / 2;
        intersection.position.set(intX, 0.022, intZ);
        intersection.receiveShadow = true;
        this.worldGroup.add(intersection);

        // Crosswalks (zebra stripes)
        this.createCrosswalk(intX, intZ, avenueWidth, streetWidth);

        // Traffic light at every other intersection
        if ((x + z) % 2 === 0) {
          this.createTrafficLight(intX + avenueWidth / 2 + 1, intZ + streetWidth / 2 + 1);
        }

        // Fire hydrant at some corners
        if (Math.random() > 0.6) {
          this.createFireHydrant(intX + avenueWidth / 2 + 2, intZ + streetWidth / 2 + 2);
        }
      }
    }

    // Add subway entrances at key locations
    this.createSubwayEntrance(0, 0);
    this.createSubwayEntrance(120, 90);
    this.createSubwayEntrance(-120, -90);
    this.createSubwayEntrance(60, 180);

    // Add NYC street details
    this.createStreetFurniture();
    this.createScaffolding();
  }

  // NYC street furniture - trash cans, newspaper boxes, mailboxes
  private createStreetFurniture(): void {
    const trashCanMat = new THREE.MeshStandardMaterial({ color: 0x2A5A2A, roughness: 0.7 });
    const mailboxMat = new THREE.MeshStandardMaterial({ color: 0x1E3D59, roughness: 0.5, metalness: 0.3 });
    const newsPaperMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.4, metalness: 0.3 });

    // Place furniture at intersections
    for (let x = -4; x <= 4; x++) {
      for (let z = -5; z <= 5; z++) {
        const baseX = x * 60;
        const baseZ = z * 45;

        // NYC green trash can
        if (Math.random() > 0.4) {
          const trashCan = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 1, 12), trashCanMat);
          trashCan.position.set(baseX + 8, 0.5, baseZ + 6);
          trashCan.castShadow = true;
          this.worldGroup.add(trashCan);

          // Trash spilling out
          if (Math.random() > 0.6) {
            const trashMat = new THREE.MeshBasicMaterial({ color: 0x8B7355 });
            for (let i = 0; i < 3; i++) {
              const trash = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), trashMat);
              trash.position.set(
                baseX + 8 + (Math.random() - 0.5) * 1.5,
                0.05,
                baseZ + 6 + (Math.random() - 0.5) * 1.5
              );
              trash.rotation.y = Math.random() * Math.PI;
              this.worldGroup.add(trash);
            }
          }
        }

        // Blue USPS mailbox
        if (Math.random() > 0.85) {
          const mailbox = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.5), mailboxMat);
          body.position.y = 0.6;
          mailbox.add(body);
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.15, 0.55), mailboxMat);
          top.position.y = 1.25;
          mailbox.add(top);
          mailbox.position.set(baseX - 8, 0, baseZ + 7);
          mailbox.castShadow = true;
          this.worldGroup.add(mailbox);
        }

        // Newspaper box
        if (Math.random() > 0.8) {
          const newsBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.4), newsPaperMat);
          newsBox.position.set(baseX + 9, 0.55, baseZ - 6);
          newsBox.castShadow = true;
          this.worldGroup.add(newsBox);
        }
      }
    }

    // Add some scattered garbage bags
    const garbageMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9 });
    for (let i = 0; i < 30; i++) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), garbageMat);
      bag.scale.set(1, 0.7, 1.2);
      bag.position.set(
        (Math.random() - 0.5) * 400,
        0.25,
        (Math.random() - 0.5) * 400
      );
      this.worldGroup.add(bag);
    }
  }

  // Construction scaffolding on some buildings
  private createScaffolding(): void {
    const scaffoldMat = new THREE.MeshStandardMaterial({ color: 0x4A4A4A, metalness: 0.6, roughness: 0.5 });
    const plywoodMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9 });

    // Add scaffolding to a few random locations
    const scaffoldLocations = [
      { x: 30, z: 60, width: 15, height: 20 },
      { x: -90, z: -30, width: 12, height: 25 },
      { x: 120, z: 45, width: 18, height: 15 },
      { x: -45, z: 90, width: 10, height: 18 },
    ];

    scaffoldLocations.forEach(loc => {
      const scaffoldGroup = new THREE.Group();

      // Vertical poles
      for (let i = 0; i <= Math.floor(loc.width / 3); i++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, loc.height, 8), scaffoldMat);
        pole.position.set(i * 3, loc.height / 2, 0);
        scaffoldGroup.add(pole);

        const pole2 = pole.clone();
        pole2.position.z = 1.5;
        scaffoldGroup.add(pole2);
      }

      // Horizontal bars and platforms
      for (let level = 0; level < Math.floor(loc.height / 3); level++) {
        // Platform
        const platform = new THREE.Mesh(new THREE.BoxGeometry(loc.width, 0.15, 1.5), plywoodMat);
        platform.position.set(loc.width / 2, level * 3 + 2, 0.75);
        scaffoldGroup.add(platform);

        // Cross braces
        for (let i = 0; i < Math.floor(loc.width / 3); i++) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.5, 0.03), scaffoldMat);
          brace.rotation.z = Math.PI / 6;
          brace.position.set(i * 3 + 1.5, level * 3 + 0.5, 0);
          scaffoldGroup.add(brace);
        }
      }

      // Green safety netting
      const netMat = new THREE.MeshBasicMaterial({
        color: 0x228B22,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
      });
      const net = new THREE.Mesh(new THREE.PlaneGeometry(loc.width, loc.height), netMat);
      net.position.set(loc.width / 2, loc.height / 2, -0.1);
      scaffoldGroup.add(net);

      scaffoldGroup.position.set(loc.x, 0, loc.z);
      this.worldGroup.add(scaffoldGroup);
    });
  }

  private createSidewalkTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Base gray
    ctx.fillStyle = '#707070';
    ctx.fillRect(0, 0, 128, 128);

    // Concrete panel grid
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.lineTo(128, i * 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32, 128);
      ctx.stroke();
    }

    // Texture variation
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const shade = Math.floor(Math.random() * 30) + 90;
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Occasional gum/stains (NYC authenticity!)
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 20}, ${40 + Math.random() * 20}, ${40 + Math.random() * 20}, 0.3)`;
      ctx.beginPath();
      ctx.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createCrosswalk(intX: number, intZ: number, avenueWidth: number, streetWidth: number): void {
    if (!this.crosswalkStripeInstances) return;

    const matrix = new THREE.Matrix4();
    const scale = new THREE.Matrix4();

    // North-South crosswalks (across street)
    for (const xOffset of [-1, 1]) {
      for (let i = -3; i <= 3; i++) {
        matrix.identity();
        scale.makeScale(1, streetWidth - 1, 1);
        matrix.setPosition(intX + xOffset * (avenueWidth / 2 + 2) + i * 1.2, 0, intZ);
        matrix.multiply(scale);
        this.crosswalkStripeInstances.setMatrixAt(this.crosswalkStripeIndex, matrix);
        this.crosswalkStripeIndex++;
      }
    }

    // East-West crosswalks (across avenue)
    for (const zOffset of [-1, 1]) {
      for (let i = -4; i <= 4; i++) {
        matrix.identity();
        scale.makeScale(avenueWidth - 1, 1, 1);
        matrix.setPosition(intX, 0, intZ + zOffset * (streetWidth / 2 + 2) + i * 1.2);
        matrix.multiply(scale);
        this.crosswalkStripeInstances.setMatrixAt(this.crosswalkStripeIndex, matrix);
        this.crosswalkStripeIndex++;
      }
    }

    this.crosswalkStripeInstances.count = this.crosswalkStripeIndex;
    this.crosswalkStripeInstances.instanceMatrix.needsUpdate = true;
  }

  private createTrafficLight(x: number, z: number): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.7, metalness: 0.3 });
    const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.8 });

    // Use InstancedMesh for the main pole
    if (this.trafficLightInstances) {
      const matrix = new THREE.Matrix4();
      matrix.setPosition(x, 3.5, z);
      this.trafficLightInstances.setMatrixAt(this.trafficLightIndex, matrix);
      this.trafficLightIndex++;
      this.trafficLightInstances.count = this.trafficLightIndex;
      this.trafficLightInstances.instanceMatrix.needsUpdate = true;
    }

    // Arm extending over road
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), poleMaterial);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(x - 2, 6.5, z);
    this.worldGroup.add(arm);

    // Traffic light housing
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.4), housingMaterial);
    housing.position.set(x - 3.5, 6.3, z);
    this.worldGroup.add(housing);

    // Lights
    const lightColors = [0xFF0000, 0xFFFF00, 0x00FF00];
    const litIndex = Math.floor(Math.random() * 3);

    lightColors.forEach((color, index) => {
      const isLit = index === litIndex;
      const lightMat = new THREE.MeshStandardMaterial({
        color: isLit ? color : 0x333333,
        emissive: isLit ? color : 0x000000,
        emissiveIntensity: isLit ? 0.8 : 0
      });
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lightMat);
      light.position.set(x - 3.5, 6.7 - index * 0.4, z + 0.22);
      this.worldGroup.add(light);
    });

    // Walk/Don't Walk sign
    const walkSign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), housingMaterial);
    walkSign.position.set(x, 5.5, z);
    this.worldGroup.add(walkSign);

    const walkLight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xFF4400 : 0xFFFFFF })
    );
    walkLight.position.set(x, 5.5, z + 0.06);
    this.worldGroup.add(walkLight);
  }

  private createFireHydrant(x: number, z: number): void {
    if (!this.hydrantInstances) return;

    // Use instanced mesh for the main hydrant body
    const matrix = new THREE.Matrix4();
    matrix.setPosition(x, 0.3, z);
    this.hydrantInstances.setMatrixAt(this.hydrantIndex, matrix);
    this.hydrantIndex++;
    this.hydrantInstances.count = this.hydrantIndex;
    this.hydrantInstances.instanceMatrix.needsUpdate = true;

    // Additional details (cap, nozzles, base) as individual meshes for now
    // These are small and don't significantly impact performance
    const hydrantMaterial = new THREE.MeshStandardMaterial({
      color: 0xFF0000,
      roughness: 0.6,
      metalness: 0.3
    });

    // Top cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.15, 8), hydrantMaterial);
    cap.position.set(x, 0.67, z);
    this.worldGroup.add(cap);

    // Nozzles
    for (const side of [-1, 1]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6), hydrantMaterial);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(x + side * 0.2, 0.4, z);
      this.worldGroup.add(nozzle);
    }

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 8), hydrantMaterial);
    base.position.set(x, 0.05, z);
    this.worldGroup.add(base);
  }

  private createSubwayEntrance(x: number, z: number): void {
    const railingMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22, // NYC subway green
      roughness: 0.4,
      metalness: 0.6
    });
    const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.8 });
    const signMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22,
      emissive: 0x114411,
      emissiveIntensity: 0.2
    });

    // Entrance frame
    const frame = new THREE.Group();

    // Globe lights (iconic NYC subway)
    for (const side of [-1, 1]) {
      const globePost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), railingMaterial);
      globePost.position.set(side * 2, 1.5, 0);
      frame.add(globePost);

      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0x00FF00, // Green globe = available 24/7
          emissive: 0x00AA00,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.8
        })
      );
      globe.position.set(side * 2, 3.3, 0);
      frame.add(globe);
    }

    // Top beam with subway sign
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.8), railingMaterial);
    beam.position.set(0, 3, 0);
    frame.add(beam);

    // SUBWAY text (simplified as box)
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 0.1), signMaterial);
    sign.position.set(0, 3, 0.45);
    frame.add(sign);

    // Stairs going down
    for (let i = 0; i < 8; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 0.6), stepMaterial);
      step.position.set(0, -i * 0.25, -i * 0.6 - 0.3);
      frame.add(step);
    }

    // Handrails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 5.5), railingMaterial);
      rail.position.set(side * 1.9, 0.3, -2.5);
      rail.rotation.x = -0.35;
      frame.add(rail);
    }

    frame.position.set(x, 0, z);
    this.worldGroup.add(frame);
  }

  private createBuildings(): void {
    // NYC-style city layout with distinct districts - EXPANDED MAP
    this.createMidtownDistrict();      // Glass towers and modern buildings
    this.createDowntownDistrict();     // Art Deco and prewar buildings
    this.createResidentialDistrict();  // Brownstones and apartments
    this.createIndustrialDistrict();   // Warehouses and factories
    this.createUptownDistrict();       // High-end residential and cultural
    this.createWaterfrontDistrict();   // Piers and waterfront buildings
  }

  private createMidtownDistrict(): void {
    this.currentDistrict = 'midtown';
    // Center area - tall glass skyscrapers like Midtown Manhattan - EXPANDED
    // Enhanced height variation for realistic NYC skyline
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        if (x === 0 && z === 0) continue;

        const baseX = x * 55;
        const baseZ = z * 55;

        // Distance from center affects height (natural skyline tapering)
        const distanceFromCenter = Math.sqrt(x * x + z * z);
        const heightMultiplier = 1.3 - (distanceFromCenter / 8) * 0.4;

        // Key positions get signature tall buildings
        const isMainAvenue = (Math.abs(x) <= 1);  // Central avenue
        const isCorner = (Math.abs(x) >= 3 && Math.abs(z) >= 3);

        let height: number;
        let style: NYCBuildingStyle;

        if (isMainAvenue && Math.abs(z) <= 2) {
          // Tallest buildings on main avenue near center (Times Square feel)
          height = 70 + Math.random() * 40;
          style = 'glass_tower';
        } else if (isCorner) {
          // Shorter buildings at corners
          height = 25 + Math.random() * 20;
          style = Math.random() > 0.5 ? 'modern' : 'artdeco';
        } else {
          // Standard height with variation
          height = (35 + Math.random() * 50) * heightMultiplier;
          style = Math.random() > 0.3 ? 'glass_tower' : 'modern';
        }

        // Main tower - varied width based on height
        const widthFactor = height > 60 ? 0.8 : 1.0;
        this.createNYCBuilding(
          new THREE.Vector3(baseX, 0, baseZ),
          (10 + Math.random() * 8) * widthFactor,
          height,
          (10 + Math.random() * 8) * widthFactor,
          style
        );

        // Smaller surrounding buildings for density
        if (Math.random() > 0.35) {
          const smallHeight = 18 + Math.random() * 25;
          this.createNYCBuilding(
            new THREE.Vector3(baseX + 16, 0, baseZ),
            7 + Math.random() * 4,
            smallHeight,
            7 + Math.random() * 4,
            smallHeight > 30 ? 'glass_tower' : 'modern'
          );
        }
      }
    }
  }

  private createDowntownDistrict(): void {
    this.currentDistrict = 'downtown';
    // South area - Art Deco buildings like Financial District
    for (let x = -4; x <= 4; x++) {
      for (let z = -8; z <= -5; z++) {
        const baseX = x * 55;
        const baseZ = z * 55;

        this.createNYCBuilding(
          new THREE.Vector3(baseX, 0, baseZ),
          15 + Math.random() * 10,
          30 + Math.random() * 50,
          15 + Math.random() * 10,
          Math.random() > 0.4 ? 'artdeco' : 'prewar'
        );
      }
    }
  }

  private createResidentialDistrict(): void {
    this.currentDistrict = 'residential';
    // West side - Brownstones and apartments like Brooklyn/Upper West Side
    for (let x = -5; x <= -3; x++) {
      for (let z = -6; z <= 6; z++) {
        const baseX = x * 45;
        const baseZ = z * 45;

        // Row of brownstones
        for (let i = 0; i < 3; i++) {
          this.createNYCBuilding(
            new THREE.Vector3(baseX + i * 8, 0, baseZ),
            6,
            12 + Math.random() * 8,
            10,
            'brownstone'
          );
        }

        // Occasional larger apartment building
        if (Math.random() > 0.6) {
          this.createNYCBuilding(
            new THREE.Vector3(baseX + 15, 0, baseZ + 15),
            14,
            25 + Math.random() * 15,
            14,
            'prewar'
          );
        }
      }
    }
  }

  private createIndustrialDistrict(): void {
    this.currentDistrict = 'industrial';
    // East side - Warehouses like DUMBO/Red Hook
    for (let x = 4; x <= 7; x++) {
      for (let z = -6; z <= 6; z++) {
        const baseX = x * 50;
        const baseZ = z * 50;

        this.createNYCBuilding(
          new THREE.Vector3(baseX, 0, baseZ),
          20 + Math.random() * 15,
          8 + Math.random() * 12,
          25 + Math.random() * 15,
          'warehouse'
        );
      }
    }
  }

  private createUptownDistrict(): void {
    this.currentDistrict = 'uptown';
    // North side - High-end residential like Upper East Side
    for (let z = 5; z <= 8; z++) {
      for (let x = -3; x <= 3; x++) {
        const baseX = x * 50;
        const baseZ = z * 50;

        // Mix of prewar luxury and modern condos
        const style = Math.random() > 0.4 ? 'prewar' : 'modern';
        this.createNYCBuilding(
          new THREE.Vector3(baseX, 0, baseZ),
          18 + Math.random() * 12,
          25 + Math.random() * 40,
          18 + Math.random() * 12,
          style
        );
      }
    }
  }

  private createWaterfrontDistrict(): void {
    this.currentDistrict = 'waterfront';
    // West side - Waterfront like Hudson Yards / West Side Highway
    for (let x = -6; x <= -4; x++) {
      for (let z = -3; z <= 5; z++) {
        const baseX = x * 50;
        const baseZ = z * 50;

        // Mix of warehouses converted to lofts and modern glass towers
        const style = Math.random() > 0.5 ? 'warehouse' : 'glass_tower';
        this.createNYCBuilding(
          new THREE.Vector3(baseX, 0, baseZ),
          22 + Math.random() * 15,
          15 + Math.random() * 35,
          22 + Math.random() * 15,
          style
        );
      }
    }
  }

  private createNYCBuilding(
    position: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    style: NYCBuildingStyle
  ): Building {
    const group = new THREE.Group();
    const palette = NYC_PALETTES[style];
    const baseColor = palette[Math.floor(Math.random() * palette.length)];

    switch (style) {
      case 'brownstone':
        this.createBrownstone(group, width, height, depth, baseColor);
        break;
      case 'artdeco':
        this.createArtDecoBuilding(group, width, height, depth, baseColor);
        break;
      case 'prewar':
        this.createPrewarBuilding(group, width, height, depth, baseColor);
        break;
      case 'modern':
        this.createModernBuilding(group, width, height, depth, baseColor);
        break;
      case 'glass_tower':
        this.createGlassTower(group, width, height, depth, baseColor);
        break;
      case 'warehouse':
        this.createWarehouse(group, width, height, depth, baseColor);
        break;
    }

    group.position.set(position.x, height / 2, position.z);
    this.worldGroup.add(group);

    const buildingId = `building_${this.objectIdCounter++}`;
    const body = this.game.physics.createBoxBody(
      buildingId,
      width,
      height,
      depth,
      0,
      new THREE.Vector3(position.x, height / 2, position.z),
      COLLISION_GROUPS.STATIC
    );

    const building: Building = {
      mesh: group,
      body,
      type: style === 'brownstone' || style === 'prewar' ? 'residential' : 'commercial',
      style
    };

    // Register building for CityDetailsManager to attach details
    this.buildingRegistry.set(buildingId, {
      id: buildingId,
      position: position.clone(),  // Ground position (y=0)
      actualY: height / 2,         // Mesh center Y
      width,
      height,
      depth,
      style,
      district: this.currentDistrict,
      mesh: group
    });

    this.buildings.push(building);
    return building;
  }

  // NYC Brownstone - Classic Brooklyn/Harlem style
  private createBrownstone(group: THREE.Group, width: number, height: number, depth: number, color: number): void {
    const mainMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.05
    });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mainMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Stoop (front steps) - weathered concrete
    const stoopMaterial = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.9 });
    const stoop = new THREE.Mesh(new THREE.BoxGeometry(width * 0.4, height * 0.15, 3), stoopMaterial);
    stoop.position.set(0, -height * 0.42, depth / 2 + 1.5);
    group.add(stoop);

    // Iron railing on stoop (NYC classic)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, metalness: 0.8, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 2.5), railMat);
      rail.position.set(side * (width * 0.18), -height * 0.35, depth / 2 + 1.5);
      group.add(rail);
    }

    // Cornice at top
    const corniceMaterial = new THREE.MeshStandardMaterial({ color: 0x554321, roughness: 0.7 });
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.5, depth + 0.2), corniceMaterial);
    cornice.position.y = height / 2 + 0.25;
    group.add(cornice);

    // Decorative trim below cornice
    const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.3, depth + 0.1), corniceMaterial);
    trim.position.y = height / 2 - 0.5;
    group.add(trim);

    // Windows with brownstone frames
    this.addBrownstoneWindows(group, width, height, depth);

    // Fire escape on side (very common in NYC)
    if (Math.random() > 0.2) {
      this.addFireEscape(group, width, height, depth);
    }

    // AC units in windows
    this.addWindowACUnits(group, width, height, depth);

    // Weathering stains
    this.addWeatheringStains(group, width, height, depth);
  }

  // Art Deco - Empire State / Chrysler style
  private createArtDecoBuilding(group: THREE.Group, width: number, height: number, depth: number, color: number): void {
    const mainMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.2
    });

    // Stepped design (setbacks)
    const sections = 3 + Math.floor(Math.random() * 2);
    let currentHeight = 0;
    let currentWidth = width;
    let currentDepth = depth;

    for (let i = 0; i < sections; i++) {
      const sectionHeight = height / sections * (i === sections - 1 ? 0.6 : 1.2);
      const section = new THREE.Mesh(
        new THREE.BoxGeometry(currentWidth, sectionHeight, currentDepth),
        mainMaterial
      );
      section.position.y = currentHeight + sectionHeight / 2 - height / 2;
      section.castShadow = true;
      section.receiveShadow = true;
      group.add(section);

      // Art Deco decorative bands
      if (i < sections - 1) {
        const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xD4AF37, metalness: 0.8, roughness: 0.3 });
        const band = new THREE.Mesh(new THREE.BoxGeometry(currentWidth + 0.2, 0.4, currentDepth + 0.2), bandMaterial);
        band.position.y = currentHeight + sectionHeight - height / 2;
        group.add(band);
      }

      currentHeight += sectionHeight;
      currentWidth *= 0.75;
      currentDepth *= 0.75;
    }

    // Spire on top
    const spireMaterial = new THREE.MeshStandardMaterial({ color: 0xC0C0C0, metalness: 0.9, roughness: 0.1 });
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1, 8, 8), spireMaterial);
    spire.position.y = height / 2 + 4;
    group.add(spire);

    // Vertical Art Deco lines
    this.addArtDecoDetails(group, width, height, depth);
  }

  // Pre-war apartment building
  private createPrewarBuilding(group: THREE.Group, width: number, height: number, depth: number, color: number): void {
    const mainMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.1
    });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mainMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Ornate cornice (darker, aged)
    const corniceMaterial = new THREE.MeshStandardMaterial({ color: 0x6B5335, roughness: 0.7 });
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 1.2, depth + 0.8), corniceMaterial);
    cornice.position.y = height / 2 + 0.6;
    group.add(cornice);

    // Base with rustication (weathered)
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x595959, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, height * 0.15, depth + 0.3), baseMaterial);
    base.position.y = -height * 0.42;
    group.add(base);

    // Regular windows
    this.addPrewarWindows(group, width, height, depth);

    // Fire escape (very common on prewar buildings)
    if (Math.random() > 0.25) {
      this.addFireEscape(group, width, height, depth);
    }

    // Water tank on roof (iconic NYC)
    if (height > 25 && Math.random() > 0.4) {
      this.addWaterTank(group, width, height, depth);
    }

    // AC units
    this.addWindowACUnits(group, width, height, depth);

    // Weathering stains
    this.addWeatheringStains(group, width, height, depth);

    // Storefront awning on ground floor
    if (Math.random() > 0.5) {
      this.addStorefrontAwning(group, width, height, depth);
    }
  }

  // Modern office building
  private createModernBuilding(group: THREE.Group, width: number, height: number, depth: number, color: number): void {
    const mainMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.5
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mainMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Horizontal bands (floor markers)
    const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4, metalness: 0.6 });
    const floors = Math.floor(height / 4);
    for (let i = 1; i < floors; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.15, depth + 0.1), bandMaterial);
      band.position.y = -height / 2 + i * 4;
      group.add(band);
    }

    // Modern glass curtain wall windows
    this.addModernWindows(group, width, height, depth);

    // Rooftop mechanicals
    this.addRooftopMechanicals(group, width, height, depth);

    // Neon signs on ground level for lofi vibe
    if (Math.random() > 0.5) {
      this.addNeonSign(group, width, height, depth);
    }
  }

  // Glass curtain wall tower
  private createGlassTower(group: THREE.Group, width: number, height: number, depth: number, color: number): void {
    const glassMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.05,
      metalness: 0.95,
      transparent: true,
      opacity: 0.7,
      envMapIntensity: 1.5
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), glassMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Steel frame structure visible through glass
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.3, metalness: 0.8 });

    // Vertical mullions
    for (let i = 0; i <= 4; i++) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, 0.1), frameMaterial);
      mullion.position.set(-width / 2 + i * width / 4, 0, depth / 2 + 0.05);
      group.add(mullion);

      const backMullion = mullion.clone();
      backMullion.position.z = -depth / 2 - 0.05;
      group.add(backMullion);
    }

    // Horizontal spandrels
    const floors = Math.floor(height / 4);
    for (let i = 0; i <= floors; i++) {
      const spandrel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.2, 0.1), frameMaterial);
      spandrel.position.set(0, -height / 2 + i * 4, depth / 2 + 0.05);
      group.add(spandrel);
    }

    // Reflective panels to simulate window reflections
    this.addGlassReflections(group, width, height, depth);
  }

  // Industrial warehouse
  private createWarehouse(group: THREE.Group, width: number, height: number, depth: number, color: number): void {
    const brickMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0.02
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), brickMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Large industrial windows (some broken/boarded)
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x1A2A3A,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.5
    });

    const boardedMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A3A2A,
      roughness: 0.9
    });

    // Big industrial windows
    const windowRows = Math.floor(height / 5);
    const windowCols = Math.floor(width / 6);

    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        // Some windows are boarded up
        const isBoarded = Math.random() > 0.75;
        const mat = isBoarded ? boardedMaterial : windowMaterial;
        const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.1), mat);
        windowMesh.position.set(
          -width / 2 + 3 + col * 6,
          -height / 2 + 2.5 + row * 5,
          depth / 2 + 0.05
        );
        group.add(windowMesh);
      }
    }

    // Smokestack (rusted)
    if (Math.random() > 0.4) {
      const stackMaterial = new THREE.MeshStandardMaterial({ color: 0x5A4A3A, roughness: 0.8 });
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 15, 12), stackMaterial);
      stack.position.set(width * 0.3, height / 2 + 7.5, 0);
      group.add(stack);

      // Rust stains on smokestack
      const rustMat = new THREE.MeshBasicMaterial({ color: NYC_GRIME.rust, transparent: true, opacity: 0.4 });
      const rust = new THREE.Mesh(new THREE.PlaneGeometry(2, 8), rustMat);
      rust.position.set(width * 0.3 + 1.05, height / 2 + 4, 0);
      rust.rotation.y = Math.PI / 2;
      group.add(rust);
    }

    // Loading dock (weathered concrete)
    const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.9 });
    const dock = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 1.5, 3), dockMaterial);
    dock.position.set(0, -height / 2 + 0.75, depth / 2 + 1.5);
    group.add(dock);

    // Roll-up doors on loading dock
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3A3A3A, metalness: 0.5, roughness: 0.6 });
    const numDoors = Math.floor(width / 8);
    for (let i = 0; i < numDoors; i++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), doorMat);
      door.position.set(-width / 4 + i * 8, -height / 2 + 3.5, depth / 2 + 0.05);
      group.add(door);
    }

    // Graffiti (very common on warehouses)
    this.addGraffiti(group, width, height, depth);

    // Weathering stains
    this.addWeatheringStains(group, width, height, depth);

    // Dumpster near loading dock
    if (Math.random() > 0.5) {
      const dumpsterMat = new THREE.MeshStandardMaterial({ color: 0x2A5A2A, roughness: 0.7 });
      const dumpster = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 2), dumpsterMat);
      dumpster.position.set(width / 2 - 2, -height / 2 + 0.75, depth / 2 + 3);
      group.add(dumpster);
    }

    // Neon signs for lofi vibe
    if (Math.random() > 0.4) {
      this.addNeonSign(group, width, height, depth);
    }
  }

  // Lofi neon signs for city atmosphere
  private addNeonSign(group: THREE.Group, width: number, height: number, depth: number): void {
    // Neon color palette - lofi vibes
    const neonColors = [
      { color: 0xff6b9d, emissive: 0xff3366 }, // Pink
      { color: 0x00ffff, emissive: 0x00cccc }, // Cyan
      { color: 0xff9500, emissive: 0xff6600 }, // Orange
      { color: 0xb366ff, emissive: 0x9933ff }, // Purple
      { color: 0x66ff66, emissive: 0x33cc33 }, // Green
      { color: 0xffff66, emissive: 0xcccc00 }, // Yellow
    ];

    const palette = neonColors[Math.floor(Math.random() * neonColors.length)];

    // Main neon bar (horizontal sign)
    const signWidth = Math.min(width * 0.6, 8);
    const signMaterial = new THREE.MeshStandardMaterial({
      color: palette.color,
      emissive: palette.emissive,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.3
    });

    // Horizontal neon bar
    const signGeom = new THREE.BoxGeometry(signWidth, 0.3, 0.1);
    const sign = new THREE.Mesh(signGeom, signMaterial);
    sign.position.set(0, height * 0.3, depth / 2 + 0.15);
    group.add(sign);

    // Add a second bar below for "OPEN" style look
    if (Math.random() > 0.5) {
      const sign2 = new THREE.Mesh(new THREE.BoxGeometry(signWidth * 0.5, 0.25, 0.1), signMaterial);
      sign2.position.set(0, height * 0.3 - 0.6, depth / 2 + 0.15);
      group.add(sign2);
    }

    // Vertical accent bars on sides
    if (Math.random() > 0.6) {
      const palette2 = neonColors[Math.floor(Math.random() * neonColors.length)];
      const accentMaterial = new THREE.MeshStandardMaterial({
        color: palette2.color,
        emissive: palette2.emissive,
        emissiveIntensity: 1.2,
        roughness: 0.2
      });

      const accentGeom = new THREE.BoxGeometry(0.15, 2, 0.08);
      [-1, 1].forEach(side => {
        const accent = new THREE.Mesh(accentGeom, accentMaterial);
        accent.position.set(side * (signWidth / 2 + 0.3), height * 0.3 - 0.5, depth / 2 + 0.15);
        group.add(accent);
      });
    }

    // Backing plate (dark)
    const backingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const backing = new THREE.Mesh(new THREE.BoxGeometry(signWidth + 1, 1.5, 0.05), backingMat);
    backing.position.set(0, height * 0.3 - 0.3, depth / 2 + 0.05);
    group.add(backing);
  }

  // Window creation methods for different styles
  private addBrownstoneWindows(group: THREE.Group, width: number, height: number, depth: number): void {
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.5
    });
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2F1810, roughness: 0.8 });

    const floors = Math.floor(height / 3.5);
    for (let floor = 0; floor < floors; floor++) {
      for (let i = 0; i < 3; i++) {
        // Window frame
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.15), frameMaterial);
        frame.position.set(-width / 3 + i * width / 3, -height / 2 + 2 + floor * 3.5, depth / 2 + 0.08);
        group.add(frame);

        // Window glass
        const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), windowMaterial);
        glass.position.set(-width / 3 + i * width / 3, -height / 2 + 2 + floor * 3.5, depth / 2 + 0.12);

        // Some windows lit
        if (Math.random() > 0.6) {
          (glass.material as THREE.MeshStandardMaterial).emissive.setHex(0xFFE4B5);
          (glass.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
        }
        group.add(glass);
      }
    }
  }

  private addPrewarWindows(group: THREE.Group, width: number, height: number, depth: number): void {
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x4682B4,
      roughness: 0.15,
      metalness: 0.4,
      transparent: true,
      opacity: 0.6
    });

    const floors = Math.floor(height / 4);
    const windowsPerFloor = Math.floor(width / 3);

    for (let floor = 0; floor < floors; floor++) {
      for (let i = 0; i < windowsPerFloor; i++) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.1), windowMaterial.clone());
        window.position.set(
          -width / 2 + 1.5 + i * 3,
          -height / 2 + 2.5 + floor * 4,
          depth / 2 + 0.05
        );

        if (Math.random() > 0.5) {
          (window.material as THREE.MeshStandardMaterial).emissive.setHex(0xFFF8DC);
          (window.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
        }
        group.add(window);
      }
    }
  }

  private addModernWindows(group: THREE.Group, width: number, height: number, depth: number): void {
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x2F4F4F,
      roughness: 0.1,
      metalness: 0.7,
      transparent: true,
      opacity: 0.7
    });

    // Continuous window bands
    const floors = Math.floor(height / 4);
    for (let floor = 0; floor < floors; floor++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(width - 0.5, 2.8, 0.1), windowMaterial.clone());
      band.position.set(0, -height / 2 + 2 + floor * 4, depth / 2 + 0.05);

      // Random lit sections
      if (Math.random() > 0.4) {
        (band.material as THREE.MeshStandardMaterial).emissive.setHex(0xFFFACD);
        (band.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
      }
      group.add(band);
    }
  }

  private addArtDecoDetails(group: THREE.Group, width: number, height: number, depth: number): void {
    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0xD4AF37, metalness: 0.7, roughness: 0.3 });

    // Vertical pilasters
    for (let i = 0; i < 3; i++) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.3, height * 0.7, 0.3), detailMaterial);
      pilaster.position.set(-width / 3 + i * width / 3, -height * 0.1, depth / 2 + 0.15);
      group.add(pilaster);
    }

    // Sunburst motif at entrance
    const sunburst = new THREE.Mesh(new THREE.CircleGeometry(2, 16), detailMaterial);
    sunburst.position.set(0, -height / 2 + 4, depth / 2 + 0.1);
    group.add(sunburst);
  }

  private addGlassReflections(group: THREE.Group, width: number, height: number, depth: number): void {
    // Random lit office floors
    const reflectionMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFACD,
      emissive: 0xFFFACD,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.3
    });

    const floors = Math.floor(height / 4);
    for (let floor = 0; floor < floors; floor++) {
      if (Math.random() > 0.5) {
        const lit = new THREE.Mesh(new THREE.BoxGeometry(width - 1, 3.5, 0.05), reflectionMaterial);
        lit.position.set(0, -height / 2 + 2 + floor * 4, depth / 2 + 0.2);
        group.add(lit);
      }
    }
  }

  private addFireEscape(group: THREE.Group, width: number, height: number, _depth: number): void {
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.6, metalness: 0.8 });

    const floors = Math.floor(height / 4);
    const escapeX = width / 2 + 0.5;

    for (let floor = 1; floor < floors; floor++) {
      // Platform
      const platform = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.5), metalMaterial);
      platform.position.set(escapeX, -height / 2 + floor * 4, 0);
      group.add(platform);

      // Railing
      const railing = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.05), metalMaterial);
      railing.position.set(escapeX, -height / 2 + floor * 4 + 0.5, 0.7);
      group.add(railing);

      // Ladder between floors
      if (floor < floors - 1) {
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.5, 0.1), metalMaterial);
        ladder.position.set(escapeX + 0.5, -height / 2 + floor * 4 + 2, 0);
        group.add(ladder);
      }
    }
  }

  private addWaterTank(group: THREE.Group, width: number, height: number, _depth: number): void {
    const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x2F1810, roughness: 0.9, metalness: 0.1 });

    // Tank body (wooden barrel style)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 4, 12), tankMaterial);
    tank.position.set(width * 0.2, height / 2 + 2, 0);
    group.add(tank);

    // Conical roof
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x3A3A3A, roughness: 0.7 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.5, 12), roofMaterial);
    roof.position.set(width * 0.2, height / 2 + 4.75, 0);
    group.add(roof);

    // Support legs
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, metalness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), legMaterial);
      leg.position.set(
        width * 0.2 + Math.cos(angle) * 1.5,
        height / 2 - 0.5,
        Math.sin(angle) * 1.5
      );
      group.add(leg);
    }
  }

  private addRooftopMechanicals(group: THREE.Group, width: number, height: number, depth: number): void {
    const mechMaterial = new THREE.MeshStandardMaterial({ color: 0x5A5A5A, roughness: 0.6, metalness: 0.4 });

    // HVAC units
    for (let i = 0; i < 3; i++) {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), mechMaterial);
      hvac.position.set(-width / 3 + i * width / 3, height / 2 + 0.75, 0);
      group.add(hvac);
    }

    // Elevator penthouse
    const penthouse = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), mechMaterial);
    penthouse.position.set(0, height / 2 + 1.5, -depth / 4);
    group.add(penthouse);

    // Satellite dishes and antennas
    if (Math.random() > 0.5) {
      const dishMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 });
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), dishMat);
      dish.rotation.x = -Math.PI / 4;
      dish.position.set(width * 0.3, height / 2 + 1, depth * 0.2);
      group.add(dish);
    }

    // Antenna poles
    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.6) {
        const antennaMat = new THREE.MeshStandardMaterial({ color: 0x4A4A4A, metalness: 0.8 });
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 6), antennaMat);
        antenna.position.set(
          (Math.random() - 0.5) * width * 0.6,
          height / 2 + 2,
          (Math.random() - 0.5) * depth * 0.6
        );
        group.add(antenna);
      }
    }
  }

  // NYC Window AC units - iconic summer sight
  private addWindowACUnits(group: THREE.Group, width: number, height: number, depth: number): void {
    const acMaterial = new THREE.MeshStandardMaterial({ color: 0x8A8A8A, roughness: 0.5, metalness: 0.3 });
    const grillMaterial = new THREE.MeshStandardMaterial({ color: 0x3A3A3A, roughness: 0.8 });

    const floors = Math.floor(height / 4);
    const windowsPerFloor = Math.floor(width / 3);

    for (let floor = 0; floor < floors; floor++) {
      for (let i = 0; i < windowsPerFloor; i++) {
        // Random chance for AC unit (more common on lower floors)
        if (Math.random() > 0.6 + floor * 0.05) {
          const acBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), acMaterial);
          acBox.position.set(
            -width / 2 + 1.5 + i * 3,
            -height / 2 + 1.5 + floor * 4,
            depth / 2 + 0.3
          );
          group.add(acBox);

          // Grill on front
          const grill = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.05), grillMaterial);
          grill.position.set(
            -width / 2 + 1.5 + i * 3,
            -height / 2 + 1.5 + floor * 4,
            depth / 2 + 0.58
          );
          group.add(grill);
        }
      }
    }
  }

  // Graffiti tags on warehouse/industrial buildings
  private addGraffiti(group: THREE.Group, width: number, height: number, depth: number): void {
    const graffitiColors = NYC_GRIME.graffiti;

    // Add 2-4 graffiti tags
    const numTags = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numTags; i++) {
      const color = graffitiColors[Math.floor(Math.random() * graffitiColors.length)];
      const tagMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8
      });

      // Random tag shape (abstract blob)
      const tagWidth = 1 + Math.random() * 2;
      const tagHeight = 0.5 + Math.random() * 1.5;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(tagWidth, tagHeight), tagMaterial);

      // Position on building face (lower area typically)
      const yPos = -height / 2 + 1 + Math.random() * (height * 0.4);
      const xPos = (Math.random() - 0.5) * (width - tagWidth);

      tag.position.set(xPos, yPos, depth / 2 + 0.02);
      group.add(tag);
    }
  }

  // Water stains and weathering marks
  private addWeatheringStains(group: THREE.Group, width: number, height: number, depth: number): void {
    const stainMaterial = new THREE.MeshBasicMaterial({
      color: NYC_GRIME.waterStain,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });

    // Vertical water stains running down from roof/windows
    const numStains = Math.floor(Math.random() * 4) + 1;

    for (let i = 0; i < numStains; i++) {
      const stainHeight = 3 + Math.random() * 8;
      const stainWidth = 0.3 + Math.random() * 0.5;
      const stain = new THREE.Mesh(new THREE.PlaneGeometry(stainWidth, stainHeight), stainMaterial);

      stain.position.set(
        (Math.random() - 0.5) * (width - 1),
        height / 2 - stainHeight / 2 - Math.random() * 2,
        depth / 2 + 0.015
      );
      group.add(stain);
    }

    // Soot stains near bottom
    const sootMaterial = new THREE.MeshBasicMaterial({
      color: NYC_GRIME.soot,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });
    const soot = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, 1.5), sootMaterial);
    soot.position.set(0, -height / 2 + 0.75, depth / 2 + 0.01);
    group.add(soot);
  }

  // Awnings over storefronts
  private addStorefrontAwning(group: THREE.Group, width: number, height: number, depth: number): void {
    const awningColors = [0xAA0000, 0x006600, 0x000066, 0x8B4513, 0x2F4F4F];
    const color = awningColors[Math.floor(Math.random() * awningColors.length)];

    const awningMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      side: THREE.DoubleSide
    });

    // Sloped awning geometry
    const awningGeom = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // Triangle 1
      -width/2 + 1, -height/2 + 3.5, depth/2,
      width/2 - 1, -height/2 + 3.5, depth/2,
      -width/2 + 1, -height/2 + 2.5, depth/2 + 1.5,
      // Triangle 2
      width/2 - 1, -height/2 + 3.5, depth/2,
      width/2 - 1, -height/2 + 2.5, depth/2 + 1.5,
      -width/2 + 1, -height/2 + 2.5, depth/2 + 1.5
    ]);
    awningGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    awningGeom.computeVertexNormals();

    const awning = new THREE.Mesh(awningGeom, awningMaterial);
    group.add(awning);
  }

  private createStreetLights(): void {
    const gridSize = 50;

    // HEAVILY reduced - only 4 lights near player spawn to avoid WebGL uniform limits
    const lightPositions = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: -1 }
    ];

    lightPositions.forEach(({ x, z }) => {
      const pos = new THREE.Vector3(x * gridSize + 6, 0, z * gridSize + 6);
      this.createStreetLight(pos);
    });
  }

  private createStreetLight(position: THREE.Vector3): StreetLight {
    const group = new THREE.Group();

    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.15, 6, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.8
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 3;
    pole.castShadow = true;
    group.add(pole);

    const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
    const arm = new THREE.Mesh(armGeometry, poleMaterial);
    arm.position.set(0.75, 5.8, 0);
    arm.rotation.z = Math.PI / 2;
    group.add(arm);

    const lampGeometry = new THREE.SphereGeometry(0.25, 8, 8);
    const lampMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffaa
    });
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
    lamp.position.set(1.3, 5.6, 0);
    group.add(lamp);

    const light = new THREE.PointLight(0xffffaa, 0.8, 20);
    light.position.set(1.3, 5.5, 0);
    light.castShadow = false;
    group.add(light);

    group.position.copy(position);
    this.worldGroup.add(group);

    const streetLight: StreetLight = {
      mesh: group,
      light,
      position
    };

    this.streetLights.push(streetLight);
    return streetLight;
  }

  private createPickups(): void {
    const pickupLocations: Array<{ type: PickupType; position: THREE.Vector3; value: number; weaponId?: string }> = [];

    // === GANG TERRITORY (Southeast) - Street weapons ===
    // Gang hideout weapon stash
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(75, 1, 75), value: 0, weaponId: 'pistol' },
      { type: 'weapon', position: new THREE.Vector3(78, 1, 73), value: 0, weaponId: 'uzi' },
      { type: 'ammo', position: new THREE.Vector3(76, 1, 77), value: 60 },
      { type: 'health', position: new THREE.Vector3(80, 1, 75), value: 25 }
    );
    // Alley behind buildings
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(55, 1, 85), value: 0, weaponId: 'knife' },
      { type: 'weapon', position: new THREE.Vector3(65, 1, 95), value: 0, weaponId: 'bat' }
    );

    // === INDUSTRIAL ZONE (Northwest) - Heavy weapons ===
    // Warehouse weapon cache
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(-100, 1, -100), value: 0, weaponId: 'shotgun' },
      { type: 'weapon', position: new THREE.Vector3(-105, 1, -98), value: 0, weaponId: 'ak47' },
      { type: 'weapon', position: new THREE.Vector3(-102, 1, -103), value: 0, weaponId: 'm4' },
      { type: 'ammo', position: new THREE.Vector3(-100, 1, -105), value: 100 },
      { type: 'armor', position: new THREE.Vector3(-108, 1, -100), value: 100 }
    );
    // Loading dock
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(-130, 1, -80), value: 0, weaponId: 'rpg' },
      { type: 'ammo', position: new THREE.Vector3(-128, 1, -82), value: 50 }
    );

    // === DOWNTOWN (Center) - Mixed pickups ===
    // Behind police station
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(15, 1, 45), value: 0, weaponId: 'pistol' },
      { type: 'armor', position: new THREE.Vector3(18, 1, 48), value: 50 }
    );
    // Rooftop access (ground level for now)
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(-25, 1, 25), value: 0, weaponId: 'sniper' },
      { type: 'ammo', position: new THREE.Vector3(-23, 1, 27), value: 30 }
    );
    // Park area
    pickupLocations.push(
      { type: 'health', position: new THREE.Vector3(0, 1, 30), value: 50 },
      { type: 'money', position: new THREE.Vector3(5, 1, 35), value: 100 }
    );

    // === RESIDENTIAL AREA (Southwest) - Light weapons ===
    // Backyard stash
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(-80, 1, 60), value: 0, weaponId: 'deagle' },
      { type: 'ammo', position: new THREE.Vector3(-78, 1, 62), value: 40 }
    );
    // Garage
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(-60, 1, 40), value: 0, weaponId: 'shotgun' },
      { type: 'health', position: new THREE.Vector3(-58, 1, 42), value: 25 }
    );

    // === CONSTRUCTION SITE (Northeast) - Random weapons ===
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(120, 1, -60), value: 0, weaponId: 'ak47' },
      { type: 'weapon', position: new THREE.Vector3(125, 1, -55), value: 0, weaponId: 'grenade' },
      { type: 'weapon', position: new THREE.Vector3(130, 1, -65), value: 0, weaponId: 'uzi' },
      { type: 'ammo', position: new THREE.Vector3(127, 1, -60), value: 80 },
      { type: 'armor', position: new THREE.Vector3(122, 1, -58), value: 50 }
    );

    // === DOCKS AREA (Far East) - Military grade ===
    pickupLocations.push(
      { type: 'weapon', position: new THREE.Vector3(180, 1, 20), value: 0, weaponId: 'm4' },
      { type: 'weapon', position: new THREE.Vector3(185, 1, 25), value: 0, weaponId: 'sniper' },
      { type: 'weapon', position: new THREE.Vector3(175, 1, 15), value: 0, weaponId: 'rpg' },
      { type: 'ammo', position: new THREE.Vector3(180, 1, 25), value: 100 },
      { type: 'armor', position: new THREE.Vector3(178, 1, 18), value: 100 },
      { type: 'health', position: new THREE.Vector3(182, 1, 22), value: 50 }
    );

    // === SCATTERED MONEY around the map ===
    pickupLocations.push(
      { type: 'money', position: new THREE.Vector3(-40, 1, -60), value: 150 },
      { type: 'money', position: new THREE.Vector3(60, 1, -40), value: 200 },
      { type: 'money', position: new THREE.Vector3(-100, 1, 50), value: 300 },
      { type: 'money', position: new THREE.Vector3(140, 1, 80), value: 500 },
      { type: 'money', position: new THREE.Vector3(-150, 1, -120), value: 1000 }
    );

    // === HEALTH around the map ===
    pickupLocations.push(
      { type: 'health', position: new THREE.Vector3(40, 1, -80), value: 25 },
      { type: 'health', position: new THREE.Vector3(-70, 1, -30), value: 25 },
      { type: 'health', position: new THREE.Vector3(100, 1, 50), value: 50 }
    );

    pickupLocations.forEach(pickup => {
      this.createPickup(pickup.type, pickup.position, pickup.value, pickup.weaponId);
    });
  }

  private createPickup(type: PickupType, position: THREE.Vector3, value: number, weaponId?: string): Pickup {
    const colors: Record<PickupType, number> = {
      health: 0xff0000,
      armor: 0x0000ff,
      money: 0x00ff00,
      weapon: 0xffff00,
      ammo: 0xff8800,
      special: 0xff00ff
    };

    const group = new THREE.Group();
    group.position.copy(position);

    // Base pickup shape
    const geometry = new THREE.OctahedronGeometry(0.5);
    const material = new THREE.MeshStandardMaterial({
      color: colors[type],
      emissive: colors[type],
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.8
    });

    const baseMesh = new THREE.Mesh(geometry, material);
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Add weapon-specific visual for weapon pickups
    if (type === 'weapon' && weaponId) {
      const weaponMesh = this.createWeaponPickupMesh(weaponId);
      if (weaponMesh) {
        weaponMesh.position.y = 0.8;
        weaponMesh.scale.setScalar(1.5);
        group.add(weaponMesh);
      }
    }

    this.worldGroup.add(group);

    const id = `pickup_${this.pickupIdCounter++}`;
    const pickup: Pickup = {
      id,
      type,
      value,
      mesh: group as unknown as THREE.Mesh,
      position,
      respawnTime: 60,
      collected: false,
      weaponId
    };

    this.pickups.set(id, pickup);
    return pickup;
  }

  private createWeaponPickupMesh(weaponId: string): THREE.Group | null {
    const group = new THREE.Group();
    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.4,
      metalness: 0.9
    });
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.8,
      metalness: 0.1
    });

    switch (weaponId) {
      case 'pistol':
      case 'deagle':
        const pistolBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.15), gunMetal);
        group.add(pistolBody);
        break;
      case 'uzi':
        const uziBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.2), gunMetal);
        const uziMag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.03), gunMetal);
        uziMag.position.set(0, -0.08, 0);
        group.add(uziBody);
        group.add(uziMag);
        break;
      case 'shotgun':
        const shotgunBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.4), gunMetal);
        const shotgunStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.15), woodMaterial);
        shotgunStock.position.z = -0.25;
        group.add(shotgunBody);
        group.add(shotgunStock);
        break;
      case 'ak47':
      case 'm4':
        const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.35), gunMetal);
        const rifleMag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), gunMetal);
        rifleMag.position.set(0, -0.08, 0.05);
        const rifleStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.15), woodMaterial);
        rifleStock.position.z = -0.22;
        group.add(rifleBody);
        group.add(rifleMag);
        group.add(rifleStock);
        break;
      case 'sniper':
        const sniperBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.5), gunMetal);
        const sniperScope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), gunMetal);
        sniperScope.rotation.x = Math.PI / 2;
        sniperScope.position.set(0, 0.06, 0.1);
        group.add(sniperBody);
        group.add(sniperScope);
        break;
      case 'knife':
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.02, 0.15),
          new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 })
        );
        blade.position.z = 0.08;
        const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.08), woodMaterial);
        group.add(blade);
        group.add(knifeHandle);
        break;
      case 'bat':
        const batBody = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 8), woodMaterial);
        batBody.rotation.x = Math.PI / 2;
        group.add(batBody);
        break;
      case 'rpg':
        const rpgTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12),
          new THREE.MeshStandardMaterial({ color: 0x4a5c3a, roughness: 0.7 })
        );
        rpgTube.rotation.x = Math.PI / 2;
        group.add(rpgTube);
        break;
      case 'grenade':
        const grenadeBody = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.7 })
        );
        grenadeBody.scale.y = 1.3;
        group.add(grenadeBody);
        break;
      default:
        return null;
    }

    return group;
  }

  private createDestructibles(): void {
    const destructiblePositions = [
      new THREE.Vector3(15, 0.5, 15),
      new THREE.Vector3(-25, 0.5, 35),
      new THREE.Vector3(45, 0.5, -15),
      new THREE.Vector3(-55, 0.5, -25)
    ];

    destructiblePositions.forEach((pos, index) => {
      this.createDestructible(`barrel_${index}`, pos);
    });
  }

  private createDestructible(id: string, position: THREE.Vector3): WorldObject {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      roughness: 0.7
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;

    const body = this.game.physics.createCylinderBody(
      id,
      0.5,
      0.5,
      1,
      50,
      position,
      COLLISION_GROUPS.DYNAMIC
    );

    this.game.physics.linkMeshToBody(mesh, body);
    this.worldGroup.add(mesh);

    const worldObject: WorldObject = {
      id,
      type: 'prop',
      mesh,
      body,
      destructible: true,
      health: 50,
      interactable: false
    };

    this.objects.set(id, worldObject);
    return worldObject;
  }

  update(deltaTime: number): void {
    this.updatePickups(deltaTime);
    this.updateStreetLights();
    this.syncPhysicsObjects();
    this.animatePickups(deltaTime);
  }

  private updatePickups(deltaTime: number): void {
    const playerPos = this.game.player.position;

    this.pickups.forEach((pickup) => {
      if (pickup.collected) {
        pickup.respawnTime -= deltaTime;
        if (pickup.respawnTime <= 0) {
          pickup.collected = false;
          pickup.mesh.visible = true;
        }
        return;
      }

      const distance = playerPos.distanceTo(pickup.position);
      if (distance < 1.5) {
        this.collectPickup(pickup);
      }
    });
  }

  private collectPickup(pickup: Pickup): void {
    pickup.collected = true;
    pickup.mesh.visible = false;
    pickup.respawnTime = 60;

    switch (pickup.type) {
      case 'health':
        this.game.player.heal(pickup.value);
        break;
      case 'armor':
        this.game.player.addArmor(pickup.value);
        break;
      case 'money':
        this.game.player.addMoney(pickup.value);
        break;
      case 'weapon':
        // Add the specific weapon from the pickup
        const weaponId = pickup.weaponId || 'pistol';
        this.game.weapons.addWeapon(weaponId, 50);
        break;
      case 'ammo':
        // Add ammo to all weapons the player has
        this.game.inventory.addAmmoByType('pistol', pickup.value);
        this.game.inventory.addAmmoByType('smg', pickup.value);
        this.game.inventory.addAmmoByType('rifle', pickup.value);
        break;
    }

    this.game.audio.playSound('pickup');
    globalEvents.emit('pickup_collected', { type: pickup.type, value: pickup.value });
  }

  private updateStreetLights(): void {
    const timeOfDay = this.game.weather.getTimeOfDay();
    const isSunset = timeOfDay >= 17 && timeOfDay < 20;
    const isNight = timeOfDay < 6 || timeOfDay > 19;
    const lightsOn = isNight || isSunset; // Turn on during sunset for lofi vibe

    this.streetLights.forEach(streetLight => {
      // Warmer amber glow for lofi aesthetic
      streetLight.light.intensity = lightsOn ? 1.0 : 0;
      streetLight.light.color.setHex(isSunset ? 0xffaa66 : 0xffcc88); // Warmer during sunset
      const lamp = streetLight.mesh.children.find(c => c instanceof THREE.Mesh && (c.material as THREE.MeshBasicMaterial).color) as THREE.Mesh;
      if (lamp) {
        (lamp.material as THREE.MeshBasicMaterial).color.setHex(lightsOn ? 0xffcc88 : 0x888888);
      }
    });
  }

  private syncPhysicsObjects(): void {
    this.objects.forEach(obj => {
      if (obj.body) {
        this.game.physics.syncMeshToBody(obj.mesh);
      }
    });
  }

  private animatePickups(_deltaTime: number): void {
    const time = this.game.getElapsedTime();

    this.pickups.forEach(pickup => {
      if (!pickup.collected) {
        pickup.mesh.rotation.y = time * 2;
        pickup.mesh.position.y = pickup.position.y + Math.sin(time * 3) * 0.2;
      }
    });
  }

  createBulletHole(position: THREE.Vector3, normal: THREE.Vector3): void {
    const geometry = new THREE.CircleGeometry(0.05, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x111111,
      side: THREE.DoubleSide
    });

    const hole = new THREE.Mesh(geometry, material);
    hole.position.copy(position);
    hole.position.add(normal.clone().multiplyScalar(0.01));
    hole.lookAt(position.clone().add(normal));

    this.worldGroup.add(hole);

    setTimeout(() => {
      this.game.scene.remove(hole);
      geometry.dispose();
      material.dispose();
    }, 30000);
  }

  damageObject(objectId: string, damage: number): void {
    const object = this.objects.get(objectId);
    if (!object || !object.destructible || object.health === undefined) return;

    object.health -= damage;

    if (object.health <= 0) {
      this.destroyObject(objectId);
    }
  }

  private destroyObject(objectId: string): void {
    const object = this.objects.get(objectId);
    if (!object) return;

    for (let i = 0; i < 8; i++) {
      const debrisGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const mesh = object.mesh as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const debrisMaterial = new THREE.MeshStandardMaterial({
        color: material && material.color ? material.color : 0x888888
      });
      const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
      debris.position.copy(object.mesh.position);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
      );

      this.worldGroup.add(debris);

      const animate = () => {
        debris.position.add(velocity.clone().multiplyScalar(0.016));
        velocity.y -= 0.1;
        debris.rotation.x += 0.1;
        debris.rotation.z += 0.1;

        if (debris.position.y > 0) {
          requestAnimationFrame(animate);
        } else {
          this.game.scene.remove(debris);
          debrisGeometry.dispose();
          debrisMaterial.dispose();
        }
      };
      animate();
    }

    this.game.scene.remove(object.mesh);
    if (object.body) {
      this.game.physics.removeBody(objectId);
    }
    this.objects.delete(objectId);
  }

  getNearestHospital(position: THREE.Vector3): THREE.Vector3 {
    let nearest = this.hospitalLocations[0];
    let nearestDistance = position.distanceTo(nearest);

    this.hospitalLocations.forEach(hospital => {
      const distance = position.distanceTo(hospital);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = hospital;
      }
    });

    return nearest;
  }

  getUnlockedAreas(): string[] {
    return [...this.unlockedAreas];
  }

  // Get building registry for CityDetailsManager to attach details to actual buildings
  getBuildingRegistry(): Map<string, BuildingMetadata> {
    return this.buildingRegistry;
  }

  unlockArea(areaId: string): void {
    if (!this.unlockedAreas.includes(areaId)) {
      this.unlockedAreas.push(areaId);
    }
  }

  /**
   * Get all static objects for rendering optimization
   * These objects don't move and can have matrixAutoUpdate disabled
   */
  getStaticObjects(): THREE.Object3D[] {
    const statics: THREE.Object3D[] = [];

    // Buildings are static
    this.buildings.forEach(b => statics.push(b.mesh));

    // Roads are static
    statics.push(...this.roads);

    // Ground is static
    if (this.ground) statics.push(this.ground);

    // Instanced meshes are static
    if (this.hydrantInstances) statics.push(this.hydrantInstances);
    if (this.crosswalkStripeInstances) statics.push(this.crosswalkStripeInstances);
    if (this.trafficLightInstances) statics.push(this.trafficLightInstances);

    return statics;
  }

  /**
   * Mark all static world objects to disable unnecessary matrix updates
   * Call this after initialization to improve render performance
   */
  optimizeStaticObjects(): void {
    const statics = this.getStaticObjects();
    let count = 0;

    statics.forEach(obj => {
      obj.traverse(child => {
        child.userData.isStatic = true;
        child.matrixAutoUpdate = false;
        child.updateMatrix();
        child.updateMatrixWorld(true);
        count++;
      });
    });

    console.log(`✅ Marked ${count} world objects as static`);
  }

  dispose(): void {
    this.objects.forEach((_, id) => {
      const obj = this.objects.get(id);
      if (obj) {
        this.game.scene.remove(obj.mesh);
        if (obj.body) {
          this.game.physics.removeBody(id);
        }
      }
    });
    this.objects.clear();

    this.pickups.forEach(pickup => {
      this.game.scene.remove(pickup.mesh);
    });
    this.pickups.clear();

    this.buildings.forEach(building => {
      this.game.scene.remove(building.mesh);
    });
    this.buildings = [];

    this.streetLights.forEach(light => {
      this.game.scene.remove(light.mesh);
    });
    this.streetLights = [];

    // Dispose instanced meshes
    if (this.hydrantInstances) {
      this.game.scene.remove(this.hydrantInstances);
      this.hydrantInstances.geometry.dispose();
      (this.hydrantInstances.material as THREE.Material).dispose();
      this.hydrantInstances = null;
    }
    if (this.crosswalkStripeInstances) {
      this.game.scene.remove(this.crosswalkStripeInstances);
      this.crosswalkStripeInstances.geometry.dispose();
      (this.crosswalkStripeInstances.material as THREE.Material).dispose();
      this.crosswalkStripeInstances = null;
    }
    if (this.trafficLightInstances) {
      this.game.scene.remove(this.trafficLightInstances);
      this.trafficLightInstances.geometry.dispose();
      (this.trafficLightInstances.material as THREE.Material).dispose();
      this.trafficLightInstances = null;
    }

    if (this.ground) {
      this.game.scene.remove(this.ground);
    }

    this.roads.forEach(road => {
      this.game.scene.remove(road);
    });
    this.roads = [];
  }
}
