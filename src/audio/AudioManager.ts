import { Howl, Howler } from 'howler';
import { AudioConfig, RadioStation } from '@/types';
import { globalEvents } from '@/core/EventEmitter';

// Free royalty-free music from Pixabay CDN
const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'flash_fm',
    name: 'Flash FM',
    genre: '80s Synthwave',
    icon: '📻',
    djName: 'Toni',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'track_1',
        title: 'Synthwave Dreams',
        artist: 'Pixabay Artist',
        duration: 180,
        file: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3' // Synthwave
      }
    ]
  },
  {
    id: 'v_rock',
    name: 'V-Rock',
    genre: 'Rock',
    icon: '🎸',
    djName: 'Lazlow',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'track_1',
        title: 'Electric Energy',
        artist: 'Pixabay Artist',
        duration: 200,
        file: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749d484.mp3' // Rock
      }
    ]
  },
  {
    id: 'chill',
    name: 'Chill Wave',
    genre: 'Lo-Fi',
    icon: '🌊',
    djName: 'DJ Relax',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'track_1',
        title: 'Lofi Chill',
        artist: 'Pixabay Artist',
        duration: 150,
        file: 'https://cdn.pixabay.com/download/audio/2022/05/16/audio_f3709e5d42.mp3' // Lofi
      }
    ]
  }
];

export class AudioManager {
  private config: AudioConfig;
  private audioContext: AudioContext | null = null;
  private radioStations: RadioStation[] = RADIO_STATIONS;
  private currentStationIndex: number = 0;
  private currentRadioHowl: Howl | null = null;
  private isRadioPlaying: boolean = false;
  private isPaused: boolean = false;
  private soundCache: Map<string, AudioBuffer> = new Map();

  constructor(config: AudioConfig) {
    this.config = config;
    Howler.volume(config.masterVolume);
  }

  async initialize(): Promise<void> {
    // Create audio context on user interaction
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.setupEventListeners();
    console.log('Audio system initialized');
  }

  private setupEventListeners(): void {
    globalEvents.on('vehicle_enter', () => {
      if (!this.isRadioPlaying) {
        this.startRadio();
      }
    });

    globalEvents.on('vehicle_exit', () => {
      this.stopRadio();
    });
  }

  // Generate simple sound effects using Web Audio API
  playSound(soundId: string, options?: { volume?: number }): void {
    if (!this.audioContext) return;

    const volume = (options?.volume ?? 0.5) * this.config.sfxVolume;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Configure sound based on ID
      switch (soundId) {
        case 'gunshot':
        case 'pistol_fire':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.1);
          break;

        case 'explosion':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(20, this.audioContext.currentTime + 0.5);
          gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.5);
          break;

