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

  private moveSpeed: number = 15;
  private sprintMultiplier: number = 2.0;
  private jumpForce: number = 12;
  private rotationSpeed: number = 0.003;

  private isGrounded: boolean = true;

  private currentWeapon: Weapon | null = null;
  private aimTransition: number = 0;

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

    // Torso - upper body (chest)
    const chestGeometry = new THREE.BoxGeometry(0.38, 0.28, 0.2);
    const chest = new THREE.Mesh(chestGeometry, shirtMaterial);
    chest.position.y = 1.28;
    chest.castShadow = true;
    this.mesh.add(chest);

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

    // Upper arms
    const upperArmGeometry = new THREE.CapsuleGeometry(0.05, 0.2, 4, 8);

    const leftUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    leftUpperArm.position.set(-0.24, 1.28, 0);
    leftUpperArm.rotation.z = 0.15;
    leftUpperArm.castShadow = true;
    this.mesh.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    rightUpperArm.position.set(0.24, 1.28, 0);
    rightUpperArm.rotation.z = -0.15;
    rightUpperArm.castShadow = true;
    this.mesh.add(rightUpperArm);

    // Lower arms (forearms) - skin visible
    const forearmGeometry = new THREE.CapsuleGeometry(0.04, 0.2, 4, 8);

    const leftForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    leftForearm.position.set(-0.28, 1.0, 0);
    leftForearm.rotation.z = 0.1;
    leftForearm.castShadow = true;
    this.mesh.add(leftForearm);

    const rightForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    rightForearm.position.set(0.28, 1.0, 0);
    rightForearm.rotation.z = -0.1;
    rightForearm.castShadow = true;
    this.mesh.add(rightForearm);

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

    // Upper legs (thighs)
    const thighGeometry = new THREE.CapsuleGeometry(0.07, 0.28, 4, 8);

    const leftThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    leftThigh.position.set(-0.1, 0.66, 0);
    leftThigh.castShadow = true;
    this.mesh.add(leftThigh);

    const rightThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    rightThigh.position.set(0.1, 0.66, 0);
    rightThigh.castShadow = true;
    this.mesh.add(rightThigh);

    // Lower legs (calves)
    const calfGeometry = new THREE.CapsuleGeometry(0.055, 0.28, 4, 8);

    const leftCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    leftCalf.position.set(-0.1, 0.32, 0);
    leftCalf.castShadow = true;
    this.mesh.add(leftCalf);

    const rightCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    rightCalf.position.set(0.1, 0.32, 0);
    rightCalf.castShadow = true;
    this.mesh.add(rightCalf);

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
      if (data.pressed && this.currentWeapon) {
        this.shoot();
      }
    });

    this.game.input.on('aim', (data: { pressed: boolean }) => {
      this.state.isAiming = data.pressed;
      this.updateAimCamera(data.pressed);
    });

    this.game.input.on('keydown', (data: { action: string }) => {
      if (data.action === 'reload' && this.currentWeapon) {
        this.reload();
      }
      if (data.action === 'enterVehicle') {
        this.tryEnterVehicle();
      }
      if (data.action === 'jump' && this.isGrounded && !this.state.isInVehicle) {
        this.jump();
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

  private checkGrounded(): void {
    // Raycast from just above the feet (body position is at character's feet level)
    const from = new THREE.Vector3(
      this.body.position.x,
      this.body.position.y + 0.1,
      this.body.position.z
    );
    const to = new THREE.Vector3(
      this.body.position.x,
      this.body.position.y - 0.2,
      this.body.position.z
    );

    const result = this.game.physics.raycast(from, to, {
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.STATIC
    });

    this.isGrounded = result.hit;
    this.state.isJumping = !this.isGrounded;
  }

  private jump(): void {
    if (!this.isGrounded) return;

    this.body.velocity.y = this.jumpForce;
    this.state.isJumping = true;
    this.isGrounded = false;

    this.game.audio.playSound('jump');
  }

  private updateInVehicle(deltaTime: number): void {
    if (!this.state.currentVehicle) return;

    const vehicle = this.state.currentVehicle;
    this.mesh.position.copy(vehicle.mesh.position);
    this.mesh.rotation.copy(vehicle.mesh.rotation);
    this.mesh.visible = false;
  }

  private updateCamera(deltaTime: number): void {
    const input = this.game.input.getState();

    let targetOffset = this.cameraOffset.clone();
    let targetLookOffset = this.cameraLookOffset.clone();

    if (this.state.isAiming) {
      this.aimTransition = Math.min(1, this.aimTransition + deltaTime * 5);
      targetOffset = new THREE.Vector3(0.5, 2, 3);
      targetLookOffset = new THREE.Vector3(0, 1.6, 0);
    } else {
      this.aimTransition = Math.max(0, this.aimTransition - deltaTime * 5);
    }

    if (this.state.isInVehicle && this.state.currentVehicle) {
      targetOffset = new THREE.Vector3(0, 4, 10);
    }

    const currentOffset = this.cameraOffset.lerp(targetOffset, deltaTime * 5);
    const currentLookOffset = this.cameraLookOffset.lerp(targetLookOffset, deltaTime * 5);

    const rotatedOffset = currentOffset.clone().applyEuler(this.mesh.rotation);
    const targetPosition = this.mesh.position.clone().add(rotatedOffset);

    this.game.camera.position.lerp(targetPosition, deltaTime * 8);

    const lookAt = this.mesh.position.clone().add(currentLookOffset);
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
    if (!this.currentWeapon || this.state.isReloading) return;
    if (this.currentWeapon.currentAmmo <= 0) {
      this.game.audio.playSound('empty_click');
      return;
    }

    this.currentWeapon.currentAmmo--;
    this.state.isShooting = true;

    this.game.audio.playSound(this.currentWeapon.config.sounds.fire);

    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.game.camera.quaternion);
    const from = this.game.camera.position.clone();
    const to = from.clone().add(direction.multiplyScalar(this.currentWeapon.config.range));

    const result = this.game.physics.raycast(from, to);
    if (result.hit && result.point) {
      this.game.world.createBulletHole(result.point, result.normal!);

      globalEvents.emit('weapon_fire', {
        weapon: this.currentWeapon.config.id,
        hit: true,
        position: result.point
      });
    }

    setTimeout(() => {
      this.state.isShooting = false;
    }, 1000 / this.currentWeapon.config.fireRate);
  }

  private reload(): void {
    if (!this.currentWeapon || this.state.isReloading) return;
    if (this.currentWeapon.reserveAmmo <= 0) return;
    if (this.currentWeapon.currentAmmo >= this.currentWeapon.config.magazineSize) return;

    this.state.isReloading = true;
    this.game.audio.playSound(this.currentWeapon.config.sounds.reload);

    setTimeout(() => {
      if (!this.currentWeapon) return;

      const needed = this.currentWeapon.config.magazineSize - this.currentWeapon.currentAmmo;
      const available = Math.min(needed, this.currentWeapon.reserveAmmo);

      this.currentWeapon.currentAmmo += available;
      this.currentWeapon.reserveAmmo -= available;
      this.state.isReloading = false;
    }, this.currentWeapon.config.reloadTime * 1000);
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

    const exitPosition = this.state.currentVehicle.mesh.position.clone();
    exitPosition.x += 2;

    this.state.currentVehicle.driver = null;
    this.state.isInVehicle = false;
    this.state.currentVehicle = null;
    this.mesh.visible = true;

    this.setPosition(exitPosition.x, exitPosition.y + 1, exitPosition.z);
    this.game.physics.world.addBody(this.body);

    globalEvents.emit('vehicle_exit', {});
    this.game.audio.playSound('car_door');
  }

  takeDamage(amount: number, fromDirection?: THREE.Vector3): void {
    if (this.state.isDead) return;

    if (this.stats.armor > 0) {
      const armorDamage = Math.min(this.stats.armor, amount * 0.7);
      this.stats.armor -= armorDamage;
      amount -= armorDamage;
    }

    this.stats.health -= amount;
    this.stats.health = Math.max(0, this.stats.health);

    globalEvents.emit('damage_taken', { amount, health: this.stats.health });

    if (fromDirection) {
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
    this.mesh.position.set(x, y, z);
  }

  setRotation(y: number): void {
    this.mesh.rotation.y = y;
  }

  equipWeapon(weapon: Weapon): void {
    this.currentWeapon = weapon;
    globalEvents.emit('weapon_equip', { weapon: weapon.config.id });
  }

  getCurrentWeapon(): Weapon | null {
    return this.currentWeapon;
  }
}
