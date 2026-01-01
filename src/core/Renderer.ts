import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SSAOEffect,
  DepthOfFieldEffect,
  VignetteEffect,
  ToneMappingEffect,
  SMAAEffect,
  NormalPass
} from 'postprocessing';
import { GraphicsConfig } from '@/types';

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private config: GraphicsConfig;
  private canvas: HTMLCanvasElement;
  private usePostProcessing: boolean;

  private bloomEffect: BloomEffect | null = null;
  private ssaoEffect: SSAOEffect | null = null;
  private dofEffect: DepthOfFieldEffect | null = null;

  constructor(config: GraphicsConfig) {
    this.config = config;
    this.usePostProcessing = config.postProcessing;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: config.antialias,
      powerPreference: 'high-performance',
      stencil: false
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    if (config.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  async initialize(scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
    const container = document.getElementById('game-container');
    if (container) {
      container.insertBefore(this.canvas, container.firstChild);
    }

    if (this.usePostProcessing) {
      await this.setupPostProcessing(scene, camera);
    }
  }

  private async setupPostProcessing(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ): Promise<void> {
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType
    });

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Simplified effects to avoid shader uniform limits
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const effects: any[] = [];

    // Bloom only - most impactful visual effect
    if (this.config.bloom) {
      this.bloomEffect = new BloomEffect({
        intensity: 0.4,
        luminanceThreshold: 0.9,
        luminanceSmoothing: 0.025,
        mipmapBlur: true
      });
      effects.push(this.bloomEffect);
    }

    // Subtle vignette
    const vignetteEffect = new VignetteEffect({
      offset: 0.35,
      darkness: 0.4
    });
    effects.push(vignetteEffect);

    // SMAA for anti-aliasing
    const smaaEffect = new SMAAEffect();
    effects.push(smaaEffect);

    if (effects.length > 0) {
      const effectPass = new EffectPass(camera, ...effects);
      this.composer.addPass(effectPass);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.usePostProcessing && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  setBloomIntensity(intensity: number): void {
    if (this.bloomEffect) {
      this.bloomEffect.intensity = intensity;
    }
  }

  setDOFFocusDistance(distance: number): void {
    if (this.dofEffect) {
      this.dofEffect.circleOfConfusionMaterial.uniforms.focusDistance.value = distance;
    }
  }

  enablePostProcessing(enabled: boolean): void {
    this.usePostProcessing = enabled;
  }

  dispose(): void {
    this.renderer.dispose();
    if (this.composer) {
      this.composer.dispose();
    }
  }
}
