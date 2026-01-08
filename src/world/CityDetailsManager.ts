import * as THREE from 'three';
import { Game } from '@/core/Game';
import { BuildingMetadata } from './World';

interface NeonSign {
  mesh: THREE.Group;
  glowMaterial: THREE.MeshStandardMaterial;
  color: number;
  flickerRate: number;
  phase: number;
}

interface Billboard {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  animationPhase: number;
  type: 'scrolling' | 'flashing' | 'static';
}

interface SubwayEntrance {
  mesh: THREE.Group;
  steamParticles: THREE.Points;
  soundTimer: number;
}

interface WindowLight {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  isLit: boolean;
  flickerChance: number;
}

interface BuildingDetail {
  mesh: THREE.Group;
  type: 'fire_escape' | 'ac_unit' | 'water_tower' | 'antenna' | 'satellite';
}

interface Storefront {
  mesh: THREE.Group;
  type: 'mcdonalds' | 'starbucks' | 'subway' | 'dunkin' | 'pizzeria' | 'bodega' | 'deli';
  position: THREE.Vector3;
}

interface StreetVendor {
  mesh: THREE.Group;
  type: 'hotdog' | 'pretzel' | 'icecream' | 'coffee' | 'fruit';
}

export class CityDetailsManager {
  private game: Game;
  private detailsGroup: THREE.Group;
  private streetFurniture: THREE.Group[] = [];
  private neonSigns: NeonSign[] = [];
  private billboards: Billboard[] = [];
  private subwayEntrances: SubwayEntrance[] = [];
  private windowLights: WindowLight[] = [];
  private puddles: THREE.Mesh[] = [];
  private streetLamps: { mesh: THREE.Group; light: THREE.PointLight }[] = [];
  private buildingDetails: BuildingDetail[] = [];
  private storefronts: Storefront[] = [];
  private streetVendors: StreetVendor[] = [];

  private lastTimeOfDay: number = 12;
  private isNightMode: boolean = false;
  private isRaining: boolean = false;
  private isMobile: boolean;

  // Performance: throttle updates
  private updateAccumulator: number = 0;
  private updateInterval: number = 0.1; // Update every 100ms instead of every frame

