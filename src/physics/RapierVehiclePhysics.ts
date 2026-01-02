import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { VehicleType, PhysicsConfig } from '@/types';

export interface RapierVehicle {
  chassis: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.DynamicRayCastVehicleController;
  wheelMeshes: THREE.Object3D[];
  vehicleType: VehicleType;
  // Motorcycle-specific state for GTA5-like physics
  targetLean: number;
  currentLean: number;
  lastSteeringInput: number;
}

export class RapierVehiclePhysics {
  public world!: RAPIER.World;
  public initialized: boolean = false;
  private config: PhysicsConfig;
  private vehicles: Map<string, RapierVehicle> = new Map();
  private groundCollider: RAPIER.Collider | null = null;

  constructor(config: PhysicsConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await RAPIER.init();

    const gravity = { x: 0.0, y: this.config.gravity, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    this.initialized = true;
    console.log('Rapier physics initialized for vehicles');
  }

  createGroundPlane(): void {
    if (!this.initialized) return;

    // Create a large static ground plane
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setTranslation(0, -0.1, 0)
      .setFriction(0.8)
      .setRestitution(0.0);

    this.groundCollider = this.world.createCollider(groundColliderDesc);
  }

  createVehicle(
    id: string,
    vehicleType: VehicleType,
    position: THREE.Vector3,
    rotation: number,
    mass: number
  ): RapierVehicle {
    const dimensions = this.getVehicleDimensions(vehicleType);
    const isMotorcycle = vehicleType === 'motorcycle';

    // Chassis settings for stable GTA-like feel
    // Low linear damping for responsive acceleration
    // HIGH angular damping for cars - prevents flipping and spinning
    const linearDamping = isMotorcycle ? 0.05 : 0.05;
    const angularDamping = isMotorcycle ? 1.2 : 3.5; // Very high for cars - stable like GTA

    // Create chassis rigid body
    const chassisBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(new RAPIER.Quaternion(0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2)))
      .setLinearDamping(linearDamping)
      .setAngularDamping(angularDamping);

    const chassis = this.world.createRigidBody(chassisBodyDesc);

    // Motorcycle has lower center of mass for stability
    const chassisColliderDesc = RAPIER.ColliderDesc.cuboid(
      dimensions.width / 2,
      dimensions.height / 2,
      dimensions.length / 2
    )
      // Motorcycle: ~150kg gives good balance of stability and agility
      // Cars: lighter collider for responsive handling
      .setMass(isMotorcycle ? 150 : mass / 50)
      .setFriction(isMotorcycle ? 0.8 : 0.6)
      .setRestitution(0.1);

    // Offset collider down for lower center of gravity
    if (isMotorcycle) {
      chassisColliderDesc.setTranslation(0, -0.1, 0);
    } else {
      // VERY low center of mass - key for preventing flips (GTA-style)
      chassisColliderDesc.setTranslation(0, -0.5, 0);
    }

    const collider = this.world.createCollider(chassisColliderDesc, chassis);

    // Create vehicle controller
    const controller = this.world.createVehicleController(chassis);

    // Motorcycle-specific wheel configuration for GTA5-like physics
    const wheelRadius = vehicleType === 'truck' ? 0.45 : (isMotorcycle ? 0.35 : 0.3);
    const suspensionRestLength = isMotorcycle ? 0.4 : 0.8;
    const wheelPositions = this.getWheelPositions(vehicleType, dimensions);

    const wheelDirection = { x: 0, y: -1, z: 0 };
    const wheelAxle = { x: -1, y: 0, z: 0 };

    wheelPositions.forEach((pos, index) => {
      controller.addWheel(
        pos,
        wheelDirection,
        wheelAxle,
        suspensionRestLength,
        wheelRadius
      );

      if (isMotorcycle) {
        // GTA5-style motorcycle - stiff and responsive
        controller.setWheelSuspensionStiffness(index, 50.0); // Stiffer for responsiveness
        controller.setWheelMaxSuspensionTravel(index, 0.2);
        controller.setWheelSuspensionCompression(index, 5.0);
        controller.setWheelSuspensionRelaxation(index, 4.0);
        // High grip for arcade-style control
        controller.setWheelFrictionSlip(index, 1500.0);
      } else {
        // Car/Truck - GTA-style planted, stable suspension
        // Stiff suspension = less body roll, more stable cornering
        controller.setWheelSuspensionStiffness(index, 60.0); // Very stiff for stability
        controller.setWheelMaxSuspensionTravel(index, 0.25); // Less travel = more planted
        controller.setWheelSuspensionCompression(index, 6.0); // Firm compression
        controller.setWheelSuspensionRelaxation(index, 5.0); // Quick rebound
        controller.setWheelFrictionSlip(index, 8000.0); // Very high grip - no sliding
      }
    });

    const vehicle: RapierVehicle = {
      chassis,
      collider,
      controller,
      wheelMeshes: [],
      vehicleType,
      targetLean: 0,
      currentLean: 0,
      lastSteeringInput: 0
    };

    this.vehicles.set(id, vehicle);
    return vehicle;
  }

