import { Room, Client } from 'colyseus';
import { GameState, PlayerState, VehicleState, NPCState } from '../schema/index.js';

// Vehicle spawn configurations
const VEHICLE_SPAWNS = [
  { x: 10, y: 1.5, z: 10, rotation: 0, configId: 'sports_car' },
  { x: -15, y: 1.5, z: 20, rotation: Math.PI / 2, configId: 'sedan' },
  { x: 25, y: 1.5, z: -10, rotation: Math.PI, configId: 'muscle_car' },
  { x: -30, y: 1.5, z: -20, rotation: -Math.PI / 2, configId: 'truck' },
  { x: 50, y: 1.5, z: 30, rotation: Math.PI / 4, configId: 'motorcycle' },
];

// Player spawn points
const PLAYER_SPAWNS = [
  { x: 0, y: 2, z: 0 },
  { x: 5, y: 2, z: 5 },
  { x: -5, y: 2, z: 5 },
  { x: 5, y: 2, z: -5 },
  { x: -5, y: 2, z: -5 },
  { x: 10, y: 2, z: 0 },
  { x: -10, y: 2, z: 0 },
  { x: 0, y: 2, z: 10 },
];

interface InputMessage {
  forward?: boolean;
  backward?: boolean;
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  sprint?: boolean;
  fire?: boolean;
  aim?: boolean;
  rotationY?: number;
}

interface PositionMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  state: string;
}

interface VehicleInputMessage {
  vehicleId: string;
  throttle: number;
  steering: number;
  brake: boolean;
  handbrake: boolean;
}

export class GameRoom extends Room<GameState> {
  maxClients = 16;
  private vehicleIdCounter = 0;
  private npcIdCounter = 0;
  private tickRate = 20; // 20 Hz server tick

  onCreate(options: any) {
    console.log('GameRoom created!', options);

    this.setState(new GameState());
    this.state.roomId = this.roomId;

    // Spawn initial vehicles
    this.spawnInitialVehicles();

    // Set up game loop
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / this.tickRate);

    // Handle player input messages
    this.onMessage('input', (client, message: InputMessage) => {
      this.handlePlayerInput(client, message);
    });

    // Handle position updates from clients (client-authoritative for now)
    this.onMessage('position', (client, message: PositionMessage) => {
      this.handlePositionUpdate(client, message);
    });

    // Handle vehicle control
    this.onMessage('vehicleInput', (client, message: VehicleInputMessage) => {
      this.handleVehicleInput(client, message);
    });

    // Handle vehicle enter/exit
    this.onMessage('enterVehicle', (client, message: { vehicleId: string }) => {
      this.handleEnterVehicle(client, message.vehicleId);
    });

    this.onMessage('exitVehicle', (client) => {
      this.handleExitVehicle(client);
    });

    // Handle weapon fire
    this.onMessage('fire', (client, message: { weaponId: string; dirX: number; dirY: number; dirZ: number }) => {
      this.handleWeaponFire(client, message);
    });

    // Handle damage
    this.onMessage('damage', (client, message: { targetId: string; amount: number; type: string }) => {
      this.handleDamage(client, message);
    });

    // Handle pickup collection
    this.onMessage('pickup', (client, message: { pickupId: string }) => {
      this.handlePickup(client, message.pickupId);
    });

