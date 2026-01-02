import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RapierVehicle } from '@/physics/RapierVehiclePhysics';

// Core Types
export interface GameConfig {
  debug: boolean;
  graphics: GraphicsConfig;
  audio: AudioConfig;
  physics: PhysicsConfig;
  gameplay: GameplayConfig;
}

export interface GraphicsConfig {
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  postProcessing: boolean;
  bloom: boolean;
  ssao: boolean;
  dof: boolean;
  motionBlur: boolean;
  fov: number;
  drawDistance: number;
}

export interface AudioConfig {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  radioVolume: number;
}

export interface PhysicsConfig {
  gravity: number;
  substeps: number;
  friction: number;
  restitution: number;
}

export interface GameplayConfig {
  difficulty: 'easy' | 'normal' | 'hard';
  autoAim: boolean;
  invertY: boolean;
  mouseSensitivity: number;
}

// Player Types
export interface PlayerStats {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  money: number;
  wantedLevel: number;
  stamina: number;
  maxStamina: number;
}

export interface PlayerState {
  isMoving: boolean;
  isRunning: boolean;
  isJumping: boolean;
  isCrouching: boolean;
  isInVehicle: boolean;
  isAiming: boolean;
  isShooting: boolean;
  isReloading: boolean;
  isDead: boolean;
  currentVehicle: Vehicle | null;
}

// Vehicle Types
export interface VehicleConfig {
  id: string;
  name: string;
  type: VehicleType;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  handling: number;
  mass: number;
  health: number;
  seats: number;
  hasRadio: boolean;
  color: number;
}

export type VehicleType = 'car' | 'motorcycle' | 'truck' | 'boat' | 'helicopter';

export interface Vehicle {
  id: string;
  config: VehicleConfig;
  mesh: THREE.Group;
  rapierVehicle: RapierVehicle;
  currentSpeed: number;
  health: number;
  fuel: number;
  driver: Character | null;
  passengers: Character[];
  wheels: VehicleWheel[];
  lights: VehicleLights;
  destroyed: boolean;
}

export interface VehicleWheel {
  mesh: THREE.Mesh;
  steering: boolean;
  powered: boolean;
}

export interface VehicleLights {
  headlights: THREE.Light[];
  taillights: THREE.Light[];
  brakeLights: THREE.Light[];
  indicators: THREE.Light[];
}

// Weapon Types
export interface WeaponConfig {
  id: string;
  name: string;
  type: WeaponType;
  damage: number;
  fireRate: number;
  reloadTime: number;
  magazineSize: number;
  maxAmmo: number;
  range: number;
  accuracy: number;
  automatic: boolean;
  model: string;
  sounds: WeaponSounds;
}

export type WeaponType = 'melee' | 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'heavy' | 'thrown' | 'special';

export interface WeaponSounds {
  fire: string;
  reload: string;
  empty: string;
  equip: string;
}

export interface Weapon {
  config: WeaponConfig;
  currentAmmo: number;
  reserveAmmo: number;
  mesh: THREE.Group | null;
}

// Character Types
export interface CharacterConfig {
  id: string;
  name: string;
  type: CharacterType;
  health: number;
  speed: number;
  model: string;
  hostile: boolean;
  faction: string;
}

export type CharacterType = 'civilian' | 'gang' | 'police' | 'military' | 'special';

export interface Character {
  id: string;
  config: CharacterConfig;
  mesh: THREE.Group;
  body: CANNON.Body;
  health: number;
  state: AIState;
  currentWeapon: Weapon | null;
  target: THREE.Vector3 | null;
  path: THREE.Vector3[];
  isDead: boolean;
}

// AI Types
export type AIState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'driving'
  | 'fleeing'
  | 'attacking'
  | 'seeking'
  | 'patrolling'
  | 'following'
  | 'dead';

export interface AIBehavior {
  state: AIState;
  target: Character | Vehicle | THREE.Vector3 | null;
  alertLevel: number;
  lastKnownPlayerPosition: THREE.Vector3 | null;
  patrolPoints: THREE.Vector3[];
  currentPatrolIndex: number;
}

export interface PathNode {
  position: THREE.Vector3;
  connections: PathNode[];
  type: 'road' | 'sidewalk' | 'intersection' | 'building';
}

// Mission Types
export interface MissionConfig {
  id: string;
  title: string;
  description: string;
  giver: string;
  location: THREE.Vector3;
  reward: MissionReward;
  objectives: MissionObjective[];
  prerequisites: string[];
  timeLimit?: number;
  failConditions: MissionFailCondition[];
}

