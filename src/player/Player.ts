import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import gsap from 'gsap';
import { PlayerStats, PlayerState, Vehicle, Weapon, InputState } from '@/types';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';
import { ProceduralCharacterAnimator } from '@/animation/CharacterAnimator';
import { ClimbingSystem } from './ClimbingSystem';

export class Player {
  private game: Game;

  public mesh: THREE.Group;
  public body: CANNON.Body;
  public stats: PlayerStats;
  public state: PlayerState;

  private cameraTarget: THREE.Object3D;
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(0, 3, 8);
  private cameraLookOffset: THREE.Vector3 = new THREE.Vector3(0, 1.5, 0);
  // Separate interpolated offsets to avoid mutating the base values
  private currentCameraOffset: THREE.Vector3 = new THREE.Vector3(0, 3, 8);
  private currentCameraLookOffset: THREE.Vector3 = new THREE.Vector3(0, 1.5, 0);

  private moveSpeed: number = 15;
  private sprintMultiplier: number = 2.0;
  private jumpForce: number = 12;
  private rotationSpeed: number = 0.003;

  private isGrounded: boolean = true;

  private currentWeapon: Weapon | null = null;
  private aimTransition: number = 0;

  // Animation state
  private lastFootstepTime: number = 0;
  private footstepInterval: number = 0.4; // seconds between footsteps

  // Body part references for animation
  private head: THREE.Group | null = null;
  private leftThigh: THREE.Mesh | null = null;
  private rightThigh: THREE.Mesh | null = null;
  private leftCalf: THREE.Mesh | null = null;
  private rightCalf: THREE.Mesh | null = null;
  private leftUpperArm: THREE.Mesh | null = null;
  private rightUpperArm: THREE.Mesh | null = null;
  private leftForearm: THREE.Mesh | null = null;
  private rightForearm: THREE.Mesh | null = null;
  private torso: THREE.Mesh | null = null;

  // Movement tracking for animation sync
  private actualVelocity: number = 0;
  private targetRotation: number = 0;
  private currentTurnSpeed: number = 0;

  // Improved animation system
  private animator: ProceduralCharacterAnimator;

  // Climbing system
  private climbingSystem: ClimbingSystem;

  constructor(game: Game) {
    this.game = game;

    this.stats = {
      health: 100,
      maxHealth: 100,
      armor: 0,
      maxArmor: 100,
      money: 0,
      wantedLevel: 0,
      stamina: 100,
      maxStamina: 100
    };

    this.state = {
      isMoving: false,
      isRunning: false,
      isJumping: false,
      isCrouching: false,
      isInVehicle: false,
      isAiming: false,
      isShooting: false,
      isReloading: false,
      isDead: false,
      currentVehicle: null,
      // Building and climbing states
      isInBuilding: false,
      currentBuildingId: null,
      isClimbing: false,
      climbingType: 'none'
    };

    this.mesh = new THREE.Group();
    this.body = new CANNON.Body({ mass: 80 });
    this.cameraTarget = new THREE.Object3D();
    this.animator = new ProceduralCharacterAnimator();
    this.climbingSystem = new ClimbingSystem(game);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  get rotation(): THREE.Euler {
    return this.mesh.rotation;
  }

  async initialize(): Promise<void> {
    this.createPlayerMesh();
    this.createPhysicsBody();
    this.setupCamera();
    this.setupInputHandlers();

    // Setup animator with body part references
    this.animator.setBodyParts({
      head: this.head ?? undefined,
      torso: this.torso ?? undefined,
      leftThigh: this.leftThigh ?? undefined,
      rightThigh: this.rightThigh ?? undefined,
      leftCalf: this.leftCalf ?? undefined,
      rightCalf: this.rightCalf ?? undefined,
      leftUpperArm: this.leftUpperArm ?? undefined,
      rightUpperArm: this.rightUpperArm ?? undefined,
      leftForearm: this.leftForearm ?? undefined,
      rightForearm: this.rightForearm ?? undefined
    });

    this.game.scene.add(this.mesh);
    this.game.scene.add(this.cameraTarget);

    this.setPosition(0, 2, 0);
  }

  private createPlayerMesh(): void {
    // Skin material
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0b090,
      roughness: 0.7,
      metalness: 0.0
    });

