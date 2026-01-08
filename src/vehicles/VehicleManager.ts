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
    acceleration: 45,
    braking: 60,
    handling: 0.85,
    mass: 1200,
    health: 1000,
    seats: 2,
    hasRadio: true,
    color: 0xE60012 // Ferrari red
  },
  {
    id: 'sedan',
    name: 'Admiral',
    type: 'car',
    maxSpeed: 180,
    acceleration: 32,
    braking: 45,
    handling: 0.7,
    mass: 1400,
    health: 1200,
    seats: 4,
    hasRadio: true,
    color: 0x1C1C1C // Obsidian black
  },
  {
    id: 'muscle_car',
    name: 'Stallion',
    type: 'car',
    maxSpeed: 200,
    acceleration: 40,
    braking: 50,
    handling: 0.6,
    mass: 1500,
    health: 1100,
    seats: 2,
    hasRadio: true,
    color: 0x0047AB // Cobalt blue
  },
  {
    id: 'truck',
    name: 'Mule',
    type: 'truck',
    maxSpeed: 140,
    acceleration: 20,
    braking: 35,
    handling: 0.4,
    mass: 4000,
    health: 2000,
    seats: 2,
    hasRadio: true,
    color: 0xF5F5F5 // White
  },
  {
    id: 'motorcycle',
    name: 'PCJ-600',
    type: 'motorcycle',
    maxSpeed: 240,
    acceleration: 55,
    braking: 70,
    handling: 0.95,
    mass: 250,
    health: 500,
    seats: 2,
    hasRadio: false,
    color: 0xFF6B00 // Orange
  },
  {
    id: 'helicopter',
    name: 'Maverick',
    type: 'helicopter',
    maxSpeed: 180,
    acceleration: 25,
    braking: 40,
    handling: 0.8,
    mass: 2500,
    health: 1500,
    seats: 4,
    hasRadio: true,
    color: 0x2C3E50 // Dark blue-gray
  },
  {
    id: 'airplane',
    name: 'Dodo',
    type: 'airplane',
    maxSpeed: 250,
    acceleration: 35,
    braking: 30,
    handling: 0.6,
    mass: 3000,
    health: 1200,
    seats: 2,
    hasRadio: true,
    color: 0xECF0F1 // Light gray/white
  }
];

export class VehicleManager {
  private game: Game;
  private vehicles: Map<string, Vehicle> = new Map();
  private vehicleIdCounter: number = 0;
  private garageVehicles: string[] = [];

  // Input state tracking to prevent per-frame triggering
  private lastHornState: boolean = false;
  private lastHeadlightState: boolean = false;
  private lastRadioState: boolean = false;

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
    const groundVehicleSpawns = [
      { x: 10, y: 1.5, z: 10, rotation: 0 },
      { x: -15, y: 1.5, z: 20, rotation: Math.PI / 2 },
      { x: 25, y: 1.5, z: -10, rotation: Math.PI },
      { x: -30, y: 1.5, z: -20, rotation: -Math.PI / 2 },
      { x: 50, y: 1.5, z: 30, rotation: Math.PI / 4 }
    ];

    // Spawn ground vehicles
    const groundConfigs = VEHICLE_CONFIGS.filter(c =>
      c.type !== 'helicopter' && c.type !== 'airplane'
    );
    groundVehicleSpawns.forEach((point, index) => {
      const configIndex = index % groundConfigs.length;
      this.spawnVehicle(
        groundConfigs[configIndex],
        new THREE.Vector3(point.x, point.y, point.z),
        point.rotation
      );
    });

    // Spawn helicopter on rooftop helipad
    const helicopterConfig = VEHICLE_CONFIGS.find(c => c.type === 'helicopter');
    if (helicopterConfig) {
      this.spawnVehicle(
        helicopterConfig,
        new THREE.Vector3(80, 35, 80), // On top of a building
        0
      );
      // Second helicopter near industrial area
      this.spawnVehicle(
        helicopterConfig,
        new THREE.Vector3(-100, 15, -50),
        Math.PI / 2
      );
    }

    // Spawn airplane at airstrip (flat area)
    const airplaneConfig = VEHICLE_CONFIGS.find(c => c.type === 'airplane');
    if (airplaneConfig) {
      this.spawnVehicle(
        airplaneConfig,
        new THREE.Vector3(150, 2, -100), // East side "airstrip"
        0
      );
    }
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

