import * as THREE from 'three';
import { Game } from '@/core/Game';

/**
 * WebSwingingSystem - Spiderman-style web-swinging mechanics
 *
 * Features:
 * - Pendulum physics for realistic swing motion
 * - Web anchor detection using raycasts against buildings
 * - Momentum-based movement for fluid traversal
 * - Visual web line rendering
 */
export class WebSwingingSystem {
  private game: Game;

  // Swing state
  private isSwinging: boolean = false;
  private anchorPoint: THREE.Vector3 | null = null;
  private webLength: number = 0;
  private swingVelocity: THREE.Vector3 = new THREE.Vector3();

  // Web line visual
  private webLine: THREE.Line | null = null;
  private webMaterial: THREE.LineBasicMaterial | null = null;

  // Physics constants - tuned for smooth Spiderman feel
  private readonly GRAVITY = 20; // Moderate gravity for controllable swings
  private readonly SWING_DAMPING = 0.998; // Very little damping for long swings
  private readonly MIN_WEB_LENGTH = 5;
  private readonly MAX_WEB_LENGTH = 100;
  private readonly WEB_SHOOT_RANGE = 120;
  private readonly BOOST_FORCE = 12; // Force applied when boosting
  private readonly WEB_RETRACT_SPEED = 15; // How fast web shortens
  private readonly WEB_EXTEND_SPEED = 12; // How fast web lengthens
  private readonly LATERAL_STEERING = 6; // A/D steering force
  private readonly MAX_SWING_SPEED = 40; // Cap maximum swing speed
  private readonly PHYSICS_SUBSTEPS = 4; // Sub-steps per frame for smooth physics

  // Air control (when not swinging but airborne)
  private airVelocity: THREE.Vector3 = new THREE.Vector3();
  private isAirborne: boolean = false;
  private readonly AIR_CONTROL = 5;
  private readonly AIR_DAMPING = 0.98;
  private readonly AIR_GRAVITY = 20;

  // Smooth position interpolation
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly POSITION_LERP_SPEED = 15;

  // Audio state
  private isSwingSoundPlaying: boolean = false;

  constructor(game: Game) {
    this.game = game;
    this.createWebLine();
  }

