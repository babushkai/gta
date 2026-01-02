import { Schema, type, ArraySchema } from '@colyseus/schema';

export class VehicleState extends Schema {
  @type('string') id: string = '';
  @type('string') configId: string = 'sports_car'; // Vehicle config type

  // Position
  @type('number') x: number = 0;
  @type('number') y: number = 1.5;
  @type('number') z: number = 0;

  // Quaternion rotation (full 3D rotation for vehicles)
  @type('number') qx: number = 0;
  @type('number') qy: number = 0;
  @type('number') qz: number = 0;
  @type('number') qw: number = 1;

  // Velocity
  @type('number') velocityX: number = 0;
  @type('number') velocityY: number = 0;
  @type('number') velocityZ: number = 0;

  // Angular velocity
  @type('number') angularX: number = 0;
  @type('number') angularY: number = 0;
  @type('number') angularZ: number = 0;

  // State
  @type('number') health: number = 1000;
  @type('number') currentSpeed: number = 0;
  @type('boolean') destroyed: boolean = false;

  // Occupants
  @type('string') driverId: string = ''; // Player session ID
  @type(['string']) passengerIds = new ArraySchema<string>();

  // Control inputs (from driver)
  @type('number') throttle: number = 0; // -1 to 1
  @type('number') steering: number = 0; // -1 to 1
  @type('boolean') brake: boolean = false;
  @type('boolean') handbrake: boolean = false;

  // Timestamp
  @type('number') timestamp: number = 0;
}
