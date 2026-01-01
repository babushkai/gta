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

    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d,
      roughness: 0.9,
      metalness: 0.1
    });

    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;

    this.game.scene.add(this.ground);
  }

  private createRoads(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.9
    });

    const laneMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff
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
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.2
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.addWindows(mesh, width, height, depth);

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

  private addWindows(
    building: THREE.Mesh,
    width: number,
    height: number,
    depth: number
  ): void {
    const windowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 0.5
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

          if (Math.random() > 0.5) {
            (window.material as THREE.MeshBasicMaterial).color.setHex(0x333333);
            (window.material as THREE.MeshBasicMaterial).opacity = 0.8;
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
    const pickupLocations: Array<{ type: PickupType; position: THREE.Vector3; value: number }> = [
      { type: 'health', position: new THREE.Vector3(20, 1, 20), value: 25 },
      { type: 'health', position: new THREE.Vector3(-30, 1, 40), value: 25 },
      { type: 'armor', position: new THREE.Vector3(50, 1, -30), value: 50 },
      { type: 'money', position: new THREE.Vector3(-20, 1, -40), value: 100 },
      { type: 'money', position: new THREE.Vector3(80, 1, 60), value: 250 },
      { type: 'weapon', position: new THREE.Vector3(40, 1, 50), value: 0 },
      { type: 'ammo', position: new THREE.Vector3(-60, 1, 30), value: 50 }
    ];

    pickupLocations.forEach(pickup => {
      this.createPickup(pickup.type, pickup.position, pickup.value);
    });
  }

  private createPickup(type: PickupType, position: THREE.Vector3, value: number): Pickup {
    const colors: Record<PickupType, number> = {
      health: 0xff0000,
      armor: 0x0000ff,
      money: 0x00ff00,
      weapon: 0xffff00,
      ammo: 0xff8800,
      special: 0xff00ff
    };

    const geometry = new THREE.OctahedronGeometry(0.5);
    const material = new THREE.MeshStandardMaterial({
      color: colors[type],
      emissive: colors[type],
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.8
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;

    this.game.scene.add(mesh);

    const id = `pickup_${this.pickupIdCounter++}`;
    const pickup: Pickup = {
      id,
      type,
      value,
      mesh,
      position,
      respawnTime: 60,
      collected: false
    };

    this.pickups.set(id, pickup);
    return pickup;
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
        this.game.inventory.addWeapon('smg');
        break;
      case 'ammo':
        this.game.inventory.addAmmoByType('pistol', pickup.value);
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