    // Premium car paint material with clearcoat effect
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.15,
      metalness: 0.9,
      envMapIntensity: 1.2
    });

    // Tinted glass with realistic transparency
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x446688,
      roughness: 0.02,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
      envMapIntensity: 0.8
    });

    // High polish chrome
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.05,
      metalness: 1.0,
      envMapIntensity: 1.5
    });

    // Matte black trim (carbon fiber look)
    const blackTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.4,
      metalness: 0.5
    });

    if (config.type === 'motorcycle') {
      this.createMotorcycleMesh(group, config, dim);
    } else if (config.type === 'truck') {
      this.createTruckMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial);
    } else if (config.type === 'helicopter') {
      this.createHelicopterMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial);
    } else if (config.type === 'airplane') {
      this.createAirplaneMesh(group, config, dim, bodyMaterial, glassMaterial, chromeMaterial);
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

    // Create wheels (not for flying vehicles)
    if (config.type !== 'helicopter' && config.type !== 'airplane') {
      const wheelPositions = this.getWheelPositions(config.type, dim);
      wheelPositions.forEach((pos, index) => {
        const wheelGroup = this.createDetailedWheel(config.type === 'truck' ? 0.45 : 0.32);
        wheelGroup.position.copy(pos);
        wheelGroup.name = `wheel_${index}`;
        group.add(wheelGroup);
      });
    }

    return group;
  }

  private createDetailedWheel(radius: number, isLuxury: boolean = true): THREE.Group {
    const wheelGroup = new THREE.Group();

    // Tire with realistic tread
    const tireGeometry = new THREE.TorusGeometry(radius, radius * 0.32, 24, 48);
    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.95,
      metalness: 0.05
    });
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Tire sidewall text effect (subtle ring)
    const sidewallGeometry = new THREE.TorusGeometry(radius * 0.85, radius * 0.03, 8, 48);
    const sidewallMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.8
    });
    const sidewall = new THREE.Mesh(sidewallGeometry, sidewallMaterial);
    sidewall.rotation.y = Math.PI / 2;
    sidewall.position.x = radius * 0.15;
    wheelGroup.add(sidewall);

    // Chrome/alloy rim outer ring
    const rimOuterGeometry = new THREE.TorusGeometry(radius * 0.68, radius * 0.08, 16, 48);
    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xE8E8E8,
      roughness: 0.1,
      metalness: 1.0,
      envMapIntensity: 1.5
    });
    const rimOuter = new THREE.Mesh(rimOuterGeometry, chromeMaterial);
    rimOuter.rotation.y = Math.PI / 2;
    wheelGroup.add(rimOuter);

    // Rim face (disk)
    const rimFaceGeometry = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, radius * 0.08, 32);
    const rimFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xC0C0C0,
      roughness: 0.2,
      metalness: 0.95
    });
    const rimFace = new THREE.Mesh(rimFaceGeometry, rimFaceMaterial);
    rimFace.rotation.z = Math.PI / 2;
    wheelGroup.add(rimFace);

    // Multi-spoke design (5 or 7 double spokes)
    const spokeCount = isLuxury ? 5 : 7;
    const spokeMaterial = new THREE.MeshStandardMaterial({
      color: 0xD0D0D0,
      roughness: 0.15,
      metalness: 0.98
    });

    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;

      // Main spoke
      const spokeGeometry = new THREE.BoxGeometry(radius * 0.5, radius * 0.12, radius * 0.04);
      const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
      spoke.position.set(0, Math.sin(angle) * radius * 0.35, Math.cos(angle) * radius * 0.35);
      spoke.rotation.x = angle;
      wheelGroup.add(spoke);

      // Secondary spoke (Y-spoke design)
      if (isLuxury) {
        const angle2 = angle + Math.PI / (spokeCount * 2);
        const spoke2Geometry = new THREE.BoxGeometry(radius * 0.35, radius * 0.06, radius * 0.03);
        const spoke2 = new THREE.Mesh(spoke2Geometry, spokeMaterial);
        spoke2.position.set(radius * 0.08, Math.sin(angle2) * radius * 0.28, Math.cos(angle2) * radius * 0.28);
        spoke2.rotation.x = angle2;
        wheelGroup.add(spoke2);
      }
    }

    // Center hub with logo indent
    const hubGeometry = new THREE.CylinderGeometry(radius * 0.18, radius * 0.2, radius * 0.12, 24);
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: 0xF0F0F0,
      roughness: 0.1,
      metalness: 1.0
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = radius * 0.02;
    wheelGroup.add(hub);

    // Center cap detail
    const capGeometry = new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, radius * 0.06, 16);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.8
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = radius * 0.08;
    wheelGroup.add(cap);

    // Brake caliper (visible through spokes) - red for sports feel
    const caliperGeometry = new THREE.BoxGeometry(radius * 0.08, radius * 0.2, radius * 0.35);
    const caliperMaterial = new THREE.MeshStandardMaterial({
      color: 0xCC0000,
      roughness: 0.4,
      metalness: 0.6
    });
    const caliper = new THREE.Mesh(caliperGeometry, caliperMaterial);
    caliper.position.set(-radius * 0.15, radius * 0.15, 0);
    wheelGroup.add(caliper);

    // Brake rotor (disk)
    const rotorGeometry = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, radius * 0.03, 32);
    const rotorMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.9
    });
    const rotor = new THREE.Mesh(rotorGeometry, rotorMaterial);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = -radius * 0.1;
    wheelGroup.add(rotor);

    return wheelGroup;
  }

  // ==================== INTERIOR ====================
  private createInterior(
    group: THREE.Group,
    dim: { width: number; height: number; length: number },
    isLuxury: boolean
  ): void {
    // Interior material
    const seatMaterial = new THREE.MeshStandardMaterial({
      color: isLuxury ? 0x2C2C2C : 0x4A4A4A,
      roughness: 0.8,
      metalness: 0.1
    });

    const dashMaterial = new THREE.MeshStandardMaterial({
      color: 0x1A1A1A,
      roughness: 0.7,
      metalness: 0.2
    });

    // Dashboard
    const dashGeom = new THREE.BoxGeometry(dim.width * 0.85, dim.height * 0.1, dim.length * 0.08);
    const dash = new THREE.Mesh(dashGeom, dashMaterial);
    dash.position.set(0, dim.height * 0.35, dim.length * 0.12);
    group.add(dash);

    // Center console
    const consoleGeom = new THREE.BoxGeometry(dim.width * 0.12, dim.height * 0.08, dim.length * 0.25);
    const console = new THREE.Mesh(consoleGeom, dashMaterial);
    console.position.set(0, dim.height * 0.32, -dim.length * 0.02);
    group.add(console);

    // Steering wheel
    const steeringMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.5,
      metalness: 0.3
    });
    const wheelRingGeom = new THREE.TorusGeometry(dim.width * 0.08, dim.width * 0.015, 8, 24);
    const steeringWheel = new THREE.Mesh(wheelRingGeom, steeringMaterial);
    steeringWheel.position.set(-dim.width * 0.22, dim.height * 0.42, dim.length * 0.08);
    steeringWheel.rotation.x = Math.PI / 2 + 0.4;
    group.add(steeringWheel);

    // Steering column
    const columnGeom = new THREE.CylinderGeometry(dim.width * 0.015, dim.width * 0.02, dim.height * 0.15, 8);
    const column = new THREE.Mesh(columnGeom, steeringMaterial);
    column.position.set(-dim.width * 0.22, dim.height * 0.36, dim.length * 0.1);
    column.rotation.x = 0.4;
    group.add(column);

    // Driver seat
    const seatGeom = new THREE.BoxGeometry(dim.width * 0.28, dim.height * 0.22, dim.length * 0.2);
    const driverSeat = new THREE.Mesh(seatGeom, seatMaterial);
    driverSeat.position.set(-dim.width * 0.22, dim.height * 0.3, -dim.length * 0.06);
    group.add(driverSeat);

    // Driver seat back
    const seatBackGeom = new THREE.BoxGeometry(dim.width * 0.26, dim.height * 0.3, dim.length * 0.06);
    const driverSeatBack = new THREE.Mesh(seatBackGeom, seatMaterial);
    driverSeatBack.position.set(-dim.width * 0.22, dim.height * 0.48, -dim.length * 0.14);
    driverSeatBack.rotation.x = 0.15;
    group.add(driverSeatBack);

    // Passenger seat
    const passengerSeat = new THREE.Mesh(seatGeom, seatMaterial);
    passengerSeat.position.set(dim.width * 0.22, dim.height * 0.3, -dim.length * 0.06);
    group.add(passengerSeat);

    // Passenger seat back
    const passengerSeatBack = new THREE.Mesh(seatBackGeom, seatMaterial);
    passengerSeatBack.position.set(dim.width * 0.22, dim.height * 0.48, -dim.length * 0.14);
    passengerSeatBack.rotation.x = 0.15;
    group.add(passengerSeatBack);

    // Luxury interior extras
    if (isLuxury) {
      // Digital display on dashboard
      const displayGeom = new THREE.BoxGeometry(dim.width * 0.2, dim.height * 0.05, dim.width * 0.01);
      const displayMaterial = new THREE.MeshStandardMaterial({
        color: 0x001122,
        emissive: 0x003366,
        emissiveIntensity: 0.3
      });
      const display = new THREE.Mesh(displayGeom, displayMaterial);
      display.position.set(0, dim.height * 0.4, dim.length * 0.14);
      group.add(display);

      // Gear shifter
      const shifterGeom = new THREE.CylinderGeometry(dim.width * 0.015, dim.width * 0.02, dim.height * 0.08, 8);
      const shifterMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.3,
        metalness: 0.8
      });
      const shifter = new THREE.Mesh(shifterGeom, shifterMaterial);
      shifter.position.set(dim.width * 0.05, dim.height * 0.35, -dim.length * 0.02);
      group.add(shifter);
    }
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

    // Add interior
    this.createInterior(group, dim, true);
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

    // Add interior
    this.createInterior(group, dim, false);
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

    // Wheel arch flares (muscular look)
    const archMaterial = bodyMaterial;
    [-1, 1].forEach(side => {
      // Front wheel arch
      const frontArchGeom = new THREE.BoxGeometry(dim.width * 0.15, dim.height * 0.12, dim.length * 0.2);
      const frontArch = new THREE.Mesh(frontArchGeom, archMaterial);
      frontArch.position.set(side * dim.width * 0.48, dim.height * 0.26, dim.length * 0.32);
      group.add(frontArch);

      // Rear wheel arch (slightly larger)
      const rearArchGeom = new THREE.BoxGeometry(dim.width * 0.18, dim.height * 0.14, dim.length * 0.22);
      const rearArch = new THREE.Mesh(rearArchGeom, archMaterial);
      rearArch.position.set(side * dim.width * 0.48, dim.height * 0.26, -dim.length * 0.32);
      group.add(rearArch);
    });

    // Side skirts (body kit look)
    [-1, 1].forEach(side => {
      const skirtGeom = new THREE.BoxGeometry(0.04, dim.height * 0.06, dim.length * 0.55);
      const skirt = new THREE.Mesh(skirtGeom, blackTrimMaterial);
      skirt.position.set(side * dim.width * 0.52, dim.height * 0.08, 0);
      group.add(skirt);
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

    // Add interior
    this.createInterior(group, dim, false);
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

  // ==================== HELICOPTER ====================
  private createHelicopterMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number },
    bodyMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    chromeMaterial: THREE.Material
  ): void {
    // ==================== REALISTIC HELICOPTER (MD500/Bell 206 Style) ====================

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.9, roughness: 0.3 });
    const lightMetal = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.4 });

    // === MAIN FUSELAGE (egg-shaped cabin) ===
    // Lower fuselage - rounded bottom
    const lowerFuselageGeom = new THREE.SphereGeometry(dim.width * 0.55, 24, 16, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.5);
    const lowerFuselage = new THREE.Mesh(lowerFuselageGeom, bodyMaterial);
    lowerFuselage.scale.set(1, 0.7, 1.3);
    lowerFuselage.position.set(0, -dim.height * 0.15, dim.length * 0.12);
    lowerFuselage.castShadow = true;
    group.add(lowerFuselage);

    // Upper fuselage - cabin roof
    const upperFuselageGeom = new THREE.SphereGeometry(dim.width * 0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const upperFuselage = new THREE.Mesh(upperFuselageGeom, bodyMaterial);
    upperFuselage.scale.set(1, 0.6, 1.2);
    upperFuselage.position.set(0, dim.height * 0.1, dim.length * 0.1);
    upperFuselage.castShadow = true;
    group.add(upperFuselage);

    // Engine cowling (top rear)
    const engineCowlGeom = new THREE.CylinderGeometry(dim.width * 0.35, dim.width * 0.4, dim.length * 0.25, 16);
    const engineCowl = new THREE.Mesh(engineCowlGeom, bodyMaterial);
    engineCowl.rotation.x = Math.PI / 2;
    engineCowl.position.set(0, dim.height * 0.2, -dim.length * 0.05);
    engineCowl.castShadow = true;
    group.add(engineCowl);

    // Engine intake (top)
    const intakeGeom = new THREE.BoxGeometry(dim.width * 0.3, dim.height * 0.15, dim.length * 0.2);
    const intake = new THREE.Mesh(intakeGeom, darkMetal);
    intake.position.set(0, dim.height * 0.35, -dim.length * 0.02);
    group.add(intake);

    // Intake grill
    const grillGeom = new THREE.PlaneGeometry(dim.width * 0.25, dim.height * 0.1);
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide });
    const grill = new THREE.Mesh(grillGeom, grillMat);
    grill.position.set(0, dim.height * 0.36, dim.length * 0.08);
    grill.rotation.x = -Math.PI / 6;
    group.add(grill);

    // === COCKPIT GLASS (bubble canopy) ===
    const cockpitGeom = new THREE.SphereGeometry(dim.width * 0.48, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const tintedGlass = new THREE.MeshStandardMaterial({
      color: 0x335566,
      roughness: 0.02,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4,
      envMapIntensity: 1.0
    });
    const cockpit = new THREE.Mesh(cockpitGeom, tintedGlass);
    cockpit.scale.set(0.95, 0.7, 1.1);
    cockpit.position.set(0, dim.height * 0.05, dim.length * 0.28);
    cockpit.rotation.x = -Math.PI * 0.15;
    group.add(cockpit);

    // Cockpit frame (windshield divider)
    const frameGeom = new THREE.BoxGeometry(0.03, dim.height * 0.3, dim.length * 0.02);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.position.set(0, dim.height * 0.1, dim.length * 0.42);
    frame.rotation.x = -0.2;
    group.add(frame);

    // Door frames
    [-1, 1].forEach(side => {
      const doorFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, dim.height * 0.35, dim.length * 0.25),
        frameMat
      );
      doorFrame.position.set(side * dim.width * 0.48, 0, dim.length * 0.15);
      group.add(doorFrame);
    });

    // === TAIL BOOM (tapered) ===
    const tailBoomGeom = new THREE.CylinderGeometry(0.12, 0.22, dim.length * 0.55, 12);
    const tailBoom = new THREE.Mesh(tailBoomGeom, bodyMaterial);
    tailBoom.rotation.z = Math.PI / 2;
    tailBoom.position.set(0, dim.height * 0.05, -dim.length * 0.38);
    tailBoom.castShadow = true;
    group.add(tailBoom);

    // Tail boom spine (top reinforcement)
    const spineGeom = new THREE.BoxGeometry(0.04, 0.08, dim.length * 0.5);
    const spine = new THREE.Mesh(spineGeom, darkMetal);
    spine.position.set(0, dim.height * 0.15, -dim.length * 0.35);
    group.add(spine);

    // === TAIL SECTION ===
    // Vertical stabilizer (fin)
    const tailFinShape = new THREE.Shape();
    tailFinShape.moveTo(0, 0);
    tailFinShape.lineTo(0.4, 0);
    tailFinShape.lineTo(0.5, 0.8);
    tailFinShape.lineTo(0.1, 0.8);
    tailFinShape.lineTo(0, 0);

    const tailFinGeom = new THREE.ExtrudeGeometry(tailFinShape, { depth: 0.06, bevelEnabled: false });
    const tailFin = new THREE.Mesh(tailFinGeom, bodyMaterial);
    tailFin.rotation.y = Math.PI / 2;
    tailFin.position.set(0.03, dim.height * 0.05, -dim.length * 0.55);
    tailFin.castShadow = true;
    group.add(tailFin);

    // Horizontal stabilizer
    const hStabGeom = new THREE.BoxGeometry(dim.width * 0.7, 0.05, 0.25);
    const hStab = new THREE.Mesh(hStabGeom, bodyMaterial);
    hStab.position.set(0, dim.height * 0.08, -dim.length * 0.52);
    group.add(hStab);

    // Stabilizer end plates
    [-1, 1].forEach(side => {
      const endPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.12, 0.2),
        bodyMaterial
      );
      endPlate.position.set(side * dim.width * 0.35, dim.height * 0.08, -dim.length * 0.52);
      group.add(endPlate);
    });

    // === TAIL ROTOR ASSEMBLY ===
    // Tail rotor housing/shroud
    const shroudGeom = new THREE.TorusGeometry(dim.height * 0.22, 0.04, 8, 24);
    const shroud = new THREE.Mesh(shroudGeom, darkMetal);
    shroud.position.set(0.18, dim.height * 0.45, -dim.length * 0.55);
    shroud.rotation.y = Math.PI / 2;
    group.add(shroud);

    // Tail rotor hub
    const tailHubGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12);
    const tailHub = new THREE.Mesh(tailHubGeom, chromeMaterial);
    tailHub.rotation.z = Math.PI / 2;
    tailHub.position.set(0.22, dim.height * 0.45, -dim.length * 0.55);
    group.add(tailHub);

    // Tail rotor blades (will animate)
    const tailRotorGroup = new THREE.Group();
    tailRotorGroup.name = 'tail_rotor';
    const tailBladeGeom = new THREE.BoxGeometry(0.04, dim.height * 0.38, 0.06);
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.3 });

    for (let i = 0; i < 4; i++) {
      const tailBlade = new THREE.Mesh(tailBladeGeom, bladeMaterial);
      tailBlade.rotation.x = (i / 4) * Math.PI * 2;
      tailRotorGroup.add(tailBlade);
    }
    tailRotorGroup.position.set(0.24, dim.height * 0.45, -dim.length * 0.55);
    tailRotorGroup.rotation.z = Math.PI / 2;
    group.add(tailRotorGroup);

    // === MAIN ROTOR ASSEMBLY ===
    // Rotor mast
    const mastGeom = new THREE.CylinderGeometry(0.08, 0.1, dim.height * 0.25, 12);
    const mast = new THREE.Mesh(mastGeom, chromeMaterial);
    mast.position.set(0, dim.height * 0.35, dim.length * 0.02);
    group.add(mast);

    // Swashplate (complex hub)
    const swashGeom = new THREE.CylinderGeometry(0.2, 0.18, 0.08, 16);
    const swash = new THREE.Mesh(swashGeom, lightMetal);
    swash.position.set(0, dim.height * 0.45, dim.length * 0.02);
    group.add(swash);

    // Main rotor hub
    const rotorHubGeom = new THREE.CylinderGeometry(0.12, 0.15, 0.1, 16);
    const rotorHub = new THREE.Mesh(rotorHubGeom, chromeMaterial);
    rotorHub.position.set(0, dim.height * 0.52, dim.length * 0.02);
    group.add(rotorHub);

    // Main rotor blades (will animate)
    const rotorGroup = new THREE.Group();
    rotorGroup.name = 'main_rotor';

    for (let i = 0; i < 4; i++) {
      // Blade grip
      const gripGeom = new THREE.BoxGeometry(0.25, 0.06, 0.12);
      const grip = new THREE.Mesh(gripGeom, darkMetal);
      grip.position.x = 0.15;

      // Main blade (tapered)
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0, -0.08);
      bladeShape.lineTo(dim.width * 2.2, -0.06);
      bladeShape.lineTo(dim.width * 2.3, 0);
      bladeShape.lineTo(dim.width * 2.2, 0.06);
      bladeShape.lineTo(0, 0.08);
      bladeShape.lineTo(0, -0.08);

      const bladeGeom = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.025, bevelEnabled: false });
      const blade = new THREE.Mesh(bladeGeom, bladeMaterial);
      blade.position.set(0.25, -0.012, 0);

      const bladeGroup = new THREE.Group();
      bladeGroup.add(grip);
      bladeGroup.add(blade);
      bladeGroup.rotation.y = (i / 4) * Math.PI * 2;
      rotorGroup.add(bladeGroup);
    }
    rotorGroup.position.set(0, dim.height * 0.55, dim.length * 0.02);
    group.add(rotorGroup);

    // === LANDING SKIDS ===
    const skidMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 });

    [-1, 1].forEach(side => {
      // Main skid tube (curved front)
      const skidPath = new THREE.CurvePath<THREE.Vector3>();
      skidPath.add(new THREE.LineCurve3(
        new THREE.Vector3(0, 0, -dim.length * 0.2),
        new THREE.Vector3(0, 0, dim.length * 0.15)
      ));
      skidPath.add(new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, dim.length * 0.15),
        new THREE.Vector3(0, 0.1, dim.length * 0.25),
        new THREE.Vector3(0, 0.2, dim.length * 0.28)
      ));

      const skidGeom = new THREE.TubeGeometry(skidPath, 16, 0.035, 8, false);
      const skid = new THREE.Mesh(skidGeom, skidMaterial);
      skid.position.set(side * dim.width * 0.42, -dim.height * 0.4, 0);
      skid.castShadow = true;
      group.add(skid);

      // Skid struts (angled)
      const strutGeom = new THREE.CylinderGeometry(0.025, 0.025, dim.height * 0.35, 8);

      // Front strut
      const frontStrut = new THREE.Mesh(strutGeom, skidMaterial);
      frontStrut.position.set(side * dim.width * 0.42, -dim.height * 0.22, dim.length * 0.12);
      frontStrut.rotation.z = side * 0.15;
      group.add(frontStrut);

      // Rear strut
      const rearStrut = new THREE.Mesh(strutGeom, skidMaterial);
      rearStrut.position.set(side * dim.width * 0.42, -dim.height * 0.22, -dim.length * 0.1);
      rearStrut.rotation.z = side * 0.15;
      group.add(rearStrut);

      // Cross tube
      const crossGeom = new THREE.CylinderGeometry(0.02, 0.02, dim.width * 0.84, 8);
      const crossTube = new THREE.Mesh(crossGeom, skidMaterial);
      crossTube.rotation.z = Math.PI / 2;
      crossTube.position.set(0, -dim.height * 0.4, dim.length * 0.02);
      if (side === 1) group.add(crossTube); // Only add once
    });

    // === ENGINE EXHAUST ===
    const exhaustGeom = new THREE.CylinderGeometry(0.08, 0.1, 0.35, 12);
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.95, roughness: 0.2 });
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
    exhaust.rotation.x = Math.PI / 2 + 0.2;
    exhaust.position.set(0, dim.height * 0.18, -dim.length * 0.18);
    group.add(exhaust);

    // Exhaust heat shimmer ring
    const heatRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.015, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0x332211, transparent: true, opacity: 0.3 })
    );
    heatRing.position.set(0, dim.height * 0.12, -dim.length * 0.22);
    heatRing.rotation.x = Math.PI / 2;
    heatRing.name = 'exhaust_heat';
    group.add(heatRing);

    // === NAVIGATION LIGHTS ===
    // Anti-collision beacon (top)
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), beaconMat);
    beacon.position.set(0, dim.height * 0.58, dim.length * 0.02);
    beacon.name = 'beacon';
    group.add(beacon);

    // Position lights (wingtip style on skid struts)
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redLight.position.set(-dim.width * 0.42, -dim.height * 0.05, dim.length * 0.12);
    group.add(redLight);

    const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenLight.position.set(dim.width * 0.42, -dim.height * 0.05, dim.length * 0.12);
    group.add(greenLight);

    // Tail light (white)
    const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    tailLight.position.set(0, dim.height * 0.1, -dim.length * 0.58);
    group.add(tailLight);

    // Landing light (under nose)
    const landingLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffcc })
    );
    landingLight.rotation.x = Math.PI / 2;
    landingLight.position.set(0, -dim.height * 0.25, dim.length * 0.35);
    landingLight.name = 'landing_light';
    group.add(landingLight);

    // === DETAILS ===
    // Pitot tube (airspeed sensor)
    const pitotGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6);
    const pitot = new THREE.Mesh(pitotGeom, chromeMaterial);
    pitot.rotation.x = Math.PI / 2;
    pitot.position.set(-dim.width * 0.35, dim.height * 0.05, dim.length * 0.4);
    group.add(pitot);

    // Antenna
    const antennaGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.3, 6);
    const antenna = new THREE.Mesh(antennaGeom, darkMetal);
    antenna.position.set(0, dim.height * 0.25, -dim.length * 0.15);
    group.add(antenna);
  }

  // ==================== AIRPLANE ====================
  private createAirplaneMesh(
    group: THREE.Group,
    config: VehicleConfig,
    dim: { width: number; height: number; length: number },
    bodyMaterial: THREE.Material,
    glassMaterial: THREE.Material,
    chromeMaterial: THREE.Material
  ): void {
    // Fuselage (main body)
    const fuselageGeom = new THREE.CylinderGeometry(0.8, 0.6, dim.length, 16);
    const fuselage = new THREE.Mesh(fuselageGeom, bodyMaterial);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.castShadow = true;
    group.add(fuselage);

    // Nose cone
    const noseGeom = new THREE.ConeGeometry(0.6, 1.5, 16);
    const nose = new THREE.Mesh(noseGeom, bodyMaterial);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0, 0, dim.length * 0.55);
    group.add(nose);

    // Cockpit windshield
    const windshieldGeom = new THREE.BoxGeometry(0.8, 0.4, 1.2);
    const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
    windshield.position.set(0, 0.5, dim.length * 0.25);
    windshield.rotation.x = -0.2;
    group.add(windshield);

    // Main wings
    const wingGeom = new THREE.BoxGeometry(dim.width, 0.1, 1.5);
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: (bodyMaterial as THREE.MeshStandardMaterial).color,
      roughness: 0.3,
      metalness: 0.7
    });
    const wings = new THREE.Mesh(wingGeom, wingMaterial);
    wings.position.set(0, -0.2, 0);
    wings.castShadow = true;
    group.add(wings);

    // Wing tips (slightly angled up)
    [-1, 1].forEach(side => {
      const wingTipGeom = new THREE.BoxGeometry(0.5, 0.3, 0.8);
      const wingTip = new THREE.Mesh(wingTipGeom, wingMaterial);
      wingTip.position.set(side * (dim.width * 0.5 + 0.2), 0, 0);
      wingTip.rotation.z = side * 0.3;
      group.add(wingTip);
    });

    // Tail section
    const tailGeom = new THREE.CylinderGeometry(0.4, 0.6, dim.length * 0.3, 12);
    const tail = new THREE.Mesh(tailGeom, bodyMaterial);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(0, 0, -dim.length * 0.45);
    group.add(tail);

    // Vertical stabilizer (tail fin)
    const vStabGeom = new THREE.BoxGeometry(0.1, 1.5, 1.2);
    const vStab = new THREE.Mesh(vStabGeom, wingMaterial);
    vStab.position.set(0, 0.8, -dim.length * 0.4);
    group.add(vStab);

    // Horizontal stabilizers
    const hStabGeom = new THREE.BoxGeometry(3, 0.08, 0.8);
    const hStab = new THREE.Mesh(hStabGeom, wingMaterial);
    hStab.position.set(0, 0.1, -dim.length * 0.45);
    group.add(hStab);

    // Propeller hub
    const propHubGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16);
    const propHub = new THREE.Mesh(propHubGeom, chromeMaterial);
    propHub.rotation.x = Math.PI / 2;
    propHub.position.set(0, 0, dim.length * 0.6);
    group.add(propHub);

    // Propeller blades (will animate)
    const propGroup = new THREE.Group();
    propGroup.name = 'propeller';
    const propBladeGeom = new THREE.BoxGeometry(0.15, 2, 0.05);
    const propBladeMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(propBladeGeom, propBladeMat);
      blade.rotation.z = (i / 3) * Math.PI * 2;
      propGroup.add(blade);
    }
    propGroup.position.set(0, 0, dim.length * 0.65);
    group.add(propGroup);

    // Landing gear - front wheel
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const frontWheelGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
    const frontWheel = new THREE.Mesh(frontWheelGeom, wheelMat);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.position.set(0, -0.9, dim.length * 0.35);
    group.add(frontWheel);

    // Front gear strut
    const frontStrutGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
    const frontStrut = new THREE.Mesh(frontStrutGeom, strutMat);
    frontStrut.position.set(0, -0.6, dim.length * 0.35);
    group.add(frontStrut);

    // Main landing gear (under wings)
    [-1, 1].forEach(side => {
      const mainWheelGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16);
      const mainWheel = new THREE.Mesh(mainWheelGeom, wheelMat);
      mainWheel.rotation.z = Math.PI / 2;
      mainWheel.position.set(side * 1.5, -0.95, -0.2);
      group.add(mainWheel);

      const mainStrutGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);
      const mainStrut = new THREE.Mesh(mainStrutGeom, strutMat);
      mainStrut.position.set(side * 1.5, -0.6, -0.2);
      group.add(mainStrut);
    });

    // Engine cowling on wings
    [-1, 1].forEach(side => {
      const cowlGeom = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 12);
      const cowl = new THREE.Mesh(cowlGeom, bodyMaterial);
      cowl.rotation.x = Math.PI / 2;
      cowl.position.set(side * 2.5, -0.1, 0.3);
      group.add(cowl);
    });

    // Navigation lights
    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const redNav = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), redLightMat);
    redNav.position.set(-dim.width * 0.5 - 0.25, 0, 0);
    group.add(redNav);
    const greenNav = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), greenLightMat);
    greenNav.position.set(dim.width * 0.5 + 0.25, 0, 0);
    group.add(greenNav);
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
      case 'helicopter':
        return { width: 2.5, height: 3, length: 10 }; // Including tail boom
      case 'airplane':
        return { width: 12, height: 3, length: 8 }; // Wingspan as width
      default:
        // Cars: wider and lower for more realistic proportions
        // Width increased for better stability and more aggressive stance
        return { width: 2.4, height: 1.35, length: 4.8 };
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

  private createVehicleLights(mesh: THREE.Group, config: VehicleConfig, isPlayerVehicle: boolean = false): Vehicle['lights'] {
    // PERFORMANCE: Only create actual lights for player's vehicle to avoid WebGL uniform limits
    // Traffic vehicles use emissive materials only (no PointLights)
    if (!isPlayerVehicle) {
      return {
        headlights: [],
        taillights: [],
        brakeLights: [],
        indicators: []
      };
    }

    const dimensions = this.getVehicleDimensions(config.type);

    // Player vehicle gets actual lights
    const headlightLeft = new THREE.PointLight(0xffffcc, 1, 15);
    headlightLeft.position.set(-0.6, 0.6, dimensions.length / 2 + 0.5);
    mesh.add(headlightLeft);

    const headlightRight = new THREE.PointLight(0xffffcc, 1, 15);
    headlightRight.position.set(0.6, 0.6, dimensions.length / 2 + 0.5);
    mesh.add(headlightRight);

    // Single taillight
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
        // Skip physics sync for flying vehicles - they use direct mesh manipulation
        const isFlying = vehicle.config.type === 'helicopter' || vehicle.config.type === 'airplane';
        if (isFlying && vehicle.driver?.id === 'player') {
          // For flying vehicles, update physics body from mesh (not the other way around)
          this.game.vehiclePhysics.setVehicleTransform(
            vehicle.id,
            vehicle.mesh.position,
            vehicle.mesh.quaternion
          );
          return;
        }

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

    // Handle flying vehicles separately
    const isFlying = vehicle.config.type === 'helicopter' || vehicle.config.type === 'airplane';

    if (isFlying) {
      // Animate rotors/propellers
      this.animateAircraftParts(vehicle, deltaTime);
    }

    // Handle player driving input
    if (vehicle.driver?.id === 'player') {
      if (isFlying) {
        this.handlePlayerFlying(vehicle, deltaTime);
      } else {
        this.handlePlayerDriving(vehicle, deltaTime);
      }
    }

    if (vehicle.health <= 0 && !vehicle.destroyed) {
      this.destroyVehicle(vehicle);
    }
  }

  private animateAircraftParts(vehicle: Vehicle, deltaTime: number): void {
    const isEngineOn = vehicle.driver !== null;
    const rotorSpeed = isEngineOn ? 25 : 2; // Fast when running, slow idle

    if (vehicle.config.type === 'helicopter') {
      // Main rotor
      const mainRotor = vehicle.mesh.getObjectByName('main_rotor');
      if (mainRotor) {
        mainRotor.rotation.y += rotorSpeed * deltaTime;
      }
      // Tail rotor
      const tailRotor = vehicle.mesh.getObjectByName('tail_rotor');
      if (tailRotor) {
        tailRotor.rotation.y += rotorSpeed * 1.5 * deltaTime;
      }
    } else if (vehicle.config.type === 'airplane') {
      // Propeller
      const propeller = vehicle.mesh.getObjectByName('propeller');
      if (propeller) {
        propeller.rotation.z += rotorSpeed * deltaTime;
      }
    }
  }

  private handlePlayerFlying(vehicle: Vehicle, deltaTime: number): void {
    const input = this.game.input.getState();
    const pos = vehicle.mesh.position;
    const rot = vehicle.mesh.rotation;

    // Calculate direction vectors from current rotation
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(rot);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(rot);
    const up = new THREE.Vector3(0, 1, 0);

    if (vehicle.config.type === 'helicopter') {
      // ==================== REALISTIC HELICOPTER CONTROLS ====================
      // W/S = Pitch forward/back (cyclic) - tilts helicopter to move
      // A/D = Yaw left/right (tail rotor) - spins helicopter
      // Space = Collective up (ascend)
      // C = Collective down (descend)
      // Shift = Speed boost when moving

      const maxTiltAngle = 0.35; // ~20 degrees max tilt
      const tiltSpeed = 2.5;
      const yawSpeed = 2.0;
      const liftPower = 18;
      const movementSpeed = 25;
      const gravity = 12;

      // Collective (altitude control)
      let collectiveInput = 0;
      if (input.jump) collectiveInput = 1;      // Space = go up
      if (input.crouch) collectiveInput = -1;   // C = go down

      // Cyclic (tilt control for movement)
      let pitchInput = 0;  // Forward/back tilt
      let rollInput = 0;   // Left/right tilt (strafe)

      if (input.forward) pitchInput = 1;   // W = tilt forward (move forward)
      if (input.backward) pitchInput = -1; // S = tilt backward (move backward)

      // Yaw (rotation)
      let yawInput = 0;
      if (input.left) yawInput = 1;    // A = rotate left
      if (input.right) yawInput = -1;  // D = rotate right

      // Strafe with Shift+A/D
      if (input.sprint) {
        if (input.left) { rollInput = -1; yawInput = 0; }   // Shift+A = strafe left
        if (input.right) { rollInput = 1; yawInput = 0; }   // Shift+D = strafe right
      }

      // Speed boost
      const speedMultiplier = input.sprint && pitchInput !== 0 ? 1.5 : 1.0;

      // Apply tilt (cyclic)
      const targetPitch = -pitchInput * maxTiltAngle; // Negative because forward tilt = negative X rotation
      const targetRoll = rollInput * maxTiltAngle;
      rot.x = THREE.MathUtils.lerp(rot.x, targetPitch, deltaTime * tiltSpeed);
      rot.z = THREE.MathUtils.lerp(rot.z, targetRoll, deltaTime * tiltSpeed);

      // Apply yaw (tail rotor)
      rot.y += yawInput * yawSpeed * deltaTime;

      // Calculate lift force
      let lift = 0;

      // Base hover lift (counteracts gravity when collective is neutral)
      if (collectiveInput > 0) {
        lift = collectiveInput * liftPower * deltaTime;
      } else if (collectiveInput < 0) {
        lift = collectiveInput * liftPower * 0.7 * deltaTime; // Descend slower
      } else {
        // Hover - slight lift to counteract gravity at neutral
        lift = -gravity * 0.3 * deltaTime;
      }

      // Gravity
      lift -= gravity * deltaTime;

      // Movement from tilt
      const tiltMagnitude = Math.sqrt(rot.x * rot.x + rot.z * rot.z);
      if (tiltMagnitude > 0.05) {
        // Move in direction of tilt
        const moveDir = new THREE.Vector3(
          Math.sin(rot.z),
          0,
          -Math.sin(rot.x)
        ).applyAxisAngle(up, rot.y);

        const speed = tiltMagnitude * movementSpeed * speedMultiplier * deltaTime;
        pos.add(moveDir.multiplyScalar(speed));
      }

      // Apply lift
      pos.y += lift;

      // Ground collision
      if (pos.y < 1.5) {
        pos.y = 1.5;
        // Level out when on ground
        rot.x = THREE.MathUtils.lerp(rot.x, 0, deltaTime * 3);
        rot.z = THREE.MathUtils.lerp(rot.z, 0, deltaTime * 3);
      }

      // Max altitude
      if (pos.y > 200) pos.y = 200;

      // Calculate speed for display
      const heliSpeed = tiltMagnitude * movementSpeed * speedMultiplier;
      vehicle.currentSpeed = heliSpeed;

    } else if (vehicle.config.type === 'airplane') {
      // ==================== REALISTIC AIRPLANE CONTROLS ====================
      // W = Throttle up (accelerate)
      // S = Throttle down / brake
      // A/D = Roll (bank left/right) - causes turning
      // Space = Pitch up (pull back, climb)
      // C = Pitch down (push forward, dive)
      // Shift = Afterburner (speed boost)

      const maxSpeed = vehicle.config.maxSpeed;
      const minFlySpeed = 40; // Stall speed
      const acceleration = vehicle.config.acceleration * 2;
      const pitchSpeed = 1.5;
      const rollSpeed = 2.5;
      const turnFromRoll = 1.2;
      const gravity = 15;

      // Throttle
      let throttleInput = 0;
      if (input.forward) throttleInput = 1;
      if (input.backward) throttleInput = -0.5;

      // Pitch (elevator)
      let pitchInput = 0;
      if (input.jump) pitchInput = -1;   // Space = pull up (nose up)
      if (input.crouch) pitchInput = 1;  // C = push down (nose down)

      // Roll (ailerons)
      let rollInput = 0;
      if (input.left) rollInput = -1;    // A = roll left (bank left)
      if (input.right) rollInput = 1;    // D = roll right (bank right)

      // Afterburner
      const afterburner = input.sprint ? 1.5 : 1.0;

      // Update speed
      if (throttleInput > 0) {
        vehicle.currentSpeed += throttleInput * acceleration * afterburner * deltaTime;
      } else if (throttleInput < 0) {
        vehicle.currentSpeed += throttleInput * acceleration * 2 * deltaTime; // Brake faster
      }

      // Speed limits
      vehicle.currentSpeed = Math.max(0, Math.min(vehicle.currentSpeed, maxSpeed * afterburner));

      // Drag (air resistance)
      vehicle.currentSpeed *= (1 - 0.02 * deltaTime);

      // Control effectiveness based on speed
      const speedRatio = Math.min(vehicle.currentSpeed / minFlySpeed, 1);
      const controlEffectiveness = speedRatio * speedRatio; // Quadratic for realism

      // Apply pitch
      if (controlEffectiveness > 0.1) {
        rot.x += pitchInput * pitchSpeed * controlEffectiveness * deltaTime;
        rot.x = THREE.MathUtils.clamp(rot.x, -Math.PI / 3, Math.PI / 3); // ±60 degrees
      }

      // Apply roll
      rot.z += rollInput * rollSpeed * controlEffectiveness * deltaTime;
      rot.z = THREE.MathUtils.clamp(rot.z, -Math.PI / 2, Math.PI / 2); // ±90 degrees

      // Turn from roll (banking turns)
      if (Math.abs(rot.z) > 0.1 && controlEffectiveness > 0.3) {
        rot.y -= Math.sin(rot.z) * turnFromRoll * controlEffectiveness * deltaTime;
      }

      // Auto-level roll when no input
      if (rollInput === 0 && pos.y > 5) {
        rot.z = THREE.MathUtils.lerp(rot.z, 0, deltaTime * 0.5);
      }

      // Forward movement based on speed
      const moveSpeed = vehicle.currentSpeed * deltaTime * 0.15;
      pos.add(forward.clone().normalize().multiplyScalar(moveSpeed));

      // Lift based on speed and pitch
      let lift = 0;
      if (vehicle.currentSpeed > minFlySpeed * 0.5) {
        // Generate lift proportional to speed squared (realistic)
        const liftCoeff = (vehicle.currentSpeed / maxSpeed);
        lift = liftCoeff * 20 * Math.cos(rot.x) * deltaTime;

        // Pitch affects climb/dive
        lift -= Math.sin(rot.x) * vehicle.currentSpeed * 0.1 * deltaTime;
      }

      // Gravity
      lift -= gravity * deltaTime;

      // Stall behavior
      if (vehicle.currentSpeed < minFlySpeed && pos.y > 5) {
        // Nose drops in stall
        rot.x = THREE.MathUtils.lerp(rot.x, 0.3, deltaTime * 0.5);
        lift -= gravity * 0.5 * deltaTime; // Extra gravity in stall
      }

      pos.y += lift;

      // Ground handling
      if (pos.y < 1.5) {
        pos.y = 1.5;
        // On ground: direct steering with A/D
        if (vehicle.currentSpeed > 5) {
          rot.y -= rollInput * 1.0 * deltaTime; // Rudder steering on ground
        }
        // Level out
        rot.x = THREE.MathUtils.lerp(rot.x, 0, deltaTime * 2);
        rot.z = THREE.MathUtils.lerp(rot.z, 0, deltaTime * 3);
      }

      // Max altitude
      if (pos.y > 300) pos.y = 300;
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
    if (input.headlights && !this.lastHeadlightState) {
      this.toggleHeadlights(vehicle);
    }
    this.lastHeadlightState = input.headlights;

    // Horn (only play once on keydown, not every frame)
    if (input.horn && !this.lastHornState) {
      this.game.audio.playSound('horn');
    }
    this.lastHornState = input.horn;

    // Radio controls (only on keydown, not every frame)
    if (input.nextRadio && !this.lastRadioState) {
      this.game.audio.nextStation();
    }
    this.lastRadioState = input.nextRadio;
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