  constructor(game: Game) {
    this.game = game;
    this.detailsGroup = new THREE.Group();
    this.detailsGroup.name = 'detailsGroup';
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) || window.innerWidth < 768;
  }

  getDetailsGroup(): THREE.Group {
    return this.detailsGroup;
  }

  async initialize(): Promise<void> {
    this.createStreetFurniture();
    this.createNeonSigns();
    this.createBillboards();
    this.createSubwayEntrances();
    this.createStreetLamps();
    this.createBuildingDetails();
    this.createTimesSquareArea();
    this.createCentralParkArea();
    this.createStorefronts();
    this.createStreetVendors();

    // Enhanced NYC atmosphere
    this.createNYCLandmarks();
    this.createDistrictAtmosphere();
    this.createStreetAtmosphere();

    // Add detailsGroup to scene
    this.game.scene.add(this.detailsGroup);
  }

  // ==================== STREET FURNITURE ====================
  private createStreetFurniture(): void {
    const gridSize = 50;
    const range = 5;

    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) {
        const baseX = x * gridSize;
        const baseZ = z * gridSize;

        // Fire hydrants at corners
        if (Math.random() > 0.7) {
          const hydrant = this.createFireHydrant();
          hydrant.position.set(baseX + 8, 0, baseZ + 8);
          this.detailsGroup.add(hydrant);
          this.streetFurniture.push(hydrant);
        }

        // Trash cans
        if (Math.random() > 0.5) {
          const trash = this.createTrashCan();
          trash.position.set(baseX + 6 + Math.random() * 4, 0, baseZ + 7);
          this.detailsGroup.add(trash);
          this.streetFurniture.push(trash);
        }

        // Mailboxes
        if (Math.random() > 0.8) {
          const mailbox = this.createMailbox();
          mailbox.position.set(baseX + 9, 0, baseZ - 5 + Math.random() * 10);
          this.detailsGroup.add(mailbox);
          this.streetFurniture.push(mailbox);
        }

        // Benches
        if (Math.random() > 0.75) {
          const bench = this.createBench();
          bench.position.set(baseX + 7, 0, baseZ + Math.random() * 20 - 10);
          bench.rotation.y = Math.PI / 2;
          this.detailsGroup.add(bench);
          this.streetFurniture.push(bench);
        }

        // Phone booths (rare)
        if (Math.random() > 0.92) {
          const booth = this.createPhoneBooth();
          booth.position.set(baseX + 9, 0, baseZ + 12);
          this.detailsGroup.add(booth);
          this.streetFurniture.push(booth);
        }

        // Parking meters
        if (Math.random() > 0.6) {
          for (let i = 0; i < 3; i++) {
            const meter = this.createParkingMeter();
            meter.position.set(baseX + 5, 0, baseZ + i * 3 - 3);
            this.detailsGroup.add(meter);
            this.streetFurniture.push(meter);
          }
        }

        // Newspaper boxes
        if (Math.random() > 0.85) {
          const newsbox = this.createNewspaperBox();
          newsbox.position.set(baseX + 8.5, 0, baseZ + 15);
          this.detailsGroup.add(newsbox);
          this.streetFurniture.push(newsbox);
        }
      }
    }
  }

  private createFireHydrant(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.4,
      metalness: 0.3
    });

    // Main body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.5, 12),
      material
    );
    body.position.y = 0.25;
    body.castShadow = true;
    group.add(body);

    // Top cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.1, 12),
      material
    );
    cap.position.y = 0.55;
    group.add(cap);

    // Side nozzles
    [-1, 1].forEach(side => {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8),
        material
      );
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(side * 0.15, 0.35, 0);
      group.add(nozzle);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        material
      );
      cap.position.set(side * 0.2, 0.35, 0);
      group.add(cap);
    });

    // Base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
    );
    base.position.y = 0.04;
    group.add(base);

    return group;
  }

  private createTrashCan(): THREE.Group {
    const group = new THREE.Group();

    // Wire mesh body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.22, 0.7, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x228822,
        roughness: 0.6,
        metalness: 0.4,
        side: THREE.DoubleSide
      })
    );
    body.position.y = 0.35;
    body.castShadow = true;
    group.add(body);

    // Rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.02, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x228822, metalness: 0.5 })
    );
    rim.position.y = 0.7;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    // Base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    base.position.y = 0.01;
    group.add(base);

    // Trash inside (random)
    if (Math.random() > 0.3) {
      const trash = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 })
      );
      trash.position.y = 0.5;
      trash.scale.y = 0.5;
      group.add(trash);
    }

    return group;
  }

  private createMailbox(): THREE.Group {
    const group = new THREE.Group();
    const blueMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.4,
      metalness: 0.3
    });

    // Main body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.9, 0.35),
      blueMaterial
    );
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    // Rounded top
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.175, 0.4, 16, 1, false, 0, Math.PI),
      blueMaterial
    );
    top.rotation.z = Math.PI / 2;
    top.rotation.y = Math.PI / 2;
    top.position.set(0, 1.0, 0);
    group.add(top);

    // Mail slot
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.03, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    slot.position.set(0, 0.85, 0.18);
    slot.rotation.x = 0.2;
    group.add(slot);

    // "US MAIL" text area
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.01),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    label.position.set(0, 0.6, 0.18);
    group.add(label);

    // Legs
    [-0.12, 0.12].forEach(x => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.2, 0.05),
        blueMaterial
      );
      leg.position.set(x, 0.1, 0);
      group.add(leg);
    });

    return group;
  }

  private createBench(): THREE.Group {
    const group = new THREE.Group();
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.8
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.4,
      metalness: 0.7
    });

    // Seat slats
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.03, 0.08),
        woodMaterial
      );
      slat.position.set(0, 0.45, i * 0.09 - 0.18);
      slat.castShadow = true;
      group.add(slat);
    }

    // Back slats
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.03, 0.06),
        woodMaterial
      );
      slat.position.set(0, 0.6 + i * 0.12, -0.22);
      slat.rotation.x = 0.2;
      slat.castShadow = true;
      group.add(slat);
    }

    // Metal supports
    [-0.5, 0.5].forEach(x => {
      // Leg
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.45, 0.04),
        metalMaterial
      );
      leg.position.set(x, 0.225, 0);
      group.add(leg);

      // Back support
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.5, 0.04),
        metalMaterial
      );
      back.position.set(x, 0.7, -0.2);
      back.rotation.x = 0.2;
      group.add(back);

      // Armrest
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.4),
        metalMaterial
      );
      arm.position.set(x, 0.55, -0.05);
      group.add(arm);
    });

    return group;
  }

  private createPhoneBooth(): THREE.Group {
    const group = new THREE.Group();

    // Frame
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.3,
      metalness: 0.8
    });

    // Main structure
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 2.2, 0.9),
      frameMaterial
    );
    frame.position.y = 1.1;
    group.add(frame);

    // Glass panels
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x88aacc,
      transparent: true,
      opacity: 0.4,
      roughness: 0.1
    });

    ['front', 'left', 'right'].forEach((side, i) => {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(side === 'front' ? 0.7 : 0.02, 1.8, side === 'front' ? 0.02 : 0.7),
        glassMaterial
      );
      if (side === 'front') glass.position.set(0, 1.1, 0.44);
      else if (side === 'left') glass.position.set(-0.44, 1.1, 0);
      else glass.position.set(0.44, 1.1, 0);
      group.add(glass);
    });

    // Phone unit inside
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.4, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    phone.position.set(0, 1.3, -0.3);
    group.add(phone);

    // Light on top
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.1, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0xffffaa,
        emissive: 0xffff44,
        emissiveIntensity: 0.3
      })
    );
    light.position.y = 2.25;
    group.add(light);

    return group;
  }

  private createParkingMeter(): THREE.Group {
    const group = new THREE.Group();
    const grayMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.4,
      metalness: 0.6
    });

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8),
      grayMaterial
    );
    pole.position.y = 0.5;
    group.add(pole);

    // Meter head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.2, 0.08),
      grayMaterial
    );
    head.position.y = 1.1;
    group.add(head);

    // Display
    const display = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    display.position.set(0, 1.15, 0.045);
    group.add(display);

    // Coin slot
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.03, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    slot.position.set(0, 1.05, 0.045);
    group.add(slot);

    return group;
  }

  private createNewspaperBox(): THREE.Group {
    const group = new THREE.Group();
    const colors = [0xff4444, 0x4444ff, 0xffff44, 0x44ff44];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.9, 0.35),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })
    );
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);

    // Window
    const window = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.25, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.5
      })
    );
    window.position.set(0, 0.6, 0.18);
    group.add(window);

    // Handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.04, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    handle.position.set(0, 0.35, 0.18);
    group.add(handle);

    return group;
  }

  // ==================== NEON SIGNS ====================
  private createNeonSigns(): void {
    if (this.isMobile) return; // Skip on mobile for performance

    const signTypes = ['BAR', 'HOTEL', 'DINER', 'OPEN', 'PIZZA', 'TATTOO', 'LIQUOR', '24H'];
    const colors = [0xff0066, 0x00ffff, 0xffff00, 0xff6600, 0x00ff66, 0xff00ff];

    const gridSize = 50;
    const range = 4;

    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) {
        if (Math.random() > 0.6) continue;

        const baseX = x * gridSize + (Math.random() - 0.5) * 30;
        const baseZ = z * gridSize + (Math.random() - 0.5) * 30;
        const height = 4 + Math.random() * 8;

        const text = signTypes[Math.floor(Math.random() * signTypes.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const sign = this.createNeonSign(text, color);
        sign.mesh.position.set(baseX, height, baseZ);
        sign.mesh.rotation.y = Math.random() * Math.PI * 2;

        this.detailsGroup.add(sign.mesh);
        this.neonSigns.push(sign);
      }
    }
  }

  private createNeonSign(text: string, color: number): NeonSign {
    const group = new THREE.Group();

    // Backing board
    const backingWidth = text.length * 0.4 + 0.4;
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(backingWidth, 0.8, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
    );
    group.add(backing);

    // Neon tubes (simplified as glowing boxes) - NO PointLight, just emissive
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 3, // Higher intensity to compensate for no light
      roughness: 0.2
    });

    // Create letter shapes (simplified)
    for (let i = 0; i < text.length; i++) {
      const letterBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.5, 0.05),
        glowMaterial
      );
      letterBox.position.set(i * 0.35 - (text.length * 0.35) / 2 + 0.175, 0, 0.08);
      group.add(letterBox);
    }

    // NO PointLight - use emissive material only for performance

    return {
      mesh: group,
      glowMaterial,
      color,
      flickerRate: 0.02 + Math.random() * 0.05,
      phase: Math.random() * Math.PI * 2
    };
  }

  // ==================== BILLBOARDS ====================
  private createBillboards(): void {
    const gridSize = 50;
    const positions = [
      { x: 0, z: 100 },
      { x: 100, z: 0 },
      { x: -100, z: 50 },
      { x: 50, z: -100 },
      { x: -50, z: -50 },
    ];

    positions.forEach((pos, i) => {
      const billboard = this.createBillboard(i);
      billboard.mesh.position.set(pos.x, 15, pos.z);
      billboard.mesh.rotation.y = Math.atan2(pos.x, pos.z) + Math.PI;
      this.detailsGroup.add(billboard.mesh);
      this.billboards.push(billboard);
    });
  }

  private createBillboard(index: number): Billboard {
    const colors = [
      [0xff4444, 0xffff44], // Red-Yellow
      [0x4444ff, 0x44ffff], // Blue-Cyan
      [0xff44ff, 0xffff44], // Magenta-Yellow
      [0x44ff44, 0x4444ff], // Green-Blue
      [0xff8844, 0xff4488], // Orange-Pink
    ];

    const [color1, color2] = colors[index % colors.length];

    // Billboard frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(12, 6, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 })
    );

    // LED screen
    const screenMaterial = new THREE.MeshStandardMaterial({
      color: color1,
      emissive: color1,
      emissiveIntensity: 1.5,
      roughness: 0.3
    });

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 5.5, 0.1),
      screenMaterial
    );
    screen.position.z = 0.2;
    frame.add(screen);

    // Support poles
    [-4, 4].forEach(x => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 15, 8),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7 })
      );
      pole.position.set(x, -10.5, 0);
      frame.add(pole);
    });

    // Lights on top
    for (let i = -5; i <= 5; i += 2) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.3),
        new THREE.MeshStandardMaterial({
          color: 0xffffaa,
          emissive: 0xffff88,
          emissiveIntensity: 0.5
        })
      );
      light.position.set(i, 3.3, 0.3);
      frame.add(light);
    }

    return {
      mesh: frame,
      material: screenMaterial,
      animationPhase: Math.random() * Math.PI * 2,
      type: ['scrolling', 'flashing', 'static'][Math.floor(Math.random() * 3)] as 'scrolling' | 'flashing' | 'static'
    };
  }

  // ==================== SUBWAY ENTRANCES ====================
  private createSubwayEntrances(): void {
    const positions = [
      { x: 25, z: 25 },
      { x: -75, z: 50 },
      { x: 50, z: -75 },
      { x: -25, z: -25 },
    ];

    positions.forEach(pos => {
      const entrance = this.createSubwayEntrance();
      entrance.mesh.position.set(pos.x, 0, pos.z);
      entrance.mesh.rotation.y = Math.random() * Math.PI * 2;
      this.detailsGroup.add(entrance.mesh);
      this.subwayEntrances.push(entrance);
    });
  }

  private createSubwayEntrance(): SubwayEntrance {
    const group = new THREE.Group();

    // Entrance structure
    const structure = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.3, 3),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 })
    );
    structure.position.y = 0.15;
    group.add(structure);

    // Railings
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.3
    });

    [-1.8, 1.8].forEach(x => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 1, 3),
        railMaterial
      );
      rail.position.set(x, 0.5, 0);
      group.add(rail);
    });

    // Stairs going down (visual only)
    for (let i = 0; i < 5; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.15, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x555555 })
      );
      step.position.set(0, -i * 0.2, -i * 0.4);
      group.add(step);
    }

    // Subway sign
    const signGroup = new THREE.Group();
    const signBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x00aa00,
        emissive: 0x004400,
        emissiveIntensity: 0.5
      })
    );
    signGroup.add(signBall);

    const signPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2, 8),
      railMaterial
    );
    signPole.position.y = -1;
    signGroup.add(signPole);

    signGroup.position.set(2.5, 2.5, 0);
    group.add(signGroup);

    // Steam particles
    const steamGeometry = this.createSteamGeometry(new THREE.Vector3(0, 0.3, 0));
    const steamMaterial = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 0.2,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending
    });
    const steam = new THREE.Points(steamGeometry, steamMaterial);
    group.add(steam);

    return {
      mesh: group,
      steamParticles: steam,
      soundTimer: Math.random() * 30
    };
  }

  private createSteamGeometry(basePosition: THREE.Vector3): THREE.BufferGeometry {
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = basePosition.x + (Math.random() - 0.5) * 2;
      positions[i3 + 1] = basePosition.y + Math.random() * 2;
      positions[i3 + 2] = basePosition.z + (Math.random() - 0.5) * 1;

      velocities[i3] = (Math.random() - 0.5) * 0.3;
      velocities[i3 + 1] = 0.5 + Math.random();
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData.velocities = velocities;
    geometry.userData.basePosition = basePosition.clone();

    return geometry;
  }

  // ==================== STREET LAMPS ====================
  private createStreetLamps(): void {
    const gridSize = 50;
    const range = 3; // Reduced range for fewer lamps

    // Shared materials for performance
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
      metalness: 0.8
    });

    let lampCount = 0;
    const maxLampsWithLights = 6; // Only 6 lamps will have actual PointLights

    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) {
        const baseX = x * gridSize;
        const baseZ = z * gridSize;

        // Only 2 lamps per block (reduced from 4)
        [
          { dx: 8, dz: 8 },
          { dx: -8, dz: -8 }
        ].forEach(offset => {
          if (Math.random() > 0.5) return;

          // Only add PointLight to lamps near center (player start)
          const hasLight = lampCount < maxLampsWithLights && Math.abs(x) <= 1 && Math.abs(z) <= 1;
          const lamp = this.createStreetLamp(metalMaterial, hasLight);
          lamp.mesh.position.set(baseX + offset.dx, 0, baseZ + offset.dz);
          this.detailsGroup.add(lamp.mesh);

          if (hasLight) {
            this.streetLamps.push(lamp);
            lampCount++;
          }
        });
      }
    }
  }

  private createStreetLamp(
    metalMaterial: THREE.MeshStandardMaterial,
    includeLight: boolean
  ): { mesh: THREE.Group; light: THREE.PointLight } {
    const group = new THREE.Group();

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5, 6),
      metalMaterial
    );
    pole.position.y = 2.5;
    group.add(pole);

    // Arm
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.08, 0.08),
      metalMaterial
    );
    arm.position.set(0.6, 5, 0);
    group.add(arm);

    // Lamp housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.15, 0.25),
      metalMaterial
    );
    housing.position.set(1.1, 4.9, 0);
    group.add(housing);

    // Light bulb (visible) - always emissive for glow effect
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffffaa,
        emissive: 0xffaa44,
        emissiveIntensity: 1.5 // Higher emissive for visual glow
      })
    );
    bulb.position.set(1.1, 4.8, 0);
    group.add(bulb);

    // Only add PointLight for select lamps (performance)
    let light: THREE.PointLight;
    if (includeLight) {
      light = new THREE.PointLight(0xffaa44, 0, 10);
      light.position.set(1.1, 4.7, 0);
      // No shadows for performance
      group.add(light);
    } else {
      // Dummy light that won't be used
      light = new THREE.PointLight(0xffaa44, 0, 0);
    }

    return { mesh: group, light };
  }

  // ==================== BUILDING DETAILS ====================
  private createBuildingDetails(): void {
    if (this.isMobile) return; // Skip on mobile for performance

    // Use building registry to attach details to actual buildings
    const buildingRegistry = this.game.world.getBuildingRegistry();

    buildingRegistry.forEach((building: BuildingMetadata) => {
      const { position, height, width, depth, style, district } = building;

      // Fire escapes - only on brownstone, prewar, and warehouse buildings
      if ((style === 'brownstone' || style === 'prewar' || style === 'warehouse') && Math.random() > 0.4) {
        const fireEscape = this.createFireEscape();
        const side = Math.random() > 0.5 ? 1 : -1;
        // Position on actual building facade
        fireEscape.position.set(
          position.x + side * (width / 2 + 0.5),
          0,  // Fire escapes start from ground
          position.z + (Math.random() - 0.5) * depth * 0.6
        );
        fireEscape.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        // Scale fire escape to building height
        const floors = Math.min(Math.floor(height / 3.5), 8);
        fireEscape.scale.y = floors / 6; // Adjust to building
        this.detailsGroup.add(fireEscape);
        this.buildingDetails.push({ mesh: fireEscape, type: 'fire_escape' });

        // Register ladders as climbable objects
        this.registerFireEscapeLadders(fireEscape);
      }

      // AC units - not on glass towers or warehouses
      if (style !== 'glass_tower' && style !== 'warehouse' && Math.random() > 0.5) {
        const acCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < acCount; i++) {
          const acUnit = this.createWindowACUnit();
          const floorHeight = 3 + Math.random() * (height * 0.7);
          // Position on actual building facade
          acUnit.position.set(
            position.x + (width / 2 + 0.3),
            floorHeight,
            position.z + (Math.random() - 0.5) * depth * 0.8
          );
          this.detailsGroup.add(acUnit);
          this.buildingDetails.push({ mesh: acUnit, type: 'ac_unit' });
        }
      }

      // Water towers - only on taller buildings (>20 units) in residential/prewar style
      if (height > 20 && (style === 'prewar' || style === 'brownstone') && Math.random() > 0.6) {
        const waterTower = this.createWaterTower();
        // Position on actual rooftop
        waterTower.position.set(
          position.x + (Math.random() - 0.5) * width * 0.5,
          height,  // Actual building height (rooftop)
          position.z + (Math.random() - 0.5) * depth * 0.5
        );
        this.detailsGroup.add(waterTower);
        this.buildingDetails.push({ mesh: waterTower, type: 'water_tower' });
      }

      // Rooftop antennas - on modern and glass tower buildings
      if ((style === 'modern' || style === 'glass_tower') && height > 25 && Math.random() > 0.5) {
        const antenna = this.createRooftopAntenna();
        // Position on actual rooftop
        antenna.position.set(
          position.x + (Math.random() - 0.5) * width * 0.3,
          height,  // Actual building height (rooftop)
          position.z + (Math.random() - 0.5) * depth * 0.3
        );
        this.detailsGroup.add(antenna);
        this.buildingDetails.push({ mesh: antenna, type: 'antenna' });
      }

      // Satellite dishes - on residential and prewar buildings
      if ((style === 'brownstone' || style === 'prewar') && Math.random() > 0.7) {
        const satellite = this.createSatelliteDish();
        // Position on actual rooftop
        satellite.position.set(
          position.x + (Math.random() - 0.5) * width * 0.6,
          height,  // Actual building height (rooftop)
          position.z + (Math.random() - 0.5) * depth * 0.6
        );
        satellite.rotation.y = Math.random() * Math.PI * 2;
        this.detailsGroup.add(satellite);
        this.buildingDetails.push({ mesh: satellite, type: 'satellite' });
      }

      // Rooftop HVAC units - on commercial and modern buildings
      if ((style === 'modern' || style === 'glass_tower' || style === 'artdeco') && height > 15 && Math.random() > 0.5) {
        const hvac = this.createRooftopHVAC();
        // Position on actual rooftop
        hvac.position.set(
          position.x + (Math.random() - 0.5) * width * 0.5,
          height,  // Actual building height (rooftop)
          position.z + (Math.random() - 0.5) * depth * 0.5
        );
        this.detailsGroup.add(hvac);
        this.buildingDetails.push({ mesh: hvac, type: 'ac_unit' });
      }
    });
  }

  private createFireEscape(): THREE.Group {
    const group = new THREE.Group();
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.6,
      metalness: 0.7
    });

    const floors = 4 + Math.floor(Math.random() * 4);
    const floorHeight = 3;

    for (let floor = 0; floor < floors; floor++) {
      const y = floor * floorHeight + 3;

      // Platform
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.08, 1.2),
        metalMaterial
      );
      platform.position.set(0, y, 0);
      platform.castShadow = true;
      group.add(platform);

      // Railings
      const railHeight = 0.9;

      // Front rail
      const frontRail = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.04, 0.04),
        metalMaterial
      );
      frontRail.position.set(0, y + railHeight, 0.58);
      group.add(frontRail);

      // Side rails
      [-0.73, 0.73].forEach(xPos => {
        const sideRail = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.04, 1.2),
          metalMaterial
        );
        sideRail.position.set(xPos, y + railHeight, 0);
        group.add(sideRail);
      });

      // Vertical posts
      [[-0.73, 0.58], [0.73, 0.58], [-0.73, -0.58], [0.73, -0.58]].forEach(([x, z]) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, railHeight, 6),
          metalMaterial
        );
        post.position.set(x, y + railHeight / 2, z);
        group.add(post);
      });

      // Ladder to next floor (except top)
      if (floor < floors - 1) {
        const ladder = this.createLadder(floorHeight - 0.1);
        ladder.position.set(0.5, y + floorHeight / 2 + 0.05, -0.4);
        group.add(ladder);
      }

      // Diagonal support brackets
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 1.5),
        metalMaterial
      );
      bracket.rotation.x = Math.PI / 4;
      bracket.position.set(0, y - 0.5, -0.6);
      group.add(bracket);
    }

    // Dropdown ladder at bottom
    const dropLadder = this.createLadder(2.5);
    dropLadder.position.set(0, 1.25, 0.5);
    dropLadder.rotation.x = -0.3; // Slightly angled
    group.add(dropLadder);

    return group;
  }

  private createLadder(height: number): THREE.Group {
    const group = new THREE.Group();
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.5,
      metalness: 0.8
    });

    // Side rails
    [-0.15, 0.15].forEach(x => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, height, 0.03),
        metalMaterial
      );
      rail.position.x = x;
      group.add(rail);
    });

    // Rungs
    const rungCount = Math.floor(height / 0.3);
    for (let i = 0; i < rungCount; i++) {
      const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6),
        metalMaterial
      );
      rung.rotation.z = Math.PI / 2;
      rung.position.y = -height / 2 + 0.15 + i * (height / rungCount);
      group.add(rung);
    }

    // Tag as climbable for the climbing system
    group.userData.climbable = true;
    group.userData.climbType = 'ladder';
    group.userData.climbHeight = height;

    return group;
  }

  /**
   * Register all ladders in a fire escape with the InteriorManager for climbing
   */
  private registerFireEscapeLadders(fireEscape: THREE.Group): void {
    let ladderIndex = 0;

    fireEscape.traverse((child) => {
      if (child.userData.climbable && child.userData.climbType === 'ladder') {
        // Get world position of the ladder
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        // Get the ladder height (accounting for scale)
        const ladderHeight = (child.userData.climbHeight || 3) * fireEscape.scale.y;

        // Calculate facing direction (normal) based on fire escape rotation
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(fireEscape.quaternion);

        // Create climbable object registration
        const climbableId = `ladder_${fireEscape.uuid}_${ladderIndex++}`;
        child.userData.climbableId = climbableId;

        this.game.interiors.registerClimbable({
          id: climbableId,
          type: 'ladder',
          position: worldPos.clone(),
          topPosition: worldPos.clone().add(new THREE.Vector3(0, ladderHeight / 2, 0)),
          bottomPosition: worldPos.clone().add(new THREE.Vector3(0, -ladderHeight / 2, 0)),
          normal: normal,
          width: 0.3,
          mesh: child
        });
      }
    });
  }

  private createWindowACUnit(): THREE.Group {
    const group = new THREE.Group();

    // Main unit body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.6,
        metalness: 0.3
      })
    );
    group.add(body);

    // Front vent grille
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    grille.position.set(0, 0, 0.26);
    group.add(grille);

    // Vent slats
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.02, 0.01),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
      );
      slat.position.set(0, -0.1 + i * 0.05, 0.27);
      group.add(slat);
    }

    // Top exhaust
    const exhaust = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.05, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    exhaust.position.set(0, 0.225, -0.1);
    group.add(exhaust);

    return group;
  }

  private createWaterTower(): THREE.Group {
    const group = new THREE.Group();

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c3d2e,
      roughness: 0.9
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.4,
      metalness: 0.7
    });

    // Tank (barrel shape)
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2.2, 4, 16),
      woodMaterial
    );
    tank.position.y = 5;
    tank.castShadow = true;
    group.add(tank);

    // Metal bands
    [-1.5, 0, 1.5].forEach(y => {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(2.05, 0.05, 8, 32),
        metalMaterial
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 5 + y;
      group.add(band);
    });

    // Conical roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.3, 1.2, 16),
      metalMaterial
    );
    roof.position.y = 7.6;
    group.add(roof);

    // Support legs
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 1.5;
      const z = Math.sin(angle) * 1.5;

      // Vertical leg
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 3, 0.15),
        metalMaterial
      );
      leg.position.set(x, 1.5, z);
      group.add(leg);

      // Diagonal brace
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 2.5, 0.08),
        metalMaterial
      );
      brace.position.set(x * 0.7, 1.5, z * 0.7);
      brace.rotation.z = Math.atan2(1, 0.5) * (i % 2 === 0 ? 1 : -1);
      brace.rotation.y = angle;
      group.add(brace);
    }

    // Cross braces
    for (let h = 0; h < 2; h++) {
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const nextAngle = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;

        const x1 = Math.cos(angle) * 1.5;
        const z1 = Math.sin(angle) * 1.5;
        const x2 = Math.cos(nextAngle) * 1.5;
        const z2 = Math.sin(nextAngle) * 1.5;

        const crossBrace = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.06, 2.2),
          metalMaterial
        );
        crossBrace.position.set((x1 + x2) / 2, 0.8 + h * 1.5, (z1 + z2) / 2);
        crossBrace.rotation.y = angle + Math.PI / 8;
        group.add(crossBrace);
      }
    }

    // Access ladder
    const ladder = this.createLadder(6);
    ladder.position.set(2, 3, 0);
    group.add(ladder);

    return group;
  }

  private createRooftopAntenna(): THREE.Group {
    const group = new THREE.Group();
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.8
    });

    // Main pole
    const mainHeight = 4 + Math.random() * 6;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, mainHeight, 8),
      metalMaterial
    );
    pole.position.y = mainHeight / 2;
    group.add(pole);

    // Cross arms for cell antenna
    const armCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < armCount; i++) {
      const armY = mainHeight * 0.5 + i * 1.2;

      for (let j = 0; j < 3; j++) {
        const angle = (j / 3) * Math.PI * 2;

        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.15, 0.08),
          metalMaterial
        );
        arm.position.set(
          Math.cos(angle) * 0.4,
          armY,
          Math.sin(angle) * 0.4
        );
        arm.rotation.y = angle;
        group.add(arm);

        // Antenna panel
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.8, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 })
        );
        panel.position.set(
          Math.cos(angle) * 0.8,
          armY,
          Math.sin(angle) * 0.8
        );
        panel.rotation.y = angle;
        group.add(panel);
      }
    }

    // Red aviation light on top
    const lightBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.8
      })
    );
    lightBall.position.y = mainHeight + 0.1;
    group.add(lightBall);

    // Base mount
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.5),
      metalMaterial
    );
    base.position.y = 0.05;
    group.add(base);

    return group;
  }

  private createSatelliteDish(): THREE.Group {
    const group = new THREE.Group();

    const dishMaterial = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.3,
      metalness: 0.5
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.4,
      metalness: 0.8
    });

    // Dish
    const dishSize = 0.8 + Math.random() * 0.6;
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(dishSize, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      dishMaterial
    );
    dish.rotation.x = Math.PI + 0.5; // Tilted upward
    dish.position.y = 0.5;
    group.add(dish);

    // LNB arm
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, dishSize * 0.8, 6),
      metalMaterial
    );
    arm.rotation.x = -0.5;
    arm.position.set(0, 0.7, dishSize * 0.3);
    group.add(arm);

    // LNB head
    const lnb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.03, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    lnb.position.set(0, 0.9, dishSize * 0.5);
    group.add(lnb);

    // Mount pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.5, 8),
      metalMaterial
    );
    pole.position.y = 0.25;
    group.add(pole);

    // Base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 0.05, 12),
      metalMaterial
    );
    base.position.y = 0.025;
    group.add(base);

    return group;
  }

  private createRooftopHVAC(): THREE.Group {
    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.5,
      metalness: 0.4
    });

    // Main unit body
    const width = 1.5 + Math.random();
    const depth = 1 + Math.random() * 0.5;
    const height = 0.8 + Math.random() * 0.4;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      bodyMaterial
    );
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);

    // Top fan housing
    const fanHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.45, 0.3, 12),
      bodyMaterial
    );
    fanHousing.position.set(width * 0.2, height + 0.15, 0);
    group.add(fanHousing);

    // Fan grille
    const grille = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 16),
      new THREE.MeshStandardMaterial({
        color: 0x333333,
        side: THREE.DoubleSide
      })
    );
    grille.rotation.x = -Math.PI / 2;
    grille.position.set(width * 0.2, height + 0.31, 0);
    group.add(grille);

    // Second fan if large enough
    if (width > 1.8) {
      const fanHousing2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 0.3, 12),
        bodyMaterial
      );
      fanHousing2.position.set(-width * 0.2, height + 0.15, 0);
      group.add(fanHousing2);

      const grille2 = new THREE.Mesh(
        new THREE.CircleGeometry(0.33, 16),
        new THREE.MeshStandardMaterial({
          color: 0x333333,
          side: THREE.DoubleSide
        })
      );
      grille2.rotation.x = -Math.PI / 2;
      grille2.position.set(-width * 0.2, height + 0.31, 0);
      group.add(grille2);
    }

    // Side vents
    const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    [-1, 1].forEach(side => {
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, height * 0.6, depth * 0.6),
        ventMaterial
      );
      vent.position.set(side * (width / 2 + 0.01), height * 0.5, 0);
      group.add(vent);
    });

    // Pipes/conduits
    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.6
    });

    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8),
      pipeMaterial
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(width / 2 + 0.75, height * 0.3, depth * 0.3);
    group.add(pipe);

    return group;
  }

  // ==================== TIMES SQUARE AREA ====================
  private createTimesSquareArea(): void {
    // Central area with many neon signs and billboards
    const centerX = 0;
    const centerZ = 0;

    // Giant screens on buildings
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const radius = 35;
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;

      const screen = this.createGiantScreen();
      screen.position.set(x, 10, z);
      screen.rotation.y = -angle + Math.PI;
      this.detailsGroup.add(screen);
    }

    // Scrolling news ticker
    const ticker = this.createNewsTicker();
    ticker.position.set(centerX, 6, centerZ - 40);
    this.detailsGroup.add(ticker);
  }

  private createGiantScreen(): THREE.Group {
    const group = new THREE.Group();

    const colors = [0xff0088, 0x00ff88, 0x8800ff, 0xff8800, 0x0088ff];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Screen
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(8, 12, 0.2),
      new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 1.5
      })
    );
    group.add(screen);

    // Frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 12.4, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    frame.position.z = -0.1;
    group.add(frame);

    return group;
  }

  private createNewsTicker(): THREE.Group {
    const group = new THREE.Group();

    // Background
    const bg = new THREE.Mesh(
      new THREE.BoxGeometry(40, 1.5, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    group.add(bg);

    // Scrolling text area (simplified)
    const text = new THREE.Mesh(
      new THREE.BoxGeometry(38, 1, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1
      })
    );
    text.position.z = 0.15;
    group.add(text);

    return group;
  }

  // ==================== CENTRAL PARK AREA ====================
  private createCentralParkArea(): void {
    const parkCenter = new THREE.Vector3(-150, 0, -150);
    const parkSize = 80;

    // Grass area
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(parkSize, parkSize),
      new THREE.MeshStandardMaterial({
        color: 0x228822,
        roughness: 0.9
      })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.copy(parkCenter);
    grass.position.y = 0.01;
    grass.receiveShadow = true;
    this.detailsGroup.add(grass);

    // Trees
    for (let i = 0; i < 20; i++) {
      const tree = this.createTree();
      tree.position.set(
        parkCenter.x + (Math.random() - 0.5) * parkSize * 0.8,
        0,
        parkCenter.z + (Math.random() - 0.5) * parkSize * 0.8
      );
      this.detailsGroup.add(tree);
    }

    // Benches around the park
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bench = this.createBench();
      bench.position.set(
        parkCenter.x + Math.cos(angle) * (parkSize * 0.35),
        0,
        parkCenter.z + Math.sin(angle) * (parkSize * 0.35)
      );
      bench.rotation.y = angle + Math.PI / 2;
      this.detailsGroup.add(bench);
    }

    // Lamp posts along path (decorative only, no PointLights for performance)
    const parkLampMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
      metalness: 0.8
    });
    for (let i = 0; i < 4; i++) { // Reduced from 6 to 4
      const lamp = this.createStreetLamp(parkLampMaterial, false); // No light
      const angle = (i / 4) * Math.PI * 2;
      lamp.mesh.position.set(
        parkCenter.x + Math.cos(angle) * (parkSize * 0.4),
        0,
        parkCenter.z + Math.sin(angle) * (parkSize * 0.4)
      );
      this.detailsGroup.add(lamp.mesh);
      // Don't add to streetLamps array since they have no lights
    }

    // Fountain in center
    const fountain = this.createFountain();
    fountain.position.copy(parkCenter);
    this.detailsGroup.add(fountain);
  }

  private createTree(): THREE.Group {
    const group = new THREE.Group();

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 2 + Math.random(), 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 })
    );
    trunk.position.y = 1;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage (multiple spheres for natural look)
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x228833,
      roughness: 0.8
    });

    for (let i = 0; i < 4; i++) {
      const foliage = new THREE.Mesh(
        new THREE.SphereGeometry(1 + Math.random() * 0.5, 8, 8),
        foliageMaterial
      );
      foliage.position.set(
        (Math.random() - 0.5) * 0.8,
        2.5 + Math.random() * 1.5,
        (Math.random() - 0.5) * 0.8
      );
      foliage.castShadow = true;
      group.add(foliage);
    }

    return group;
  }

  private createFountain(): THREE.Group {
    const group = new THREE.Group();

    // Base pool
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4.5, 0.5, 24),
      new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6 })
    );
    pool.position.y = 0.25;
    group.add(pool);

    // Water
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 0.3, 24),
      new THREE.MeshStandardMaterial({
        color: 0x4488aa,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1
      })
    );
    water.position.y = 0.35;
    group.add(water);

    // Center pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 1.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    pedestal.position.y = 1;
    group.add(pedestal);

    // Top sculpture
    const sculpture = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xccccaa,
        metalness: 0.3,
        roughness: 0.5
      })
    );
    sculpture.position.y = 2;
    group.add(sculpture);

    return group;
  }

  // ==================== STOREFRONTS (NYC Chain Restaurants) ====================
  private createStorefronts(): void {
    // Define storefront locations - spread throughout the city
    const storefrontConfigs: { type: Storefront['type']; positions: { x: number; z: number; rotation: number }[] }[] = [
      {
        type: 'mcdonalds',
        positions: [
          { x: 0, z: 50, rotation: 0 },
          { x: -100, z: 0, rotation: Math.PI / 2 },
          { x: 150, z: -50, rotation: Math.PI }
        ]
      },
      {
        type: 'starbucks',
        positions: [
          { x: 50, z: 0, rotation: -Math.PI / 2 },
          { x: -50, z: 100, rotation: 0 },
          { x: 0, z: -100, rotation: Math.PI },
          { x: 100, z: 100, rotation: -Math.PI / 2 }
        ]
      },
      {
        type: 'subway',
        positions: [
          { x: -50, z: -50, rotation: Math.PI / 2 },
          { x: 100, z: 50, rotation: -Math.PI / 2 }
        ]
      },
      {
        type: 'dunkin',
        positions: [
          { x: 50, z: -100, rotation: 0 },
          { x: -100, z: -100, rotation: Math.PI / 2 }
        ]
      },
      {
        type: 'pizzeria',
        positions: [
          { x: 0, z: 0, rotation: 0 },
          { x: -50, z: 50, rotation: Math.PI },
          { x: 100, z: -100, rotation: -Math.PI / 2 }
        ]
      },
      {
        type: 'bodega',
        positions: [
          { x: 25, z: 25, rotation: -Math.PI / 2 },
          { x: -75, z: 25, rotation: Math.PI / 2 },
          { x: 75, z: -25, rotation: 0 },
          { x: -25, z: -75, rotation: Math.PI }
        ]
      },
      {
        type: 'deli',
        positions: [
          { x: -25, z: 75, rotation: 0 },
          { x: 75, z: 75, rotation: -Math.PI / 2 }
        ]
      }
    ];

    storefrontConfigs.forEach(config => {
      config.positions.forEach(pos => {
        const storefront = this.createStorefront(config.type);
        storefront.mesh.position.set(pos.x + 12, 0, pos.z);
        storefront.mesh.rotation.y = pos.rotation;
        storefront.position.set(pos.x + 12, 0, pos.z);
        this.detailsGroup.add(storefront.mesh);
        this.storefronts.push(storefront);
      });
    });
  }

  private createStorefront(type: Storefront['type']): Storefront {
    const group = new THREE.Group();

    // Brand colors and details
    const brandConfigs: Record<Storefront['type'], {
      primaryColor: number;
      secondaryColor: number;
      signText: string;
      awningColor: number;
    }> = {
      mcdonalds: { primaryColor: 0xff0000, secondaryColor: 0xffcc00, signText: "M", awningColor: 0xcc0000 },
      starbucks: { primaryColor: 0x00704a, secondaryColor: 0xffffff, signText: "★", awningColor: 0x00704a },
      subway: { primaryColor: 0x008c15, secondaryColor: 0xffc600, signText: "S", awningColor: 0x008c15 },
      dunkin: { primaryColor: 0xff6e00, secondaryColor: 0xff00ff, signText: "DD", awningColor: 0xff6e00 },
      pizzeria: { primaryColor: 0xcc0000, secondaryColor: 0xffffff, signText: "PIZZA", awningColor: 0xcc0000 },
      bodega: { primaryColor: 0x228822, secondaryColor: 0xffff00, signText: "24H", awningColor: 0x228822 },
      deli: { primaryColor: 0x8b4513, secondaryColor: 0xffffff, signText: "DELI", awningColor: 0x8b4513 }
    };

    const config = brandConfigs[type];

    // Building facade
    const facadeWidth = type === 'mcdonalds' ? 8 : (type === 'bodega' || type === 'deli' ? 5 : 6);
    const facadeHeight = type === 'mcdonalds' ? 6 : 4;

    const facade = new THREE.Mesh(
      new THREE.BoxGeometry(facadeWidth, facadeHeight, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 })
    );
    facade.position.y = facadeHeight / 2;
    group.add(facade);

    // Storefront glass windows
    const windowWidth = facadeWidth - 1;
    const windowHeight = 2.5;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(windowWidth, windowHeight, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.5,
        roughness: 0.1
      })
    );
    glass.position.set(0, windowHeight / 2 + 0.3, 0.2);
    group.add(glass);

    // Door
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x666666,
        transparent: true,
        opacity: 0.6
      })
    );
    door.position.set(facadeWidth / 2 - 1, 1.1, 0.2);
    group.add(door);

    // Door handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.3, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 })
    );
    handle.position.set(facadeWidth / 2 - 0.6, 1.1, 0.3);
    group.add(handle);

    // Awning
    const awningDepth = 1.5;
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(facadeWidth + 0.5, 0.15, awningDepth),
      new THREE.MeshStandardMaterial({ color: config.awningColor, roughness: 0.7 })
    );
    awning.position.set(0, facadeHeight - 0.5, awningDepth / 2);
    group.add(awning);

    // Awning stripes (for some stores)
    if (type === 'pizzeria' || type === 'deli') {
      for (let i = 0; i < 5; i++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.02, awningDepth + 0.1),
          new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        stripe.position.set(-facadeWidth / 2 + 0.8 + i * ((facadeWidth - 1) / 4), facadeHeight - 0.42, awningDepth / 2);
        group.add(stripe);
      }
    }

    // Brand sign (illuminated)
    const signWidth = type === 'mcdonalds' ? 3 : (config.signText.length * 0.8 + 1);
    const signHeight = 1.2;
    const signBacking = new THREE.Mesh(
      new THREE.BoxGeometry(signWidth, signHeight, 0.2),
      new THREE.MeshStandardMaterial({ color: config.primaryColor, roughness: 0.4 })
    );
    signBacking.position.set(0, facadeHeight + signHeight / 2 + 0.2, 0.1);
    group.add(signBacking);

    // Sign text/logo (glowing)
    const signLogo = new THREE.Mesh(
      new THREE.BoxGeometry(signWidth - 0.4, signHeight - 0.3, 0.1),
      new THREE.MeshStandardMaterial({
        color: config.secondaryColor,
        emissive: config.secondaryColor,
        emissiveIntensity: 2
      })
    );
    signLogo.position.set(0, facadeHeight + signHeight / 2 + 0.2, 0.2);
    group.add(signLogo);

    // Special additions per type
    if (type === 'mcdonalds') {
      // Golden arches
      this.addGoldenArches(group, facadeHeight + 2);
    } else if (type === 'starbucks') {
      // Circular logo
      const logo = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 24),
        new THREE.MeshStandardMaterial({
          color: 0x00704a,
          emissive: 0x00704a,
          emissiveIntensity: 1
        })
      );
      logo.position.set(0, facadeHeight + 0.8, 0.3);
      group.add(logo);
    } else if (type === 'bodega' || type === 'deli') {
      // Produce/products display outside
      this.addStorefrontProducts(group, type);
    } else if (type === 'pizzeria') {
      // Pizza slice sign
      const pizzaSlice = this.createPizzaSliceSign();
      pizzaSlice.position.set(-facadeWidth / 2 - 0.3, 3, 0.5);
      group.add(pizzaSlice);
    }

    // Interior visible through window (basic)
    this.addStorefrontInterior(group, type, facadeWidth, facadeHeight);

    return {
      mesh: group,
      type,
      position: new THREE.Vector3()
    };
  }

  private addGoldenArches(group: THREE.Group, height: number): void {
    const archMaterial = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5
    });

    // Left arch
    const leftArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.12, 8, 16, Math.PI),
      archMaterial
    );
    leftArch.rotation.z = Math.PI;
    leftArch.position.set(-0.4, height, 0.3);
    group.add(leftArch);

    // Right arch
    const rightArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.12, 8, 16, Math.PI),
      archMaterial
    );
    rightArch.rotation.z = Math.PI;
    rightArch.position.set(0.4, height, 0.3);
    group.add(rightArch);

    // Connecting legs
    [-0.95, -0.15, 0.15, 0.95].forEach(x => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8),
        archMaterial
      );
      leg.position.set(x, height - 0.4, 0.3);
      group.add(leg);
    });
  }

  private addStorefrontProducts(group: THREE.Group, type: 'bodega' | 'deli'): void {
    // Outside produce stand
    const standMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 0.6),
      standMaterial
    );
    stand.position.set(-1.5, 0.4, 1);
    group.add(stand);

    // Products on stand (colorful boxes representing fruits/vegetables)
    const productColors = [0xff0000, 0x00ff00, 0xffff00, 0xff8800, 0x00ffff];
    for (let i = 0; i < 8; i++) {
      const product = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 + Math.random() * 0.2, 0.15, 0.2),
        new THREE.MeshStandardMaterial({
          color: productColors[Math.floor(Math.random() * productColors.length)],
          roughness: 0.8
        })
      );
      product.position.set(-2 + i * 0.25, 0.9, 1);
      group.add(product);
    }

    // Ice cooler for drinks (bodega)
    if (type === 'bodega') {
      const cooler = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.6, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4 })
      );
      cooler.position.set(1.5, 0.3, 0.8);
      group.add(cooler);

      // Ice cubes visible
      const ice = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.1, 0.4),
        new THREE.MeshStandardMaterial({
          color: 0xaaddff,
          transparent: true,
          opacity: 0.7
        })
      );
      ice.position.set(1.5, 0.55, 0.8);
      group.add(ice);
    }
  }

  private createPizzaSliceSign(): THREE.Group {
    const group = new THREE.Group();

    // Pizza slice shape (triangle)
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.8, 1.2);
    shape.lineTo(-0.8, 1.2);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    const slice = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xffcc66,
        emissive: 0xffaa00,
        emissiveIntensity: 0.5
      })
    );
    group.add(slice);

    // Pepperoni dots
    [[-0.2, 0.6], [0.2, 0.7], [0, 0.4]].forEach(([x, y]) => {
      const pepperoni = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0xcc3300 })
      );
      pepperoni.position.set(x, y, 0.11);
      group.add(pepperoni);
    });

    return group;
  }

  private addStorefrontInterior(group: THREE.Group, type: Storefront['type'], width: number, _height: number): void {
    // Simple interior elements visible through window

    // Floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.4, 0.05, 3),
      new THREE.MeshStandardMaterial({ color: 0x444444 })
    );
    floor.position.set(0, 0.025, -1.5);
    group.add(floor);

    // Counter
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(width - 1, 1.1, 0.6),
      new THREE.MeshStandardMaterial({
        color: type === 'mcdonalds' ? 0xcc0000 :
               type === 'starbucks' ? 0x5c3d2e :
               type === 'pizzeria' ? 0x8b4513 : 0x666666
      })
    );
    counter.position.set(0, 0.55, -2);
    group.add(counter);

    // Menu board (back wall)
    const menuBoard = new THREE.Mesh(
      new THREE.BoxGeometry(width - 1.5, 1.5, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: type === 'mcdonalds' ? 0x331100 : 0x111111,
        emissiveIntensity: 0.3
      })
    );
    menuBoard.position.set(0, 2.5, -2.9);
    group.add(menuBoard);

    // Tables and chairs (for dine-in places)
    if (type !== 'bodega' && type !== 'deli') {
      for (let i = 0; i < 2; i++) {
        const table = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12),
          new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        table.position.set(-width / 4 + i * (width / 2), 0.75, -0.8);
        group.add(table);

        // Table leg
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        leg.position.set(-width / 4 + i * (width / 2), 0.35, -0.8);
        group.add(leg);
      }
    }
  }

  // ==================== STREET VENDORS ====================
  private createStreetVendors(): void {
    const vendorTypes: StreetVendor['type'][] = ['hotdog', 'pretzel', 'icecream', 'coffee', 'fruit'];

    // Strategic vendor positions near intersections and busy areas
    const vendorPositions = [
      { x: 10, z: 10 },
      { x: -40, z: 20 },
      { x: 60, z: -30 },
      { x: -20, z: -60 },
      { x: 30, z: 80 },
      { x: -80, z: 40 },
      { x: 90, z: 10 },
      { x: 20, z: -90 },
      { x: -60, z: -40 },
      { x: 40, z: 50 }
    ];

    vendorPositions.forEach((pos, i) => {
      const type = vendorTypes[i % vendorTypes.length];
      const vendor = this.createStreetVendor(type);
      vendor.mesh.position.set(pos.x, 0, pos.z);
      vendor.mesh.rotation.y = Math.random() * Math.PI * 2;
      this.detailsGroup.add(vendor.mesh);
      this.streetVendors.push(vendor);
    });
  }

  private createStreetVendor(type: StreetVendor['type']): StreetVendor {
    const group = new THREE.Group();

    switch (type) {
      case 'hotdog':
        this.createHotdogCart(group);
        break;
      case 'pretzel':
        this.createPretzelCart(group);
        break;
      case 'icecream':
        this.createIcecreamCart(group);
        break;
      case 'coffee':
        this.createCoffeeCart(group);
        break;
      case 'fruit':
        this.createFruitCart(group);
        break;
    }

    return { mesh: group, type };
  }

  private createHotdogCart(group: THREE.Group): void {
    // Classic NYC hot dog cart
    const cartMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 });

    // Main cart body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1, 0.9),
      cartMaterial
    );
    body.position.y = 0.9;
    group.add(body);

    // Umbrella
    const umbrella = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    umbrella.position.set(0, 2.3, 0);
    group.add(umbrella);

    // Umbrella pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8),
      metalMaterial
    );
    pole.position.set(0, 1.75, 0);
    group.add(pole);

    // Hot dogs on grill (visible)
    for (let i = 0; i < 6; i++) {
      const hotdog = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: 0xcc6633 })
      );
      hotdog.rotation.z = Math.PI / 2;
      hotdog.position.set(-0.5 + i * 0.2, 1.45, 0);
      group.add(hotdog);
    }

    // Wheels
    [-0.7, 0.7].forEach(x => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.2, 0.5);
      group.add(wheel);
    });

    // Handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.04, 0.04),
      metalMaterial
    );
    handle.position.set(0, 1, -0.6);
    group.add(handle);

    // "HOT DOGS" sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.25, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.3
      })
    );
    sign.position.set(0, 1.55, 0.48);
    group.add(sign);
  }

  private createPretzelCart(group: THREE.Group): void {
    const cartMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7 });

    // Cart body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.8),
      cartMaterial
    );
    body.position.y = 0.7;
    group.add(body);

    // Glass display case
    const displayCase = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.6, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.4
      })
    );
    displayCase.position.set(0, 1.4, 0);
    group.add(displayCase);

    // Pretzel display rack
    const rack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8),
      metalMaterial
    );
    rack.position.set(0, 1.85, 0);
    group.add(rack);

    // Pretzels on rack (torus shapes)
    for (let i = 0; i < 4; i++) {
      const pretzel = new THREE.Mesh(
        new THREE.TorusGeometry(0.08, 0.025, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xcc8844 })
      );
      pretzel.position.set(0, 1.5 + i * 0.12, 0.15);
      group.add(pretzel);
    }

    // Wheels
    this.addCartWheels(group, 0.5);

    // Sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffcc00 })
    );
    sign.position.set(0, 1.8, 0.35);
    group.add(sign);
  }

  private createIcecreamCart(group: THREE.Group): void {
    const cartMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // Freezer body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1, 0.8),
      cartMaterial
    );
    body.position.y = 0.8;
    group.add(body);

    // Colorful stripes
    const stripeColors = [0xff69b4, 0x87ceeb, 0x98fb98];
    stripeColors.forEach((color, i) => {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.52, 0.15, 0.02),
        new THREE.MeshStandardMaterial({ color })
      );
      stripe.position.set(0, 0.5 + i * 0.25, 0.41);
      group.add(stripe);
    });

    // Ice cream cone decoration on top
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xdeb887 })
    );
    cone.position.set(0.5, 1.5, 0);
    cone.rotation.x = Math.PI;
    group.add(cone);

    const icecream = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb6c1 })
    );
    icecream.position.set(0.5, 1.75, 0);
    group.add(icecream);

    // Umbrella
    this.addCartUmbrella(group, 0x00bfff);

    // Wheels
    this.addCartWheels(group, 0.6);
  }

  private createCoffeeCart(group: THREE.Group): void {
    const cartMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.7 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7 });

    // Cart body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.1, 0.9),
      cartMaterial
    );
    body.position.y = 0.85;
    group.add(body);

    // Coffee machine
    const machine = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.5, 0.3),
      metalMaterial
    );
    machine.position.set(-0.4, 1.65, 0);
    group.add(machine);

    // Coffee cups stack
    for (let i = 0; i < 3; i++) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.05, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      cup.position.set(0.3, 1.5 + i * 0.08, 0.2);
      group.add(cup);
    }

    // Steam effect (simple particles)
    const steamGeo = new THREE.BufferGeometry();
    const steamPositions = new Float32Array(15);
    for (let i = 0; i < 5; i++) {
      steamPositions[i * 3] = -0.4 + (Math.random() - 0.5) * 0.1;
      steamPositions[i * 3 + 1] = 2 + Math.random() * 0.3;
      steamPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    }
    steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
    const steam = new THREE.Points(
      steamGeo,
      new THREE.PointsMaterial({ color: 0xcccccc, size: 0.1, transparent: true, opacity: 0.5 })
    );
    group.add(steam);

    // "COFFEE" sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.25, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        emissive: 0x2a1708,
        emissiveIntensity: 0.3
      })
    );
    sign.position.set(0, 1.55, 0.48);
    group.add(sign);

    this.addCartWheels(group, 0.55);
  }

  private createFruitCart(group: THREE.Group): void {
    const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });

    // Cart body (open top)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 1),
      woodMaterial
    );
    body.position.y = 0.6;
    group.add(body);

    // Side rails
    [-0.88, 0.88].forEach(x => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.4, 1),
        woodMaterial
      );
      rail.position.set(x, 1.1, 0);
      group.add(rail);
    });

    // Fruit display (colorful spheres)
    const fruits = [
      { color: 0xff0000, pos: [-0.5, 1, 0.2] },    // Apple
      { color: 0xff8800, pos: [-0.2, 1, -0.2] },   // Orange
      { color: 0xffff00, pos: [0.2, 1, 0.1] },     // Lemon
      { color: 0x00ff00, pos: [0.5, 1, -0.1] },    // Lime
      { color: 0x800080, pos: [-0.3, 1, 0.3] },    // Grape
      { color: 0xff6b6b, pos: [0.1, 1.1, 0] },     // Peach
    ];

    fruits.forEach(fruit => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: fruit.color, roughness: 0.6 })
      );
      mesh.position.set(fruit.pos[0], fruit.pos[1], fruit.pos[2]);
      group.add(mesh);
    });

    // Banana bunch
    for (let i = 0; i < 4; i++) {
      const banana = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.02, 0.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe135 })
      );
      banana.rotation.z = Math.PI / 4 + i * 0.1;
      banana.position.set(-0.6 + i * 0.08, 1.05, -0.3);
      group.add(banana);
    }

    // Umbrella
    this.addCartUmbrella(group, 0xff6600);

    this.addCartWheels(group, 0.7);
  }

  private addCartWheels(group: THREE.Group, xOffset: number): void {
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    [-xOffset, xOffset].forEach(x => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16),
        wheelMaterial
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.2, 0.4);
      group.add(wheel);
    });

    // Front caster wheel
    const caster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12),
      wheelMaterial
    );
    caster.rotation.z = Math.PI / 2;
    caster.position.set(0, 0.1, -0.4);
    group.add(caster);
  }

  private addCartUmbrella(group: THREE.Group, color: number): void {
    const umbrella = new THREE.Mesh(
      new THREE.ConeGeometry(1, 0.35, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    umbrella.position.set(0, 2.2, 0);
    group.add(umbrella);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 })
    );
    pole.position.set(0, 1.6, 0);
    group.add(pole);
  }

  // ==================== UPDATE ====================
  update(deltaTime: number): void {
    // Throttle updates for performance - only update every 100ms
    this.updateAccumulator += deltaTime;
    if (this.updateAccumulator < this.updateInterval) {
      return;
    }
    const throttledDelta = this.updateAccumulator;
    this.updateAccumulator = 0;

    const timeOfDay = this.game.weather.getTimeOfDay();
    const isNight = timeOfDay < 6 || timeOfDay > 20;
    const weatherType = this.game.weather.getCurrentWeather();
    const isRaining = weatherType === 'rain' || weatherType === 'storm';

    // Check for day/night transition
    if (isNight !== this.isNightMode) {
      this.isNightMode = isNight;
      this.updateLighting(isNight);
    }

    // Check for rain changes
    if (isRaining !== this.isRaining) {
      this.isRaining = isRaining;
      this.updatePuddles(isRaining);
    }

    // Update neon signs (throttled)
    this.updateNeonSigns(throttledDelta);

    // Update billboards (throttled)
    this.updateBillboards(throttledDelta);

    // Update subway steam (throttled)
    this.updateSubwayEntrances(throttledDelta);

    // Update building detail visibility based on distance (performance optimization)
    this.updateDetailVisibility();

    this.lastTimeOfDay = timeOfDay;
  }

  private updateDetailVisibility(): void {
    const playerPos = this.game.player.position;
    const detailVisibilityDistance = 150;  // Hide details beyond this distance
    const furnitureVisibilityDistance = 200;  // Hide street furniture beyond this

    // Cull distant building details
    this.buildingDetails.forEach(detail => {
      const distance = detail.mesh.position.distanceTo(playerPos);
      detail.mesh.visible = distance < detailVisibilityDistance;
    });

    // Cull distant street furniture (but not street lamps for lighting)
    this.streetFurniture.forEach(item => {
      const distance = item.position.distanceTo(playerPos);
      item.visible = distance < furnitureVisibilityDistance;
    });
  }

  private updateLighting(isNight: boolean): void {
    // Toggle street lamps
    this.streetLamps.forEach(lamp => {
      lamp.light.intensity = isNight ? 1.5 : 0;
    });

    // Intensify neon signs at night (using emissive intensity)
    this.neonSigns.forEach(sign => {
      sign.glowMaterial.emissiveIntensity = isNight ? 4 : 2;
    });
  }

  private updateNeonSigns(deltaTime: number): void {
    this.neonSigns.forEach(sign => {
      sign.phase += deltaTime * 5;

      // Flicker effect using emissive intensity
      if (Math.random() < sign.flickerRate) {
        sign.glowMaterial.emissiveIntensity *= 0.6 + Math.random() * 0.4;
      }

      // Restore intensity gradually
      const targetIntensity = this.isNightMode ? 4 : 2;
      sign.glowMaterial.emissiveIntensity += (targetIntensity - sign.glowMaterial.emissiveIntensity) * 0.1;
    });
  }

  private updateBillboards(deltaTime: number): void {
    this.billboards.forEach(billboard => {
      billboard.animationPhase += deltaTime;

      if (billboard.type === 'flashing') {
        const flash = Math.sin(billboard.animationPhase * 3) > 0;
        billboard.material.emissiveIntensity = flash ? 2 : 0.5;
      } else if (billboard.type === 'scrolling') {
        // Color shift
        const hue = (billboard.animationPhase * 0.1) % 1;
        billboard.material.color.setHSL(hue, 0.8, 0.5);
        billboard.material.emissive.setHSL(hue, 0.8, 0.3);
      }
    });
  }

  private updateSubwayEntrances(deltaTime: number): void {
    this.subwayEntrances.forEach(entrance => {
      // Update steam particles
      const positions = entrance.steamParticles.geometry.attributes.position.array as Float32Array;
      const velocities = entrance.steamParticles.geometry.userData.velocities as Float32Array;
      const basePos = entrance.steamParticles.geometry.userData.basePosition as THREE.Vector3;

      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;
        positions[i3] += velocities[i3] * deltaTime;
        positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
        positions[i3 + 2] += velocities[i3 + 2] * deltaTime;

        // Reset particles that go too high
        if (positions[i3 + 1] > 3) {
          positions[i3] = basePos.x + (Math.random() - 0.5) * 2;
          positions[i3 + 1] = basePos.y;
          positions[i3 + 2] = basePos.z + (Math.random() - 0.5) * 1;
        }
      }
      entrance.steamParticles.geometry.attributes.position.needsUpdate = true;

      // Subway rumble sound
      entrance.soundTimer -= deltaTime;
      if (entrance.soundTimer <= 0) {
        entrance.soundTimer = 20 + Math.random() * 40;
        const playerDist = entrance.mesh.position.distanceTo(this.game.player.position);
        if (playerDist < 50) {
          this.game.audio.playSound('subway_rumble', { volume: 0.3 * (1 - playerDist / 50) });
        }
      }
    });
  }

  private updatePuddles(isRaining: boolean): void {
    if (isRaining && this.puddles.length === 0) {
      // Create puddles
      const puddleMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a5a7a,
        roughness: 0.1,
        metalness: 0.5,
        transparent: true,
        opacity: 0.6
      });

      for (let i = 0; i < 30; i++) {
        const puddle = new THREE.Mesh(
          new THREE.CircleGeometry(0.5 + Math.random() * 1.5, 16),
          puddleMaterial
        );
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(
          (Math.random() - 0.5) * 200,
          0.02,
          (Math.random() - 0.5) * 200
        );
        this.detailsGroup.add(puddle);
        this.puddles.push(puddle);
      }
    } else if (!isRaining && this.puddles.length > 0) {
      // Fade out and remove puddles
      this.puddles.forEach(puddle => {
        this.game.scene.remove(puddle);
      });
      this.puddles = [];
    }
  }

  // ==================== NYC LANDMARKS ====================
  private createNYCLandmarks(): void {
    if (this.isMobile) return;

    // Subway kiosks at key intersections
    this.createSubwayKiosks();

    // Broadway-style vertical neon signs
    this.createBroadwaySigns();

    // Taxi stands
    this.createTaxiStands();
  }

  private createSubwayKiosks(): void {
    const kioskPositions = [
      { x: 30, z: 30 },
      { x: -60, z: 45 },
      { x: 90, z: -30 },
      { x: -100, z: -80 },
      { x: 150, z: 60 },
    ];

    kioskPositions.forEach(pos => {
      const kiosk = this.createSubwayKiosk();
      kiosk.position.set(pos.x, 0, pos.z);
      this.detailsGroup.add(kiosk);
      this.streetFurniture.push(kiosk);
    });
  }

  private createSubwayKiosk(): THREE.Group {
    const group = new THREE.Group();

    // Green metal structure (classic NYC subway kiosk)
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x228B22,
      roughness: 0.5,
      metalness: 0.6
    });

    // Main booth frame
    const booth = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2.5, 1.5),
      metalMat
    );
    booth.position.y = 1.25;
    booth.castShadow = true;
    group.add(booth);

    // Glass panels
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.4,
      roughness: 0.1
    });
    const glassPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.8, 0.05),
      glassMat
    );
    glassPanel.position.set(0, 1.4, 0.73);
    group.add(glassPanel);

    // Map display (illuminated)
    const mapDisplay = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.2, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0x333322,
        emissiveIntensity: 0.5
      })
    );
    mapDisplay.position.set(0, 1.5, 0.78);
    group.add(mapDisplay);

    // "SUBWAY" header sign
    const header = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.4, 0.15),
      new THREE.MeshStandardMaterial({
        color: 0x228B22,
        emissive: 0x114411,
        emissiveIntensity: 0.4
      })
    );
    header.position.set(0, 2.7, 0);
    group.add(header);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.15, 1.8),
      metalMat
    );
    roof.position.y = 2.55;
    group.add(roof);

    return group;
  }

  private createBroadwaySigns(): void {
    // Vertical neon signs along main streets (Times Square feel)
    const signData = [
      { x: 0, z: -20, text: 'BROADWAY', color: 0xff0066 },
      { x: 55, z: 0, text: 'TIMES SQ', color: 0x00ffff },
      { x: -55, z: 45, text: 'THEATER', color: 0xffff00 },
      { x: 110, z: -55, text: 'HOTEL', color: 0xff6600 },
      { x: -110, z: 0, text: 'DINER', color: 0x00ff66 },
    ];

    signData.forEach(data => {
      const sign = this.createVerticalNeonSign(data.text, data.color);
      sign.position.set(data.x + 12, 8, data.z);
      this.detailsGroup.add(sign);
      this.streetFurniture.push(sign);
    });
  }

  private createVerticalNeonSign(text: string, color: number): THREE.Group {
    const group = new THREE.Group();

    // Backing structure
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, text.length * 1.5 + 1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
    );
    backing.castShadow = true;
    group.add(backing);

    // Border frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.15, 0.5), frameMat);
    frameTop.position.y = text.length * 0.75 + 0.6;
    group.add(frameTop);
    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.15, 0.5), frameMat);
    frameBottom.position.y = -text.length * 0.75 - 0.6;
    group.add(frameBottom);

    // Vertical neon letters
    const glowMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 2.5
    });

    for (let i = 0; i < text.length; i++) {
      const letter = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.0, 0.15),
        glowMat
      );
      letter.position.set(0, (text.length / 2 - i - 0.5) * 1.3, 0.25);
      group.add(letter);
    }

    return group;
  }

  private createTaxiStands(): void {
    const standPositions = [
      { x: 25, z: 0 },
      { x: -80, z: 60 },
      { x: 120, z: -40 },
    ];

    standPositions.forEach(pos => {
      const stand = this.createTaxiStand();
      stand.position.set(pos.x, 0, pos.z);
      this.detailsGroup.add(stand);
      this.streetFurniture.push(stand);
    });
  }

  private createTaxiStand(): THREE.Group {
    const group = new THREE.Group();

    // Yellow taxi stand sign pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 })
    );
    pole.position.y = 1.25;
    group.add(pole);

    // Yellow "TAXI" sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.4, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        emissive: 0x665500,
        emissiveIntensity: 0.3
      })
    );
    sign.position.y = 2.6;
    group.add(sign);

    return group;
  }

  // ==================== DISTRICT ATMOSPHERE ====================
  private createDistrictAtmosphere(): void {
    if (this.isMobile) return;

    // Residential area - street trees
    this.createResidentialTrees();

    // Industrial area - extra grit
    this.createIndustrialGrit();
  }

  private createResidentialTrees(): void {
    // Street trees in residential area (west side)
    for (let x = -5; x <= -3; x++) {
      for (let z = -6; z <= 6; z++) {
        if (Math.random() > 0.4) continue;

        const baseX = x * 45;
        const baseZ = z * 45;

        const tree = this.createStreetTree();
        tree.position.set(baseX + 8, 0, baseZ + (Math.random() - 0.5) * 30);
        this.detailsGroup.add(tree);
        this.streetFurniture.push(tree);
      }
    }
  }

  private createStreetTree(): THREE.Group {
    const group = new THREE.Group();

    // Tree grate (metal)
    const grate = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.9, 4),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.7 })
    );
    grate.rotation.x = -Math.PI / 2;
    grate.rotation.z = Math.PI / 4;
    grate.position.y = 0.02;
    group.add(grate);

    // Tree trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.15, 3, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 })
    );
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    group.add(trunk);

    // Canopy (multiple layers for fullness)
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.8 });

    const mainCanopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 8),
      canopyMat
    );
    mainCanopy.position.y = 4;
    mainCanopy.scale.y = 0.7;
    mainCanopy.castShadow = true;
    group.add(mainCanopy);

    // Secondary canopy for fullness
    const secondCanopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 6, 6),
      canopyMat
    );
    secondCanopy.position.set(0.5, 3.5, 0.3);
    secondCanopy.scale.y = 0.6;
    group.add(secondCanopy);

    return group;
  }

  private createIndustrialGrit(): void {
    // Industrial area (east side) - dumpsters and chain link fences
    for (let x = 4; x <= 7; x++) {
      for (let z = -6; z <= 6; z++) {
        const baseX = x * 50;
        const baseZ = z * 50;

        // Dumpsters
        if (Math.random() > 0.5) {
          const dumpster = this.createDumpster();
          dumpster.position.set(baseX + 15, 0, baseZ + (Math.random() - 0.5) * 20);
          dumpster.rotation.y = Math.random() * Math.PI;
          this.detailsGroup.add(dumpster);
          this.streetFurniture.push(dumpster);
        }

        // Chain link fence sections
        if (Math.random() > 0.65) {
          const fence = this.createChainLinkFence();
          fence.position.set(baseX + 20, 0, baseZ);
          this.detailsGroup.add(fence);
          this.streetFurniture.push(fence);
        }
      }
    }
  }

  private createDumpster(): THREE.Group {
    const group = new THREE.Group();
    const color = Math.random() > 0.5 ? 0x2a5a2a : 0x1a3a6a;

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });

    // Main body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.5, 2),
      bodyMat
    );
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);

    // Lid (slightly open)
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 0.1, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 })
    );
    lid.position.set(0, 1.55, -0.3);
    lid.rotation.x = Math.random() > 0.4 ? 0.4 : 0; // Some lids open
    group.add(lid);

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wheelPositions = [[-1.2, 0.15, 0.9], [1.2, 0.15, 0.9]];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8),
        wheelMat
      );
      wheel.position.set(wx, wy, wz);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    });

    return group;
  }

  private createChainLinkFence(): THREE.Group {
    const group = new THREE.Group();

    // Fence posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 });
    const postGeom = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6);

    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(postGeom, postMat);
      post.position.set(i * 2.5, 1.25, 0);
      group.add(post);
    }

    // Fence mesh (simplified as a plane)
    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      metalness: 0.4
    });
    const fenceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 2),
      fenceMat
    );
    fenceMesh.position.set(3.75, 1.25, 0);
    group.add(fenceMesh);

    // Top rail
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 7.5, 6),
      postMat
    );
    rail.position.set(3.75, 2.3, 0);
    rail.rotation.z = Math.PI / 2;
    group.add(rail);

    return group;
  }

  // ==================== STREET ATMOSPHERE ====================
  private createStreetAtmosphere(): void {
    if (this.isMobile) return;

    // Street litter
    this.createStreetLitter();

    // Posters on lamp posts
    this.createStreetPosters();
  }

  private createStreetLitter(): void {
    // Scattered newspapers, coffee cups, bags
    const litterMaterials = {
      paper: new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.9 }),
      cup: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      bag: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }),
    };

    // Scatter litter across the city
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 400;

      // Newspaper
      if (Math.random() > 0.6) {
        const paper = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.01, 0.4),
          litterMaterials.paper
        );
        paper.position.set(x, 0.01, z);
        paper.rotation.y = Math.random() * Math.PI;
        paper.rotation.x = (Math.random() - 0.5) * 0.2;
        this.detailsGroup.add(paper);
      }

      // Coffee cup
      if (Math.random() > 0.75) {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.025, 0.12, 8),
          litterMaterials.cup
        );
        cup.position.set(x + 0.5, 0.06, z);
        cup.rotation.x = Math.PI / 2;
        cup.rotation.z = Math.random() * Math.PI;
        this.detailsGroup.add(cup);
      }

      // Plastic bag (crumpled)
      if (Math.random() > 0.8) {
        const bag = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.1, 0),
          litterMaterials.bag
        );
        bag.position.set(x + 1, 0.1, z + 0.5);
        bag.scale.set(1, 0.5, 1);
        this.detailsGroup.add(bag);
      }
    }
  }

  private createStreetPosters(): void {
    // Colorful posters on lamp posts
    const posterColors = [0xff6600, 0x0066ff, 0xff0066, 0xffff00, 0x00ff66];

    this.streetLamps.forEach((lamp, i) => {
      if (Math.random() > 0.6) {
        const poster = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.5, 0.01),
          new THREE.MeshStandardMaterial({
            color: posterColors[i % posterColors.length],
            roughness: 0.8
          })
        );
        poster.position.copy(lamp.mesh.position);
        poster.position.y = 2;
        poster.position.x += 0.15;
        this.detailsGroup.add(poster);
      }
    });
  }

  /**
   * Mark all static city detail objects for rendering optimization
   */
  optimizeStaticObjects(): void {
    let count = 0;

    const markStatic = (obj: THREE.Object3D) => {
      obj.traverse(child => {
        child.userData.isStatic = true;
        child.matrixAutoUpdate = false;
        child.updateMatrix();
        child.updateMatrixWorld(true);
        count++;
      });
    };

    // Street furniture is static
    this.streetFurniture.forEach(markStatic);

    // Building details are static
    this.buildingDetails.forEach(d => markStatic(d.mesh));

    // Puddles are static
    this.puddles.forEach(markStatic);

    // Storefronts are static
    this.storefronts.forEach(s => markStatic(s.mesh));

    // Street vendors are static (they don't actually move in this implementation)
    this.streetVendors.forEach(v => markStatic(v.mesh));

    console.log(`✅ Marked ${count} city detail objects as static`);
  }

  dispose(): void {
    this.streetFurniture.forEach(item => this.game.scene.remove(item));
    this.neonSigns.forEach(sign => this.game.scene.remove(sign.mesh));
    this.billboards.forEach(bb => this.game.scene.remove(bb.mesh));
    this.subwayEntrances.forEach(se => this.game.scene.remove(se.mesh));
    this.streetLamps.forEach(lamp => this.game.scene.remove(lamp.mesh));
    this.buildingDetails.forEach(detail => this.game.scene.remove(detail.mesh));
    this.puddles.forEach(puddle => this.game.scene.remove(puddle));
    this.storefronts.forEach(store => this.game.scene.remove(store.mesh));
    this.streetVendors.forEach(vendor => this.game.scene.remove(vendor.mesh));
  }
}
