import * as THREE from 'three';
import { Vehicle, VehicleConfig, VehicleType } from '@/types';
import { Game } from '@/core/Game';
import { RapierVehicle } from '@/physics/RapierVehiclePhysics';

const VEHICLE_CONFIGS: VehicleConfig[] = [
  {
    id: 'sports_car',
    name: 'Infernus',
    type: 'car',
    maxSpeed: 220,
    acceleration: 45, // Fast sports car
    braking: 60,
    handling: 0.85,
    mass: 1200,
    health: 1000,
    seats: 2,
    hasRadio: true,
    color: 0xff0000
  },
  {
    id: 'sedan',
    name: 'Admiral',
    type: 'car',
    maxSpeed: 180,
    acceleration: 32, // Decent acceleration
    braking: 45,
    handling: 0.7,
    mass: 1400,
    health: 1200,
    seats: 4,
    hasRadio: true,
    color: 0x333333
  },
  {
    id: 'muscle_car',
    name: 'Stallion',
    type: 'car',
    maxSpeed: 200,
    acceleration: 40, // Powerful muscle car
    braking: 50,
    handling: 0.6,
    mass: 1500,
    health: 1100,
    seats: 2,
    hasRadio: true,
    color: 0x0066ff
  },
  {
    id: 'truck',
    name: 'Mule',
    type: 'truck',
    maxSpeed: 140,
    acceleration: 20, // Heavy but still responsive
    braking: 35,
    handling: 0.4,
    mass: 4000,
    health: 2000,
    seats: 2,
    hasRadio: true,
    color: 0xcccccc
  },
  {
    id: 'motorcycle',
    name: 'PCJ-600',
    type: 'motorcycle',
    maxSpeed: 240,
    acceleration: 55, // Fastest acceleration
    braking: 70,
    handling: 0.95,
    mass: 250,
    health: 500,
    seats: 2,
    hasRadio: false,
    color: 0x111111
  }
];

