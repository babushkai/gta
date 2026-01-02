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
  NormalPass,
  ChromaticAberrationEffect
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
  private chromaticAberration: ChromaticAberrationEffect | null = null;
  private vignetteEffect: VignetteEffect | null = null;

  // Exposure control for day/night
  private targetExposure: number = 1.0;
  private currentExposure: number = 1.0;

  constructor(config: GraphicsConfig) {
    this.config = config;
    this.usePostProcessing = config.postProcessing;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: config.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      logarithmicDepthBuffer: true // Better depth precision for large scenes
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    if (config.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = true;
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

    // Normal pass required for SSAO
    const normalPass = new NormalPass(scene, camera);
    this.composer.addPass(normalPass);

    // First effect pass: SSAO (needs to be separate for performance)
    if (this.config.ssao) {
      this.ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
        intensity: 2.0,
        samples: 16,
        rings: 4,
        luminanceInfluence: 0.6,
        radius: 0.05,
        bias: 0.025,
        fade: 0.01,
        resolutionScale: 0.5 // Half resolution for performance
      });
      const ssaoPass = new EffectPass(camera, this.ssaoEffect);
      this.composer.addPass(ssaoPass);
    }

    // Second effect pass: Visual effects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visualEffects: any[] = [];

    // Enhanced bloom with better settings
    if (this.config.bloom) {
      this.bloomEffect = new BloomEffect({
        intensity: 0.6,
        luminanceThreshold: 0.7,
        luminanceSmoothing: 0.05,
        mipmapBlur: true,
        radius: 0.85
      });
      visualEffects.push(this.bloomEffect);
    }

    // Depth of Field for cinematic feel
    if (this.config.dof) {
      this.dofEffect = new DepthOfFieldEffect(camera, {
        focusDistance: 0.02,
        focalLength: 0.05,
        bokehScale: 3.0
      });
      visualEffects.push(this.dofEffect);
    }

    if (visualEffects.length > 0) {
      const visualPass = new EffectPass(camera, ...visualEffects);
      this.composer.addPass(visualPass);
    }

    // Third effect pass: Vignette and AA (cannot include chromatic aberration - convolution conflict)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalEffects: any[] = [];

    // Vignette for cinematic look
    this.vignetteEffect = new VignetteEffect({
      offset: 0.3,
      darkness: 0.5
    });
    finalEffects.push(this.vignetteEffect);

    // SMAA for high quality anti-aliasing
    const smaaEffect = new SMAAEffect();
    finalEffects.push(smaaEffect);

    if (finalEffects.length > 0) {
      const finalPass = new EffectPass(camera, ...finalEffects);
      this.composer.addPass(finalPass);
    }

    // Fourth effect pass: Chromatic aberration (must be separate - convolution effect)
    this.chromaticAberration = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0005, 0.0005),
      radialModulation: true,
      modulationOffset: 0.15
    });
    const chromaticPass = new EffectPass(camera, this.chromaticAberration);
    this.composer.addPass(chromaticPass);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Smooth exposure transitions
    if (Math.abs(this.currentExposure - this.targetExposure) > 0.01) {
      this.currentExposure += (this.targetExposure - this.currentExposure) * 0.02;
      this.renderer.toneMappingExposure = this.currentExposure;
    }

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

  // Exposure control for day/night transitions
  setExposure(exposure: number): void {
    this.targetExposure = Math.max(0.1, Math.min(3.0, exposure));
  }

  setExposureInstant(exposure: number): void {
    this.targetExposure = exposure;
    this.currentExposure = exposure;
    this.renderer.toneMappingExposure = exposure;
  }

  // Vignette control for damage effects
  setVignetteDarkness(darkness: number): void {
    if (this.vignetteEffect) {
      this.vignetteEffect.darkness = darkness;
    }
  }

  // Chromatic aberration for damage/drunk effects
  setChromaticAberration(intensity: number): void {
    if (this.chromaticAberration) {
      this.chromaticAberration.offset.set(intensity * 0.003, intensity * 0.003);
    }
  }

  // SSAO intensity for indoor/outdoor transitions
  setSSAOIntensity(intensity: number): void {
    if (this.ssaoEffect) {
      this.ssaoEffect.intensity = intensity;
    }
  }

  dispose(): void {
    this.renderer.dispose();
    if (this.composer) {
      this.composer.dispose();
    }
  }
}
