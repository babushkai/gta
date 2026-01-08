import * as THREE from 'three';

/**
 * ProceduralCharacterAnimator - Distance-based procedural animation
 *
 * For characters without GLTF models, this provides improved procedural animation
 * that properly syncs with physics velocity. The key fix is that animation cycle
 * is driven by distance traveled, not time, preventing sliding/moonwalking.
 */
export class ProceduralCharacterAnimator {
  private bodyParts: {
    head?: THREE.Object3D;
    torso?: THREE.Object3D;
    leftThigh?: THREE.Object3D;
    rightThigh?: THREE.Object3D;
    leftCalf?: THREE.Object3D;
    rightCalf?: THREE.Object3D;
    leftUpperArm?: THREE.Object3D;
    rightUpperArm?: THREE.Object3D;
    leftForearm?: THREE.Object3D;
    rightForearm?: THREE.Object3D;
  } = {};

  private animationTime: number = 0;
  private smoothVelocity: number = 0;

  // Animation parameters tuned for natural motion
  private strideLength: number = 0.8; // meters per step cycle

  constructor() {}

  setBodyParts(parts: typeof this.bodyParts): void {
    this.bodyParts = parts;
  }

  /**
   * Update animation based on actual physics velocity
   * Key fix: Animation cycle is driven by distance traveled, not time
   */
  update(velocity: THREE.Vector3, deltaTime: number, isGrounded: boolean = true): void {
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

    // Smooth velocity changes to prevent jittery animation
    this.smoothVelocity = THREE.MathUtils.lerp(this.smoothVelocity, speed, deltaTime * 10);

    const walkThreshold = 0.5;
    const runThreshold = 15.0;

    const isMoving = this.smoothVelocity > walkThreshold && isGrounded;
    const isRunning = this.smoothVelocity > runThreshold;

    if (isMoving) {
      // KEY FIX: Advance animation based on distance traveled, not time
      // This ensures feet don't slide - each step covers the same ground distance
      const distanceTraveled = this.smoothVelocity * deltaTime;
      const cycleAdvance = distanceTraveled / this.strideLength * Math.PI * 2;
      this.animationTime += cycleAdvance;

      // Animation intensity scales with speed
      const intensityFactor = Math.min(1, this.smoothVelocity / (isRunning ? 30 : 15));

      // Animation amplitudes
      const legSwing = (isRunning ? 0.9 : 0.5) * intensityFactor;
      const armSwing = (isRunning ? 0.8 : 0.4) * intensityFactor;
      const bobAmount = (isRunning ? 0.08 : 0.04) * intensityFactor;
      const hipSway = (isRunning ? 0.08 : 0.04) * intensityFactor;
      const shoulderTwist = (isRunning ? 0.12 : 0.06) * intensityFactor;

      const phase = Math.sin(this.animationTime);
      const phaseOffset = Math.sin(this.animationTime + Math.PI);
      const halfPhase = Math.sin(this.animationTime * 2);

      // Apply animations to body parts
      this.animateLegs(phase, phaseOffset, legSwing, isRunning);
      this.animateArms(phase, phaseOffset, armSwing, isRunning);
      this.animateTorso(phase, halfPhase, bobAmount, hipSway, shoulderTwist, isRunning);
      this.animateHead(halfPhase, bobAmount, shoulderTwist, phase);

    } else if (!isGrounded) {
      // Jumping/falling animation
      this.animateJump(deltaTime);
    } else {
      // Idle - smoothly return to rest pose
      this.animateIdle(deltaTime);
    }
  }

  private animateLegs(
    phase: number,
    phaseOffset: number,
    legSwing: number,
    isRunning: boolean
  ): void {
    const { leftThigh, rightThigh, leftCalf, rightCalf } = this.bodyParts;

    if (leftThigh) {
      leftThigh.rotation.x = phase * legSwing;
      leftThigh.position.y = 0.66 + Math.max(0, phase) * 0.04;
      leftThigh.rotation.z = isRunning ? Math.max(0, -phase) * 0.1 : 0;
    }

    if (rightThigh) {
      rightThigh.rotation.x = phaseOffset * legSwing;
      rightThigh.position.y = 0.66 + Math.max(0, phaseOffset) * 0.04;
      rightThigh.rotation.z = isRunning ? Math.max(0, -phaseOffset) * -0.1 : 0;
    }

    if (leftCalf) {
      const leftBend = Math.max(0, -phase) * (isRunning ? 0.8 : 0.5);
      leftCalf.rotation.x = leftBend;
      leftCalf.position.y = 0.32 - leftBend * 0.1;
      leftCalf.position.z = -leftBend * 0.12;
    }

    if (rightCalf) {
      const rightBend = Math.max(0, -phaseOffset) * (isRunning ? 0.8 : 0.5);
      rightCalf.rotation.x = rightBend;
      rightCalf.position.y = 0.32 - rightBend * 0.1;
      rightCalf.position.z = -rightBend * 0.12;
    }
  }

