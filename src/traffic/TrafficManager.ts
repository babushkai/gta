import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle, VehicleConfig, TrafficConfig } from '@/types';
import { Game } from '@/core/Game';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';

interface TrafficVehicle {
  vehicle: Vehicle;
  path: THREE.Vector3[];
  currentPathIndex: number;
  targetSpeed: number;
  waitTime: number;
  isWaiting: boolean;
}

interface TrafficLight {
  position: THREE.Vector3;
  mesh: THREE.Group;
  state: 'red' | 'yellow' | 'green';
  timer: number;
  direction: THREE.Vector3;
}

export class TrafficManager {
  private game: Game;
  private config: TrafficConfig;
  private trafficVehicles: Map<string, TrafficVehicle> = new Map();
  private trafficLights: TrafficLight[] = [];
  private roadNetwork: THREE.Vector3[][] = [];

  private spawnTimer: number = 0;
  private spawnInterval: number = 3;
  private maxTrafficVehicles: number = 20;

  constructor(game: Game) {
    this.game = game;
    this.config = {
      maxVehicles: 20,
      maxPedestrians: 30,
      spawnRadius: 80,
      despawnRadius: 120,
      density: 0.5
    };
  }

  async initialize(): Promise<void> {
    this.generateRoadNetwork();
    this.createTrafficLights();
    this.spawnInitialTraffic();
  }

  private generateRoadNetwork(): void {
    const gridSize = 50;
    const roadCount = 10;

    for (let i = -roadCount / 2; i <= roadCount / 2; i++) {
      const horizontalRoad: THREE.Vector3[] = [];
      const verticalRoad: THREE.Vector3[] = [];

      for (let j = -roadCount / 2; j <= roadCount / 2; j++) {
        horizontalRoad.push(new THREE.Vector3(j * gridSize, 0.5, i * gridSize));
        verticalRoad.push(new THREE.Vector3(i * gridSize, 0.5, j * gridSize));
      }

      this.roadNetwork.push(horizontalRoad);
      this.roadNetwork.push(verticalRoad);
    }
  }

  private createTrafficLights(): void {
    const gridSize = 50;
    const intersections = [
      { x: 0, z: 0 },
      { x: gridSize, z: 0 },
      { x: -gridSize, z: 0 },
      { x: 0, z: gridSize },
      { x: 0, z: -gridSize }
    ];

    intersections.forEach((pos, index) => {
      const lightMesh = this.createTrafficLightMesh();
      lightMesh.position.set(pos.x + 5, 0, pos.z + 5);
      this.game.scene.add(lightMesh);

      this.trafficLights.push({
        position: new THREE.Vector3(pos.x, 0, pos.z),
        mesh: lightMesh,
        state: index % 2 === 0 ? 'green' : 'red',
        timer: Math.random() * 10,
        direction: new THREE.Vector3(1, 0, 0)
      });
    });
  }

