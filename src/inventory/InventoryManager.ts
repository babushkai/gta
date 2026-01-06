import * as THREE from 'three';
import { Weapon, WeaponConfig, WeaponType, InventoryData } from '@/types';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';

const WEAPON_CONFIGS: WeaponConfig[] = [
  {
    id: 'fist',
    name: 'Fists',
    type: 'melee',
    damage: 10,
    fireRate: 2,
    reloadTime: 0,
    magazineSize: 0,
    maxAmmo: 0,
    range: 2,
    accuracy: 1,
    automatic: false,
    model: 'fist',
    sounds: {
      fire: 'punch',
      reload: '',
      empty: '',
      equip: ''
    }
  },
  {
    id: 'knife',
    name: 'Knife',
    type: 'melee',
    damage: 25,
    fireRate: 1.5,
    reloadTime: 0,
    magazineSize: 0,
    maxAmmo: 0,
    range: 2.5,
    accuracy: 1,
    automatic: false,
    model: 'knife',
    sounds: {
      fire: 'knife_slash',
      reload: '',
      empty: '',
      equip: 'knife_equip'
    }
  },
  {
    id: 'pistol',
    name: '9mm Pistol',
    type: 'pistol',
    damage: 25,
    fireRate: 5,
    reloadTime: 1.5,
    magazineSize: 17,
    maxAmmo: 150,
    range: 50,
    accuracy: 0.85,
    automatic: false,
    model: 'pistol',
    sounds: {
      fire: 'pistol_fire',
      reload: 'pistol_reload',
      empty: 'empty_click',
      equip: 'pistol_equip'
    }
  },
  {
    id: 'smg',
    name: 'Micro SMG',
    type: 'smg',
    damage: 15,
    fireRate: 15,
    reloadTime: 2,
    magazineSize: 30,
    maxAmmo: 300,
    range: 35,
    accuracy: 0.6,
    automatic: true,
    model: 'smg',
    sounds: {
      fire: 'smg_fire',
      reload: 'smg_reload',
      empty: 'empty_click',
      equip: 'smg_equip'
    }
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    type: 'shotgun',
    damage: 80,
    fireRate: 1,
    reloadTime: 3,
    magazineSize: 8,
    maxAmmo: 50,
    range: 15,
    accuracy: 0.5,
    automatic: false,
    model: 'shotgun',
    sounds: {
      fire: 'shotgun_fire',
      reload: 'shotgun_reload',
      empty: 'empty_click',
      equip: 'shotgun_equip'
    }
  },
  {
    id: 'rifle',
    name: 'M4 Carbine',
    type: 'rifle',
    damage: 35,
    fireRate: 10,
    reloadTime: 2.5,
    magazineSize: 30,
    maxAmmo: 200,
    range: 100,
    accuracy: 0.9,
    automatic: true,
    model: 'rifle',
    sounds: {
      fire: 'rifle_fire',
      reload: 'rifle_reload',
      empty: 'empty_click',
      equip: 'rifle_equip'
    }
  },
  {
    id: 'sniper',
    name: 'Sniper Rifle',
    type: 'rifle',
    damage: 100,
    fireRate: 0.5,
    reloadTime: 3,
    magazineSize: 5,
    maxAmmo: 30,
    range: 200,
    accuracy: 0.98,
    automatic: false,
    model: 'sniper',
    sounds: {
      fire: 'sniper_fire',
      reload: 'sniper_reload',
      empty: 'empty_click',
      equip: 'sniper_equip'
    }
  },
  {
    id: 'rpg',
    name: 'RPG',
    type: 'heavy',
    damage: 500,
    fireRate: 0.3,
    reloadTime: 4,
    magazineSize: 1,
    maxAmmo: 10,
    range: 150,
    accuracy: 0.95,
    automatic: false,
    model: 'rpg',
    sounds: {
      fire: 'rpg_fire',
      reload: 'rpg_reload',
      empty: 'empty_click',
      equip: 'rpg_equip'
    }
  },
  {
    id: 'grenade',
    name: 'Grenade',
    type: 'thrown',
    damage: 200,
    fireRate: 1,
    reloadTime: 0,
    magazineSize: 1,
    maxAmmo: 10,
    range: 30,
    accuracy: 0.8,
    automatic: false,
    model: 'grenade',
    sounds: {
      fire: 'grenade_throw',
      reload: '',
      empty: '',
      equip: ''
    }
  }
];

