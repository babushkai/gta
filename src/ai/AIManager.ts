import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Character, CharacterConfig, AIState, AIBehavior } from '@/types';
import { Game } from '@/core/Game';
import { Pathfinding } from './Pathfinding';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';
import { globalEvents } from '@/core/EventEmitter';
import { ProceduralCharacterAnimator } from '@/animation/CharacterAnimator';

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

// Animation body part references for NPCs
interface NPCBodyParts {
  head: THREE.Group;
  torso: THREE.Mesh;
  leftThigh: THREE.Mesh;
  rightThigh: THREE.Mesh;
  leftCalf: THREE.Mesh;
  rightCalf: THREE.Mesh;
  leftUpperArm: THREE.Mesh;
  rightUpperArm: THREE.Mesh;
  leftForearm: THREE.Mesh;
  rightForearm: THREE.Mesh;
}

interface NPC extends Character {
  behavior: AIBehavior;
  animationMixer?: THREE.AnimationMixer;
  lastPathUpdate: number;
  bodyParts?: NPCBodyParts;
  animator?: ProceduralCharacterAnimator;
  actualVelocity: number;
}

export class AIManager {
  private game: Game;
  private pathfinding: Pathfinding;
  private npcs: Map<string, NPC> = new Map();
  private npcIdCounter: number = 0;

  private maxNPCs: number;
  private updateRadius: number;
  private despawnRadius: number;
  private targetNPCCount: number;

  private behaviorUpdateInterval: number = 0.5;
  private lastBehaviorUpdate: number = 0;
  private isMobile: boolean;

  // Performance: pathfinding cooldown to prevent A* spam
  private pathfindCooldown: number = 500; // ms between pathfinding attempts

  constructor(game: Game) {
    this.game = game;
    this.pathfinding = new Pathfinding();

    // Detect mobile for performance
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                    ('ontouchstart' in window) ||
                    window.innerWidth < 768;

    // Reduce NPC count on mobile
    this.maxNPCs = this.isMobile ? 10 : 30;
    this.updateRadius = this.isMobile ? 50 : 100;
    this.despawnRadius = this.isMobile ? 80 : 150;
    this.targetNPCCount = this.isMobile ? 5 : 15;
  }

  async initialize(): Promise<void> {
    this.pathfinding.initialize(500);
    this.spawnInitialNPCs();

    globalEvents.on('wanted_level_change', (data: { level: number }) => {
      this.handleWantedLevelChange(data.level);
    });
  }

