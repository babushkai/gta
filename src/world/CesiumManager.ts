import * as Cesium from 'cesium';
import * as THREE from 'three';
import { Game } from '@/core/Game';

// NYC Times Square coordinates as the game origin
const NYC_ORIGIN = {
  longitude: -73.9857,
  latitude: 40.7580,
  height: 0
};

// Cesium to Three.js coordinate conversion
// Cesium uses Earth-Centered-Earth-Fixed (ECEF)
// We need to convert to a local East-North-Up (ENU) frame

export class CesiumManager {
  private game: Game;
  private viewer: Cesium.Viewer | null = null;
  private tileset: Cesium.Cesium3DTileset | null = null;
  private cesiumContainer: HTMLDivElement | null = null;
  private originMatrix: Cesium.Matrix4;
  private inverseOriginMatrix: Cesium.Matrix4;
  private enabled: boolean = false;

  // Google Maps API key (user needs to provide their own)
  private apiKey: string = '';

  constructor(game: Game) {
    this.game = game;

    // Create transform matrices for NYC origin
    const originCartesian = Cesium.Cartesian3.fromDegrees(
      NYC_ORIGIN.longitude,
      NYC_ORIGIN.latitude,
      NYC_ORIGIN.height
    );

    // Get the local ENU frame at NYC origin
    this.originMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
    this.inverseOriginMatrix = Cesium.Matrix4.inverse(this.originMatrix, new Cesium.Matrix4());
  }

