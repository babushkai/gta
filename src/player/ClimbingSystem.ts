import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '@/core/Game';
import { ClimbableObject } from '@/interiors/InteriorManager';
import { InputState } from '@/types';

export type ClimbState = 'none' | 'ladder' | 'ledge_grab' | 'ledge_shimmy' | 'pulling_up';

export interface ClimbingState {
  isClimbing: boolean;
  climbState: ClimbState;
  currentClimbable: ClimbableObject | null;
  climbProgress: number; // 0 = bottom, 1 = top
  shimmyOffset: number;  // Horizontal offset along ledge
}

/**
 * ClimbingSystem - Handles ladder climbing, ledge grabbing, and parkour mechanics
 */
export class ClimbingSystem {
  private game: Game;
  private state: ClimbingState;

  // Climbing parameters
  private climbSpeed: number = 3.0;
  private shimmySpeed: number = 1.5;
  private ladderDetectionRange: number = 1.2;
  private ledgeDetectionRange: number = 1.5;
  private pullUpDuration: number = 0.5;

  // Raycaster for detection
  private raycaster: THREE.Raycaster;

  // Animation tracking
  private climbAnimationTime: number = 0;

  constructor(game: Game) {
    this.game = game;
    this.raycaster = new THREE.Raycaster();

    this.state = {
      isClimbing: false,
      climbState: 'none',
      currentClimbable: null,
      climbProgress: 0,
      shimmyOffset: 0
    };
  }

  getState(): ClimbingState {
    return this.state;
  }

  /**
   * Try to start climbing - called when player presses interact near a climbable
   */
  tryStartClimbing(playerPosition: THREE.Vector3, playerRotation: THREE.Euler): boolean {
    // First check for ladders
    const ladder = this.detectLadder(playerPosition, playerRotation);
    if (ladder) {
      this.startClimbing(ladder, playerPosition);
      return true;
    }

    // Then check for ledges
    const ledge = this.detectLedge(playerPosition, playerRotation);
    if (ledge) {
      this.startLedgeGrab(ledge, playerPosition);
      return true;
    }

    return false;
  }

  /**
   * Detect ladder in front of player using raycast
   */
  private detectLadder(position: THREE.Vector3, rotation: THREE.Euler): ClimbableObject | null {
    // Cast ray forward from player
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(rotation);

    this.raycaster.set(
      new THREE.Vector3(position.x, position.y + 1, position.z),
      forward
    );
    this.raycaster.far = this.ladderDetectionRange;

    // Check scene for climbable objects
    const intersects = this.raycaster.intersectObjects(this.game.scene.children, true);

    for (const hit of intersects) {
      if (hit.object.userData.climbable && hit.object.userData.climbableId) {
        const climbable = this.game.interiors.getClimbable(hit.object.userData.climbableId);
        if (climbable && climbable.type === 'ladder') {
          return climbable;
        }
      }
    }

    // Also check InteriorManager for nearby ladders
    return this.game.interiors.findNearestClimbable(position, this.ladderDetectionRange, 'ladder');
  }

  /**
   * Detect ledge above player
   */
  private detectLedge(position: THREE.Vector3, rotation: THREE.Euler): ClimbableObject | null {
    // Cast ray forward then up to find ledge
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(rotation);

    // First check if there's a wall in front
    const wallCheckPos = position.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.raycaster.set(wallCheckPos, forward);
    this.raycaster.far = this.ledgeDetectionRange;

    const wallHits = this.raycaster.intersectObjects(this.game.scene.children, true);

    if (wallHits.length > 0) {
      const wallHit = wallHits[0];

      // Now cast down from above to find ledge top
      const abovePoint = wallHit.point.clone().add(new THREE.Vector3(0, 2, 0));
      abovePoint.add(forward.clone().multiplyScalar(-0.3)); // Step back slightly

      this.raycaster.set(abovePoint, new THREE.Vector3(0, -1, 0));
      this.raycaster.far = 3;

      const ledgeHits = this.raycaster.intersectObjects(this.game.scene.children, true);

      if (ledgeHits.length > 0) {
        const ledgeHit = ledgeHits[0];
        const ledgeHeight = ledgeHit.point.y;

        // Check if ledge is at a grabbable height (above head, below max reach)
        const playerHeight = position.y;
        const heightDiff = ledgeHeight - playerHeight;

        if (heightDiff > 1.8 && heightDiff < 3.5) {
          // Create dynamic ledge climbable
          const normal = wallHit.face?.normal || new THREE.Vector3(0, 0, 1);

          return {
            id: `ledge_dynamic_${Date.now()}`,
            type: 'ledge',
            position: ledgeHit.point.clone(),
            topPosition: ledgeHit.point.clone(),
            bottomPosition: position.clone().add(new THREE.Vector3(0, heightDiff - 0.5, 0)),
            normal: normal.clone().negate(),
            width: 2,
            mesh: ledgeHit.object
          };
        }
      }
    }

    return null;
  }

