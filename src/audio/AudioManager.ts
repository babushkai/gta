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

// Radio stations - all using SomaFM live streams (reliable, CORS-friendly with proxy)
const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'radio_off',
    name: 'Radio Off',
    genre: 'Silence',
    icon: '🔇',
    djName: '',
    currentTrackIndex: 0,
    tracks: []
  },
  // Live streaming radio stations (using browser-embeddable streams)
  {
    id: 'radio_paradise',
    name: 'Radio Paradise',
    genre: 'Eclectic Mix',
    icon: '🌴',
    djName: 'RP',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://stream.radioparadise.com/aac-320',
    tracks: [
      { id: 'rp_1', title: 'Live Stream', artist: 'Radio Paradise', duration: 0, file: 'https://stream.radioparadise.com/aac-320' }
    ]
  },
  {
    id: 'lofi_girl',
    name: 'Lofi Radio',
    genre: 'Lo-Fi Beats',
    icon: '🎧',
    djName: 'Lofi',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://usa9.fastcast4u.com/proxy/jamz?mp=/1',
    tracks: [
      { id: 'lofi_1', title: 'Live Stream', artist: 'Lofi Beats', duration: 0, file: 'https://usa9.fastcast4u.com/proxy/jamz?mp=/1' }
    ]
  },
  {
    id: 'jazz_radio',
    name: 'Jazz FM',
    genre: 'Smooth Jazz',
    icon: '🎷',
    djName: 'Jazz',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://streaming.radio.co/s774887f7b/listen',
    tracks: [
      { id: 'jazz_1', title: 'Live Stream', artist: 'Jazz FM', duration: 0, file: 'https://streaming.radio.co/s774887f7b/listen' }
    ]
  },
  {
    id: 'chillhop',
    name: 'Chillhop',
    genre: 'Chillhop/Lo-Fi',
    icon: '☕',
    djName: 'Chill',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://streams.fluxfm.de/Chillhop/mp3-320/streams.fluxfm.de/',
    tracks: [
      { id: 'chill_1', title: 'Live Stream', artist: 'Chillhop', duration: 0, file: 'https://streams.fluxfm.de/Chillhop/mp3-320/streams.fluxfm.de/' }
    ]
  },
  {
    id: 'synthwave',
    name: 'Nightride FM',
    genre: 'Synthwave',
    icon: '🌃',
    djName: 'Nightride',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://stream.nightride.fm/nightride.m4a',
    tracks: [
      { id: 'synth_1', title: 'Live Stream', artist: 'Nightride FM', duration: 0, file: 'https://stream.nightride.fm/nightride.m4a' }
    ]
  },
  {
    id: 'metal_radio',
    name: 'Metal Express',
    genre: 'Heavy Metal',
    icon: '🤘',
    djName: 'Metal',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://kathy.torontocast.com:3060/stream',
    tracks: [
      { id: 'metal_1', title: 'Live Stream', artist: 'Metal Express', duration: 0, file: 'https://kathy.torontocast.com:3060/stream' }
    ]
  },
  {
    id: 'classic_rock',
    name: 'Classic Rock',
    genre: 'Classic Rock',
    icon: '🎸',
    djName: 'Rock',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://icecast.walmradio.com:8443/classic',
    tracks: [
      { id: 'rock_1', title: 'Live Stream', artist: 'Classic Rock', duration: 0, file: 'https://icecast.walmradio.com:8443/classic' }
    ]
  },
  {
    id: 'electronic',
    name: 'Electronic FM',
    genre: 'Electronic',
    icon: '🔊',
    djName: 'EDM',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://streams.fluxfm.de/klubradio/mp3-320/streams.fluxfm.de/',
    tracks: [
      { id: 'edm_1', title: 'Live Stream', artist: 'Electronic FM', duration: 0, file: 'https://streams.fluxfm.de/klubradio/mp3-320/streams.fluxfm.de/' }
    ]
  },
  {
    id: 'hiphop_radio',
    name: 'Hip-Hop Hits',
    genre: 'Hip-Hop',
    icon: '🎤',
    djName: 'HipHop',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://streams.fluxfm.de/hiphop/mp3-320/streams.fluxfm.de/',
    tracks: [
      { id: 'hiphop_1', title: 'Live Stream', artist: 'Hip-Hop Radio', duration: 0, file: 'https://streams.fluxfm.de/hiphop/mp3-320/streams.fluxfm.de/' }
    ]
  },
  {
    id: 'ambient_radio',
    name: 'Ambient Space',
    genre: 'Ambient',
    icon: '🌌',
    djName: 'Ambient',
    currentTrackIndex: 0,
    isLiveStream: true,
    streamUrl: 'https://streams.fluxfm.de/cosmicradio/mp3-320/streams.fluxfm.de/',
    tracks: [
      { id: 'ambient_1', title: 'Live Stream', artist: 'Ambient Space', duration: 0, file: 'https://streams.fluxfm.de/cosmicradio/mp3-320/streams.fluxfm.de/' }
    ]
  }
];

