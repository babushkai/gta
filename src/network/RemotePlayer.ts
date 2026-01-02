import * as THREE from 'three';
import { Game } from '@/core/Game';

interface PlayerState {
  id: string;
  sessionId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  health: number;
  armor: number;
  state: string;
  isInVehicle: boolean;
  vehicleId: string;
  currentWeapon: string;
  timestamp: number;
}

export class RemotePlayer {
  private game: Game;
  public mesh: THREE.Group;
  public id: string;
  public name: string;

  // Interpolation state
  private targetPosition: THREE.Vector3;
  private targetRotation: number;
  private velocity: THREE.Vector3;
  private lastUpdateTime: number;

  // State
  private currentState: string = 'idle';
  private isInVehicle: boolean = false;
  private vehicleId: string = '';
  private health: number = 100;

  // Name label
  private nameSprite: THREE.Sprite | null = null;

  constructor(game: Game, initialState: PlayerState) {
    this.game = game;
    this.id = initialState.sessionId;
    this.name = initialState.name;

    this.targetPosition = new THREE.Vector3(initialState.x, initialState.y, initialState.z);
    this.targetRotation = initialState.rotationY;
    this.velocity = new THREE.Vector3(initialState.velocityX, initialState.velocityY, initialState.velocityZ);
    this.lastUpdateTime = Date.now();

    this.mesh = this.createPlayerMesh();
    this.mesh.position.copy(this.targetPosition);
    this.mesh.rotation.y = this.targetRotation;

    this.createNameLabel();

    this.game.scene.add(this.mesh);
  }