  /**
   * Start climbing a ladder
   */
  private startClimbing(climbable: ClimbableObject, playerPosition: THREE.Vector3): void {
    this.state.isClimbing = true;
    this.state.climbState = 'ladder';
    this.state.currentClimbable = climbable;

    // Calculate initial climb progress based on player height
    const totalHeight = climbable.topPosition.y - climbable.bottomPosition.y;
    const playerHeightOnLadder = playerPosition.y - climbable.bottomPosition.y;
    this.state.climbProgress = Math.max(0, Math.min(1, playerHeightOnLadder / totalHeight));

    this.climbAnimationTime = 0;
  }

  /**
   * Start grabbing a ledge
   */
  private startLedgeGrab(climbable: ClimbableObject, _playerPosition: THREE.Vector3): void {
    this.state.isClimbing = true;
    this.state.climbState = 'ledge_grab';
    this.state.currentClimbable = climbable;
    this.state.climbProgress = 0;
    this.state.shimmyOffset = 0;

    this.climbAnimationTime = 0;
  }

  /**
   * Stop climbing and return to normal state
   */
  stopClimbing(): void {
    this.state.isClimbing = false;
    this.state.climbState = 'none';
    this.state.currentClimbable = null;
    this.state.climbProgress = 0;
    this.state.shimmyOffset = 0;
  }

  /**
   * Update climbing based on input
   */
  update(input: InputState, deltaTime: number, playerBody: CANNON.Body, playerMesh: THREE.Object3D): void {
    if (!this.state.isClimbing || !this.state.currentClimbable) return;

    this.climbAnimationTime += deltaTime;

    switch (this.state.climbState) {
      case 'ladder':
        this.updateLadderClimbing(input, deltaTime, playerBody, playerMesh);
        break;
      case 'ledge_grab':
        this.updateLedgeGrab(input, deltaTime, playerBody, playerMesh);
        break;
      case 'ledge_shimmy':
        this.updateLedgeShimmy(input, deltaTime, playerBody, playerMesh);
        break;
      case 'pulling_up':
        this.updatePullUp(deltaTime, playerBody, playerMesh);
        break;
    }
  }

  private updateLadderClimbing(
    input: InputState,
    deltaTime: number,
    playerBody: CANNON.Body,
    playerMesh: THREE.Object3D
  ): void {
    const climbable = this.state.currentClimbable!;
    const totalHeight = climbable.topPosition.y - climbable.bottomPosition.y;

    // Climb up/down with W/S
    if (input.forward) {
      this.state.climbProgress += (this.climbSpeed / totalHeight) * deltaTime;
    }
    if (input.backward) {
      this.state.climbProgress -= (this.climbSpeed / totalHeight) * deltaTime;
    }

    // Clamp progress
    this.state.climbProgress = Math.max(0, Math.min(1, this.state.climbProgress));

    // Calculate player position on ladder
    const currentY = THREE.MathUtils.lerp(
      climbable.bottomPosition.y,
      climbable.topPosition.y,
      this.state.climbProgress
    );

    // Position player on ladder
    const ladderPos = climbable.position.clone();
    ladderPos.y = currentY;

    // Offset player slightly from ladder
    const offset = climbable.normal.clone().multiplyScalar(0.4);
    ladderPos.add(offset);

    // Update physics body position (disable physics while climbing)
    playerBody.position.set(ladderPos.x, ladderPos.y, ladderPos.z);
    playerBody.velocity.setZero();

    // Update mesh position
    playerMesh.position.copy(ladderPos);

    // Face the ladder
    const lookAtPoint = ladderPos.clone().sub(climbable.normal);
    playerMesh.lookAt(lookAtPoint);

    // Jump off ladder
    if (input.jump) {
      this.stopClimbing();
      // Give slight push away from ladder
      playerBody.velocity.set(
        climbable.normal.x * 3,
        5,
        climbable.normal.z * 3
      );
      return;
    }

    // Reached top - step off
    if (this.state.climbProgress >= 1) {
      this.stopClimbing();
      const topPos = climbable.topPosition.clone();
      topPos.add(climbable.normal.clone().multiplyScalar(0.5));
      playerBody.position.set(topPos.x, topPos.y + 0.5, topPos.z);
    }

    // Reached bottom - step off
    if (this.state.climbProgress <= 0) {
      this.stopClimbing();
      const bottomPos = climbable.bottomPosition.clone();
      bottomPos.add(climbable.normal.clone().multiplyScalar(0.5));
      playerBody.position.set(bottomPos.x, bottomPos.y, bottomPos.z);
    }
  }