const WEAPON_SLOT_ORDER: WeaponType[] = [
  'melee',
  'pistol',
  'smg',
  'shotgun',
  'rifle',
  'heavy',
  'thrown',
  'special'
];

export class InventoryManager {
  private game: Game;
  private weapons: Map<string, Weapon> = new Map();
  private currentWeaponSlot: number = 0;
  private weaponMeshes: Map<string, THREE.Group> = new Map();

  constructor(game: Game) {
    this.game = game;
  }

  async initialize(): Promise<void> {
    this.addWeapon('fist');
    this.addWeapon('pistol', 50);

    this.setupInputHandlers();
  }

  private setupInputHandlers(): void {
    this.game.input.on('wheel', (data: { delta: number }) => {
      if (data.delta > 0) {
        this.nextWeapon();
      } else {
        this.previousWeapon();
      }
    });

    this.game.input.on('keydown', (data: { action: string; code: string }) => {
      if (data.action === 'nextWeapon') {
        this.nextWeapon();
      } else if (data.action === 'prevWeapon') {
        this.previousWeapon();
      }

      if (data.code >= 'Digit1' && data.code <= 'Digit9') {
        const slot = parseInt(data.code.replace('Digit', '')) - 1;
        this.selectWeaponSlot(slot);
      }
    });
  }

  addWeapon(weaponId: string, ammo?: number): boolean {
    const config = WEAPON_CONFIGS.find(w => w.id === weaponId);
    if (!config) return false;

    if (this.weapons.has(weaponId)) {
      const weapon = this.weapons.get(weaponId)!;
      if (ammo) {
        weapon.reserveAmmo = Math.min(
          weapon.reserveAmmo + ammo,
          config.maxAmmo
        );
      }
      return true;
    }

    const weapon: Weapon = {
      config,
      currentAmmo: config.magazineSize,
      reserveAmmo: ammo ?? config.maxAmmo,
      mesh: null
    };

    this.weapons.set(weaponId, weapon);

    this.createWeaponMesh(weapon);

    globalEvents.emit('weapon_pickup', { weaponId });

    return true;
  }

  private createWeaponMesh(weapon: Weapon): void {
    const group = new THREE.Group();

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.8
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    weapon.mesh = group;
    this.weaponMeshes.set(weapon.config.id, group);
  }

  removeWeapon(weaponId: string): boolean {
    const weapon = this.weapons.get(weaponId);
    if (!weapon) return false;

    if (weapon.mesh) {
      this.game.scene.remove(weapon.mesh);
    }
    this.weaponMeshes.delete(weaponId);
    this.weapons.delete(weaponId);

    return true;
  }

  addAmmo(weaponId: string, amount: number): boolean {
    const weapon = this.weapons.get(weaponId);
    if (!weapon) return false;

    weapon.reserveAmmo = Math.min(
      weapon.reserveAmmo + amount,
      weapon.config.maxAmmo
    );

    return true;
  }

  addAmmoByType(weaponType: WeaponType, amount: number): void {
    this.weapons.forEach(weapon => {
      if (weapon.config.type === weaponType) {
        weapon.reserveAmmo = Math.min(
          weapon.reserveAmmo + amount,
          weapon.config.maxAmmo
        );
      }
    });
  }

  selectWeapon(weaponId: string): boolean {
    const weapon = this.weapons.get(weaponId);
    if (!weapon) return false;

    this.game.player.equipWeapon(weapon);

    if (weapon.config.sounds.equip) {
      this.game.audio.playSound(weapon.config.sounds.equip);
    }

    // Update crosshair visibility based on weapon type
    this.game.ui.updateCrosshairForWeapon();

    return true;
  }