  private getVehicleDimensions(type: VehicleType): {
    width: number;
    height: number;
    length: number;
  } {
    switch (type) {
      case 'motorcycle':
        // Wider collision box for more stability
        return { width: 0.7, height: 0.5, length: 2.0 };
      case 'truck':
        return { width: 2.2, height: 1.2, length: 5.0 };
      default:
        return { width: 1.8, height: 0.6, length: 4.0 };
    }
  }

  private getWheelPositions(
    type: VehicleType,
    dimensions: { width: number; height: number; length: number }
  ): { x: number; y: number; z: number }[] {
    // Official Three.js example uses y=0 at chassis center
    const wheelY = 0;

    if (type === 'motorcycle') {
      return [
        { x: 0, y: wheelY, z: dimensions.length * 0.4 },   // front
        { x: 0, y: wheelY, z: -dimensions.length * 0.4 },  // rear
      ];
    } else if (type === 'truck') {
      const width = dimensions.width / 2;
      const frontZ = dimensions.length * 0.35;
      const rearZ = -dimensions.length * 0.35;
      return [
        { x: -width, y: wheelY, z: frontZ },   // front-left
        { x: width, y: wheelY, z: frontZ },    // front-right
        { x: -width, y: wheelY, z: rearZ },    // rear-left
        { x: width, y: wheelY, z: rearZ },     // rear-right
      ];
    } else {
      // Car - based on official Three.js example layout
      const width = 1.0; // ~half car width
      const frontZ = 1.5; // front axle position
      const rearZ = -1.5; // rear axle position
      return [
        { x: -width, y: wheelY, z: frontZ },   // front-left
        { x: width, y: wheelY, z: frontZ },    // front-right
        { x: -width, y: wheelY, z: rearZ },    // rear-left
        { x: width, y: wheelY, z: rearZ },     // rear-right
      ];
    }
  }

  applyVehicleControls(
    id: string,
    acceleration: number,
    steering: number,
    brake: boolean,
    vehicleConfig: { acceleration: number; handling: number; braking: number },
    isSprinting: boolean = false
  ): void {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return;

    const controller = vehicle.controller;
    const numWheels = controller.numWheels();
    const isMotorcycle = vehicle.vehicleType === 'motorcycle';

    // Get current speed for acceleration boost calculation
    const linvel = vehicle.chassis.linvel();
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);

    // Engine force calculation - HIGH base force for GTA5-style punchy acceleration
    let maxEngineForce = 800 * (vehicleConfig.acceleration / 15);

    // Aggressive low speed boost - massive torque off the line
    // Fades quickly so top speed isn't crazy, but launch feels powerful
    const lowSpeedBoost = Math.max(1, 4.0 - speed * 0.25); // Very strong boost, fades by ~12 m/s
    maxEngineForce *= lowSpeedBoost;

    // Sprint boost - moderate increase, with diminishing returns at high speed
    // Prevents going out of control while still feeling responsive
    if (isSprinting) {
      const sprintEffectiveness = Math.max(0.2, 1 - speed / 40); // Fades at high speed
      maxEngineForce *= (1 + 0.4 * sprintEffectiveness); // Max 1.4x boost at low speed
    }
    // Motorcycles get extra acceleration
    if (isMotorcycle) {
      maxEngineForce *= 1.4;
    }

    const engineForce = -acceleration * maxEngineForce;

    // Steering - more responsive, tighter turning
    const maxSteer = (Math.PI / 4) * vehicleConfig.handling; // Increased from PI/5 for sharper turns
    // Speed-sensitive steering - tighter at low speed, stable at high speed
    const speedSteerFactor = Math.max(0.4, 1 - speed * 0.012);
    const steerAngle = -steering * maxSteer * speedSteerFactor;

    // Brake force - MUCH stronger for crisp stopping
    const brakeForce = brake ? (vehicleConfig.braking / 5) : 0; // 4x stronger brakes

