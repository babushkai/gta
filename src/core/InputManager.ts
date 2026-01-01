import { InputState } from '@/types';
import { EventEmitter } from './EventEmitter';

export class InputManager extends EventEmitter {
  private state: InputState;
  private keyMap: Map<string, keyof InputState> = new Map();
  private isPointerLocked: boolean = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    super();
    this.state = this.createDefaultState();
    this.setupKeyMap();
  }

  private createDefaultState(): InputState {
    return {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      crouch: false,
      fire: false,
      aim: false,
      reload: false,
      interact: false,
      enterVehicle: false,
      horn: false,
      headlights: false,
      handbrake: false,
      nextWeapon: false,
      prevWeapon: false,
      nextRadio: false,
      pause: false,
      mouseX: 0,
      mouseY: 0,
      mouseDeltaX: 0,
      mouseDeltaY: 0
    };
  }

  private setupKeyMap(): void {
    this.keyMap.set('KeyW', 'forward');
    this.keyMap.set('KeyS', 'backward');
    this.keyMap.set('KeyA', 'left');
    this.keyMap.set('KeyD', 'right');
    this.keyMap.set('Space', 'jump');
    this.keyMap.set('ShiftLeft', 'sprint');
    this.keyMap.set('ControlLeft', 'crouch');
    this.keyMap.set('KeyR', 'reload');
    this.keyMap.set('KeyE', 'interact');
    this.keyMap.set('KeyF', 'enterVehicle');
    this.keyMap.set('KeyH', 'horn');
    this.keyMap.set('KeyL', 'headlights');
    this.keyMap.set('Space', 'handbrake');
    this.keyMap.set('Tab', 'nextWeapon');
    this.keyMap.set('KeyQ', 'prevWeapon');
    this.keyMap.set('KeyN', 'nextRadio');
    this.keyMap.set('Escape', 'pause');
  }

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    // Bind handlers once to maintain reference
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleWheel = this.handleWheel.bind(this);
    this.boundHandlePointerLockChange = this.handlePointerLockChange.bind(this);

    document.addEventListener('keydown', this.boundHandleKeyDown);
    document.addEventListener('keyup', this.boundHandleKeyUp);
    document.addEventListener('mousedown', this.boundHandleMouseDown);
    document.addEventListener('mouseup', this.boundHandleMouseUp);
    document.addEventListener('mousemove', this.boundHandleMouseMove);
    document.addEventListener('wheel', this.boundHandleWheel);
    document.addEventListener('pointerlockchange', this.boundHandlePointerLockChange);

    // Show click instruction
    this.showClickInstruction();

    canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        canvas.requestPointerLock();
        this.hideClickInstruction();
      }
    });

    // Also handle context menu to prevent right-click menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private boundHandleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundHandleKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private boundHandleMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundHandleWheel: ((e: WheelEvent) => void) | null = null;
  private boundHandlePointerLockChange: (() => void) | null = null;
  private clickInstruction: HTMLElement | null = null;

  private showClickInstruction(): void {
    this.clickInstruction = document.createElement('div');
    this.clickInstruction.id = 'click-instruction';
    this.clickInstruction.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 30px 50px;
        border-radius: 10px;
        text-align: center;
        z-index: 1000;
        font-family: sans-serif;
        border: 2px solid #e94560;
      ">
        <div style="font-size: 24px; margin-bottom: 10px;">🎮 Click to Play</div>
        <div style="font-size: 14px; opacity: 0.7;">Click anywhere to start controlling the game</div>
      </div>
    `;
    document.body.appendChild(this.clickInstruction);
  }

  private hideClickInstruction(): void {
    if (this.clickInstruction) {
      this.clickInstruction.remove();
      this.clickInstruction = null;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const action = this.keyMap.get(event.code);
    if (action && typeof this.state[action] === 'boolean') {
      (this.state[action] as boolean) = true;
      this.emit('keydown', { action, code: event.code });
    }

    if (event.code === 'Escape') {
      this.emit('pause');
    }

    if (event.code === 'Tab') {
      event.preventDefault();
      this.emit('weaponWheel', { open: true });
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const action = this.keyMap.get(event.code);
    if (action && typeof this.state[action] === 'boolean') {
      (this.state[action] as boolean) = false;
      this.emit('keyup', { action, code: event.code });
    }

    if (event.code === 'Tab') {
      this.emit('weaponWheel', { open: false });
    }
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      this.state.fire = true;
      this.emit('fire', { pressed: true });
    } else if (event.button === 2) {
      this.state.aim = true;
      this.emit('aim', { pressed: true });
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (event.button === 0) {
      this.state.fire = false;
      this.emit('fire', { pressed: false });
    } else if (event.button === 2) {
      this.state.aim = false;
      this.emit('aim', { pressed: false });
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.state.mouseDeltaX = event.movementX;
      this.state.mouseDeltaY = event.movementY;
      this.emit('mouseMove', {
        deltaX: event.movementX,
        deltaY: event.movementY
      });
    }
    this.state.mouseX = event.clientX;
    this.state.mouseY = event.clientY;
  }

  private handleWheel(event: WheelEvent): void {
    this.emit('wheel', { delta: event.deltaY });
  }

  private handlePointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
    this.emit('pointerLockChange', { locked: this.isPointerLocked });
  }

  getState(): InputState {
    return { ...this.state };
  }

  isPressed(action: keyof InputState): boolean {
    const value = this.state[action];
    return typeof value === 'boolean' ? value : false;
  }

  resetDeltas(): void {
    this.state.mouseDeltaX = 0;
    this.state.mouseDeltaY = 0;
  }

  isLocked(): boolean {
    return this.isPointerLocked;
  }

  unlock(): void {
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  dispose(): void {
    if (this.boundHandleKeyDown) document.removeEventListener('keydown', this.boundHandleKeyDown);
    if (this.boundHandleKeyUp) document.removeEventListener('keyup', this.boundHandleKeyUp);
    if (this.boundHandleMouseDown) document.removeEventListener('mousedown', this.boundHandleMouseDown);
    if (this.boundHandleMouseUp) document.removeEventListener('mouseup', this.boundHandleMouseUp);
    if (this.boundHandleMouseMove) document.removeEventListener('mousemove', this.boundHandleMouseMove);
    if (this.boundHandleWheel) document.removeEventListener('wheel', this.boundHandleWheel);
    if (this.boundHandlePointerLockChange) document.removeEventListener('pointerlockchange', this.boundHandlePointerLockChange);
    this.hideClickInstruction();
    this.removeAllListeners();
  }
}
