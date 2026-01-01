import * as THREE from 'three';
import gsap from 'gsap';
import { MissionConfig, MissionObjective, MissionState, ObjectiveType } from '@/types';
import { Game } from '@/core/Game';
import { globalEvents } from '@/core/EventEmitter';

const MISSIONS: MissionConfig[] = [
  {
    id: 'intro_mission',
    title: 'Welcome to the City',
    description: 'Get to know the neighborhood',
    giver: 'Contact',
    location: new THREE.Vector3(0, 0, 0),
    reward: { money: 500 },
    objectives: [
      {
        id: 'obj_1',
        type: 'goto',
        description: 'Go to the marked location',
        location: new THREE.Vector3(30, 0, 30),
        completed: false,
        optional: false
      },
      {
        id: 'obj_2',
        type: 'collect',
        description: 'Pick up the package',
        location: new THREE.Vector3(30, 1, 30),
        completed: false,
        optional: false
      },
      {
        id: 'obj_3',
        type: 'goto',
        description: 'Return to the starting point',
        location: new THREE.Vector3(0, 0, 0),
        completed: false,
        optional: false
      }
    ],
    prerequisites: [],
    failConditions: [{ type: 'death' }]
  },
  {
    id: 'first_wheels',
    title: 'First Wheels',
    description: 'Steal a car and bring it to the garage',
    giver: 'Mechanic',
    location: new THREE.Vector3(50, 0, 0),
    reward: { money: 1000 },
    objectives: [
      {
        id: 'obj_1',
        type: 'steal',
        description: 'Steal any vehicle',
        completed: false,
        optional: false
      },
      {
        id: 'obj_2',
        type: 'goto',
        description: 'Bring the vehicle to the garage',
        location: new THREE.Vector3(60, 0, 60),
        completed: false,
        optional: false
      }
    ],
    prerequisites: ['intro_mission'],
    failConditions: [{ type: 'death' }, { type: 'vehicle_destroyed' }]
  },
  {
    id: 'gang_trouble',
    title: 'Gang Trouble',
    description: 'Deal with the gang members causing trouble',
    giver: 'Local Boss',
    location: new THREE.Vector3(-50, 0, 50),
    reward: { money: 2500, weapons: ['pistol'] },
    objectives: [
      {
        id: 'obj_1',
        type: 'goto',
        description: 'Go to the gang hideout',
        location: new THREE.Vector3(-80, 0, 80),
        completed: false,
        optional: false
      },
      {
        id: 'obj_2',
        type: 'kill',
        description: 'Eliminate the gang members',
        count: 5,
        currentCount: 0,
        completed: false,
        optional: false
      },
      {
        id: 'obj_3',
        type: 'escape',
        description: 'Lose the heat',
        completed: false,
        optional: false
      }
    ],
    prerequisites: ['first_wheels'],
    timeLimit: 300,
    failConditions: [{ type: 'death' }, { type: 'time' }]
  },
  {
    id: 'big_score',
    title: 'The Big Score',
    description: 'Pull off the heist of the century',
    giver: 'Mastermind',
    location: new THREE.Vector3(100, 0, -50),
    reward: { money: 10000, unlocks: ['safehouse_2'] },
    objectives: [
      {
        id: 'obj_1',
        type: 'goto',
        description: 'Meet the crew at the bank',
        location: new THREE.Vector3(120, 0, -80),
        completed: false,
        optional: false
      },
      {
        id: 'obj_2',
        type: 'collect',
        description: 'Collect the money bags',
        count: 4,
        currentCount: 0,
        completed: false,
        optional: false
      },
      {
        id: 'obj_3',
        type: 'survive',
        description: 'Survive the police assault',
        completed: false,
        optional: false
      },
      {
        id: 'obj_4',
        type: 'escape',
        description: 'Escape to the safehouse',
        location: new THREE.Vector3(-100, 0, -100),
        completed: false,
        optional: false
      }
    ],
    prerequisites: ['gang_trouble'],
    timeLimit: 600,
    failConditions: [{ type: 'death' }, { type: 'time' }]
  }
];

interface MissionMarker {
  mesh: THREE.Mesh;
  type: 'start' | 'objective' | 'complete';
  missionId?: string;
  objectiveId?: string;
}

export class MissionManager {
  private game: Game;
  private state: MissionState;
  private missionMarkers: Map<string, MissionMarker> = new Map();
  private currentObjectiveIndex: number = 0;
  private missionTimer: number = 0;
  private checkpointTriggers: Map<string, THREE.Mesh> = new Map();

  constructor(game: Game) {
    this.game = game;
    this.state = {
      currentMission: null,
      completedMissions: [],
      failedMissions: [],
      activeMissions: new Map()
    };
  }

  async initialize(): Promise<void> {
    this.createMissionStartMarkers();
    this.setupEventListeners();
  }

  private createMissionStartMarkers(): void {
    MISSIONS.forEach(mission => {
      if (this.canStartMission(mission.id)) {
        this.createMarker(mission.id, mission.location, 'start');
      }
    });
  }

