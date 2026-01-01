import * as THREE from 'three';
import gsap from 'gsap';
import { WeatherType, WeatherState, WeatherConfig } from '@/types';
import { Game } from '@/core/Game';

const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  clear: {
    type: 'clear',
    fogDensity: 0.0005,
    fogColor: 0x87ceeb,
    ambientLight: 0.6,
    sunIntensity: 1.5,
    rainIntensity: 0,
    cloudCoverage: 0.1
  },
  cloudy: {
    type: 'cloudy',
    fogDensity: 0.001,
    fogColor: 0x9ca5aa,
    ambientLight: 0.4,
    sunIntensity: 0.8,
    rainIntensity: 0,
    cloudCoverage: 0.7
  },
  rain: {
    type: 'rain',
    fogDensity: 0.002,
    fogColor: 0x6a7a7a,
    ambientLight: 0.3,
    sunIntensity: 0.4,
    rainIntensity: 0.7,
    cloudCoverage: 0.9
  },
  storm: {
    type: 'storm',
    fogDensity: 0.003,
    fogColor: 0x3a4a4a,
    ambientLight: 0.2,
    sunIntensity: 0.2,
    rainIntensity: 1.0,
    cloudCoverage: 1.0
  },
  fog: {
    type: 'fog',
    fogDensity: 0.01,
    fogColor: 0xcccccc,
    ambientLight: 0.35,
    sunIntensity: 0.5,
    rainIntensity: 0,
    cloudCoverage: 0.5
  }
};

export class WeatherSystem {
  private game: Game;
  private state: WeatherState;
  private config: WeatherConfig;

  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemisphere: THREE.HemisphereLight;

  private rainParticles: THREE.Points | null = null;
  private rainGeometry: THREE.BufferGeometry | null = null;
  private rainMaterial: THREE.PointsMaterial | null = null;
  private rainVelocities: Float32Array | null = null;

  private clouds: THREE.Mesh[] = [];
  private skybox: THREE.Mesh | null = null;

  private timeScale: number = 60;
  private weatherChangeTimer: number = 0;
  private nextWeatherChange: number = 120;

  private lightningTimer: number = 0;
  private lightningInterval: number = 5;