  private animateArms(
    phase: number,
    phaseOffset: number,
    armSwing: number,
    isRunning: boolean
  ): void {
    const { leftUpperArm, rightUpperArm, leftForearm, rightForearm } = this.bodyParts;

    if (leftUpperArm) {
      leftUpperArm.rotation.x = phaseOffset * armSwing;
      leftUpperArm.rotation.z = 0.15 + (isRunning ? Math.abs(phaseOffset) * 0.1 : 0);
    }

    if (rightUpperArm) {
      rightUpperArm.rotation.x = phase * armSwing;
      rightUpperArm.rotation.z = -0.15 - (isRunning ? Math.abs(phase) * 0.1 : 0);
    }

    const elbowBend = isRunning ? 0.6 : 0.35;

    if (leftForearm) {
      leftForearm.rotation.x = Math.max(0, phaseOffset) * elbowBend + (isRunning ? 0.3 : 0.1);
    }

    if (rightForearm) {
      rightForearm.rotation.x = Math.max(0, phase) * elbowBend + (isRunning ? 0.3 : 0.1);
    }
  }

  private animateTorso(
    phase: number,
    halfPhase: number,
    bobAmount: number,
    hipSway: number,
    shoulderTwist: number,
    isRunning: boolean
  ): void {
    const { torso } = this.bodyParts;

    if (torso) {
      torso.rotation.y = phase * shoulderTwist;
      torso.position.y = 1.28 + Math.abs(halfPhase) * bobAmount;
      torso.rotation.x = isRunning ? 0.1 : 0;
      torso.position.x = phase * hipSway;
    }
  }

  private animateHead(
    halfPhase: number,
    bobAmount: number,
    shoulderTwist: number,
    phase: number
  ): void {
    const { head } = this.bodyParts;

    if (head) {
      head.position.y = 1.65 + Math.abs(halfPhase) * bobAmount * 0.3;
      head.rotation.y = phase * shoulderTwist * -0.3;
    }
  }

  private animateJump(deltaTime: number): void {
    const jumpPhase = Math.sin(this.animationTime * 3);
    this.animationTime += deltaTime * 5;

    const { leftThigh, rightThigh, leftCalf, rightCalf, leftUpperArm, rightUpperArm } = this.bodyParts;

    if (leftThigh) {
      leftThigh.rotation.x = -0.4;
      leftThigh.rotation.z = 0.1;
    }
    if (rightThigh) {
      rightThigh.rotation.x = -0.4;
      rightThigh.rotation.z = -0.1;
    }
    if (leftCalf) {
      leftCalf.rotation.x = 0.5 + jumpPhase * 0.1;
      leftCalf.position.y = 0.3;
      leftCalf.position.z = -0.06;
    }
    if (rightCalf) {
      rightCalf.rotation.x = 0.5 + jumpPhase * 0.1;
      rightCalf.position.y = 0.3;
      rightCalf.position.z = -0.06;
    }
    if (leftUpperArm) {
      leftUpperArm.rotation.x = -0.6;
      leftUpperArm.rotation.z = 0.4;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.x = -0.6;
      rightUpperArm.rotation.z = -0.4;
    }
  }