    // Handle chat
    this.onMessage('chat', (client, message: { text: string }) => {
      this.broadcast('chat', {
        senderId: client.sessionId,
        senderName: this.state.players.get(client.sessionId)?.name || 'Unknown',
        text: message.text,
      });
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`Player ${client.sessionId} joined!`);

    // Create player state
    const player = new PlayerState();
    player.id = client.sessionId;
    player.sessionId = client.sessionId;
    player.name = options.name || `Player ${this.state.players.size + 1}`;

    // Assign spawn point
    const spawnIndex = this.state.players.size % PLAYER_SPAWNS.length;
    const spawn = PLAYER_SPAWNS[spawnIndex];
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;

    this.state.players.set(client.sessionId, player);

    // Send welcome message with room info
    client.send('welcome', {
      playerId: client.sessionId,
      roomId: this.roomId,
      playerCount: this.state.players.size,
    });

    // Broadcast player joined
    this.broadcast('playerJoined', {
      playerId: client.sessionId,
      name: player.name,
    }, { except: client });
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Player ${client.sessionId} left (consented: ${consented})`);

    const player = this.state.players.get(client.sessionId);

    // If player was in vehicle, remove them
    if (player?.isInVehicle && player.vehicleId) {
      const vehicle = this.state.vehicles.get(player.vehicleId);
      if (vehicle) {
        if (vehicle.driverId === client.sessionId) {
          vehicle.driverId = '';
        } else {
          const passengerIndex = vehicle.passengerIds.indexOf(client.sessionId);
          if (passengerIndex !== -1) {
            vehicle.passengerIds.splice(passengerIndex, 1);
          }
        }
      }
    }

    this.state.players.delete(client.sessionId);

    // Broadcast player left
    this.broadcast('playerLeft', {
      playerId: client.sessionId,
    });
  }

  private spawnInitialVehicles() {
    VEHICLE_SPAWNS.forEach((spawn) => {
      const vehicle = new VehicleState();
      vehicle.id = `vehicle_${this.vehicleIdCounter++}`;
      vehicle.configId = spawn.configId;
      vehicle.x = spawn.x;
      vehicle.y = spawn.y;
      vehicle.z = spawn.z;

      // Convert rotation to quaternion (Y-axis rotation only)
      vehicle.qx = 0;
      vehicle.qy = Math.sin(spawn.rotation / 2);
      vehicle.qz = 0;
      vehicle.qw = Math.cos(spawn.rotation / 2);

      this.state.vehicles.set(vehicle.id, vehicle);
    });
  }

  private update(deltaTime: number) {
    this.state.serverTime = Date.now();

    // Update time of day (1 game hour = 2 real minutes)
    this.state.timeOfDay = (this.state.timeOfDay + deltaTime / 120000) % 24;

    // Server-side physics simulation would go here
    // For now, we trust client positions (hybrid authority)
  }

  private handlePlayerInput(client: Client, message: InputMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Update input state
    if (message.forward !== undefined) player.inputForward = message.forward;
    if (message.backward !== undefined) player.inputBackward = message.backward;
    if (message.left !== undefined) player.inputLeft = message.left;
    if (message.right !== undefined) player.inputRight = message.right;
    if (message.jump !== undefined) player.inputJump = message.jump;
    if (message.sprint !== undefined) player.inputSprint = message.sprint;
    if (message.fire !== undefined) player.inputFire = message.fire;
    if (message.aim !== undefined) player.inputAim = message.aim;
    if (message.rotationY !== undefined) player.rotationY = message.rotationY;
  }

  private handlePositionUpdate(client: Client, message: PositionMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Update position (client-authoritative for smooth movement)
    player.x = message.x;
    player.y = message.y;
    player.z = message.z;
    player.rotationY = message.rotationY;
    player.velocityX = message.velocityX;
    player.velocityY = message.velocityY;
    player.velocityZ = message.velocityZ;
    player.state = message.state;
    player.timestamp = Date.now();
  }

  private handleVehicleInput(client: Client, message: VehicleInputMessage) {
    const player = this.state.players.get(client.sessionId);
    const vehicle = this.state.vehicles.get(message.vehicleId);

    if (!player || !vehicle) return;
    if (vehicle.driverId !== client.sessionId) return; // Only driver can control

    vehicle.throttle = message.throttle;
    vehicle.steering = message.steering;
    vehicle.brake = message.brake;
    vehicle.handbrake = message.handbrake;
    vehicle.timestamp = Date.now();
  }

  private handleEnterVehicle(client: Client, vehicleId: string) {
    const player = this.state.players.get(client.sessionId);
    const vehicle = this.state.vehicles.get(vehicleId);

    if (!player || !vehicle) return;
    if (player.isInVehicle) return; // Already in a vehicle
    if (vehicle.destroyed) return;

    // Check if driver seat is available
    if (!vehicle.driverId) {
      vehicle.driverId = client.sessionId;
      player.isInVehicle = true;
      player.vehicleId = vehicleId;

      this.broadcast('vehicleEnter', {
        playerId: client.sessionId,
        vehicleId: vehicleId,
        asDriver: true,
      });
    }
    // TODO: Handle passenger seats
  }

  private handleExitVehicle(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isInVehicle) return;

    const vehicle = this.state.vehicles.get(player.vehicleId);
    if (vehicle) {
      if (vehicle.driverId === client.sessionId) {
        vehicle.driverId = '';
        vehicle.throttle = 0;
        vehicle.steering = 0;
        vehicle.brake = true;
      } else {
        const passengerIndex = vehicle.passengerIds.indexOf(client.sessionId);
        if (passengerIndex !== -1) {
          vehicle.passengerIds.splice(passengerIndex, 1);
        }
      }
    }

    // Set exit position (beside vehicle)
    if (vehicle) {
      player.x = vehicle.x + 2;
      player.y = vehicle.y + 1;
      player.z = vehicle.z;
    }

    player.isInVehicle = false;
    player.vehicleId = '';

    this.broadcast('vehicleExit', {
      playerId: client.sessionId,
      vehicleId: vehicle?.id || '',
    });
  }

  private handleWeaponFire(client: Client, message: { weaponId: string; dirX: number; dirY: number; dirZ: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Broadcast fire event to all clients for visual effects
    this.broadcast('weaponFire', {
      playerId: client.sessionId,
      weaponId: message.weaponId,
      posX: player.x,
      posY: player.y + 1.5, // Approximate gun height
      posZ: player.z,
      dirX: message.dirX,
      dirY: message.dirY,
      dirZ: message.dirZ,
    });
  }

  private handleDamage(client: Client, message: { targetId: string; amount: number; type: string }) {
    // Validate damage source
    const attacker = this.state.players.get(client.sessionId);
    if (!attacker) return;

    // Check if target is player or NPC
    if (message.type === 'player') {
      const target = this.state.players.get(message.targetId);
      if (target && !target.isInVehicle) { // Can't damage players in vehicles
        target.health = Math.max(0, target.health - message.amount);

        if (target.health <= 0) {
          target.state = 'dead';
          this.broadcast('playerKilled', {
            killerId: client.sessionId,
            victimId: message.targetId,
          });
        }
      }
    } else if (message.type === 'vehicle') {
      const vehicle = this.state.vehicles.get(message.targetId);
      if (vehicle) {
        vehicle.health = Math.max(0, vehicle.health - message.amount);

        if (vehicle.health <= 0 && !vehicle.destroyed) {
          vehicle.destroyed = true;
          this.broadcast('vehicleDestroyed', {
            vehicleId: message.targetId,
            destroyerId: client.sessionId,
          });
        }
      }
    }
  }

  private handlePickup(client: Client, pickupId: string) {
    // Check if already collected
    if (this.state.collectedPickups.includes(pickupId)) return;

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Mark as collected
    this.state.collectedPickups.push(pickupId);

    // Broadcast pickup collection
    this.broadcast('pickupCollected', {
      playerId: client.sessionId,
      pickupId: pickupId,
    });

    // Schedule respawn (60 seconds)
    this.clock.setTimeout(() => {
      const index = this.state.collectedPickups.indexOf(pickupId);
      if (index !== -1) {
        this.state.collectedPickups.splice(index, 1);
        this.broadcast('pickupRespawned', { pickupId });
      }
    }, 60000);
  }
}