export interface MissionObjective {
  id: string;
  type: ObjectiveType;
  description: string;
  target?: string;
  location?: THREE.Vector3;
  count?: number;
  currentCount?: number;
  completed: boolean;
  optional: boolean;
}

export type ObjectiveType =
  | 'goto'
  | 'kill'
  | 'collect'
  | 'deliver'
  | 'protect'
  | 'destroy'
  | 'steal'
  | 'escape'
  | 'survive'
  | 'follow';

export interface MissionReward {
  money: number;
  respect?: number;
  unlocks?: string[];
  weapons?: string[];
}

export interface MissionFailCondition {
  type: 'death' | 'target_death' | 'time' | 'vehicle_destroyed' | 'detected';
  target?: string;
}

export interface MissionState {
  currentMission: MissionConfig | null;
  completedMissions: string[];
  failedMissions: string[];
  activeMissions: Map<string, MissionConfig>;
}

// Weather Types
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

export interface WeatherState {
  current: WeatherType;
  intensity: number;
  windDirection: THREE.Vector3;
  windSpeed: number;
  temperature: number;
  timeOfDay: number;
  sunPosition: THREE.Vector3;
}

export interface WeatherConfig {
  type: WeatherType;
  fogDensity: number;
  fogColor: number;
  ambientLight: number;
  sunIntensity: number;
  rainIntensity: number;
  cloudCoverage: number;
}

// Traffic Types
export interface TrafficConfig {
  maxVehicles: number;
  maxPedestrians: number;
  spawnRadius: number;
  despawnRadius: number;
  density: number;
}

export interface TrafficSpawnPoint {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  type: 'vehicle' | 'pedestrian';
  vehicleTypes?: VehicleType[];
}

// Radio Types
export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  tracks: RadioTrack[];
  currentTrackIndex: number;
  djName?: string;
  icon: string;
}

export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  file: string;
}

// World Types
export interface WorldObject {
  id: string;
  type: WorldObjectType;
  mesh: THREE.Object3D;
  body?: CANNON.Body;
  destructible: boolean;
  health?: number;
  interactable: boolean;
  interactionType?: InteractionType;
}

export type WorldObjectType =
  | 'building'
  | 'prop'
  | 'vegetation'
  | 'barrier'
  | 'pickup'
  | 'trigger';

export type InteractionType =
  | 'enter'
  | 'pickup'
  | 'use'
  | 'talk'
  | 'buy'
  | 'mission';

// Pickup Types
export interface Pickup {
  id: string;
  type: PickupType;
  value: number;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  respawnTime: number;
  collected: boolean;
  weaponId?: string;
}

export type PickupType =
  | 'health'
  | 'armor'
  | 'money'
  | 'weapon'
  | 'ammo'
  | 'special';

// Save Types
export interface SaveData {
  version: string;
  timestamp: number;
  player: {
    stats: PlayerStats;
    position: { x: number; y: number; z: number };
    rotation: number;
    inventory: InventoryData;
  };
  world: {
    weather: WeatherType;
    timeOfDay: number;
    completedMissions: string[];
    unlockedAreas: string[];
    garageVehicles: string[];
  };
  settings: GameConfig;
}

export interface InventoryData {
  weapons: Array<{
    id: string;
    currentAmmo: number;
    reserveAmmo: number;
  }>;
  currentWeaponIndex: number;
}

// Event Types
export interface GameEvent {
  type: GameEventType;
  data: unknown;
  timestamp: number;
}

export type GameEventType =
  | 'player_death'
  | 'vehicle_enter'
  | 'vehicle_exit'
  | 'weapon_fire'
  | 'weapon_reload'
  | 'mission_start'
  | 'mission_complete'
  | 'mission_fail'
  | 'wanted_level_change'
  | 'damage_taken'
  | 'npc_killed'
  | 'pickup_collected'
  | 'save_game'
  | 'load_game';

// Input Types
export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  fire: boolean;
  aim: boolean;
  reload: boolean;
  interact: boolean;
  enterVehicle: boolean;
  horn: boolean;
  headlights: boolean;
  handbrake: boolean;
  nextWeapon: boolean;
  prevWeapon: boolean;
  nextRadio: boolean;
  pause: boolean;
  mouseX: number;
  mouseY: number;
  mouseDeltaX: number;
  mouseDeltaY: number;
}

// Utility Types
export type Vector3Like = {
  x: number;
  y: number;
  z: number;
};

export interface BoundingBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface CollisionResult {
  hit: boolean;
  point?: THREE.Vector3;
  normal?: THREE.Vector3;
  distance?: number;
  object?: THREE.Object3D | CANNON.Body;
}
