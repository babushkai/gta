import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WorldObject, Pickup, PickupType } from '@/types';
import { Game } from '@/core/Game';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';
import { globalEvents } from '@/core/EventEmitter';

interface Building {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  type: 'residential' | 'commercial' | 'industrial';
}

interface StreetLight {
  mesh: THREE.Group;
  light: THREE.PointLight;
  position: THREE.Vector3;
}

export class World {
  private game: Game;
  private objects: Map<string, WorldObject> = new Map();
  private pickups: Map<string, Pickup> = new Map();
  private buildings: Building[] = [];
  private streetLights: StreetLight[] = [];

  private ground: THREE.Mesh | null = null;
  private roads: THREE.Mesh[] = [];

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
  }

  async initialize(): Promise<void> {
    this.createGround();
    this.createRoads();
    this.createBuildings();
    this.createStreetLights();
    this.createPickups();
    this.createDestructibles();

    this.game.physics.createGroundPlane(1000);
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

    this.game.scene.add(this.ground);
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
    // Create asphalt texture
    const asphaltTexture = this.createAsphaltTexture();
    asphaltTexture.wrapS = THREE.RepeatWrapping;
    asphaltTexture.wrapT = THREE.RepeatWrapping;

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      map: asphaltTexture,
      roughness: 0.85,
      metalness: 0.05,
      envMapIntensity: 0.3
    });

    const laneMaterial = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.7,
      metalness: 0.0,
      emissive: 0x222222,
      emissiveIntensity: 0.1
    });

    const gridSize = 50;
    const roadWidth = 8;
    const roadCount = 10;

    for (let i = -roadCount / 2; i <= roadCount / 2; i++) {
      const horizontalRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, roadWidth),
        roadMaterial
      );
      horizontalRoad.rotation.x = -Math.PI / 2;
      horizontalRoad.position.set(0, 0.02, i * gridSize);
      horizontalRoad.receiveShadow = true;
      this.roads.push(horizontalRoad);
      this.game.scene.add(horizontalRoad);

      for (let j = -10; j <= 10; j++) {
        const lane = new THREE.Mesh(
          new THREE.PlaneGeometry(3, 0.2),
          laneMaterial
        );
        lane.rotation.x = -Math.PI / 2;
        lane.position.set(j * 20, 0.03, i * gridSize);
        this.game.scene.add(lane);
      }

      const verticalRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth, 1000),
        roadMaterial
      );
      verticalRoad.rotation.x = -Math.PI / 2;
      verticalRoad.position.set(i * gridSize, 0.02, 0);
      verticalRoad.receiveShadow = true;
      this.roads.push(verticalRoad);
      this.game.scene.add(verticalRoad);
    }

    for (let x = -roadCount / 2; x <= roadCount / 2; x++) {
      for (let z = -roadCount / 2; z <= roadCount / 2; z++) {
        const intersection = new THREE.Mesh(
          new THREE.PlaneGeometry(roadWidth + 2, roadWidth + 2),
          roadMaterial
        );
        intersection.rotation.x = -Math.PI / 2;
        intersection.position.set(x * gridSize, 0.025, z * gridSize);
        intersection.receiveShadow = true;
        this.game.scene.add(intersection);
      }
    }
  }

  private createBuildings(): void {
    const buildingColors = [
      0x8b4513, 0xa0522d, 0xcd853f, 0xdeb887,
      0x808080, 0xa9a9a9, 0x696969,
      0x4682b4, 0x5f9ea0, 0x708090
    ];

    const gridSize = 50;

    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        if (Math.abs(x) === 0 && Math.abs(z) === 0) continue;

        const offsetX = x * gridSize + (Math.random() - 0.5) * 20;
        const offsetZ = z * gridSize + (Math.random() - 0.5) * 20;

        const buildingCount = 1 + Math.floor(Math.random() * 3);

        for (let b = 0; b < buildingCount; b++) {
          const width = 8 + Math.random() * 12;
          const height = 10 + Math.random() * 40;
          const depth = 8 + Math.random() * 12;

          const bx = offsetX + (Math.random() - 0.5) * 15;
          const bz = offsetZ + (Math.random() - 0.5) * 15;

          this.createBuilding(
            new THREE.Vector3(bx, height / 2, bz),
            width,
            height,
            depth,
            buildingColors[Math.floor(Math.random() * buildingColors.length)]
          );
        }
      }
    }
  }

  private createBuilding(
    position: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    color: number
  ): Building {
    const geometry = new THREE.BoxGeometry(width, height, depth);

    // Create building facade texture
    const facadeTexture = this.createBuildingTexture(width, height);

    // Determine building style based on height
    const isSkyscraper = height > 30;
    const isModern = Math.random() > 0.5;

    const material = new THREE.MeshStandardMaterial({
      color,
      map: facadeTexture,
      roughness: isModern ? 0.3 : 0.7,
      metalness: isModern ? 0.4 : 0.1,
      envMapIntensity: isSkyscraper ? 0.8 : 0.3
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.addWindows(mesh, width, height, depth, isModern);

    // Add rooftop details
    if (Math.random() > 0.5) {
      this.addRooftopDetails(mesh, width, height, depth);
    }

    const body = this.game.physics.createBoxBody(
      `building_${this.objectIdCounter++}`,
      width,
      height,
      depth,
      0,
      position,
      COLLISION_GROUPS.STATIC
    );

    this.game.scene.add(mesh);

    const building: Building = {
      mesh,
      body,
      type: 'commercial'
    };

    this.buildings.push(building);
    return building;
  }

  private createBuildingTexture(width: number, height: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Base color
    const baseShade = Math.floor(Math.random() * 40) + 100;
    ctx.fillStyle = `rgb(${baseShade}, ${baseShade - 10}, ${baseShade - 20})`;
    ctx.fillRect(0, 0, 128, 256);

    // Add brick/panel pattern
    const panelHeight = 16;
    const panelWidth = 32;
    for (let y = 0; y < 256; y += panelHeight) {
      for (let x = 0; x < 128; x += panelWidth) {
        const shade = baseShade + Math.floor(Math.random() * 20) - 10;
        ctx.fillStyle = `rgb(${shade}, ${shade - 10}, ${shade - 20})`;
        ctx.fillRect(x + 1, y + 1, panelWidth - 2, panelHeight - 2);
      }
    }

    // Add subtle vertical lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 128; x += panelWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width / 8, height / 16);
    return texture;
  }

  private addRooftopDetails(building: THREE.Mesh, width: number, height: number, depth: number): void {
    // AC units
    const acMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.6,
      metalness: 0.4
    });

    for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
      const acUnit = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 1.5),
        acMaterial
      );
      acUnit.position.set(
        (Math.random() - 0.5) * (width - 3),
        height / 2 + 0.5,
        (Math.random() - 0.5) * (depth - 3)
      );
      acUnit.castShadow = true;
      building.add(acUnit);
    }

    // Water tank on some buildings
    if (Math.random() > 0.7) {
      const tankMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.5,
        metalness: 0.3
      });
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 3, 8),
        tankMaterial
      );
      tank.position.set(0, height / 2 + 1.5, 0);
      tank.castShadow = true;
      building.add(tank);
    }
  }

  private addWindows(
    building: THREE.Mesh,
    width: number,
    height: number,
    depth: number,
    isModern: boolean = false
  ): void {
    // Modern buildings have reflective glass windows
    const windowMaterial = isModern
      ? new THREE.MeshStandardMaterial({
          color: 0x88aacc,
          roughness: 0.1,
          metalness: 0.9,
          envMapIntensity: 1.0,
          transparent: true,
          opacity: 0.8
        })
      : new THREE.MeshStandardMaterial({
          color: 0xffffcc,
          emissive: 0xffffaa,
          emissiveIntensity: 0.1,
          roughness: 0.3,
          metalness: 0.1,
          transparent: true,
          opacity: 0.6
        });

    const windowSize = 1.5;
    const windowSpacing = 3;

    const sides = [
      { axis: 'x', offset: width / 2 + 0.01, rotation: new THREE.Euler(0, Math.PI / 2, 0) },
      { axis: 'x', offset: -width / 2 - 0.01, rotation: new THREE.Euler(0, -Math.PI / 2, 0) },
      { axis: 'z', offset: depth / 2 + 0.01, rotation: new THREE.Euler(0, 0, 0) },
      { axis: 'z', offset: -depth / 2 - 0.01, rotation: new THREE.Euler(0, Math.PI, 0) }
    ];

    sides.forEach(side => {
      const sideWidth = side.axis === 'x' ? depth : width;
      const windowsH = Math.floor(sideWidth / windowSpacing) - 1;
      const windowsV = Math.floor(height / windowSpacing) - 1;

      for (let h = 0; h < windowsH; h++) {
        for (let v = 0; v < windowsV; v++) {
          if (Math.random() > 0.8) continue;

          const windowGeometry = new THREE.PlaneGeometry(windowSize, windowSize);
          const window = new THREE.Mesh(windowGeometry, windowMaterial.clone());

          const hOffset = (h - windowsH / 2) * windowSpacing;
          const vOffset = (v - windowsV / 2) * windowSpacing;

          if (side.axis === 'x') {
            window.position.set(side.offset, vOffset, hOffset);
          } else {
            window.position.set(hOffset, vOffset, side.offset);
          }

          window.rotation.copy(side.rotation);

          // Some windows are dark (unlit)
          if (Math.random() > 0.5) {
            const mat = window.material as THREE.MeshStandardMaterial;
            mat.color.setHex(0x223344);
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
            mat.opacity = 0.9;
          }

          building.add(window);
        }
      }
    });
  }

  private createStreetLights(): void {
    const gridSize = 50;

    // Reduced density - only at intersections to avoid shader uniform limits
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        // Only place lights at every other intersection
        if ((x + z) % 2 === 0) {
          const pos = new THREE.Vector3(x * gridSize + 6, 0, z * gridSize + 6);
          this.createStreetLight(pos);
        }
      }
    }
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
    this.game.scene.add(group);

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

    this.game.scene.add(group);

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
    this.game.scene.add(mesh);

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

    this.pickups.forEach((pickup, id) => {
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
    const isNight = timeOfDay < 6 || timeOfDay > 19;

    this.streetLights.forEach(streetLight => {
      streetLight.light.intensity = isNight ? 0.8 : 0;
      const lamp = streetLight.mesh.children.find(c => c instanceof THREE.Mesh && (c.material as THREE.MeshBasicMaterial).color) as THREE.Mesh;
      if (lamp) {
        (lamp.material as THREE.MeshBasicMaterial).color.setHex(isNight ? 0xffffaa : 0x888888);
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

  private animatePickups(deltaTime: number): void {
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

    this.game.scene.add(hole);

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

      this.game.scene.add(debris);

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

  unlockArea(areaId: string): void {
    if (!this.unlockedAreas.includes(areaId)) {
      this.unlockedAreas.push(areaId);
    }
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

    if (this.ground) {
      this.game.scene.remove(this.ground);
    }

    this.roads.forEach(road => {
      this.game.scene.remove(road);
    });
    this.roads = [];
  }
}