  async initialize(apiKey?: string): Promise<void> {
    if (apiKey) {
      this.apiKey = apiKey;
    }

    // Check if API key is available from environment
    if (!this.apiKey) {
      this.apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    }

    if (!this.apiKey) {
      console.warn('CesiumManager: No Google Maps API key provided. Using procedural buildings only.');
      console.log('To enable real NYC 3D tiles, set VITE_GOOGLE_MAPS_API_KEY in .env file');
      return;
    }

    try {
      // Create a hidden container for Cesium
      this.cesiumContainer = document.createElement('div');
      this.cesiumContainer.id = 'cesium-container';
      this.cesiumContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: -1;
      `;
      document.body.appendChild(this.cesiumContainer);

      // Initialize Cesium viewer with minimal UI
      this.viewer = new Cesium.Viewer(this.cesiumContainer, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        scene3DOnly: true,
        shadows: false,
        shouldAnimate: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });

      // Disable default controls - we control camera via Three.js
      this.viewer.scene.screenSpaceCameraController.enableRotate = false;
      this.viewer.scene.screenSpaceCameraController.enableTranslate = false;
      this.viewer.scene.screenSpaceCameraController.enableZoom = false;
      this.viewer.scene.screenSpaceCameraController.enableTilt = false;
      this.viewer.scene.screenSpaceCameraController.enableLook = false;

      // Load Google Photorealistic 3D Tiles
      await this.loadGoogleTiles();

      this.enabled = true;
      console.log('CesiumManager: Google 3D Tiles loaded successfully');

    } catch (error) {
      console.error('CesiumManager: Failed to initialize', error);
      this.dispose();
    }
  }

  private async loadGoogleTiles(): Promise<void> {
    if (!this.viewer) return;

    try {
      // Google Photorealistic 3D Tiles endpoint
      this.tileset = await Cesium.Cesium3DTileset.fromUrl(
        `https://tile.googleapis.com/v1/3dtiles/root.json?key=${this.apiKey}`,
        {
          maximumScreenSpaceError: 8, // Higher quality
          dynamicScreenSpaceError: true,
          dynamicScreenSpaceErrorDensity: 0.00278,
          dynamicScreenSpaceErrorFactor: 4.0,
          skipLevelOfDetail: true,
          baseScreenSpaceError: 1024,
          skipScreenSpaceErrorFactor: 16,
          skipLevels: 1,
          immediatelyLoadDesiredLevelOfDetail: false,
          loadSiblings: false,
          cullWithChildrenBounds: true,
          cacheBytes: 512 * 1024 * 1024 // 512MB cache
        }
      );

      this.viewer.scene.primitives.add(this.tileset);

      // Fly to NYC
      const nycPosition = Cesium.Cartesian3.fromDegrees(
        NYC_ORIGIN.longitude,
        NYC_ORIGIN.latitude,
        300 // Start at 300m height
      );

      this.viewer.camera.setView({
        destination: nycPosition,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0
        }
      });

    } catch (error) {
      console.error('Failed to load Google 3D Tiles:', error);
      throw error;
    }
  }

  update(deltaTime: number): void {
    if (!this.enabled || !this.viewer) return;

    // Sync Cesium camera with Three.js camera
    this.syncCameraFromThreeJS();

    // Request Cesium to render
    this.viewer.scene.requestRender();
  }

  private syncCameraFromThreeJS(): void {
    if (!this.viewer) return;

    const threeCamera = this.game.camera;
    const threePosition = threeCamera.position.clone();

    // Convert Three.js position (local ENU) to Cesium ECEF
    // In Three.js: X=East, Y=Up, Z=South (we use -Z as North)
    // In ENU: X=East, Y=North, Z=Up

    const enuPosition = new Cesium.Cartesian3(
      threePosition.x,
      -threePosition.z, // Three.js Z -> ENU Y (North)
      threePosition.y   // Three.js Y -> ENU Z (Up)
    );

    // Transform from ENU to ECEF
    const ecefPosition = Cesium.Matrix4.multiplyByPoint(
      this.originMatrix,
      enuPosition,
      new Cesium.Cartesian3()
    );

    // Get camera orientation from Three.js
    const euler = new THREE.Euler().setFromQuaternion(threeCamera.quaternion, 'YXZ');

    // Convert Three.js rotation to Cesium heading/pitch/roll
    // Three.js: rotationY is yaw (heading), rotationX is pitch
    const heading = -euler.y; // Negate because Cesium uses clockwise from North
    const pitch = euler.x;
    const roll = euler.z;

    // Set Cesium camera
    this.viewer.camera.setView({
      destination: ecefPosition,
      orientation: {
        heading: heading + Math.PI / 2, // Adjust for coordinate system
        pitch: pitch,
        roll: roll
      }
    });
  }

  // Convert a Three.js position to geographic coordinates
  threeToGeographic(position: THREE.Vector3): { longitude: number; latitude: number; height: number } {
    // Convert to ENU
    const enu = new Cesium.Cartesian3(
      position.x,
      -position.z,
      position.y
    );

    // Transform to ECEF
    const ecef = Cesium.Matrix4.multiplyByPoint(
      this.originMatrix,
      enu,
      new Cesium.Cartesian3()
    );

    // Convert to geographic
    const cartographic = Cesium.Cartographic.fromCartesian(ecef);

    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height
    };
  }

  // Convert geographic coordinates to Three.js position
  geographicToThree(longitude: number, latitude: number, height: number = 0): THREE.Vector3 {
    // Convert to ECEF
    const ecef = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);

    // Transform to ENU
    const enu = Cesium.Matrix4.multiplyByPoint(
      this.inverseOriginMatrix,
      ecef,
      new Cesium.Cartesian3()
    );

    // Convert ENU to Three.js coordinates
    return new THREE.Vector3(
      enu.x,
      enu.z, // ENU Z -> Three.js Y (up)
      -enu.y // ENU Y -> Three.js -Z (south)
    );
  }

  // Get the real-world bounding box for the play area
  getPlayAreaBounds(): { min: THREE.Vector3; max: THREE.Vector3 } {
    // Define play area as roughly 2km x 2km centered on Times Square
    const extent = 1000; // meters

    return {
      min: new THREE.Vector3(-extent, 0, -extent),
      max: new THREE.Vector3(extent, 500, extent) // 500m max height
    };
  }

  // Sample ground height at a position using Cesium terrain
  async getGroundHeight(position: THREE.Vector3): Promise<number> {
    if (!this.viewer || !this.tileset) {
      return 0;
    }

    const geo = this.threeToGeographic(position);
    const cartographic = Cesium.Cartographic.fromDegrees(geo.longitude, geo.latitude);

    try {
      const updatedPositions = await Cesium.sampleTerrainMostDetailed(
        this.viewer.terrainProvider,
        [cartographic]
      );
      return updatedPositions[0].height || 0;
    } catch {
      return 0;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.cesiumContainer) {
      this.cesiumContainer.style.display = enabled ? 'block' : 'none';
    }
  }

  // Quality settings
  setQuality(level: 'low' | 'medium' | 'high' | 'ultra'): void {
    if (!this.tileset) return;

    const settings = {
      low: { screenSpaceError: 32, cacheBytes: 128 * 1024 * 1024 },
      medium: { screenSpaceError: 16, cacheBytes: 256 * 1024 * 1024 },
      high: { screenSpaceError: 8, cacheBytes: 512 * 1024 * 1024 },
      ultra: { screenSpaceError: 4, cacheBytes: 1024 * 1024 * 1024 }
    };

    const config = settings[level];
    this.tileset.maximumScreenSpaceError = config.screenSpaceError;
    this.tileset.cacheBytes = config.cacheBytes;
  }

  dispose(): void {
    if (this.tileset && this.viewer) {
      this.viewer.scene.primitives.remove(this.tileset);
      this.tileset = null;
    }

    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }

    if (this.cesiumContainer && this.cesiumContainer.parentNode) {
      this.cesiumContainer.parentNode.removeChild(this.cesiumContainer);
      this.cesiumContainer = null;
    }

    this.enabled = false;
  }
}