        case 'jump':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.15);
          break;

        case 'pickup':
        case 'objective_complete':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
          oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.2);
          break;

        case 'horn':
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(350, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + 0.3);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.3);
          break;

        case 'car_door':
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.15);
          break;

        case 'mission_start':
        case 'mission_complete':
          // Fanfare sound
          const osc2 = this.audioContext.createOscillator();
          osc2.connect(gainNode);
          oscillator.type = 'sine';
          osc2.type = 'sine';
          oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime); // C5
          osc2.frequency.setValueAtTime(659, this.audioContext.currentTime); // E5
          gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
          oscillator.start();
          osc2.start();
          oscillator.stop(this.audioContext.currentTime + 0.5);
          osc2.stop(this.audioContext.currentTime + 0.5);
          break;

        case 'mission_failed':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.4);
          break;

        case 'wanted_level':
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
          oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.3);
          break;

        default:
          // Generic click/beep sound
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(volume * 0.2, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.05);
      }
    } catch (e) {
      // Audio context may not be ready
    }
  }

  stopSound(soundId: string): void {
    // Sound effects are short, no need to stop
  }

  playSoundAt(
    soundId: string,
    position: { x: number; y: number; z: number },
    listenerPosition: { x: number; y: number; z: number }
  ): void {
    const dx = position.x - listenerPosition.x;
    const dy = position.y - listenerPosition.y;
    const dz = position.z - listenerPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const maxDistance = 50;
    const volume = Math.max(0, 1 - distance / maxDistance);

    if (volume > 0.01) {
      this.playSound(soundId, { volume });
    }
  }

  startRadio(): void {
    if (this.isRadioPlaying) return;

    this.isRadioPlaying = true;
    this.playCurrentStation();
  }

  stopRadio(): void {
    this.isRadioPlaying = false;
    if (this.currentRadioHowl) {
      this.currentRadioHowl.fade(this.config.radioVolume, 0, 500);
      setTimeout(() => {
        this.currentRadioHowl?.stop();
        this.currentRadioHowl = null;
      }, 500);
    }
    this.hideRadioDisplay();
  }

  nextStation(): void {
    this.currentStationIndex = (this.currentStationIndex + 1) % this.radioStations.length;
    if (this.isRadioPlaying) {
      this.playCurrentStation();
    }
    this.playSound('pickup'); // Station change sound
  }

  previousStation(): void {
    this.currentStationIndex = this.currentStationIndex === 0
      ? this.radioStations.length - 1
      : this.currentStationIndex - 1;
    if (this.isRadioPlaying) {
      this.playCurrentStation();
    }
    this.playSound('pickup');
  }

  private playCurrentStation(): void {
    if (this.currentRadioHowl) {
      this.currentRadioHowl.stop();
    }

    const station = this.radioStations[this.currentStationIndex];
    const track = station.tracks[station.currentTrackIndex];

    this.currentRadioHowl = new Howl({
      src: [track.file],
      html5: true, // Use HTML5 audio for streaming
      volume: this.config.radioVolume,
      loop: true,
      onplay: () => {
        console.log(`Now playing: ${station.name} - ${track.title}`);
      },
      onloaderror: (id, error) => {
        console.log(`Radio: ${station.name} (loading music...)`);
      }
    });

    this.currentRadioHowl.play();
    this.showRadioDisplay(station);
  }

  private showRadioDisplay(station: RadioStation): void {
    const display = document.getElementById('radio-display');
    if (display) {
      const stationName = display.querySelector('.radio-station');
      const trackInfo = display.querySelector('.radio-song');

      if (stationName) {
        stationName.textContent = `${station.icon} ${station.name}`;
      }

      if (trackInfo) {
        const track = station.tracks[station.currentTrackIndex];
        if (track) {
          trackInfo.textContent = `${track.title} - ${track.artist}`;
        } else {
          trackInfo.textContent = station.genre;
        }
      }

      display.classList.add('visible');

      setTimeout(() => {
        display.classList.remove('visible');
      }, 3000);
    }
  }

  private hideRadioDisplay(): void {
    const display = document.getElementById('radio-display');
    if (display) {
      display.classList.remove('visible');
    }
  }

  getCurrentStation(): RadioStation | null {
    if (!this.isRadioPlaying) return null;
    return this.radioStations[this.currentStationIndex];
  }

  getRadioStations(): RadioStation[] {
    return [...this.radioStations];
  }

  setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    Howler.volume(this.config.masterVolume);
  }

  setSFXVolume(volume: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  setMusicVolume(volume: number): void {
    this.config.musicVolume = Math.max(0, Math.min(1, volume));
  }

  setRadioVolume(volume: number): void {
    this.config.radioVolume = Math.max(0, Math.min(1, volume));
    if (this.currentRadioHowl) {
      this.currentRadioHowl.volume(this.config.radioVolume);
    }
  }

  startAmbient(id: string): void {
    // Ambient sounds not implemented yet
  }

  stopAmbient(id: string): void {
    // Ambient sounds not implemented yet
  }

  setAmbientVolume(id: string, volume: number): void {
    // Ambient sounds not implemented yet
  }

  pauseAll(): void {
    this.isPaused = true;
    if (this.currentRadioHowl) {
      this.currentRadioHowl.pause();
    }
  }

  resumeAll(): void {
    this.isPaused = false;
    if (this.isRadioPlaying && this.currentRadioHowl) {
      this.currentRadioHowl.play();
    }
  }

  muteAll(): void {
    Howler.mute(true);
  }

  unmuteAll(): void {
    Howler.mute(false);
  }

  dispose(): void {
    if (this.currentRadioHowl) {
      this.currentRadioHowl.unload();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    Howler.unload();
  }
}
