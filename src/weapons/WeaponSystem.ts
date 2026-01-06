import * as THREE from 'three';
import { WeaponConfig, Weapon, WeaponType } from '@/types';
import { Game } from '@/core/Game';
import { COLLISION_GROUPS } from '@/physics/PhysicsWorld';

// Weapon configurations
const WEAPON_CONFIGS: WeaponConfig[] = [
  {
    id: 'fists',
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
    model: 'fists',
    sounds: { fire: 'punch', reload: '', empty: '', equip: 'equip' }
  },
  {
    id: 'knife',
    name: 'Knife',
    type: 'melee',
    damage: 30,
    fireRate: 3,
    reloadTime: 0,
    magazineSize: 0,
    maxAmmo: 0,
    range: 2.5,
    accuracy: 1,
    automatic: false,
    model: 'knife',
    sounds: { fire: 'punch', reload: '', empty: '', equip: 'equip' }
  },
  {
    id: 'bat',
    name: 'Baseball Bat',
    type: 'melee',
    damage: 25,
    fireRate: 1.5,
    reloadTime: 0,
    magazineSize: 0,
    maxAmmo: 0,
    range: 3,
    accuracy: 1,
    automatic: false,
    model: 'bat',
    sounds: { fire: 'punch', reload: '', empty: '', equip: 'equip' }
  },
  {
    id: 'pistol',
    name: '9mm Pistol',
    type: 'pistol',
    damage: 25,
    fireRate: 4,
    reloadTime: 1.5,
    magazineSize: 12,
    maxAmmo: 120,
    range: 50,
    accuracy: 0.85,
    automatic: false,
    model: 'pistol',
    sounds: { fire: 'pistol_fire', reload: 'pistol_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'deagle',
    name: 'Desert Eagle',
    type: 'pistol',
    damage: 50,
    fireRate: 2,
    reloadTime: 2,
    magazineSize: 7,
    maxAmmo: 70,
    range: 60,
    accuracy: 0.9,
    automatic: false,
    model: 'deagle',
    sounds: { fire: 'shotgun', reload: 'reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'uzi',
    name: 'Micro SMG',
    type: 'smg',
    damage: 18,
    fireRate: 12,
    reloadTime: 2,
    magazineSize: 30,
    maxAmmo: 300,
    range: 35,
    accuracy: 0.65,
    automatic: true,
    model: 'uzi',
    sounds: { fire: 'smg_fire', reload: 'smg_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    type: 'shotgun',
    damage: 80,
    fireRate: 1,
    reloadTime: 3,
    magazineSize: 8,
    maxAmmo: 64,
    range: 20,
    accuracy: 0.5,
    automatic: false,
    model: 'shotgun',
    sounds: { fire: 'shotgun_fire', reload: 'shotgun_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'ak47',
    name: 'AK-47',
    type: 'rifle',
    damage: 35,
    fireRate: 8,
    reloadTime: 2.5,
    magazineSize: 30,
    maxAmmo: 300,
    range: 100,
    accuracy: 0.75,
    automatic: true,
    model: 'ak47',
    sounds: { fire: 'rifle_fire', reload: 'rifle_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'm4',
    name: 'M4 Carbine',
    type: 'rifle',
    damage: 32,
    fireRate: 10,
    reloadTime: 2,
    magazineSize: 30,
    maxAmmo: 300,
    range: 120,
    accuracy: 0.82,
    automatic: true,
    model: 'm4',
    sounds: { fire: 'rifle_fire', reload: 'rifle_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'sniper',
    name: 'Sniper Rifle',
    type: 'rifle',
    damage: 120,
    fireRate: 0.8,
    reloadTime: 3,
    magazineSize: 5,
    maxAmmo: 50,
    range: 300,
    accuracy: 0.95,
    automatic: false,
    model: 'sniper',
    sounds: { fire: 'shotgun', reload: 'reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'rpg',
    name: 'RPG',
    type: 'heavy',
    damage: 200,
    fireRate: 0.5,
    reloadTime: 4,
    magazineSize: 1,
    maxAmmo: 10,
    range: 200,
    accuracy: 0.9,
    automatic: false,
    model: 'rpg',
    sounds: { fire: 'rocket_fire', reload: 'rocket_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'grenade',
    name: 'Grenade',
    type: 'thrown',
    damage: 150,
    fireRate: 1,
    reloadTime: 0,
    magazineSize: 1,
    maxAmmo: 10,
    range: 30,
    accuracy: 0.8,
    automatic: false,
    model: 'grenade',
    sounds: { fire: 'explosion', reload: '', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'minigun',
    name: 'Minigun',
    type: 'heavy',
    damage: 15,
    fireRate: 30,
    reloadTime: 5,
    magazineSize: 500,
    maxAmmo: 2000,
    range: 80,
    accuracy: 0.6,
    automatic: true,
    model: 'minigun',
    sounds: { fire: 'rifle_fire', reload: 'rocket_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'flamethrower',
    name: 'Flamethrower',
    type: 'heavy',
    damage: 8,
    fireRate: 20,
    reloadTime: 4,
    magazineSize: 200,
    maxAmmo: 500,
    range: 15,
    accuracy: 1.0,
    automatic: true,
    model: 'flamethrower',
    sounds: { fire: 'explosion', reload: 'reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'molotov',
    name: 'Molotov Cocktail',
    type: 'thrown',
    damage: 100,
    fireRate: 0.8,
    reloadTime: 0,
    magazineSize: 1,
    maxAmmo: 10,
    range: 25,
    accuracy: 0.7,
    automatic: false,
    model: 'molotov',
    sounds: { fire: 'explosion', reload: '', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'chainsaw',
    name: 'Chainsaw',
    type: 'melee',
    damage: 50,
    fireRate: 8,
    reloadTime: 0,
    magazineSize: 0,
    maxAmmo: 0,
    range: 2.5,
    accuracy: 1,
    automatic: true,
    model: 'chainsaw',
    sounds: { fire: 'punch', reload: '', empty: '', equip: 'equip' }
  },
  {
    id: 'taser',
    name: 'Taser',
    type: 'pistol',
    damage: 5,
    fireRate: 0.5,
    reloadTime: 3,
    magazineSize: 2,
    maxAmmo: 20,
    range: 10,
    accuracy: 0.9,
    automatic: false,
    model: 'taser',
    sounds: { fire: 'empty_click', reload: 'reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'katana',
    name: 'Katana',
    type: 'melee',
    damage: 60,
    fireRate: 2.5,
    reloadTime: 0,
    magazineSize: 0,
    maxAmmo: 0,
    range: 3,
    accuracy: 1,
    automatic: false,
    model: 'katana',
    sounds: { fire: 'punch', reload: '', empty: '', equip: 'equip' }
  },
  {
    id: 'mp5',
    name: 'MP5',
    type: 'smg',
    damage: 22,
    fireRate: 10,
    reloadTime: 2.2,
    magazineSize: 30,
    maxAmmo: 240,
    range: 40,
    accuracy: 0.75,
    automatic: true,
    model: 'mp5',
    sounds: { fire: 'smg_fire', reload: 'smg_reload', empty: 'empty_click', equip: 'equip' }
  },
  {
    id: 'sawnoff',
    name: 'Sawn-off Shotgun',
    type: 'shotgun',
    damage: 120,
    fireRate: 1.5,
    reloadTime: 2,
    magazineSize: 2,
    maxAmmo: 40,
    range: 12,
    accuracy: 0.35,
    automatic: false,
    model: 'sawnoff',
    sounds: { fire: 'shotgun_fire', reload: 'shotgun_reload', empty: 'empty_click', equip: 'equip' }
  }
];

export class WeaponSystem {
  private game: Game;
  private weapons: Map<string, Weapon> = new Map();
  private currentWeaponIndex: number = 0;
  private weaponOrder: string[] = [];
  private weaponMesh: THREE.Group | null = null;
  private muzzleFlash: THREE.PointLight | null = null;
  private lastFireTime: number = 0;
  private isReloading: boolean = false;

  // Recoil state
  private recoilAmount: number = 0;
  private recoilRecovery: number = 0;
  private weaponKickback: number = 0;
  private weaponKickUp: number = 0;
  private cameraShakeIntensity: number = 0;
  private cameraShakeDecay: number = 0.9;

  constructor(game: Game) {
    this.game = game;
  }

  async initialize(): Promise<void> {
    // Give player starting weapons
    this.addWeapon('fists');
    this.addWeapon('pistol', 36);

    this.createMuzzleFlash();
  }

  private createMuzzleFlash(): void {
    this.muzzleFlash = new THREE.PointLight(0xffaa00, 0, 10);
    this.muzzleFlash.castShadow = false;
  }

  addWeapon(weaponId: string, ammo?: number): Weapon | null {
    const config = WEAPON_CONFIGS.find(w => w.id === weaponId);
    if (!config) return null;

    // Check if already have this weapon
    if (this.weapons.has(weaponId)) {
      const weapon = this.weapons.get(weaponId)!;
      if (ammo) {
        weapon.reserveAmmo = Math.min(weapon.reserveAmmo + ammo, config.maxAmmo);
      }
      return weapon;
    }

    const weapon: Weapon = {
      config,
      currentAmmo: config.magazineSize,
      reserveAmmo: ammo ?? config.maxAmmo,
      mesh: this.createWeaponMesh(config)
    };

    this.weapons.set(weaponId, weapon);
    this.weaponOrder.push(weaponId);

    // Auto-equip if first weapon
    if (this.weaponOrder.length === 1) {
      this.equipWeapon(0);
    }

    return weapon;
  }

  private createWeaponMesh(config: WeaponConfig): THREE.Group {
    const group = new THREE.Group();

    const gunMetal = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.4,
      metalness: 0.9
    });

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.8,
      metalness: 0.1
    });

    switch (config.type) {
      case 'pistol':
        // Pistol body
        const pistolBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.12, 0.18),
          gunMetal
        );
        pistolBody.position.set(0, 0, 0.09);
        group.add(pistolBody);

        // Pistol grip
        const pistolGrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.1, 0.05),
          gunMetal
        );
        pistolGrip.position.set(0, -0.08, 0.02);
        pistolGrip.rotation.x = 0.3;
        group.add(pistolGrip);

        // Barrel
        const pistolBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8),
          gunMetal
        );
        pistolBarrel.rotation.x = Math.PI / 2;
        pistolBarrel.position.set(0, 0.03, 0.2);
        group.add(pistolBarrel);
        break;

      case 'smg':
        // SMG body
        const smgBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.1, 0.25),
          gunMetal
        );
        smgBody.position.set(0, 0, 0.12);
        group.add(smgBody);

        // SMG grip
        const smgGrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.12, 0.04),
          gunMetal
        );
        smgGrip.position.set(0, -0.1, 0.05);
        smgGrip.rotation.x = 0.25;
        group.add(smgGrip);

        // SMG magazine
        const smgMag = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.15, 0.04),
          gunMetal
        );
        smgMag.position.set(0, -0.12, 0.15);
        group.add(smgMag);

        // SMG barrel
        const smgBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8),
          gunMetal
        );
        smgBarrel.rotation.x = Math.PI / 2;
        smgBarrel.position.set(0, 0.02, 0.3);
        group.add(smgBarrel);
        break;

      case 'shotgun':
        // Shotgun body
        const shotgunBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.08, 0.5),
          gunMetal
        );
        shotgunBody.position.set(0, 0, 0.25);
        group.add(shotgunBody);

        // Shotgun stock
        const shotgunStock = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.12, 0.25),
          woodMaterial
        );
        shotgunStock.position.set(0, -0.02, -0.1);
        group.add(shotgunStock);

        // Shotgun barrel
        const shotgunBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8),
          gunMetal
        );
        shotgunBarrel.rotation.x = Math.PI / 2;
        shotgunBarrel.position.set(0, 0.03, 0.45);
        group.add(shotgunBarrel);

        // Pump
        const pump = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.055, 0.12),
          woodMaterial
        );
        pump.position.set(0, -0.02, 0.35);
        group.add(pump);
        break;

      case 'rifle':
        // Rifle body
        const rifleBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.1, 0.45),
          gunMetal
        );
        rifleBody.position.set(0, 0, 0.22);
        group.add(rifleBody);

        // Rifle stock
        const rifleStock = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.1, 0.2),
          woodMaterial
        );
        rifleStock.position.set(0, -0.02, -0.08);
        group.add(rifleStock);

        // Rifle magazine
        const rifleMag = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.15, 0.06),
          gunMetal
        );
        rifleMag.position.set(0, -0.12, 0.2);
        rifleMag.rotation.x = 0.15;
        group.add(rifleMag);

        // Rifle barrel
        const rifleBarrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8),
          gunMetal
        );
        rifleBarrel.rotation.x = Math.PI / 2;
        rifleBarrel.position.set(0, 0.03, 0.55);
        group.add(rifleBarrel);

        // Front grip
        const frontGrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.08, 0.06),
          woodMaterial
        );
        frontGrip.position.set(0, -0.06, 0.35);
        group.add(frontGrip);
        break;

      case 'heavy':
        if (config.id === 'minigun') {
          // Minigun barrels (rotating barrel cluster)
          const barrelGroup = new THREE.Group();
          const barrelCount = 6;
          for (let i = 0; i < barrelCount; i++) {
            const barrel = new THREE.Mesh(
              new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8),
              gunMetal
            );
            barrel.rotation.x = Math.PI / 2;
            const angle = (i / barrelCount) * Math.PI * 2;
            barrel.position.set(Math.cos(angle) * 0.04, Math.sin(angle) * 0.04, 0.3);
            barrelGroup.add(barrel);
          }
          group.add(barrelGroup);
          // Minigun body
          const minigunBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.06, 0.25, 12),
            gunMetal
          );
          minigunBody.rotation.x = Math.PI / 2;
          minigunBody.position.z = 0.05;
          group.add(minigunBody);
          // Handle
          const minigunHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.15, 0.05),
            gunMetal
          );
          minigunHandle.position.set(0, -0.12, -0.05);
          group.add(minigunHandle);
        } else if (config.id === 'flamethrower') {
          // Fuel tank
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12),
            new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5, metalness: 0.7 })
          );
          tank.rotation.x = Math.PI / 2;
          tank.position.z = -0.15;
          group.add(tank);
          // Nozzle
          const nozzle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8),
            gunMetal
          );
          nozzle.rotation.x = Math.PI / 2;
          nozzle.position.z = 0.2;
          group.add(nozzle);
          // Pilot flame holder
          const flameHolder = new THREE.Mesh(
            new THREE.ConeGeometry(0.02, 0.05, 6),
            new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.5 })
          );
          flameHolder.rotation.x = -Math.PI / 2;
          flameHolder.position.z = 0.38;
          group.add(flameHolder);
          // Handle
          const flameHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.12, 0.05),
            gunMetal
          );
          flameHandle.position.set(0, -0.1, 0.05);
          group.add(flameHandle);
        } else {
          // RPG tube
          const rpgTube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.8, 12),
            new THREE.MeshStandardMaterial({ color: 0x4a5c3a, roughness: 0.7 })
          );
          rpgTube.rotation.x = Math.PI / 2;
          rpgTube.position.set(0, 0, 0.4);
          group.add(rpgTube);

          // RPG grip
          const rpgGrip = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.12, 0.05),
            gunMetal
          );
          rpgGrip.position.set(0, -0.1, 0.15);
          group.add(rpgGrip);

          // RPG sight
          const rpgSight = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.08, 0.04),
            gunMetal
          );
          rpgSight.position.set(0, 0.08, 0.25);
          group.add(rpgSight);
        }
        break;

      case 'melee':
        if (config.id === 'knife') {
          // Knife blade
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, 0.02, 0.15),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 })
          );
          blade.position.z = 0.1;
          group.add(blade);
          // Knife handle
          const knifeHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.03, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
          );
          group.add(knifeHandle);
        } else if (config.id === 'bat') {
          // Baseball bat
          const batBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.04, 0.6, 8),
            woodMaterial
          );
          batBody.rotation.x = Math.PI / 2;
          batBody.position.z = 0.25;
          group.add(batBody);
          // Bat grip
          const batGrip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.025, 0.15, 8),
            new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
          );
          batGrip.rotation.x = Math.PI / 2;
          batGrip.position.z = -0.05;
          group.add(batGrip);
        } else if (config.id === 'chainsaw') {
          // Chainsaw body
          const chainsawBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.15, 0.35),
            new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 })
          );
          chainsawBody.position.z = 0.1;
          group.add(chainsawBody);
          // Chainsaw blade
          const chainsawBlade = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.08, 0.4),
            gunMetal
          );
          chainsawBlade.position.set(0, 0, 0.4);
          group.add(chainsawBlade);
          // Handle
          const chainsawHandle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8),
            new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
          );
          chainsawHandle.position.set(0, -0.1, 0);
          chainsawHandle.rotation.x = 0.3;
          group.add(chainsawHandle);
        } else if (config.id === 'katana') {
          // Katana blade
          const katanaBlade = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, 0.03, 0.7),
            new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.95, roughness: 0.1 })
          );
          katanaBlade.position.z = 0.4;
          group.add(katanaBlade);
          // Katana guard
          const katanaGuard = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.01, 0.01),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 })
          );
          katanaGuard.position.z = 0.05;
          group.add(katanaGuard);
          // Katana handle
          const katanaHandle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 })
          );
          katanaHandle.rotation.x = Math.PI / 2;
          katanaHandle.position.z = -0.08;
          group.add(katanaHandle);
        }
        break;

      case 'thrown':
        if (config.id === 'molotov') {
          // Molotov bottle
          const bottle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.035, 0.15, 8),
            new THREE.MeshStandardMaterial({ color: 0x88aa66, transparent: true, opacity: 0.7, roughness: 0.1 })
          );
          bottle.position.y = 0.05;
          group.add(bottle);
          // Bottle neck
          const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.02, 0.04, 8),
            new THREE.MeshStandardMaterial({ color: 0x88aa66, transparent: true, opacity: 0.7, roughness: 0.1 })
          );
          neck.position.y = 0.14;
          group.add(neck);
          // Rag/wick
          const rag = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.01, 0.06, 6),
            new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.9 })
          );
          rag.position.y = 0.18;
          group.add(rag);
        } else {
          // Grenade
          const grenadeBody = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.7 })
          );
          grenadeBody.scale.y = 1.3;
          group.add(grenadeBody);
          // Grenade pin
          const pin = new THREE.Mesh(
            new THREE.TorusGeometry(0.015, 0.003, 8, 12),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 })
          );
          pin.position.set(0, 0.06, 0);
          group.add(pin);
        }
        break;

      default:
        // Fists - no mesh needed
        break;
    }

    group.scale.set(1.5, 1.5, 1.5);
    return group;
  }

  equipWeapon(index: number): void {
    if (index < 0 || index >= this.weaponOrder.length) return;

    this.currentWeaponIndex = index;
    const weaponId = this.weaponOrder[index];
    const weapon = this.weapons.get(weaponId);

    if (!weapon) return;

    // Remove old weapon mesh from player
    if (this.weaponMesh) {
      this.game.player.mesh.remove(this.weaponMesh);
    }

    // Add new weapon mesh to player's hand (GTA 5 style third-person)
    if (weapon.mesh) {
      this.weaponMesh = weapon.mesh;
      // Position at right hand - adjusted for third person view
      this.weaponMesh.position.set(0.32, 0.85, 0.15);
      this.weaponMesh.rotation.set(0, Math.PI / 2, 0);
      this.weaponMesh.scale.set(1, 1, 1);
      this.game.player.mesh.add(this.weaponMesh);
    } else {
      this.weaponMesh = null;
    }

    this.game.audio.playSound('equip');
  }

  nextWeapon(): void {
    const newIndex = (this.currentWeaponIndex + 1) % this.weaponOrder.length;
    this.equipWeapon(newIndex);
  }

  previousWeapon(): void {
    const newIndex = (this.currentWeaponIndex - 1 + this.weaponOrder.length) % this.weaponOrder.length;
    this.equipWeapon(newIndex);
  }

  getCurrentWeapon(): Weapon | null {
    const weaponId = this.weaponOrder[this.currentWeaponIndex];
    return this.weapons.get(weaponId) || null;
  }

  fire(): boolean {
    if (this.isReloading) return false;

    const weapon = this.getCurrentWeapon();
    if (!weapon) return false;

    const now = performance.now();
    const fireInterval = 1000 / weapon.config.fireRate;

    if (now - this.lastFireTime < fireInterval) return false;

    // Check ammo
    if (weapon.config.magazineSize > 0 && weapon.currentAmmo <= 0) {
      this.game.audio.playSound('empty_click');
      return false;
    }

    this.lastFireTime = now;

    // Consume ammo
    if (weapon.config.magazineSize > 0) {
      weapon.currentAmmo--;
    }

    // Play sound
    this.playWeaponSound(weapon.config);

    // Show muzzle flash
    this.showMuzzleFlash();

    // Apply recoil based on weapon type
    this.applyRecoil(weapon.config);

    // Perform raycast for hit detection
    this.performShot(weapon);

    return true;
  }

  private applyRecoil(config: WeaponConfig): void {
    // Get recoil values based on weapon type
    const recoilValues = this.getRecoilValues(config);

    // Apply recoil
    this.recoilAmount = recoilValues.vertical;
    this.weaponKickback = recoilValues.kickback;
    this.weaponKickUp = recoilValues.kickUp;
    this.cameraShakeIntensity = recoilValues.cameraShake;
    this.recoilRecovery = recoilValues.recovery;
  }

  private getRecoilValues(config: WeaponConfig): {
    vertical: number;
    kickback: number;
    kickUp: number;
    cameraShake: number;
    recovery: number;
  } {
    switch (config.type) {
      case 'pistol':
        return {
          vertical: config.id === 'deagle' ? 0.08 : 0.04,
          kickback: config.id === 'deagle' ? 0.12 : 0.06,
          kickUp: config.id === 'deagle' ? 0.15 : 0.08,
          cameraShake: config.id === 'deagle' ? 0.03 : 0.015,
          recovery: 8
        };
      case 'smg':
        return {
          vertical: 0.025,
          kickback: 0.04,
          kickUp: 0.05,
          cameraShake: 0.01,
          recovery: 12
        };
      case 'shotgun':
        return {
          vertical: 0.15,
          kickback: 0.2,
          kickUp: 0.25,
          cameraShake: 0.06,
          recovery: 5
        };
      case 'rifle':
        if (config.id === 'sniper') {
          return {
            vertical: 0.2,
            kickback: 0.25,
            kickUp: 0.3,
            cameraShake: 0.08,
            recovery: 3
          };
        }
        return {
          vertical: 0.05,
          kickback: 0.08,
          kickUp: 0.1,
          cameraShake: 0.02,
          recovery: 10
        };
      case 'heavy':
        if (config.id === 'minigun') {
          return {
            vertical: 0.015,
            kickback: 0.02,
            kickUp: 0.02,
            cameraShake: 0.008,
            recovery: 15
          };
        }
        if (config.id === 'flamethrower') {
          return {
            vertical: 0.01,
            kickback: 0.01,
            kickUp: 0.01,
            cameraShake: 0.005,
            recovery: 20
          };
        }
        // RPG
        return {
          vertical: 0.25,
          kickback: 0.3,
          kickUp: 0.35,
          cameraShake: 0.1,
          recovery: 2
        };
      case 'melee':
        return {
          vertical: 0,
          kickback: 0.1,
          kickUp: 0.05,
          cameraShake: 0.01,
          recovery: 6
        };
      default:
        return {
          vertical: 0.03,
          kickback: 0.05,
          kickUp: 0.06,
          cameraShake: 0.015,
          recovery: 8
        };
    }
  }

  private getMuzzleOffset(config: WeaponConfig): number {
    // Distance from weapon center to muzzle tip
    switch (config.type) {
      case 'pistol':
        return 0.35;
      case 'smg':
        return 0.45;
      case 'shotgun':
        return 0.7;
      case 'rifle':
        return config.id === 'sniper' ? 0.9 : 0.75;
      case 'heavy':
        if (config.id === 'minigun') return 0.8;
        if (config.id === 'flamethrower') return 0.6;
        return 1.0; // RPG
      default:
        return 0.3;
    }
  }

  private performShot(weapon: Weapon): void {
    const camera = this.game.camera;
    const player = this.game.player;

    // Calculate where the crosshair is pointing (target point from camera center)
    const cameraDirection = new THREE.Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);

    // Get target point - where the camera crosshair aims at max range
    const targetPoint = camera.position.clone().add(
      cameraDirection.clone().multiplyScalar(weapon.config.range)
    );

    // Get weapon muzzle position in world space
    const muzzleOffset = this.getMuzzleOffset(weapon.config);
    const muzzlePosition = new THREE.Vector3();

    if (this.weaponMesh) {
      // Get world position of weapon
      this.weaponMesh.getWorldPosition(muzzlePosition);
      // Add muzzle offset (forward direction of weapon)
      const muzzleForward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.mesh.quaternion);
      muzzlePosition.add(muzzleForward.multiplyScalar(muzzleOffset));
    } else {
      // Fallback to player position + offset
      muzzlePosition.copy(player.position);
      muzzlePosition.y += 1.1; // Chest height
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.mesh.quaternion);
      muzzlePosition.add(forward.multiplyScalar(0.5));
    }

    // Calculate shot direction from muzzle to target
    const direction = targetPoint.clone().sub(muzzlePosition).normalize();

    // Apply accuracy spread
    const spread = (1 - weapon.config.accuracy) * 0.1;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();

    const from = muzzlePosition.clone();
    const to = from.clone().add(direction.clone().multiplyScalar(weapon.config.range));

    // Create bullet tracer visual (for guns, not melee)
    if (weapon.config.type !== 'melee' && weapon.config.type !== 'thrown') {
      this.createBulletTracer(from, to, weapon.config);
    }

    // Notify AI system about gunshot for NPC reactions
    this.game.ai.onGunshotFired(from, weapon.config.range * 0.5);

    // Shotgun fires multiple pellets
    const pelletCount = weapon.config.type === 'shotgun' ? 8 : 1;
    const damagePerPellet = weapon.config.damage / pelletCount;

    for (let i = 0; i < pelletCount; i++) {
      let shotDirection = direction.clone();

      if (pelletCount > 1) {
        // Add extra spread for shotgun
        shotDirection.x += (Math.random() - 0.5) * 0.15;
        shotDirection.y += (Math.random() - 0.5) * 0.15;
        shotDirection.normalize();
      }

      const shotTo = from.clone().add(shotDirection.multiplyScalar(weapon.config.range));

      const result = this.game.physics.raycast(from, shotTo, {
        collisionFilterMask: COLLISION_GROUPS.STATIC | COLLISION_GROUPS.NPC | COLLISION_GROUPS.VEHICLE | COLLISION_GROUPS.DYNAMIC
      });

      if (result.hit && result.point && result.normal) {
        // Always check for NPCs near hit point first (most reliable method)
        // Use larger radius (3 units) to account for physics body size
        const npcId = this.game.ai.findNPCNearPoint(result.point, 3);
        if (npcId) {
          // Hit an NPC - damage them
          const fromDir = shotDirection.clone();
          this.game.ai.damageNPC(npcId, damagePerPellet, fromDir);
          this.createBloodEffect(result.point);
        } else {
          // Check for vehicle hit
          const vehicle = this.game.vehicles.findNearestVehicle(result.point, 5);
          if (vehicle) {
            this.game.vehicles.damageVehicle(vehicle.id, damagePerPellet);
            this.createImpactEffect(result.point);
          } else {
            // Hit static object - create bullet hole
            this.createBulletHole(result.point, result.normal);
            this.createImpactEffect(result.point);
          }
        }
      } else {
        // No raycast hit - still check for NPCs along the shot path
        // This handles cases where raycast misses but NPC is in line of fire
        const checkPoint = from.clone().add(shotDirection.clone().normalize().multiplyScalar(weapon.config.range * 0.5));
        const npcId = this.game.ai.findNPCNearPoint(checkPoint, 5);
        if (npcId) {
          const fromDir = shotDirection.clone();
          this.game.ai.damageNPC(npcId, damagePerPellet, fromDir);
          this.createBloodEffect(checkPoint);
        }
      }
    }

    // RPG creates explosion
    if (weapon.config.type === 'heavy') {
      const explosionPoint = to.clone();
      this.createExplosion(explosionPoint);
    }
  }

  private createBulletHole(position: THREE.Vector3, normal: THREE.Vector3): void {
    const holeGeometry = new THREE.CircleGeometry(0.03, 8);
    const holeMaterial = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });

    const hole = new THREE.Mesh(holeGeometry, holeMaterial);
    hole.position.copy(position);
    hole.position.add(normal.multiplyScalar(0.01)); // Offset slightly to avoid z-fighting
    hole.lookAt(position.clone().add(normal));

    this.game.scene.add(hole);

    // Remove after 30 seconds
    setTimeout(() => {
      this.game.scene.remove(hole);
      holeGeometry.dispose();
      holeMaterial.dispose();
    }, 30000);
  }

  private createImpactEffect(position: THREE.Vector3): void {
    // Create spark particles
    const particleCount = 5;
    const particles: THREE.Mesh[] = [];

    for (let i = 0; i < particleCount; i++) {
      const particleGeom = new THREE.SphereGeometry(0.02, 4, 4);
      const particleMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 1
      });
      const particle = new THREE.Mesh(particleGeom, particleMat);
      particle.position.copy(position);

      // Random velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      );

      this.game.scene.add(particle);
      particles.push(particle);

      // Animate particle
      let frame = 0;
      const animate = () => {
        frame++;
        particle.position.add(velocity.clone().multiplyScalar(0.02));
        velocity.y -= 0.1;
        particleMat.opacity = 1 - frame / 20;

        if (frame < 20) {
          requestAnimationFrame(animate);
        } else {
          this.game.scene.remove(particle);
          particleGeom.dispose();
          particleMat.dispose();
        }
      };
      animate();
    }
  }

  private createBloodEffect(position: THREE.Vector3): void {
    // Create blood splatter particles
    const particleCount = 8;

    for (let i = 0; i < particleCount; i++) {
      const particleGeom = new THREE.SphereGeometry(0.03, 4, 4);
      const particleMat = new THREE.MeshBasicMaterial({
        color: 0x990000,
        transparent: true,
        opacity: 1
      });
      const particle = new THREE.Mesh(particleGeom, particleMat);
      particle.position.copy(position);

      // Random outward velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2,
        (Math.random() - 0.5) * 3
      );

      this.game.scene.add(particle);

      // Animate blood particle
      let frame = 0;
      const animate = () => {
        frame++;
        particle.position.add(velocity.clone().multiplyScalar(0.015));
        velocity.y -= 0.15;
        particleMat.opacity = 1 - frame / 25;

        if (frame < 25) {
          requestAnimationFrame(animate);
        } else {
          this.game.scene.remove(particle);
          particleGeom.dispose();
          particleMat.dispose();
        }
      };
      animate();
    }
  }

  private createExplosion(position: THREE.Vector3): void {
    // Explosion light
    const light = new THREE.PointLight(0xff6600, 10, 30);
    light.position.copy(position);
    this.game.scene.add(light);

    // Explosion sphere
    const explosionGeom = new THREE.SphereGeometry(2, 16, 16);
    const explosionMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.8
    });
    const explosion = new THREE.Mesh(explosionGeom, explosionMat);
    explosion.position.copy(position);
    this.game.scene.add(explosion);

    // Animate explosion
    let frame = 0;
    const animate = () => {
      frame++;
      explosion.scale.multiplyScalar(1.1);
      explosionMat.opacity *= 0.9;
      light.intensity *= 0.85;

      if (frame < 30) {
        requestAnimationFrame(animate);
      } else {
        this.game.scene.remove(explosion);
        this.game.scene.remove(light);
        explosionGeom.dispose();
        explosionMat.dispose();
      }
    };
    animate();

    // Play explosion sound
    this.game.audio.playSound('explosion');

    // Damage nearby NPCs - explosion radius is 10 units
    const explosionRadius = 10;
    const explosionDamage = 200;
    const nearbyNPCs = this.game.ai.getNPCsInRadius(position, explosionRadius);

    nearbyNPCs.forEach(npc => {
      if (npc.isDead) return;

      const distance = npc.mesh.position.distanceTo(position);
      // Damage falls off with distance
      const damageFalloff = 1 - (distance / explosionRadius);
      const damage = explosionDamage * damageFalloff;

      const fromDir = npc.mesh.position.clone().sub(position);
      this.game.ai.damageNPC(npc.id, damage, fromDir);
    });

    // Damage player if close
    const playerDistance = this.game.player.position.distanceTo(position);
    if (playerDistance < explosionRadius) {
      const damageFalloff = 1 - (playerDistance / explosionRadius);
      const damage = explosionDamage * damageFalloff;
      this.game.player.takeDamage(damage);
    }
  }

  private showMuzzleFlash(): void {
    if (!this.muzzleFlash || !this.weaponMesh) return;

    // Position muzzle flash at weapon barrel
    this.muzzleFlash.position.copy(this.weaponMesh.position);
    this.muzzleFlash.position.z -= 0.5;
    this.muzzleFlash.intensity = 3;

    this.game.scene.add(this.muzzleFlash);

    // Fade out quickly
    setTimeout(() => {
      if (this.muzzleFlash) {
        this.muzzleFlash.intensity = 0;
        this.game.scene.remove(this.muzzleFlash);
      }
    }, 50);
  }

  reload(): void {
    const weapon = this.getCurrentWeapon();
    if (!weapon) return;
    if (weapon.config.magazineSize === 0) return; // Melee weapons
    if (this.isReloading) return;
    if (weapon.currentAmmo >= weapon.config.magazineSize) return;
    if (weapon.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.game.audio.playSound('reload');

    setTimeout(() => {
      const neededAmmo = weapon.config.magazineSize - weapon.currentAmmo;
      const ammoToLoad = Math.min(neededAmmo, weapon.reserveAmmo);

      weapon.currentAmmo += ammoToLoad;
      weapon.reserveAmmo -= ammoToLoad;
      this.isReloading = false;
    }, weapon.config.reloadTime * 1000);
  }

  private playWeaponSound(config: WeaponConfig): void {
    switch (config.type) {
      case 'pistol':
        this.game.audio.playSound('gunshot');
        break;
      case 'smg':
        this.game.audio.playSound('gunshot');
        break;
      case 'shotgun':
        this.game.audio.playSound('shotgun');
        break;
      case 'rifle':
        this.game.audio.playSound('gunshot');
        break;
      case 'heavy':
        this.game.audio.playSound('explosion');
        break;
      case 'melee':
        this.game.audio.playSound('punch');
        break;
    }
  }

  update(deltaTime: number): void {
    // Update recoil recovery
    this.updateRecoil(deltaTime);

    // Apply camera shake
    this.applyCameraShake();

    // Weapon is now attached to player mesh (GTA 5 style third-person)
    // Update weapon position based on aiming state
    if (this.weaponMesh) {
      const weapon = this.getCurrentWeapon();
      if (!weapon) return;

      // Base positions for different states
      let basePosition = new THREE.Vector3();
      let baseRotation = new THREE.Vector3();

      if (this.game.player.state.isAiming) {
        // Raise weapon when aiming - two-handed grip
        basePosition.set(0.15, 1.1, 0.35);
        baseRotation.set(0, 0, 0);
      } else {
        // Lowered position when not aiming - held at side
        if (weapon.config.type === 'rifle' || weapon.config.type === 'shotgun' || weapon.config.type === 'heavy') {
          // Two-handed weapons carried across body
          basePosition.set(0.2, 0.95, 0.1);
          baseRotation.set(0.3, Math.PI / 3, 0);
        } else if (weapon.config.type === 'melee') {
          // Melee weapons held down at side
          basePosition.set(0.32, 0.7, 0.05);
          baseRotation.set(0, 0, -0.3);
        } else {
          // Pistols/SMGs held at hip
          basePosition.set(0.28, 0.85, 0.15);
          baseRotation.set(0.1, Math.PI / 4, 0);
        }
      }

      // Apply recoil offsets to weapon position and rotation
      const recoilOffsetZ = -this.weaponKickback; // Kick backward
      const recoilOffsetY = this.weaponKickUp * 0.5; // Slight raise
      const recoilRotX = -this.weaponKickUp; // Pitch up from recoil

      // Random slight horizontal shake during recoil
      const horizontalShake = this.cameraShakeIntensity > 0.01
        ? (Math.random() - 0.5) * this.cameraShakeIntensity * 0.5
        : 0;

      this.weaponMesh.position.set(
        basePosition.x + horizontalShake,
        basePosition.y + recoilOffsetY,
        basePosition.z + recoilOffsetZ
      );
      this.weaponMesh.rotation.set(
        baseRotation.x + recoilRotX,
        baseRotation.y,
        baseRotation.z + horizontalShake * 2
      );
    }
  }

  private updateRecoil(deltaTime: number): void {
    const recoverySpeed = this.recoilRecovery * deltaTime;

    // Smoothly recover from recoil
    this.recoilAmount *= Math.max(0, 1 - recoverySpeed);
    this.weaponKickback *= Math.max(0, 1 - recoverySpeed * 1.5);
    this.weaponKickUp *= Math.max(0, 1 - recoverySpeed * 1.2);

    // Decay camera shake
    this.cameraShakeIntensity *= this.cameraShakeDecay;

    // Clamp small values to zero to prevent floating point drift
    if (this.recoilAmount < 0.001) this.recoilAmount = 0;
    if (this.weaponKickback < 0.001) this.weaponKickback = 0;
    if (this.weaponKickUp < 0.001) this.weaponKickUp = 0;
    if (this.cameraShakeIntensity < 0.0001) this.cameraShakeIntensity = 0;
  }

  private applyCameraShake(): void {
    // Disabled camera shake to prevent dizziness
    // Only weapon mesh moves, camera stays stable
  }

  private createBulletTracer(from: THREE.Vector3, to: THREE.Vector3, config: WeaponConfig): void {
    // 'from' is already the muzzle position from performShot
    const startPos = from.clone();

    // Create tracer line geometry
    const points = [startPos, to];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Tracer color based on weapon type
    let tracerColor = 0xffff00; // Default yellow
    if (config.type === 'heavy') {
      tracerColor = config.id === 'flamethrower' ? 0xff4400 : 0xff6600;
    } else if (config.type === 'shotgun') {
      tracerColor = 0xffaa00;
    } else if (config.id === 'sniper') {
      tracerColor = 0x00ffff;
    }

    const material = new THREE.LineBasicMaterial({
      color: tracerColor,
      transparent: true,
      opacity: 0.8,
      linewidth: 2
    });

    const tracer = new THREE.Line(geometry, material);
    this.game.scene.add(tracer);

    // Also create a glowing bullet mesh that travels
    const bulletGeometry = new THREE.SphereGeometry(0.02, 4, 4);
    const bulletMaterial = new THREE.MeshBasicMaterial({
      color: tracerColor,
      transparent: true,
      opacity: 1
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(startPos);
    this.game.scene.add(bullet);

    // Animate bullet traveling and tracer fading
    const direction = to.clone().sub(startPos).normalize();
    const distance = startPos.distanceTo(to);
    const bulletSpeed = 200; // units per second
    const duration = Math.min(distance / bulletSpeed, 0.3);

    let elapsed = 0;
    const animate = () => {
      elapsed += 0.016; // ~60fps
      const progress = Math.min(elapsed / duration, 1);

      // Move bullet along path
      bullet.position.copy(startPos.clone().add(direction.clone().multiplyScalar(distance * progress)));

      // Fade tracer
      material.opacity = 0.8 * (1 - progress);
      bulletMaterial.opacity = 1 - progress * 0.5;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Cleanup
        this.game.scene.remove(tracer);
        this.game.scene.remove(bullet);
        geometry.dispose();
        material.dispose();
        bulletGeometry.dispose();
        bulletMaterial.dispose();
      }
    };
    animate();

    // Create shell casing ejection for appropriate weapons
    if (config.type === 'pistol' || config.type === 'smg' || config.type === 'rifle') {
      this.createShellCasing(startPos);
    }
  }

  private createShellCasing(position: THREE.Vector3): void {
    const casingGeometry = new THREE.CylinderGeometry(0.008, 0.006, 0.025, 6);
    const casingMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      metalness: 0.8,
      roughness: 0.3
    });
    const casing = new THREE.Mesh(casingGeometry, casingMaterial);

    // Position at weapon ejection port (right side of weapon)
    const player = this.game.player;
    const ejectOffset = new THREE.Vector3(0.2, 0.05, -0.1);
    ejectOffset.applyQuaternion(player.mesh.quaternion);
    casing.position.copy(position.clone().add(ejectOffset));
    casing.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    this.game.scene.add(casing);

    // Physics-like ejection (eject to the right side of player)
    const velocity = new THREE.Vector3(
      2 + Math.random() * 2, // Eject to right
      Math.random() * 2 + 1,
      (Math.random() - 0.5) * 1
    );
    velocity.applyQuaternion(player.mesh.quaternion);

    let frame = 0;
    const gravity = -15;

    const animate = () => {
      frame++;
      velocity.y += gravity * 0.016;
      casing.position.add(velocity.clone().multiplyScalar(0.016));
      casing.rotation.x += 0.3;
      casing.rotation.z += 0.2;

      if (frame < 60 && casing.position.y > 0) {
        requestAnimationFrame(animate);
      } else {
        // Let it stay on ground briefly then remove
        setTimeout(() => {
          this.game.scene.remove(casing);
          casingGeometry.dispose();
          casingMaterial.dispose();
        }, 3000);
      }
    };
    animate();
  }

  getWeaponConfigs(): WeaponConfig[] {
    return WEAPON_CONFIGS;
  }

  /**
   * Creates a weapon instance for NPCs (doesn't add to player inventory)
   */
  createNPCWeapon(weaponId: string): Weapon | null {
    const config = WEAPON_CONFIGS.find(w => w.id === weaponId);
    if (!config) return null;

    return {
      config,
      currentAmmo: config.magazineSize,
      reserveAmmo: config.maxAmmo,
      mesh: null // NPCs don't need visible weapon mesh for now
    };
  }

  hasWeapon(weaponId: string): boolean {
    return this.weapons.has(weaponId);
  }

  addAmmo(weaponId: string, amount: number): void {
    const weapon = this.weapons.get(weaponId);
    if (weapon) {
      weapon.reserveAmmo = Math.min(weapon.reserveAmmo + amount, weapon.config.maxAmmo);
    }
  }

  dispose(): void {
    if (this.weaponMesh) {
      this.game.scene.remove(this.weaponMesh);
    }
    if (this.muzzleFlash) {
      this.game.scene.remove(this.muzzleFlash);
    }
    this.weapons.clear();
    this.weaponOrder = [];
  }
}
