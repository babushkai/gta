import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { PhysicsConfig, CollisionResult } from '@/types';

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
    this.world.allowSleep = false;

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

    // Vehicle-Ground contact: No bounce, some friction for traction
    const vehicleGroundContact = new CANNON.ContactMaterial(
      this.vehicleMaterial,
      this.groundMaterial,
      {
        friction: 0.1,
        restitution: 0
      }
    );
    this.world.addContactMaterial(vehicleGroundContact);
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
    const chassisShape = new CANNON.Box(
      new CANNON.Vec3(dimensions.width / 2, dimensions.height / 2, dimensions.length / 2)
    );

    const body = new CANNON.Body({
      mass,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: this.vehicleMaterial,
      linearDamping: 0.01,
      angularDamping: 0.3,
      allowSleep: false,
      collisionFilterGroup: COLLISION_GROUPS.VEHICLE,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.STATIC | COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.NPC | COLLISION_GROUPS.PLAYER
    });

    body.addShape(chassisShape);

    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
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

  dispose(): void {
    this.bodies.forEach((_, id) => this.removeBody(id));
    this.bodies.clear();
  }
}