  private createPlayerMesh(): THREE.Group {
    const group = new THREE.Group();

    // Different color for remote players
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0b090,
      roughness: 0.7,
      metalness: 0.0,
    });

    // Remote player shirt - different color to distinguish
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x44aa44, // Green shirt for remote players
      roughness: 0.8,
      metalness: 0.0,
    });

    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.9,
      metalness: 0.0,
    });

    const shoeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.6,
      metalness: 0.1,
    });

    // Head
    const headGeometry = new THREE.SphereGeometry(0.14, 16, 16);
    headGeometry.scale(1, 1.1, 0.95);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);

    // Hair
    const hairGeometry = new THREE.SphereGeometry(0.145, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 1.68;
    hair.scale.set(1, 0.8, 1);
    group.add(hair);

    // Neck
    const neckGeometry = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8);
    const neck = new THREE.Mesh(neckGeometry, skinMaterial);
    neck.position.y = 1.48;
    group.add(neck);

    // Torso - upper
    const chestGeometry = new THREE.BoxGeometry(0.38, 0.28, 0.2);
    const chest = new THREE.Mesh(chestGeometry, shirtMaterial);
    chest.position.y = 1.28;
    chest.castShadow = true;
    group.add(chest);

    // Torso - lower
    const abdomenGeometry = new THREE.BoxGeometry(0.34, 0.2, 0.18);
    const abdomen = new THREE.Mesh(abdomenGeometry, shirtMaterial);
    abdomen.position.y = 1.04;
    abdomen.castShadow = true;
    group.add(abdomen);

    // Belt
    const hipsGeometry = new THREE.BoxGeometry(0.36, 0.1, 0.19);
    const beltMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.5 });
    const hips = new THREE.Mesh(hipsGeometry, beltMaterial);
    hips.position.y = 0.9;
    group.add(hips);

    // Arms
    const upperArmGeometry = new THREE.CapsuleGeometry(0.05, 0.2, 4, 8);
    const forearmGeometry = new THREE.CapsuleGeometry(0.04, 0.2, 4, 8);

    const leftUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    leftUpperArm.position.set(-0.24, 1.28, 0);
    leftUpperArm.rotation.z = 0.15;
    leftUpperArm.castShadow = true;
    group.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeometry, shirtMaterial);
    rightUpperArm.position.set(0.24, 1.28, 0);
    rightUpperArm.rotation.z = -0.15;
    rightUpperArm.castShadow = true;
    group.add(rightUpperArm);

    const leftForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    leftForearm.position.set(-0.28, 1.0, 0);
    leftForearm.rotation.z = 0.1;
    leftForearm.castShadow = true;
    group.add(leftForearm);

    const rightForearm = new THREE.Mesh(forearmGeometry, skinMaterial);
    rightForearm.position.set(0.28, 1.0, 0);
    rightForearm.rotation.z = -0.1;
    rightForearm.castShadow = true;
    group.add(rightForearm);

    // Hands
    const handGeometry = new THREE.SphereGeometry(0.04, 8, 8);
    const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
    leftHand.position.set(-0.3, 0.82, 0);
    leftHand.scale.set(1, 1.2, 0.6);
    group.add(leftHand);

    const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
    rightHand.position.set(0.3, 0.82, 0);
    rightHand.scale.set(1, 1.2, 0.6);
    group.add(rightHand);

    // Legs
    const thighGeometry = new THREE.CapsuleGeometry(0.07, 0.28, 4, 8);
    const calfGeometry = new THREE.CapsuleGeometry(0.055, 0.28, 4, 8);

    const leftThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    leftThigh.position.set(-0.1, 0.66, 0);
    leftThigh.castShadow = true;
    group.add(leftThigh);

    const rightThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
    rightThigh.position.set(0.1, 0.66, 0);
    rightThigh.castShadow = true;
    group.add(rightThigh);

    const leftCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    leftCalf.position.set(-0.1, 0.32, 0);
    leftCalf.castShadow = true;
    group.add(leftCalf);

    const rightCalf = new THREE.Mesh(calfGeometry, pantsMaterial);
    rightCalf.position.set(0.1, 0.32, 0);
    rightCalf.castShadow = true;
    group.add(rightCalf);

    // Shoes
    const shoeGeometry = new THREE.BoxGeometry(0.09, 0.06, 0.16);
    const leftShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    leftShoe.position.set(-0.1, 0.03, 0.02);
    leftShoe.castShadow = true;
    group.add(leftShoe);

    const rightShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    rightShoe.position.set(0.1, 0.03, 0.02);
    rightShoe.castShadow = true;
    group.add(rightShoe);

    return group;
  }

  private createNameLabel() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    // Draw name on canvas
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.fillText(this.name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    this.nameSprite = new THREE.Sprite(spriteMaterial);
    this.nameSprite.scale.set(2, 0.5, 1);
    this.nameSprite.position.y = 2.2;
    this.mesh.add(this.nameSprite);
  }

  updateFromState(state: PlayerState) {
    this.targetPosition.set(state.x, state.y, state.z);
    this.targetRotation = state.rotationY;
    this.velocity.set(state.velocityX, state.velocityY, state.velocityZ);
    this.currentState = state.state;
    this.isInVehicle = state.isInVehicle;
    this.vehicleId = state.vehicleId;
    this.health = state.health;
    this.lastUpdateTime = Date.now();

    // Hide mesh when in vehicle
    this.mesh.visible = !this.isInVehicle;
  }

  update(deltaTime: number) {
    if (this.isInVehicle) return;

    // Interpolate position
    const lerpFactor = Math.min(1, deltaTime * 10);
    this.mesh.position.lerp(this.targetPosition, lerpFactor);

    // Smooth rotation interpolation
    let rotDiff = this.targetRotation - this.mesh.rotation.y;
    // Handle wrapping around PI
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.mesh.rotation.y += rotDiff * lerpFactor;

    // Make name label always face camera
    if (this.nameSprite) {
      this.nameSprite.lookAt(this.game.camera.position);
    }
  }

  getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  dispose() {
    if (this.nameSprite) {
      this.nameSprite.material.map?.dispose();
      (this.nameSprite.material as THREE.SpriteMaterial).dispose();
    }

    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      if ((child as THREE.Mesh).material) {
        const material = (child as THREE.Mesh).material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material.dispose();
        }
      }
    });

    this.game.scene.remove(this.mesh);
  }
}
