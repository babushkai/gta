import { Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') id: string = '';
  @type('string') sessionId: string = '';
  @type('string') name: string = 'Player';

  // Position
  @type('number') x: number = 0;
  @type('number') y: number = 2;
  @type('number') z: number = 0;

  // Rotation (Y-axis only for players on foot)
  @type('number') rotationY: number = 0;

  // Velocity for interpolation
  @type('number') velocityX: number = 0;
  @type('number') velocityY: number = 0;
  @type('number') velocityZ: number = 0;

  // Stats
  @type('number') health: number = 100;
  @type('number') armor: number = 0;
  @type('number') money: number = 0;
  @type('number') wantedLevel: number = 0;

  // State flags
  @type('string') state: string = 'idle'; // idle, moving, running, jumping, shooting, dead
  @type('boolean') isInVehicle: boolean = false;
  @type('string') vehicleId: string = '';
  @type('string') currentWeapon: string = '';

  // Input state (for server-side simulation)
  @type('boolean') inputForward: boolean = false;
  @type('boolean') inputBackward: boolean = false;
  @type('boolean') inputLeft: boolean = false;
  @type('boolean') inputRight: boolean = false;
  @type('boolean') inputJump: boolean = false;
  @type('boolean') inputSprint: boolean = false;
  @type('boolean') inputFire: boolean = false;
  @type('boolean') inputAim: boolean = false;

  // Timestamp for interpolation
  @type('number') timestamp: number = 0;
}