  private updateLedgeGrab(
    input: InputState,
    deltaTime: number,
    playerBody: CANNON.Body,
    playerMesh: THREE.Object3D
  ): void {
    const climbable = this.state.currentClimbable!;

    // Position player hanging below ledge
    const hangPosition = climbable.topPosition.clone();
    hangPosition.y -= 1.8; // Hang below ledge
    hangPosition.add(climbable.normal.clone().multiplyScalar(0.3));

    // Add shimmy offset
    const sideVector = new THREE.Vector3().crossVectors(climbable.normal, new THREE.Vector3(0, 1, 0));
    hangPosition.add(sideVector.multiplyScalar(this.state.shimmyOffset));

    playerBody.position.set(hangPosition.x, hangPosition.y, hangPosition.z);
    playerBody.velocity.setZero();
    playerMesh.position.copy(hangPosition);

    // Face wall
    const lookAt = hangPosition.clone().sub(climbable.normal);
    playerMesh.lookAt(lookAt);

    // Pull up with W
    if (input.forward) {
      this.state.climbState = 'pulling_up';
      this.state.climbProgress = 0;
      return;
    }

    // Drop down with S or Space
    if (input.backward || input.jump) {
      this.stopClimbing();
      playerBody.velocity.set(
        climbable.normal.x * 2,
        0,
        climbable.normal.z * 2
      );
      return;
    }

    // Shimmy with A/D
    if (input.left) {
      this.state.shimmyOffset -= this.shimmySpeed * deltaTime;
    }
    if (input.right) {
      this.state.shimmyOffset += this.shimmySpeed * deltaTime;
    }

    // Clamp shimmy range
    this.state.shimmyOffset = Math.max(-climbable.width / 2, Math.min(climbable.width / 2, this.state.shimmyOffset));
  }

  private updateLedgeShimmy(
    input: InputState,
    deltaTime: number,
    playerBody: CANNON.Body,
    playerMesh: THREE.Object3D
  ): void {
    // Same as ledge grab but allows continuous movement
    this.updateLedgeGrab(input, deltaTime, playerBody, playerMesh);
  }

  private updatePullUp(
    deltaTime: number,
    playerBody: CANNON.Body,
    playerMesh: THREE.Object3D
  ): void {
    const climbable = this.state.currentClimbable!;

    this.state.climbProgress += deltaTime / this.pullUpDuration;

    if (this.state.climbProgress >= 1) {
      // Finished pull up - place on top
      this.stopClimbing();
      const topPos = climbable.topPosition.clone();
      topPos.add(climbable.normal.clone().multiplyScalar(0.5));
      playerBody.position.set(topPos.x, topPos.y + 0.5, topPos.z);
      playerMesh.position.copy(new THREE.Vector3(topPos.x, topPos.y + 0.5, topPos.z));
      return;
    }

    // Interpolate position during pull up
    const startY = climbable.topPosition.y - 1.8;
    const endY = climbable.topPosition.y + 0.5;
    const currentY = THREE.MathUtils.lerp(startY, endY, this.state.climbProgress);

    const startZ = climbable.normal.z * 0.3;
    const endZ = climbable.normal.z * 0.5;
    const currentZ = THREE.MathUtils.lerp(startZ, endZ, this.state.climbProgress);

    const pos = climbable.topPosition.clone();
    pos.y = currentY;
    pos.z = climbable.topPosition.z + currentZ;

    playerBody.position.set(pos.x, pos.y, pos.z);
    playerMesh.position.copy(pos);
  }

  /**
   * Get animation phase for climbing animation
   */
  getAnimationPhase(): number {
    return Math.sin(this.climbAnimationTime * 4);
  }

  /**
   * Check if currently climbing
   */
  isClimbing(): boolean {
    return this.state.isClimbing;
  }

  /**
   * Get current climb state for animation
   */
  getClimbState(): ClimbState {
    return this.state.climbState;
  }
}