  private createMarker(
    id: string,
    position: THREE.Vector3,
    type: MissionMarker['type']
  ): void {
    const colors: Record<MissionMarker['type'], number> = {
      start: 0xffff00,
      objective: 0x00ffff,
      complete: 0x00ff00
    };

    const geometry = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 32);
    const material = new THREE.MeshBasicMaterial({
      color: colors[type],
      transparent: true,
      opacity: 0.6
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.y = 0.1;

    const arrowGeometry = new THREE.ConeGeometry(0.5, 2, 8);
    const arrow = new THREE.Mesh(arrowGeometry, material.clone());
    arrow.position.y = 3;
    arrow.rotation.x = Math.PI;
    mesh.add(arrow);

    gsap.to(arrow.position, {
      y: 4,
      duration: 1,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });

    gsap.to(mesh.rotation, {
      y: Math.PI * 2,
      duration: 4,
      repeat: -1,
      ease: 'none'
    });

    this.game.scene.add(mesh);
    this.missionMarkers.set(id, { mesh, type });
  }

  private setupEventListeners(): void {
    globalEvents.on('npc_killed', (data: { type: string }) => {
      if (this.state.currentMission) {
        this.checkKillObjective(data.type);
      }
    });

    globalEvents.on('vehicle_enter', () => {
      if (this.state.currentMission) {
        this.checkStealObjective();
      }
    });

    globalEvents.on('pickup_collected', (data: { type: string }) => {
      if (this.state.currentMission) {
        this.checkCollectObjective(data.type);
      }
    });
  }

  update(deltaTime: number): void {
    if (!this.state.currentMission) {
      this.checkMissionStartTriggers();
      return;
    }

    this.missionTimer += deltaTime;

    if (this.state.currentMission.timeLimit) {
      const remaining = this.state.currentMission.timeLimit - this.missionTimer;
      if (remaining <= 0) {
        this.failCurrentMission('time');
        return;
      }
    }

    this.checkObjectiveProgress();
    this.checkFailConditions();
  }

  private checkMissionStartTriggers(): void {
    const playerPos = this.game.player.position;

    this.missionMarkers.forEach((marker, id) => {
      if (marker.type !== 'start') return;

      const distance = playerPos.distanceTo(marker.mesh.position);
      if (distance < 2) {
        const mission = MISSIONS.find(m => m.id === id);
        if (mission && this.canStartMission(mission.id)) {
          this.startMission(mission);
        }
      }
    });
  }

  startMission(mission: MissionConfig): void {
    this.state.currentMission = { ...mission };
    this.currentObjectiveIndex = 0;
    this.missionTimer = 0;

    const startMarker = this.missionMarkers.get(mission.id);
    if (startMarker) {
      this.game.scene.remove(startMarker.mesh);
      this.missionMarkers.delete(mission.id);
    }

    this.game.ui.showMissionStart(mission.title, mission.description);
    this.game.audio.playSound('mission_start');

    this.updateObjectiveMarker();

    globalEvents.emit('mission_start', { missionId: mission.id });
  }

  private updateObjectiveMarker(): void {
    if (!this.state.currentMission) return;

    this.checkpointTriggers.forEach(mesh => {
      this.game.scene.remove(mesh);
    });
    this.checkpointTriggers.clear();

    const objectives = this.state.currentMission.objectives;
    const currentObjective = objectives[this.currentObjectiveIndex];

    if (!currentObjective || currentObjective.completed) return;

    this.game.ui.updateObjective(currentObjective.description);

    if (currentObjective.location) {
      this.createMarker(
        `objective_${currentObjective.id}`,
        currentObjective.location,
        'objective'
      );
    }
  }

  private checkObjectiveProgress(): void {
    if (!this.state.currentMission) return;

    const objectives = this.state.currentMission.objectives;
    const currentObjective = objectives[this.currentObjectiveIndex];

    if (!currentObjective || currentObjective.completed) return;

    switch (currentObjective.type) {
      case 'goto':
        this.checkGotoObjective(currentObjective);
        break;
      case 'escape':
        this.checkEscapeObjective(currentObjective);
        break;
      case 'survive':
        this.checkSurviveObjective(currentObjective);
        break;
    }
  }

  private checkGotoObjective(objective: MissionObjective): void {
    if (!objective.location) return;

    const distance = this.game.player.position.distanceTo(objective.location);
    if (distance < 3) {
      this.completeObjective(objective);
    }
  }

  private checkEscapeObjective(objective: MissionObjective): void {
    if (this.game.player.stats.wantedLevel === 0) {
      this.completeObjective(objective);
    }
  }

  private checkSurviveObjective(objective: MissionObjective): void {
    if (this.missionTimer > 60) {
      this.completeObjective(objective);
    }
  }

  private checkKillObjective(npcType: string): void {
    if (!this.state.currentMission) return;

    const objectives = this.state.currentMission.objectives;
    const killObjective = objectives.find(
      o => o.type === 'kill' && !o.completed
    );

    if (killObjective && killObjective.count !== undefined) {
      killObjective.currentCount = (killObjective.currentCount || 0) + 1;

      if (killObjective.currentCount >= killObjective.count) {
        this.completeObjective(killObjective);
      } else {
        this.game.ui.updateObjective(
          `${killObjective.description} (${killObjective.currentCount}/${killObjective.count})`
        );
      }
    }
  }

  private checkStealObjective(): void {
    if (!this.state.currentMission) return;

    const objectives = this.state.currentMission.objectives;
    const stealObjective = objectives.find(
      o => o.type === 'steal' && !o.completed
    );

    if (stealObjective) {
      this.completeObjective(stealObjective);
    }
  }

  private checkCollectObjective(pickupType: string): void {
    if (!this.state.currentMission) return;

    const objectives = this.state.currentMission.objectives;
    const collectObjective = objectives.find(
      o => o.type === 'collect' && !o.completed
    );

    if (collectObjective) {
      if (collectObjective.count !== undefined) {
        collectObjective.currentCount = (collectObjective.currentCount || 0) + 1;

        if (collectObjective.currentCount >= collectObjective.count) {
          this.completeObjective(collectObjective);
        } else {
          this.game.ui.updateObjective(
            `${collectObjective.description} (${collectObjective.currentCount}/${collectObjective.count})`
          );
        }
      } else {
        this.completeObjective(collectObjective);
      }
    }
  }

  private completeObjective(objective: MissionObjective): void {
    objective.completed = true;

    const markerKey = `objective_${objective.id}`;
    const marker = this.missionMarkers.get(markerKey);
    if (marker) {
      this.game.scene.remove(marker.mesh);
      this.missionMarkers.delete(markerKey);
    }

    this.game.audio.playSound('objective_complete');
    this.game.ui.showNotification('Objective Complete!');

    this.currentObjectiveIndex++;

    if (!this.state.currentMission) return;

    const allCompleted = this.state.currentMission.objectives
      .filter(o => !o.optional)
      .every(o => o.completed);

    if (allCompleted) {
      this.completeMission();
    } else {
      this.updateObjectiveMarker();
    }
  }

  private checkFailConditions(): void {
    if (!this.state.currentMission) return;

    for (const condition of this.state.currentMission.failConditions) {
      switch (condition.type) {
        case 'death':
          if (this.game.player.state.isDead) {
            this.failCurrentMission('death');
            return;
          }
          break;
        case 'vehicle_destroyed':
          if (this.game.player.state.isInVehicle) {
            const vehicle = this.game.player.state.currentVehicle;
            if (vehicle?.destroyed) {
              this.failCurrentMission('vehicle_destroyed');
              return;
            }
          }
          break;
      }
    }
  }

  private completeMission(): void {
    if (!this.state.currentMission) return;

    const mission = this.state.currentMission;
    this.state.completedMissions.push(mission.id);

    this.game.player.addMoney(mission.reward.money);

    if (mission.reward.weapons) {
      mission.reward.weapons.forEach(weaponId => {
        this.game.inventory.addWeapon(weaponId);
      });
    }

    this.game.ui.showMissionComplete(mission.title, mission.reward.money);
    this.game.audio.playSound('mission_complete');

    globalEvents.emit('mission_complete', { missionId: mission.id });

    this.state.currentMission = null;
    this.createMissionStartMarkers();
  }

  failCurrentMission(reason: string): void {
    if (!this.state.currentMission) return;

    const mission = this.state.currentMission;
    this.state.failedMissions.push(mission.id);

    this.game.ui.showMissionFailed(mission.title, reason);
    this.game.audio.playSound('mission_failed');

    globalEvents.emit('mission_fail', {
      missionId: mission.id,
      reason
    });

    this.missionMarkers.forEach((marker, id) => {
      if (id.startsWith('objective_')) {
        this.game.scene.remove(marker.mesh);
        this.missionMarkers.delete(id);
      }
    });

    this.state.currentMission = null;
    this.createMissionStartMarkers();
  }

  canStartMission(missionId: string): boolean {
    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return false;

    if (this.state.completedMissions.includes(missionId)) return false;

    return mission.prerequisites.every(prereq =>
      this.state.completedMissions.includes(prereq)
    );
  }

  getCurrentMission(): MissionConfig | null {
    return this.state.currentMission;
  }

  getCompletedMissions(): string[] {
    return [...this.state.completedMissions];
  }

  setCompletedMissions(missions: string[]): void {
    this.state.completedMissions = [...missions];
    this.createMissionStartMarkers();
  }

  getMissionTimer(): number {
    if (!this.state.currentMission?.timeLimit) return 0;
    return this.state.currentMission.timeLimit - this.missionTimer;
  }

  getAvailableMissions(): MissionConfig[] {
    return MISSIONS.filter(m => this.canStartMission(m.id));
  }

  dispose(): void {
    this.missionMarkers.forEach(marker => {
      this.game.scene.remove(marker.mesh);
    });
    this.missionMarkers.clear();

    this.checkpointTriggers.forEach(mesh => {
      this.game.scene.remove(mesh);
    });
    this.checkpointTriggers.clear();
  }
}