    // Clothing materials
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x2244aa,
      roughness: 0.8,
      metalness: 0.0
    });

    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
      metalness: 0.0
    });

    const shoeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.6,
      metalness: 0.1
    });

    // Head group for face details
    this.head = new THREE.Group();
    this.head.position.y = 1.65;
    this.mesh.add(this.head);

    // Head - more detailed with slight oval shape
    const headGeometry = new THREE.SphereGeometry(0.14, 16, 16);
    headGeometry.scale(1, 1.1, 0.95);
    const headMesh = new THREE.Mesh(headGeometry, skinMaterial);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // === FACE DETAILS ===
    const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const eyePupilMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.2 });
    const eyebrowMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const lipMaterial = new THREE.MeshStandardMaterial({ color: 0xc47a7a, roughness: 0.6 });

    // Eye whites
    const eyeWhiteGeometry = new THREE.SphereGeometry(0.022, 8, 8);
    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial);
    leftEyeWhite.position.set(-0.045, 0.02, 0.11);
    leftEyeWhite.scale.set(1, 0.7, 0.5);
    this.head.add(leftEyeWhite);

    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial);
    rightEyeWhite.position.set(0.045, 0.02, 0.11);
    rightEyeWhite.scale.set(1, 0.7, 0.5);
    this.head.add(rightEyeWhite);

    // Pupils
    const pupilGeometry = new THREE.SphereGeometry(0.012, 8, 8);
    const leftPupil = new THREE.Mesh(pupilGeometry, eyePupilMaterial);
    leftPupil.position.set(-0.045, 0.02, 0.125);
    this.head.add(leftPupil);

    const rightPupil = new THREE.Mesh(pupilGeometry, eyePupilMaterial);
    rightPupil.position.set(0.045, 0.02, 0.125);
    this.head.add(rightPupil);

    // Eyebrows
    const eyebrowGeometry = new THREE.BoxGeometry(0.04, 0.008, 0.015);
    const leftEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
    leftEyebrow.position.set(-0.045, 0.06, 0.105);
    leftEyebrow.rotation.z = 0.1;
    this.head.add(leftEyebrow);

    const rightEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
    rightEyebrow.position.set(0.045, 0.06, 0.105);
    rightEyebrow.rotation.z = -0.1;
    this.head.add(rightEyebrow);

    // Nose
    const noseGeometry = new THREE.ConeGeometry(0.015, 0.04, 4);
    const nose = new THREE.Mesh(noseGeometry, skinMaterial);
    nose.position.set(0, -0.01, 0.12);
    nose.rotation.x = Math.PI / 2;
    this.head.add(nose);

    // Mouth (simple line)
    const mouthGeometry = new THREE.BoxGeometry(0.04, 0.006, 0.01);
    const mouth = new THREE.Mesh(mouthGeometry, lipMaterial);
    mouth.position.set(0, -0.055, 0.11);
    this.head.add(mouth);

    // Hair (added to head group)
    const hairGeometry = new THREE.SphereGeometry(0.145, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 0.03; // Relative to head group
    hair.scale.set(1, 0.8, 1);
    this.head.add(hair);

    // Neck
    const neckGeometry = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8);
    const neck = new THREE.Mesh(neckGeometry, skinMaterial);
    neck.position.y = 1.48;
    this.mesh.add(neck);

    // Torso - upper body (chest) - store reference for animation
    const chestGeometry = new THREE.BoxGeometry(0.38, 0.28, 0.2);
    this.torso = new THREE.Mesh(chestGeometry, shirtMaterial);
    this.torso.position.y = 1.28;
    this.torso.castShadow = true;
    this.mesh.add(this.torso);

    // Torso - lower body (abdomen)
    const abdomenGeometry = new THREE.BoxGeometry(0.34, 0.2, 0.18);
    const abdomen = new THREE.Mesh(abdomenGeometry, shirtMaterial);
    abdomen.position.y = 1.04;
    abdomen.castShadow = true;
    this.mesh.add(abdomen);

    // Hips/Belt area
    const hipsGeometry = new THREE.BoxGeometry(0.36, 0.1, 0.19);
    const beltMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.5 });
    const hips = new THREE.Mesh(hipsGeometry, beltMaterial);
    hips.position.y = 0.9;
    this.mesh.add(hips);

    // Upper arms - store references for animation
    const upperArmGeometry = new THREE.CapsuleGeometry(0.05, 0.2, 4, 8);

    this.leftUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    this.leftUpperArm.position.set(-0.24, 1.28, 0);
    this.leftUpperArm.rotation.z = 0.15;
    this.leftUpperArm.castShadow = true;
    this.mesh.add(this.leftUpperArm);

    this.rightUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    this.rightUpperArm.position.set(0.24, 1.28, 0);
    this.rightUpperArm.rotation.z = -0.15;
    this.rightUpperArm.castShadow = true;
    this.mesh.add(this.rightUpperArm);

    // Lower arms (forearms) - skin visible
    const forearmGeometry = new THREE.CapsuleGeometry(0.04, 0.2, 4, 8);

    this.leftForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    this.leftForearm.position.set(-0.28, 1.0, 0);
    this.leftForearm.rotation.z = 0.1;
    this.leftForearm.castShadow = true;
    this.mesh.add(this.leftForearm);

    this.rightForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    this.rightForearm.position.set(0.28, 1.0, 0);
    this.rightForearm.rotation.z = -0.1;
    this.rightForearm.castShadow = true;
    this.mesh.add(this.rightForearm);

    // Hands
    const handGeometry = new THREE.SphereGeometry(0.04, 8, 8);

    const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
    leftHand.position.set(-0.3, 0.82, 0);
    leftHand.scale.set(1, 1.2, 0.6);
    this.mesh.add(leftHand);

    const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
    rightHand.position.set(0.3, 0.82, 0);
    rightHand.scale.set(1, 1.2, 0.6);
    this.mesh.add(rightHand);

    // Upper legs (thighs) - store references for animation
    const thighGeometry = new THREE.CapsuleGeometry(0.07, 0.28, 4, 8);

    this.leftThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    this.leftThigh.position.set(-0.1, 0.66, 0);
    this.leftThigh.castShadow = true;
    this.mesh.add(this.leftThigh);

    this.rightThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    this.rightThigh.position.set(0.1, 0.66, 0);
    this.rightThigh.castShadow = true;
    this.mesh.add(this.rightThigh);

    // Lower legs (calves) - store references for animation
    const calfGeometry = new THREE.CapsuleGeometry(0.055, 0.28, 4, 8);

    this.leftCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    this.leftCalf.position.set(-0.1, 0.32, 0);
    this.leftCalf.castShadow = true;
    this.mesh.add(this.leftCalf);

    this.rightCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    this.rightCalf.position.set(0.1, 0.32, 0);
    this.rightCalf.castShadow = true;
    this.mesh.add(this.rightCalf);

    // Shoes/Feet
    const shoeGeometry = new THREE.BoxGeometry(0.09, 0.06, 0.16);

    const leftShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    leftShoe.position.set(-0.1, 0.03, 0.02);
    leftShoe.castShadow = true;
    this.mesh.add(leftShoe);

    const rightShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    rightShoe.position.set(0.1, 0.03, 0.02);
    rightShoe.castShadow = true;
    this.mesh.add(rightShoe);
  }

  private createPhysicsBody(): void {
    this.body = this.game.physics.createCharacterBody(
      'player',
      0.3,
      1.8,
      80,
      new THREE.Vector3(0, 2, 0)
    );

    this.game.physics.linkMeshToBody(this.mesh, this.body);
  }

  private setupCamera(): void {
    this.game.camera.position.copy(this.mesh.position).add(this.cameraOffset);
    this.game.camera.lookAt(this.mesh.position.clone().add(this.cameraLookOffset));
  }

  private setupInputHandlers(): void {
    this.game.input.on('fire', (data: { pressed: boolean }) => {
      if (data.pressed && !this.state.isInVehicle) {
        this.shoot();
      }
    });

    this.game.input.on('aim', (data: { pressed: boolean }) => {
      this.state.isAiming = data.pressed;
      this.updateAimCamera(data.pressed);
    });

    this.game.input.on('keydown', (data: { action: string }) => {
      if (data.action === 'reload') {
        this.reload();
      }
      if (data.action === 'enterVehicle') {
        this.tryEnterVehicle();
      }
      if (data.action === 'jump') {
        if (this.state.isInVehicle && this.state.currentVehicle) {
          // Skip vehicle jump for flying vehicles (space is used for pitch control)
          const vehicleType = this.state.currentVehicle.config.type;
          if (vehicleType !== 'helicopter' && vehicleType !== 'airplane') {
            // Vehicle jump (only for ground vehicles)
            this.jumpVehicle();
          }
        } else if (this.isGrounded) {
          // Human jump
          this.jump();
        }
      }
      if (data.action === 'nextWeapon') {
        this.game.weapons.nextWeapon();
      }
      if (data.action === 'prevWeapon') {
        this.game.weapons.previousWeapon();
      }
      // Interact key for climbing and building entry
      if (data.action === 'interact') {
        this.tryInteract();
      }
    });
  }

  update(deltaTime: number): void {
    if (this.state.isDead) return;

    if (this.state.isInVehicle) {
      this.updateInVehicle(deltaTime);
    } else if (this.state.isClimbing) {
      this.updateClimbing(deltaTime);
    } else if (this.state.isInBuilding) {
      this.updateInBuilding(deltaTime);
    } else {
      this.updateOnFoot(deltaTime);
    }

    this.updateCamera(deltaTime);
    this.updateStats(deltaTime);
  }

  private updateInBuilding(deltaTime: number): void {
    const input = this.game.input.getState();

    // Simple movement without physics
    this.updateRotation(input, deltaTime);

    // Get movement direction
    const moveDir = new THREE.Vector3();
    if (input.forward) moveDir.z -= 1;
    if (input.backward) moveDir.z += 1;
    if (input.left) moveDir.x -= 1;
    if (input.right) moveDir.x += 1;

    if (moveDir.length() > 0) {
      moveDir.normalize();

      // Apply rotation to movement direction
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);

      // Move at walk speed
      const speed = input.sprint ? 8 : 4;
      this.mesh.position.add(moveDir.multiplyScalar(speed * deltaTime));

      // Keep within interior bounds (simple clamp)
      const interior = this.game.interiors.getCurrentInterior();
      if (interior && interior.layout.rooms.length > 0) {
        const room = interior.layout.rooms[0];
        const interiorPos = this.game.interiors.getInteriorScenePosition();

        // Clamp position to room bounds
        const minX = interiorPos.x + room.bounds.min.x + 0.5;
        const maxX = interiorPos.x + room.bounds.max.x - 0.5;
        const minZ = interiorPos.z + room.bounds.min.z + 0.5;
        const maxZ = interiorPos.z + room.bounds.max.z - 0.5;

        this.mesh.position.x = Math.max(minX, Math.min(maxX, this.mesh.position.x));
        this.mesh.position.z = Math.max(minZ, Math.min(maxZ, this.mesh.position.z));
      }
    }

    // Sync body position for when we exit
    this.body.position.set(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);

    // Update animation
    const velocity = new THREE.Vector3(moveDir.x * 4, 0, moveDir.z * 4);
    this.animator.update(velocity, deltaTime, true);
  }

  private updateOnFoot(deltaTime: number): void {
    const input = this.game.input.getState();

    this.checkGrounded();
    this.updateRotation(input, deltaTime);
    this.updateMovement(input, deltaTime);
    this.updateAnimation(deltaTime);
  }

  private updateAnimation(deltaTime: number): void {
    // Get velocity from physics body
    const velocity = new THREE.Vector3(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );

    // Track actual velocity for other systems
    this.actualVelocity = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

    // Use distance-based animator (prevents sliding/moonwalking)
    this.animator.update(velocity, deltaTime, this.isGrounded);

    // Handle footstep sounds based on animation cycle
    if (this.actualVelocity > 1.0 && this.isGrounded) {
      const isRunning = this.actualVelocity > 20;
      const currentTime = this.game.getElapsedTime();
      const stepInterval = isRunning ? this.footstepInterval * 0.55 : this.footstepInterval;

      if (currentTime - this.lastFootstepTime > stepInterval) {
        this.playFootstep();
        this.lastFootstepTime = currentTime;
      }
    }
  }

  private playFootstep(): void {
    this.game.audio.playSound('footstep', { volume: 0.3 });
  }

  // Called after physics step to sync mesh position with physics body
  syncWithPhysics(): void {
    if (!this.state.isInVehicle) {
      this.mesh.position.set(
        this.body.position.x,
        this.body.position.y,
        this.body.position.z
      );
    }
  }

  private updateRotation(input: InputState, deltaTime: number): void {
    if (this.game.input.isLocked()) {
      // Mouse look when pointer locked
      this.mesh.rotation.y -= input.mouseDeltaX * this.rotationSpeed;
    } else {
      // Keyboard rotation when not pointer locked (A/D to turn)
      if (input.left) this.mesh.rotation.y += 2 * deltaTime;
      if (input.right) this.mesh.rotation.y -= 2 * deltaTime;
    }
  }

  private updateMovement(input: InputState, deltaTime: number): void {
    const moveDirection = new THREE.Vector3();

    // Always check movement keys regardless of pointer lock
    if (input.forward) moveDirection.z -= 1;
    if (input.backward) moveDirection.z += 1;

    // Strafe only when pointer locked, otherwise A/D is handled in rotation
    if (this.game.input.isLocked()) {
      if (input.left) moveDirection.x -= 1;
      if (input.right) moveDirection.x += 1;
    }

    this.state.isMoving = moveDirection.lengthSq() > 0;

    if (this.state.isMoving) {
      moveDirection.normalize();
      moveDirection.applyEuler(new THREE.Euler(0, this.mesh.rotation.y, 0));

      const speed = input.sprint && this.stats.stamina > 0
        ? this.moveSpeed * this.sprintMultiplier
        : this.moveSpeed;

      this.state.isRunning = input.sprint && this.stats.stamina > 0;

      if (this.state.isRunning) {
        this.stats.stamina -= 20 * deltaTime;
      }

      // Wake up the physics body and set velocity
      this.body.wakeUp();
      this.body.velocity.x = moveDirection.x * speed;
      this.body.velocity.z = moveDirection.z * speed;
    } else {
      // Quick stop when not pressing movement keys
      this.body.velocity.x *= 0.85;
      this.body.velocity.z *= 0.85;
    }
  }

  private wasGrounded: boolean = true;

  private checkGrounded(): void {
    // Raycast from character center downward
    // Use a longer ray to ensure reliable ground detection
    const from = new THREE.Vector3(
      this.body.position.x,
      this.body.position.y + 0.5, // Start from higher up
      this.body.position.z
    );
    const to = new THREE.Vector3(
      this.body.position.x,
      this.body.position.y - 0.3, // Check further down
      this.body.position.z
    );

    const result = this.game.physics.raycast(from, to, {
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.STATIC
    });

    const wasInAir = !this.wasGrounded;
    this.wasGrounded = this.isGrounded;
    this.isGrounded = result.hit;

    // Play landing sound when hitting ground after being in air
    if (this.isGrounded && wasInAir && Math.abs(this.body.velocity.y) > 2) {
      this.game.audio.playSound('land', { volume: 0.5 });
    }

    this.state.isJumping = !this.isGrounded;
  }

  private jump(): void {
    if (!this.isGrounded) return;

    // Apply strong upward impulse
    this.body.velocity.y = this.jumpForce;
    this.state.isJumping = true;
    this.isGrounded = false;
    this.wasGrounded = false;

    this.game.audio.playSound('jump');
  }

  private jumpVehicle(): void {
    if (!this.state.currentVehicle) return;

    const vehicleId = this.state.currentVehicle.id;
    const jumped = this.game.vehiclePhysics.jumpVehicle(vehicleId);

    if (jumped) {
      // Play jump sound effect
      this.game.audio.playSound('car_horn');
    }
  }

  private updateInVehicle(_deltaTime: number): void {
    if (!this.state.currentVehicle) return;

    const vehicle = this.state.currentVehicle;
    // Sync player position and rotation with vehicle
    this.mesh.position.copy(vehicle.mesh.position);
    // Use quaternion for proper rotation sync (vehicle uses quaternion from physics)
    this.mesh.quaternion.copy(vehicle.mesh.quaternion);
    this.mesh.visible = false;
  }

  private updateCamera(deltaTime: number): void {
    // Determine target offsets based on state
    let targetOffset: THREE.Vector3;
    let targetLookOffset: THREE.Vector3;

    if (this.state.isInVehicle && this.state.currentVehicle) {
      const vehicleType = this.state.currentVehicle.config.type;

      // Flying vehicles have +Z as forward (nose toward +Z), so camera goes to -Z (behind)
      // Ground vehicles have -Z as forward (standard Three.js), so camera goes to +Z (behind)
      if (vehicleType === 'helicopter' || vehicleType === 'airplane') {
        // Flying vehicle camera: behind the aircraft (negative Z in local space)
        targetOffset = new THREE.Vector3(0, 6, -15);
        targetLookOffset = new THREE.Vector3(0, 0, 3); // Look slightly ahead
      } else {
        // Ground vehicle camera: higher and further back
        targetOffset = new THREE.Vector3(0, 5, 12);
        targetLookOffset = new THREE.Vector3(0, 1, 0);
      }
    } else if (this.state.isInBuilding) {
      // Interior camera: closer and lower for spacious indoor feel
      targetOffset = new THREE.Vector3(0, 2, 4);
      targetLookOffset = new THREE.Vector3(0, 1.2, 0);
    } else if (this.state.isAiming) {
      // Aiming camera: over-the-shoulder
      this.aimTransition = Math.min(1, this.aimTransition + deltaTime * 5);
      targetOffset = new THREE.Vector3(0.5, 2, 3);
      targetLookOffset = new THREE.Vector3(0, 1.6, 0);
    } else {
      // Default on-foot camera
      this.aimTransition = Math.max(0, this.aimTransition - deltaTime * 5);
      targetOffset = this.cameraOffset.clone();
      targetLookOffset = this.cameraLookOffset.clone();
    }

    // Smoothly interpolate current offsets toward target (don't mutate base values)
    this.currentCameraOffset.lerp(targetOffset, deltaTime * 5);
    this.currentCameraLookOffset.lerp(targetLookOffset, deltaTime * 5);

    // Calculate camera position based on player/vehicle orientation
    // Use quaternion for proper rotation (avoids gimbal lock issues with vehicles)
    const rotatedOffset = this.currentCameraOffset.clone().applyQuaternion(this.mesh.quaternion);
    const targetPosition = this.mesh.position.clone().add(rotatedOffset);

    // Smooth camera movement
    this.game.camera.position.lerp(targetPosition, deltaTime * 8);

    // Camera look target
    const lookAt = this.mesh.position.clone().add(this.currentCameraLookOffset);
    this.cameraTarget.position.lerp(lookAt, deltaTime * 10);
    this.game.camera.lookAt(this.cameraTarget.position);
  }

  private updateAimCamera(aiming: boolean): void {
    gsap.to(this.game.camera, {
      fov: aiming ? 50 : 75,
      duration: 0.3,
      onUpdate: () => {
        this.game.camera.updateProjectionMatrix();
      }
    });
  }

  private updateStats(deltaTime: number): void {
    if (!this.state.isRunning && this.stats.stamina < this.stats.maxStamina) {
      this.stats.stamina = Math.min(
        this.stats.maxStamina,
        this.stats.stamina + 15 * deltaTime
      );
    }

    if (this.stats.health <= 0 && !this.state.isDead) {
      this.die();
    }
  }

  private shoot(): void {
    const fired = this.game.weapons.fire();
    if (fired) {
      this.state.isShooting = true;
      const weapon = this.game.weapons.getCurrentWeapon();
      if (weapon) {
        globalEvents.emit('weapon_fire', {
          weapon: weapon.config.id,
          hit: true
        });
      }
      setTimeout(() => {
        this.state.isShooting = false;
      }, 100);
    }
  }

  private reload(): void {
    this.game.weapons.reload();
  }

  tryEnterVehicle(): void {
    if (this.state.isInVehicle) {
      this.exitVehicle();
      return;
    }

    const nearbyVehicle = this.game.vehicles.findNearestVehicle(
      this.mesh.position,
      3
    );

    if (nearbyVehicle) {
      this.enterVehicle(nearbyVehicle);
    }
  }

  enterVehicle(vehicle: Vehicle): void {
    this.state.isInVehicle = true;
    this.state.currentVehicle = vehicle;
    vehicle.driver = {
      id: 'player',
      config: {} as any,
      mesh: this.mesh,
      body: this.body,
      health: this.stats.health,
      state: 'driving',
      currentWeapon: this.currentWeapon,
      target: null,
      path: [],
      isDead: false
    };
    this.mesh.visible = false;

    this.game.physics.world.removeBody(this.body);

    globalEvents.emit('vehicle_enter', { vehicleId: vehicle.id });
    this.game.audio.playSound('car_door');
  }

  exitVehicle(): void {
    if (!this.state.currentVehicle) return;

    // Calculate exit position to the side of the vehicle
    const vehiclePos = this.state.currentVehicle.mesh.position.clone();
    const vehicleRotY = this.state.currentVehicle.mesh.rotation.y;

    // Exit to the left side of the vehicle
    const exitOffset = new THREE.Vector3(-2.5, 0, 0);
    exitOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicleRotY);
    const exitPosition = vehiclePos.add(exitOffset);

    this.state.currentVehicle.driver = null;
    this.state.isInVehicle = false;
    this.state.currentVehicle = null;
    this.mesh.visible = true;

    // Reset mesh rotation to upright (clear quaternion from vehicle)
    this.mesh.quaternion.set(0, 0, 0, 1);
    this.mesh.rotation.set(0, vehicleRotY, 0);

    // Reset body quaternion to upright
    this.body.quaternion.set(0, 0, 0, 1);

    // Set position and add body back to world
    this.setPosition(exitPosition.x, exitPosition.y + 1, exitPosition.z);
    this.game.physics.world.addBody(this.body);

    // Wake up the body to ensure physics work immediately
    this.body.wakeUp();

    globalEvents.emit('vehicle_exit', {});
    this.game.audio.playSound('car_door');
  }

  /**
   * Try to interact with nearby objects (buildings, ladders, etc.)
   */
  tryInteract(): void {
    console.log('tryInteract called, position:', this.mesh.position.x.toFixed(2), this.mesh.position.z.toFixed(2));

    // If already climbing, stop
    if (this.state.isClimbing) {
      this.stopClimbing();
      return;
    }

    // If in vehicle, exit
    if (this.state.isInVehicle) {
      this.exitVehicle();
      return;
    }

    // If in building, exit
    if (this.state.isInBuilding) {
      this.exitBuilding();
      return;
    }

    // Try to enter building first (larger detection range)
    const nearbyDoor = this.game.interiors.findNearestDoor(this.mesh.position, 5.0);
    if (nearbyDoor && nearbyDoor.buildingId) {
      console.log('Found door:', nearbyDoor.buildingId, 'at distance:', this.mesh.position.distanceTo(nearbyDoor.position).toFixed(2));
      this.enterBuilding(nearbyDoor.buildingId);
      return;
    }

    // Try to start climbing (ladders/ledges)
    if (this.climbingSystem.tryStartClimbing(this.mesh.position, this.mesh.rotation)) {
      this.startClimbing();
      return;
    }

    // Try to enter vehicle (fallback)
    this.tryEnterVehicle();
  }

  /**
   * Enter a building interior
   */
  enterBuilding(buildingId: string): void {
    const success = this.game.interiors.enterBuilding(buildingId);
    if (!success) return;

    this.state.isInBuilding = true;
    this.state.currentBuildingId = buildingId;

    // Remove physics body from world while inside (interior has no physics)
    this.game.physics.world.removeBody(this.body);

    // Teleport player to interior spawn point
    const spawnPos = this.game.interiors.getInteriorSpawnPosition();
    console.log('Entering building, spawn pos:', spawnPos.x.toFixed(1), spawnPos.y.toFixed(1), spawnPos.z.toFixed(1));

    // Set position directly on mesh (physics disabled inside)
    this.mesh.position.copy(spawnPos);
    this.body.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    this.body.velocity.set(0, 0, 0);

    this.game.audio.playSound('door_open');
    globalEvents.emit('building_enter', { buildingId });
  }

  /**
   * Exit current building
   */
  exitBuilding(): void {
    if (!this.state.isInBuilding) return;

    const exitPos = this.game.interiors.exitBuilding();

    this.state.isInBuilding = false;
    this.state.currentBuildingId = null;

    // Set position
    this.mesh.position.copy(exitPos);
    this.body.position.set(exitPos.x, exitPos.y, exitPos.z);
    this.body.velocity.set(0, 0, 0);

    // Re-add physics body to world
    this.game.physics.world.addBody(this.body);

    this.game.audio.playSound('door_open');
    globalEvents.emit('building_exit', {});
  }

  /**
   * Start climbing a ladder/ledge
   */
  private startClimbing(): void {
    this.state.isClimbing = true;

    const climbState = this.climbingSystem.getState();
    if (climbState.climbState === 'ladder') {
      this.state.climbingType = 'ladder';
    } else if (climbState.climbState === 'ledge_grab' || climbState.climbState === 'ledge_shimmy') {
      this.state.climbingType = 'ledge';
    }

    // Disable physics while climbing
    this.body.mass = 0;
    this.body.velocity.setZero();

    this.game.audio.playSound('climb_start');
  }

  /**
   * Stop climbing
   */
  private stopClimbing(): void {
    this.climbingSystem.stopClimbing();
    this.state.isClimbing = false;
    this.state.climbingType = 'none';

    // Re-enable physics
    this.body.mass = 80;
    this.body.wakeUp();
  }

  /**
   * Update climbing movement and animation
   */
  private updateClimbing(deltaTime: number): void {
    const input = this.game.input.getState();

    // Update climbing system
    this.climbingSystem.update(input, deltaTime, this.body, this.mesh);

    // Check if climbing ended
    if (!this.climbingSystem.isClimbing()) {
      this.state.isClimbing = false;
      this.state.climbingType = 'none';
      this.body.mass = 80;
      this.body.wakeUp();
      return;
    }

    // Update climbing animation based on state
    const climbState = this.climbingSystem.getState();

    if (climbState.climbState === 'ladder') {
      const direction = input.forward ? 1 : input.backward ? -1 : 0;
      this.animator.animateClimbing(direction, deltaTime);
      this.state.climbingType = 'ladder';
    } else if (climbState.climbState === 'ledge_grab' || climbState.climbState === 'ledge_shimmy') {
      const shimmyDir = input.left ? -1 : input.right ? 1 : 0;
      this.animator.animateLedgeHang(shimmyDir, deltaTime);
      this.state.climbingType = 'ledge';
    } else if (climbState.climbState === 'pulling_up') {
      this.animator.animatePullUp(climbState.climbProgress);
      this.state.climbingType = 'pulling_up';
    }

    // Sync mesh position with physics body (which is controlled by ClimbingSystem)
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  takeDamage(amount: number, fromDirection?: THREE.Vector3): void {
    if (this.state.isDead) return;

    // If player is in a vehicle, ALL damage goes to the vehicle
    // Player is completely protected while inside
    if (this.state.isInVehicle && this.state.currentVehicle) {
      // Route all damage to vehicle - player is invulnerable inside
      this.game.vehicles.damageVehicle(this.state.currentVehicle.id, amount);
      return; // Player takes no damage while in vehicle
    }

    if (this.stats.armor > 0) {
      const armorDamage = Math.min(this.stats.armor, amount * 0.7);
      this.stats.armor -= armorDamage;
      amount -= armorDamage;
    }

    this.stats.health -= amount;
    this.stats.health = Math.max(0, this.stats.health);

    globalEvents.emit('damage_taken', { amount, health: this.stats.health });

    if (fromDirection && !this.state.isInVehicle) {
      const pushForce = fromDirection.normalize().multiplyScalar(-200);
      this.body.applyImpulse(
        new CANNON.Vec3(pushForce.x, pushForce.y, pushForce.z),
        this.body.position
      );
    }

    // Enhanced damage feedback - lofi style with vignette pulse
    this.showDamageEffect(amount);
  }

  private showDamageEffect(amount: number): void {
    // Create damage overlay
    let damageOverlay = document.getElementById('damage-overlay');
    if (!damageOverlay) {
      damageOverlay = document.createElement('div');
      damageOverlay.id = 'damage-overlay';
      damageOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999;
        background: radial-gradient(ellipse at center, transparent 40%, rgba(255, 50, 50, 0.5) 100%);
        opacity: 0;
      `;
      document.body.appendChild(damageOverlay);
    }

    // Intensity based on damage
    const intensity = Math.min(amount / 30, 1);

    // Flash effect
    gsap.killTweensOf(damageOverlay);
    gsap.to(damageOverlay, {
      opacity: 0.3 + intensity * 0.4,
      duration: 0.05,
      onComplete: () => {
        gsap.to(damageOverlay, {
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out'
        });
      }
    });

    // Screen shake via renderer chromatic aberration
    this.game.renderer.setChromaticAberration(intensity * 0.8);
    setTimeout(() => {
      this.game.renderer.setChromaticAberration(0);
    }, 100);

    // Vignette pulse
    const currentDarkness = 0.6;
    this.game.renderer.setVignetteDarkness(currentDarkness + intensity * 0.3);
    setTimeout(() => {
      this.game.renderer.setVignetteDarkness(currentDarkness);
    }, 200);
  }

  heal(amount: number): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  addArmor(amount: number): void {
    this.stats.armor = Math.min(this.stats.maxArmor, this.stats.armor + amount);
  }

  addMoney(amount: number): void {
    this.stats.money += amount;
  }

  setWantedLevel(level: number): void {
    this.stats.wantedLevel = Math.max(0, Math.min(5, level));
    globalEvents.emit('wanted_level_change', { level: this.stats.wantedLevel });
  }

  die(): void {
    this.state.isDead = true;
    globalEvents.emit('player_death', {});
    this.game.audio.playSound('death');
  }

  respawn(): void {
    this.state.isDead = false;
    this.stats.health = this.stats.maxHealth;
    this.stats.armor = 0;
    this.stats.wantedLevel = 0;
    this.stats.money = Math.max(0, this.stats.money - 100);

    const spawnPoint = this.game.world.getNearestHospital(this.mesh.position);
    this.setPosition(spawnPoint.x, spawnPoint.y, spawnPoint.z);
  }

  setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    // Clear any accumulated forces
    this.body.force.setZero();
    this.body.torque.setZero();
    this.mesh.position.set(x, y, z);
    // Wake up the body to ensure it responds to physics
    this.body.wakeUp();
  }

  setRotation(y: number): void {
    this.mesh.rotation.y = y;
  }

  equipWeapon(weapon: Weapon): void {
    this.currentWeapon = weapon;
    globalEvents.emit('weapon_equip', { weapon: weapon.config.id });
  }

  getCurrentWeapon(): Weapon | null {
    return this.game.weapons.getCurrentWeapon();
  }
}
