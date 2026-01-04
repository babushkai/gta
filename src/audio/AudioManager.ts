import { Howl, Howler } from 'howler';
import { AudioConfig, RadioStation } from '@/types';
import { globalEvents } from '@/core/EventEmitter';

// Real police dispatch audio from Internet Archive (royalty-free)
const POLICE_DISPATCH_AUDIO = [
  {
    id: 'dispatch_1',
    name: 'LCPD Dispatch',
    url: 'https://archive.org/download/acidplanet-audio-01463096/01463096.mp3',
  },
  {
    id: 'dispatch_2',
    name: 'Pursuit Call',
    url: 'https://archive.org/download/scanstockton51/San-Joaquin-SO-Pursuit-01-10-2011.mp3',
  },
  {
    id: 'dispatch_3',
    name: 'Officer Response',
    url: 'https://archive.org/download/scanstockton51/06-21-2011-Escalon-Officer-Shot.mp3',
  },
  {
    id: 'dispatch_4',
    name: 'Vehicle Pursuit',
    url: 'https://archive.org/download/scanstockton51/06-02-2011-0145-FTY-Hummer.mp3',
  },
];

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
        id: 'flash_1',
        title: 'Synthwave Dreams',
        artist: 'RetroSound',
        duration: 180,
        file: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3'
      },
      {
        id: 'flash_2',
        title: 'Neon Nights',
        artist: 'SynthMaster',
        duration: 195,
        file: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bd42714.mp3'
      },
      {
        id: 'flash_3',
        title: 'Electric Sunset',
        artist: 'Wave Runner',
        duration: 210,
        file: 'https://cdn.pixabay.com/download/audio/2023/09/04/audio_1c194b0d75.mp3'
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
        id: 'vrock_1',
        title: 'Electric Energy',
        artist: 'Power Chord',
        duration: 200,
        file: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749d484.mp3'
      },
      {
        id: 'vrock_2',
        title: 'Highway Fury',
        artist: 'Steel Thunder',
        duration: 185,
        file: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_ea7028a313.mp3'
      },
      {
        id: 'vrock_3',
        title: 'Metal Storm',
        artist: 'Riff Master',
        duration: 220,
        file: 'https://cdn.pixabay.com/download/audio/2023/07/30/audio_e1c72e9bea.mp3'
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
        id: 'chill_1',
        title: 'Lofi Chill',
        artist: 'Mellow Beats',
        duration: 150,
        file: 'https://cdn.pixabay.com/download/audio/2022/05/16/audio_f3709e5d42.mp3'
      },
      {
        id: 'chill_2',
        title: 'Rainy Afternoon',
        artist: 'Cozy Vibes',
        duration: 175,
        file: 'https://cdn.pixabay.com/download/audio/2022/10/09/audio_cb40dee917.mp3'
      },
      {
        id: 'chill_3',
        title: 'Coffee Shop',
        artist: 'Lazy Sunday',
        duration: 160,
        file: 'https://cdn.pixabay.com/download/audio/2024/02/14/audio_9a8cb6dbbb.mp3'
      }
    ]
  },
  {
    id: 'fever_105',
    name: 'Fever 105',
    genre: 'Disco/Funk',
    icon: '🪩',
    djName: 'Oliver Biscuit',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'fever_1',
        title: 'Disco Nights',
        artist: 'Groove Machine',
        duration: 190,
        file: 'https://cdn.pixabay.com/download/audio/2022/08/02/audio_54ca0ffa52.mp3'
      },
      {
        id: 'fever_2',
        title: 'Funky Town',
        artist: 'Bass Brothers',
        duration: 205,
        file: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_8920da4562.mp3'
      },
      {
        id: 'fever_3',
        title: 'Get Down',
        artist: 'Soul Train',
        duration: 180,
        file: 'https://cdn.pixabay.com/download/audio/2023/04/20/audio_f7de5b8ce5.mp3'
      }
    ]
  },
  {
    id: 'emotion',
    name: 'Emotion 98.3',
    genre: 'Soft Rock/Ballads',
    icon: '💕',
    djName: 'Fernando Martinez',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'emotion_1',
        title: 'Endless Love',
        artist: 'Heart Strings',
        duration: 240,
        file: 'https://cdn.pixabay.com/download/audio/2022/11/22/audio_cd15e03da6.mp3'
      },
      {
        id: 'emotion_2',
        title: 'Moonlight Serenade',
        artist: 'Velvet Voice',
        duration: 220,
        file: 'https://cdn.pixabay.com/download/audio/2022/02/07/audio_70d53e0e60.mp3'
      },
      {
        id: 'emotion_3',
        title: 'Summer Romance',
        artist: 'Smooth Jazz',
        duration: 195,
        file: 'https://cdn.pixabay.com/download/audio/2022/05/17/audio_c8c8a73467.mp3'
      }
    ]
  },
  {
    id: 'espantoso',
    name: 'Radio Espantoso',
    genre: 'Latin/Salsa',
    icon: '🌴',
    djName: 'Pepe',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'esp_1',
        title: 'Havana Nights',
        artist: 'Los Calientes',
        duration: 200,
        file: 'https://cdn.pixabay.com/download/audio/2022/06/07/audio_b02a08f58f.mp3'
      },
      {
        id: 'esp_2',
        title: 'Salsa Fever',
        artist: 'Ritmo Latino',
        duration: 185,
        file: 'https://cdn.pixabay.com/download/audio/2022/08/25/audio_4f3b0a8a4a.mp3'
      },
      {
        id: 'esp_3',
        title: 'Tropical Heat',
        artist: 'Caribbean Soul',
        duration: 210,
        file: 'https://cdn.pixabay.com/download/audio/2022/10/30/audio_073a344e9f.mp3'
      }
    ]
  },
  {
    id: 'wave_103',
    name: 'Wave 103',
    genre: 'Electronic/EDM',
    icon: '⚡',
    djName: 'Adam First',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'wave_1',
        title: 'Digital Dreams',
        artist: 'Cyber Pulse',
        duration: 175,
        file: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_a8a76e95e5.mp3'
      },
      {
        id: 'wave_2',
        title: 'Bass Drop',
        artist: 'Beat Factory',
        duration: 195,
        file: 'https://cdn.pixabay.com/download/audio/2022/11/14/audio_1e11067e99.mp3'
      },
      {
        id: 'wave_3',
        title: 'Rave Night',
        artist: 'DJ Electronica',
        duration: 210,
        file: 'https://cdn.pixabay.com/download/audio/2023/02/02/audio_8dfc526f39.mp3'
      }
    ]
  },
  {
    id: 'wildstyle',
    name: 'Wildstyle FM',
    genre: 'Hip-Hop',
    icon: '🎤',
    djName: 'Mr. Magic',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'wild_1',
        title: 'Street Beats',
        artist: 'Urban Flow',
        duration: 180,
        file: 'https://cdn.pixabay.com/download/audio/2022/01/20/audio_c7f0fab6ab.mp3'
      },
      {
        id: 'wild_2',
        title: 'Block Party',
        artist: 'MC Fresh',
        duration: 200,
        file: 'https://cdn.pixabay.com/download/audio/2022/09/08/audio_0e22a9e5ca.mp3'
      },
      {
        id: 'wild_3',
        title: 'Boom Box',
        artist: 'Beat Kings',
        duration: 165,
        file: 'https://cdn.pixabay.com/download/audio/2023/06/15/audio_55c1a7e09b.mp3'
      }
    ]
  },
  {
    id: 'k_jah',
    name: 'K-JAH West',
    genre: 'Reggae/Dub',
    icon: '🌿',
    djName: 'Marshall Peters',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'kjah_1',
        title: 'Island Vibes',
        artist: 'Roots Connection',
        duration: 220,
        file: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_87e8ffd7be.mp3'
      },
      {
        id: 'kjah_2',
        title: 'Dub Session',
        artist: 'King Tubby Jr',
        duration: 195,
        file: 'https://cdn.pixabay.com/download/audio/2022/07/19/audio_e08ff2cc8e.mp3'
      },
      {
        id: 'kjah_3',
        title: 'Jah Blessing',
        artist: 'Zion Train',
        duration: 185,
        file: 'https://cdn.pixabay.com/download/audio/2023/01/10/audio_d4d5f56e8d.mp3'
      }
    ]
  },
  {
    id: 'rise_fm',
    name: 'Rise FM',
    genre: 'Trance/House',
    icon: '🌅',
    djName: 'Boy Sanchez',
    currentTrackIndex: 0,
    tracks: [
      {
        id: 'rise_1',
        title: 'Sunrise',
        artist: 'Trance Nation',
        duration: 240,
        file: 'https://cdn.pixabay.com/download/audio/2022/08/31/audio_419263ae16.mp3'
      },
      {
        id: 'rise_2',
        title: 'Euphoria',
        artist: 'Dream State',
        duration: 210,
        file: 'https://cdn.pixabay.com/download/audio/2022/12/05/audio_c22b629291.mp3'
      },
      {
        id: 'rise_3',
        title: 'Club Life',
        artist: 'Night Owl',
        duration: 200,
        file: 'https://cdn.pixabay.com/download/audio/2023/03/12/audio_c7e9f4b4e9.mp3'
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
  private policeDispatchHowls: Howl[] = [];
  private isPoliceDispatchPlaying: boolean = false;

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

        case 'shotgun':
          // Deep boom for shotgun
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(30, this.audioContext.currentTime + 0.15);
          gainNode.gain.setValueAtTime(volume * 1.2, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.2);
          break;

        case 'reload':
          // Metallic click sounds
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
          oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.05);
          oscillator.frequency.setValueAtTime(900, this.audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.15);
          break;

        case 'empty_click':
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(volume * 0.2, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.03);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.03);
          break;

        case 'equip':
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
          oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime + 0.05);
          gainNode.gain.setValueAtTime(volume * 0.25, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.1);
          break;

        case 'punch':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(60, this.audioContext.currentTime + 0.08);
          gainNode.gain.setValueAtTime(volume * 0.5, this.audioContext.currentTime);
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

        case 'death':
          // Death groan - low frequency descending
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + 0.3);
          gainNode.gain.setValueAtTime(volume * 0.6, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.4);
          break;

        case 'hit':
          // Impact hit sound
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + 0.05);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.08);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.08);
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

        case 'footstep':
          // Realistic footstep - short thud with slight variation
          oscillator.type = 'triangle';
          const footstepFreq = 80 + Math.random() * 40; // Randomize slightly
          oscillator.frequency.setValueAtTime(footstepFreq, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.08);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.1);
          break;

        case 'land':
          // Landing thud - heavier than footstep
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(30, this.audioContext.currentTime + 0.15);
          gainNode.gain.setValueAtTime(volume * 0.6, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.2);
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

        case 'scream_female':
          // High-pitched scream
          oscillator.type = 'sawtooth';
          const screamFreqF = 800 + Math.random() * 200;
          oscillator.frequency.setValueAtTime(screamFreqF, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(screamFreqF * 1.5, this.audioContext.currentTime + 0.1);
          oscillator.frequency.exponentialRampToValueAtTime(screamFreqF * 0.8, this.audioContext.currentTime + 0.3);
          oscillator.frequency.exponentialRampToValueAtTime(screamFreqF * 1.2, this.audioContext.currentTime + 0.5);
          gainNode.gain.setValueAtTime(volume * 0.5, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(volume * 0.6, this.audioContext.currentTime + 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.6);
          break;

        case 'scream_male':
          // Lower-pitched scream/yell
          oscillator.type = 'sawtooth';
          const screamFreqM = 400 + Math.random() * 100;
          oscillator.frequency.setValueAtTime(screamFreqM, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(screamFreqM * 1.3, this.audioContext.currentTime + 0.1);
          oscillator.frequency.exponentialRampToValueAtTime(screamFreqM * 0.7, this.audioContext.currentTime + 0.35);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(volume * 0.5, this.audioContext.currentTime + 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.45);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.45);
          break;

        case 'police_radio':
          // Play real police dispatch audio instead of synthesized sound
          this.playPoliceDispatch(volume);
          // Don't start oscillator for this case
          return;

        case 'police_siren':
          // Police siren - alternating high-low
          oscillator.type = 'sine';
          const time = this.audioContext.currentTime;
          // Wail pattern
          oscillator.frequency.setValueAtTime(600, time);
          oscillator.frequency.linearRampToValueAtTime(900, time + 0.4);
          oscillator.frequency.linearRampToValueAtTime(600, time + 0.8);
          oscillator.frequency.linearRampToValueAtTime(900, time + 1.2);
          oscillator.frequency.linearRampToValueAtTime(600, time + 1.6);
          gainNode.gain.setValueAtTime(volume * 0.3, time);
          gainNode.gain.setValueAtTime(volume * 0.35, time + 0.4);
          gainNode.gain.setValueAtTime(volume * 0.3, time + 0.8);
          gainNode.gain.exponentialRampToValueAtTime(0.01, time + 1.8);
          oscillator.start();
          oscillator.stop(time + 1.8);
          break;

        case 'car_horn':
          // Car horn beep
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
          gainNode.gain.setValueAtTime(volume * 0.25, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.2);
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

  // Play real police dispatch audio from Internet Archive
  playPoliceDispatch(volume: number = 0.5): void {
    if (this.isPoliceDispatchPlaying) return;

    // Pick a random dispatch audio
    const dispatchIndex = Math.floor(Math.random() * POLICE_DISPATCH_AUDIO.length);
    const dispatch = POLICE_DISPATCH_AUDIO[dispatchIndex];

    this.isPoliceDispatchPlaying = true;

    const dispatchHowl = new Howl({
      src: [dispatch.url],
      html5: true,
      volume: volume * this.config.sfxVolume,
      onend: () => {
        this.isPoliceDispatchPlaying = false;
        // Remove from active howls
        const idx = this.policeDispatchHowls.indexOf(dispatchHowl);
        if (idx > -1) this.policeDispatchHowls.splice(idx, 1);
      },
      onloaderror: () => {
        this.isPoliceDispatchPlaying = false;
        console.log('Police dispatch audio failed to load, using fallback');
      },
      onstop: () => {
        this.isPoliceDispatchPlaying = false;
      }
    });

    this.policeDispatchHowls.push(dispatchHowl);

    // Limit duration to ~8 seconds for gameplay (don't play full recordings)
    dispatchHowl.play();
    setTimeout(() => {
      if (dispatchHowl.playing()) {
        dispatchHowl.fade(volume * this.config.sfxVolume, 0, 500);
        setTimeout(() => {
          dispatchHowl.stop();
          this.isPoliceDispatchPlaying = false;
        }, 500);
      }
    }, 8000);
  }

  stopPoliceDispatch(): void {
    this.policeDispatchHowls.forEach(howl => {
      howl.stop();
    });
    this.policeDispatchHowls = [];
    this.isPoliceDispatchPlaying = false;
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
      loop: false, // Don't loop single track, advance to next
      onplay: () => {
        console.log(`Now playing: ${station.name} - ${track.title}`);
      },
      onend: () => {
        // Advance to next track on the station
        if (this.isRadioPlaying) {
          this.nextTrack();
        }
      },
      onloaderror: () => {
        console.log(`Radio: ${station.name} (loading music...)`);
        // Try next track if this one fails
        setTimeout(() => {
          if (this.isRadioPlaying) {
            this.nextTrack();
          }
        }, 1000);
      }
    });

    this.currentRadioHowl.play();
    this.showRadioDisplay(station);
  }

  private nextTrack(): void {
    const station = this.radioStations[this.currentStationIndex];
    station.currentTrackIndex = (station.currentTrackIndex + 1) % station.tracks.length;
    this.playCurrentStation();
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
