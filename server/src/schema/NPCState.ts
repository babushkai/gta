import { Schema, type } from '@colyseus/schema';

export class NPCState extends Schema {
  @type('string') id: string = '';
  @type('string') configType: string = 'civilian'; // civilian, police, gang, military

  // Position
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;

  // Rotation
  @type('number') rotationY: number = 0;

  // Velocity for interpolation
  @type('number') velocityX: number = 0;
  @type('number') velocityZ: number = 0;

  // State
  @type('number') health: number = 100;
  @type('boolean') isDead: boolean = false;
  @type('string') behaviorState: string = 'idle'; // idle, walking, running, fleeing, attacking, dead

  // Target (for combat NPCs)
  @type('string') targetPlayerId: string = '';

  // Weapon
  @type('string') weapon: string = '';
  @type('boolean') isFiring: boolean = false;

  // Timestamp
  @type('number') timestamp: number = 0;
}
