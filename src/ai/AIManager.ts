import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Character, CharacterConfig, AIState, AIBehavior } from '@/types';
import { Game } from '@/core/Game';
import { Pathfinding } from './Pathfinding';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';
import { globalEvents } from '@/core/EventEmitter';

const CHARACTER_CONFIGS: CharacterConfig[] = [
  {
    id: 'civilian_male',
    name: 'Civilian',
    type: 'civilian',
    health: 100,
    speed: 3,
    model: 'civilian_male',
    hostile: false,
    faction: 'civilian'
  },
  {
    id: 'civilian_female',
    name: 'Civilian',
    type: 'civilian',
    health: 100,
    speed: 3,
    model: 'civilian_female',
    hostile: false,
    faction: 'civilian'
  },
  {
    id: 'gang_member',
    name: 'Gang Member',
    type: 'gang',
    health: 150,
    speed: 4,
    model: 'gang_member',
    hostile: true,
    faction: 'gang'
  },
  {
    id: 'police_officer',
    name: 'Police Officer',
    type: 'police',
    health: 200,
    speed: 4,
    model: 'police',
    hostile: false,
    faction: 'police'
  }
];

interface NPC extends Character {
  behavior: AIBehavior;
  animationMixer?: THREE.AnimationMixer;
  lastPathUpdate: number;
}

export class AIManager {
  private game: Game;
  private pathfinding: Pathfinding;
  private npcs: Map<string, NPC> = new Map();
  private npcIdCounter: number = 0;

  private maxNPCs: number = 50;
  private updateRadius: number = 100;
  private despawnRadius: number = 150;

  private behaviorUpdateInterval: number = 0.5;
  private lastBehaviorUpdate: number = 0;

  constructor(game: Game) {
    this.game = game;
    this.pathfinding = new Pathfinding();
  }

  async initialize(): Promise<void> {
    this.pathfinding.initialize(500);
    this.spawnInitialNPCs();

    globalEvents.on('wanted_level_change', (data: { level: number }) => {
      this.handleWantedLevelChange(data.level);
    });
  }

  private spawnInitialNPCs(): void {
    for (let i = 0; i < 20; i++) {
      const position = this.pathfinding.getRandomWalkablePoint(
        this.game.player.position,
        80
      );
      position.y = 1;

      const config = CHARACTER_CONFIGS[Math.floor(Math.random() * 2)];
      this.spawnNPC(config, position);
    }
  }

  spawnNPC(config: CharacterConfig, position: THREE.Vector3): NPC | null {
    if (this.npcs.size >= this.maxNPCs) return null;

    const id = `npc_${this.npcIdCounter++}`;
    const mesh = this.createNPCMesh(config);
    mesh.position.copy(position);

    const body = this.game.physics.createCharacterBody(
      id,
      0.3,
      1.8,
      70,
      position
    );

    const npc: NPC = {
      id,
      config,
      mesh,
      body,
      health: config.health,
      state: 'idle',
      currentWeapon: null,
      target: null,
      path: [],
      isDead: false,
      behavior: {
        state: 'idle',
        target: null,
        alertLevel: 0,
        lastKnownPlayerPosition: null,
        patrolPoints: this.generatePatrolPoints(position),
        currentPatrolIndex: 0
      },
      lastPathUpdate: 0
    };

    this.game.physics.linkMeshToBody(mesh, body);
    this.game.scene.add(mesh);
    this.npcs.set(id, npc);

    return npc;
  }

  private createNPCMesh(config: CharacterConfig): THREE.Group {
    const group = new THREE.Group();

    const colors: Record<string, number> = {
      civilian: 0x44aa44,
      gang: 0xaa4444,
      police: 0x4444aa,
      military: 0x444444
    };

    const bodyGeometry = new THREE.CapsuleGeometry(0.25, 1.0, 8, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: colors[config.type] || 0x888888,
      roughness: 0.7
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.75;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const headGeometry = new THREE.SphereGeometry(0.18, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffcc99,
      roughness: 0.8
    });
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.position.y = 1.55;
    headMesh.castShadow = true;
    group.add(headMesh);

    return group;
  }