export class VehicleManager {
  private game: Game;
  private vehicles: Map<string, Vehicle> = new Map();
  private vehicleIdCounter: number = 0;
  private garageVehicles: string[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  async initialize(): Promise<void> {
    this.spawnInitialVehicles();
  }

  private spawnInitialVehicles(): void {
    // Spawn height for RaycastVehicle - high enough to fall onto wheels
    // Chassis shape is at y+0.5 with half-height 0.25, so bottom is at y+0.25
    // Wheels extend down from y=0, with suspension rest length ~0.3-0.4
    const spawnPoints = [
      { x: 10, y: 1.5, z: 10, rotation: 0 },
      { x: -15, y: 1.5, z: 20, rotation: Math.PI / 2 },
      { x: 25, y: 1.5, z: -10, rotation: Math.PI },
      { x: -30, y: 1.5, z: -20, rotation: -Math.PI / 2 },
      { x: 50, y: 1.5, z: 30, rotation: Math.PI / 4 }
    ];

    spawnPoints.forEach((point, index) => {
      const configIndex = index % VEHICLE_CONFIGS.length;
      this.spawnVehicle(
        VEHICLE_CONFIGS[configIndex],
        new THREE.Vector3(point.x, point.y, point.z),
        point.rotation
      );
    });
  }

  spawnVehicle(
    config: VehicleConfig,
    position: THREE.Vector3,
    rotation: number = 0
  ): Vehicle {
    const id = `vehicle_${this.vehicleIdCounter++}`;

    const mesh = this.createVehicleMesh(config);
    mesh.position.copy(position);
    mesh.rotation.y = rotation;

    // Create Rapier vehicle
    const rapierVehicle = this.game.vehiclePhysics.createVehicle(
      id,
      config.type,
      position,
      rotation,
      config.mass
    );

    const vehicle: Vehicle = {
      id,
      config,
      mesh,
      rapierVehicle,
      currentSpeed: 0,
      health: config.health,
      fuel: 100,
      driver: null,
      passengers: [],
      wheels: [],
      lights: this.createVehicleLights(mesh, config),
      destroyed: false
    };

    this.createWheels(vehicle, config, rapierVehicle);
    this.game.scene.add(mesh);
    this.vehicles.set(id, vehicle);

    return vehicle;
  }

  private createVehicleMesh(config: VehicleConfig): THREE.Group {
    const group = new THREE.Group();
    const dim = this.getVehicleDimensions(config.type);

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.25,
      metalness: 0.85
    });

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: 0.4
    });

    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.1,
      metalness: 1.0
    });

    const blackTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.5,
      metalness: 0.3
    });

    if (config.type === 'motorcycle') {
      this.createMotorcycleMesh(group, config, dim);
    } else if (config.type === 'truck') {
      this.createTruckMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial);
    } else {
      // Create detailed car based on config id
      if (config.id === 'sports_car') {
        this.createSportsCarMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial, blackTrimMaterial);
      } else if (config.id === 'muscle_car') {
        this.createMuscleCarMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial, blackTrimMaterial);
      } else {
        this.createSedanMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial, blackTrimMaterial);
      }
    }

    // Create wheels
    const wheelPositions = this.getWheelPositions(config.type, dim);
    wheelPositions.forEach((pos, index) => {
      const wheelGroup = this.createDetailedWheel(config.type === 'truck' ? 0.45 : 0.32);
      wheelGroup.position.copy(pos);
      wheelGroup.name = `wheel_${index}`;
      group.add(wheelGroup);
    });

    return group;
  }

  private createDetailedWheel(radius: number): THREE.Group {
    const wheelGroup = new THREE.Group();

    // Tire
    const tireGeometry = new THREE.TorusGeometry(radius, radius * 0.35, 16, 32);
    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
      metalness: 0.1
    });
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Rim
    const rimGeometry = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, radius * 0.3, 16);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.2,
      metalness: 0.9
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    // Hub cap
    const hubGeometry = new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, radius * 0.35, 8);
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      roughness: 0.15,
      metalness: 1.0
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    return wheelGroup;
  }

  // ==================== SPORTS CAR ====================
  private createSportsCarMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number },
    bodyMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    chromeMaterial: THREE.Material,
    blackTrimMaterial: THREE.Material
  ): void {
    // Low, sleek sports car body
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-dim.width / 2, 0);
    bodyShape.lineTo(-dim.width / 2, dim.height * 0.25);
    bodyShape.lineTo(-dim.width / 2 * 0.95, dim.height * 0.35);
    bodyShape.lineTo(dim.width / 2 * 0.95, dim.height * 0.35);
    bodyShape.lineTo(dim.width / 2, dim.height * 0.25);
    bodyShape.lineTo(dim.width / 2, 0);
    bodyShape.lineTo(-dim.width / 2, 0);

    const extrudeSettings = { depth: dim.length, bevelEnabled: false };
    const bodyGeom = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    bodyGeom.translate(0, 0, -dim.length / 2);
    const body = new THREE.Mesh(bodyGeom, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Sleek sloped hood
    const hoodGeom = new THREE.BoxGeometry(dim.width * 0.92, dim.height * 0.08, dim.length * 0.35);
    const hood = new THREE.Mesh(hoodGeom, bodyMaterial);
    hood.position.set(0, dim.height * 0.38, dim.length * 0.28);
    hood.rotation.x = -0.12;
    hood.castShadow = true;
    group.add(hood);

    // Hood air intake (aggressive)
    const intakeGeom = new THREE.BoxGeometry(dim.width * 0.25, dim.height * 0.04, dim.length * 0.12);
    const intake = new THREE.Mesh(intakeGeom, blackTrimMaterial);
    intake.position.set(0, dim.height * 0.42, dim.length * 0.2);
    group.add(intake);

    // Low-profile cabin/roof (fastback style)
    const cabinGeom = new THREE.BoxGeometry(dim.width * 0.85, dim.height * 0.28, dim.length * 0.35);
    const cabin = new THREE.Mesh(cabinGeom, bodyMaterial);
    cabin.position.set(0, dim.height * 0.52, -dim.length * 0.08);
    cabin.castShadow = true;
    group.add(cabin);

    // Aggressive windshield (very sloped)
    const windshieldGeom = new THREE.BoxGeometry(dim.width * 0.78, dim.height * 0.25, 0.02);
    const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
    windshield.position.set(0, dim.height * 0.48, dim.length * 0.08);
    windshield.rotation.x = -0.65;
    group.add(windshield);

    // Rear window (fastback angle)
    const rearWindowGeom = new THREE.BoxGeometry(dim.width * 0.72, dim.height * 0.22, 0.02);
    const rearWindow = new THREE.Mesh(rearWindowGeom, glassMaterial);
    rearWindow.position.set(0, dim.height * 0.52, -dim.length * 0.2);
    rearWindow.rotation.x = 0.5;
    group.add(rearWindow);

    // Side windows (smaller for sports car)
    const sideWindowGeom = new THREE.BoxGeometry(0.02, dim.height * 0.18, dim.length * 0.2);
    [-1, 1].forEach(side => {
      const sideWindow = new THREE.Mesh(sideWindowGeom, glassMaterial);
      sideWindow.position.set(side * dim.width * 0.425, dim.height * 0.52, -dim.length * 0.05);
      group.add(sideWindow);
    });

    // Rear spoiler
    const spoilerWingGeom = new THREE.BoxGeometry(dim.width * 0.85, dim.height * 0.02, dim.length * 0.08);
    const spoilerWing = new THREE.Mesh(spoilerWingGeom, bodyMaterial);
    spoilerWing.position.set(0, dim.height * 0.48, -dim.length * 0.44);
    group.add(spoilerWing);

    // Spoiler supports
    [-1, 1].forEach(side => {
      const supportGeom = new THREE.BoxGeometry(0.03, dim.height * 0.1, 0.03);
      const support = new THREE.Mesh(supportGeom, blackTrimMaterial);
      support.position.set(side * dim.width * 0.35, dim.height * 0.42, -dim.length * 0.44);
      group.add(support);
    });

    // Trunk/rear deck
    const trunkGeom = new THREE.BoxGeometry(dim.width * 0.9, dim.height * 0.08, dim.length * 0.18);
    const trunk = new THREE.Mesh(trunkGeom, bodyMaterial);
    trunk.position.set(0, dim.height * 0.36, -dim.length * 0.38);
    group.add(trunk);

    // Aggressive front bumper with splitter
    const frontBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.12, 0.15);
    const frontBumper = new THREE.Mesh(frontBumperGeom, blackTrimMaterial);
    frontBumper.position.set(0, dim.height * 0.08, dim.length * 0.48);
    group.add(frontBumper);

    // Front splitter
    const splitterGeom = new THREE.BoxGeometry(dim.width * 1.1, 0.02, 0.12);
    const splitter = new THREE.Mesh(splitterGeom, blackTrimMaterial);
    splitter.position.set(0, dim.height * 0.02, dim.length * 0.52);
    group.add(splitter);

    // Side skirts
    [-1, 1].forEach(side => {
      const skirtGeom = new THREE.BoxGeometry(0.05, dim.height * 0.08, dim.length * 0.7);
      const skirt = new THREE.Mesh(skirtGeom, blackTrimMaterial);
      skirt.position.set(side * dim.width * 0.52, dim.height * 0.06, 0);
      group.add(skirt);
    });

    // Rear diffuser
    const diffuserGeom = new THREE.BoxGeometry(dim.width * 0.85, dim.height * 0.08, 0.12);
    const diffuser = new THREE.Mesh(diffuserGeom, blackTrimMaterial);
    diffuser.position.set(0, dim.height * 0.06, -dim.length * 0.48);
    group.add(diffuser);

    // Large grille opening
    const grilleGeom = new THREE.BoxGeometry(dim.width * 0.6, dim.height * 0.1, 0.03);
    const grille = new THREE.Mesh(grilleGeom, blackTrimMaterial);
    grille.position.set(0, dim.height * 0.2, dim.length * 0.49);
    group.add(grille);

    // Aggressive headlights (angular)
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.3,
      emissive: 0x222222
    });
    [-1, 1].forEach(side => {
      const headlightGeom = new THREE.BoxGeometry(dim.width * 0.18, dim.height * 0.05, 0.08);
      const headlight = new THREE.Mesh(headlightGeom, headlightMaterial);
      headlight.position.set(side * dim.width * 0.32, dim.height * 0.28, dim.length * 0.48);
      group.add(headlight);
    });

    // LED strip taillights
    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      roughness: 0.2,
      metalness: 0.3,
      emissive: 0x440000
    });
    const taillightGeom = new THREE.BoxGeometry(dim.width * 0.8, dim.height * 0.04, 0.04);
    const taillight = new THREE.Mesh(taillightGeom, taillightMaterial);
    taillight.position.set(0, dim.height * 0.32, -dim.length * 0.49);
    group.add(taillight);

    // Dual exhaust tips
    const exhaustMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9, roughness: 0.2 });
    [-1, 1].forEach(side => {
      const exhaustGeom = new THREE.CylinderGeometry(0.04, 0.05, 0.15, 12);
      const exhaust = new THREE.Mesh(exhaustGeom, exhaustMaterial);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(side * dim.width * 0.28, dim.height * 0.1, -dim.length * 0.52);
      group.add(exhaust);
    });

    // Side mirrors (aerodynamic)
    [-1, 1].forEach(side => {
      const mirrorGeom = new THREE.BoxGeometry(0.06, 0.04, 0.08);
      const mirror = new THREE.Mesh(mirrorGeom, bodyMaterial);
      mirror.position.set(side * dim.width * 0.52, dim.height * 0.45, dim.length * 0.08);
      group.add(mirror);
    });

    // Door handles (flush)
    [-1, 1].forEach(side => {
      const handleGeom = new THREE.BoxGeometry(0.01, 0.02, 0.1);
      const handle = new THREE.Mesh(handleGeom, chromeMaterial);
      handle.position.set(side * dim.width * 0.49, dim.height * 0.32, -dim.length * 0.02);
      group.add(handle);
    });
  }

  // ==================== MUSCLE CAR ====================
  private createMuscleCarMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number },
    bodyMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    chromeMaterial: THREE.Material,
    blackTrimMaterial: THREE.Material
  ): void {
    // Wide, aggressive muscle car body
    const bodyGeom = new THREE.BoxGeometry(dim.width, dim.height * 0.35, dim.length);
    const body = new THREE.Mesh(bodyGeom, bodyMaterial);
    body.position.y = dim.height * 0.2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Muscular hood with bulge
    const hoodGeom = new THREE.BoxGeometry(dim.width * 0.95, dim.height * 0.1, dim.length * 0.32);
    const hood = new THREE.Mesh(hoodGeom, bodyMaterial);
    hood.position.set(0, dim.height * 0.42, dim.length * 0.28);
    hood.rotation.x = -0.04;
    group.add(hood);

    // Hood scoop (classic muscle car style)
    const scoopGeom = new THREE.BoxGeometry(dim.width * 0.25, dim.height * 0.1, dim.length * 0.2);
    const scoop = new THREE.Mesh(scoopGeom, blackTrimMaterial);
    scoop.position.set(0, dim.height * 0.5, dim.length * 0.2);
    group.add(scoop);

    // Hood pins
    const pinMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
    [-1, 1].forEach(side => {
      const pinGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8);
      const pin = new THREE.Mesh(pinGeom, pinMaterial);
      pin.position.set(side * dim.width * 0.25, dim.height * 0.48, dim.length * 0.35);
      group.add(pin);
    });

    // Cabin (fastback style)
    const cabinGeom = new THREE.BoxGeometry(dim.width * 0.88, dim.height * 0.32, dim.length * 0.38);
    const cabin = new THREE.Mesh(cabinGeom, bodyMaterial);
    cabin.position.set(0, dim.height * 0.56, -dim.length * 0.08);
    cabin.castShadow = true;
    group.add(cabin);

    // Windshield
    const windshieldGeom = new THREE.BoxGeometry(dim.width * 0.82, dim.height * 0.28, 0.02);
    const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
    windshield.position.set(0, dim.height * 0.54, dim.length * 0.1);
    windshield.rotation.x = -0.45;
    group.add(windshield);

    // Rear window
    const rearWindowGeom = new THREE.BoxGeometry(dim.width * 0.75, dim.height * 0.24, 0.02);
    const rearWindow = new THREE.Mesh(rearWindowGeom, glassMaterial);
    rearWindow.position.set(0, dim.height * 0.56, -dim.length * 0.22);
    rearWindow.rotation.x = 0.4;
    group.add(rearWindow);

    // Side windows
    const sideWindowGeom = new THREE.BoxGeometry(0.02, dim.height * 0.2, dim.length * 0.2);
    [-1, 1].forEach(side => {
      const sideWindow = new THREE.Mesh(sideWindowGeom, glassMaterial);
      sideWindow.position.set(side * dim.width * 0.44, dim.height * 0.56, -dim.length * 0.05);
      group.add(sideWindow);
    });

    // Trunk (ducktail spoiler style)
    const trunkGeom = new THREE.BoxGeometry(dim.width * 0.92, dim.height * 0.1, dim.length * 0.2);
    const trunk = new THREE.Mesh(trunkGeom, bodyMaterial);
    trunk.position.set(0, dim.height * 0.42, -dim.length * 0.36);
    trunk.rotation.x = 0.08;
    group.add(trunk);

    // Ducktail lip
    const lipGeom = new THREE.BoxGeometry(dim.width * 0.85, dim.height * 0.03, 0.06);
    const lip = new THREE.Mesh(lipGeom, bodyMaterial);
    lip.position.set(0, dim.height * 0.46, -dim.length * 0.45);
    group.add(lip);

    // Wheel arches (flared fenders)
    const archMaterial = bodyMaterial;
    const frontArchPositions = [
      { x: -dim.width * 0.42, z: dim.length * 0.32 },
      { x: dim.width * 0.42, z: dim.length * 0.32 }
    ];
    const rearArchPositions = [
      { x: -dim.width * 0.42, z: -dim.length * 0.32 },
      { x: dim.width * 0.42, z: -dim.length * 0.32 }
    ];

    [...frontArchPositions, ...rearArchPositions].forEach(pos => {
      const archGeom = new THREE.BoxGeometry(dim.width * 0.2, dim.height * 0.15, dim.length * 0.22);
      const arch = new THREE.Mesh(archGeom, archMaterial);
      arch.position.set(pos.x, dim.height * 0.28, pos.z);
      group.add(arch);
    });

    // Front bumper (chrome)
    const frontBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.1, 0.12);
    const frontBumper = new THREE.Mesh(frontBumperGeom, chromeMaterial);
    frontBumper.position.set(0, dim.height * 0.1, dim.length * 0.48);
    group.add(frontBumper);

    // Rear bumper (chrome)
    const rearBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.1, 0.1);
    const rearBumper = new THREE.Mesh(rearBumperGeom, chromeMaterial);
    rearBumper.position.set(0, dim.height * 0.1, -dim.length * 0.48);
    group.add(rearBumper);

    // Classic grille (chrome bars)
    const grilleGeom = new THREE.BoxGeometry(dim.width * 0.55, dim.height * 0.12, 0.04);
    const grille = new THREE.Mesh(grilleGeom, chromeMaterial);
    grille.position.set(0, dim.height * 0.24, dim.length * 0.49);
    group.add(grille);

    // Round headlights (classic style)
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      roughness: 0.1,
      metalness: 0.2,
      emissive: 0x222211
    });
    [-1, 1].forEach(side => {
      const headlightGeom = new THREE.CylinderGeometry(dim.width * 0.08, dim.width * 0.08, 0.06, 16);
      const headlight = new THREE.Mesh(headlightGeom, headlightMaterial);
      headlight.rotation.x = Math.PI / 2;
      headlight.position.set(side * dim.width * 0.32, dim.height * 0.28, dim.length * 0.48);
      group.add(headlight);

      // Chrome headlight ring
      const ringGeom = new THREE.TorusGeometry(dim.width * 0.085, 0.01, 8, 24);
      const ring = new THREE.Mesh(ringGeom, chromeMaterial);
      ring.position.set(side * dim.width * 0.32, dim.height * 0.28, dim.length * 0.5);
      group.add(ring);
    });

    // Taillights (triple lights)
    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x330000
    });
    [-1, 1].forEach(side => {
      for (let i = 0; i < 3; i++) {
        const tlGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12);
        const tl = new THREE.Mesh(tlGeom, taillightMaterial);
        tl.rotation.x = Math.PI / 2;
        tl.position.set(side * (dim.width * 0.25 + i * 0.1), dim.height * 0.28, -dim.length * 0.49);
        group.add(tl);
      }
    });

    // Side exhaust (dual)
    const exhaustMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.3 });
    [-1, 1].forEach(side => {
      const exhaustGeom = new THREE.CylinderGeometry(0.04, 0.045, 0.18, 12);
      const exhaust = new THREE.Mesh(exhaustGeom, exhaustMaterial);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(side * dim.width * 0.35, dim.height * 0.08, -dim.length * 0.52);
      group.add(exhaust);
    });

    // Racing stripes (optional decorative)
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    [-1, 1].forEach(side => {
      const stripeGeom = new THREE.BoxGeometry(dim.width * 0.08, 0.01, dim.length * 0.9);
      const stripe = new THREE.Mesh(stripeGeom, stripeMaterial);
      stripe.position.set(side * dim.width * 0.15, dim.height * 0.46, 0);
      group.add(stripe);
    });

    // Side mirrors
    [-1, 1].forEach(side => {
      const mirrorGeom = new THREE.BoxGeometry(0.08, 0.06, 0.1);
      const mirror = new THREE.Mesh(mirrorGeom, chromeMaterial);
      mirror.position.set(side * dim.width * 0.55, dim.height * 0.5, dim.length * 0.12);
      group.add(mirror);
    });

    // Door handles
    [-1, 1].forEach(side => {
      const handleGeom = new THREE.BoxGeometry(0.02, 0.025, 0.1);
      const handle = new THREE.Mesh(handleGeom, chromeMaterial);
      handle.position.set(side * dim.width * 0.5, dim.height * 0.36, 0);
      group.add(handle);
    });
  }

  // ==================== SEDAN ====================
  private createSedanMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number },
    bodyMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    chromeMaterial: THREE.Material,
    blackTrimMaterial: THREE.Material
  ): void {
    // Main body (three-box design)
    const bodyGeom = new THREE.BoxGeometry(dim.width, dim.height * 0.35, dim.length);
    const body = new THREE.Mesh(bodyGeom, bodyMaterial);
    body.position.y = dim.height * 0.2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Hood (gentle slope)
    const hoodGeom = new THREE.BoxGeometry(dim.width * 0.95, dim.height * 0.1, dim.length * 0.28);
    const hood = new THREE.Mesh(hoodGeom, bodyMaterial);
    hood.position.set(0, dim.height * 0.42, dim.length * 0.3);
    hood.rotation.x = -0.06;
    hood.castShadow = true;
    group.add(hood);

    // Trunk (classic sedan profile)
    const trunkGeom = new THREE.BoxGeometry(dim.width * 0.94, dim.height * 0.1, dim.length * 0.22);
    const trunk = new THREE.Mesh(trunkGeom, bodyMaterial);
    trunk.position.set(0, dim.height * 0.42, -dim.length * 0.36);
    trunk.rotation.x = 0.04;
    trunk.castShadow = true;
    group.add(trunk);

    // Cabin/Roof (proper 4-door sedan)
    const cabinGeom = new THREE.BoxGeometry(dim.width * 0.9, dim.height * 0.34, dim.length * 0.42);
    const cabin = new THREE.Mesh(cabinGeom, bodyMaterial);
    cabin.position.set(0, dim.height * 0.58, -dim.length * 0.05);
    cabin.castShadow = true;
    group.add(cabin);

    // Windshield
    const windshieldGeom = new THREE.BoxGeometry(dim.width * 0.84, dim.height * 0.3, 0.02);
    const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
    windshield.position.set(0, dim.height * 0.56, dim.length * 0.12);
    windshield.rotation.x = -0.38;
    group.add(windshield);

    // Rear window
    const rearWindowGeom = new THREE.BoxGeometry(dim.width * 0.8, dim.height * 0.26, 0.02);
    const rearWindow = new THREE.Mesh(rearWindowGeom, glassMaterial);
    rearWindow.position.set(0, dim.height * 0.58, -dim.length * 0.22);
    rearWindow.rotation.x = 0.32;
    group.add(rearWindow);

    // Side windows (larger for sedan)
    const frontSideWindowGeom = new THREE.BoxGeometry(0.02, dim.height * 0.22, dim.length * 0.12);
    const rearSideWindowGeom = new THREE.BoxGeometry(0.02, dim.height * 0.22, dim.length * 0.14);

    [-1, 1].forEach(side => {
      // Front side windows
      const frontWindow = new THREE.Mesh(frontSideWindowGeom, glassMaterial);
      frontWindow.position.set(side * dim.width * 0.45, dim.height * 0.58, dim.length * 0.02);
      group.add(frontWindow);

      // Rear side windows
      const rearWindow = new THREE.Mesh(rearSideWindowGeom, glassMaterial);
      rearWindow.position.set(side * dim.width * 0.45, dim.height * 0.58, -dim.length * 0.12);
      group.add(rearWindow);

      // B-pillar (between windows)
      const pillarGeom = new THREE.BoxGeometry(0.04, dim.height * 0.28, 0.04);
      const pillar = new THREE.Mesh(pillarGeom, blackTrimMaterial);
      pillar.position.set(side * dim.width * 0.45, dim.height * 0.56, -dim.length * 0.04);
      group.add(pillar);
    });

    // Front bumper
    const frontBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.1, 0.14);
    const frontBumper = new THREE.Mesh(frontBumperGeom, blackTrimMaterial);
    frontBumper.position.set(0, dim.height * 0.1, dim.length * 0.48);
    group.add(frontBumper);

    // Rear bumper
    const rearBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.1, 0.12);
    const rearBumper = new THREE.Mesh(rearBumperGeom, blackTrimMaterial);
    rearBumper.position.set(0, dim.height * 0.1, -dim.length * 0.48);
    group.add(rearBumper);

    // Grille
    const grilleGeom = new THREE.BoxGeometry(dim.width * 0.5, dim.height * 0.1, 0.03);
    const grille = new THREE.Mesh(grilleGeom, chromeMaterial);
    grille.position.set(0, dim.height * 0.24, dim.length * 0.49);
    group.add(grille);

    // Headlights (rectangular modern style)
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.2,
      emissive: 0x111111
    });
    [-1, 1].forEach(side => {
      const headlightGeom = new THREE.BoxGeometry(dim.width * 0.16, dim.height * 0.07, 0.06);
      const headlight = new THREE.Mesh(headlightGeom, headlightMaterial);
      headlight.position.set(side * dim.width * 0.34, dim.height * 0.28, dim.length * 0.48);
      group.add(headlight);
    });

    // Taillights
    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x330000
    });
    [-1, 1].forEach(side => {
      const taillightGeom = new THREE.BoxGeometry(dim.width * 0.14, dim.height * 0.06, 0.04);
      const taillight = new THREE.Mesh(taillightGeom, taillightMaterial);
      taillight.position.set(side * dim.width * 0.36, dim.height * 0.3, -dim.length * 0.49);
      group.add(taillight);
    });

    // Side mirrors
    [-1, 1].forEach(side => {
      const mirrorArmGeom = new THREE.BoxGeometry(0.08, 0.02, 0.04);
      const mirrorArm = new THREE.Mesh(mirrorArmGeom, blackTrimMaterial);
      mirrorArm.position.set(side * dim.width * 0.52, dim.height * 0.52, dim.length * 0.14);
      group.add(mirrorArm);

      const mirrorHeadGeom = new THREE.BoxGeometry(0.06, 0.05, 0.08);
      const mirrorHead = new THREE.Mesh(mirrorHeadGeom, blackTrimMaterial);
      mirrorHead.position.set(side * dim.width * 0.56, dim.height * 0.52, dim.length * 0.14);
      group.add(mirrorHead);
    });

    // Door handles (4 doors)
    [-1, 1].forEach(side => {
      // Front door handle
      const frontHandleGeom = new THREE.BoxGeometry(0.015, 0.02, 0.08);
      const frontHandle = new THREE.Mesh(frontHandleGeom, chromeMaterial);
      frontHandle.position.set(side * dim.width * 0.5, dim.height * 0.36, dim.length * 0.05);
      group.add(frontHandle);

      // Rear door handle
      const rearHandle = new THREE.Mesh(frontHandleGeom, chromeMaterial);
      rearHandle.position.set(side * dim.width * 0.5, dim.height * 0.36, -dim.length * 0.1);
      group.add(rearHandle);
    });

    // Door lines (visual separation)
    [-1, 1].forEach(side => {
      const doorLineGeom = new THREE.BoxGeometry(0.01, dim.height * 0.28, 0.01);
      const doorLineMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });

      // Front door line
      const frontLine = new THREE.Mesh(doorLineGeom, doorLineMaterial);
      frontLine.position.set(side * dim.width * 0.49, dim.height * 0.35, -dim.length * 0.02);
      group.add(frontLine);
    });

    // Exhaust
    const exhaustGeom = new THREE.CylinderGeometry(0.03, 0.035, 0.12, 10);
    const exhaustMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 });
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMaterial);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(dim.width * 0.3, dim.height * 0.08, -dim.length * 0.52);
    group.add(exhaust);

    // Antenna
    const antennaGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.25, 6);
    const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const antenna = new THREE.Mesh(antennaGeom, antennaMaterial);
    antenna.position.set(-dim.width * 0.3, dim.height * 0.88, -dim.length * 0.15);
    group.add(antenna);
  }

  private createMotorcycleMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number }
  ): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.3,
      metalness: 0.8
    });

    // Main body/tank
    const tankGeom = new THREE.BoxGeometry(dim.width * 0.5, dim.height * 0.3, dim.length * 0.35);
    const tank = new THREE.Mesh(tankGeom, bodyMaterial);
    tank.position.set(0, dim.height * 0.5, dim.length * 0.1);
    tank.castShadow = true;
    group.add(tank);

    // Seat
    const seatGeom = new THREE.BoxGeometry(dim.width * 0.4, dim.height * 0.15, dim.length * 0.4);
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const seat = new THREE.Mesh(seatGeom, seatMaterial);
    seat.position.set(0, dim.height * 0.55, -dim.length * 0.15);
    group.add(seat);

    // Handlebars
    const handlebarGeom = new THREE.CylinderGeometry(0.02, 0.02, dim.width * 1.2, 8);
    const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.1 });
    const handlebar = new THREE.Mesh(handlebarGeom, chromeMaterial);
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, dim.height * 0.75, dim.length * 0.35);
    group.add(handlebar);

    // Front fork
    const forkGeom = new THREE.CylinderGeometry(0.03, 0.03, dim.height * 0.6, 8);
    const fork = new THREE.Mesh(forkGeom, chromeMaterial);
    fork.position.set(0, dim.height * 0.4, dim.length * 0.4);
    fork.rotation.x = 0.2;
    group.add(fork);

    // Engine block
    const engineGeom = new THREE.BoxGeometry(dim.width * 0.6, dim.height * 0.25, dim.length * 0.2);
    const engineMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });
    const engine = new THREE.Mesh(engineGeom, engineMaterial);
    engine.position.set(0, dim.height * 0.25, 0);
    group.add(engine);

    // Exhaust
    const exhaustGeom = new THREE.CylinderGeometry(0.04, 0.03, dim.length * 0.5, 8);
    const exhaust = new THREE.Mesh(exhaustGeom, chromeMaterial);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(dim.width * 0.35, dim.height * 0.2, -dim.length * 0.2);
    group.add(exhaust);
  }

  private createTruckMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number },
    bodyMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    chromeMaterial: THREE.Material
  ): void {
    // Cab
    const cabGeom = new THREE.BoxGeometry(dim.width, dim.height * 0.7, dim.length * 0.3);
    const cab = new THREE.Mesh(cabGeom, bodyMaterial);
    cab.position.set(0, dim.height * 0.45, dim.length * 0.3);
    cab.castShadow = true;
    group.add(cab);

    // Cargo area
    const cargoGeom = new THREE.BoxGeometry(dim.width * 0.95, dim.height * 0.8, dim.length * 0.6);
    const cargoMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 });
    const cargo = new THREE.Mesh(cargoGeom, cargoMaterial);
    cargo.position.set(0, dim.height * 0.5, -dim.length * 0.18);
    cargo.castShadow = true;
    group.add(cargo);

    // Windshield
    const windshieldGeom = new THREE.BoxGeometry(dim.width * 0.85, dim.height * 0.35, 0.03);
    const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
    windshield.position.set(0, dim.height * 0.65, dim.length * 0.44);
    windshield.rotation.x = -0.15;
    group.add(windshield);

    // Front grille
    const grilleGeom = new THREE.BoxGeometry(dim.width * 0.8, dim.height * 0.25, 0.05);
    const grille = new THREE.Mesh(grilleGeom, chromeMaterial);
    grille.position.set(0, dim.height * 0.25, dim.length * 0.48);
    group.add(grille);

    // Front bumper
    const bumperGeom = new THREE.BoxGeometry(dim.width * 1.05, dim.height * 0.12, 0.15);
    const bumperMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
    const bumper = new THREE.Mesh(bumperGeom, bumperMaterial);
    bumper.position.set(0, dim.height * 0.08, dim.length * 0.48);
    group.add(bumper);
  }

  private getVehicleDimensions(type: VehicleType): {
    width: number;
    height: number;
    length: number;
  } {
    switch (type) {
      case 'motorcycle':
        return { width: 0.8, height: 1.2, length: 2.2 };
      case 'truck':
        return { width: 2.5, height: 2.5, length: 6 };
      default:
        return { width: 2, height: 1.5, length: 4.5 };
    }
  }

  private getWheelPositions(
    type: VehicleType,
    dimensions: { width: number; height: number; length: number }
  ): THREE.Vector3[] {
    const wheelY = 0.35;
    const wheelX = dimensions.width / 2 + 0.1;
    const wheelZ = dimensions.length * 0.35;

    if (type === 'motorcycle') {
      return [
        new THREE.Vector3(0, wheelY, wheelZ),
        new THREE.Vector3(0, wheelY, -wheelZ)
      ];
    }

    return [
      new THREE.Vector3(-wheelX, wheelY, wheelZ),
      new THREE.Vector3(wheelX, wheelY, wheelZ),
      new THREE.Vector3(-wheelX, wheelY, -wheelZ),
      new THREE.Vector3(wheelX, wheelY, -wheelZ)
    ];
  }

  private createWheels(vehicle: Vehicle, config: VehicleConfig, rapierVehicle: RapierVehicle): void {
    const wheelRadius = config.type === 'truck' ? 0.45 : 0.35;
    const numWheels = rapierVehicle.controller.numWheels();

    // Create wheel meshes for each wheel in Rapier vehicle controller
    // These are added to the scene directly (not as children of vehicle mesh)
    // so they can be positioned in world space by syncWithPhysics
    for (let i = 0; i < numWheels; i++) {
      const wheelMesh = this.createDetailedWheel(wheelRadius);
      wheelMesh.name = `wheel_physics_${vehicle.id}_${i}`;

      // Add wheel to scene (will be positioned by syncWithPhysics)
      this.game.scene.add(wheelMesh);

      vehicle.wheels.push({
        mesh: wheelMesh as unknown as THREE.Mesh,
        steering: i < 2,
        powered: i >= 2 || config.type === 'motorcycle'
      });

      // Store reference in rapierVehicle for sync
      rapierVehicle.wheelMeshes.push(wheelMesh);
    }

    // Remove the static wheel meshes from vehicle mesh (they were just for visual reference)
    const wheelsToRemove: THREE.Object3D[] = [];
    vehicle.mesh.traverse((child) => {
      if (child.name.startsWith('wheel_')) {
        wheelsToRemove.push(child);
      }
    });
    wheelsToRemove.forEach(wheel => vehicle.mesh.remove(wheel));
  }

  private createVehicleLights(mesh: THREE.Group, config: VehicleConfig): Vehicle['lights'] {
    const dimensions = this.getVehicleDimensions(config.type);

    // Use simpler PointLights instead of SpotLights to reduce shader complexity
    const headlightLeft = new THREE.PointLight(0xffffcc, 1, 20);
    headlightLeft.position.set(-0.6, 0.6, dimensions.length / 2 + 0.5);
    mesh.add(headlightLeft);

    const headlightRight = new THREE.PointLight(0xffffcc, 1, 20);
    headlightRight.position.set(0.6, 0.6, dimensions.length / 2 + 0.5);
    mesh.add(headlightRight);

    // Single taillight for simplicity
    const taillightLeft = new THREE.PointLight(0xff0000, 0.3, 5);
    taillightLeft.position.set(0, 0.5, -dimensions.length / 2);
    mesh.add(taillightLeft);

    headlightLeft.visible = false;
    headlightRight.visible = false;

    return {
      headlights: [headlightLeft, headlightRight],
      taillights: [taillightLeft],
      brakeLights: [taillightLeft],
      indicators: []
    };
  }

  update(deltaTime: number): void {
    this.vehicles.forEach(vehicle => {
      this.updateVehicle(vehicle, deltaTime);

      // Check for collisions with NPCs
      if (!vehicle.destroyed && vehicle.currentSpeed > 5) {
        this.checkNPCCollisions(vehicle);
      }
    });
  }

  private checkNPCCollisions(vehicle: Vehicle): void {
    const vehiclePos = vehicle.mesh.position;
    const vehicleSpeed = vehicle.currentSpeed;

    // Get NPCs near the vehicle
    const nearbyNPCs = this.game.ai.getNPCsInRadius(vehiclePos, 3);

    nearbyNPCs.forEach(npc => {
      if (npc.isDead) return;

      const npcPos = npc.mesh.position;
      const distance = vehiclePos.distanceTo(npcPos);

      // Hit detection - closer means more likely to hit
      if (distance < 2) {
        // Calculate damage based on speed (minimum 20, scales with speed)
        const damage = Math.max(20, vehicleSpeed * 2);

        // Direction from vehicle to NPC
        const hitDirection = npcPos.clone().sub(vehiclePos).normalize();

        // Damage the NPC
        this.game.ai.damageNPC(npc.id, damage, hitDirection);

        // Play hit sound
        this.game.audio.playSound('hit');

        // If going fast enough, instant kill
        if (vehicleSpeed > 30) {
          this.game.ai.damageNPC(npc.id, 500, hitDirection);
        }

        // Increase wanted level for hitting civilians
        if (npc.config.type === 'civilian' && !npc.isDead) {
          const currentWanted = this.game.player.stats.wantedLevel;
          if (currentWanted < 2) {
            this.game.player.setWantedLevel(currentWanted + 1);
          }
        }
      }
    });
  }

  // Called after physics step to sync all vehicle meshes with physics bodies
  syncWithPhysics(): void {
    this.vehicles.forEach(vehicle => {
      if (!vehicle.destroyed) {
        // Get chassis transform from Rapier
        const transform = this.game.vehiclePhysics.getVehicleTransform(vehicle.id);
        if (transform) {
          vehicle.mesh.position.copy(transform.position);
          vehicle.mesh.quaternion.copy(transform.quaternion);
          vehicle.currentSpeed = transform.speed;
        }

        // Sync wheel meshes to Rapier vehicle wheel transforms
        const wheelTransforms = this.game.vehiclePhysics.getWheelTransforms(vehicle.id);
        wheelTransforms.forEach((wheelTransform, i) => {
          const wheelMesh = vehicle.wheels[i]?.mesh;
          if (wheelMesh) {
            wheelMesh.position.copy(wheelTransform.position);
            wheelMesh.quaternion.copy(wheelTransform.quaternion);
          }
        });
      }
    });
  }

  private updateVehicle(vehicle: Vehicle, deltaTime: number): void {
    if (vehicle.destroyed) return;

    // Wheel rotation is now handled by RaycastVehicle physics
    // No need for manual animation

    // Handle player driving input
    if (vehicle.driver?.id === 'player') {
      this.handlePlayerDriving(vehicle, deltaTime);
    }

    if (vehicle.health <= 0 && !vehicle.destroyed) {
      this.destroyVehicle(vehicle);
    }
  }

  private handlePlayerDriving(vehicle: Vehicle, _deltaTime: number): void {
    const input = this.game.input.getState();

    // Get input values
    let acceleration = 0;
    let steering = 0;

    if (input.forward) acceleration = 1;
    if (input.backward) acceleration = -1;
    if (input.left) steering = 1;
    if (input.right) steering = -1;

    // Sprint/boost - apply extra acceleration when sprinting
    const isSprinting = input.sprint && acceleration > 0;
    if (isSprinting) {
      acceleration *= 1.5; // 50% boost when sprinting
    }

    // Apply controls through Rapier vehicle physics
    const isBraking = input.handbrake || input.jump;
    this.game.vehiclePhysics.applyVehicleControls(
      vehicle.id,
      acceleration,
      steering,
      isBraking,
      vehicle.config,
      isSprinting // Pass sprint state for additional boost
    );

    // Update brake lights
    if (isBraking) {
      vehicle.lights.brakeLights.forEach(light => {
        light.intensity = 2;
      });
    } else {
      vehicle.lights.brakeLights.forEach(light => {
        light.intensity = 0;
      });
    }

    // Headlights toggle (only on keydown, not hold)
    if (input.headlights) {
      this.toggleHeadlights(vehicle);
    }

    // Horn
    if (input.horn) {
      this.game.audio.playSound('horn');
    }

    // Radio controls
    if (input.nextRadio) {
      this.game.audio.nextStation();
    }
  }

  toggleHeadlights(vehicle: Vehicle): void {
    vehicle.lights.headlights.forEach(light => {
      light.visible = !light.visible;
    });
  }

  damageVehicle(vehicleId: string, amount: number): void {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle) {
      vehicle.health -= amount;
      if (vehicle.health <= 0) {
        this.destroyVehicle(vehicle);
      }
    }
  }

  private destroyVehicle(vehicle: Vehicle): void {
    vehicle.destroyed = true;

    if (vehicle.driver?.id === 'player') {
      this.game.player.exitVehicle();
      this.game.player.takeDamage(50);
    }

    this.createExplosion(vehicle.mesh.position);

    (vehicle.mesh.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9
    });

    vehicle.lights.headlights.forEach(l => (l.visible = false));
    vehicle.lights.taillights.forEach(l => (l.intensity = 0));

    this.game.audio.playSound('explosion');
  }

  private createExplosion(position: THREE.Vector3): void {
    const explosionGeometry = new THREE.SphereGeometry(3, 16, 16);
    const explosionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    this.game.scene.add(explosion);

    const fireLight = new THREE.PointLight(0xff6600, 5, 20);
    fireLight.position.copy(position);
    this.game.scene.add(fireLight);

    setTimeout(() => {
      this.game.scene.remove(explosion);
      this.game.scene.remove(fireLight);
    }, 500);

    // Apply explosion impulse to nearby NPCs using cannon-es physics
    const impulseForce = new THREE.Vector3();
    this.game.physics.sphereCast(position, 10).forEach(body => {
      impulseForce.set(
        body.position.x - position.x,
        body.position.y - position.y,
        body.position.z - position.z
      );
      impulseForce.normalize().multiplyScalar(500);
      this.game.physics.applyImpulse(
        body.id?.toString() ?? '',
        impulseForce
      );
    });
  }

  findNearestVehicle(position: THREE.Vector3, maxDistance: number): Vehicle | null {
    let nearest: Vehicle | null = null;
    let nearestDistance = maxDistance;

    this.vehicles.forEach(vehicle => {
      if (vehicle.destroyed || vehicle.driver) return;

      const distance = position.distanceTo(vehicle.mesh.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = vehicle;
      }
    });

    return nearest;
  }

  getVehicle(id: string): Vehicle | undefined {
    return this.vehicles.get(id);
  }

  getVehicleConfigs(): VehicleConfig[] {
    return VEHICLE_CONFIGS;
  }

  getGarageVehicles(): string[] {
    return [...this.garageVehicles];
  }

  addToGarage(vehicleId: string): void {
    if (!this.garageVehicles.includes(vehicleId)) {
      this.garageVehicles.push(vehicleId);
    }
  }

  removeVehicle(id: string): void {
    const vehicle = this.vehicles.get(id);
    if (vehicle) {
      // Remove wheel meshes from scene
      vehicle.wheels.forEach(wheel => {
        this.game.scene.remove(wheel.mesh);
      });

      // Remove vehicle from Rapier physics world
      this.game.vehiclePhysics.removeVehicle(id);

      this.game.scene.remove(vehicle.mesh);
      this.vehicles.delete(id);
    }
  }

  dispose(): void {
    this.vehicles.forEach((_, id) => this.removeVehicle(id));
  }
}