  private createTrafficLightMesh(): THREE.Group {
    const group = new THREE.Group();

    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 4, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 2;
    group.add(pole);

    const boxGeometry = new THREE.BoxGeometry(0.4, 1, 0.3);
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.y = 4.2;
    group.add(box);

    const lightGeometry = new THREE.SphereGeometry(0.12, 8, 8);

    const redLight = new THREE.Mesh(
      lightGeometry,
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    redLight.position.set(0, 4.5, 0.15);
    redLight.name = 'red';
    group.add(redLight);

    const yellowLight = new THREE.Mesh(
      lightGeometry,
      new THREE.MeshBasicMaterial({ color: 0x333300 })
    );
    yellowLight.position.set(0, 4.2, 0.15);
    yellowLight.name = 'yellow';
    group.add(yellowLight);

    const greenLight = new THREE.Mesh(
      lightGeometry,
      new THREE.MeshBasicMaterial({ color: 0x003300 })
    );
    greenLight.position.set(0, 3.9, 0.15);
    greenLight.name = 'green';
    group.add(greenLight);

    return group;
  }

  private spawnInitialTraffic(): void {
    for (let i = 0; i < 10; i++) {
      this.spawnTrafficVehicle();
    }
  }

  private spawnTrafficVehicle(): void {
    if (this.trafficVehicles.size >= this.maxTrafficVehicles) return;

    const playerPos = this.game.player.position;
    const road = this.roadNetwork[Math.floor(Math.random() * this.roadNetwork.length)];

    const validPoints = road.filter(p => {
      const dist = p.distanceTo(playerPos);
      return dist > 40 && dist < this.config.spawnRadius;
    });

    if (validPoints.length === 0) return;

    const spawnPoint = validPoints[Math.floor(Math.random() * validPoints.length)];
    const configs = this.game.vehicles.getVehicleConfigs();
    const config = configs[Math.floor(Math.random() * configs.length)];

    const roadIndex = road.indexOf(spawnPoint);
    const direction = roadIndex < road.length - 1
      ? road[roadIndex + 1].clone().sub(spawnPoint).normalize()
      : road[roadIndex - 1].clone().sub(spawnPoint).normalize().negate();

    const rotation = Math.atan2(direction.x, direction.z);

    const vehicle = this.game.vehicles.spawnVehicle(
      config,
      spawnPoint.clone(),
      rotation
    );

    const path = this.generatePath(road, roadIndex);

    const trafficVehicle: TrafficVehicle = {
      vehicle,
      path,
      currentPathIndex: 0,
      targetSpeed: 30 + Math.random() * 30,
      waitTime: 0,
      isWaiting: false
    };

    this.trafficVehicles.set(vehicle.id, trafficVehicle);
  }

  private generatePath(road: THREE.Vector3[], startIndex: number): THREE.Vector3[] {
    const path: THREE.Vector3[] = [];
    const direction = Math.random() > 0.5 ? 1 : -1;

    for (let i = startIndex; i >= 0 && i < road.length; i += direction) {
      path.push(road[i].clone());
    }

    if (path.length < 3) {
      const otherRoad = this.roadNetwork[Math.floor(Math.random() * this.roadNetwork.length)];
      const nearestIndex = this.findNearestPointIndex(
        otherRoad,
        path[path.length - 1] || road[startIndex]
      );

      for (let i = nearestIndex; i < otherRoad.length; i++) {
        path.push(otherRoad[i].clone());
      }
    }

    return path;
  }

  private findNearestPointIndex(road: THREE.Vector3[], point: THREE.Vector3): number {
    let nearest = 0;
    let nearestDist = Infinity;

    road.forEach((p, i) => {
      const dist = p.distanceTo(point);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });

    return nearest;
  }

  update(deltaTime: number): void {
    this.updateTrafficLights(deltaTime);
    this.updateTrafficVehicles(deltaTime);

    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnTrafficVehicle();
    }

    this.despawnDistantVehicles();
  }

  private updateTrafficLights(deltaTime: number): void {
    this.trafficLights.forEach(light => {
      light.timer += deltaTime;

      const cycleDuration = 10;
      const yellowDuration = 2;

      if (light.timer >= cycleDuration) {
        light.timer = 0;

        switch (light.state) {
          case 'green':
            light.state = 'yellow';
            break;
          case 'yellow':
            light.state = 'red';
            break;
          case 'red':
            light.state = 'green';
            break;
        }

        this.updateTrafficLightMesh(light);
      }
    });
  }

  private updateTrafficLightMesh(light: TrafficLight): void {
    const red = light.mesh.getObjectByName('red') as THREE.Mesh;
    const yellow = light.mesh.getObjectByName('yellow') as THREE.Mesh;
    const green = light.mesh.getObjectByName('green') as THREE.Mesh;

    (red.material as THREE.MeshBasicMaterial).color.setHex(
      light.state === 'red' ? 0xff0000 : 0x330000
    );
    (yellow.material as THREE.MeshBasicMaterial).color.setHex(
      light.state === 'yellow' ? 0xffff00 : 0x333300
    );
    (green.material as THREE.MeshBasicMaterial).color.setHex(
      light.state === 'green' ? 0x00ff00 : 0x003300
    );
  }