  private generatePatrolPoints(origin: THREE.Vector3): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i++) {
      const point = this.pathfinding.getRandomWalkablePoint(origin, 30);
      points.push(point);
    }

    return points;
  }

  update(deltaTime: number): void {
    const playerPosition = this.game.player.position;

    this.npcs.forEach((npc, id) => {
      const distance = npc.mesh.position.distanceTo(playerPosition);

      if (distance > this.despawnRadius) {
        this.removeNPC(id);
        return;
      }

      if (distance < this.updateRadius) {
        this.updateNPC(npc, deltaTime);
      }
    });

    this.lastBehaviorUpdate += deltaTime;
    if (this.lastBehaviorUpdate >= this.behaviorUpdateInterval) {
      this.updateBehaviors();
      this.lastBehaviorUpdate = 0;
    }

    this.maintainNPCPopulation();
  }

  private updateNPC(npc: NPC, deltaTime: number): void {
    if (npc.isDead) return;

    this.game.physics.syncMeshToBody(npc.mesh);

    switch (npc.behavior.state) {
      case 'idle':
        this.handleIdleState(npc, deltaTime);
        break;
      case 'walking':
      case 'patrolling':
        this.handleWalkingState(npc, deltaTime);
        break;
      case 'running':
      case 'fleeing':
        this.handleRunningState(npc, deltaTime);
        break;
      case 'attacking':
        this.handleAttackingState(npc, deltaTime);
        break;
      case 'seeking':
        this.handleSeekingState(npc, deltaTime);
        break;
    }
  }

  private handleIdleState(npc: NPC, deltaTime: number): void {
    if (Math.random() < 0.01) {
      if (npc.config.type === 'civilian') {
        npc.behavior.state = 'patrolling';
        npc.behavior.currentPatrolIndex = 0;
      }
    }
  }

  private handleWalkingState(npc: NPC, deltaTime: number): void {
    if (npc.path.length === 0) {
      if (npc.behavior.patrolPoints.length > 0) {
        const target = npc.behavior.patrolPoints[npc.behavior.currentPatrolIndex];
        npc.path = this.pathfinding.findPath(npc.mesh.position, target);
        npc.behavior.currentPatrolIndex =
          (npc.behavior.currentPatrolIndex + 1) % npc.behavior.patrolPoints.length;
      } else {
        npc.behavior.state = 'idle';
        return;
      }
    }

    this.moveAlongPath(npc, deltaTime, npc.config.speed);
  }

  private handleRunningState(npc: NPC, deltaTime: number): void {
    const playerPos = this.game.player.position;
    const distance = npc.mesh.position.distanceTo(playerPos);

    if (npc.behavior.state === 'fleeing') {
      if (npc.path.length === 0 || distance < 10) {
        const fleeDirection = npc.mesh.position.clone().sub(playerPos).normalize();
        const fleeTarget = npc.mesh.position.clone().add(fleeDirection.multiplyScalar(30));
        npc.path = this.pathfinding.findPath(npc.mesh.position, fleeTarget);
      }

      if (distance > 50) {
        npc.behavior.state = 'walking';
        npc.behavior.alertLevel = 0;
      }
    }

    this.moveAlongPath(npc, deltaTime, npc.config.speed * 1.5);
  }

  private handleAttackingState(npc: NPC, deltaTime: number): void {
    const playerPos = this.game.player.position;
    const distance = npc.mesh.position.distanceTo(playerPos);

    this.lookAt(npc, playerPos);

    if (distance > 30) {
      npc.behavior.state = 'seeking';
      npc.behavior.lastKnownPlayerPosition = playerPos.clone();
    } else if (distance > 10) {
      if (npc.path.length === 0) {
        npc.path = this.pathfinding.findPath(npc.mesh.position, playerPos);
      }
      this.moveAlongPath(npc, deltaTime, npc.config.speed * 1.2);
    } else {
      if (npc.currentWeapon && Math.random() < 0.1) {
        this.shootAtPlayer(npc);
      }
    }
  }

  private handleSeekingState(npc: NPC, deltaTime: number): void {
    if (!npc.behavior.lastKnownPlayerPosition) {
      npc.behavior.state = 'patrolling';
      return;
    }

    const distance = npc.mesh.position.distanceTo(npc.behavior.lastKnownPlayerPosition);

    if (distance < 2) {
      const playerDistance = npc.mesh.position.distanceTo(this.game.player.position);
      if (playerDistance < 20) {
        npc.behavior.state = 'attacking';
      } else {
        npc.behavior.state = 'patrolling';
        npc.behavior.lastKnownPlayerPosition = null;
      }
    } else {
      if (npc.path.length === 0) {
        npc.path = this.pathfinding.findPath(
          npc.mesh.position,
          npc.behavior.lastKnownPlayerPosition
        );
      }
      this.moveAlongPath(npc, deltaTime, npc.config.speed * 1.2);
    }
  }

  private moveAlongPath(npc: NPC, deltaTime: number, speed: number): void {
    if (npc.path.length === 0) return;

    const target = npc.path[0];
    const direction = target.clone().sub(npc.mesh.position);
    direction.y = 0;
    const distance = direction.length();

    if (distance < 1) {
      npc.path.shift();
      return;
    }

    direction.normalize();
    this.lookAt(npc, target);

    const velocity = new CANNON.Vec3(
      direction.x * speed,
      npc.body.velocity.y,
      direction.z * speed
    );

    npc.body.velocity.x = velocity.x;
    npc.body.velocity.z = velocity.z;
  }

  private lookAt(npc: NPC, target: THREE.Vector3): void {
    const direction = target.clone().sub(npc.mesh.position);
    direction.y = 0;
    const angle = Math.atan2(direction.x, direction.z);
    npc.mesh.rotation.y = angle;
  }

  private shootAtPlayer(npc: NPC): void {
    if (!npc.currentWeapon) return;

    const direction = this.game.player.position.clone().sub(npc.mesh.position);
    direction.normalize();

    const accuracy = 0.8;
    direction.x += (Math.random() - 0.5) * (1 - accuracy);
    direction.z += (Math.random() - 0.5) * (1 - accuracy);

    const hit = Math.random() < accuracy;
    if (hit) {
      this.game.player.takeDamage(npc.currentWeapon.config.damage, direction);
    }

    this.game.audio.playSound('gunshot');
  }

  private updateBehaviors(): void {
    const playerPos = this.game.player.position;
    const wantedLevel = this.game.player.stats.wantedLevel;

    this.npcs.forEach(npc => {
      if (npc.isDead) return;

      const distance = npc.mesh.position.distanceTo(playerPos);

      if (npc.config.type === 'civilian') {
        if (wantedLevel >= 1 && distance < 30) {
          npc.behavior.state = 'fleeing';
          npc.behavior.alertLevel = 100;
        }
      } else if (npc.config.type === 'police') {
        if (wantedLevel >= 1 && distance < 50) {
          npc.behavior.state = 'attacking';
          npc.behavior.alertLevel = 100;
        }
      } else if (npc.config.hostile) {
        if (distance < 20) {
          npc.behavior.state = 'attacking';
          npc.behavior.alertLevel = 100;
        }
      }

      if (npc.behavior.alertLevel > 0) {
        npc.behavior.alertLevel = Math.max(0, npc.behavior.alertLevel - 1);
      }
    });
  }

  private handleWantedLevelChange(level: number): void {
    if (level >= 2) {
      for (let i = 0; i < level; i++) {
        const position = this.pathfinding.getRandomWalkablePoint(
          this.game.player.position,
          60
        );
        position.y = 1;

        const policeConfig = CHARACTER_CONFIGS.find(c => c.type === 'police')!;
        const npc = this.spawnNPC(policeConfig, position);
        if (npc) {
          npc.behavior.state = 'seeking';
          npc.behavior.lastKnownPlayerPosition = this.game.player.position.clone();
        }
      }
    }
  }

  private maintainNPCPopulation(): void {
    const playerPos = this.game.player.position;
    const activeNPCs = Array.from(this.npcs.values()).filter(
      npc => npc.mesh.position.distanceTo(playerPos) < this.updateRadius
    );

    if (activeNPCs.length < 15) {
      const spawnPos = this.pathfinding.getRandomWalkablePoint(playerPos, 70);
      spawnPos.y = 1;

      if (spawnPos.distanceTo(playerPos) > 40) {
        const config = CHARACTER_CONFIGS[Math.floor(Math.random() * 2)];
        this.spawnNPC(config, spawnPos);
      }
    }
  }

  damageNPC(npcId: string, damage: number, fromDirection?: THREE.Vector3): void {
    const npc = this.npcs.get(npcId);
    if (!npc || npc.isDead) return;

    npc.health -= damage;

    if (npc.health <= 0) {
      this.killNPC(npc);
    } else {
      if (npc.config.hostile) {
        npc.behavior.state = 'attacking';
        npc.behavior.alertLevel = 100;
      } else {
        npc.behavior.state = 'fleeing';
      }

      if (fromDirection) {
        const pushForce = fromDirection.normalize().multiplyScalar(-100);
        npc.body.applyImpulse(
          new CANNON.Vec3(pushForce.x, 50, pushForce.z),
          npc.body.position
        );
      }
    }
  }

  private killNPC(npc: NPC): void {
    npc.isDead = true;
    npc.state = 'dead';
    npc.behavior.state = 'dead';

    npc.body.mass = 0;
    npc.body.velocity.setZero();

    npc.mesh.rotation.x = Math.PI / 2;
    npc.mesh.position.y = 0.3;

    globalEvents.emit('npc_killed', {
      id: npc.id,
      type: npc.config.type
    });

    if (npc.config.type === 'civilian') {
      this.game.player.setWantedLevel(this.game.player.stats.wantedLevel + 1);
    }

    setTimeout(() => {
      this.removeNPC(npc.id);
    }, 10000);
  }

  removeNPC(id: string): void {
    const npc = this.npcs.get(id);
    if (npc) {
      this.game.scene.remove(npc.mesh);
      this.game.physics.removeBody(id);
      this.npcs.delete(id);
    }
  }

  getNPC(id: string): NPC | undefined {
    return this.npcs.get(id);
  }

  getNPCsInRadius(position: THREE.Vector3, radius: number): NPC[] {
    const result: NPC[] = [];
    this.npcs.forEach(npc => {
      if (npc.mesh.position.distanceTo(position) < radius) {
        result.push(npc);
      }
    });
    return result;
  }

  getPathfinding(): Pathfinding {
    return this.pathfinding;
  }

  dispose(): void {
    this.npcs.forEach((_, id) => this.removeNPC(id));
  }
}