  private animateIdle(deltaTime: number): void {
    const lerpSpeed = 8 * deltaTime;
    const breathPhase = Math.sin(Date.now() * 0.001);

    const { leftThigh, rightThigh, leftCalf, rightCalf,
            leftUpperArm, rightUpperArm, leftForearm, rightForearm,
            torso, head } = this.bodyParts;

    // Smoothly return limbs to rest position
    if (leftThigh) {
      leftThigh.rotation.x *= (1 - lerpSpeed);
      leftThigh.rotation.z *= (1 - lerpSpeed);
      leftThigh.position.y = 0.66;
    }
    if (rightThigh) {
      rightThigh.rotation.x *= (1 - lerpSpeed);
      rightThigh.rotation.z *= (1 - lerpSpeed);
      rightThigh.position.y = 0.66;
    }
    if (leftCalf) {
      leftCalf.rotation.x *= (1 - lerpSpeed);
      leftCalf.position.y = 0.32;
      leftCalf.position.z = 0;
    }
    if (rightCalf) {
      rightCalf.rotation.x *= (1 - lerpSpeed);
      rightCalf.position.y = 0.32;
      rightCalf.position.z = 0;
    }
    if (leftUpperArm) {
      leftUpperArm.rotation.x *= (1 - lerpSpeed);
      leftUpperArm.rotation.z = 0.15;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.x *= (1 - lerpSpeed);
      rightUpperArm.rotation.z = -0.15;
    }
    if (leftForearm) leftForearm.rotation.x *= (1 - lerpSpeed);
    if (rightForearm) rightForearm.rotation.x *= (1 - lerpSpeed);

    if (torso) {
      torso.rotation.y *= (1 - lerpSpeed);
      torso.rotation.x *= (1 - lerpSpeed);
      torso.position.x *= (1 - lerpSpeed);
      // Subtle breathing
      torso.position.y = 1.28 + breathPhase * 0.01;
    }

    if (head) {
      head.position.y = 1.65;
      head.rotation.y *= (1 - lerpSpeed);
      head.rotation.x = Math.sin(Date.now() * 0.0005) * 0.02;
    }

    // Reset animation time smoothly
    this.animationTime *= (1 - lerpSpeed);
  }

  /**
   * Animate ladder climbing
   * @param direction 1 = climbing up, -1 = climbing down, 0 = stationary
   * @param deltaTime Frame delta time
   */
  animateClimbing(direction: number, deltaTime: number): void {
    const { leftThigh, rightThigh, leftCalf, rightCalf,
            leftUpperArm, rightUpperArm, leftForearm, rightForearm,
            torso, head } = this.bodyParts;

    // Only animate if moving
    if (direction !== 0) {
      this.animationTime += deltaTime * 6 * direction;
    }

    const phase = Math.sin(this.animationTime);
    const phaseOffset = Math.sin(this.animationTime + Math.PI);

    // Arms reaching up alternately
    if (leftUpperArm) {
      leftUpperArm.rotation.x = -2.5 + phase * 0.4; // Reaching up
      leftUpperArm.rotation.z = 0.3;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.x = -2.5 + phaseOffset * 0.4;
      rightUpperArm.rotation.z = -0.3;
    }

    // Forearms bent gripping rungs
    if (leftForearm) {
      leftForearm.rotation.x = 0.8 + phase * 0.2;
    }
    if (rightForearm) {
      rightForearm.rotation.x = 0.8 + phaseOffset * 0.2;
    }

    // Legs stepping on rungs
    if (leftThigh) {
      leftThigh.rotation.x = -0.3 + phaseOffset * 0.5;
      leftThigh.position.y = 0.66;
    }
    if (rightThigh) {
      rightThigh.rotation.x = -0.3 + phase * 0.5;
      rightThigh.position.y = 0.66;
    }

    if (leftCalf) {
      leftCalf.rotation.x = 0.6 + Math.max(0, phaseOffset) * 0.3;
      leftCalf.position.y = 0.32;
      leftCalf.position.z = 0;
    }
    if (rightCalf) {
      rightCalf.rotation.x = 0.6 + Math.max(0, phase) * 0.3;
      rightCalf.position.y = 0.32;
      rightCalf.position.z = 0;
    }

    // Torso slight lean forward
    if (torso) {
      torso.rotation.x = 0.1;
      torso.rotation.y = 0;
      torso.position.x = 0;
      torso.position.y = 1.28;
    }

    // Head looking up slightly
    if (head) {
      head.position.y = 1.65;
      head.rotation.x = -0.2;
      head.rotation.y = 0;
    }
  }

