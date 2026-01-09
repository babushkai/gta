import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { PhysicsConfig, CollisionResult, VehicleType } from '@/types';

export const COLLISION_GROUPS = {
  GROUND: 1,
  PLAYER: 2,
  VEHICLE: 4,
  NPC: 8,
  PROJECTILE: 16,
  STATIC: 32,
  DYNAMIC: 64,
  TRIGGER: 128
};

export class PhysicsWorld {
  public world: CANNON.World;
  private config: PhysicsConfig;
  private bodies: Map<string, CANNON.Body> = new Map();
  private meshBodyMap: WeakMap<THREE.Object3D, CANNON.Body> = new WeakMap();
  private bodyMeshMap: WeakMap<CANNON.Body, THREE.Object3D> = new WeakMap();
  private contactMaterial: CANNON.ContactMaterial;
  private defaultMaterial: CANNON.Material;
  private playerMaterial: CANNON.Material;
  private groundMaterial: CANNON.Material;
  private vehicleMaterial: CANNON.Material;

  constructor(config: PhysicsConfig) {
    this.config = config;

    this.world = new CANNON.World();
    this.world.gravity.set(0, config.gravity, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    // Enable sleep for performance - stationary bodies won't be simulated
    this.world.allowSleep = true;

    // Create materials
    this.defaultMaterial = new CANNON.Material('default');
    this.playerMaterial = new CANNON.Material('player');
    this.groundMaterial = new CANNON.Material('ground');
    this.vehicleMaterial = new CANNON.Material('vehicle');

    // Default contact material
    this.contactMaterial = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: config.friction,
        restitution: config.restitution
      }
    );
    this.world.addContactMaterial(this.contactMaterial);
    this.world.defaultContactMaterial = this.contactMaterial;

    // Player-Ground contact: ZERO friction for smooth movement
    const playerGroundContact = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.groundMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(playerGroundContact);

    // Player-Default contact: ZERO friction
    const playerDefaultContact = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.defaultMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(playerDefaultContact);

    // Vehicle-Ground contact: No bounce, moderate friction for traction
    const vehicleGroundContact = new CANNON.ContactMaterial(
      this.vehicleMaterial,
      this.groundMaterial,
      {
        friction: 0.3, // Some friction for realistic traction
        restitution: 0, // No bounce
        contactEquationStiffness: 1e8, // Stiff contact to prevent sinking
        contactEquationRelaxation: 3
      }
    );
    this.world.addContactMaterial(vehicleGroundContact);