// Ambient background music streams (plays when on foot)
const AMBIENT_MUSIC_STREAMS = [
  { id: 'city_vibes', name: 'City Vibes', url: 'https://streams.fluxfm.de/Chillhop/mp3-320/streams.fluxfm.de/' },
  { id: 'night_city', name: 'Night City', url: 'https://stream.nightride.fm/nightride.m4a' },
  { id: 'urban_jazz', name: 'Urban Jazz', url: 'https://streaming.radio.co/s774887f7b/listen' },
];

export class AudioManager {
  private config: AudioConfig;
  private audioContext: AudioContext | null = null;
  private radioStations: RadioStation[] = RADIO_STATIONS;
  private currentStationIndex: number = 1; // Start on first real station (not Radio Off)
  private currentRadioHowl: Howl | null = null;
  private currentStreamAudio: HTMLAudioElement | null = null; // Native audio for live streams
  private isRadioPlaying: boolean = false;
  private isPaused: boolean = false;
  private soundCache: Map<string, AudioBuffer> = new Map();
  private policeDispatchHowls: Howl[] = [];
  private isPoliceDispatchPlaying: boolean = false;

  // Ambient background music
  private ambientMusicAudio: HTMLAudioElement | null = null;
  private isAmbientMusicPlaying: boolean = false;
  private currentAmbientIndex: number = 0;