  /**
   * Animate ledge hanging
   * @param shimmyDirection -1 = left, 1 = right, 0 = stationary
   * @param deltaTime Frame delta time
   */
  animateLedgeHang(shimmyDirection: number, deltaTime: number): void {
    const { leftThigh, rightThigh, leftCalf, rightCalf,
            leftUpperArm, rightUpperArm, leftForearm, rightForearm,
            torso, head } = this.bodyParts;

    // Shimmy animation
    if (shimmyDirection !== 0) {
      this.animationTime += deltaTime * 4;
    }

    const swayPhase = Math.sin(this.animationTime * 2) * 0.1;
    const legSway = Math.sin(this.animationTime * 1.5) * 0.15;

    // Arms extended up gripping ledge
    if (leftUpperArm) {
      leftUpperArm.rotation.x = -3.0; // Straight up
      leftUpperArm.rotation.z = 0.4;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.x = -3.0;
      rightUpperArm.rotation.z = -0.4;
    }

    // Forearms bent holding ledge
    if (leftForearm) {
      leftForearm.rotation.x = 1.2;
    }
    if (rightForearm) {
      rightForearm.rotation.x = 1.2;
    }

    // Legs hanging with slight sway
    if (leftThigh) {
      leftThigh.rotation.x = 0.1 + legSway;
      leftThigh.rotation.z = 0.05;
      leftThigh.position.y = 0.66;
    }
    if (rightThigh) {
      rightThigh.rotation.x = 0.1 - legSway;
      rightThigh.rotation.z = -0.05;
      rightThigh.position.y = 0.66;
    }

    if (leftCalf) {
      leftCalf.rotation.x = 0.2;
      leftCalf.position.y = 0.32;
      leftCalf.position.z = 0;
    }
    if (rightCalf) {
      rightCalf.rotation.x = 0.2;
      rightCalf.position.y = 0.32;
      rightCalf.position.z = 0;
    }

    // Torso hanging with slight lean back
    if (torso) {
      torso.rotation.x = -0.1 + swayPhase;
      torso.rotation.y = 0;
      torso.position.x = 0;
      torso.position.y = 1.28;
    }

    // Head looking up at hands
    if (head) {
      head.position.y = 1.65;
      head.rotation.x = -0.4;
      head.rotation.y = 0;
    }
  }

  /**
   * Animate pulling up onto ledge
   * @param progress 0 = hanging, 1 = on top
   */
  animatePullUp(progress: number): void {
    const { leftThigh, rightThigh, leftCalf, rightCalf,
            leftUpperArm, rightUpperArm, leftForearm, rightForearm,
            torso, head } = this.bodyParts;

    // Arms pushing down as we pull up
    const armAngle = -3.0 + progress * 2.0; // From up to down
    const forearmBend = 1.2 - progress * 0.8;

    if (leftUpperArm) {
      leftUpperArm.rotation.x = armAngle;
      leftUpperArm.rotation.z = 0.4 - progress * 0.3;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.x = armAngle;
      rightUpperArm.rotation.z = -0.4 + progress * 0.3;
    }

    if (leftForearm) {
      leftForearm.rotation.x = forearmBend;
    }
    if (rightForearm) {
      rightForearm.rotation.x = forearmBend;
    }

    // Legs swinging up and over
    const legSwing = progress * 0.8;
    const kneeAngle = progress < 0.5 ? progress * 1.5 : (1 - progress) * 1.5;

    if (leftThigh) {
      leftThigh.rotation.x = 0.1 - legSwing;
      leftThigh.position.y = 0.66;
    }
    if (rightThigh) {
      rightThigh.rotation.x = 0.1 - legSwing * 0.8; // Slight delay
      rightThigh.position.y = 0.66;
    }

    if (leftCalf) {
      leftCalf.rotation.x = kneeAngle;
      leftCalf.position.y = 0.32;
      leftCalf.position.z = 0;
    }
    if (rightCalf) {
      rightCalf.rotation.x = kneeAngle * 0.8;
      rightCalf.position.y = 0.32;
      rightCalf.position.z = 0;
    }

    // Torso tilting forward during pull
    if (torso) {
      torso.rotation.x = -0.1 + progress * 0.5;
      torso.rotation.y = 0;
      torso.position.x = 0;
      torso.position.y = 1.28;
    }

    // Head following body
    if (head) {
      head.position.y = 1.65;
      head.rotation.x = -0.4 + progress * 0.5;
      head.rotation.y = 0;
    }
  }
}