  constructor(game: Game) {
    this.game = game;
    this.config = WEATHER_CONFIGS.clear;

    this.state = {
      current: 'clear',
      intensity: 1,
      windDirection: new THREE.Vector3(1, 0, 0.5).normalize(),
      windSpeed: 5,
      temperature: 25,
      timeOfDay: 12,
      sunPosition: new THREE.Vector3()
    };

    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x555555, 0.5);
  }

  async initialize(): Promise<void> {
    this.setupLighting();
    this.createSkybox();
    this.createClouds();
    this.createRainSystem();
    this.setWeather('clear');
  }

  private setupLighting(): void {
    this.sun.position.set(100, 100, 50);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.camera.left = -150;
    this.sun.shadow.camera.right = 150;
    this.sun.shadow.camera.top = 150;
    this.sun.shadow.camera.bottom = -150;
    this.sun.shadow.bias = -0.0001;

    this.game.scene.add(this.sun);
    this.game.scene.add(this.sun.target);
    this.game.scene.add(this.ambient);
    this.game.scene.add(this.hemisphere);

    this.game.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0005);
  }

  private createSkybox(): void {
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });

    this.skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    this.game.scene.add(this.skybox);
  }

  private createClouds(): void {
    const cloudGeometry = new THREE.PlaneGeometry(100, 100);
    const cloudTexture = this.createCloudTexture();
    const cloudMaterial = new THREE.MeshBasicMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial.clone());
      cloud.position.set(
        (Math.random() - 0.5) * 800,
        80 + Math.random() * 40,
        (Math.random() - 0.5) * 800
      );
      cloud.rotation.x = -Math.PI / 2;
      cloud.scale.set(
        1 + Math.random() * 2,
        1 + Math.random() * 2,
        1
      );
      this.clouds.push(cloud);
      this.game.scene.add(cloud);
    }
  }

  private createCloudTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    return new THREE.CanvasTexture(canvas);
  }

  private createRainSystem(): void {
    const particleCount = 10000;
    const positions = new Float32Array(particleCount * 3);
    this.rainVelocities = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 100;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      this.rainVelocities[i] = 0.5 + Math.random() * 0.5;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 0.2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.rainParticles = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainParticles.visible = false;
    this.game.scene.add(this.rainParticles);
  }

  update(deltaTime: number): void {
    this.updateTimeOfDay(deltaTime);
    this.updateSunPosition();
    this.updateWeather(deltaTime);
    this.updateClouds(deltaTime);
    this.updateRain(deltaTime);
    this.updateLightning(deltaTime);
  }

  private updateTimeOfDay(deltaTime: number): void {
    this.state.timeOfDay += (deltaTime * this.timeScale) / 3600;
    if (this.state.timeOfDay >= 24) {
      this.state.timeOfDay -= 24;
    }
  }

  private updateSunPosition(): void {
    const time = this.state.timeOfDay;
    const angle = ((time - 6) / 24) * Math.PI * 2;

    this.state.sunPosition.set(
      Math.cos(angle) * 100,
      Math.sin(angle) * 100,
      50
    );

    this.sun.position.copy(this.state.sunPosition);
    this.sun.target.position.copy(this.game.player.position);

    const dayProgress = Math.sin(angle);
    const isDaytime = time > 6 && time < 20;

    let sunColor: THREE.Color;
    let sunIntensity: number;

    if (time >= 5 && time < 7) {
      sunColor = new THREE.Color(0xff7733);
      sunIntensity = 0.5 + ((time - 5) / 2) * 0.5;
    } else if (time >= 7 && time < 17) {
      sunColor = new THREE.Color(0xffffff);
      sunIntensity = this.config.sunIntensity;
    } else if (time >= 17 && time < 20) {
      sunColor = new THREE.Color(0xff5500);
      sunIntensity = 1 - ((time - 17) / 3) * 0.8;
    } else {
      sunColor = new THREE.Color(0x222244);
      sunIntensity = 0.1;
    }

    this.sun.color.copy(sunColor);
    this.sun.intensity = sunIntensity * this.config.sunIntensity;

    if (this.skybox) {
      const material = this.skybox.material as THREE.ShaderMaterial;
      if (isDaytime) {
        material.uniforms.topColor.value.setHex(0x0077ff);
        material.uniforms.bottomColor.value.setHex(0x87ceeb);
      } else if (time >= 17 && time < 20) {
        material.uniforms.topColor.value.setHex(0xff5533);
        material.uniforms.bottomColor.value.setHex(0xffaa66);
      } else {
        material.uniforms.topColor.value.setHex(0x000022);
        material.uniforms.bottomColor.value.setHex(0x111133);
      }
    }

    const ambientIntensity = isDaytime
      ? this.config.ambientLight
      : this.config.ambientLight * 0.3;
    this.ambient.intensity = ambientIntensity;

    if (this.game.scene.fog) {
      const fog = this.game.scene.fog as THREE.FogExp2;
      const fogColor = isDaytime ? this.config.fogColor : 0x111122;
      fog.color.setHex(fogColor);
    }
  }

  private updateWeather(deltaTime: number): void {
    this.weatherChangeTimer += deltaTime;

    if (this.weatherChangeTimer >= this.nextWeatherChange) {
      this.weatherChangeTimer = 0;
      this.nextWeatherChange = 60 + Math.random() * 180;
      this.randomWeatherChange();
    }
  }

  private randomWeatherChange(): void {
    const weathers: WeatherType[] = ['clear', 'cloudy', 'rain', 'fog'];
    const weights = [0.4, 0.3, 0.2, 0.1];

    let random = Math.random();
    let selectedWeather: WeatherType = 'clear';

    for (let i = 0; i < weathers.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedWeather = weathers[i];
        break;
      }
    }

    this.setWeather(selectedWeather);
  }

  private updateClouds(deltaTime: number): void {
    const windSpeed = this.state.windSpeed * deltaTime;

    this.clouds.forEach(cloud => {
      cloud.position.x += this.state.windDirection.x * windSpeed;
      cloud.position.z += this.state.windDirection.z * windSpeed;

      if (cloud.position.x > 400) cloud.position.x = -400;
      if (cloud.position.x < -400) cloud.position.x = 400;
      if (cloud.position.z > 400) cloud.position.z = -400;
      if (cloud.position.z < -400) cloud.position.z = 400;

      const cloudMaterial = cloud.material as THREE.MeshBasicMaterial;
      cloudMaterial.opacity = this.config.cloudCoverage * 0.6;
    });
  }

  private updateRain(deltaTime: number): void {
    if (!this.rainParticles || !this.rainGeometry || !this.rainVelocities) return;

    this.rainParticles.visible = this.config.rainIntensity > 0;
    if (!this.rainParticles.visible) return;

    const positions = this.rainGeometry.attributes.position.array as Float32Array;
    const playerPos = this.game.player.position;
    const rainSpeed = 50 * this.config.rainIntensity;

    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] -= rainSpeed * deltaTime * this.rainVelocities[i];

      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 80 + Math.random() * 20;
        positions[i * 3] = playerPos.x + (Math.random() - 0.5) * 200;
        positions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * 200;
      }
    }

    this.rainGeometry.attributes.position.needsUpdate = true;
    this.rainParticles.position.set(0, 0, 0);
  }

  private updateLightning(deltaTime: number): void {
    if (this.state.current !== 'storm') return;

    this.lightningTimer += deltaTime;

    if (this.lightningTimer >= this.lightningInterval) {
      this.lightningTimer = 0;
      this.lightningInterval = 3 + Math.random() * 10;

      if (Math.random() < 0.5) {
        this.triggerLightning();
      }
    }
  }

  private triggerLightning(): void {
    const originalIntensity = this.ambient.intensity;

    gsap.to(this.ambient, {
      intensity: 3,
      duration: 0.05,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.ambient.intensity = originalIntensity;
      }
    });

    setTimeout(() => {
      this.game.audio.playSound('thunder');
    }, 500 + Math.random() * 2000);
  }

  setWeather(type: WeatherType, instant: boolean = false): void {
    const newConfig = WEATHER_CONFIGS[type];
    this.state.current = type;

    if (instant) {
      this.config = { ...newConfig };
      this.applyWeatherConfig();
    } else {
      gsap.to(this.config, {
        fogDensity: newConfig.fogDensity,
        fogColor: newConfig.fogColor,
        ambientLight: newConfig.ambientLight,
        sunIntensity: newConfig.sunIntensity,
        rainIntensity: newConfig.rainIntensity,
        cloudCoverage: newConfig.cloudCoverage,
        duration: 5,
        onUpdate: () => this.applyWeatherConfig()
      });
    }
  }

  private applyWeatherConfig(): void {
    if (this.game.scene.fog) {
      const fog = this.game.scene.fog as THREE.FogExp2;
      fog.density = this.config.fogDensity;
    }

    if (this.rainMaterial) {
      this.rainMaterial.opacity = this.config.rainIntensity * 0.6;
    }
  }

  getCurrentWeather(): WeatherType {
    return this.state.current;
  }

  getTimeOfDay(): number {
    return this.state.timeOfDay;
  }

  setTimeOfDay(time: number): void {
    this.state.timeOfDay = time % 24;
  }

  getFormattedTime(): string {
    const hours = Math.floor(this.state.timeOfDay);
    const minutes = Math.floor((this.state.timeOfDay % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  getWeatherState(): WeatherState {
    return { ...this.state };
  }

  dispose(): void {
    if (this.rainParticles) {
      this.game.scene.remove(this.rainParticles);
      this.rainGeometry?.dispose();
      this.rainMaterial?.dispose();
    }

    this.clouds.forEach(cloud => {
      this.game.scene.remove(cloud);
    });

    if (this.skybox) {
      this.game.scene.remove(this.skybox);
    }

    this.game.scene.remove(this.sun);
    this.game.scene.remove(this.ambient);
    this.game.scene.remove(this.hemisphere);
  }
}
