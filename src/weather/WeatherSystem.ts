import * as THREE from 'three';
import gsap from 'gsap';
import { WeatherType, WeatherState, WeatherConfig } from '@/types';
import { Game } from '@/core/Game';

// NYC atmospheric constants
const NYC_ATMOSPHERIC = {
  // Typical NYC visibility ranges based on weather
  visibility: {
    clear: 30, // km - clearer days
    hazy: 10,  // km - typical humid day
    foggy: 2,  // km - fog
    stormy: 5  // km - rain
  },
  // Light scattering colors for NYC atmosphere
  scattering: {
    day: new THREE.Color(0.6, 0.75, 0.9),    // Blue-ish haze
    sunset: new THREE.Color(0.9, 0.6, 0.4),   // Orange-pink
    night: new THREE.Color(0.15, 0.1, 0.2)    // Purple-ish city glow
  }
};

const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  clear: {
    type: 'clear',
    fogDensity: 0.0002,
    fogColor: 0xAABBCC,
    ambientLight: 0.9,
    sunIntensity: 2.0,
    rainIntensity: 0,
    cloudCoverage: 0.1
  },
  cloudy: {
    type: 'cloudy',
    fogDensity: 0.0005,
    fogColor: 0xB0B8C0,
    ambientLight: 0.7,
    sunIntensity: 1.2,
    rainIntensity: 0,
    cloudCoverage: 0.7
  },
  rain: {
    type: 'rain',
    fogDensity: 0.001,
    fogColor: 0x8A9A9A,
    ambientLight: 0.5,
    sunIntensity: 0.6,
    rainIntensity: 0.7,
    cloudCoverage: 0.9
  },
  storm: {
    type: 'storm',
    fogDensity: 0.002,
    fogColor: 0x5A6A6A,
    ambientLight: 0.35,
    sunIntensity: 0.3,
    rainIntensity: 1.0,
    cloudCoverage: 1.0
  },
  fog: {
    type: 'fog',
    fogDensity: 0.005,
    fogColor: 0xDDDDDD,
    ambientLight: 0.55,
    sunIntensity: 0.7,
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

  // Environment map for realistic reflections
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private envMapScene: THREE.Scene | null = null;
  private envMapCamera: THREE.CubeCamera | null = null;
  private envMapRenderTarget: THREE.WebGLCubeRenderTarget | null = null;
  private envMapUpdateTimer: number = 0;
  private envMapUpdateInterval: number = 2; // Update every 2 seconds

  // Enhanced atmospheric fog
  private atmosphericFog: THREE.FogExp2 | null = null;
  private distanceFog: THREE.Fog | null = null;

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
      timeOfDay: 12, // Noon - clear blue sky
      sunPosition: new THREE.Vector3()
    };

    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.ambient = new THREE.AmbientLight(0x606080, 0.8);
    this.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x8B7355, 0.7);
  }

  async initialize(): Promise<void> {
    this.setupLighting();
    this.createSkybox();
    this.createClouds();
    this.createRainSystem();
    this.setupEnvironmentMap();
    this.setupAtmosphericFog();
    this.setWeather('clear');
  }

  private setupEnvironmentMap(): void {
    const renderer = this.game.renderer.getRenderer();

    // Create PMREM generator for converting environment maps
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    // Create a render target for dynamic environment map
    this.envMapRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter
    });

    // Create cube camera for capturing environment
    this.envMapCamera = new THREE.CubeCamera(0.1, 1000, this.envMapRenderTarget);
    this.envMapCamera.position.set(0, 20, 0); // Above ground level

    // Create a separate scene for environment map (skybox only)
    this.envMapScene = new THREE.Scene();

    // Clone skybox for env map scene
    if (this.skybox) {
      const skyClone = this.skybox.clone();
      this.envMapScene.add(skyClone);
    }

    // Initial environment map update
    this.updateEnvironmentMap();
  }

  private updateEnvironmentMap(): void {
    if (!this.envMapCamera || !this.envMapRenderTarget || !this.envMapScene) return;

    const renderer = this.game.renderer.getRenderer();

    // Update the skybox clone in env map scene to match current sky state
    if (this.envMapScene.children.length > 0 && this.skybox) {
      const skyClone = this.envMapScene.children[0] as THREE.Mesh;
      const originalMat = this.skybox.material as THREE.ShaderMaterial;
      const cloneMat = skyClone.material as THREE.ShaderMaterial;

      // Copy uniform values
      if (cloneMat.uniforms && originalMat.uniforms) {
        Object.keys(originalMat.uniforms).forEach(key => {
          if (cloneMat.uniforms[key]) {
            cloneMat.uniforms[key].value = originalMat.uniforms[key].value;
          }
        });
      }
    }

    // Render environment map
    this.envMapCamera.update(renderer, this.envMapScene);

    // Apply to scene as environment map for reflections
    this.game.scene.environment = this.envMapRenderTarget.texture;
  }

  private setupAtmosphericFog(): void {
    // NYC-style atmospheric haze - light fog for depth without darkening
    // Use exponential fog for natural falloff
    const baseVisibility = NYC_ATMOSPHERIC.visibility.clear; // Use clear visibility
    const fogDensity = 1 / (baseVisibility * 200); // Much lighter fog

    this.atmosphericFog = new THREE.FogExp2(0xAABBCC, fogDensity); // Lighter blue-gray
    this.game.scene.fog = this.atmosphericFog;

    // Also create a linear fog for distant objects
    this.distanceFog = new THREE.Fog(0xAABBCC, 200, 1500); // Push fog further
  }

  private updateAtmosphericFog(): void {
    if (!this.atmosphericFog) return;

    const time = this.state.timeOfDay;
    const isDaytime = time > 6 && time < 20;
    const isSunset = time >= 17 && time < 20;
    const isSunrise = time >= 5 && time < 7;

    // Determine visibility based on weather and time
    let visibility: number;
    switch (this.state.current) {
      case 'clear':
        visibility = NYC_ATMOSPHERIC.visibility.clear;
        break;
      case 'fog':
        visibility = NYC_ATMOSPHERIC.visibility.foggy;
        break;
      case 'rain':
      case 'storm':
        visibility = NYC_ATMOSPHERIC.visibility.stormy;
        break;
      default:
        visibility = NYC_ATMOSPHERIC.visibility.hazy;
    }

    // Calculate fog density
    const fogDensity = 1 / (visibility * 80);

    // Smoothly transition fog density
    this.atmosphericFog.density += (fogDensity - this.atmosphericFog.density) * 0.02;

    // Calculate fog color based on time and weather
    let fogColor: THREE.Color;

    if (!isDaytime) {
      // Night - purple-ish city glow from light pollution
      fogColor = NYC_ATMOSPHERIC.scattering.night.clone();
      // Add some orange from street lights
      fogColor.lerp(new THREE.Color(0.2, 0.15, 0.1), 0.3);
    } else if (isSunset) {
      // Sunset - warm orange-pink haze
      const t = (time - 17) / 3;
      fogColor = NYC_ATMOSPHERIC.scattering.day.clone();
      fogColor.lerp(NYC_ATMOSPHERIC.scattering.sunset, t);
    } else if (isSunrise) {
      // Sunrise - transitioning from night to day
      const t = (time - 5) / 2;
      fogColor = NYC_ATMOSPHERIC.scattering.night.clone();
      fogColor.lerp(NYC_ATMOSPHERIC.scattering.day, t);
    } else {
      // Daytime - blue-ish atmospheric haze
      fogColor = NYC_ATMOSPHERIC.scattering.day.clone();
    }

    // Weather affects fog color
    if (this.state.current === 'rain' || this.state.current === 'storm') {
      fogColor.lerp(new THREE.Color(0.4, 0.45, 0.5), 0.5);
    } else if (this.state.current === 'fog') {
      fogColor.lerp(new THREE.Color(0.7, 0.7, 0.7), 0.7);
    }

    // Apply fog color
    this.atmosphericFog.color.lerp(fogColor, 0.05);

    // Update distance fog as well
    if (this.distanceFog) {
      this.distanceFog.color.copy(this.atmosphericFog.color);
    }
  }

  private setupLighting(): void {
    this.sun.position.set(100, 100, 50);
    this.sun.castShadow = true;

    // Detect mobile for performance adjustments
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window);

    // Shadow quality - higher resolution for desktop, lower for mobile
    const shadowMapSize = isMobile ? 1024 : 2048;
    this.sun.shadow.mapSize.width = shadowMapSize;
    this.sun.shadow.mapSize.height = shadowMapSize;

    // Shadow camera follows player - covers area around player
    // Increased range for better shadow coverage of tall buildings
    const shadowRange = isMobile ? 80 : 120;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 300; // Shadow range for nearby objects only
    this.sun.shadow.camera.left = -shadowRange;
    this.sun.shadow.camera.right = shadowRange;
    this.sun.shadow.camera.top = shadowRange;
    this.sun.shadow.camera.bottom = -shadowRange;

    // Improved shadow bias to reduce peter-panning and shadow acne
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = isMobile ? 1 : 2; // Softer on desktop

    // Add a secondary fill light to simulate sky bounce light
    const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.25);
    fillLight.position.set(-50, 40, -50);
    this.game.scene.add(fillLight);

    // Add rim light for dramatic NYC silhouettes
    const rimLight = new THREE.DirectionalLight(0xffeedd, 0.15);
    rimLight.position.set(0, 20, -100);
    this.game.scene.add(rimLight);

    this.game.scene.add(this.sun);
    this.game.scene.add(this.sun.target);
    this.game.scene.add(this.ambient);
    this.game.scene.add(this.hemisphere);

    // Note: Fog is now set up in setupAtmosphericFog()
  }

  private createSkybox(): void {
    // Sky sphere - use a very large sphere that won't interfere with shadows
    const skyGeometry = new THREE.SphereGeometry(4000, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        horizonColor: { value: new THREE.Color(0x87ceeb) },
        sunPosition: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xffffee) },
        moonPosition: { value: new THREE.Vector3(0, -1, 0) },
        starIntensity: { value: 0.0 },
        time: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 horizonColor;
        uniform vec3 sunPosition;
        uniform vec3 sunColor;
        uniform vec3 moonPosition;
        uniform float starIntensity;
        uniform float time;
        varying vec3 vWorldPosition;
        varying vec3 vPosition;

        // Pseudo-random for stars
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 direction = normalize(vWorldPosition);
          float h = direction.y;

          // Sky gradient with smooth horizon blend
          vec3 skyColor;
          if (h > 0.0) {
            // Above horizon
            float t = pow(h, 0.4);
            skyColor = mix(horizonColor, topColor, t);
          } else {
            // Below horizon - blend to ground color
            float t = pow(min(-h + 0.1, 1.0), 0.5);
            skyColor = mix(horizonColor, bottomColor, t);
          }

          // Sun disk and glow
          vec3 sunDir = normalize(sunPosition);
          float sunDot = dot(direction, sunDir);

          if (sunDot > 0.0 && sunDir.y > -0.2) {
            // Sun disk
            float sunSize = 0.9995;
            if (sunDot > sunSize) {
              float sunEdge = smoothstep(sunSize, 0.9999, sunDot);
              skyColor = mix(skyColor, sunColor * 2.0, sunEdge);
            }
            // Sun glow corona
            float corona = pow(max(sunDot, 0.0), 8.0) * 0.5;
            skyColor += sunColor * corona;

            // Atmospheric scattering near horizon during sunset/sunrise
            if (sunDir.y < 0.3 && sunDir.y > -0.1) {
              float scatterAmount = pow(max(sunDot, 0.0), 2.0) * (1.0 - sunDir.y * 3.0);
              skyColor = mix(skyColor, vec3(1.0, 0.6, 0.3), scatterAmount * 0.4);
            }
          }

          // Moon
          vec3 moonDir = normalize(moonPosition);
          float moonDot = dot(direction, moonDir);
          if (moonDot > 0.999 && moonDir.y > 0.0) {
            float moonEdge = smoothstep(0.999, 0.9995, moonDot);
            skyColor = mix(skyColor, vec3(0.9, 0.9, 1.0), moonEdge * starIntensity);
          }

          // Stars (only visible at night, above horizon)
          if (starIntensity > 0.0 && h > 0.0) {
            vec2 starCoord = vPosition.xz / (h + 0.1) * 50.0;
            float star = hash(floor(starCoord));
            if (star > 0.99) {
              float twinkle = sin(time * 3.0 + star * 100.0) * 0.5 + 0.5;
              float starBrightness = (star - 0.99) * 100.0 * twinkle;
              skyColor += vec3(starBrightness) * starIntensity * h;
            }
          }

          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false, // Always render behind everything
      fog: false // Don't apply scene fog to skybox
    });

    this.skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    this.skybox.receiveShadow = false;
    this.skybox.castShadow = false;
    this.skybox.renderOrder = -1000; // Render skybox first (background)
    this.skybox.frustumCulled = false; // Always render skybox
    this.skybox.name = 'skybox';
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
    this.updateAtmosphericFog();

    // Update environment map periodically (not every frame for performance)
    this.envMapUpdateTimer += deltaTime;
    if (this.envMapUpdateTimer >= this.envMapUpdateInterval) {
      this.envMapUpdateTimer = 0;
      this.updateEnvironmentMap();
    }
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

    // Sun position for the sky (spherical coordinates)
    this.state.sunPosition.set(
      Math.cos(angle) * 100,
      Math.sin(angle) * 100,
      50
    );

    // Position sun relative to player for correct shadow rendering
    const playerPos = this.game.player.position;
    const sunOffset = new THREE.Vector3(
      Math.cos(angle) * 150,
      Math.max(Math.sin(angle) * 150, 20), // Keep sun above horizon for shadows
      75
    );
    this.sun.position.copy(playerPos).add(sunOffset);
    this.sun.target.position.copy(playerPos);

    const isDaytime = time > 6 && time < 20;
    const isSunset = time >= 17 && time < 20;
    const isSunrise = time >= 5 && time < 7;

    let sunColor: THREE.Color;
    let sunIntensity: number;

    if (isSunrise) {
      sunColor = new THREE.Color(0xff7733);
      sunIntensity = 0.5 + ((time - 5) / 2) * 0.5;
    } else if (time >= 7 && time < 17) {
      sunColor = new THREE.Color(0xffffff);
      sunIntensity = this.config.sunIntensity;
    } else if (isSunset) {
      sunColor = new THREE.Color(0xff5500);
      sunIntensity = 1 - ((time - 17) / 3) * 0.8;
    } else {
      sunColor = new THREE.Color(0x222244);
      sunIntensity = 0.1;
    }

    this.sun.color.copy(sunColor);
    this.sun.intensity = sunIntensity * this.config.sunIntensity;

    // Update exposure based on time of day
    if (isDaytime) {
      this.game.renderer.setExposure(1.0);
    } else if (isSunset || isSunrise) {
      this.game.renderer.setExposure(1.2);
    } else {
      this.game.renderer.setExposure(0.6);
    }

    if (this.skybox) {
      const material = this.skybox.material as THREE.ShaderMaterial;

      // Update sun/moon positions in shader
      material.uniforms.sunPosition.value.copy(this.state.sunPosition.clone().normalize());
      material.uniforms.moonPosition.value.set(
        -Math.cos(angle) * 0.8,
        -Math.sin(angle) * 0.8,
        0.3
      ).normalize();

      // Update time for star twinkling
      material.uniforms.time.value = performance.now() * 0.001;

      // Calculate star intensity (visible at night)
      let starIntensity = 0;
      if (time < 5 || time > 21) {
        starIntensity = 1.0;
      } else if (time >= 5 && time < 7) {
        starIntensity = 1.0 - (time - 5) / 2;
      } else if (time >= 19 && time <= 21) {
        starIntensity = (time - 19) / 2;
      }
      material.uniforms.starIntensity.value = starIntensity * (1 - this.config.cloudCoverage);

      // Sky colors based on time
      if (isDaytime && !isSunset) {
        material.uniforms.topColor.value.setHex(0x0066dd);
        material.uniforms.bottomColor.value.setHex(0x88bbee);
        material.uniforms.horizonColor.value.setHex(0xaaddff);
        material.uniforms.sunColor.value.setHex(0xffffee);
      } else if (isSunrise) {
        const t = (time - 5) / 2;
        material.uniforms.topColor.value.setHex(0x1144aa);
        material.uniforms.bottomColor.value.lerpColors(
          new THREE.Color(0xff6633),
          new THREE.Color(0x88bbee),
          t
        );
        material.uniforms.horizonColor.value.setHex(0xffaa66);
        material.uniforms.sunColor.value.setHex(0xffaa44);
      } else if (isSunset) {
        // Lofi sunset - warm pink/purple/orange tones
        const t = (time - 17) / 3;
        material.uniforms.topColor.value.lerpColors(
          new THREE.Color(0x5544aa), // Purple-blue
          new THREE.Color(0x1a1133), // Deep purple night
          t
        );
        material.uniforms.bottomColor.value.lerpColors(
          new THREE.Color(0xff6688), // Pink-orange
          new THREE.Color(0x331122), // Deep magenta
          t
        );
        material.uniforms.horizonColor.value.lerpColors(
          new THREE.Color(0xff8866), // Warm orange
          new THREE.Color(0x663355), // Purple haze
          t * 0.7
        );
        material.uniforms.sunColor.value.setHex(0xff7744);
      } else {
        // Night - NYC light pollution creates orange-purple horizon glow
        material.uniforms.topColor.value.setHex(0x0a0a1a); // Deep blue-black sky
        material.uniforms.bottomColor.value.setHex(0x1a1520); // Purple-tinted from city lights
        // NYC iconic orange-ish horizon glow from millions of lights
        material.uniforms.horizonColor.value.setHex(0x2a2035);
        material.uniforms.sunColor.value.setHex(0x444466);
      }
    }

    // Ambient intensity with NYC light pollution boost at night
    let ambientIntensity: number;
    if (isDaytime) {
      ambientIntensity = this.config.ambientLight;
    } else {
      // NYC never gets truly dark - light pollution provides ambient illumination
      ambientIntensity = this.config.ambientLight * 0.4;
    }
    this.ambient.intensity = ambientIntensity;

    // Update hemisphere light colors with NYC characteristics
    if (isDaytime && !isSunset) {
      this.hemisphere.color.setHex(0x87ceeb); // Sky blue
      this.hemisphere.groundColor.setHex(0x556655); // Green-ish ground bounce
      this.hemisphere.intensity = 0.5;
    } else if (isSunset) {
      // Lofi golden hour - warm pink/orange lighting
      this.hemisphere.color.setHex(0xff8877); // Warm pink-orange sky
      this.hemisphere.groundColor.setHex(0x554433); // Warm amber ground
      this.hemisphere.intensity = 0.7;
    } else {
      // Night - orange tint from street lights, purple from sky
      this.hemisphere.color.setHex(0x1a1a33); // Dark purple sky
      this.hemisphere.groundColor.setHex(0x332211); // Warm street light bounce
      this.hemisphere.intensity = 0.35;
    }

    // Note: Fog is now handled by updateAtmosphericFog()
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

    // Dispose environment map resources
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
    }
    if (this.envMapRenderTarget) {
      this.envMapRenderTarget.dispose();
    }

    this.game.scene.remove(this.sun);
    this.game.scene.remove(this.ambient);
    this.game.scene.remove(this.hemisphere);
  }
}
