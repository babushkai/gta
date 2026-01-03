import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { PlayerState } from './PlayerState';
import { VehicleState } from './VehicleState';
import { NPCState } from './NPCState';

export class GameState extends Schema {
  // All connected players
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  // All vehicles in the world
  @type({ map: VehicleState }) vehicles = new MapSchema<VehicleState>();

  // All NPCs (server-controlled)
  @type({ map: NPCState }) npcs = new MapSchema<NPCState>();

  // Collected pickup IDs (so clients know which are unavailable)
  @type(['string']) collectedPickups = new ArraySchema<string>();

  // World state
  @type('number') timeOfDay: number = 12; // 0-24 hours
  @type('string') weather: string = 'clear';

  // Room info
  @type('string') roomId: string = '';
  @type('number') serverTime: number = 0;
}