  private updateTrafficVehicles(deltaTime: number): void {
    this.trafficVehicles.forEach((traffic, id) => {
      if (traffic.vehicle.destroyed) {
        this.trafficVehicles.delete(id);
        return;
      }

      if (traffic.isWaiting) {
        traffic.waitTime -= deltaTime;
        if (traffic.waitTime <= 0) {
          traffic.isWaiting = false;
        }
        return;
      }

      const shouldStop = this.checkForObstacles(traffic) || this.checkForRedLight(traffic);

      if (shouldStop) {
        this.stopVehicle(traffic);
      } else {
        this.driveVehicle(traffic, deltaTime);
      }
    });
  }

  private checkForObstacles(traffic: TrafficVehicle): boolean {
    const vehicle = traffic.vehicle;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.mesh.quaternion);
    const rayStart = vehicle.mesh.position.clone().add(new THREE.Vector3(0, 1, 0));
    const rayEnd = rayStart.clone().add(forward.multiplyScalar(10));

    const result = this.game.physics.raycast(rayStart, rayEnd, {
      collisionFilterMask: COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.PLAYER
    });

    return result.hit && result.distance !== undefined && result.distance < 8;
  }

  private checkForRedLight(traffic: TrafficVehicle): boolean {
    const vehiclePos = traffic.vehicle.mesh.position;

    for (const light of this.trafficLights) {
      const distance = vehiclePos.distanceTo(light.position);

      if (distance < 15 && distance > 5) {
        if (light.state === 'red' || light.state === 'yellow') {
          const toLight = light.position.clone().sub(vehiclePos).normalize();
          const forward = new THREE.Vector3(0, 0, 1)
            .applyQuaternion(traffic.vehicle.mesh.quaternion);

          if (toLight.dot(forward) > 0.7) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private stopVehicle(traffic: TrafficVehicle): void {
    const body = traffic.vehicle.body;
    body.velocity.x *= 0.95;
    body.velocity.z *= 0.95;
    traffic.vehicle.currentSpeed = 0;
  }

  private driveVehicle(traffic: TrafficVehicle, deltaTime: number): void {
    if (traffic.currentPathIndex >= traffic.path.length) {
      traffic.currentPathIndex = 0;
      traffic.path = this.generatePath(
        this.roadNetwork[Math.floor(Math.random() * this.roadNetwork.length)],
        0
      );
      return;
    }

    const target = traffic.path[traffic.currentPathIndex];
    const vehicle = traffic.vehicle;
    const body = vehicle.body;

    const direction = target.clone().sub(vehicle.mesh.position);
    direction.y = 0;
    const distance = direction.length();

    if (distance < 5) {
      traffic.currentPathIndex++;
      return;
    }

    direction.normalize();

    const targetAngle = Math.atan2(direction.x, direction.z);
    const currentAngle = vehicle.mesh.rotation.y;
    let angleDiff = targetAngle - currentAngle;

    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    body.angularVelocity.y = angleDiff * 2;

    const currentSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    const speedDiff = traffic.targetSpeed / 3.6 - currentSpeed;

    if (speedDiff > 0) {
      const force = direction.clone().multiplyScalar(vehicle.config.acceleration * 50);
      body.applyForce(
        new CANNON.Vec3(force.x, 0, force.z),
        body.position
      );
    }

    vehicle.currentSpeed = currentSpeed * 3.6;
  }

  private despawnDistantVehicles(): void {
    const playerPos = this.game.player.position;

    this.trafficVehicles.forEach((traffic, id) => {
      const distance = traffic.vehicle.mesh.position.distanceTo(playerPos);

      if (distance > this.config.despawnRadius) {
        this.game.vehicles.removeVehicle(id);
        this.trafficVehicles.delete(id);
      }
    });
  }

  getTrafficDensity(): number {
    return this.trafficVehicles.size / this.maxTrafficVehicles;
  }

  setTrafficDensity(density: number): void {
    this.config.density = Math.max(0, Math.min(1, density));
    this.maxTrafficVehicles = Math.floor(20 * this.config.density);
  }

  dispose(): void {
    this.trafficVehicles.forEach((_, id) => {
      this.game.vehicles.removeVehicle(id);
    });
    this.trafficVehicles.clear();

    this.trafficLights.forEach(light => {
      this.game.scene.remove(light.mesh);
    });
    this.trafficLights = [];
  }
}