  // Helicopter sound system
  private helicopterSoundActive: boolean = false;
  private helicopterRotorOsc: OscillatorNode | null = null;
  private helicopterRotorGain: GainNode | null = null;
  private helicopterTurbineOsc: OscillatorNode | null = null;
  private helicopterTurbineGain: GainNode | null = null;
  private helicopterWindNoise: AudioBufferSourceNode | null = null;
  private helicopterWindGain: GainNode | null = null;
  private helicopterTailRotorOsc: OscillatorNode | null = null;
  private helicopterTailRotorGain: GainNode | null = null;
  private helicopterNoiseBuffer: AudioBuffer | null = null;

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
      // Stop ambient music, start radio
      this.stopAmbientMusic();
      if (!this.isRadioPlaying) {
        this.startRadio();
      }
    });

    globalEvents.on('vehicle_exit', () => {
      // Stop radio, start ambient music
      this.stopRadio();
      this.stopHelicopterSound(); // Stop helicopter sound if active
      this.startAmbientMusic();
    });
  }

  // Auto-start ambient music when game begins
  startBackgroundMusic(): void {
    // Start ambient music for on-foot gameplay
    this.startAmbientMusic();
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

        // ==================== NYC AMBIENT SOUNDS ====================

        case 'car_alarm':
          // Annoying car alarm - alternating tones
          oscillator.type = 'square';
          const alarmTime = this.audioContext.currentTime;
          for (let i = 0; i < 8; i++) {
            oscillator.frequency.setValueAtTime(800, alarmTime + i * 0.25);
            oscillator.frequency.setValueAtTime(600, alarmTime + i * 0.25 + 0.125);
          }
          gainNode.gain.setValueAtTime(volume * 0.3, alarmTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, alarmTime + 2);
          oscillator.start();
          oscillator.stop(alarmTime + 2);
          break;

        case 'subway_rumble':
          // Low rumbling subway passing underground
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(35, this.audioContext.currentTime);
          oscillator.frequency.linearRampToValueAtTime(50, this.audioContext.currentTime + 1);
          oscillator.frequency.linearRampToValueAtTime(35, this.audioContext.currentTime + 2);
          gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
          gainNode.gain.linearRampToValueAtTime(volume * 0.4, this.audioContext.currentTime + 0.5);
          gainNode.gain.linearRampToValueAtTime(volume * 0.4, this.audioContext.currentTime + 1.5);
          gainNode.gain.linearRampToValueAtTime(0.01, this.audioContext.currentTime + 2.5);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 2.5);
          break;

        case 'ambulance_siren':
          // Ambulance wail - slower than police
          oscillator.type = 'sine';
          const ambTime = this.audioContext.currentTime;
          oscillator.frequency.setValueAtTime(700, ambTime);
          oscillator.frequency.linearRampToValueAtTime(1000, ambTime + 0.6);
          oscillator.frequency.linearRampToValueAtTime(700, ambTime + 1.2);
          oscillator.frequency.linearRampToValueAtTime(1000, ambTime + 1.8);
          gainNode.gain.setValueAtTime(volume * 0.35, ambTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ambTime + 2);
          oscillator.start();
          oscillator.stop(ambTime + 2);
          break;

        case 'fire_siren':
          // Fire truck air horn - low powerful blasts
          oscillator.type = 'sawtooth';
          const fireTime = this.audioContext.currentTime;
          oscillator.frequency.setValueAtTime(180, fireTime);
          oscillator.frequency.setValueAtTime(180, fireTime + 0.8);
          oscillator.frequency.setValueAtTime(200, fireTime + 1.0);
          oscillator.frequency.setValueAtTime(180, fireTime + 1.8);
          gainNode.gain.setValueAtTime(volume * 0.4, fireTime);
          gainNode.gain.setValueAtTime(0.01, fireTime + 0.7);
          gainNode.gain.setValueAtTime(volume * 0.4, fireTime + 0.9);
          gainNode.gain.exponentialRampToValueAtTime(0.01, fireTime + 2);
          oscillator.start();
          oscillator.stop(fireTime + 2);
          break;

        case 'distant_siren':
          // Faint distant siren
          oscillator.type = 'sine';
          const distTime = this.audioContext.currentTime;
          oscillator.frequency.setValueAtTime(500, distTime);
          oscillator.frequency.linearRampToValueAtTime(700, distTime + 1);
          oscillator.frequency.linearRampToValueAtTime(500, distTime + 2);
          gainNode.gain.setValueAtTime(volume * 0.1, distTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, distTime + 2.5);
          oscillator.start();
          oscillator.stop(distTime + 2.5);
          break;

        case 'crowd_chatter':
          // Background crowd noise - white noise filtered
          const noiseBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.5, this.audioContext.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
          }
          const noiseSource = this.audioContext.createBufferSource();
          noiseSource.buffer = noiseBuffer;
          const lowpass = this.audioContext.createBiquadFilter();
          lowpass.type = 'lowpass';
          lowpass.frequency.value = 400;
          noiseSource.connect(lowpass);
          lowpass.connect(gainNode);
          gainNode.gain.setValueAtTime(volume * 0.15, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
          noiseSource.start();
          noiseSource.stop(this.audioContext.currentTime + 0.5);
          return; // Don't start oscillator

        case 'dog_bark':
          // Quick dog bark
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.05);
          oscillator.frequency.exponentialRampToValueAtTime(250, this.audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(volume * 0.35, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.12);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.12);
          break;

        case 'jackhammer':
          // Jackhammer construction sound
          oscillator.type = 'square';
          const jackTime = this.audioContext.currentTime;
          for (let i = 0; i < 10; i++) {
            const t = jackTime + i * 0.08;
            oscillator.frequency.setValueAtTime(80 + Math.random() * 30, t);
          }
          gainNode.gain.setValueAtTime(volume * 0.25, jackTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, jackTime + 0.8);
          oscillator.start();
          oscillator.stop(jackTime + 0.8);
          break;

        case 'taxi_whistle':
          // Sharp whistle for hailing taxi
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(1200, this.audioContext.currentTime);
          oscillator.frequency.linearRampToValueAtTime(1800, this.audioContext.currentTime + 0.1);
          oscillator.frequency.linearRampToValueAtTime(1200, this.audioContext.currentTime + 0.15);
          gainNode.gain.setValueAtTime(volume * 0.4, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
          oscillator.start();
          oscillator.stop(this.audioContext.currentTime + 0.2);
          break;

        // ==================== SPIDERMAN WEB-SWINGING SOUNDS ====================

        case 'web_shoot':
          // "Thwip!" sound - quick high-pitched ascending tone
          oscillator.type = 'sine';
          const thwipTime = this.audioContext.currentTime;
          oscillator.frequency.setValueAtTime(400, thwipTime);
          oscillator.frequency.exponentialRampToValueAtTime(2000, thwipTime + 0.05);
          oscillator.frequency.exponentialRampToValueAtTime(800, thwipTime + 0.12);
          gainNode.gain.setValueAtTime(volume * 0.5, thwipTime);
          gainNode.gain.setValueAtTime(volume * 0.6, thwipTime + 0.03);
          gainNode.gain.exponentialRampToValueAtTime(0.01, thwipTime + 0.15);
          oscillator.start();
          oscillator.stop(thwipTime + 0.15);
          break;

        case 'web_release':
          // Web detach sound - quick descending whoosh
          oscillator.type = 'triangle';
          const releaseTime = this.audioContext.currentTime;
          oscillator.frequency.setValueAtTime(600, releaseTime);
          oscillator.frequency.exponentialRampToValueAtTime(200, releaseTime + 0.1);
          gainNode.gain.setValueAtTime(volume * 0.35, releaseTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, releaseTime + 0.12);
          oscillator.start();
          oscillator.stop(releaseTime + 0.12);
          break;

        case 'wind_loop':
          // Wind rushing sound for swinging - creates noise burst
          const windSwingBuffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.8, this.audioContext.sampleRate);
          const windData = windSwingBuffer.getChannelData(0);
          for (let i = 0; i < windData.length; i++) {
            windData[i] = (Math.random() * 2 - 1) * 0.4;
          }
          const windSwingSource = this.audioContext.createBufferSource();
          windSwingSource.buffer = windSwingBuffer;
          const windSwingFilter = this.audioContext.createBiquadFilter();
          windSwingFilter.type = 'bandpass';
          windSwingFilter.frequency.value = 300;
          windSwingFilter.Q.value = 0.5;
          windSwingSource.connect(windSwingFilter);
          windSwingFilter.connect(gainNode);
          gainNode.gain.setValueAtTime(volume * 0.3, this.audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);
          windSwingSource.start();
          windSwingSource.stop(this.audioContext.currentTime + 0.8);
          return; // Don't start oscillator

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
    if (this.currentStreamAudio) {
      this.currentStreamAudio.pause();
      this.currentStreamAudio.src = '';
      this.currentStreamAudio = null;
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
    // Stop any existing audio
    if (this.currentRadioHowl) {
      this.currentRadioHowl.stop();
      this.currentRadioHowl.unload();
      this.currentRadioHowl = null;
    }
    if (this.currentStreamAudio) {
      this.currentStreamAudio.pause();
      this.currentStreamAudio.src = '';
      this.currentStreamAudio = null;
    }

    const station = this.radioStations[this.currentStationIndex];

    // Handle "Radio Off" station
    if (station.tracks.length === 0) {
      this.showRadioDisplay(station);
      return;
    }

    const isLive = station.isLiveStream === true;

    // Use native HTML5 Audio for live streams (more reliable)
    if (isLive && station.streamUrl) {
      console.log(`Loading live stream: ${station.name} from ${station.streamUrl}`);

      this.currentStreamAudio = new Audio();
      this.currentStreamAudio.crossOrigin = 'anonymous';
      this.currentStreamAudio.volume = this.config.radioVolume * this.config.masterVolume;
      this.currentStreamAudio.src = station.streamUrl;

      this.currentStreamAudio.oncanplay = () => {
        console.log(`Stream ready: ${station.name}`);
      };

      this.currentStreamAudio.onplay = () => {
        console.log(`Now playing (Live): ${station.name} - ${station.genre}`);
      };

      this.currentStreamAudio.onerror = (e) => {
        console.error(`Stream error: ${station.name}`, e);
        // Try to reconnect after a delay
        setTimeout(() => {
          if (this.isRadioPlaying && this.currentStationIndex === this.radioStations.indexOf(station)) {
            this.playCurrentStation();
          }
        }, 3000);
      };

      this.currentStreamAudio.play().catch(err => {
        console.error(`Failed to play stream: ${station.name}`, err);
      });

      this.showRadioDisplay(station);
      return;
    }

    // Use Howler for regular tracks
    const track = station.tracks[station.currentTrackIndex];
    if (!track?.file) {
      this.showRadioDisplay(station);
      return;
    }

    console.log(`Loading radio: ${station.name} - ${track.title}`);

    this.currentRadioHowl = new Howl({
      src: [track.file],
      html5: true,
      volume: this.config.radioVolume,
      loop: false,
      onload: () => {
        console.log(`Radio loaded: ${station.name} - ${track.title}`);
      },
      onplay: () => {
        console.log(`Now playing: ${station.name} - ${track.title} by ${track.artist}`);
      },
      onend: () => {
        this.nextTrack();
      },
      onloaderror: (_id: number, error: unknown) => {
        console.error(`Radio load error: ${station.name}`, error);
        setTimeout(() => {
          if (this.isRadioPlaying) {
            this.nextTrack();
          }
        }, 2000);
      },
      onplayerror: (_id: number, error: unknown) => {
        console.error(`Radio play error: ${station.name}`, error);
        if (this.currentRadioHowl) {
          this.currentRadioHowl.once('unlock', () => {
            this.currentRadioHowl?.play();
          });
        }
      }
    });

    this.currentRadioHowl.play();
    this.showRadioDisplay(station);
  }

  private nextTrack(): void {
    if (!this.isRadioPlaying) return;

    const station = this.radioStations[this.currentStationIndex];
    if (station.tracks.length === 0) return;

    // Cycle to next track
    station.currentTrackIndex = (station.currentTrackIndex + 1) % station.tracks.length;
    this.playCurrentStation();
  }

  private showRadioDisplay(station: RadioStation): void {
    const display = document.getElementById('radio-display');
    if (display) {
      const stationName = display.querySelector('.radio-station');
      const trackInfo = display.querySelector('.radio-song');

      if (stationName) {
        const liveIndicator = station.isLiveStream ? ' 🔴 LIVE' : '';
        stationName.textContent = `${station.icon} ${station.name}${liveIndicator}`;
      }

      if (trackInfo) {
        const track = station.tracks[station.currentTrackIndex];
        if (station.isLiveStream) {
          trackInfo.textContent = `${station.genre} - SomaFM`;
        } else if (track) {
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
    if (this.currentStreamAudio) {
      this.currentStreamAudio.volume = this.config.radioVolume * this.config.masterVolume;
    }
  }

  // Start ambient background music (plays when on foot)
  startAmbientMusic(): void {
    if (this.isAmbientMusicPlaying || this.isRadioPlaying) return;

    const stream = AMBIENT_MUSIC_STREAMS[this.currentAmbientIndex];
    console.log(`Starting ambient music: ${stream.name}`);

    this.ambientMusicAudio = new Audio();
    this.ambientMusicAudio.crossOrigin = 'anonymous';
    this.ambientMusicAudio.volume = this.config.musicVolume * this.config.masterVolume * 0.3; // Lower volume for ambient
    this.ambientMusicAudio.src = stream.url;

    this.ambientMusicAudio.onplay = () => {
      console.log(`Ambient music playing: ${stream.name}`);
    };

    this.ambientMusicAudio.onerror = () => {
      console.log(`Ambient stream failed, trying next...`);
      this.currentAmbientIndex = (this.currentAmbientIndex + 1) % AMBIENT_MUSIC_STREAMS.length;
      setTimeout(() => {
        if (!this.isRadioPlaying) {
          this.isAmbientMusicPlaying = false;
          this.startAmbientMusic();
        }
      }, 2000);
    };

    this.ambientMusicAudio.play().catch(() => {
      // Autoplay blocked, will start on user interaction
    });

    this.isAmbientMusicPlaying = true;
  }

  stopAmbientMusic(): void {
    if (this.ambientMusicAudio) {
      this.ambientMusicAudio.pause();
      this.ambientMusicAudio.src = '';
      this.ambientMusicAudio = null;
    }
    this.isAmbientMusicPlaying = false;
  }

  nextAmbientTrack(): void {
    this.currentAmbientIndex = (this.currentAmbientIndex + 1) % AMBIENT_MUSIC_STREAMS.length;
    if (this.isAmbientMusicPlaying) {
      this.stopAmbientMusic();
      this.startAmbientMusic();
    }
  }

  startAmbient(id: string): void {
    this.startAmbientMusic();
  }

  stopAmbient(id: string): void {
    this.stopAmbientMusic();
  }

  setAmbientVolume(id: string, volume: number): void {
    if (this.ambientMusicAudio) {
      this.ambientMusicAudio.volume = volume * this.config.masterVolume * 0.3;
    }
  }

  // ==================== HELICOPTER SOUND SYSTEM ====================

  private createNoiseBuffer(): AudioBuffer {
    if (this.helicopterNoiseBuffer) return this.helicopterNoiseBuffer;
    if (!this.audioContext) throw new Error('No audio context');

    // Create white noise buffer for wind sound
    const bufferSize = this.audioContext.sampleRate * 2; // 2 seconds of noise
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.helicopterNoiseBuffer = buffer;
    return buffer;
  }

  startHelicopterSound(): void {
    if (!this.audioContext || this.helicopterSoundActive) return;

    const ctx = this.audioContext;
    const masterVolume = this.config.sfxVolume * this.config.masterVolume * 0.4;

    // === MAIN ROTOR SOUND (low frequency thump) ===
    // Using multiple oscillators for richer sound
    this.helicopterRotorOsc = ctx.createOscillator();
    this.helicopterRotorGain = ctx.createGain();

    // Create a low-frequency modulator for the "blade pass" effect
    const rotorLFO = ctx.createOscillator();
    const rotorLFOGain = ctx.createGain();
    rotorLFO.frequency.value = 8; // ~8 Hz blade pass frequency (4 blades at 120 RPM)
    rotorLFOGain.gain.value = 30;
    rotorLFO.connect(rotorLFOGain);
    rotorLFOGain.connect(this.helicopterRotorOsc.frequency);

    this.helicopterRotorOsc.type = 'sawtooth';
    this.helicopterRotorOsc.frequency.value = 45; // Low bass rotor thump
    this.helicopterRotorGain.gain.value = masterVolume * 0.6;

    this.helicopterRotorOsc.connect(this.helicopterRotorGain);
    this.helicopterRotorGain.connect(ctx.destination);

    this.helicopterRotorOsc.start();
    rotorLFO.start();

    // === TAIL ROTOR SOUND (higher frequency whine) ===
    this.helicopterTailRotorOsc = ctx.createOscillator();
    this.helicopterTailRotorGain = ctx.createGain();

    this.helicopterTailRotorOsc.type = 'triangle';
    this.helicopterTailRotorOsc.frequency.value = 180; // Higher pitch tail rotor
    this.helicopterTailRotorGain.gain.value = masterVolume * 0.15;

    this.helicopterTailRotorOsc.connect(this.helicopterTailRotorGain);
    this.helicopterTailRotorGain.connect(ctx.destination);

    this.helicopterTailRotorOsc.start();

    // === TURBINE ENGINE WHINE ===
    this.helicopterTurbineOsc = ctx.createOscillator();
    this.helicopterTurbineGain = ctx.createGain();

    // High frequency turbine whine with slight warble
    const turbineLFO = ctx.createOscillator();
    const turbineLFOGain = ctx.createGain();
    turbineLFO.frequency.value = 3; // Slight warble
    turbineLFOGain.gain.value = 50;
    turbineLFO.connect(turbineLFOGain);
    turbineLFOGain.connect(this.helicopterTurbineOsc.frequency);

    this.helicopterTurbineOsc.type = 'sine';
    this.helicopterTurbineOsc.frequency.value = 800; // High turbine whine
    this.helicopterTurbineGain.gain.value = masterVolume * 0.08;

    // Add a filter to make it more realistic
    const turbineFilter = ctx.createBiquadFilter();
    turbineFilter.type = 'bandpass';
    turbineFilter.frequency.value = 1200;
    turbineFilter.Q.value = 2;

    this.helicopterTurbineOsc.connect(turbineFilter);
    turbineFilter.connect(this.helicopterTurbineGain);
    this.helicopterTurbineGain.connect(ctx.destination);

    this.helicopterTurbineOsc.start();
    turbineLFO.start();

    // === WIND NOISE (filtered noise) ===
    const noiseBuffer = this.createNoiseBuffer();
    this.helicopterWindNoise = ctx.createBufferSource();
    this.helicopterWindGain = ctx.createGain();

    this.helicopterWindNoise.buffer = noiseBuffer;
    this.helicopterWindNoise.loop = true;
    this.helicopterWindGain.gain.value = 0; // Start at 0, increases with speed

    // Filter the noise for wind-like sound
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 1;

    this.helicopterWindNoise.connect(windFilter);
    windFilter.connect(this.helicopterWindGain);
    this.helicopterWindGain.connect(ctx.destination);

    this.helicopterWindNoise.start();

    this.helicopterSoundActive = true;
    console.log('Helicopter sound started');
  }

  stopHelicopterSound(): void {
    if (!this.helicopterSoundActive) return;

    // Stop all oscillators and nodes
    try {
      if (this.helicopterRotorOsc) {
        this.helicopterRotorOsc.stop();
        this.helicopterRotorOsc.disconnect();
        this.helicopterRotorOsc = null;
      }
      if (this.helicopterRotorGain) {
        this.helicopterRotorGain.disconnect();
        this.helicopterRotorGain = null;
      }
      if (this.helicopterTailRotorOsc) {
        this.helicopterTailRotorOsc.stop();
        this.helicopterTailRotorOsc.disconnect();
        this.helicopterTailRotorOsc = null;
      }
      if (this.helicopterTailRotorGain) {
        this.helicopterTailRotorGain.disconnect();
        this.helicopterTailRotorGain = null;
      }
      if (this.helicopterTurbineOsc) {
        this.helicopterTurbineOsc.stop();
        this.helicopterTurbineOsc.disconnect();
        this.helicopterTurbineOsc = null;
      }
      if (this.helicopterTurbineGain) {
        this.helicopterTurbineGain.disconnect();
        this.helicopterTurbineGain = null;
      }
      if (this.helicopterWindNoise) {
        this.helicopterWindNoise.stop();
        this.helicopterWindNoise.disconnect();
        this.helicopterWindNoise = null;
      }
      if (this.helicopterWindGain) {
        this.helicopterWindGain.disconnect();
        this.helicopterWindGain = null;
      }
    } catch (e) {
      // Ignore errors during cleanup
    }

    this.helicopterSoundActive = false;
    console.log('Helicopter sound stopped');
  }

  updateHelicopterSound(collective: number, speed: number, altitude: number): void {
    if (!this.helicopterSoundActive || !this.audioContext) return;

    const masterVolume = this.config.sfxVolume * this.config.masterVolume * 0.4;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Rotor pitch changes with collective (power)
    // Higher collective = higher rotor load = lower pitch (lag), then higher as RPM recovers
    const rotorPitchMod = 1 + (collective * 0.15) - (speed * 0.002);
    const rotorFreq = 45 * Math.max(0.8, Math.min(1.3, rotorPitchMod));

    if (this.helicopterRotorOsc) {
      this.helicopterRotorOsc.frequency.setTargetAtTime(rotorFreq, now, 0.1);
    }

    // Rotor volume increases with collective input
    const rotorVolume = masterVolume * (0.5 + Math.abs(collective) * 0.3);
    if (this.helicopterRotorGain) {
      this.helicopterRotorGain.gain.setTargetAtTime(rotorVolume, now, 0.1);
    }

    // Tail rotor pitch varies slightly with collective (anti-torque)
    const tailPitch = 180 + collective * 40;
    if (this.helicopterTailRotorOsc) {
      this.helicopterTailRotorOsc.frequency.setTargetAtTime(tailPitch, now, 0.05);
    }

    // Turbine pitch increases with load
    const turbinePitch = 800 + Math.abs(collective) * 200 + speed * 5;
    if (this.helicopterTurbineOsc) {
      this.helicopterTurbineOsc.frequency.setTargetAtTime(turbinePitch, now, 0.2);
    }

    // Turbine volume increases with power demand
    const turbineVolume = masterVolume * (0.06 + Math.abs(collective) * 0.06);
    if (this.helicopterTurbineGain) {
      this.helicopterTurbineGain.gain.setTargetAtTime(turbineVolume, now, 0.1);
    }

    // Wind noise increases with speed
    const windVolume = masterVolume * Math.min(0.4, speed * 0.015);
    if (this.helicopterWindGain) {
      this.helicopterWindGain.gain.setTargetAtTime(windVolume, now, 0.2);
    }
  }

  isHelicopterSoundActive(): boolean {
    return this.helicopterSoundActive;
  }

  pauseAll(): void {
    this.isPaused = true;
    if (this.currentRadioHowl) {
      this.currentRadioHowl.pause();
    }
    if (this.currentStreamAudio) {
      this.currentStreamAudio.pause();
    }
    if (this.ambientMusicAudio) {
      this.ambientMusicAudio.pause();
    }
  }

  resumeAll(): void {
    this.isPaused = false;
    if (this.isRadioPlaying && this.currentRadioHowl) {
      this.currentRadioHowl.play();
    }
    if (this.isRadioPlaying && this.currentStreamAudio) {
      this.currentStreamAudio.play().catch(() => {});
    }
    if (this.isAmbientMusicPlaying && this.ambientMusicAudio) {
      this.ambientMusicAudio.play().catch(() => {});
    }
  }

  muteAll(): void {
    Howler.mute(true);
  }

  unmuteAll(): void {
    Howler.mute(false);
  }

  dispose(): void {
    this.stopAmbientMusic();
    this.stopHelicopterSound();
    if (this.currentRadioHowl) {
      this.currentRadioHowl.unload();
    }
    if (this.currentStreamAudio) {
      this.currentStreamAudio.pause();
      this.currentStreamAudio.src = '';
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    Howler.unload();
  }
}