  /**
   * Create the visual web line
   */
  private createWebLine(): void {
    const geometry = new THREE.BufferGeometry();
    // Initialize with empty positions
    const positions = new Float32Array(6); // 2 points x 3 components
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.webMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      linewidth: 2
    });

    this.webLine = new THREE.Line(geometry, this.webMaterial);
    this.webLine.visible = false;
    this.webLine.frustumCulled = false;
    this.game.scene.add(this.webLine);
  }

  /**
   * Main update loop
   */
  update(deltaTime: number): void {
    const player = this.game.player;

    if (this.isSwinging && this.anchorPoint) {
      this.updateSwingPhysics(deltaTime);
      this.updateWebLine();
      this.handleSwingInput(deltaTime);

      // Update player state
      player.state.isSwinging = true;
    } else if (this.isAirborne) {
      this.updateAirbornePhysics(deltaTime);
      player.state.isSwinging = false;
    } else {
      player.state.isSwinging = false;
    }
  }

  /**
   * Try to shoot a web at a building
   */
  tryShootWeb(): boolean {
    console.log('tryShootWeb called, isSwinging:', this.isSwinging);
    if (this.isSwinging) return false;

    const anchor = this.findAnchorPoint();
    console.log('Found anchor:', anchor);
    if (!anchor) return false;

    // Calculate initial web length
    const playerPos = this.game.player.mesh.position;
    this.webLength = playerPos.distanceTo(anchor);

    // Clamp web length
    if (this.webLength < this.MIN_WEB_LENGTH || this.webLength > this.MAX_WEB_LENGTH) {
      return false;
    }

    this.anchorPoint = anchor;
    this.isSwinging = true;
    this.isAirborne = false;

    console.log('Web attached! Anchor:', anchor.x.toFixed(2), anchor.y.toFixed(2), anchor.z.toFixed(2), 'webLength:', this.webLength.toFixed(2));

    // Initialize target position to current player position
    this.targetPosition.copy(playerPos);

    // Initialize swing velocity from current movement
    const playerBody = this.game.player.getPhysicsBody();
    if (playerBody) {
      this.swingVelocity.set(
        playerBody.velocity.x,
        playerBody.velocity.y,
        playerBody.velocity.z
      );
      // Disable physics while swinging
      playerBody.mass = 0;
      playerBody.velocity.set(0, 0, 0);
    } else {
      // If airborne, carry over air velocity
      this.swingVelocity.copy(this.airVelocity);
    }

    // Show web line
    if (this.webLine) {
      this.webLine.visible = true;
    }

    // Play web shoot sound
    this.game.audio.playSound('web_shoot');

    // Start wind sound
    this.startSwingSound();

    return true;
  }

  /**
   * Release the web and launch with momentum
   */
  releaseWeb(boost: boolean = false): void {
    if (!this.isSwinging) return;

    // Apply boost if requested
    if (boost) {
      const boostDir = this.swingVelocity.clone().normalize();
      // Add upward component to boost
      boostDir.y = Math.max(boostDir.y + 0.5, 0.3);
      boostDir.normalize();
      this.swingVelocity.add(boostDir.multiplyScalar(this.BOOST_FORCE));
    }

    // Transfer swing velocity to air velocity
    this.airVelocity.copy(this.swingVelocity);
    this.isAirborne = true;
    this.isSwinging = false;
    this.anchorPoint = null;

    // Hide web line
    if (this.webLine) {
      this.webLine.visible = false;
    }

    // Re-enable physics body but with our velocity
    const playerBody = this.game.player.getPhysicsBody();
    if (playerBody) {
      playerBody.mass = 70; // Restore mass
      playerBody.velocity.set(
        this.airVelocity.x,
        this.airVelocity.y,
        this.airVelocity.z
      );
    }

    // Play release sound
    this.game.audio.playSound('web_release');

    // Stop swing sound
    this.stopSwingSound();
  }

  /**
   * Find a valid anchor point for the web
   */
  private findAnchorPoint(): THREE.Vector3 | null {
    const player = this.game.player;
    const camera = this.game.camera;

    // Get camera look direction
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // Bias upward for better swing points
    direction.y = Math.max(direction.y + 0.3, 0.1);
    direction.normalize();

    const playerPos = player.mesh.position.clone();
    playerPos.y += 1.5; // Shoot from chest height

    // Raycast to find building
    const raycaster = new THREE.Raycaster(playerPos, direction, 0, this.WEB_SHOOT_RANGE);
    // Set camera for Sprite raycasting (required by THREE.js)
    raycaster.camera = camera;

    // Collect only mesh objects (skip Sprites to avoid raycast errors)
    const meshObjects: THREE.Object3D[] = [];
    this.game.scene.traverse((obj) => {
      // Only include Mesh objects, skip Sprites and other non-mesh types
      if (obj instanceof THREE.Mesh) {
        meshObjects.push(obj);
      }
    });

    // Raycast against collected meshes only
    const intersects = raycaster.intersectObjects(meshObjects, false);

    for (const intersect of intersects) {
      // Skip ground, player, vehicles
      if (intersect.object.name === 'ground' ||
          intersect.object.name.includes('player') ||
          intersect.object.name.includes('vehicle') ||
          intersect.object.userData.isVehicle ||
          intersect.object.userData.isPlayer) {
        continue;
      }

      // Must be above player for good swing
      if (intersect.point.y > playerPos.y - 5) {
        return intersect.point.clone();
      }
    }

    // Fallback: create anchor point in direction if nothing found
    // This allows swinging even with sparse geometry
    const fallbackAnchor = playerPos.clone().add(direction.multiplyScalar(50));
    fallbackAnchor.y = Math.max(fallbackAnchor.y, playerPos.y + 20); // Ensure it's above
    return fallbackAnchor;
  }

  /**
   * Update pendulum swing physics - real-time smooth swinging
   */
  private updateSwingPhysics(deltaTime: number): void {
    if (!this.anchorPoint) return;

    const player = this.game.player;
    const playerPos = player.mesh.position;

    // Debug: log every 10th frame to see if physics is running
    if (Math.random() < 0.1) {
      console.log('Swing physics running, deltaTime:', deltaTime.toFixed(4), 'pos:', playerPos.x.toFixed(2), playerPos.y.toFixed(2), playerPos.z.toFixed(2));
    }

    // Vector from player to anchor
    const toAnchor = this.anchorPoint.clone().sub(playerPos);
    const ropeDir = toAnchor.clone().normalize();

    // Gravity force
    const gravityForce = new THREE.Vector3(0, -this.GRAVITY, 0);

    // Calculate tension (force along rope) - this pulls toward anchor
    const tensionMagnitude = gravityForce.dot(ropeDir);
    const tensionForce = ropeDir.clone().multiplyScalar(tensionMagnitude);

    // Tangential force (perpendicular to rope, causes swing)
    const tangentialForce = gravityForce.clone().sub(tensionForce);

    // Apply tangential acceleration (scaled by deltaTime for smooth motion)
    this.swingVelocity.add(tangentialForce.multiplyScalar(deltaTime));

    // Clamp max velocity to prevent teleporting
    const speed = this.swingVelocity.length();
    if (speed > this.MAX_SWING_SPEED) {
      this.swingVelocity.multiplyScalar(this.MAX_SWING_SPEED / speed);
    }

    // Apply damping (frame-rate independent)
    this.swingVelocity.multiplyScalar(Math.pow(this.SWING_DAMPING, deltaTime * 60));

    // Calculate new position based on velocity
    const displacement = this.swingVelocity.clone().multiplyScalar(deltaTime);
    const newPos = playerPos.clone().add(displacement);

    // Constrain to web length (circular motion constraint)
    const newToAnchor = this.anchorPoint.clone().sub(newPos);
    const newLength = newToAnchor.length();

    if (newLength > this.webLength) {
      // Pull back to web length - this is the pendulum constraint
      newToAnchor.normalize().multiplyScalar(this.webLength);
      newPos.copy(this.anchorPoint).sub(newToAnchor);

      // Remove velocity component along rope (keeps only tangential velocity)
      const velocityAlongRope = ropeDir.clone().multiplyScalar(this.swingVelocity.dot(ropeDir));
      this.swingVelocity.sub(velocityAlongRope);
    }

    // Prevent going through ground
    if (newPos.y < 1.0) {
      newPos.y = 1.0;
      this.swingVelocity.y = Math.max(this.swingVelocity.y, 0);
    }

    // Update player position DIRECTLY for real-time visual feedback
    player.mesh.position.copy(newPos);

    // Sync physics body position
    const body = player.getPhysicsBody();
    if (body) {
      body.position.set(newPos.x, newPos.y, newPos.z);
      body.velocity.set(0, 0, 0); // Ensure physics doesn't override
    }

    // Debug: show position after update
    if (Math.random() < 0.1) {
      console.log('After swing update, newPos:', newPos.x.toFixed(2), newPos.y.toFixed(2), newPos.z.toFixed(2), 'velocity:', this.swingVelocity.length().toFixed(2));
    }
  }

  /**
   * Handle input while swinging
   */
  private handleSwingInput(deltaTime: number): void {
    const input = this.game.input.getState();

    // W - Retract web (climb up)
    if (input.forward) {
      this.webLength = Math.max(this.MIN_WEB_LENGTH, this.webLength - this.WEB_RETRACT_SPEED * deltaTime);
    }

    // S - Extend web (drop down)
    if (input.backward) {
      this.webLength = Math.min(this.MAX_WEB_LENGTH, this.webLength + this.WEB_EXTEND_SPEED * deltaTime);
    }

    // A/D - Lateral steering
    if (input.left || input.right) {
      const camera = this.game.camera;
      const cameraRight = new THREE.Vector3();
      camera.getWorldDirection(cameraRight);
      cameraRight.cross(new THREE.Vector3(0, 1, 0)).normalize();

      const steerDir = input.left ? -1 : 1;
      this.swingVelocity.add(cameraRight.multiplyScalar(steerDir * this.LATERAL_STEERING * deltaTime));
    }
  }

  /**
   * Update physics while airborne (not swinging)
   */
  private updateAirbornePhysics(deltaTime: number): void {
    const player = this.game.player;
    const body = player.getPhysicsBody();

    // Check if we've landed
    if (body && body.position.y < 2) {
      this.isAirborne = false;
      this.airVelocity.set(0, 0, 0);
      return;
    }

    // Apply gravity
    this.airVelocity.y -= this.AIR_GRAVITY * deltaTime;

    // Air control
    const input = this.game.input.getState();
    if (input.forward || input.backward || input.left || input.right) {
      const camera = this.game.camera;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));

      const moveDir = new THREE.Vector3();
      if (input.forward) moveDir.add(forward);
      if (input.backward) moveDir.sub(forward);
      if (input.left) moveDir.sub(right);
      if (input.right) moveDir.add(right);

      if (moveDir.length() > 0) {
        moveDir.normalize();
        this.airVelocity.x += moveDir.x * this.AIR_CONTROL * deltaTime;
        this.airVelocity.z += moveDir.z * this.AIR_CONTROL * deltaTime;
      }
    }

    // Apply damping
    this.airVelocity.x *= this.AIR_DAMPING;
    this.airVelocity.z *= this.AIR_DAMPING;

    // Update physics body
    if (body) {
      body.velocity.set(this.airVelocity.x, this.airVelocity.y, this.airVelocity.z);
    }
  }

  /**
   * Update web line visual
   */
  private updateWebLine(): void {
    if (!this.webLine || !this.anchorPoint) return;

    const playerPos = this.game.player.mesh.position;
    const positions = this.webLine.geometry.attributes.position as THREE.BufferAttribute;

    // Start point (player's hand/chest)
    positions.setXYZ(0, playerPos.x, playerPos.y + 1.2, playerPos.z);

    // End point (anchor)
    positions.setXYZ(1, this.anchorPoint.x, this.anchorPoint.y, this.anchorPoint.z);

    positions.needsUpdate = true;
  }

  /**
   * Start swing wind sound
   */
  private startSwingSound(): void {
    if (!this.isSwingSoundPlaying) {
      this.game.audio.playSound('wind_loop', { volume: 0.3 });
      this.isSwingSoundPlaying = true;
    }
  }

  /**
   * Stop swing wind sound
   */
  private stopSwingSound(): void {
    this.isSwingSoundPlaying = false;
    // Note: wind_loop should be a looping sound that stops when this is called
  }

  /**
   * Check if currently swinging
   */
  isCurrentlySwinging(): boolean {
    return this.isSwinging;
  }

  /**
   * Check if airborne (after release)
   */
  isCurrentlyAirborne(): boolean {
    return this.isAirborne;
  }

  /**
   * Get current swing speed for UI/effects
   */
  getSwingSpeed(): number {
    return this.swingVelocity.length();
  }

  /**
   * Force stop swinging (e.g., when entering vehicle)
   */
  forceStop(): void {
    if (this.isSwinging) {
      this.releaseWeb(false);
    }
    this.isAirborne = false;
    this.airVelocity.set(0, 0, 0);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.webLine) {
      this.game.scene.remove(this.webLine);
      this.webLine.geometry.dispose();
      this.webMaterial?.dispose();
    }
  }
}
