import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle, VehicleConfig, VehicleType } from '@/types';
import { Game } from '@/core/Game';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';

const VEHICLE_CONFIGS: VehicleConfig[] = [
  {
    id: 'sports_car',
    name: 'Infernus',
    type: 'car',
    maxSpeed: 180,
    acceleration: 25,
    braking: 35,
    handling: 0.8,
    mass: 1400,
    health: 1000,
    seats: 2,
    hasRadio: true,
    color: 0xff0000
  },
  {
    id: 'sedan',
    name: 'Admiral',
    type: 'car',
    maxSpeed: 140,
    acceleration: 18,
    braking: 25,
    handling: 0.6,
    mass: 1600,
    health: 1200,
    seats: 4,
    hasRadio: true,
    color: 0x333333
  },
  {
    id: 'muscle_car',
    name: 'Stallion',
    type: 'car',
    maxSpeed: 160,
    acceleration: 22,
    braking: 28,
    handling: 0.5,
    mass: 1800,
    health: 1100,
    seats: 2,
    hasRadio: true,
    color: 0x0066ff
  },
  {
    id: 'truck',
    name: 'Mule',
    type: 'truck',
    maxSpeed: 100,
    acceleration: 10,
    braking: 20,
    handling: 0.3,
    mass: 5000,
    health: 2000,
    seats: 2,
    hasRadio: true,
    color: 0xcccccc
  },
  {
    id: 'motorcycle',
    name: 'PCJ-600',
    type: 'motorcycle',
    maxSpeed: 170,
    acceleration: 30,
    braking: 40,
    handling: 0.9,
    mass: 300,
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
    const spawnPoints = [
      { x: 10, y: 0.5, z: 10, rotation: 0 },
      { x: -15, y: 0.5, z: 20, rotation: Math.PI / 2 },
      { x: 25, y: 0.5, z: -10, rotation: Math.PI },
      { x: -30, y: 0.5, z: -20, rotation: -Math.PI / 2 },
      { x: 50, y: 0.5, z: 30, rotation: Math.PI / 4 }
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

    const dimensions = this.getVehicleDimensions(config.type);
    const body = this.game.physics.createVehicleBody(
      id,
      dimensions,
      config.mass,
      position
    );
    body.quaternion.setFromEuler(0, rotation, 0);

    const vehicle: Vehicle = {
      id,
      config,
      mesh,
      body,
      currentSpeed: 0,
      health: config.health,
      fuel: 100,
      driver: null,
      passengers: [],
      wheels: [],
      lights: this.createVehicleLights(mesh, config),
      destroyed: false
    };

    this.createWheels(vehicle, config);
    this.game.physics.linkMeshToBody(mesh, body);
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
      // Car body - main lower section
      const lowerBodyGeom = new THREE.BoxGeometry(dim.width, dim.height * 0.35, dim.length);
      const lowerBody = new THREE.Mesh(lowerBodyGeom, bodyMaterial);
      lowerBody.position.y = dim.height * 0.2;
      lowerBody.castShadow = true;
      lowerBody.receiveShadow = true;
      group.add(lowerBody);

      // Hood (front)
      const hoodGeom = new THREE.BoxGeometry(dim.width * 0.95, dim.height * 0.12, dim.length * 0.28);
      const hood = new THREE.Mesh(hoodGeom, bodyMaterial);
      hood.position.set(0, dim.height * 0.42, dim.length * 0.3);
      hood.rotation.x = -0.05;
      hood.castShadow = true;
      group.add(hood);

      // Trunk (rear)
      const trunkGeom = new THREE.BoxGeometry(dim.width * 0.95, dim.height * 0.12, dim.length * 0.22);
      const trunk = new THREE.Mesh(trunkGeom, bodyMaterial);
      trunk.position.set(0, dim.height * 0.42, -dim.length * 0.35);
      trunk.rotation.x = 0.03;
      trunk.castShadow = true;
      group.add(trunk);

      // Cabin/Roof
      const cabinGeom = new THREE.BoxGeometry(dim.width * 0.88, dim.height * 0.32, dim.length * 0.4);
      const cabin = new THREE.Mesh(cabinGeom, bodyMaterial);
      cabin.position.set(0, dim.height * 0.58, -dim.length * 0.05);
      cabin.castShadow = true;
      group.add(cabin);

      // Windshield (front)
      const windshieldGeom = new THREE.BoxGeometry(dim.width * 0.82, dim.height * 0.28, 0.02);
      const windshield = new THREE.Mesh(windshieldGeom, glassMaterial);
      windshield.position.set(0, dim.height * 0.56, dim.length * 0.12);
      windshield.rotation.x = -0.4;
      group.add(windshield);

      // Rear window
      const rearWindowGeom = new THREE.BoxGeometry(dim.width * 0.78, dim.height * 0.24, 0.02);
      const rearWindow = new THREE.Mesh(rearWindowGeom, glassMaterial);
      rearWindow.position.set(0, dim.height * 0.58, -dim.length * 0.22);
      rearWindow.rotation.x = 0.35;
      group.add(rearWindow);

      // Side windows
      const sideWindowGeom = new THREE.BoxGeometry(0.02, dim.height * 0.22, dim.length * 0.18);

      const leftWindow = new THREE.Mesh(sideWindowGeom, glassMaterial);
      leftWindow.position.set(-dim.width * 0.44, dim.height * 0.58, -dim.length * 0.05);
      group.add(leftWindow);

      const rightWindow = new THREE.Mesh(sideWindowGeom, glassMaterial);
      rightWindow.position.set(dim.width * 0.44, dim.height * 0.58, -dim.length * 0.05);
      group.add(rightWindow);

      // Front bumper
      const frontBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.1, 0.12);
      const frontBumper = new THREE.Mesh(frontBumperGeom, blackTrimMaterial);
      frontBumper.position.set(0, dim.height * 0.1, dim.length * 0.48);
      group.add(frontBumper);

      // Rear bumper
      const rearBumperGeom = new THREE.BoxGeometry(dim.width * 1.02, dim.height * 0.1, 0.1);
      const rearBumper = new THREE.Mesh(rearBumperGeom, blackTrimMaterial);
      rearBumper.position.set(0, dim.height * 0.1, -dim.length * 0.48);
      group.add(rearBumper);

      // Grille
      const grilleGeom = new THREE.BoxGeometry(dim.width * 0.5, dim.height * 0.12, 0.03);
      const grille = new THREE.Mesh(grilleGeom, chromeMaterial);
      grille.position.set(0, dim.height * 0.22, dim.length * 0.49);
      group.add(grille);

      // Headlight housings
      const headlightGeom = new THREE.BoxGeometry(dim.width * 0.18, dim.height * 0.08, 0.06);

      const leftHeadlight = new THREE.Mesh(headlightGeom, glassMaterial);
      leftHeadlight.position.set(-dim.width * 0.32, dim.height * 0.26, dim.length * 0.48);
      group.add(leftHeadlight);

      const rightHeadlight = new THREE.Mesh(headlightGeom, glassMaterial);
      rightHeadlight.position.set(dim.width * 0.32, dim.height * 0.26, dim.length * 0.48);
      group.add(rightHeadlight);

      // Tail lights
      const taillightMaterial = new THREE.MeshStandardMaterial({
        color: 0xcc0000,
        roughness: 0.3,
        metalness: 0.2,
        emissive: 0x330000
      });
      const taillightGeom = new THREE.BoxGeometry(dim.width * 0.15, dim.height * 0.06, 0.04);

      const leftTaillight = new THREE.Mesh(taillightGeom, taillightMaterial);
      leftTaillight.position.set(-dim.width * 0.35, dim.height * 0.28, -dim.length * 0.49);
      group.add(leftTaillight);

      const rightTaillight = new THREE.Mesh(taillightGeom, taillightMaterial);
      rightTaillight.position.set(dim.width * 0.35, dim.height * 0.28, -dim.length * 0.49);
      group.add(rightTaillight);

      // Side mirrors
      const mirrorGeom = new THREE.BoxGeometry(0.08, 0.06, 0.1);

      const leftMirror = new THREE.Mesh(mirrorGeom, blackTrimMaterial);
      leftMirror.position.set(-dim.width * 0.55, dim.height * 0.5, dim.length * 0.15);
      group.add(leftMirror);

      const rightMirror = new THREE.Mesh(mirrorGeom, blackTrimMaterial);
      rightMirror.position.set(dim.width * 0.55, dim.height * 0.5, dim.length * 0.15);
      group.add(rightMirror);

      // Door handles
      const handleGeom = new THREE.BoxGeometry(0.02, 0.02, 0.08);

      const leftHandle = new THREE.Mesh(handleGeom, chromeMaterial);
      leftHandle.position.set(-dim.width * 0.5, dim.height * 0.35, 0);
      group.add(leftHandle);

      const rightHandle = new THREE.Mesh(handleGeom, chromeMaterial);
      rightHandle.position.set(dim.width * 0.5, dim.height * 0.35, 0);
      group.add(rightHandle);
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

  private createWheels(vehicle: Vehicle, config: VehicleConfig): void {
    const dimensions = this.getVehicleDimensions(config.type);
    const wheelPositions = this.getWheelPositions(config.type, dimensions);

    wheelPositions.forEach((pos, index) => {
      const wheelMesh = vehicle.mesh.getObjectByName(`wheel_${index}`) as THREE.Mesh;
      if (wheelMesh) {
        vehicle.wheels.push({
          mesh: wheelMesh,
          constraint: null as unknown as CANNON.HingeConstraint,
          steering: index < 2,
          powered: index >= 2 || config.type === 'motorcycle'
        });
      }
    });
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
    });
  }

  // Called after physics step to sync all vehicle meshes with physics bodies
  syncWithPhysics(): void {
    this.vehicles.forEach(vehicle => {
      if (!vehicle.destroyed) {
        this.game.physics.syncMeshToBody(vehicle.mesh);
      }
    });
  }

  private updateVehicle(vehicle: Vehicle, deltaTime: number): void {
    if (vehicle.destroyed) return;

    // Animate wheels based on speed
    vehicle.wheels.forEach(wheel => {
      wheel.mesh.rotation.x += vehicle.currentSpeed * deltaTime * 0.5;
    });

    // Handle player driving input
    if (vehicle.driver?.id === 'player') {
      this.handlePlayerDriving(vehicle, deltaTime);
    }

    if (vehicle.health <= 0 && !vehicle.destroyed) {
      this.destroyVehicle(vehicle);
    }
  }

  private handlePlayerDriving(vehicle: Vehicle, deltaTime: number): void {
    const input = this.game.input.getState();
    const body = vehicle.body;

    // Wake up physics body
    body.wakeUp();

    // STABILIZE: Keep car upright by extracting only Y rotation
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
    euler.setFromQuaternion(quat, 'YXZ');

    // Reset X and Z rotation to keep car flat on ground
    euler.x = 0;
    euler.z = 0;
    quat.setFromEuler(euler);
    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);

    // Also prevent unwanted angular velocity (only allow Y rotation for steering)
    body.angularVelocity.x = 0;
    body.angularVelocity.z = 0;

    // Get input values
    let acceleration = 0;
    let steering = 0;

    if (input.forward) acceleration = 1;
    if (input.backward) acceleration = -0.6;
    if (input.left) steering = 1;
    if (input.right) steering = -1;

    // Visual wheel steering
    const maxSteerAngle = 0.6 * vehicle.config.handling;
    const steerAngle = steering * maxSteerAngle;
    vehicle.wheels.forEach(wheel => {
      if (wheel.steering) {
        wheel.mesh.rotation.y = steerAngle;
      }
    });

    // Get vehicle's forward direction (now stabilized) - negative Z is forward in Three.js
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(quat);

    // Calculate current forward speed (dot product with forward direction)
    const velocityVec = new THREE.Vector3(body.velocity.x, 0, body.velocity.z);
    const currentSpeed = velocityVec.length();
    vehicle.currentSpeed = currentSpeed;

    // Max speed in m/s (convert from km/h)
    const maxSpeedMs = vehicle.config.maxSpeed / 3.6;
    const reverseMaxSpeed = maxSpeedMs * 0.4;

    // Acceleration - DIRECT velocity setting for arcade feel
    if (acceleration !== 0) {
      // Very strong acceleration for arcade feel
      const accelForce = vehicle.config.acceleration * 8;

      // Calculate target speed based on direction
      const targetSpeed = acceleration > 0 ? maxSpeedMs : reverseMaxSpeed;

      // Accelerate towards target speed
      let newSpeed = currentSpeed + Math.abs(acceleration) * accelForce * deltaTime;
      newSpeed = Math.min(newSpeed, targetSpeed);

      // Ensure minimum starting speed for responsiveness
      if (newSpeed < 2) newSpeed = 2;

      // Set velocity DIRECTLY in forward/backward direction
      body.velocity.x = forward.x * newSpeed * (acceleration > 0 ? 1 : -1);
      body.velocity.z = forward.z * newSpeed * (acceleration > 0 ? 1 : -1);
    } else {
      // Gradual deceleration when not accelerating
      body.velocity.x *= 0.98;
      body.velocity.z *= 0.98;
    }

    // Steering - rotational velocity
    if (currentSpeed > 0.5 && steering !== 0) {
      const turnRate = steering * vehicle.config.handling * 4;
      // Faster turning at lower speeds
      const speedFactor = Math.min(1, 15 / Math.max(currentSpeed, 1));
      body.angularVelocity.y = turnRate * speedFactor;
    } else if (Math.abs(steering) < 0.1) {
      // Dampen angular velocity when not steering
      body.angularVelocity.y *= 0.85;
    }

    // Handbrake / Brake
    if (input.handbrake || input.jump) {
      body.velocity.x *= 0.9;
      body.velocity.z *= 0.9;
      body.angularVelocity.y *= 0.9;
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

    const nearby = this.game.physics.sphereCast(position, 10, COLLISION_GROUPS.NPC);
    nearby.forEach(body => {
      const direction = new CANNON.Vec3();
      direction.copy(body.position);
      direction.vsub(new CANNON.Vec3(position.x, position.y, position.z), direction);
      direction.normalize();
      direction.scale(500, direction);
      body.applyImpulse(direction, body.position);
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
      this.game.scene.remove(vehicle.mesh);
      this.game.physics.removeBody(id);
      this.vehicles.delete(id);
    }
  }

  dispose(): void {
    this.vehicles.forEach((_, id) => this.removeVehicle(id));
  }
}