    if (isMotorcycle) {
      // GTA5-style motorcycle controls
      // Store steering input for lean calculation
      vehicle.lastSteeringInput = steering;

      // Calculate target lean based on steering and speed (GTA5-style)
      // At low speed: minimal lean. At high speed: aggressive lean into turns
      const speedFactor = Math.min(1, speed / 15); // Full lean effect at 15+ m/s
      const maxLeanAngle = Math.PI / 4; // 45 degrees max lean
      vehicle.targetLean = steering * maxLeanAngle * speedFactor;

      // Counter-steer effect at high speed (real motorcycle physics)
      // At speed, steering input causes lean first, then turn
      const counterSteerFactor = Math.min(0.5, speed / 30);
      const effectiveSteer = steerAngle * (1 - counterSteerFactor * 0.3);

      controller.setWheelSteering(0, effectiveSteer); // front wheel
      controller.setWheelEngineForce(1, engineForce); // rear wheel drive

      // Front brake stronger for stoppies, rear for stability
      controller.setWheelBrake(0, brakeForce * 1.2);
      controller.setWheelBrake(1, brakeForce * 0.8);

      // Wheelie physics: strong acceleration pitches nose up
      if (acceleration > 0.5 && speed > 2 && speed < 20) {
        const wheelieTorque = acceleration * 3 * (1 - speed / 20);
        vehicle.chassis.applyTorqueImpulse({ x: wheelieTorque, y: 0, z: 0 }, true);
      }

      // Stoppie physics: strong front brake pitches nose down
      if (brake && speed > 5) {
        const stoppieTorque = -brakeForce * 2;
        vehicle.chassis.applyTorqueImpulse({ x: stoppieTorque, y: 0, z: 0 }, true);
      }
    } else {
      // Car/Truck - front wheel steering, rear wheel drive
      // NO drift mechanics - stable, planted GTA-style handling
      controller.setWheelSteering(0, steerAngle);
      controller.setWheelSteering(1, steerAngle);
      controller.setWheelSteering(2, 0); // Rear wheels stay straight
      controller.setWheelSteering(3, 0);
      controller.setWheelEngineForce(2, engineForce);
      controller.setWheelEngineForce(3, engineForce);

      // Even braking on all wheels for stability
      if (brake) {
        controller.setWheelBrake(0, brakeForce);
        controller.setWheelBrake(1, brakeForce);
        controller.setWheelBrake(2, brakeForce);
        controller.setWheelBrake(3, brakeForce);
      } else {
        for (let i = 0; i < numWheels; i++) {
          controller.setWheelBrake(i, 0);
        }
      }
    }
  }

  update(_deltaTime: number): void {
    if (!this.initialized) return;

    const fixedDt = 1 / 60;

    // Update all vehicle controllers
    this.vehicles.forEach((vehicle) => {
      vehicle.controller.updateVehicle(fixedDt);

      // GTA5-style motorcycle physics
      if (vehicle.vehicleType === 'motorcycle') {
        this.updateMotorcyclePhysics(vehicle, fixedDt);
      } else {
        // Anti-flip stabilization for cars
        this.updateCarStabilization(vehicle, fixedDt);
      }
    });

    this.world.step();
  }

  private updateMotorcyclePhysics(vehicle: RapierVehicle, dt: number): void {
    const chassis = vehicle.chassis;
    const rotation = chassis.rotation();
    const angvel = chassis.angvel();
    const linvel = chassis.linvel();

    // Get current speed
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);
    const verticalSpeed = Math.abs(linvel.y);
    const isAirborne = verticalSpeed > 2.0;

    // Calculate current roll angle from quaternion
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);

    // Get local axes
    const localForward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);

    // Calculate roll: angle between local up and world up
    const worldUp = new THREE.Vector3(0, 1, 0);
    const projectedUp = worldUp.clone().sub(localForward.clone().multiplyScalar(worldUp.dot(localForward)));
    projectedUp.normalize();

    let currentRoll = Math.acos(Math.max(-1, Math.min(1, localUp.dot(projectedUp))));
    if (localUp.dot(localRight.clone().cross(projectedUp)) < 0) {
      currentRoll = -currentRoll;
    }

    // Calculate pitch for wheelie/stoppie detection
    const currentPitch = Math.asin(Math.max(-1, Math.min(1, localForward.y)));

    // Smoothly interpolate current lean toward target lean
    const leanSpeed = 6.0;
    vehicle.currentLean += (vehicle.targetLean - vehicle.currentLean) * leanSpeed * dt;

    if (!isAirborne) {
      // Very strong self-righting force - keeps bike upright at all times
      // This is key for arcade-style motorcycle handling
      const baseStabilityStrength = 50; // Strong base stability
      const lowSpeedMultiplier = Math.max(1, 4 - speed * 0.2); // Much stronger at low speeds
      const stabilityStrength = baseStabilityStrength * lowSpeedMultiplier;

      // Calculate lean error for turning
      const leanError = vehicle.currentLean - currentRoll;
      const leanTorque = leanError * 30 * Math.max(0.5, speed / 15);

      // Self-righting torque - always tries to keep bike upright
      const steeringFactor = 1 - Math.abs(vehicle.lastSteeringInput) * 0.5; // Less reduction from steering
      const selfRightTorque = -currentRoll * stabilityStrength * steeringFactor;

      // Combine torques
      const combinedTorque = leanTorque + selfRightTorque;

      // Roll angular velocity damping - prevents oscillation
      const rollAngVel = angvel.x * localForward.x + angvel.y * localForward.y + angvel.z * localForward.z;
      const rollDamping = -rollAngVel * 12;

      // Apply roll stabilization torque
      const rollTorqueVec = localForward.clone().multiplyScalar(combinedTorque + rollDamping);
      chassis.applyTorqueImpulse(
        { x: rollTorqueVec.x, y: rollTorqueVec.y, z: rollTorqueVec.z },
        true
      );

      // Pitch stabilization - prevent flipping forward/backward
      if (Math.abs(currentPitch) > 0.3) { // ~17 degrees
        const pitchCorrection = -currentPitch * 20;
        chassis.applyTorqueImpulse({ x: pitchCorrection, y: 0, z: 0 }, true);
      }

      // Turn assist: leaning creates yaw (like real motorcycles)
      if (speed > 2 && Math.abs(vehicle.currentLean) > 0.05) {
        const turnAssist = vehicle.currentLean * 3.0 * Math.min(1, speed / 15);
        chassis.applyTorqueImpulse({ x: 0, y: -turnAssist, z: 0 }, true);
      }

      // Gyroscopic stability at speed - bike gets more stable when moving
      if (speed > 5) {
        const gyroStability = Math.min(1, (speed - 5) / 20);
        const gyroTorque = localForward.clone().multiplyScalar(-currentRoll * 15 * gyroStability);
        chassis.applyTorqueImpulse(
          { x: gyroTorque.x, y: gyroTorque.y, z: gyroTorque.z },
          true
        );
      }
    } else {
      // Airborne physics - strong stabilization
      const airDamping = 1.0;

      // Dampen all rotation
      chassis.applyTorqueImpulse({
        x: -angvel.x * airDamping,
        y: -angvel.y * airDamping * 0.5,
        z: -angvel.z * airDamping
      }, true);

      // Self-righting in air
      const airRightTorque = localForward.clone().multiplyScalar(-currentRoll * 10);
      chassis.applyTorqueImpulse(
        { x: airRightTorque.x, y: airRightTorque.y, z: airRightTorque.z },
        true
      );

      // Level out pitch in air
      chassis.applyTorqueImpulse({ x: -currentPitch * 8, y: 0, z: 0 }, true);
    }

    // Emergency recovery - very aggressive when about to fall
    const maxSafeRoll = Math.PI / 4; // ~45 degrees - trigger earlier
    if (Math.abs(currentRoll) > maxSafeRoll) {
      const urgency = Math.min(5, (Math.abs(currentRoll) - maxSafeRoll) / 0.2 + 1);
      const recoveryStrength = 60 * urgency;
      const recoveryTorque = localForward.clone().multiplyScalar(-currentRoll * recoveryStrength);
      chassis.applyTorqueImpulse(
        { x: recoveryTorque.x, y: recoveryTorque.y, z: recoveryTorque.z },
        true
      );
    }
  }

  /**
   * GTA-style arcade car physics stabilization
   * Key principles:
   * 1. HEAVY downforce keeps car glued to ground
   * 2. Aggressive anti-roll prevents ANY flipping
   * 3. Smooth, planted feel at all speeds
   */
  private updateCarStabilization(vehicle: RapierVehicle, dt: number): void {
    const chassis = vehicle.chassis;
    const rotation = chassis.rotation();
    const linvel = chassis.linvel();
    const angvel = chassis.angvel();

    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);

    // Get vehicle orientation
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const localForward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Check if grounded
    const uprightness = localUp.dot(worldUp);
    const isGrounded = uprightness > 0.4;

    // Calculate roll and pitch angles
    const projectedUp = worldUp.clone().sub(localForward.clone().multiplyScalar(worldUp.dot(localForward)));
    projectedUp.normalize();
    let currentRoll = Math.acos(Math.max(-1, Math.min(1, localUp.dot(projectedUp))));
    if (localUp.dot(localRight.clone().cross(projectedUp)) < 0) {
      currentRoll = -currentRoll;
    }
    const currentPitch = Math.asin(Math.max(-1, Math.min(1, localForward.y)));

    if (isGrounded) {
      // === MASSIVE DOWNFORCE ===
      // This is THE key - car feels glued to the road
      const downforceBase = 80; // Strong base downforce (4x previous)
      const downforceSpeed = speed * speed * 1.0; // Speed-squared (2.5x previous)
      const totalDownforce = downforceBase + Math.min(downforceSpeed, 500);

      const downforceVec = localUp.clone().multiplyScalar(-totalDownforce * dt);
      chassis.applyImpulse({ x: downforceVec.x, y: downforceVec.y, z: downforceVec.z }, true);

      // === CONSTANT ANGULAR DAMPING ===
      // Always damp rotations - prevents any wobble or instability
      const baseDamping = 2.0;
      chassis.applyTorqueImpulse({
        x: -angvel.x * baseDamping * dt,
        y: -angvel.y * baseDamping * dt * 0.3, // Less yaw damping for turning
        z: -angvel.z * baseDamping * dt
      }, true);

      // === AGGRESSIVE ANTI-ROLL ===
      // Start correcting at just 5 degrees - car stays flat
      const rollThreshold = Math.PI / 36; // 5 degrees
      if (Math.abs(currentRoll) > rollThreshold) {
        // Very strong correction - car should not lean much
        const correctionStrength = Math.abs(currentRoll) * 40;
        const rollTorque = localForward.clone().multiplyScalar(-Math.sign(currentRoll) * correctionStrength);
        chassis.applyTorqueImpulse(
          { x: rollTorque.x, y: rollTorque.y, z: rollTorque.z },
          true
        );
      }

      // === ANTI-PITCH ===
      // Prevent nose-diving or wheelies
      if (Math.abs(currentPitch) > Math.PI / 18) { // 10 degrees
        const pitchCorrection = -currentPitch * 30;
        chassis.applyTorqueImpulse({ x: pitchCorrection * dt, y: 0, z: 0 }, true);
      }

      // === LATERAL GRIP ===
      // Kill sideways sliding - car goes where it points
      const localVel = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
      const invQuat = quat.clone().invert();
      localVel.applyQuaternion(invQuat);

      // If sliding sideways, apply counter-force
      if (Math.abs(localVel.x) > 0.5 && speed > 2) {
        const slideCorrection = -localVel.x * 15 * dt;
        const correctionForce = localRight.clone().multiplyScalar(slideCorrection);
        chassis.applyImpulse({ x: correctionForce.x, y: 0, z: correctionForce.z }, true);
      }
    } else {
      // === AIRBORNE ===
      // Strong stabilization in air
      const airDamping = 1.5;
      chassis.applyTorqueImpulse({
        x: -angvel.x * airDamping,
        y: -angvel.y * airDamping * 0.3,
        z: -angvel.z * airDamping
      }, true);

      // Self-right aggressively
      if (uprightness < 0.9) {
        const rightingStrength = (0.9 - uprightness) * 20;
        const rollTorque = localForward.clone().multiplyScalar(-currentRoll * rightingStrength);
        chassis.applyTorqueImpulse(
          { x: rollTorque.x, y: rollTorque.y, z: rollTorque.z },
          true
        );
        // Level pitch too
        chassis.applyTorqueImpulse({ x: -currentPitch * 10, y: 0, z: 0 }, true);
      }
    }

    // === EMERGENCY FLIP RECOVERY ===
    // Kicks in at 25 degrees - way before flipping
    const criticalRoll = Math.PI / 7.2; // 25 degrees
    if (Math.abs(currentRoll) > criticalRoll) {
      const recoveryStrength = 60;
      const recoveryTorque = localForward.clone().multiplyScalar(-currentRoll * recoveryStrength);
      chassis.applyTorqueImpulse(
        { x: recoveryTorque.x, y: recoveryTorque.y, z: recoveryTorque.z },
        true
      );
    }
  }

  getVehicleTransform(id: string): {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    speed: number;
  } | null {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return null;

    const pos = vehicle.chassis.translation();
    const rot = vehicle.chassis.rotation();
    const vel = vehicle.chassis.linvel();

    // Calculate speed from velocity (horizontal only)
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

    return {
      position: new THREE.Vector3(pos.x, pos.y, pos.z),
      quaternion: new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w),
      speed
    };
  }

  getWheelTransforms(id: string): Array<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  }> {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return [];

    const transforms: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> = [];
    const controller = vehicle.controller;
    const numWheels = controller.numWheels();

    for (let i = 0; i < numWheels; i++) {
      const wheelAxle = controller.wheelAxleCs(i);
      const connectionPoint = controller.wheelChassisConnectionPointCs(i);
      const suspensionLength = controller.wheelSuspensionLength(i) ?? 0;
      const rotation = controller.wheelRotation(i) ?? 0;
      const steering = controller.wheelSteering(i) ?? 0;

      // Get chassis transform
      const chassisPos = vehicle.chassis.translation();
      const chassisRot = vehicle.chassis.rotation();

      // Calculate wheel world position
      // Apply chassis rotation to connection point
      const chassisQuat = new THREE.Quaternion(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);
      const localPos = new THREE.Vector3(
        connectionPoint?.x ?? 0,
        (connectionPoint?.y ?? 0) - suspensionLength,
        connectionPoint?.z ?? 0
      );
      localPos.applyQuaternion(chassisQuat);

      const worldPos = new THREE.Vector3(
        chassisPos.x + localPos.x,
        chassisPos.y + localPos.y,
        chassisPos.z + localPos.z
      );

      // Calculate wheel rotation (steering + spin)
      const wheelQuat = new THREE.Quaternion();
      wheelQuat.copy(chassisQuat);

      // Apply steering rotation (around Y axis)
      const steerQuat = new THREE.Quaternion();
      steerQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), steering);
      wheelQuat.multiply(steerQuat);

      // Apply wheel spin rotation (around X axis, which is the axle)
      const spinQuat = new THREE.Quaternion();
      spinQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotation);
      wheelQuat.multiply(spinQuat);

      transforms.push({
        position: worldPos,
        quaternion: wheelQuat
      });
    }

    return transforms;
  }

  removeVehicle(id: string): void {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return;

    this.world.removeRigidBody(vehicle.chassis);
    this.vehicles.delete(id);
  }

  setVehiclePosition(id: string, position: THREE.Vector3, rotation?: number): void {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return;

    vehicle.chassis.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    vehicle.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    vehicle.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);

    if (rotation !== undefined) {
      vehicle.chassis.setRotation(
        new RAPIER.Quaternion(0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2)),
        true
      );
    }
  }

  getVehicle(id: string): RapierVehicle | undefined {
    return this.vehicles.get(id);
  }

  /**
   * Make a vehicle jump - applies upward impulse if grounded
   * Returns true if jump was successful
   */
  jumpVehicle(id: string): boolean {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return false;

    const chassis = vehicle.chassis;
    const linvel = chassis.linvel();

    // Check if vehicle is roughly grounded (low vertical velocity)
    // This prevents double jumps in mid-air
    if (Math.abs(linvel.y) > 2) return false;

    // Check if at least one wheel has ground contact via suspension
    const controller = vehicle.controller;
    const numWheels = controller.numWheels();
    let hasGroundContact = false;

    for (let i = 0; i < numWheels; i++) {
      const suspensionLength = controller.wheelSuspensionLength(i) ?? 0;
      // If suspension is compressed, wheel has contact
      if (suspensionLength < 0.7) {
        hasGroundContact = true;
        break;
      }
    }

    if (!hasGroundContact) return false;

    // Apply upward impulse - different for motorcycles vs cars
    const isMotorcycle = vehicle.vehicleType === 'motorcycle';
    const jumpStrength = isMotorcycle ? 400 : 800; // Motorcycles are lighter

    // Apply impulse at center of mass
    chassis.applyImpulse({ x: 0, y: jumpStrength, z: 0 }, true);

    // Slight pitch backward for dramatic effect (wheelie style)
    if (isMotorcycle) {
      chassis.applyTorqueImpulse({ x: 5, y: 0, z: 0 }, true);
    } else {
      chassis.applyTorqueImpulse({ x: 3, y: 0, z: 0 }, true);
    }

    return true;
  }

  dispose(): void {
    this.vehicles.forEach((_, id) => this.removeVehicle(id));
    this.vehicles.clear();
  }
}