    // Vehicle-Vehicle contact: Prevent vehicles bouncing off each other
    const vehicleVehicleContact = new CANNON.ContactMaterial(
      this.vehicleMaterial,
      this.vehicleMaterial,
      {
        friction: 0.5,
        restitution: 0.1
      }
    );
    this.world.addContactMaterial(vehicleVehicleContact);
  }

  async initialize(): Promise<void> {
    console.log('Physics world initialized');
  }

  update(deltaTime: number): void {
    this.world.step(1 / 60, deltaTime, this.config.substeps);
  }

  createGroundPlane(size: number = 1000): CANNON.Body {
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      material: this.groundMaterial,
      collisionFilterGroup: COLLISION_GROUPS.GROUND,
      collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.NPC | COLLISION_GROUPS.DYNAMIC
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
    this.bodies.set('ground', groundBody);
    return groundBody;
  }

  createBoxBody(
    id: string,
    width: number,
    height: number,
    depth: number,
    mass: number,
    position: THREE.Vector3,
    collisionGroup: number = COLLISION_GROUPS.DYNAMIC
  ): CANNON.Body {
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const body = new CANNON.Body({
      mass,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      collisionFilterGroup: collisionGroup,
      collisionFilterMask: -1
    });

    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  createSphereBody(
    id: string,
    radius: number,
    mass: number,
    position: THREE.Vector3,
    collisionGroup: number = COLLISION_GROUPS.DYNAMIC
  ): CANNON.Body {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      collisionFilterGroup: collisionGroup,
      collisionFilterMask: -1
    });

    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  createCylinderBody(
    id: string,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    mass: number,
    position: THREE.Vector3,
    collisionGroup: number = COLLISION_GROUPS.DYNAMIC
  ): CANNON.Body {
    const shape = new CANNON.Cylinder(radiusTop, radiusBottom, height, 16);
    const body = new CANNON.Body({
      mass,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      collisionFilterGroup: collisionGroup,
      collisionFilterMask: -1
    });

    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  createCharacterBody(
    id: string,
    radius: number,
    height: number,
    mass: number,
    position: THREE.Vector3
  ): CANNON.Body {
    const sphereShape = new CANNON.Sphere(radius);
    const cylinderShape = new CANNON.Cylinder(radius, radius, height - radius * 2, 8);

    const body = new CANNON.Body({
      mass,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: this.playerMaterial,
      fixedRotation: true,
      linearDamping: 0,
      angularDamping: 0,
      allowSleep: false,
      collisionFilterGroup: COLLISION_GROUPS.PLAYER,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.STATIC | COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.DYNAMIC
    });

    body.addShape(sphereShape, new CANNON.Vec3(0, radius, 0));
    body.addShape(cylinderShape, new CANNON.Vec3(0, height / 2, 0));
    body.addShape(sphereShape, new CANNON.Vec3(0, height - radius, 0));

    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  createVehicleBody(
    id: string,
    dimensions: { width: number; height: number; length: number },
    mass: number,
    position: THREE.Vector3
  ): CANNON.Body {
    // Create chassis shape - thin box above wheel line
    // Based on cannon-es example: chassis should be above where wheels connect
    const chassisShape = new CANNON.Box(
      new CANNON.Vec3(dimensions.width / 2, 0.25, dimensions.length / 2)
    );

    const chassisBody = new CANNON.Body({
      mass,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: this.vehicleMaterial,
      allowSleep: false,
      collisionFilterGroup: COLLISION_GROUPS.VEHICLE,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.STATIC | COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.NPC | COLLISION_GROUPS.PLAYER
    });

    // Position chassis shape above wheel connection points
    // Wheels connect at y=0, chassis should be above that
    chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.5, 0));

    this.world.addBody(chassisBody);
    this.bodies.set(id, chassisBody);
    return chassisBody;
  }

  createRaycastVehicle(
    chassisBody: CANNON.Body,
    vehicleType: VehicleType
  ): CANNON.RaycastVehicle {
    const vehicle = new CANNON.RaycastVehicle({
      chassisBody,
      indexRightAxis: 0,    // x
      indexUpAxis: 1,       // y
      indexForwardAxis: 2,  // z
    });

    // Wheel options based on vehicle type
    const wheelRadius = vehicleType === 'truck' ? 0.45 : vehicleType === 'motorcycle' ? 0.35 : 0.35;
    const suspensionRestLength = vehicleType === 'truck' ? 0.4 : 0.3;

    const wheelOptions = {
      radius: wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 30,
      suspensionRestLength: suspensionRestLength,
      frictionSlip: 1.5,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 100000,
      rollInfluence: 0.01,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      maxSuspensionTravel: 0.5, // Increased for more suspension travel
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
    };

    // Get wheel positions based on vehicle type
    const wheelPositions = this.getWheelPositions(vehicleType);

    // Add wheels
    wheelPositions.forEach((pos, index) => {
      wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(pos.x, pos.y, pos.z);
      vehicle.addWheel(wheelOptions);
    });

    vehicle.addToWorld(this.world);

    return vehicle;
  }

  private getWheelPositions(vehicleType: VehicleType): CANNON.Vec3[] {
    // Wheel connection points relative to chassis body center
    // Y should be at or slightly below body center so suspension can extend downward
    const connectionY = 0; // At body center, suspension extends down from here

    if (vehicleType === 'motorcycle') {
      return [
        new CANNON.Vec3(0, connectionY, 1.0),   // front
        new CANNON.Vec3(0, connectionY, -1.0),  // rear
      ];
    } else if (vehicleType === 'truck') {
      const width = 1.1;
      const frontZ = 2.0;
      const rearZ = -1.8;
      return [
        new CANNON.Vec3(-width, connectionY, frontZ),  // front-left
        new CANNON.Vec3(width, connectionY, frontZ),   // front-right
        new CANNON.Vec3(-width, connectionY, rearZ),   // rear-left
        new CANNON.Vec3(width, connectionY, rearZ),    // rear-right
      ];
    } else {
      // Car
      const width = 0.9;
      const frontZ = 1.4;
      const rearZ = -1.4;
      return [
        new CANNON.Vec3(-width, connectionY, frontZ),  // front-left
        new CANNON.Vec3(width, connectionY, frontZ),   // front-right
        new CANNON.Vec3(-width, connectionY, rearZ),   // rear-left
        new CANNON.Vec3(width, connectionY, rearZ),    // rear-right
      ];
    }
  }

  removeRaycastVehicle(vehicle: CANNON.RaycastVehicle): void {
    vehicle.removeFromWorld(this.world);
  }

  createTriggerBody(
    id: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
    callback: (body: CANNON.Body) => void
  ): CANNON.Body {
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const body = new CANNON.Body({
      mass: 0,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      collisionFilterGroup: COLLISION_GROUPS.TRIGGER,
      collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.VEHICLE,
      isTrigger: true
    });

    body.addEventListener('collide', (event: { body: CANNON.Body }) => {
      callback(event.body);
    });

    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  linkMeshToBody(mesh: THREE.Object3D, body: CANNON.Body): void {
    this.meshBodyMap.set(mesh, body);
    this.bodyMeshMap.set(body, mesh);
  }

  syncMeshToBody(mesh: THREE.Object3D): void {
    const body = this.meshBodyMap.get(mesh);
    if (body) {
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
    }
  }

  raycast(
    from: THREE.Vector3,
    to: THREE.Vector3,
    options?: {
      collisionFilterMask?: number;
      skipBackfaces?: boolean;
    }
  ): CollisionResult {
    const rayResult = new CANNON.RaycastResult();
    const fromVec = new CANNON.Vec3(from.x, from.y, from.z);
    const toVec = new CANNON.Vec3(to.x, to.y, to.z);

    this.world.raycastClosest(fromVec, toVec, {
      collisionFilterMask: options?.collisionFilterMask ?? -1,
      skipBackfaces: options?.skipBackfaces ?? true
    }, rayResult);

    if (rayResult.hasHit) {
      return {
        hit: true,
        point: new THREE.Vector3(
          rayResult.hitPointWorld.x,
          rayResult.hitPointWorld.y,
          rayResult.hitPointWorld.z
        ),
        normal: new THREE.Vector3(
          rayResult.hitNormalWorld.x,
          rayResult.hitNormalWorld.y,
          rayResult.hitNormalWorld.z
        ),
        distance: rayResult.distance,
        object: rayResult.body ?? undefined
      };
    }

    return { hit: false };
  }

  sphereCast(
    center: THREE.Vector3,
    radius: number,
    collisionFilterMask?: number
  ): CANNON.Body[] {
    const results: CANNON.Body[] = [];
    const centerVec = new CANNON.Vec3(center.x, center.y, center.z);

    this.world.bodies.forEach(body => {
      if (collisionFilterMask && !(body.collisionFilterGroup & collisionFilterMask)) {
        return;
      }

      const distance = body.position.distanceTo(centerVec);
      const bodyRadius = this.getBodyRadius(body);

      if (distance <= radius + bodyRadius) {
        results.push(body);
      }
    });

    return results;
  }

  private getBodyRadius(body: CANNON.Body): number {
    let maxRadius = 0;

    body.shapes.forEach(shape => {
      if (shape instanceof CANNON.Sphere) {
        maxRadius = Math.max(maxRadius, shape.radius);
      } else if (shape instanceof CANNON.Box) {
        const halfExtents = shape.halfExtents;
        maxRadius = Math.max(
          maxRadius,
          Math.sqrt(halfExtents.x ** 2 + halfExtents.y ** 2 + halfExtents.z ** 2)
        );
      }
    });

    return maxRadius;
  }

  applyImpulse(bodyId: string, impulse: THREE.Vector3, worldPoint?: THREE.Vector3): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      const impulseVec = new CANNON.Vec3(impulse.x, impulse.y, impulse.z);
      const pointVec = worldPoint
        ? new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z)
        : body.position;
      body.applyImpulse(impulseVec, pointVec);
    }
  }

  applyForce(bodyId: string, force: THREE.Vector3, worldPoint?: THREE.Vector3): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      const forceVec = new CANNON.Vec3(force.x, force.y, force.z);
      const pointVec = worldPoint
        ? new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z)
        : body.position;
      body.applyForce(forceVec, pointVec);
    }
  }

  getBody(id: string): CANNON.Body | undefined {
    return this.bodies.get(id);
  }

  removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (body) {
      const mesh = this.bodyMeshMap.get(body);
      if (mesh) {
        this.meshBodyMap.delete(mesh);
      }
      this.bodyMeshMap.delete(body);
      this.world.removeBody(body);
      this.bodies.delete(id);
    }
  }

  setBodyPosition(bodyId: string, position: THREE.Vector3): void {
    const body = this.bodies.get(bodyId);
    if (body) {
      body.position.set(position.x, position.y, position.z);
      body.velocity.setZero();
      body.angularVelocity.setZero();
    }
  }

  /**
   * Create multiple box bodies at once (for chunk loading)
   * More efficient than individual createBoxBody calls
   */
  createBodiesForChunk(definitions: Array<{
    id: string;
    width: number;
    height: number;
    depth: number;
    mass: number;
    position: THREE.Vector3;
    collisionGroup?: number;
  }>): string[] {
    const ids: string[] = [];

    for (const def of definitions) {
      const shape = new CANNON.Box(new CANNON.Vec3(def.width / 2, def.height / 2, def.depth / 2));
      const body = new CANNON.Body({
        mass: def.mass,
        shape,
        position: new CANNON.Vec3(def.position.x, def.position.y, def.position.z),
        collisionFilterGroup: def.collisionGroup ?? COLLISION_GROUPS.STATIC,
        collisionFilterMask: -1
      });

      // Static bodies should sleep immediately
      if (def.mass === 0) {
        body.sleepState = CANNON.Body.SLEEPING;
      }

      this.world.addBody(body);
      this.bodies.set(def.id, body);
      ids.push(def.id);
    }

    return ids;
  }

  /**
   * Remove multiple bodies at once (for chunk unloading)
   * More efficient than individual removeBody calls
   */
  removeBodiesForChunk(ids: string[]): void {
    for (const id of ids) {
      const body = this.bodies.get(id);
      if (body) {
        const mesh = this.bodyMeshMap.get(body);
        if (mesh) {
          this.meshBodyMap.delete(mesh);
        }
        this.bodyMeshMap.delete(body);
        this.world.removeBody(body);
        this.bodies.delete(id);
      }
    }
  }

  /**
   * Check if a body exists
   */
  hasBody(id: string): boolean {
    return this.bodies.has(id);
  }

  /**
   * Get count of active bodies
   */
  getBodyCount(): number {
    return this.bodies.size;
  }

  dispose(): void {
    this.bodies.forEach((_, id) => this.removeBody(id));
    this.bodies.clear();
  }
}
