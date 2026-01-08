import * as THREE from 'three';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';
import { BuildingMetadata } from '@/world/World';

// Interior types
export interface InteriorConfig {
  id: string;
  buildingId: string;
  type: 'apartment' | 'shop' | 'warehouse';
  floors: number;
  layout: InteriorLayout;
}

export interface InteriorLayout {
  rooms: Room[];
  stairs: StairConfig[];
  doors: DoorConfig[];
  furniture: FurnitureItem[];
  props: PropItem[];
}

export interface Room {
  id: string;
  type: 'living' | 'bedroom' | 'kitchen' | 'store' | 'hallway' | 'bathroom' | 'office';
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  floor: number;
}

export interface StairConfig {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  height: number;
  width: number;
}

export interface DoorConfig {
  id: string;
  position: THREE.Vector3;
  rotation: number;
  isEntrance: boolean;
  connectsTo: string;
  buildingId?: string;
}

export interface FurnitureItem {
  type: string;
  position: THREE.Vector3;
  rotation: number;
  scale?: number;
}

export interface PropItem {
  type: string;
  position: THREE.Vector3;
  rotation: number;
  scale?: number;
}

export interface ClimbableObject {
  id: string;
  type: 'ladder' | 'ledge' | 'wall';
  position: THREE.Vector3;
  topPosition: THREE.Vector3;
  bottomPosition: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  mesh: THREE.Object3D;
}

interface EnterableBuilding {
  buildingMeta: BuildingMetadata;
  type: 'apartment' | 'shop' | 'warehouse';
  doorMarker: THREE.Group;
  doorPosition: THREE.Vector3;
}

/**
 * InteriorManager - Handles building entry, interior generation, and door triggers
 */
export class InteriorManager {
  private game: Game;
  private interiors: Map<string, InteriorConfig> = new Map();
  private activeInterior: InteriorConfig | null = null;
  private interiorScene: THREE.Group | null = null;
  private doorTriggers: Map<string, DoorConfig> = new Map();
  private climbables: Map<string, ClimbableObject> = new Map();
  private enterableBuildings: Map<string, EnterableBuilding> = new Map();
  private doorMarkers: THREE.Group[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  async initialize(): Promise<void> {
    // Wait for buildings to be created - retry if registry is empty
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 200));

      const buildingCount = this.game.world.getBuildingRegistry().size;
      console.log(`InteriorManager init attempt ${retries + 1}: Found ${buildingCount} buildings in registry`);

