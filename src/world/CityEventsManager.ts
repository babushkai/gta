import * as THREE from 'three';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';

// NYC-style city event types
type CityEventType =
  | 'street_performer'
  | 'hot_dog_vendor'
  | 'food_truck'
  | 'construction_site'
  | 'steam_vent'
  | 'car_alarm'
  | 'taxi_hail'
  | 'street_argument'
  | 'police_patrol'
  | 'ambulance_response'
  | 'fire_truck_response'
  | 'dog_walker'
  | 'jogger'
  | 'tourist'
  | 'homeless_person'
  | 'street_preacher'
  | 'delivery_truck'
  | 'garbage_truck'
  | 'subway_rumble'
  | 'pigeon_flock'
  | 'newspaper_stand';

interface CityEvent {
  id: string;
  type: CityEventType;
  position: THREE.Vector3;
  mesh: THREE.Group;
  duration: number;
  elapsed: number;
  active: boolean;
  soundId?: string;
  update?: (deltaTime: number) => void;
}

interface StreetPerformer {
  mesh: THREE.Group;
  crowdMeshes: THREE.Group[];
  animationPhase: number;
}

// Time-based event scheduling
interface ScheduledEvent {
  type: CityEventType;
  startHour: number;
  endHour: number;
  probability: number;
}

const SCHEDULED_EVENTS: ScheduledEvent[] = [
  { type: 'garbage_truck', startHour: 5, endHour: 8, probability: 0.3 },
  { type: 'jogger', startHour: 6, endHour: 9, probability: 0.5 },
  { type: 'jogger', startHour: 17, endHour: 20, probability: 0.4 },
  { type: 'hot_dog_vendor', startHour: 11, endHour: 14, probability: 0.6 },
  { type: 'hot_dog_vendor', startHour: 17, endHour: 21, probability: 0.5 },
  { type: 'street_performer', startHour: 12, endHour: 22, probability: 0.4 },
  { type: 'tourist', startHour: 10, endHour: 18, probability: 0.5 },
  { type: 'street_preacher', startHour: 10, endHour: 16, probability: 0.2 },
];

export class CityEventsManager {
  private game: Game;
  private events: Map<string, CityEvent> = new Map();
  private eventIdCounter = 0;
  private spawnTimer = 0;
  private ambientSoundTimer = 0;
  private isMobile: boolean;

  // Configuration
  private maxEvents: number;
  private spawnRadius = 80;
  private despawnRadius = 120;
  private spawnInterval = 5; // seconds between spawn attempts

  // Steam vents (permanent fixtures)
  private steamVents: THREE.Points[] = [];

  // Pigeon flocks
  private pigeonFlocks: { mesh: THREE.Group; velocity: THREE.Vector3; timer: number }[] = [];

  // Performance: throttle steam vent updates
  private steamUpdateAccumulator: number = 0;
  private steamUpdateInterval: number = 0.05; // Update steam every 50ms (20fps) instead of every frame

  constructor(game: Game) {
    this.game = game;
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      ('ontouchstart' in window) || window.innerWidth < 768;
    this.maxEvents = this.isMobile ? 8 : 20;
  }

  async initialize(): Promise<void> {
    this.createSteamVents();
    this.spawnInitialEvents();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // React to gunshots - pigeons scatter, car alarms trigger
    globalEvents.on('gunshot', (data: { position: THREE.Vector3 }) => {
      this.onGunshotNearby(data.position);
    });

    // React to vehicle crashes
    globalEvents.on('vehicle_crash', (data: { position: THREE.Vector3 }) => {
      this.onVehicleCrash(data.position);
    });
  }

  private createSteamVents(): void {
    // Classic NYC steam vents from underground
    const ventLocations = [
      new THREE.Vector3(25, 0.1, 15),
      new THREE.Vector3(-30, 0.1, 45),
      new THREE.Vector3(60, 0.1, -20),
      new THREE.Vector3(-45, 0.1, -35),
      new THREE.Vector3(10, 0.1, 80),
      new THREE.Vector3(-70, 0.1, 10),
    ];

    ventLocations.forEach(pos => {
      const steam = this.createSteamParticles(pos);
      this.steamVents.push(steam);
      this.game.scene.add(steam);
    });
  }