  selectWeaponSlot(slot: number): void {
    if (slot < 0 || slot >= WEAPON_SLOT_ORDER.length) return;

    const targetType = WEAPON_SLOT_ORDER[slot];
    const weapon = this.getWeaponByType(targetType);

    if (weapon) {
      this.currentWeaponSlot = slot;
      this.selectWeapon(weapon.config.id);
    }
  }

  nextWeapon(): void {
    const weaponArray = Array.from(this.weapons.values());
    if (weaponArray.length === 0) return;

    const currentWeapon = this.game.player.getCurrentWeapon();
    const currentIndex = currentWeapon
      ? weaponArray.findIndex(w => w.config.id === currentWeapon.config.id)
      : -1;

    const nextIndex = (currentIndex + 1) % weaponArray.length;
    this.selectWeapon(weaponArray[nextIndex].config.id);
  }

  previousWeapon(): void {
    const weaponArray = Array.from(this.weapons.values());
    if (weaponArray.length === 0) return;

    const currentWeapon = this.game.player.getCurrentWeapon();
    const currentIndex = currentWeapon
      ? weaponArray.findIndex(w => w.config.id === currentWeapon.config.id)
      : 0;

    const prevIndex = currentIndex <= 0 ? weaponArray.length - 1 : currentIndex - 1;
    this.selectWeapon(weaponArray[prevIndex].config.id);
  }

  getWeaponByType(type: WeaponType): Weapon | null {
    for (const weapon of this.weapons.values()) {
      if (weapon.config.type === type) {
        return weapon;
      }
    }
    return null;
  }

  getWeapon(weaponId: string): Weapon | null {
    return this.weapons.get(weaponId) ?? null;
  }

  getAllWeapons(): Weapon[] {
    return Array.from(this.weapons.values());
  }

  getWeaponsBySlot(): Map<WeaponType, Weapon[]> {
    const slots = new Map<WeaponType, Weapon[]>();

    WEAPON_SLOT_ORDER.forEach(type => {
      slots.set(type, []);
    });

    this.weapons.forEach(weapon => {
      const slot = slots.get(weapon.config.type);
      if (slot) {
        slot.push(weapon);
      }
    });

    return slots;
  }

  hasWeapon(weaponId: string): boolean {
    return this.weapons.has(weaponId);
  }

  getTotalAmmo(weaponId: string): number {
    const weapon = this.weapons.get(weaponId);
    if (!weapon) return 0;
    return weapon.currentAmmo + weapon.reserveAmmo;
  }

  serialize(): InventoryData {
    const weapons = Array.from(this.weapons.values()).map(weapon => ({
      id: weapon.config.id,
      currentAmmo: weapon.currentAmmo,
      reserveAmmo: weapon.reserveAmmo
    }));

    const currentWeapon = this.game.player.getCurrentWeapon();
    const currentWeaponIndex = currentWeapon
      ? Array.from(this.weapons.keys()).indexOf(currentWeapon.config.id)
      : 0;

    return {
      weapons,
      currentWeaponIndex
    };
  }

  deserialize(data: InventoryData): void {
    this.weapons.clear();
    this.weaponMeshes.clear();

    data.weapons.forEach(weaponData => {
      const config = WEAPON_CONFIGS.find(w => w.id === weaponData.id);
      if (config) {
        const weapon: Weapon = {
          config,
          currentAmmo: weaponData.currentAmmo,
          reserveAmmo: weaponData.reserveAmmo,
          mesh: null
        };
        this.weapons.set(weaponData.id, weapon);
        this.createWeaponMesh(weapon);
      }
    });

    const weaponArray = Array.from(this.weapons.values());
    if (weaponArray[data.currentWeaponIndex]) {
      this.selectWeapon(weaponArray[data.currentWeaponIndex].config.id);
    }
  }

  getWeaponConfig(weaponId: string): WeaponConfig | null {
    return WEAPON_CONFIGS.find(w => w.id === weaponId) ?? null;
  }

  getAllWeaponConfigs(): WeaponConfig[] {
    return WEAPON_CONFIGS;
  }

  dispose(): void {
    this.weaponMeshes.forEach(mesh => {
      this.game.scene.remove(mesh);
    });
    this.weaponMeshes.clear();
    this.weapons.clear();
  }
}