      if (buildingCount > 0) break;
      retries++;
    }

    // Find and register enterable buildings from actual city buildings
    this.findEnterableBuildings();

    // Generate interiors for registered buildings
    this.generateInteriors();
  }

  private findEnterableBuildings(): void {
    const buildingRegistry = this.game.world.getBuildingRegistry();
    let shopCount = 0;
    let apartmentCount = 0;
    let warehouseCount = 0;

    console.log(`Building registry has ${buildingRegistry.size} buildings`);

    // Find suitable buildings for each type
    buildingRegistry.forEach((building: BuildingMetadata, id: string) => {
      const { style, height, district } = building;

      // Shop/Bodega - brownstones are in residential district (small buildings)
      if (shopCount < 3 && height < 25 && style === 'brownstone' && district === 'residential') {
        console.log(`Found shop candidate: ${id}, style=${style}, height=${height}, district=${district}`);
        this.registerEnterableBuilding(id, building, 'shop');
        shopCount++;
      }
      // Apartment - prewar buildings in residential or uptown
      else if (apartmentCount < 2 && height >= 20 && height < 45 &&
               (style === 'prewar' || style === 'brownstone') &&
               (district === 'residential' || district === 'uptown')) {
        console.log(`Found apartment candidate: ${id}, style=${style}, height=${height}, district=${district}`);
        this.registerEnterableBuilding(id, building, 'apartment');
        apartmentCount++;
      }
      // Warehouse - industrial area
      else if (warehouseCount < 2 && style === 'warehouse' && district === 'industrial') {
        console.log(`Found warehouse candidate: ${id}, style=${style}, height=${height}, district=${district}`);
        this.registerEnterableBuilding(id, building, 'warehouse');
        warehouseCount++;
      }
    });

    // Always add buildings near spawn - prioritize closest buildings
    const totalNeeded = 10; // More enterable buildings!
    const spawn = new THREE.Vector3(0, 0, 0);

    // Sort ALL buildings by distance to spawn
    const sortedBuildings: { id: string; building: BuildingMetadata; dist: number }[] = [];

    buildingRegistry.forEach((building: BuildingMetadata, id: string) => {
      if (this.enterableBuildings.has(id)) return;
      sortedBuildings.push({
        id,
        building,
        dist: building.position.distanceTo(spawn)
      });
    });

    sortedBuildings.sort((a, b) => a.dist - b.dist);

    console.log(`Adding closest buildings to spawn (need ${totalNeeded - this.enterableBuildings.size} more)...`);

    // Add closest buildings until we have enough
    for (const { id, building, dist } of sortedBuildings) {
      if (this.enterableBuildings.size >= totalNeeded) break;

      // Determine type based on style and height
      let type: 'shop' | 'apartment' | 'warehouse' = 'shop';
      if (building.style === 'warehouse') type = 'warehouse';
      else if (building.height > 30) type = 'apartment';

      console.log(`Adding building ${id} as ${type} (dist: ${dist.toFixed(0)}, height: ${building.height.toFixed(0)})`);
      this.registerEnterableBuilding(id, building, type);
    }

    console.log(`Registered ${this.enterableBuildings.size} enterable buildings`);

    // Log all door positions for debugging
    this.doorTriggers.forEach((door, id) => {
      console.log(`Door ${id} at position: (${door.position.x.toFixed(1)}, ${door.position.y.toFixed(1)}, ${door.position.z.toFixed(1)})`);
    });
  }

  private registerEnterableBuilding(id: string, building: BuildingMetadata, type: 'apartment' | 'shop' | 'warehouse'): void {
    // Calculate door position on building front
    const doorPosition = new THREE.Vector3(
      building.position.x,
      0.5,
      building.position.z + building.depth / 2 + 0.5
    );

    // Create visible door marker
    const doorMarker = this.createDoorMarker(type);
    doorMarker.position.copy(doorPosition);
    this.game.scene.add(doorMarker);
    this.doorMarkers.push(doorMarker);

    this.enterableBuildings.set(id, {
      buildingMeta: building,
      type,
      doorMarker,
      doorPosition
    });

    // Create door trigger
    const doorConfig: DoorConfig = {
      id: `door_${id}`,
      position: doorPosition,
      rotation: 0,
      isEntrance: true,
      connectsTo: 'exterior',
      buildingId: id
    };
    this.doorTriggers.set(doorConfig.id, doorConfig);
  }

  private createDoorMarker(type: 'apartment' | 'shop' | 'warehouse'): THREE.Group {
    const marker = new THREE.Group();

    // Color based on type
    const beaconColor = type === 'shop' ? 0x00ff00 : type === 'apartment' ? 0x00aaff : 0xffaa00;

    // TALL GLOWING BEACON - visible from far away
    const beaconMat = new THREE.MeshStandardMaterial({
      color: beaconColor,
      emissive: beaconColor,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.8
    });

    // Tall beacon pillar (20 units tall!)
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 20, 8), beaconMat);
    beacon.position.set(0, 10, 0);
    marker.add(beacon);

    // Glowing sphere on top
    const topSphere = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), beaconMat);
    topSphere.position.set(0, 22, 0);
    marker.add(topSphere);

    // Rotating rings around beacon
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: beaconColor,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.6
    });

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5 + i * 0.3, 0.1, 8, 32), ringMat);
      ring.position.set(0, 5 + i * 5, 0);
      ring.rotation.x = Math.PI / 2;
      ring.userData.ringIndex = i;
      marker.add(ring);
    }

    // Ground circle indicator
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(2, 3, 32),
      new THREE.MeshStandardMaterial({
        color: beaconColor,
        emissive: beaconColor,
        emissiveIntensity: 1.0,
        side: THREE.DoubleSide
      })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.1;
    marker.add(groundRing);

    // Door frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: type === 'warehouse' ? 0x555555 : 0x4a3528,
      roughness: 0.7
    });

    // Frame
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.2), frameMat);
    frameLeft.position.set(-0.55, 1.2, 0);
    marker.add(frameLeft);

    const frameRight = frameLeft.clone();
    frameRight.position.x = 0.55;
    marker.add(frameRight);

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.15, 0.2), frameMat);
    frameTop.position.set(0, 2.35, 0);
    marker.add(frameTop);

    // Door panel
    const doorMat = new THREE.MeshStandardMaterial({
      color: type === 'shop' ? 0x2a5a2a : type === 'warehouse' ? 0x666666 : 0x6b4423,
      emissive: beaconColor,
      emissiveIntensity: 0.3,
      roughness: 0.5
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.08), doorMat);
    door.position.set(0, 1.1, 0.05);
    marker.add(door);

    // Bright point light
    const light = new THREE.PointLight(beaconColor, 3, 30);
    light.position.set(0, 10, 0);
    marker.add(light);

    // Ground light
    const groundLight = new THREE.PointLight(beaconColor, 2, 15);
    groundLight.position.set(0, 1, 2);
    marker.add(groundLight);

    // Type-specific signage
    if (type === 'shop') {
      const signMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.3
      });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.1), signMat);
      sign.position.set(0, 2.7, 0.1);
      marker.add(sign);

      // "OPEN" text representation
      const openMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const openText = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.02), openMat);
      openText.position.set(0, 2.7, 0.16);
      marker.add(openText);
    }

    return marker;
  }

  private generateInteriors(): void {
    for (const [buildingId, building] of this.enterableBuildings) {
      const config = this.createDetailedInterior(buildingId, building.type, building.buildingMeta);
      this.interiors.set(buildingId, config);
    }
  }

  private createDetailedInterior(buildingId: string, type: 'apartment' | 'shop' | 'warehouse', meta: BuildingMetadata): InteriorConfig {
    const layout = this.generateDetailedLayout(type, meta);

    return {
      id: `interior_${buildingId}`,
      buildingId,
      type,
      floors: type === 'apartment' ? 2 : 1,
      layout
    };
  }

  private generateDetailedLayout(type: 'apartment' | 'shop' | 'warehouse', meta: BuildingMetadata): InteriorLayout {
    const rooms: Room[] = [];
    const stairs: StairConfig[] = [];
    const doors: DoorConfig[] = [];
    const furniture: FurnitureItem[] = [];
    const props: PropItem[] = [];

    // Larger interiors for more spacious feel
    const baseWidth = Math.min(meta.width * 1.5, 25);
    const baseDepth = Math.min(meta.depth * 1.5, 30);

    switch (type) {
      case 'shop':
        this.generateBodegaLayout(rooms, furniture, props, baseWidth, baseDepth);
        break;
      case 'apartment':
        this.generateApartmentLayout(rooms, stairs, furniture, props, baseWidth, baseDepth);
        break;
      case 'warehouse':
        this.generateWarehouseLayout(rooms, furniture, props, baseWidth, baseDepth);
        break;
    }

    doors.push({
      id: 'entrance',
      position: new THREE.Vector3(0, 0, baseDepth / 2),
      rotation: 0,
      isEntrance: true,
      connectsTo: 'exterior'
    });

    return { rooms, stairs, doors, furniture, props };
  }

  private generateBodegaLayout(rooms: Room[], furniture: FurnitureItem[], props: PropItem[], width: number, depth: number): void {
    // Main store room - larger with higher ceiling
    rooms.push({
      id: 'main_store',
      type: 'store',
      bounds: {
        min: new THREE.Vector3(-width/2, 0, -depth/2),
        max: new THREE.Vector3(width/2, 4.5, depth/2)
      },
      floor: 0
    });

    // Counter area at entrance (larger L-shaped counter)
    furniture.push({ type: 'bodega_counter', position: new THREE.Vector3(-width/2 + 2, 0, depth/2 - 2), rotation: 0 });
    furniture.push({ type: 'bodega_counter', position: new THREE.Vector3(-width/2 + 2, 0, depth/2 - 4), rotation: 0 });

    // Cash register on counter
    props.push({ type: 'cash_register', position: new THREE.Vector3(-width/2 + 1.5, 1.05, depth/2 - 2), rotation: Math.PI });

    // Lottery machine
    props.push({ type: 'lottery_machine', position: new THREE.Vector3(-width/2 + 4, 0, depth/2 - 1.5), rotation: Math.PI });

    // Refrigerated drink cases along back wall - more coolers for larger space
    const coolerCount = Math.floor(width / 2.5);
    for (let i = 0; i < coolerCount; i++) {
      furniture.push({ type: 'drink_cooler', position: new THREE.Vector3(-width/2 + 1.5 + i * 2.2, 0, -depth/2 + 0.8), rotation: 0 });
    }

    // Multiple aisles of snack shelves
    const aisleCount = Math.floor((width - 4) / 3);
    for (let aisle = 0; aisle < aisleCount; aisle++) {
      const aisleX = -width/4 + aisle * 3;
      // Each aisle has shelves on both sides
      furniture.push({ type: 'snack_shelf', position: new THREE.Vector3(aisleX, 0, -depth/4), rotation: 0 });
      furniture.push({ type: 'snack_shelf', position: new THREE.Vector3(aisleX, 0, 0), rotation: 0 });
      furniture.push({ type: 'snack_shelf', position: new THREE.Vector3(aisleX, 0, depth/4), rotation: 0 });
    }

    // Coffee station corner
    furniture.push({ type: 'coffee_station', position: new THREE.Vector3(width/2 - 1.5, 0, -depth/2 + 1.5), rotation: -Math.PI/2 });
    furniture.push({ type: 'coffee_station', position: new THREE.Vector3(width/2 - 1.5, 0, -depth/2 + 3.5), rotation: -Math.PI/2 });

    // Slurpee/drink machines
    furniture.push({ type: 'slurpee_machine', position: new THREE.Vector3(width/2 - 1.5, 0, -depth/4), rotation: -Math.PI/2 });
    furniture.push({ type: 'slurpee_machine', position: new THREE.Vector3(width/2 - 1.5, 0, 0), rotation: -Math.PI/2 });

    // ATM near entrance
    furniture.push({ type: 'atm', position: new THREE.Vector3(width/2 - 1, 0, depth/2 - 3), rotation: Math.PI });

    // Floor items scattered around
    props.push({ type: 'wet_floor_sign', position: new THREE.Vector3(2, 0, 2), rotation: Math.random() * Math.PI });
    props.push({ type: 'trash_bin', position: new THREE.Vector3(width/2 - 1, 0, depth/2 - 1), rotation: 0 });
    props.push({ type: 'trash_bin', position: new THREE.Vector3(-width/2 + 1, 0, -depth/2 + 1), rotation: 0 });

    // Wall decorations - higher placement for taller ceiling
    props.push({ type: 'neon_open_sign', position: new THREE.Vector3(0, 3.5, depth/2 - 0.1), rotation: 0 });
    props.push({ type: 'lottery_poster', position: new THREE.Vector3(-width/2 + 0.1, 2.5, 0), rotation: Math.PI/2 });
    props.push({ type: 'lottery_poster', position: new THREE.Vector3(-width/2 + 0.1, 2.5, -depth/4), rotation: Math.PI/2 });
    props.push({ type: 'security_mirror', position: new THREE.Vector3(width/2 - 0.1, 2.8, -depth/2 + 0.5), rotation: -Math.PI/4 });

    // Ceiling items
    props.push({ type: 'ceiling_fan', position: new THREE.Vector3(0, 3.3, 0), rotation: 0 });
    props.push({ type: 'security_camera', position: new THREE.Vector3(-width/2 + 0.5, 3.2, depth/2 - 0.5), rotation: -Math.PI/4 });

    // Products on shelves (small props)
    for (let i = 0; i < 8; i++) {
      props.push({
        type: 'product_box',
        position: new THREE.Vector3(
          (Math.random() - 0.5) * (width - 2),
          0.8 + Math.floor(Math.random() * 3) * 0.4,
          (Math.random() - 0.5) * (depth - 3)
        ),
        rotation: Math.random() * Math.PI,
        scale: 0.5 + Math.random() * 0.5
      });
    }
  }

  private generateApartmentLayout(rooms: Room[], stairs: StairConfig[], furniture: FurnitureItem[], props: PropItem[], width: number, depth: number): void {
    const floorHeight = 3.5; // Taller ceilings for spacious feel

    // Ground floor - Large entry hallway/lobby
    rooms.push({
      id: 'hallway',
      type: 'hallway',
      bounds: {
        min: new THREE.Vector3(-width/3, 0, -depth/2),
        max: new THREE.Vector3(width/3, floorHeight, depth/2)
      },
      floor: 0
    });

    // Mailboxes and lobby furniture
    furniture.push({ type: 'mailboxes', position: new THREE.Vector3(-width/3 + 1, 0, depth/2 - 2), rotation: Math.PI });
    furniture.push({ type: 'lobby_bench', position: new THREE.Vector3(width/3 - 1.5, 0, depth/4), rotation: -Math.PI/2 });
    props.push({ type: 'welcome_mat', position: new THREE.Vector3(0, 0.01, depth/2 - 0.5), rotation: 0 });
    props.push({ type: 'wall_clock', position: new THREE.Vector3(width/3 - 0.1, 2.5, 0), rotation: -Math.PI/2 });
    props.push({ type: 'potted_plant', position: new THREE.Vector3(-width/3 + 0.8, 0, -depth/4), rotation: 0 });
    props.push({ type: 'potted_plant', position: new THREE.Vector3(width/3 - 0.8, 0, -depth/4), rotation: 0 });

    // Stairs to upper floor (wider, grander)
    stairs.push({
      position: new THREE.Vector3(0, 0, -depth/2 + 4),
      direction: new THREE.Vector3(0, 1, 1).normalize(),
      height: floorHeight,
      width: 2.0
    });

    // Second floor - Large living area
    rooms.push({
      id: 'living',
      type: 'living',
      bounds: {
        min: new THREE.Vector3(-width/2, floorHeight, -depth/2),
        max: new THREE.Vector3(width/4, floorHeight * 2, depth/2)
      },
      floor: 1
    });

    // Living room furniture - spread out in larger space
    furniture.push({ type: 'sectional_sofa', position: new THREE.Vector3(-width/4, floorHeight, depth/4), rotation: 0 });
    furniture.push({ type: 'coffee_table', position: new THREE.Vector3(-width/4, floorHeight, 0), rotation: 0 });
    furniture.push({ type: 'tv_stand', position: new THREE.Vector3(-width/2 + 1, floorHeight, 0), rotation: Math.PI/2 });
    furniture.push({ type: 'bookshelf', position: new THREE.Vector3(-width/2 + 1, floorHeight, -depth/2 + 2), rotation: 0 });
    furniture.push({ type: 'bookshelf', position: new THREE.Vector3(-width/2 + 1, floorHeight, -depth/2 + 4), rotation: 0 });
    furniture.push({ type: 'floor_lamp', position: new THREE.Vector3(-width/3, floorHeight, depth/2 - 2), rotation: 0 });
    furniture.push({ type: 'armchair', position: new THREE.Vector3(-width/2 + 3, floorHeight, depth/4 + 2), rotation: -Math.PI/4 });
    furniture.push({ type: 'armchair', position: new THREE.Vector3(-width/2 + 3, floorHeight, depth/4 - 2), rotation: Math.PI/4 });

    // Living room props
    props.push({ type: 'area_rug', position: new THREE.Vector3(-width/4, floorHeight + 0.01, depth/8), rotation: 0, scale: 3 });
    props.push({ type: 'potted_plant', position: new THREE.Vector3(-width/2 + 1, floorHeight, depth/2 - 1), rotation: 0 });
    props.push({ type: 'picture_frame', position: new THREE.Vector3(-width/2 + 0.1, floorHeight + 2, depth/4), rotation: Math.PI/2 });
    props.push({ type: 'picture_frame', position: new THREE.Vector3(-width/2 + 0.1, floorHeight + 2, -depth/4), rotation: Math.PI/2 });
    props.push({ type: 'remote_control', position: new THREE.Vector3(-width/4 + 0.3, floorHeight + 0.45, 0.2), rotation: Math.random() * Math.PI });
    props.push({ type: 'magazines', position: new THREE.Vector3(-width/4 - 0.3, floorHeight + 0.42, -0.2), rotation: Math.random() * 0.3 });

    // Kitchen area (right side - larger)
    rooms.push({
      id: 'kitchen',
      type: 'kitchen',
      bounds: {
        min: new THREE.Vector3(width/4, floorHeight, -depth/2),
        max: new THREE.Vector3(width/2, floorHeight * 2, 0)
      },
      floor: 1
    });

    // Kitchen furniture - full kitchen
    furniture.push({ type: 'kitchen_counter', position: new THREE.Vector3(width/2 - 0.8, floorHeight, -depth/2 + 3), rotation: -Math.PI/2 });
    furniture.push({ type: 'kitchen_counter', position: new THREE.Vector3(width/2 - 0.8, floorHeight, -depth/2 + 5), rotation: -Math.PI/2 });
    furniture.push({ type: 'stove', position: new THREE.Vector3(width/2 - 0.8, floorHeight, -depth/2 + 1.5), rotation: -Math.PI/2 });
    furniture.push({ type: 'refrigerator', position: new THREE.Vector3(width/4 + 1, floorHeight, -depth/2 + 0.8), rotation: 0 });
    furniture.push({ type: 'kitchen_island', position: new THREE.Vector3(width/3 + 1, floorHeight, -depth/4), rotation: 0 });
    furniture.push({ type: 'kitchen_table', position: new THREE.Vector3(width/3, floorHeight, -2), rotation: 0 });
    furniture.push({ type: 'kitchen_chair', position: new THREE.Vector3(width/3 - 1, floorHeight, -2), rotation: Math.PI/4 });
    furniture.push({ type: 'kitchen_chair', position: new THREE.Vector3(width/3 + 1, floorHeight, -2), rotation: -Math.PI/4 });
    furniture.push({ type: 'kitchen_chair', position: new THREE.Vector3(width/3, floorHeight, -3), rotation: 0 });
    furniture.push({ type: 'kitchen_chair', position: new THREE.Vector3(width/3, floorHeight, -1), rotation: Math.PI });

    // Kitchen props
    props.push({ type: 'dish_rack', position: new THREE.Vector3(width/2 - 0.8, floorHeight + 1, -depth/2 + 4), rotation: -Math.PI/2 });
    props.push({ type: 'microwave', position: new THREE.Vector3(width/2 - 0.8, floorHeight + 1.5, -depth/2 + 3.5), rotation: -Math.PI/2 });
    props.push({ type: 'fruit_bowl', position: new THREE.Vector3(width/3, floorHeight + 0.75, -2), rotation: 0 });
    props.push({ type: 'kitchen_towel', position: new THREE.Vector3(width/2 - 0.5, floorHeight + 0.9, -depth/2 + 2), rotation: 0 });

    // Bedroom (right back - larger master bedroom)
    rooms.push({
      id: 'bedroom',
      type: 'bedroom',
      bounds: {
        min: new THREE.Vector3(width/4, floorHeight, 1),
        max: new THREE.Vector3(width/2, floorHeight * 2, depth/2)
      },
      floor: 1
    });

    // Bedroom furniture - spacious master
    furniture.push({ type: 'bed', position: new THREE.Vector3(width/3 + 1, floorHeight, depth/2 - 2), rotation: Math.PI });
    furniture.push({ type: 'nightstand', position: new THREE.Vector3(width/4 + 1, floorHeight, depth/2 - 1.5), rotation: 0 });
    furniture.push({ type: 'nightstand', position: new THREE.Vector3(width/2 - 2, floorHeight, depth/2 - 1.5), rotation: 0 });
    furniture.push({ type: 'dresser', position: new THREE.Vector3(width/2 - 0.8, floorHeight, depth/4), rotation: -Math.PI/2 });
    furniture.push({ type: 'wardrobe', position: new THREE.Vector3(width/4 + 0.8, floorHeight, 2), rotation: Math.PI/2 });
    furniture.push({ type: 'vanity', position: new THREE.Vector3(width/2 - 0.8, floorHeight, depth/2 - 4), rotation: -Math.PI/2 });

    // Bedroom props
    props.push({ type: 'alarm_clock', position: new THREE.Vector3(width/4 + 1, floorHeight + 0.55, depth/2 - 1.2), rotation: Math.PI });
    props.push({ type: 'lamp', position: new THREE.Vector3(width/2 - 2, floorHeight + 0.55, depth/2 - 1.2), rotation: 0 });
    props.push({ type: 'pillow', position: new THREE.Vector3(width/3 + 0.5, floorHeight + 0.6, depth/2 - 1.2), rotation: 0.1 });
    props.push({ type: 'pillow', position: new THREE.Vector3(width/3 + 1.5, floorHeight + 0.6, depth/2 - 1.2), rotation: -0.1 });
    props.push({ type: 'blanket', position: new THREE.Vector3(width/3 + 1, floorHeight + 0.5, depth/2 - 2), rotation: 0 });
    props.push({ type: 'area_rug', position: new THREE.Vector3(width/3 + 1, floorHeight + 0.01, depth/4), rotation: 0, scale: 2 });

    // Bathroom (small room off bedroom)
    rooms.push({
      id: 'bathroom',
      type: 'bathroom',
      bounds: {
        min: new THREE.Vector3(width/4, floorHeight, depth/2 - 6),
        max: new THREE.Vector3(width/4 + 4, floorHeight * 2, depth/2 - 2)
      },
      floor: 1
    });

    // Bathroom furniture
    furniture.push({ type: 'toilet', position: new THREE.Vector3(width/4 + 1, floorHeight, depth/2 - 5), rotation: Math.PI/2 });
    furniture.push({ type: 'sink_vanity', position: new THREE.Vector3(width/4 + 3, floorHeight, depth/2 - 5), rotation: Math.PI/2 });
    furniture.push({ type: 'bathtub', position: new THREE.Vector3(width/4 + 2, floorHeight, depth/2 - 3), rotation: 0 });
    props.push({ type: 'bathroom_mirror', position: new THREE.Vector3(width/4 + 3, floorHeight + 1.5, depth/2 - 5.9), rotation: 0 });
    props.push({ type: 'towel_rack', position: new THREE.Vector3(width/4 + 0.5, floorHeight + 1.2, depth/2 - 4), rotation: Math.PI/2 });
  }

  private generateWarehouseLayout(rooms: Room[], furniture: FurnitureItem[], props: PropItem[], width: number, depth: number): void {
    const ceilingHeight = 12; // Tall industrial ceiling

    // Large open warehouse floor
    rooms.push({
      id: 'main_floor',
      type: 'store',
      bounds: {
        min: new THREE.Vector3(-width/2, 0, -depth/2),
        max: new THREE.Vector3(width/2, ceilingHeight, depth/2)
      },
      floor: 0
    });

    // Office area in corner (larger)
    rooms.push({
      id: 'office',
      type: 'office',
      bounds: {
        min: new THREE.Vector3(-width/2, 0, -depth/2),
        max: new THREE.Vector3(-width/2 + 6, 3.5, -depth/2 + 6)
      },
      floor: 0
    });

    // Office furniture - more complete office
    furniture.push({ type: 'office_desk', position: new THREE.Vector3(-width/2 + 3, 0, -depth/2 + 3), rotation: 0 });
    furniture.push({ type: 'office_chair', position: new THREE.Vector3(-width/2 + 3, 0, -depth/2 + 2), rotation: Math.PI });
    furniture.push({ type: 'filing_cabinet', position: new THREE.Vector3(-width/2 + 0.8, 0, -depth/2 + 0.8), rotation: 0 });
    furniture.push({ type: 'filing_cabinet', position: new THREE.Vector3(-width/2 + 0.8, 0, -depth/2 + 2), rotation: 0 });
    furniture.push({ type: 'office_shelf', position: new THREE.Vector3(-width/2 + 5, 0, -depth/2 + 0.8), rotation: 0 });
    props.push({ type: 'computer', position: new THREE.Vector3(-width/2 + 3, 0.75, -depth/2 + 3), rotation: 0 });
    props.push({ type: 'desk_lamp', position: new THREE.Vector3(-width/2 + 3.5, 0.75, -depth/2 + 3.3), rotation: 0 });
    props.push({ type: 'papers', position: new THREE.Vector3(-width/2 + 2.5, 0.76, -depth/2 + 2.8), rotation: Math.random() * 0.5 });
    props.push({ type: 'coffee_mug', position: new THREE.Vector3(-width/2 + 2, 0.76, -depth/2 + 3.2), rotation: 0 });
    props.push({ type: 'whiteboard', position: new THREE.Vector3(-width/2 + 0.1, 1.5, -depth/2 + 4), rotation: Math.PI/2 });

    // Mezzanine level above office
    rooms.push({
      id: 'mezzanine',
      type: 'office',
      bounds: {
        min: new THREE.Vector3(-width/2, 4, -depth/2),
        max: new THREE.Vector3(-width/2 + 8, 7, -depth/2 + 8)
      },
      floor: 1
    });
    furniture.push({ type: 'storage_shelf', position: new THREE.Vector3(-width/2 + 2, 4, -depth/2 + 2), rotation: 0 });
    furniture.push({ type: 'storage_shelf', position: new THREE.Vector3(-width/2 + 2, 4, -depth/2 + 5), rotation: 0 });

    // Industrial shelving units - more rows for larger space
    const shelfRows = Math.floor(width / 6);
    for (let i = 0; i < shelfRows; i++) {
      furniture.push({
        type: 'industrial_shelf',
        position: new THREE.Vector3(-width/2 + 8 + i * 5, 0, -depth/2 + 3),
        rotation: 0
      });
      furniture.push({
        type: 'industrial_shelf',
        position: new THREE.Vector3(-width/2 + 8 + i * 5, 0, -depth/4),
        rotation: 0
      });
      furniture.push({
        type: 'industrial_shelf',
        position: new THREE.Vector3(-width/2 + 8 + i * 5, 0, depth/4),
        rotation: 0
      });
      furniture.push({
        type: 'industrial_shelf',
        position: new THREE.Vector3(-width/2 + 8 + i * 5, 0, depth/2 - 3),
        rotation: Math.PI
      });
    }

    // Pallets and crates scattered - more for larger space
    const crateCount = Math.floor((width * depth) / 40);
    for (let i = 0; i < crateCount; i++) {
      const x = (Math.random() - 0.5) * (width - 8);
      const z = (Math.random() - 0.5) * (depth - 8);

      // Avoid office area
      if (x < -width/2 + 10 && z < -depth/2 + 10) continue;

      if (Math.random() > 0.5) {
        furniture.push({
          type: 'pallet',
          position: new THREE.Vector3(x, 0, z),
          rotation: Math.random() * Math.PI / 2
        });
        // Stack crates on some pallets - taller stacks possible
        if (Math.random() > 0.3) {
          const stackHeight = Math.floor(Math.random() * 5) + 1;
          for (let j = 0; j < stackHeight; j++) {
            props.push({
              type: 'wooden_crate',
              position: new THREE.Vector3(x, 0.15 + j * 0.8, z),
              rotation: Math.random() * 0.2
            });
          }
        }
      } else {
        furniture.push({
          type: 'barrel',
          position: new THREE.Vector3(x, 0, z),
          rotation: 0
        });
      }
    }

    // Multiple forklifts
    furniture.push({ type: 'forklift', position: new THREE.Vector3(width/2 - 4, 0, 0), rotation: Math.PI/2 });
    furniture.push({ type: 'forklift', position: new THREE.Vector3(width/2 - 4, 0, depth/3), rotation: Math.PI });

    // Industrial props
    props.push({ type: 'fire_extinguisher', position: new THREE.Vector3(-width/2 + 0.3, 0, 0), rotation: 0 });
    props.push({ type: 'fire_extinguisher', position: new THREE.Vector3(width/2 - 0.3, 0, 0), rotation: Math.PI });
    props.push({ type: 'safety_sign', position: new THREE.Vector3(-width/2 + 0.1, 2.5, depth/2 - 2), rotation: Math.PI/2 });
    props.push({ type: 'safety_sign', position: new THREE.Vector3(width/2 - 0.1, 2.5, -depth/2 + 2), rotation: -Math.PI/2 });
    props.push({ type: 'exit_sign', position: new THREE.Vector3(0, ceilingHeight - 0.5, depth/2 - 0.1), rotation: 0 });
    props.push({ type: 'exit_sign', position: new THREE.Vector3(0, ceilingHeight - 0.5, -depth/2 + 0.1), rotation: Math.PI });

    // Loading dock doors (back wall) - multiple doors
    props.push({ type: 'loading_door', position: new THREE.Vector3(-width/4, 0, -depth/2 + 0.1), rotation: 0 });
    props.push({ type: 'loading_door', position: new THREE.Vector3(width/4, 0, -depth/2 + 0.1), rotation: 0 });

    // Hanging industrial lights - more for larger space
    const lightCount = Math.floor(width / 5);
    for (let i = 0; i < lightCount; i++) {
      for (let j = 0; j < 3; j++) {
        props.push({
          type: 'industrial_light',
          position: new THREE.Vector3(-width/2 + 4 + i * 5, ceilingHeight - 1, -depth/3 + j * (depth/3)),
          rotation: 0
        });
      }
    }

    // Oil stains on floor - more stains
    for (let i = 0; i < 10; i++) {
      props.push({
        type: 'oil_stain',
        position: new THREE.Vector3(
          (Math.random() - 0.5) * width * 0.8,
          0.01,
          (Math.random() - 0.5) * depth * 0.8
        ),
        rotation: Math.random() * Math.PI * 2,
        scale: 0.5 + Math.random() * 2
      });
    }

    // Floor markings for forklift lanes
    props.push({ type: 'floor_marking', position: new THREE.Vector3(width/2 - 5, 0.02, 0), rotation: 0, scale: 3 });
    props.push({ type: 'floor_marking', position: new THREE.Vector3(width/2 - 5, 0.02, depth/3), rotation: 0, scale: 3 });
  }

  findNearestDoor(position: THREE.Vector3, maxDistance: number): DoorConfig | null {
    let nearest: DoorConfig | null = null;
    let nearestDist = maxDistance;

    if (this.doorTriggers.size === 0) {
      console.log('No door triggers registered!');
    }

    for (const [id, door] of this.doorTriggers) {
      const dist = position.distanceTo(door.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = door;
      }
    }

    return nearest;
  }

  enterBuilding(buildingId: string): boolean {
    const config = this.interiors.get(buildingId);
    if (!config) {
      console.warn(`No interior found for building: ${buildingId}`);
      return false;
    }

    this.activeInterior = config;
    this.interiorScene = this.createInteriorMesh(config);
    this.interiorScene.position.set(0, -100, 0);
    this.game.scene.add(this.interiorScene);

    // Hide exterior city elements
    this.hideExterior();

    // Hide door markers while inside
    this.doorMarkers.forEach(m => m.visible = false);

    globalEvents.emit('building_enter', { buildingId });
    return true;
  }

  private hideExterior(): void {
    // Hide world elements (buildings, roads, ground)
    this.game.world.getWorldGroup().visible = false;

    // Hide city details (props, signs, etc)
    this.game.cityDetails.getDetailsGroup().visible = false;

    // Hide traffic
    if (this.game.traffic) {
      this.game.traffic.setVisible(false);
    }

    // Hide NPCs/pedestrians
    if (this.game.ai) {
      this.game.ai.setVisible(false);
    }
  }

  private showExterior(): void {
    // Show world elements
    this.game.world.getWorldGroup().visible = true;

    // Show city details
    this.game.cityDetails.getDetailsGroup().visible = true;

    // Show traffic
    if (this.game.traffic) {
      this.game.traffic.setVisible(true);
    }

    // Show NPCs/pedestrians
    if (this.game.ai) {
      this.game.ai.setVisible(true);
    }
  }

  exitBuilding(): THREE.Vector3 {
    if (this.interiorScene) {
      this.game.scene.remove(this.interiorScene);
      this.interiorScene = null;
    }

    const buildingId = this.activeInterior?.buildingId;
    this.activeInterior = null;

    // Show exterior city elements again
    this.showExterior();

    // Show door markers again
    this.doorMarkers.forEach(m => m.visible = true);

    globalEvents.emit('building_exit', { buildingId });

    const building = buildingId ? this.enterableBuildings.get(buildingId) : null;
    if (building) {
      return building.doorPosition.clone().add(new THREE.Vector3(0, 0.5, 1));
    }

    return new THREE.Vector3(0, 1, 0);
  }

  getInteriorSpawnPosition(): THREE.Vector3 {
    if (!this.activeInterior || !this.interiorScene) {
      return new THREE.Vector3(0, -99, 0);
    }

    const entrance = this.activeInterior.layout.doors.find(d => d.isEntrance);
    if (entrance) {
      return this.interiorScene.position.clone().add(entrance.position).add(new THREE.Vector3(0, 1, -2));
    }

    return this.interiorScene.position.clone().add(new THREE.Vector3(0, 1, 0));
  }

  private createInteriorMesh(config: InteriorConfig): THREE.Group {
    const interior = new THREE.Group();
    interior.name = `interior_${config.buildingId}`;

    // Get materials based on type
    const materials = this.getInteriorMaterials(config.type);

    // Create rooms
    for (const room of config.layout.rooms) {
      const roomGroup = this.createDetailedRoom(room, materials, config.type);
      interior.add(roomGroup);
    }

    // Create stairs
    for (const stair of config.layout.stairs) {
      interior.add(this.createStairsMesh(stair));
    }

    // Create furniture
    for (const item of config.layout.furniture) {
      const mesh = this.createFurnitureMesh(item);
      if (mesh) {
        mesh.position.copy(item.position);
        mesh.rotation.y = item.rotation;
        if (item.scale) mesh.scale.setScalar(item.scale);
        interior.add(mesh);
      }
    }

    // Create props
    for (const prop of config.layout.props) {
      const mesh = this.createPropMesh(prop);
      if (mesh) {
        mesh.position.copy(prop.position);
        mesh.rotation.y = prop.rotation;
        if (prop.scale) mesh.scale.setScalar(prop.scale);
        interior.add(mesh);
      }
    }

    // Enhanced lighting
    this.addInteriorLighting(interior, config);

    return interior;
  }

  private getInteriorMaterials(type: 'apartment' | 'shop' | 'warehouse'): {
    floor: THREE.Material;
    wall: THREE.Material;
    ceiling: THREE.Material;
    trim: THREE.Material;
  } {
    switch (type) {
      case 'shop':
        return {
          floor: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 }), // Linoleum
          wall: new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 }),
          ceiling: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
          trim: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5 })
        };
      case 'apartment':
        return {
          floor: new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 }), // Hardwood
          wall: new THREE.MeshStandardMaterial({ color: 0xf0e6d3, roughness: 0.85 }),
          ceiling: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
          trim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
        };
      case 'warehouse':
        return {
          floor: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.95 }), // Concrete
          wall: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }),
          ceiling: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.95 }),
          trim: new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.3 })
        };
    }
  }

  private createDetailedRoom(
    room: Room,
    materials: { floor: THREE.Material; wall: THREE.Material; ceiling: THREE.Material; trim: THREE.Material },
    type: 'apartment' | 'shop' | 'warehouse'
  ): THREE.Group {
    const roomGroup = new THREE.Group();
    roomGroup.name = room.id;

    const size = room.bounds.max.clone().sub(room.bounds.min);
    const center = room.bounds.min.clone().add(size.clone().multiplyScalar(0.5));

    // Floor with pattern for certain types
    const floorGeom = new THREE.PlaneGeometry(size.x, size.z, 4, 4);
    const floor = new THREE.Mesh(floorGeom, materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, room.bounds.min.y + 0.01, center.z);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Ceiling with tiles for shop
    const ceilingGeom = new THREE.PlaneGeometry(size.x, size.z);
    const ceiling = new THREE.Mesh(ceilingGeom, materials.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(center.x, room.bounds.max.y - 0.01, center.z);
    roomGroup.add(ceiling);

    // Walls with baseboards
    const wallHeight = size.y;
    const wallThickness = 0.15;

    // Back wall
    this.createWallWithTrim(roomGroup, materials, size.x, wallHeight,
      new THREE.Vector3(center.x, center.y, room.bounds.min.z), 0);

    // Front wall with door
    this.createWallWithDoor(roomGroup, materials, size.x, wallHeight,
      new THREE.Vector3(center.x, center.y, room.bounds.max.z), Math.PI);

    // Side walls
    this.createWallWithTrim(roomGroup, materials, size.z, wallHeight,
      new THREE.Vector3(room.bounds.min.x, center.y, center.z), Math.PI / 2);
    this.createWallWithTrim(roomGroup, materials, size.z, wallHeight,
      new THREE.Vector3(room.bounds.max.x, center.y, center.z), -Math.PI / 2);

    return roomGroup;
  }

  private createWallWithTrim(
    group: THREE.Group,
    materials: { wall: THREE.Material; trim: THREE.Material },
    width: number,
    height: number,
    position: THREE.Vector3,
    rotation: number
  ): void {
    const wallGeom = new THREE.BoxGeometry(width, height, 0.15);
    const wall = new THREE.Mesh(wallGeom, materials.wall);
    wall.position.copy(position);
    wall.rotation.y = rotation;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // Baseboard
    const baseGeom = new THREE.BoxGeometry(width, 0.1, 0.02);
    const baseboard = new THREE.Mesh(baseGeom, materials.trim);
    baseboard.position.copy(position);
    baseboard.position.y = position.y - height / 2 + 0.05;
    baseboard.position.z += (rotation === 0 ? 0.08 : rotation === Math.PI ? -0.08 : 0);
    baseboard.position.x += (rotation === Math.PI / 2 ? 0.08 : rotation === -Math.PI / 2 ? -0.08 : 0);
    baseboard.rotation.y = rotation;
    group.add(baseboard);
  }

  private createWallWithDoor(
    group: THREE.Group,
    materials: { wall: THREE.Material; trim: THREE.Material },
    width: number,
    height: number,
    position: THREE.Vector3,
    rotation: number
  ): void {
    const doorWidth = 1.2;
    const doorHeight = 2.2;

    // Left section
    const leftWidth = (width - doorWidth) / 2;
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(leftWidth, height, 0.15),
      materials.wall
    );
    leftWall.position.set(
      position.x - doorWidth / 2 - leftWidth / 2,
      position.y,
      position.z
    );
    leftWall.rotation.y = rotation;
    group.add(leftWall);

    // Right section
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(leftWidth, height, 0.15),
      materials.wall
    );
    rightWall.position.set(
      position.x + doorWidth / 2 + leftWidth / 2,
      position.y,
      position.z
    );
    rightWall.rotation.y = rotation;
    group.add(rightWall);

    // Above door
    const topWall = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + 0.2, height - doorHeight, 0.15),
      materials.wall
    );
    topWall.position.set(
      position.x,
      position.y + doorHeight / 2,
      position.z
    );
    topWall.rotation.y = rotation;
    group.add(topWall);

    // Door frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.6 });
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorHeight, 0.18), frameMat);
    frameLeft.position.set(position.x - doorWidth / 2, position.y - (height - doorHeight) / 2, position.z);
    frameLeft.rotation.y = rotation;
    group.add(frameLeft);

    const frameRight = frameLeft.clone();
    frameRight.position.x = position.x + doorWidth / 2;
    group.add(frameRight);

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.16, 0.08, 0.18), frameMat);
    frameTop.position.set(position.x, position.y - (height - doorHeight) / 2 + doorHeight, position.z);
    frameTop.rotation.y = rotation;
    group.add(frameTop);
  }

  private addInteriorLighting(interior: THREE.Group, config: InteriorConfig): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, config.type === 'warehouse' ? 0.3 : 0.5);
    interior.add(ambient);

    // Main room lights based on type
    if (config.type === 'shop') {
      // Fluorescent-style ceiling lights
      const light1 = new THREE.PointLight(0xfff5e6, 0.8, 15);
      light1.position.set(0, 3.2, 0);
      interior.add(light1);

      const light2 = new THREE.PointLight(0xfff5e6, 0.6, 10);
      light2.position.set(-2, 3.2, -2);
      interior.add(light2);
    } else if (config.type === 'apartment') {
      // Warm living room light
      const livingLight = new THREE.PointLight(0xffeedd, 0.7, 12);
      livingLight.position.set(-3, 5.5, 1);
      interior.add(livingLight);

      // Kitchen light
      const kitchenLight = new THREE.PointLight(0xffffff, 0.6, 8);
      kitchenLight.position.set(3, 5.5, -2);
      interior.add(kitchenLight);

      // Bedroom light
      const bedroomLight = new THREE.PointLight(0xffeebb, 0.4, 8);
      bedroomLight.position.set(3, 5.5, 3);
      interior.add(bedroomLight);
    } else if (config.type === 'warehouse') {
      // Industrial overhead lights
      for (let i = 0; i < 4; i++) {
        const light = new THREE.PointLight(0xffffcc, 0.5, 20);
        light.position.set(-6 + i * 4, 7, 0);
        interior.add(light);
      }
    }
  }

  private createStairsMesh(config: StairConfig): THREE.Group {
    const stairs = new THREE.Group();
    const stepCount = Math.ceil(config.height / 0.2);
    const stepHeight = config.height / stepCount;
    const stepDepth = 0.28;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });

    // Steps
    for (let i = 0; i < stepCount; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(config.width, stepHeight, stepDepth), woodMat);
      step.position.set(config.position.x, config.position.y + (i + 0.5) * stepHeight, config.position.z + i * stepDepth);
      step.castShadow = true;
      step.receiveShadow = true;
      stairs.add(step);
    }

    // Railings
    const railHeight = 0.9;
    const railLength = Math.sqrt(Math.pow(stepCount * stepDepth, 2) + Math.pow(config.height, 2));
    const railAngle = Math.atan2(config.height, stepCount * stepDepth);

    [-config.width / 2, config.width / 2].forEach(x => {
      // Handrail
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, railLength), railMat);
      rail.rotation.x = railAngle;
      rail.rotation.z = Math.PI / 2;
      rail.position.set(
        config.position.x + x,
        config.position.y + config.height / 2 + railHeight,
        config.position.z + stepCount * stepDepth / 2
      );
      stairs.add(rail);

      // Balusters
      for (let i = 0; i < stepCount; i += 2) {
        const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, railHeight), railMat);
        baluster.position.set(
          config.position.x + x,
          config.position.y + i * stepHeight + railHeight / 2,
          config.position.z + i * stepDepth
        );
        stairs.add(baluster);
      }
    });

    return stairs;
  }

  private createFurnitureMesh(item: FurnitureItem): THREE.Group | null {
    switch (item.type) {
      // Bodega furniture
      case 'bodega_counter': return this.createBodegaCounter();
      case 'drink_cooler': return this.createDrinkCooler();
      case 'snack_shelf': return this.createSnackShelf();
      case 'coffee_station': return this.createCoffeeStation();
      case 'slurpee_machine': return this.createSlurpeeMachine();
      case 'atm': return this.createATM();

      // Apartment furniture
      case 'sectional_sofa': return this.createSectionalSofa();
      case 'coffee_table': return this.createCoffeeTable();
      case 'tv_stand': return this.createTVStand();
      case 'bookshelf': return this.createBookshelf();
      case 'floor_lamp': return this.createFloorLamp();
      case 'kitchen_counter': return this.createKitchenCounter();
      case 'stove': return this.createStove();
      case 'refrigerator': return this.createRefrigerator();
      case 'kitchen_table': return this.createKitchenTable();
      case 'kitchen_chair': return this.createKitchenChair();
      case 'bed': return this.createBed();
      case 'nightstand': return this.createNightstand();
      case 'dresser': return this.createDresser();
      case 'wardrobe': return this.createWardrobe();
      case 'mailboxes': return this.createMailboxes();

      // Warehouse furniture
      case 'industrial_shelf': return this.createIndustrialShelf();
      case 'pallet': return this.createPallet();
      case 'barrel': return this.createBarrel();
      case 'forklift': return this.createForklift();
      case 'office_desk': return this.createOfficeDesk();
      case 'office_chair': return this.createOfficeChair();
      case 'filing_cabinet': return this.createFilingCabinet();

      default: return null;
    }
  }

  private createPropMesh(prop: PropItem): THREE.Group | null {
    switch (prop.type) {
      // Bodega props
      case 'cash_register': return this.createCashRegister();
      case 'lottery_machine': return this.createLotteryMachine();
      case 'wet_floor_sign': return this.createWetFloorSign();
      case 'trash_bin': return this.createTrashBin();
      case 'neon_open_sign': return this.createNeonOpenSign();
      case 'lottery_poster': return this.createPoster();
      case 'security_mirror': return this.createSecurityMirror();
      case 'ceiling_fan': return this.createCeilingFan();
      case 'security_camera': return this.createSecurityCamera();
      case 'product_box': return this.createProductBox();

      // Apartment props
      case 'area_rug': return this.createAreaRug();
      case 'potted_plant': return this.createPottedPlant();
      case 'picture_frame': return this.createPictureFrame();
      case 'remote_control': return this.createSmallProp(0x222222, 0.12, 0.02, 0.04);
      case 'magazines': return this.createMagazines();
      case 'dish_rack': return this.createDishRack();
      case 'microwave': return this.createMicrowave();
      case 'fruit_bowl': return this.createFruitBowl();
      case 'kitchen_towel': return this.createSmallProp(0xffffff, 0.3, 0.02, 0.2);
      case 'alarm_clock': return this.createAlarmClock();
      case 'lamp': return this.createTableLamp();
      case 'pillow': return this.createPillow();
      case 'blanket': return this.createBlanket();
      case 'welcome_mat': return this.createWelcomeMat();
      case 'wall_clock': return this.createWallClock();

      // Warehouse props
      case 'wooden_crate': return this.createWoodenCrate();
      case 'computer': return this.createComputer();
      case 'desk_lamp': return this.createDeskLamp();
      case 'papers': return this.createPapers();
      case 'fire_extinguisher': return this.createFireExtinguisher();
      case 'safety_sign': return this.createSafetySign();
      case 'exit_sign': return this.createExitSign();
      case 'loading_door': return this.createLoadingDoor();
      case 'industrial_light': return this.createIndustrialLight();
      case 'oil_stain': return this.createOilStain();

      default: return null;
    }
  }

  // ============ BODEGA FURNITURE ============
  private createBodegaCounter(): THREE.Group {
    const g = new THREE.Group();
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.3 });

    // Main counter
    const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.8), counterMat);
    base.position.y = 0.5;
    g.add(base);

    // Glass display case
    const glassCase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.6), glassMat);
    glassCase.position.set(-0.5, 1.2, 0);
    g.add(glassCase);

    return g;
  }

  private createDrinkCooler(): THREE.Group {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.8), metalMat);
    body.position.y = 1.1;
    g.add(body);

    // Glass doors
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.05), glassMat);
    glass.position.set(0, 1.1, 0.4);
    g.add(glass);

    // Shelves inside (visible through glass)
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let i = 0; i < 4; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.6), shelfMat);
      shelf.position.set(0, 0.4 + i * 0.5, 0);
      g.add(shelf);
    }

    return g;
  }

  private createSnackShelf(): THREE.Group {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 });

    // Uprights
    [-0.7, 0.7].forEach(x => {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.4), metalMat);
      upright.position.set(x, 0.9, 0);
      g.add(upright);
    });

    // Shelves
    for (let i = 0; i < 5; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.35), metalMat);
      shelf.position.set(0, 0.3 + i * 0.35, 0);
      g.add(shelf);
    }

    return g;
  }

  private createCoffeeStation(): THREE.Group {
    const g = new THREE.Group();
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.7 });

    // Counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.6), counterMat);
    counter.position.y = 0.45;
    g.add(counter);

    // Coffee machines
    const machineMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3 });
    for (let i = 0; i < 2; i++) {
      const machine = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), machineMat);
      machine.position.set(-0.25 + i * 0.5, 1.15, 0);
      g.add(machine);
    }

    return g;
  }

  private createSlurpeeMachine(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.6), bodyMat);
    body.position.y = 0.75;
    g.add(body);

    // Dispensers
    const dispenserMat = new THREE.MeshStandardMaterial({ color: 0x00aaff, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 3; i++) {
      const dispenser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), dispenserMat);
      dispenser.position.set(-0.25 + i * 0.25, 1.3, 0.2);
      g.add(dispenser);
    }

    return g;
  }

  private createATM(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0066aa, roughness: 0.5 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x003366, emissive: 0x001133, emissiveIntensity: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.5), bodyMat);
    body.position.y = 0.75;
    g.add(body);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), screenMat);
    screen.position.set(0, 1.1, 0.26);
    g.add(screen);

    return g;
  }

  // ============ APARTMENT FURNITURE ============
  private createSectionalSofa(): THREE.Group {
    const g = new THREE.Group();
    const fabricMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });

    // Main section
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1), fabricMat);
    seat.position.set(0, 0.3, 0);
    g.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.2), fabricMat);
    back.position.set(0, 0.7, -0.4);
    g.add(back);

    // Chaise section
    const chaise = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1.5), fabricMat);
    chaise.position.set(1.6, 0.3, 0.25);
    g.add(chaise);

    // Cushions
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), cushionMat);
      cushion.position.set(-0.7 + i * 0.7, 0.58, -0.15);
      g.add(cushion);
    }

    return g;
  }

  private createCoffeeTable(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.6 });

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), woodMat);
    top.position.y = 0.4;
    g.add(top);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
    [[-0.5, -0.25], [-0.5, 0.25], [0.5, -0.25], [0.5, 0.25]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38), legMat);
      leg.position.set(x, 0.19, z);
      g.add(leg);
    });

    return g;
  }

  private createTVStand(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 });

    // Cabinet
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.4), woodMat);
    cabinet.position.y = 0.25;
    g.add(cabinet);

    // TV
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.05), screenMat);
    tv.position.set(0, 0.9, 0);
    g.add(tv);

    return g;
  }

  private createBookshelf(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.7 });

    // Frame
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.03), woodMat);
    back.position.set(0, 1, -0.15);
    g.add(back);

    [-0.58, 0.58].forEach(x => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2, 0.35), woodMat);
      side.position.set(x, 1, 0);
      g.add(side);
    });

    // Shelves with books
    for (let i = 0; i < 5; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.03, 0.33), woodMat);
      shelf.position.set(0, 0.1 + i * 0.45, 0);
      g.add(shelf);

      // Books
      const bookCount = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < bookCount; j++) {
        const bookMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(Math.random(), 0.5, 0.4)
        });
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.03 + Math.random() * 0.02, 0.25 + Math.random() * 0.1, 0.2), bookMat);
        book.position.set(-0.45 + j * 0.12, 0.25 + i * 0.45, 0);
        g.add(book);
      }
    }

    return g;
  }

  private createFloorLamp(): THREE.Group {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.9 });

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.05), baseMat);
    base.position.y = 0.025;
    g.add(base);

    // Pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5), baseMat);
    pole.position.y = 0.8;
    g.add(pole);

    // Shade
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.3, 16, 1, true), shadeMat);
    shade.position.y = 1.55;
    g.add(shade);

    // Light
    const light = new THREE.PointLight(0xffeedd, 0.3, 5);
    light.position.y = 1.5;
    g.add(light);

    return g;
  }

  private createKitchenCounter(): THREE.Group {
    const g = new THREE.Group();
    const counterMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 });
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    // Counter top
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.6), counterMat);
    top.position.y = 0.95;
    g.add(top);

    // Base cabinets
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 0.55), cabinetMat);
    base.position.y = 0.45;
    g.add(base);

    // Sink
    const sinkMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 });
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.4), sinkMat);
    sink.position.set(0.5, 0.9, 0);
    g.add(sink);

    return g;
  }

  private createStove(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.6), bodyMat);
    body.position.y = 0.45;
    g.add(body);

    // Cooktop
    const topMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 0.6), topMat);
    top.position.y = 0.91;
    g.add(top);

    // Burners
    for (let i = 0; i < 4; i++) {
      const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16), topMat);
      burner.position.set(-0.18 + (i % 2) * 0.36, 0.92, -0.15 + Math.floor(i / 2) * 0.3);
      g.add(burner);
    }

    return g;
  }

  private createRefrigerator(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.2, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.75), bodyMat);
    body.position.y = 0.95;
    g.add(body);

    // Handle
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), handleMat);
    handle.position.set(0.38, 1.2, 0.39);
    g.add(handle);

    return g;
  }

  private createKitchenTable(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });

    const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), woodMat);
    top.position.y = 0.75;
    g.add(top);

    // Legs
    [[-0.4, -0.4], [-0.4, 0.4], [0.4, -0.4], [0.4, 0.4]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.73, 0.05), woodMat);
      leg.position.set(x, 0.365, z);
      g.add(leg);
    });

    return g;
  }

  private createKitchenChair(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });

    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), woodMat);
    seat.position.y = 0.45;
    g.add(seat);

    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.04), woodMat);
    back.position.set(0, 0.7, -0.18);
    g.add(back);

    // Legs
    [[-0.15, -0.15], [-0.15, 0.15], [0.15, -0.15], [0.15, 0.15]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.43, 0.04), woodMat);
      leg.position.set(x, 0.215, z);
      g.add(leg);
    });

    return g;
  }

  private createBed(): THREE.Group {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.7 });
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 });
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d5, roughness: 0.95 });

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 2.2), frameMat);
    frame.position.y = 0.15;
    g.add(frame);

    // Headboard
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.08), frameMat);
    headboard.position.set(0, 0.7, -1.06);
    g.add(headboard);

    // Mattress
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 2), mattressMat);
    mattress.position.y = 0.4;
    g.add(mattress);

    // Sheets
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.05, 1.5), sheetMat);
    sheet.position.set(0, 0.52, 0.2);
    g.add(sheet);

    return g;
  }

  private createNightstand(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.4), woodMat);
    body.position.y = 0.275;
    g.add(body);

    // Drawer
    const drawerMat = new THREE.MeshStandardMaterial({ color: 0x3a2718, roughness: 0.6 });
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.02), drawerMat);
    drawer.position.set(0, 0.3, 0.21);
    g.add(drawer);

    return g;
  }

  private createDresser(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.45), woodMat);
    body.position.y = 0.45;
    g.add(body);

    // Drawers
    const drawerMat = new THREE.MeshStandardMaterial({ color: 0x5a3413, roughness: 0.6 });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.02), drawerMat);
        drawer.position.set(-0.28 + col * 0.56, 0.2 + row * 0.28, 0.24);
        g.add(drawer);
      }
    }

    return g;
  }

  private createWardrobe(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.55), woodMat);
    body.position.y = 1;
    g.add(body);

    // Doors
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3023, roughness: 0.6 });
    [-0.26, 0.26].forEach(x => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.85, 0.03), doorMat);
      door.position.set(x, 1, 0.29);
      g.add(door);
    });

    return g;
  }

  private createMailboxes(): THREE.Group {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 });

    // Panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.15), metalMat);
    panel.position.y = 1;
    g.add(panel);

    // Individual boxes
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.02), metalMat);
        box.position.set(-0.32 + col * 0.32, 0.55 + row * 0.28, 0.09);
        g.add(box);
      }
    }

    return g;
  }

  // ============ WAREHOUSE FURNITURE ============
  private createIndustrialShelf(): THREE.Group {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.4 });

    // Uprights
    [[-1, -0.4], [-1, 0.4], [1, -0.4], [1, 0.4]].forEach(([x, z]) => {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3, 0.05), metalMat);
      upright.position.set(x, 1.5, z);
      g.add(upright);
    });

    // Shelves
    for (let i = 0; i < 4; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.9), metalMat);
      shelf.position.set(0, 0.3 + i * 0.85, 0);
      g.add(shelf);
    }

    return g;
  }

  private createPallet(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });

    // Top boards
    for (let i = 0; i < 5; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.15), woodMat);
      board.position.set(0, 0.12, -0.45 + i * 0.225);
      g.add(board);
    }

    // Support blocks
    for (let x = -0.45; x <= 0.45; x += 0.45) {
      for (let z = -0.35; z <= 0.35; z += 0.35) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), woodMat);
        block.position.set(x, 0.045, z);
        g.add(block);
      }
    }

    return g;
  }

  private createBarrel(): THREE.Group {
    const g = new THREE.Group();
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3366aa, metalness: 0.3, roughness: 0.5 });

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.9, 16), barrelMat);
    barrel.position.y = 0.45;
    g.add(barrel);

    return g;
  }

  private createForklift(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.5 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.5), bodyMat);
    body.position.set(0, 0.6, 0);
    g.add(body);

    // Mast
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), metalMat);
    mast.position.set(0, 1.35, 0.8);
    g.add(mast);

    // Forks
    [-0.3, 0.3].forEach(x => {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.2), metalMat);
      fork.position.set(x, 0.15, 1.3);
      g.add(fork);
    });

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]].forEach(([x, z]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.2, z);
      g.add(wheel);
    });

    return g;
  }

  private createOfficeDesk(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 });

    // Top
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.75), woodMat);
    top.position.y = 0.75;
    g.add(top);

    // Legs
    [[-0.7, -0.35], [-0.7, 0.35], [0.7, -0.35], [0.7, 0.35]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.73, 0.05), metalMat);
      leg.position.set(x, 0.365, z);
      g.add(leg);
    });

    return g;
  }

  private createOfficeChair(): THREE.Group {
    const g = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 });

    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), seatMat);
    seat.position.y = 0.5;
    g.add(seat);

    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.08), seatMat);
    back.position.set(0, 0.8, -0.2);
    g.add(back);

    // Base
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35), metalMat);
    pole.position.y = 0.28;
    g.add(pole);

    // Wheels star
    for (let i = 0; i < 5; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.04), metalMat);
      arm.rotation.y = (i * Math.PI * 2) / 5;
      arm.position.set(Math.sin((i * Math.PI * 2) / 5) * 0.12, 0.08, Math.cos((i * Math.PI * 2) / 5) * 0.12);
      g.add(arm);
    }

    return g;
  }

  private createFilingCabinet(): THREE.Group {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.5, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.6), metalMat);
    body.position.y = 0.65;
    g.add(body);

    // Drawers
    for (let i = 0; i < 4; i++) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.02), metalMat);
      drawer.position.set(0, 0.2 + i * 0.32, 0.31);
      g.add(drawer);
    }

    return g;
  }

  // ============ PROPS ============
  private createCashRegister(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.35), bodyMat);
    body.position.y = 0.125;
    g.add(body);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x001100, emissiveIntensity: 0.5 })
    );
    screen.position.set(0, 0.3, 0.1);
    screen.rotation.x = -0.3;
    g.add(screen);

    return g;
  }

  private createLotteryMachine(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.4), bodyMat);
    body.position.y = 0.6;
    g.add(body);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0000aa, emissive: 0x000033, emissiveIntensity: 0.5 })
    );
    screen.position.set(0, 0.9, 0.21);
    g.add(screen);

    return g;
  }

  private createWetFloorSign(): THREE.Group {
    const g = new THREE.Group();
    const signMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.5 });

    const sign = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), signMat);
    sign.position.y = 0.3;
    g.add(sign);

    return g;
  }

  private createTrashBin(): THREE.Group {
    const g = new THREE.Group();
    const binMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });

    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.5, 8), binMat);
    bin.position.y = 0.25;
    g.add(bin);

    return g;
  }

  private createNeonOpenSign(): THREE.Group {
    const g = new THREE.Group();
    const signMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1
    });

    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.05), signMat);
    g.add(sign);

    const light = new THREE.PointLight(0xff0000, 0.3, 3);
    light.position.z = 0.1;
    g.add(light);

    return g;
  }

  private createPoster(): THREE.Group {
    const g = new THREE.Group();
    const posterMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
      roughness: 0.9
    });

    const poster = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.01), posterMat);
    g.add(poster);

    return g;
  }

  private createSecurityMirror(): THREE.Group {
    const g = new THREE.Group();
    const mirrorMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.1
    });

    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI), mirrorMat);
    mirror.rotation.x = Math.PI / 2;
    g.add(mirror);

    return g;
  }

  private createCeilingFan(): THREE.Group {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });

    // Motor housing
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.15, 8), metalMat);
    g.add(housing);

    // Blades
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.1), metalMat);
      blade.position.x = 0.35;
      blade.rotation.y = (i * Math.PI) / 2;
      const pivot = new THREE.Group();
      pivot.add(blade);
      pivot.rotation.y = (i * Math.PI) / 2;
      g.add(pivot);
    }

    return g;
  }

  private createSecurityCamera(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.2), bodyMat);
    g.add(body);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.12;
    g.add(lens);

    return g;
  }

  private createProductBox(): THREE.Group {
    const g = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5),
      roughness: 0.8
    });

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.08), boxMat);
    g.add(box);

    return g;
  }

  private createAreaRug(): THREE.Group {
    const g = new THREE.Group();
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.95 });

    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.02, 1.8), rugMat);
    g.add(rug);

    return g;
  }

  private createPottedPlant(): THREE.Group {
    const g = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 });
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 });

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.25, 8), potMat);
    pot.position.y = 0.125;
    g.add(pot);

    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), plantMat);
    plant.position.y = 0.4;
    g.add(plant);

    return g;
  }

  private createPictureFrame(): THREE.Group {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.6 });
    const picMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.03), frameMat);
    g.add(frame);

    const pic = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.02), picMat);
    pic.position.z = 0.01;
    g.add(pic);

    return g;
  }

  private createSmallProp(color: number, w: number, h: number, d: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = h / 2;
    g.add(mesh);
    return g;
  }

  private createMagazines(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.5, 0.5),
        roughness: 0.9
      });
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.28), mat);
      mag.position.y = i * 0.012;
      mag.rotation.y = (Math.random() - 0.5) * 0.3;
      g.add(mag);
    }
    return g;
  }

  private createDishRack(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.3), mat);
    g.add(base);

    // Rack
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15), mat);
      bar.position.set(-0.15 + i * 0.06, 0.085, 0);
      g.add(bar);
    }

    return g;
  }

  private createMicrowave(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), bodyMat);
    g.add(body);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 })
    );
    door.position.set(-0.05, 0, 0.18);
    g.add(door);

    return g;
  }

  private createFruitBowl(): THREE.Group {
    const g = new THREE.Group();
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bowlMat);
    bowl.rotation.x = Math.PI;
    bowl.position.y = 0.08;
    g.add(bowl);

    // Fruit
    const fruitColors = [0xff6600, 0xffff00, 0xff0000];
    for (let i = 0; i < 4; i++) {
      const fruit = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshStandardMaterial({ color: fruitColors[i % 3], roughness: 0.7 })
      );
      fruit.position.set((Math.random() - 0.5) * 0.1, 0.12, (Math.random() - 0.5) * 0.1);
      g.add(fruit);
    }

    return g;
  }

  private createAlarmClock(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), bodyMat);
    g.add(body);

    const display = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.04, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x003300, emissiveIntensity: 0.5 })
    );
    display.position.z = 0.03;
    g.add(display);

    return g;
  }

  private createTableLamp(): THREE.Group {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.9 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.03), baseMat);
    base.position.y = 0.015;
    g.add(base);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25), baseMat);
    stem.position.y = 0.155;
    g.add(stem);

    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.12, 16, 1, true), shadeMat);
    shade.position.y = 0.34;
    g.add(shade);

    const light = new THREE.PointLight(0xffeedd, 0.2, 2);
    light.position.y = 0.3;
    g.add(light);

    return g;
  }

  private createPillow(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.95 });

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.35), mat);
    g.add(pillow);

    return g;
  }

  private createBlanket(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a6b8a, roughness: 0.95 });

    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.2), mat);
    g.add(blanket);

    return g;
  }

  private createWelcomeMat(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.95 });

    const welcomeMat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.5), mat);
    g.add(welcomeMat);

    return g;
  }

  private createWallClock(): THREE.Group {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24), frameMat);
    frame.rotation.x = Math.PI / 2;
    g.add(frame);

    const face = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), faceMat);
    face.position.z = 0.016;
    g.add(face);

    return g;
  }

  private createWoodenCrate(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), mat);
    crate.position.y = 0.3;
    g.add(crate);

    return g;
  }

  private createComputer(): THREE.Group {
    const g = new THREE.Group();
    const monitorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), monitorMat);
    monitor.position.y = 0.25;
    g.add(monitor);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.28, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x1a1a3a, emissive: 0x0a0a1a, emissiveIntensity: 0.5 })
    );
    screen.position.set(0, 0.25, 0.03);
    g.add(screen);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.15), monitorMat);
    stand.position.y = 0.04;
    g.add(stand);

    return g;
  }

  private createDeskLamp(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02), mat);
    g.add(base);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3), mat);
    arm.position.set(0, 0.15, 0);
    arm.rotation.z = -0.3;
    g.add(arm);

    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 8), mat);
    shade.position.set(0.08, 0.28, 0);
    shade.rotation.z = -0.3;
    g.add(shade);

    return g;
  }

  private createPapers(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

    for (let i = 0; i < 5; i++) {
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.002, 0.28), mat);
      paper.position.y = i * 0.003;
      paper.rotation.y = (Math.random() - 0.5) * 0.2;
      g.add(paper);
    }

    return g;
  }

  private createFireExtinguisher(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12), bodyMat);
    body.position.y = 0.2;
    g.add(body);

    const valve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7 })
    );
    valve.position.y = 0.44;
    g.add(valve);

    return g;
  }

  private createSafetySign(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.8 });

    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), mat);
    g.add(sign);

    return g;
  }

  private createExitSign(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.8
    });

    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.05), mat);
    g.add(sign);

    const light = new THREE.PointLight(0xff0000, 0.2, 5);
    light.position.z = 0.1;
    g.add(light);

    return g;
  }

  private createLoadingDoor(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.5 });

    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), mat);
    door.position.y = 2;
    g.add(door);

    // Horizontal lines
    for (let i = 0; i < 8; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
      );
      line.position.set(0, 0.5 + i * 0.45, 0.06);
      g.add(line);
    }

    return g;
  }

  private createIndustrialLight(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 });

    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.2, 8), mat);
    g.add(housing);

    const light = new THREE.PointLight(0xffffcc, 0.5, 15);
    light.position.y = -0.15;
    g.add(light);

    return g;
  }

  private createOilStain(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.6,
      roughness: 0.3
    });

    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), mat);
    stain.rotation.x = -Math.PI / 2;
    g.add(stain);

    return g;
  }

  // ============ PUBLIC API ============
  registerClimbable(climbable: ClimbableObject): void {
    this.climbables.set(climbable.id, climbable);
    climbable.mesh.userData.climbable = true;
    climbable.mesh.userData.climbableId = climbable.id;
  }

  getClimbable(id: string): ClimbableObject | undefined {
    return this.climbables.get(id);
  }

  findNearestClimbable(position: THREE.Vector3, maxDistance: number, type?: 'ladder' | 'ledge' | 'wall'): ClimbableObject | null {
    let nearest: ClimbableObject | null = null;
    let nearestDist = maxDistance;

    for (const [, climbable] of this.climbables) {
      if (type && climbable.type !== type) continue;
      const dist = position.distanceTo(climbable.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = climbable;
      }
    }

    return nearest;
  }

  isInBuilding(): boolean {
    return this.activeInterior !== null;
  }

  getCurrentInterior(): InteriorConfig | null {
    return this.activeInterior;
  }

  getInteriorScenePosition(): THREE.Vector3 {
    return this.interiorScene?.position.clone() || new THREE.Vector3(0, -100, 0);
  }

  update(deltaTime: number): void {
    // Animate door marker beacons
    const time = Date.now() * 0.002;
    this.doorMarkers.forEach(marker => {
      marker.children.forEach(child => {
        // Rotate rings
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry) {
          const ringIndex = child.userData.ringIndex || 0;
          child.rotation.z = time * (1 + ringIndex * 0.5);
        }
        // Pulse the top sphere
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
          const scale = 1 + Math.sin(time * 2) * 0.2;
          child.scale.setScalar(scale);
        }
        // Pulse the cylinder beacon
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = 1.5 + Math.sin(time * 3) * 0.5;
          }
        }
      });
    });
  }

  dispose(): void {
    if (this.interiorScene) {
      this.game.scene.remove(this.interiorScene);
    }
    this.doorMarkers.forEach(m => this.game.scene.remove(m));
    this.interiors.clear();
    this.doorTriggers.clear();
    this.climbables.clear();
    this.enterableBuildings.clear();
  }
}