  private createSteamParticles(position: THREE.Vector3): THREE.Points {
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = position.x + (Math.random() - 0.5) * 0.5;
      positions[i3 + 1] = position.y + Math.random() * 3;
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 0.5;

      velocities[i3] = (Math.random() - 0.5) * 0.5;
      velocities[i3 + 1] = 1 + Math.random() * 2;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData.velocities = velocities;
    geometry.userData.basePosition = position.clone();

    const material = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 0.3,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geometry, material);
  }

  private spawnInitialEvents(): void {
    // Spawn some permanent fixtures
    this.spawnEvent('newspaper_stand');
    this.spawnEvent('newspaper_stand');

    // Spawn initial random events
    for (let i = 0; i < 5; i++) {
      this.spawnRandomEvent();
    }
  }

  private spawnRandomEvent(): void {
    if (this.events.size >= this.maxEvents) return;

    const hour = this.game.weather.getTimeOfDay();

    // Check scheduled events
    const applicableEvents = SCHEDULED_EVENTS.filter(
      e => hour >= e.startHour && hour <= e.endHour && Math.random() < e.probability
    );

    if (applicableEvents.length > 0) {
      const event = applicableEvents[Math.floor(Math.random() * applicableEvents.length)];
      this.spawnEvent(event.type);
      return;
    }

    // Random events available anytime
    const randomEvents: CityEventType[] = [
      'street_argument',
      'dog_walker',
      'car_alarm',
      'taxi_hail',
      'pigeon_flock',
      'construction_site',
      'police_patrol',
    ];

    const eventType = randomEvents[Math.floor(Math.random() * randomEvents.length)];
    this.spawnEvent(eventType);
  }

  private spawnEvent(type: CityEventType): CityEvent | null {
    const playerPos = this.game.player.position;

    // Find a spawn position
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 40;
    const position = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * distance,
      0,
      playerPos.z + Math.sin(angle) * distance
    );

    const id = `event_${this.eventIdCounter++}`;
    let mesh: THREE.Group;
    let duration = 30 + Math.random() * 60;
    let updateFn: ((dt: number) => void) | undefined;

    switch (type) {
      case 'street_performer':
        mesh = this.createStreetPerformerScene(position);
        duration = 120;
        updateFn = this.createPerformerAnimation(mesh);
        break;

      case 'hot_dog_vendor':
        mesh = this.createHotDogCart(position);
        duration = 180;
        break;

      case 'food_truck':
        mesh = this.createFoodTruck(position);
        duration = 300;
        break;

      case 'construction_site':
        mesh = this.createConstructionSite(position);
        duration = 600;
        updateFn = this.createConstructionAnimation(mesh);
        break;

      case 'car_alarm':
        mesh = this.createCarAlarmMarker(position);
        duration = 15 + Math.random() * 30;
        this.game.audio.playSound('car_alarm', { volume: 0.4 });
        break;

      case 'taxi_hail':
        mesh = this.createTaxiHailer(position);
        duration = 10 + Math.random() * 15;
        updateFn = this.createTaxiHailAnimation(mesh);
        break;

      case 'street_argument':
        mesh = this.createStreetArgument(position);
        duration = 20 + Math.random() * 30;
        updateFn = this.createArgumentAnimation(mesh);
        break;

      case 'police_patrol':
        mesh = this.createPolicePatrol(position);
        duration = 60;
        break;

      case 'ambulance_response':
        mesh = this.createEmergencyVehicle(position, 'ambulance');
        duration = 30;
        this.game.audio.playSound('ambulance_siren', { volume: 0.5 });
        break;

      case 'fire_truck_response':
        mesh = this.createEmergencyVehicle(position, 'firetruck');
        duration = 30;
        this.game.audio.playSound('fire_siren', { volume: 0.5 });
        break;

      case 'dog_walker':
        mesh = this.createDogWalker(position);
        duration = 45;
        updateFn = this.createWalkingAnimation(mesh, 2);
        break;

      case 'jogger':
        mesh = this.createJogger(position);
        duration = 30;
        updateFn = this.createWalkingAnimation(mesh, 5);
        break;

      case 'tourist':
        mesh = this.createTourist(position);
        duration = 60;
        updateFn = this.createTouristAnimation(mesh);
        break;

      case 'homeless_person':
        mesh = this.createHomelessPerson(position);
        duration = 300;
        break;

      case 'street_preacher':
        mesh = this.createStreetPreacher(position);
        duration = 120;
        updateFn = this.createPreacherAnimation(mesh);
        break;

      case 'garbage_truck':
        mesh = this.createGarbageTruck(position);
        duration = 45;
        updateFn = this.createWalkingAnimation(mesh, 3);
        break;

      case 'pigeon_flock':
        mesh = this.createPigeonFlock(position);
        duration = 60;
        updateFn = this.createPigeonAnimation(mesh);
        break;

      case 'newspaper_stand':
        mesh = this.createNewspaperStand(position);
        duration = 9999; // Permanent
        break;

      case 'subway_rumble':
        mesh = new THREE.Group(); // Invisible - sound only
        duration = 5;
        this.playSubwayRumble(position);
        break;

      default:
        return null;
    }

    this.game.scene.add(mesh);

    const event: CityEvent = {
      id,
      type,
      position,
      mesh,
      duration,
      elapsed: 0,
      active: true,
      update: updateFn,
    };

    this.events.set(id, event);
    return event;
  }

  // ==================== VISUAL CREATORS ====================

  private createStreetPerformerScene(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Performer
    const performer = this.createHumanFigure(0xff6600);
    performer.position.y = 0.1;
    group.add(performer);

    // Guitar/instrument
    const guitar = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.4, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    guitar.position.set(0.3, 1.1, 0.15);
    guitar.rotation.z = 0.3;
    group.add(guitar);

    // Tip hat/bucket
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.12, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    bucket.position.set(0.6, 0.05, 0.5);
    group.add(bucket);

    // Crowd of watchers (3-5 people)
    const crowdCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < crowdCount; i++) {
      const angle = (i / crowdCount) * Math.PI - Math.PI / 4;
      const dist = 2 + Math.random() * 1;
      const watcher = this.createHumanFigure(this.randomCivilianColor());
      watcher.position.set(
        Math.cos(angle) * dist,
        0,
        Math.sin(angle) * dist + 1.5
      );
      watcher.lookAt(new THREE.Vector3(0, 1, 0));
      group.add(watcher);
    }

    return group;
  }

  private createHotDogCart(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Cart body
    const cartBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xcc0000 })
    );
    cartBody.position.y = 0.8;
    group.add(cartBody);

    // Umbrella
    const umbrella = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    umbrella.position.y = 2.2;
    group.add(umbrella);

    // Umbrella pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    pole.position.y = 1.5;
    group.add(pole);

    // Wheels
    [-0.4, 0.4].forEach(x => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.15, 0);
      group.add(wheel);
    });

    // Vendor
    const vendor = this.createHumanFigure(0xffffff);
    vendor.position.set(-0.8, 0, 0);
    group.add(vendor);

    // "HOT DOGS" sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.2, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    sign.position.set(0, 1.3, 0.35);
    group.add(sign);

    return group;
  }

  private createFoodTruck(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Truck body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x4488ff })
    );
    body.position.y = 1.2;
    group.add(body);

    // Service window
    const window = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.8, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    window.position.set(0, 1.5, 0.95);
    group.add(window);

    // Awning
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff6600 })
    );
    awning.position.set(0, 2.3, 1.3);
    awning.rotation.x = -0.2;
    group.add(awning);

    // Customers in line
    for (let i = 0; i < 3; i++) {
      const customer = this.createHumanFigure(this.randomCivilianColor());
      customer.position.set(0, 0, 2 + i * 0.8);
      group.add(customer);
    }

    return group;
  }

  private createConstructionSite(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Barriers
    for (let i = 0; i < 4; i++) {
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xff6600 })
      );
      const angle = (i / 4) * Math.PI * 2;
      barrier.position.set(Math.cos(angle) * 3, 0.5, Math.sin(angle) * 3);
      barrier.lookAt(new THREE.Vector3(0, 0.5, 0));
      group.add(barrier);
    }

    // Warning light
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xff4400,
        emissiveIntensity: 0.5,
      })
    );
    light.position.set(0, 1.2, 3);
    light.name = 'warningLight';
    group.add(light);

    // Construction worker
    const worker = this.createHumanFigure(0xff6600);
    worker.position.set(0, 0, 0);
    group.add(worker);

    // Hard hat
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    hat.position.set(0, 1.85, 0);
    hat.scale.set(1, 0.5, 1);
    group.add(hat);

    // Jackhammer
    const jackhammer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x444444 })
    );
    jackhammer.position.set(0.3, 0.6, 0.2);
    jackhammer.name = 'jackhammer';
    group.add(jackhammer);

    return group;
  }

  private createCarAlarmMarker(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Just a visual indicator (car with blinking lights)
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    car.position.y = 0.5;
    group.add(car);

    // Blinking lights
    const leftLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1,
      })
    );
    leftLight.position.set(-0.9, 0.8, 1.8);
    leftLight.name = 'blinkLight';
    group.add(leftLight);

    const rightLight = leftLight.clone();
    rightLight.position.set(0.9, 0.8, 1.8);
    rightLight.name = 'blinkLight2';
    group.add(rightLight);

    return group;
  }

  private createTaxiHailer(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    const person = this.createHumanFigure(this.randomCivilianColor());
    group.add(person);

    // Raised arm
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, 0.4, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xe0b090 })
    );
    arm.position.set(0.25, 1.6, 0.1);
    arm.rotation.z = -0.8;
    arm.name = 'raisedArm';
    group.add(arm);

    // Briefcase
    const briefcase = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.4, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a })
    );
    briefcase.position.set(-0.3, 0.6, 0);
    group.add(briefcase);

    return group;
  }

  private createStreetArgument(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Two people facing each other
    const person1 = this.createHumanFigure(this.randomCivilianColor());
    person1.position.set(-0.6, 0, 0);
    person1.rotation.y = Math.PI / 6;
    group.add(person1);

    const person2 = this.createHumanFigure(this.randomCivilianColor());
    person2.position.set(0.6, 0, 0);
    person2.rotation.y = -Math.PI / 6;
    group.add(person2);

    // Bystander
    if (Math.random() > 0.5) {
      const bystander = this.createHumanFigure(this.randomCivilianColor());
      bystander.position.set(0, 0, 1.5);
      group.add(bystander);
    }

    return group;
  }

  private createPolicePatrol(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Two cops
    const cop1 = this.createHumanFigure(0x2233aa);
    cop1.position.set(-0.4, 0, 0);
    group.add(cop1);

    // Police hat
    const hat1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x222244 })
    );
    hat1.position.set(-0.4, 1.78, 0);
    group.add(hat1);

    const cop2 = this.createHumanFigure(0x2233aa);
    cop2.position.set(0.4, 0, 0);
    group.add(cop2);

    const hat2 = hat1.clone();
    hat2.position.set(0.4, 1.78, 0);
    group.add(hat2);

    return group;
  }

  private createEmergencyVehicle(position: THREE.Vector3, type: 'ambulance' | 'firetruck'): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    const color = type === 'ambulance' ? 0xffffff : 0xcc0000;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.8, 5),
      new THREE.MeshStandardMaterial({ color })
    );
    body.position.y = 1.1;
    group.add(body);

    // Emergency lights
    const lightBar = new THREE.Group();
    const redLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1,
      })
    );
    redLight.position.x = -0.4;
    redLight.name = 'redLight';
    lightBar.add(redLight);

    const blueLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x0000ff,
        emissive: 0x0000ff,
        emissiveIntensity: 1,
      })
    );
    blueLight.position.x = 0.4;
    blueLight.name = 'blueLight';
    lightBar.add(blueLight);

    lightBar.position.y = 2.1;
    group.add(lightBar);

    return group;
  }

  private createDogWalker(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Person
    const walker = this.createHumanFigure(this.randomCivilianColor());
    group.add(walker);

    // Dog
    const dogBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    dogBody.position.set(0.8, 0.25, 0.5);
    group.add(dogBody);

    const dogHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    dogHead.position.set(0.8, 0.35, 0.8);
    group.add(dogHead);

    // Leash
    const leashGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.25, 0.9, 0),
      new THREE.Vector3(0.8, 0.35, 0.5),
    ]);
    const leash = new THREE.Line(
      leashGeom,
      new THREE.LineBasicMaterial({ color: 0x8b4513 })
    );
    group.add(leash);

    return group;
  }

  private createJogger(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Athletic clothes
    const jogger = this.createHumanFigure(0x00ccff);
    group.add(jogger);

    // Headphones
    const headphone = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.02, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    headphone.position.y = 1.72;
    headphone.rotation.x = Math.PI / 2;
    group.add(headphone);

    return group;
  }

  private createTourist(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Bright tourist clothes
    const tourist = this.createHumanFigure(0xff69b4);
    group.add(tourist);

    // Camera
    const camera = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    camera.position.set(0.3, 1.3, 0.2);
    camera.name = 'camera';
    group.add(camera);

    // Fanny pack
    const fannyPack = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x00aa00 })
    );
    fannyPack.position.set(0, 0.95, 0.2);
    group.add(fannyPack);

    // Baseball cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    cap.position.y = 1.78;
    group.add(cap);

    return group;
  }

  private createHomelessPerson(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Sitting figure
    const person = this.createHumanFigure(0x666655);
    person.scale.y = 0.6;
    person.position.y = 0.2;
    group.add(person);

    // Cardboard sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xaa8855 })
    );
    sign.position.set(0, 0.3, 0.4);
    sign.rotation.x = -0.3;
    group.add(sign);

    // Shopping cart
    const cart = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        wireframe: true,
      })
    );
    cart.position.set(0.8, 0.3, 0);
    group.add(cart);

    return group;
  }

  private createStreetPreacher(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Preacher in suit
    const preacher = this.createHumanFigure(0x222222);
    group.add(preacher);

    // Megaphone
    const megaphone = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    megaphone.position.set(0.35, 1.5, 0.2);
    megaphone.rotation.z = -0.3;
    megaphone.rotation.x = Math.PI / 2;
    group.add(megaphone);

    // Sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    sign.position.set(-0.6, 1.2, 0);
    group.add(sign);

    return group;
  }

  private createGarbageTruck(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Truck cab
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.8, 2),
      new THREE.MeshStandardMaterial({ color: 0x228822 })
    );
    cab.position.set(0, 1.1, 2);
    group.add(cab);

    // Truck body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2, 4),
      new THREE.MeshStandardMaterial({ color: 0x228822 })
    );
    body.position.set(0, 1.2, -0.5);
    group.add(body);

    // Garbage workers
    const worker1 = this.createHumanFigure(0x88ff88);
    worker1.position.set(-1.5, 0, 0);
    group.add(worker1);

    const worker2 = this.createHumanFigure(0x88ff88);
    worker2.position.set(1.5, 0, -1);
    group.add(worker2);

    return group;
  }

  private createPigeonFlock(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    const pigeonCount = 5 + Math.floor(Math.random() * 10);
    for (let i = 0; i < pigeonCount; i++) {
      const pigeon = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x666666 })
      );
      pigeon.position.set(
        (Math.random() - 0.5) * 3,
        0.08,
        (Math.random() - 0.5) * 3
      );
      pigeon.scale.set(1, 0.7, 1.5);
      group.add(pigeon);
    }

    return group;
  }

  private createNewspaperStand(position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    // Box structure
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.8, 1),
      new THREE.MeshStandardMaterial({ color: 0x00aa00 })
    );
    box.position.y = 0.9;
    group.add(box);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x006600 })
    );
    roof.position.y = 1.9;
    group.add(roof);

    // Magazines display
    const display = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.5, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    display.position.set(0, 1.3, 0.55);
    group.add(display);

    return group;
  }

  private createHumanFigure(shirtColor: number): THREE.Group {
    const group = new THREE.Group();

    const skinTones = [0xe0b090, 0xd4a574, 0xc68642, 0x8d5524, 0xffdbac];
    const skinColor = skinTones[Math.floor(Math.random() * skinTones.length)];

    const skinMaterial = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.9 });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), skinMaterial);
    head.position.y = 1.65;
    group.add(head);

    // Body
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.18), shirtMaterial);
    chest.position.y = 1.2;
    group.add(chest);

    // Legs
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), pantsMaterial);
    const leftLeg = leg.clone();
    leftLeg.position.set(-0.1, 0.5, 0);
    group.add(leftLeg);

    const rightLeg = leg.clone();
    rightLeg.position.set(0.1, 0.5, 0);
    group.add(rightLeg);

    // Arms
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.35, 4, 8), skinMaterial);
    const leftArm = arm.clone();
    leftArm.position.set(-0.25, 1.15, 0);
    group.add(leftArm);

    const rightArm = arm.clone();
    rightArm.position.set(0.25, 1.15, 0);
    group.add(rightArm);

    return group;
  }

  private randomCivilianColor(): number {
    const colors = [
      0x2244aa, 0x44aa44, 0xaa4444, 0x888888,
      0x224422, 0xaaaa44, 0x666666, 0x442244,
      0x886644, 0x448888, 0xcc6600, 0x6600cc,
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // ==================== ANIMATIONS ====================

  private createPerformerAnimation(mesh: THREE.Group): (dt: number) => void {
    let phase = 0;
    return (deltaTime: number) => {
      phase += deltaTime * 3;
      // Slight bobbing motion while playing
      const performer = mesh.children[0];
      if (performer) {
        performer.position.y = 0.1 + Math.sin(phase) * 0.05;
        performer.rotation.y = Math.sin(phase * 0.5) * 0.1;
      }
    };
  }

  private createConstructionAnimation(mesh: THREE.Group): (dt: number) => void {
    let phase = 0;
    return (deltaTime: number) => {
      phase += deltaTime * 20;

      // Jackhammer vibration
      const jackhammer = mesh.getObjectByName('jackhammer');
      if (jackhammer) {
        jackhammer.position.y = 0.6 + Math.sin(phase) * 0.02;
      }

      // Warning light flash
      const light = mesh.getObjectByName('warningLight') as THREE.Mesh;
      if (light && light.material instanceof THREE.MeshStandardMaterial) {
        light.material.emissiveIntensity = Math.sin(phase * 0.3) > 0 ? 1 : 0.2;
      }
    };
  }

  private createTaxiHailAnimation(mesh: THREE.Group): (dt: number) => void {
    let phase = 0;
    return (deltaTime: number) => {
      phase += deltaTime * 4;
      const arm = mesh.getObjectByName('raisedArm');
      if (arm) {
        arm.rotation.z = -0.8 + Math.sin(phase) * 0.2;
      }
    };
  }

  private createArgumentAnimation(mesh: THREE.Group): (dt: number) => void {
    let phase = 0;
    return (deltaTime: number) => {
      phase += deltaTime * 5;

      // People gesturing
      mesh.children[0].rotation.y = Math.PI / 6 + Math.sin(phase) * 0.15;
      mesh.children[1].rotation.y = -Math.PI / 6 - Math.sin(phase + 1) * 0.15;

      // Occasional head shake
      mesh.children[0].children[0]?.position.set(
        0,
        1.65,
        Math.sin(phase * 2) * 0.02
      );
    };
  }

  private createWalkingAnimation(mesh: THREE.Group, speed: number): (dt: number) => void {
    const direction = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    let phase = 0;

    return (deltaTime: number) => {
      phase += deltaTime * 5;

      // Move along direction
      mesh.position.add(direction.clone().multiplyScalar(speed * deltaTime));

      // Walking bob
      mesh.position.y = Math.abs(Math.sin(phase)) * 0.05;

      // Face direction
      mesh.rotation.y = Math.atan2(direction.x, direction.z);
    };
  }

  private createTouristAnimation(mesh: THREE.Group): (dt: number) => void {
    let phase = 0;
    let photoTimer = 0;
    return (deltaTime: number) => {
      phase += deltaTime;
      photoTimer += deltaTime;

      // Occasionally take a photo
      if (photoTimer > 5) {
        photoTimer = 0;
        const camera = mesh.getObjectByName('camera');
        if (camera) {
          // Flash effect - just raise camera
          camera.position.y = 1.5;
          setTimeout(() => {
            camera.position.y = 1.3;
          }, 500);
        }
      }

      // Look around
      mesh.rotation.y = Math.sin(phase * 0.3) * 0.5;
    };
  }

  private createPreacherAnimation(mesh: THREE.Group): (dt: number) => void {
    let phase = 0;
    return (deltaTime: number) => {
      phase += deltaTime * 3;
      // Animated gesturing
      mesh.children[0].rotation.y = Math.sin(phase) * 0.2;
      mesh.children[0].position.y = Math.sin(phase * 2) * 0.02;
    };
  }

  private createPigeonAnimation(mesh: THREE.Group): (dt: number) => void {
    let scattered = false;
    return (_deltaTime: number) => {
      if (!scattered) {
        // Random pecking motion
        mesh.children.forEach((pigeon, i) => {
          pigeon.rotation.x = Math.sin(Date.now() * 0.01 + i) * 0.1;
        });
      }
    };
  }

  // ==================== SOUND EFFECTS ====================

  private playSubwayRumble(position: THREE.Vector3): void {
    // Play low rumble sound at position
    this.game.audio.playSound('subway_rumble', {
      volume: 0.3,
      // Would need 3D audio positioning here
    });
  }

  private onGunshotNearby(position: THREE.Vector3): void {
    // Scatter pigeons
    this.events.forEach(event => {
      if (event.type === 'pigeon_flock') {
        const distance = event.position.distanceTo(position);
        if (distance < 30) {
          this.scatterPigeons(event);
        }
      }
    });

    // Trigger car alarms
    if (Math.random() < 0.3) {
      this.spawnEvent('car_alarm');
    }
  }

  private scatterPigeons(event: CityEvent): void {
    // Animate pigeons flying away
    event.mesh.children.forEach((pigeon, i) => {
      const flyDirection = new THREE.Vector3(
        Math.random() - 0.5,
        0.5 + Math.random() * 0.5,
        Math.random() - 0.5
      ).normalize();

      let frame = 0;
      const animate = () => {
        frame++;
        pigeon.position.add(flyDirection.clone().multiplyScalar(0.3));
        pigeon.rotation.x = Math.sin(frame * 0.5) * 0.3;

        if (frame < 60) {
          requestAnimationFrame(animate);
        }
      };
      setTimeout(() => animate(), i * 50);
    });

    // Remove event after scatter
    setTimeout(() => {
      this.removeEvent(event.id);
    }, 3000);
  }

  private onVehicleCrash(position: THREE.Vector3): void {
    // Chance to spawn emergency response
    if (Math.random() < 0.4) {
      setTimeout(() => {
        const angle = Math.random() * Math.PI * 2;
        const spawnPos = position.clone();
        spawnPos.x += Math.cos(angle) * 60;
        spawnPos.z += Math.sin(angle) * 60;

        const emergencyType = Math.random() > 0.5 ? 'ambulance_response' : 'fire_truck_response';
        this.spawnEvent(emergencyType);
      }, 5000 + Math.random() * 10000);
    }
  }

  // ==================== UPDATE LOOP ====================

  update(deltaTime: number): void {
    // Throttle steam vent updates for performance
    this.steamUpdateAccumulator += deltaTime;
    if (this.steamUpdateAccumulator >= this.steamUpdateInterval) {
      this.updateSteamVents(this.steamUpdateAccumulator);
      this.steamUpdateAccumulator = 0;
    }

    // Update active events
    this.events.forEach((event, id) => {
      event.elapsed += deltaTime;

      // Run event update function
      if (event.update) {
        event.update(deltaTime);
      }

      // Update emergency vehicle lights
      if (event.type === 'ambulance_response' || event.type === 'fire_truck_response') {
        this.updateEmergencyLights(event, deltaTime);
      }

      // Update car alarm blinking
      if (event.type === 'car_alarm') {
        this.updateCarAlarm(event, deltaTime);
      }

      // Check expiration
      if (event.elapsed >= event.duration) {
        this.removeEvent(id);
      }
    });

    // Spawn new events periodically
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnRandomEvent();
    }

    // Play ambient sounds
    this.ambientSoundTimer += deltaTime;
    if (this.ambientSoundTimer >= 15 + Math.random() * 30) {
      this.ambientSoundTimer = 0;
      this.playAmbientSound();
    }

    // Despawn distant events
    this.despawnDistantEvents();
  }

  private updateSteamVents(deltaTime: number): void {
    this.steamVents.forEach(steam => {
      const positions = steam.geometry.attributes.position.array as Float32Array;
      const velocities = steam.geometry.userData.velocities as Float32Array;
      const basePos = steam.geometry.userData.basePosition as THREE.Vector3;

      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;

        // Apply velocity
        positions[i3] += velocities[i3] * deltaTime;
        positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
        positions[i3 + 2] += velocities[i3 + 2] * deltaTime;

        // Reset particles that go too high
        if (positions[i3 + 1] > 4) {
          positions[i3] = basePos.x + (Math.random() - 0.5) * 0.5;
          positions[i3 + 1] = basePos.y;
          positions[i3 + 2] = basePos.z + (Math.random() - 0.5) * 0.5;
        }
      }

      steam.geometry.attributes.position.needsUpdate = true;
    });
  }

  private updateEmergencyLights(event: CityEvent, deltaTime: number): void {
    const redLight = event.mesh.getObjectByName('redLight') as THREE.Mesh;
    const blueLight = event.mesh.getObjectByName('blueLight') as THREE.Mesh;

    if (redLight && blueLight) {
      const flash = Math.sin(event.elapsed * 15) > 0;
      (redLight.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 1 : 0.2;
      (blueLight.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 0.2 : 1;
    }
  }

  private updateCarAlarm(event: CityEvent, _deltaTime: number): void {
    const blinkLight = event.mesh.getObjectByName('blinkLight') as THREE.Mesh;
    const blinkLight2 = event.mesh.getObjectByName('blinkLight2') as THREE.Mesh;

    if (blinkLight) {
      const flash = Math.sin(event.elapsed * 10) > 0;
      (blinkLight.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 1 : 0;
      if (blinkLight2) {
        (blinkLight2.material as THREE.MeshStandardMaterial).emissiveIntensity = flash ? 1 : 0;
      }
    }
  }

  private playAmbientSound(): void {
    const sounds = [
      { id: 'car_horn', weight: 0.3 },
      { id: 'distant_siren', weight: 0.15 },
      { id: 'subway_rumble', weight: 0.2 },
      { id: 'crowd_chatter', weight: 0.25 },
      { id: 'dog_bark', weight: 0.1 },
    ];

    const total = sounds.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * total;

    for (const sound of sounds) {
      random -= sound.weight;
      if (random <= 0) {
        this.game.audio.playSound(sound.id, { volume: 0.2 + Math.random() * 0.2 });
        break;
      }
    }
  }

  private despawnDistantEvents(): void {
    const playerPos = this.game.player.position;

    this.events.forEach((event, id) => {
      const distance = event.position.distanceTo(playerPos);
      if (distance > this.despawnRadius) {
        this.removeEvent(id);
      }
    });
  }

  private removeEvent(id: string): void {
    const event = this.events.get(id);
    if (event) {
      this.game.scene.remove(event.mesh);
      this.events.delete(id);
    }
  }

  dispose(): void {
    this.events.forEach((_, id) => this.removeEvent(id));
    this.steamVents.forEach(steam => this.game.scene.remove(steam));
    this.steamVents = [];
  }
}
