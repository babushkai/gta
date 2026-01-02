import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import gsap from 'gsap';
import { PlayerStats, PlayerState, Vehicle, Weapon, InputState } from '@/types';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';

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
  private animationTime: number = 0;
  private lastFootstepTime: number = 0;
  private footstepInterval: number = 0.4; // seconds between footsteps

  // Body part references for animation
  private leftThigh: THREE.Mesh | null = null;
  private rightThigh: THREE.Mesh | null = null;
  private leftCalf: THREE.Mesh | null = null;
  private rightCalf: THREE.Mesh | null = null;
  private leftUpperArm: THREE.Mesh | null = null;
  private rightUpperArm: THREE.Mesh | null = null;
  private leftForearm: THREE.Mesh | null = null;
  private rightForearm: THREE.Mesh | null = null;
  private torso: THREE.Mesh | null = null;

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
      currentVehicle: null
    };

    this.mesh = new THREE.Group();
    this.body = new CANNON.Body({ mass: 80 });
    this.cameraTarget = new THREE.Object3D();
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

    // Head - more detailed with slight oval shape
    const headGeometry = new THREE.SphereGeometry(0.14, 16, 16);
    headGeometry.scale(1, 1.1, 0.95);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.65;
    head.castShadow = true;
    this.mesh.add(head);

    // Hair
    const hairGeometry = new THREE.SphereGeometry(0.145, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 1.68;
    hair.scale.set(1, 0.8, 1);
    this.mesh.add(hair);

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
          // Vehicle jump
          this.jumpVehicle();
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
    });
  }

  update(deltaTime: number): void {
    if (this.state.isDead) return;

    if (this.state.isInVehicle) {
      this.updateInVehicle(deltaTime);
    } else {
      this.updateOnFoot(deltaTime);
    }

    this.updateCamera(deltaTime);
    this.updateStats(deltaTime);
  }

  private updateOnFoot(deltaTime: number): void {
    const input = this.game.input.getState();

    this.checkGrounded();
    this.updateRotation(input, deltaTime);
    this.updateMovement(input, deltaTime);
    this.updateAnimation(deltaTime);
  }

  private updateAnimation(deltaTime: number): void {
    // Animation speed depends on movement state
    const isMoving = this.state.isMoving && this.isGrounded;
    const isRunning = this.state.isRunning;
    const isJumping = this.state.isJumping || !this.isGrounded;

    // More dynamic animation parameters
    const walkSpeed = isRunning ? 14 : 7; // Faster animation cycle
    const legSwing = isRunning ? 0.9 : 0.5; // Larger leg rotation
    const armSwing = isRunning ? 0.8 : 0.4; // Larger arm swing
    const bobAmount = isRunning ? 0.08 : 0.04; // More vertical bob
    const hipSway = isRunning ? 0.08 : 0.04; // Hip sway side to side
    const shoulderTwist = isRunning ? 0.12 : 0.06; // Shoulder rotation

    if (isMoving) {
      this.animationTime += deltaTime * walkSpeed;

      const phase = Math.sin(this.animationTime);
      const phaseOffset = Math.sin(this.animationTime + Math.PI); // Opposite phase
      const halfPhase = Math.sin(this.animationTime * 2); // Double frequency for bob

      // Dynamic leg animation with more bend and lift
      if (this.leftThigh) {
        this.leftThigh.rotation.x = phase * legSwing;
        // Lift leg higher during swing
        this.leftThigh.position.y = 0.66 + Math.max(0, phase) * 0.04;
        // Slight outward rotation during run
        this.leftThigh.rotation.z = isRunning ? Math.max(0, -phase) * 0.1 : 0;
      }
      if (this.rightThigh) {
        this.rightThigh.rotation.x = phaseOffset * legSwing;
        this.rightThigh.position.y = 0.66 + Math.max(0, phaseOffset) * 0.04;
        this.rightThigh.rotation.z = isRunning ? Math.max(0, -phaseOffset) * -0.1 : 0;
      }

      // More dynamic calf animation - higher knee lift when running
      if (this.leftCalf) {
        const leftBend = Math.max(0, -phase) * (isRunning ? 0.8 : 0.5);
        this.leftCalf.rotation.x = leftBend;
        this.leftCalf.position.y = 0.32 - leftBend * 0.1;
        this.leftCalf.position.z = -leftBend * 0.12;
      }
      if (this.rightCalf) {
        const rightBend = Math.max(0, -phaseOffset) * (isRunning ? 0.8 : 0.5);
        this.rightCalf.rotation.x = rightBend;
        this.rightCalf.position.y = 0.32 - rightBend * 0.1;
        this.rightCalf.position.z = -rightBend * 0.12;
      }

      // Dynamic arm swing with elbow bend
      if (this.leftUpperArm) {
        this.leftUpperArm.rotation.x = phaseOffset * armSwing;
        // Arms swing slightly outward when running
        this.leftUpperArm.rotation.z = 0.15 + (isRunning ? Math.abs(phaseOffset) * 0.1 : 0);
      }
      if (this.rightUpperArm) {
        this.rightUpperArm.rotation.x = phase * armSwing;
        this.rightUpperArm.rotation.z = -0.15 - (isRunning ? Math.abs(phase) * 0.1 : 0);
      }

      // Forearms bend more when running
      if (this.leftForearm) {
        const elbowBend = isRunning ? 0.6 : 0.35;
        this.leftForearm.rotation.x = Math.max(0, phaseOffset) * elbowBend + (isRunning ? 0.3 : 0.1);
      }
      if (this.rightForearm) {
        const elbowBend = isRunning ? 0.6 : 0.35;
        this.rightForearm.rotation.x = Math.max(0, phase) * elbowBend + (isRunning ? 0.3 : 0.1);
      }

      // Dynamic torso movement - twist, bob, and lean
      if (this.torso) {
        // Shoulder twist opposite to hips
        this.torso.rotation.y = phase * shoulderTwist;
        // Vertical bob
        this.torso.position.y = 1.28 + Math.abs(halfPhase) * bobAmount;
        // Slight forward lean when running
        this.torso.rotation.x = isRunning ? 0.1 : 0;
        // Hip sway (lateral movement)
        this.torso.position.x = phase * hipSway;
      }

      // Footstep sounds
      const currentTime = this.game.getElapsedTime();
      const stepInterval = isRunning ? this.footstepInterval * 0.55 : this.footstepInterval;
      if (currentTime - this.lastFootstepTime > stepInterval) {
        this.playFootstep();
        this.lastFootstepTime = currentTime;
      }
    } else if (isJumping) {
      // Dynamic jumping pose
      const jumpPhase = Math.sin(this.animationTime * 3);

      if (this.leftThigh) {
        this.leftThigh.rotation.x = -0.4;
        this.leftThigh.rotation.z = 0.1;
      }
      if (this.rightThigh) {
        this.rightThigh.rotation.x = -0.4;
        this.rightThigh.rotation.z = -0.1;
      }
      if (this.leftCalf) {
        this.leftCalf.rotation.x = 0.5 + jumpPhase * 0.1;
        this.leftCalf.position.y = 0.3;
        this.leftCalf.position.z = -0.06;
      }
      if (this.rightCalf) {
        this.rightCalf.rotation.x = 0.5 + jumpPhase * 0.1;
        this.rightCalf.position.y = 0.3;
        this.rightCalf.position.z = -0.06;
      }
      // Arms up for balance
      if (this.leftUpperArm) {
        this.leftUpperArm.rotation.x = -0.6;
        this.leftUpperArm.rotation.z = 0.4;
      }
      if (this.rightUpperArm) {
        this.rightUpperArm.rotation.x = -0.6;
        this.rightUpperArm.rotation.z = -0.4;
      }
      if (this.leftForearm) this.leftForearm.rotation.x = 0.3;
      if (this.rightForearm) this.rightForearm.rotation.x = 0.3;

      // Continue animating in air
      this.animationTime += deltaTime * 5;
    } else {
      // Idle pose with subtle breathing animation
      const breathPhase = Math.sin(this.game.getElapsedTime() * 1.5);
      const lerpSpeed = 8 * deltaTime;

      if (this.leftThigh) {
        this.leftThigh.rotation.x *= (1 - lerpSpeed);
        this.leftThigh.rotation.z *= (1 - lerpSpeed);
        this.leftThigh.position.y = 0.66;
      }
      if (this.rightThigh) {
        this.rightThigh.rotation.x *= (1 - lerpSpeed);
        this.rightThigh.rotation.z *= (1 - lerpSpeed);
        this.rightThigh.position.y = 0.66;
      }
      if (this.leftCalf) {
        this.leftCalf.rotation.x *= (1 - lerpSpeed);
        this.leftCalf.position.y = 0.32;
        this.leftCalf.position.z = 0;
      }
      if (this.rightCalf) {
        this.rightCalf.rotation.x *= (1 - lerpSpeed);
        this.rightCalf.position.y = 0.32;
        this.rightCalf.position.z = 0;
      }
      if (this.leftUpperArm) {
        this.leftUpperArm.rotation.x *= (1 - lerpSpeed);
        this.leftUpperArm.rotation.z = 0.15;
      }
      if (this.rightUpperArm) {
        this.rightUpperArm.rotation.x *= (1 - lerpSpeed);
        this.rightUpperArm.rotation.z = -0.15;
      }
      if (this.leftForearm) this.leftForearm.rotation.x *= (1 - lerpSpeed);
      if (this.rightForearm) this.rightForearm.rotation.x *= (1 - lerpSpeed);
      if (this.torso) {
        this.torso.rotation.y *= (1 - lerpSpeed);
        this.torso.rotation.x *= (1 - lerpSpeed);
        this.torso.position.x *= (1 - lerpSpeed);
        // Subtle breathing motion
        this.torso.position.y = 1.28 + breathPhase * 0.01;
      }

      // Reset animation time smoothly
      this.animationTime *= (1 - lerpSpeed);
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
      // Vehicle camera: higher and further back, look at vehicle center
      targetOffset = new THREE.Vector3(0, 5, 12);
      targetLookOffset = new THREE.Vector3(0, 1, 0);
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

    gsap.to(document.body, {
      backgroundColor: 'rgba(255, 0, 0, 0.3)',
      duration: 0.1,
      yoyo: true,
      repeat: 1
    });
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