  private spawnInitialNPCs(): void {
    // Spawn civilians (reduced on mobile)
    for (let i = 0; i < this.targetNPCCount; i++) {
      const position = this.pathfinding.getRandomWalkablePoint(
        this.game.player.position,
        80
      );
      position.y = 1;

      const config = CHARACTER_CONFIGS[Math.floor(Math.random() * 2)];
      this.spawnNPC(config, position);
    }

    // Spawn some gang members for combat
    const gangConfig = CHARACTER_CONFIGS.find(c => c.type === 'gang')!;
    for (let i = 0; i < 5; i++) {
      const position = this.pathfinding.getRandomWalkablePoint(
        this.game.player.position,
        60
      );
      position.y = 1;
      this.spawnNPC(gangConfig, position);
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

    // Assign weapons to hostile NPCs and police
    let weapon = null;
    if (config.hostile) {
      // Gang members get random weapons
      const gangWeapons = ['pistol', 'uzi', 'shotgun'];
      const randomWeapon = gangWeapons[Math.floor(Math.random() * gangWeapons.length)];
      weapon = this.game.weapons.createNPCWeapon(randomWeapon);
    } else if (config.type === 'police') {
      // Police get pistols
      weapon = this.game.weapons.createNPCWeapon('pistol');
    }

    const npc: NPC = {
      id,
      config,
      mesh,
      body,
      health: config.health,
      state: 'idle',
      currentWeapon: weapon,
      target: null,
      path: [],
      isDead: false,
      behavior: {
        state: 'idle',
        target: null,
        alertLevel: 0,
        lastKnownPlayerPosition: null,
        patrolPoints: this.generatePatrolPoints(position),
        currentPatrolIndex: 0,
        provoked: false
      },
      lastPathUpdate: 0,
      actualVelocity: 0
    };

    this.game.physics.linkMeshToBody(mesh, body);
    this.game.scene.add(mesh);
    this.npcs.set(id, npc);

    // Copy body part references for animation and setup animator
    if (mesh.userData.bodyParts) {
      npc.bodyParts = mesh.userData.bodyParts as NPCBodyParts;

      // Create distance-based animator for natural movement
      npc.animator = new ProceduralCharacterAnimator();
      npc.animator.setBodyParts({
        head: npc.bodyParts.head,
        torso: npc.bodyParts.torso,
        leftThigh: npc.bodyParts.leftThigh,
        rightThigh: npc.bodyParts.rightThigh,
        leftCalf: npc.bodyParts.leftCalf,
        rightCalf: npc.bodyParts.rightCalf,
        leftUpperArm: npc.bodyParts.leftUpperArm,
        rightUpperArm: npc.bodyParts.rightUpperArm,
        leftForearm: npc.bodyParts.leftForearm,
        rightForearm: npc.bodyParts.rightForearm
      });
    }

    // Attach weapon mesh if NPC has a weapon
    if (npc.currentWeapon) {
      this.attachWeaponToNPC(npc);
    }

    return npc;
  }

  private createNPCMesh(config: CharacterConfig): THREE.Group {
    const group = new THREE.Group();

    // Different skin tones for variety
    const skinTones = [0xe0b090, 0xd4a574, 0xc68642, 0x8d5524, 0xffdbac];
    const skinColor = skinTones[Math.floor(Math.random() * skinTones.length)];

    // Clothing colors based on type
    const clothingColors: Record<string, { shirt: number; pants: number }> = {
      civilian: {
        shirt: [0x2244aa, 0x44aa44, 0xaa4444, 0x888888, 0x224422, 0xaaaa44][Math.floor(Math.random() * 6)],
        pants: [0x222222, 0x333355, 0x443322, 0x555555][Math.floor(Math.random() * 4)]
      },
      gang: { shirt: 0xaa2222, pants: 0x222222 },
      police: { shirt: 0x2233aa, pants: 0x222244 },
      military: { shirt: 0x4a5c3a, pants: 0x3a4a2a }
    };

    const colors = clothingColors[config.type] || clothingColors.civilian;

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.7,
      metalness: 0.0
    });

    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: colors.shirt,
      roughness: 0.8,
      metalness: 0.0
    });

    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: colors.pants,
      roughness: 0.9,
      metalness: 0.0
    });

    const shoeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.6,
      metalness: 0.1
    });

    // Head group for face details
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.65;
    headGroup.name = 'head';
    group.add(headGroup);

    // Head - slightly oval
    const headGeometry = new THREE.SphereGeometry(0.14, 16, 16);
    headGeometry.scale(1, 1.1, 0.95);
    const headMesh = new THREE.Mesh(headGeometry, skinMaterial);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // === FACE DETAILS ===
    const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const eyePupilMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.2 });
    const eyebrowMaterial = new THREE.MeshStandardMaterial({ color: skinColor === 0x1a1a1a ? 0x0a0a0a : 0x1a1a1a, roughness: 0.9 });
    const lipMaterial = new THREE.MeshStandardMaterial({ color: 0xc47a7a, roughness: 0.6 });

    // Eye whites
    const eyeWhiteGeometry = new THREE.SphereGeometry(0.02, 6, 6);
    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial);
    leftEyeWhite.position.set(-0.04, 0.02, 0.1);
    leftEyeWhite.scale.set(1, 0.7, 0.5);
    headGroup.add(leftEyeWhite);

    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial);
    rightEyeWhite.position.set(0.04, 0.02, 0.1);
    rightEyeWhite.scale.set(1, 0.7, 0.5);
    headGroup.add(rightEyeWhite);

    // Pupils
    const pupilGeometry = new THREE.SphereGeometry(0.01, 6, 6);
    const leftPupil = new THREE.Mesh(pupilGeometry, eyePupilMaterial);
    leftPupil.position.set(-0.04, 0.02, 0.115);
    headGroup.add(leftPupil);

    const rightPupil = new THREE.Mesh(pupilGeometry, eyePupilMaterial);
    rightPupil.position.set(0.04, 0.02, 0.115);
    headGroup.add(rightPupil);

    // Eyebrows
    const eyebrowGeometry = new THREE.BoxGeometry(0.035, 0.007, 0.012);
    const leftEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
    leftEyebrow.position.set(-0.04, 0.055, 0.1);
    leftEyebrow.rotation.z = 0.1;
    headGroup.add(leftEyebrow);

    const rightEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
    rightEyebrow.position.set(0.04, 0.055, 0.1);
    rightEyebrow.rotation.z = -0.1;
    headGroup.add(rightEyebrow);

    // Nose
    const noseGeometry = new THREE.ConeGeometry(0.012, 0.035, 4);
    const nose = new THREE.Mesh(noseGeometry, skinMaterial);
    nose.position.set(0, -0.01, 0.11);
    nose.rotation.x = Math.PI / 2;
    headGroup.add(nose);

    // Mouth
    const mouthGeometry = new THREE.BoxGeometry(0.035, 0.005, 0.008);
    const mouth = new THREE.Mesh(mouthGeometry, lipMaterial);
    mouth.position.set(0, -0.05, 0.1);
    headGroup.add(mouth);

    // Hair - random styles
    const hairColors = [0x1a1a1a, 0x3a2a1a, 0x5a4a3a, 0x8a6a4a, 0xaa8866];
    const hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];
    const hairMaterial = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

    if (Math.random() > 0.3) { // 70% have visible hair
      const hairGeometry = new THREE.SphereGeometry(0.145, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const hair = new THREE.Mesh(hairGeometry, hairMaterial);
      hair.position.y = 0.03; // Relative to head group
      hair.scale.set(1, 0.7 + Math.random() * 0.3, 1);
      headGroup.add(hair);
    }

    // Neck
    const neckGeometry = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8);
    const neck = new THREE.Mesh(neckGeometry, skinMaterial);
    neck.position.y = 1.48;
    group.add(neck);

    // Torso - upper (chest)
    const chestGeometry = new THREE.BoxGeometry(0.36, 0.26, 0.18);
    const chest = new THREE.Mesh(chestGeometry, shirtMaterial);
    chest.position.y = 1.28;
    chest.name = 'torso';
    chest.castShadow = true;
    group.add(chest);

    // Torso - lower (abdomen)
    const abdomenGeometry = new THREE.BoxGeometry(0.32, 0.18, 0.16);
    const abdomen = new THREE.Mesh(abdomenGeometry, shirtMaterial);
    abdomen.position.y = 1.04;
    abdomen.castShadow = true;
    group.add(abdomen);

    // Belt
    const beltGeometry = new THREE.BoxGeometry(0.34, 0.08, 0.17);
    const beltMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.5 });
    const belt = new THREE.Mesh(beltGeometry, beltMaterial);
    belt.position.y = 0.9;
    group.add(belt);

    // Upper arms
    const upperArmGeometry = new THREE.CapsuleGeometry(0.05, 0.18, 4, 8);

    const leftUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    leftUpperArm.position.set(-0.23, 1.28, 0);
    leftUpperArm.rotation.z = 0.15;
    leftUpperArm.name = 'leftUpperArm';
    leftUpperArm.castShadow = true;
    group.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    rightUpperArm.position.set(0.23, 1.28, 0);
    rightUpperArm.rotation.z = -0.15;
    rightUpperArm.name = 'rightUpperArm';
    rightUpperArm.castShadow = true;
    group.add(rightUpperArm);

    // Forearms (skin)
    const forearmGeometry = new THREE.CapsuleGeometry(0.04, 0.18, 4, 8);

    const leftForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    leftForearm.position.set(-0.27, 1.0, 0);
    leftForearm.rotation.z = 0.1;
    leftForearm.name = 'leftForearm';
    leftForearm.castShadow = true;
    group.add(leftForearm);

    const rightForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    rightForearm.position.set(0.27, 1.0, 0);
    rightForearm.rotation.z = -0.1;
    rightForearm.name = 'rightForearm';
    rightForearm.castShadow = true;
    group.add(rightForearm);

    // Hands
    const handGeometry = new THREE.SphereGeometry(0.04, 8, 8);

    const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
    leftHand.position.set(-0.29, 0.82, 0);
    leftHand.scale.set(1, 1.2, 0.6);
    group.add(leftHand);

    const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
    rightHand.position.set(0.29, 0.82, 0);
    rightHand.scale.set(1, 1.2, 0.6);
    group.add(rightHand);

    // Upper legs (thighs)
    const thighGeometry = new THREE.CapsuleGeometry(0.065, 0.26, 4, 8);

    const leftThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    leftThigh.position.set(-0.1, 0.66, 0);
    leftThigh.name = 'leftThigh';
    leftThigh.castShadow = true;
    group.add(leftThigh);

    const rightThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    rightThigh.position.set(0.1, 0.66, 0);
    rightThigh.name = 'rightThigh';
    rightThigh.castShadow = true;
    group.add(rightThigh);

    // Lower legs (calves)
    const calfGeometry = new THREE.CapsuleGeometry(0.05, 0.26, 4, 8);

    const leftCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    leftCalf.position.set(-0.1, 0.32, 0);
    leftCalf.name = 'leftCalf';
    leftCalf.castShadow = true;
    group.add(leftCalf);

    const rightCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    rightCalf.position.set(0.1, 0.32, 0);
    rightCalf.name = 'rightCalf';
    rightCalf.castShadow = true;
    group.add(rightCalf);

    // Shoes
    const shoeGeometry = new THREE.BoxGeometry(0.08, 0.05, 0.14);

    const leftShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    leftShoe.position.set(-0.1, 0.025, 0.02);
    leftShoe.castShadow = true;
    group.add(leftShoe);

    const rightShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    rightShoe.position.set(0.1, 0.025, 0.02);
    rightShoe.castShadow = true;
    group.add(rightShoe);

    // Police hat for police
    if (config.type === 'police') {
      const hatGeometry = new THREE.CylinderGeometry(0.12, 0.14, 0.08, 8);
      const hatMaterial = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.6 });
      const hat = new THREE.Mesh(hatGeometry, hatMaterial);
      hat.position.y = 1.78;
      group.add(hat);

      const hatBrim = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 8);
      const brim = new THREE.Mesh(hatBrim, hatMaterial);
      brim.position.y = 1.73;
      group.add(brim);
    }

    // Gang bandana
    if (config.type === 'gang') {
      const bandanaGeometry = new THREE.BoxGeometry(0.3, 0.04, 0.15);
      const bandanaMaterial = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.8 });
      const bandana = new THREE.Mesh(bandanaGeometry, bandanaMaterial);
      bandana.position.y = 1.72;
      group.add(bandana);
    }

    // Store body part references for animation
    group.userData.bodyParts = {
      head: headGroup,
      torso: chest,
      leftThigh,
      rightThigh,
      leftCalf,
      rightCalf,
      leftUpperArm,
      rightUpperArm,
      leftForearm,
      rightForearm
    };

    return group;
  }

  private createNPCWeaponMesh(weaponType: string): THREE.Group {
    const group = new THREE.Group();
    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.4,
      metalness: 0.9
    });

    switch (weaponType) {
      case 'pistol':
        const pistolBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.08, 0.12),
          gunMetal
        );
        group.add(pistolBody);
        const pistolBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.06, 6),
          gunMetal
        );
        pistolBarrel.rotation.x = Math.PI / 2;
        pistolBarrel.position.z = 0.09;
        group.add(pistolBarrel);
        break;

      case 'uzi':
        const uziBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.08, 0.18),
          gunMetal
        );
        group.add(uziBody);
        const uziMag = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.1, 0.03),
          gunMetal
        );
        uziMag.position.set(0, -0.08, 0);
        group.add(uziMag);
        break;

      case 'shotgun':
        const shotgunBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.05, 0.4),
          gunMetal
        );
        group.add(shotgunBody);
        const shotgunStock = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.08, 0.15),
          new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 })
        );
        shotgunStock.position.z = -0.25;
        group.add(shotgunStock);
        break;

      case 'ak47':
        const rifleBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.06, 0.35),
          gunMetal
        );
        group.add(rifleBody);
        const rifleMag = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.1, 0.04),
          gunMetal
        );
        rifleMag.position.set(0, -0.07, 0.05);
        rifleMag.rotation.x = 0.15;
        group.add(rifleMag);
        break;

      default:
        // Generic gun shape
        const defaultBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.06, 0.15),
          gunMetal
        );
        group.add(defaultBody);
    }

    group.scale.setScalar(0.8);
    return group;
  }

  private attachWeaponToNPC(npc: NPC): void {
    if (!npc.currentWeapon) return;

    const weaponMesh = this.createNPCWeaponMesh(npc.currentWeapon.config.id);
    weaponMesh.name = 'npcWeapon';

    // Position weapon in right hand
    weaponMesh.position.set(0.4, 0.7, 0.15);
    weaponMesh.rotation.set(0, 0, -0.3);

    npc.mesh.add(weaponMesh);
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

    // Update NPC animation based on actual velocity
    this.updateNPCAnimation(npc, deltaTime);
  }

  private updateNPCAnimation(npc: NPC, deltaTime: number): void {
    if (!npc.animator) return;

    // Get velocity from physics body
    const velocity = new THREE.Vector3(
      npc.body.velocity.x,
      npc.body.velocity.y,
      npc.body.velocity.z
    );

    // Track actual velocity
    npc.actualVelocity = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

    // Use distance-based animator (prevents sliding/moonwalking)
    // NPCs are always considered grounded for animation purposes
    npc.animator.update(velocity, deltaTime, true);
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
      // Throttle pathfinding - don't recalculate every frame
      const now = performance.now();
      if (now - npc.lastPathUpdate < this.pathfindCooldown) return;
      npc.lastPathUpdate = now;

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
        // Throttle pathfinding
        const now = performance.now();
        if (now - npc.lastPathUpdate >= this.pathfindCooldown) {
          npc.lastPathUpdate = now;
          const fleeDirection = npc.mesh.position.clone().sub(playerPos).normalize();
          const fleeTarget = npc.mesh.position.clone().add(fleeDirection.multiplyScalar(30));
          npc.path = this.pathfinding.findPath(npc.mesh.position, fleeTarget);
        }
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

    // Police stop attacking if wanted level drops to 0
    if (npc.config.type === 'police' && this.game.player.stats.wantedLevel === 0) {
      npc.behavior.state = 'patrolling';
      npc.behavior.alertLevel = 0;
      return;
    }

    this.lookAt(npc, playerPos);

    // Lost sight of player
    if (distance > 40) {
      npc.behavior.state = 'seeking';
      npc.behavior.lastKnownPlayerPosition = playerPos.clone();
      return;
    }

    // Check weapon and ammo
    if (npc.currentWeapon) {
      // Reload if out of ammo
      if (npc.currentWeapon.currentAmmo <= 0 && npc.currentWeapon.reserveAmmo > 0) {
        const neededAmmo = npc.currentWeapon.config.magazineSize;
        const ammoToLoad = Math.min(neededAmmo, npc.currentWeapon.reserveAmmo);
        npc.currentWeapon.currentAmmo = ammoToLoad;
        npc.currentWeapon.reserveAmmo -= ammoToLoad;
        return; // Skip turn while reloading
      }

      // Determine optimal combat range based on weapon
      const weapon = npc.currentWeapon;
      let optimalRange = 15;
      if (weapon.config.type === 'shotgun') optimalRange = 8;
      else if (weapon.config.type === 'rifle') optimalRange = 25;
      else if (weapon.config.type === 'smg') optimalRange = 12;

      // Too far - advance toward player
      if (distance > optimalRange + 5) {
        if (npc.path.length === 0) {
          // Throttle pathfinding
          const now = performance.now();
          if (now - npc.lastPathUpdate >= this.pathfindCooldown) {
            npc.lastPathUpdate = now;
            npc.path = this.pathfinding.findPath(npc.mesh.position, playerPos);
          }
        }
        this.moveAlongPath(npc, deltaTime, npc.config.speed * 1.2);
      }
      // Too close - back away while shooting
      else if (distance < optimalRange - 3) {
        const retreatDir = npc.mesh.position.clone().sub(playerPos).normalize();
        const retreatTarget = npc.mesh.position.clone().add(retreatDir.multiplyScalar(5));
        npc.path = [retreatTarget];
        this.moveAlongPath(npc, deltaTime, npc.config.speed * 0.8);

        // Shoot while retreating
        if (Math.random() < 0.08) {
          this.shootAtPlayer(npc);
        }
      }
      // In optimal range - strafe and shoot
      else {
        // Strafe movement
        const strafeDir = new THREE.Vector3(
          -(playerPos.z - npc.mesh.position.z),
          0,
          playerPos.x - npc.mesh.position.x
        ).normalize();

        // Change strafe direction periodically
        if (Math.random() < 0.02) {
          strafeDir.multiplyScalar(-1);
        }

        npc.body.velocity.x = strafeDir.x * npc.config.speed * 0.5;
        npc.body.velocity.z = strafeDir.z * npc.config.speed * 0.5;

        // Shoot based on weapon fire rate
        const fireChance = (weapon.config.fireRate / 60) * deltaTime;
        if (Math.random() < fireChance && npc.currentWeapon.currentAmmo > 0) {
          this.shootAtPlayer(npc);
        }
      }

      // Alert nearby hostiles
      if (Math.random() < 0.01) {
        this.alertNearbyNPCs(npc.mesh.position, 30, playerPos);
      }
    } else {
      // No weapon - charge at player for melee
      if (distance > 2) {
        if (npc.path.length === 0) {
          // Throttle pathfinding
          const now = performance.now();
          if (now - npc.lastPathUpdate >= this.pathfindCooldown) {
            npc.lastPathUpdate = now;
            npc.path = this.pathfinding.findPath(npc.mesh.position, playerPos);
          }
        }
        this.moveAlongPath(npc, deltaTime, npc.config.speed * 1.5);
      } else {
        // Melee attack
        if (Math.random() < 0.15) {
          this.game.player.takeDamage(10, npc.mesh.position.clone().sub(playerPos).normalize());
          this.game.audio.playSound('punch');
        }
      }
    }
  }

  private alertNearbyNPCs(position: THREE.Vector3, radius: number, playerPos: THREE.Vector3): void {
    this.npcs.forEach(npc => {
      if (npc.isDead || !npc.config.hostile) return;
      if (npc.behavior.state === 'attacking') return;

      const distance = npc.mesh.position.distanceTo(position);
      if (distance < radius) {
        npc.behavior.state = 'attacking';
        npc.behavior.lastKnownPlayerPosition = playerPos.clone();
        npc.behavior.alertLevel = 100;
      }
    });
  }

  private handleSeekingState(npc: NPC, deltaTime: number): void {
    // Police stop seeking if wanted level drops to 0
    if (npc.config.type === 'police' && this.game.player.stats.wantedLevel === 0) {
      npc.behavior.state = 'patrolling';
      npc.behavior.alertLevel = 0;
      npc.behavior.lastKnownPlayerPosition = null;
      return;
    }

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
        // Throttle pathfinding
        const now = performance.now();
        if (now - npc.lastPathUpdate >= this.pathfindCooldown) {
          npc.lastPathUpdate = now;
          npc.path = this.pathfinding.findPath(
            npc.mesh.position,
            npc.behavior.lastKnownPlayerPosition
          );
        }
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

    const npcHeadPos = npc.mesh.position.clone();
    npcHeadPos.y += 1.5; // Shoot from head height

    const playerPos = this.game.player.position.clone();
    playerPos.y += 1; // Target player center mass

    // Line-of-sight check - raycast to see if there's anything between NPC and player
    const result = this.game.physics.raycast(npcHeadPos, playerPos, {
      collisionFilterMask: COLLISION_GROUPS.STATIC | COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.DYNAMIC
    });

    // If we hit something closer than the player, can't shoot
    if (result.hit && result.point) {
      const distanceToHit = npcHeadPos.distanceTo(result.point);
      const distanceToPlayer = npcHeadPos.distanceTo(playerPos);
      if (distanceToHit < distanceToPlayer - 0.5) {
        // Something is blocking the shot
        return;
      }
    }

    const direction = playerPos.clone().sub(npcHeadPos);
    direction.normalize();

    // Accuracy based on weapon config
    const accuracy = npc.currentWeapon.config.accuracy * 0.8; // NPCs are slightly less accurate
    direction.x += (Math.random() - 0.5) * (1 - accuracy) * 0.5;
    direction.y += (Math.random() - 0.5) * (1 - accuracy) * 0.3;
    direction.z += (Math.random() - 0.5) * (1 - accuracy) * 0.5;

    // Check if shot hits
    const hit = Math.random() < accuracy;
    if (hit) {
      this.game.player.takeDamage(npc.currentWeapon.config.damage, direction);
    }

    // Consume ammo
    if (npc.currentWeapon.currentAmmo > 0) {
      npc.currentWeapon.currentAmmo--;
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
        } else if (wantedLevel === 0 && (npc.behavior.state === 'attacking' || npc.behavior.state === 'seeking')) {
          // Police stop pursuing when wanted level is cleared
          npc.behavior.state = 'patrolling';
          npc.behavior.alertLevel = 0;
          npc.behavior.lastKnownPlayerPosition = null;
        }
      } else if (npc.config.hostile && npc.behavior.provoked) {
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

    if (activeNPCs.length < this.targetNPCCount) {
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

    // Visual hit feedback - flash red
    this.flashNPCRed(npc);

    if (npc.health <= 0) {
      this.killNPC(npc, fromDirection);
    } else {
      if (npc.config.hostile) {
        npc.behavior.provoked = true;
        npc.behavior.state = 'attacking';
        npc.behavior.alertLevel = 100;
      } else {
        npc.behavior.state = 'fleeing';
      }

      // Stagger effect - push back and stumble
      if (fromDirection) {
        const pushForce = fromDirection.normalize().multiplyScalar(-150);
        npc.body.applyImpulse(
          new CANNON.Vec3(pushForce.x, 30, pushForce.z),
          npc.body.position
        );
      }

      // Play hit sound
      this.game.audio.playSound('hit');
    }
  }

  private flashNPCRed(npc: NPC): void {
    // Store original materials and flash red
    const originalColors: Map<THREE.Mesh, number> = new Map();

    npc.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        originalColors.set(child, child.material.color.getHex());
        child.material.color.setHex(0xff0000);
        child.material.emissive.setHex(0x440000);
      }
    });

    // Restore original colors after flash
    setTimeout(() => {
      npc.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const originalColor = originalColors.get(child);
          if (originalColor !== undefined) {
            child.material.color.setHex(originalColor);
            child.material.emissive.setHex(0x000000);
          }
        }
      });
    }, 100);
  }

  private killNPC(npc: NPC, fromDirection?: THREE.Vector3): void {
    npc.isDead = true;
    npc.state = 'dead';
    npc.behavior.state = 'dead';

    // Play death sound
    this.game.audio.playSound('death');

    // Animated death - fall in direction of impact
    const fallDirection = fromDirection ? fromDirection.clone().normalize() : new THREE.Vector3(0, 0, 1);

    // Calculate fall rotation based on impact direction
    const fallAngle = Math.atan2(fallDirection.x, fallDirection.z);

    // Animate the death fall
    const startY = npc.mesh.position.y;
    const startRotX = npc.mesh.rotation.x;
    const startRotY = npc.mesh.rotation.y;
    let frame = 0;
    const totalFrames = 20;

    const animateDeath = () => {
      frame++;
      const progress = frame / totalFrames;
      const easeOut = 1 - Math.pow(1 - progress, 3);

      // Fall backwards
      npc.mesh.rotation.x = startRotX + (Math.PI / 2) * easeOut;
      // Rotate to face impact direction
      npc.mesh.rotation.y = startRotY + (fallAngle - startRotY) * easeOut * 0.3;
      // Drop to ground
      npc.mesh.position.y = startY - (startY - 0.25) * easeOut;

      if (frame < totalFrames) {
        requestAnimationFrame(animateDeath);
      } else {
        // Final position
        npc.mesh.rotation.x = Math.PI / 2;
        npc.mesh.position.y = 0.25;
      }
    };
    animateDeath();

    // Stop physics movement
    npc.body.mass = 0;
    npc.body.velocity.setZero();

    globalEvents.emit('npc_killed', {
      id: npc.id,
      type: npc.config.type
    });

    if (npc.config.type === 'civilian') {
      this.game.player.setWantedLevel(this.game.player.stats.wantedLevel + 1);
    }

    // Fade out and remove after delay
    setTimeout(() => {
      // Fade out effect
      let fadeFrame = 0;
      const fadeFrames = 30;
      const fadeOut = () => {
        fadeFrame++;
        const opacity = 1 - (fadeFrame / fadeFrames);
        npc.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.transparent = true;
            child.material.opacity = opacity;
          }
        });
        if (fadeFrame < fadeFrames) {
          requestAnimationFrame(fadeOut);
        } else {
          this.removeNPC(npc.id);
        }
      };
      fadeOut();
    }, 8000);
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

  findNPCNearPoint(position: THREE.Vector3, radius: number): string | null {
    let closestId: string | null = null;
    let closestDistance = radius;

    this.npcs.forEach(npc => {
      if (npc.isDead) return;
      const distance = npc.mesh.position.distanceTo(position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = npc.id;
      }
    });

    return closestId;
  }

  getPathfinding(): Pathfinding {
    return this.pathfinding;
  }

  /**
   * Called when a gunshot is fired - triggers NPC reactions (GTA5-style panic)
   */
  onGunshotFired(position: THREE.Vector3, hearingRadius: number): void {
    const panicRadius = hearingRadius * 1.5; // NPCs can hear gunshots from further away

    this.npcs.forEach(npc => {
      if (npc.isDead) return;

      const distance = npc.mesh.position.distanceTo(position);
      if (distance > panicRadius) return;

      // Calculate panic intensity based on distance (closer = more panic)
      const panicIntensity = 1 - (distance / panicRadius);

      if (npc.config.type === 'civilian') {
        // Civilians panic and flee
        this.triggerCivilianPanic(npc, position, panicIntensity);
      } else if (npc.config.type === 'police') {
        // Police respond to gunfire
        this.triggerPoliceResponse(npc, position);
      } else if (npc.config.hostile) {
        // Hostile NPCs become alert and may engage
        if (npc.behavior.state !== 'attacking') {
          npc.behavior.state = 'seeking';
          npc.behavior.lastKnownPlayerPosition = position.clone();
          npc.behavior.alertLevel = 100;
        }
      }
    });

    // Increase wanted level if shooting near civilians
    const nearbyCivilians = this.getNPCsInRadius(position, hearingRadius * 0.5)
      .filter(npc => npc.config.type === 'civilian' && !npc.isDead);

    if (nearbyCivilians.length > 0) {
      const currentWanted = this.game.player.stats.wantedLevel;
      if (currentWanted < 1) {
        this.game.player.setWantedLevel(1);
      }
    }
  }

  private triggerCivilianPanic(npc: NPC, gunshotPosition: THREE.Vector3, intensity: number): void {
    // Don't panic if already fleeing
    if (npc.behavior.state === 'fleeing') return;

    npc.behavior.state = 'fleeing';
    npc.behavior.alertLevel = 100;

    // Calculate flee direction (away from gunshot)
    const fleeDirection = npc.mesh.position.clone().sub(gunshotPosition).normalize();
    const fleeDistance = 30 + Math.random() * 20;
    const fleeTarget = npc.mesh.position.clone().add(fleeDirection.multiplyScalar(fleeDistance));
    npc.path = this.pathfinding.findPath(npc.mesh.position, fleeTarget);

    // Play scream sound with probability based on panic intensity
    if (Math.random() < intensity * 0.7) {
      this.playNPCScream(npc);
    }

    // Animate panic reaction - throw hands up
    this.animatePanicReaction(npc);
  }

  private triggerPoliceResponse(npc: NPC, crimePosition: THREE.Vector3): void {
    // Police respond to gunfire location
    if (npc.behavior.state !== 'attacking') {
      npc.behavior.state = 'seeking';
      npc.behavior.lastKnownPlayerPosition = crimePosition.clone();
      npc.behavior.alertLevel = 100;

      // Play police radio chatter
      this.playPoliceRadio();
    }
  }

  private playNPCScream(npc: NPC): void {
    // Play scream sound - different for male/female
    const isFemale = npc.config.id.includes('female') || Math.random() > 0.5;
    this.game.audio.playSound(isFemale ? 'scream_female' : 'scream_male', { volume: 0.6 });
  }

  private playPoliceRadio(): void {
    // Play police radio dispatch sound
    this.game.audio.playSound('police_radio', { volume: 0.5 });
  }

  private animatePanicReaction(npc: NPC): void {
    // Quick panic animation - raise arms and duck slightly
    const startY = npc.mesh.position.y;
    let frame = 0;
    const panicFrames = 15;

    const animatePanic = () => {
      frame++;
      const progress = frame / panicFrames;
      const bounce = Math.sin(progress * Math.PI) * 0.1;

      // Duck down and back up
      npc.mesh.position.y = startY - bounce;

      // Add a slight random rotation for frantic look
      if (frame < panicFrames / 2) {
        npc.mesh.rotation.y += (Math.random() - 0.5) * 0.3;
      }

      if (frame < panicFrames) {
        requestAnimationFrame(animatePanic);
      }
    };
    animatePanic();
  }

  /**
   * Spawn police reinforcements (called when wanted level increases)
   */
  spawnPoliceReinforcements(playerPosition: THREE.Vector3, count: number): void {
    const policeConfig = CHARACTER_CONFIGS.find(c => c.type === 'police')!;

    for (let i = 0; i < count; i++) {
      // Spawn police at edges of player visibility
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 20;
      const spawnPos = new THREE.Vector3(
        playerPosition.x + Math.cos(angle) * distance,
        1,
        playerPosition.z + Math.sin(angle) * distance
      );

      const npc = this.spawnNPC(policeConfig, spawnPos);
      if (npc) {
        npc.behavior.state = 'seeking';
        npc.behavior.lastKnownPlayerPosition = playerPosition.clone();
        npc.behavior.alertLevel = 100;

        // Play siren sound occasionally
        if (Math.random() < 0.3) {
          setTimeout(() => {
            this.game.audio.playSound('police_siren', { volume: 0.4 });
          }, Math.random() * 2000);
        }
      }
    }

    // Play radio dispatch for reinforcements
    this.playPoliceRadio();
  }

  setVisible(visible: boolean): void {
    this.npcs.forEach((npc) => {
      if (npc.mesh) {
        npc.mesh.visible = visible;
      }
    });
  }

  dispose(): void {
    this.npcs.forEach((_, id) => this.removeNPC(id));
  }
}
