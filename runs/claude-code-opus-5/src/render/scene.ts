/**
 * The renderer: everything Three.js related is assembled here.
 *
 * It reads simulation state and draws it. It never writes to the simulation and
 * it never creates a DOM control — the only element it touches is the canvas.
 */

import * as THREE from 'three';
import { World } from '../app/world';
import { SIM_TUNING, type AppConfig } from '../app/config';
import { createSky, DEFAULT_SKY, type SkyRig } from './sky';
import { createTerrainMesh, createGroundPlane } from './terrainMesh';
import { WaterMesh } from './waterMesh';
import { CameraRig } from './cameraRig';
import { RainField } from './rain';

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly rig: CameraRig;
  readonly sky: SkyRig;
  readonly water: WaterMesh;
  readonly rain: RainField | null;

  private readonly world: World;
  private readonly config: AppConfig;
  private readonly canvas: HTMLCanvasElement;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, world: World, config: AppConfig) {
    this.canvas = canvas;
    this.world = world;
    this.config = config;

    const terrain = world.terrain;
    const worldSize = terrain.worldSize;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(DEFAULT_SKY.horizon, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = config.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.sky = createSky(this.scene, worldSize);
    if (!config.shadows) this.sky.sun.castShadow = false;

    const terrainMesh = createTerrainMesh(terrain);
    this.scene.add(terrainMesh.mesh);
    this.scene.add(createGroundPlane(terrain, terrainMesh.borderColor));

    this.water = new WaterMesh(terrain, {
      sunDirection: this.sky.sunDirection,
      skyColor: DEFAULT_SKY.horizon,
      dryThreshold: SIM_TUNING.dryThreshold,
      maxAlpha: 0.92,
    });
    this.scene.add(this.water.mesh);

    this.rain = config.showRain
      ? new RainField(config.seed, worldSize, terrain.maxHeight + 55, terrain.minHeight - 2)
      : null;
    if (this.rain) this.scene.add(this.rain.points);

    // Frame the massif: orbit radius and altitude scale with the world size so
    // any `?size=` still looks correctly composed.
    this.rig = new CameraRig(this.aspect(), {
      orbitSpeed: config.cameraSpeed,
      radius: worldSize * 0.72,
      radiusVariation: worldSize * 0.13,
      height: terrain.maxHeight * 0.78 + worldSize * 0.05,
      heightVariation: terrain.maxHeight * 0.3,
      targetHeight: terrain.minHeight + (terrain.maxHeight - terrain.minHeight) * 0.45,
    });

    this.resize();
  }

  private aspect(): number {
    const w = this.canvas.clientWidth || window.innerWidth || 1;
    const h = this.canvas.clientHeight || window.innerHeight || 1;
    return w / h;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / Math.max(1, h));
  }

  /**
   * @param elapsed wall-clock seconds since start (drives camera and shaders)
   * @param dt      seconds since the previous frame
   */
  render(elapsed: number, dt: number): void {
    if (this.disposed) return;
    this.rig.update(elapsed, dt);
    this.water.update(this.world.sim, elapsed);
    if (this.rain) this.rain.update(elapsed, this.world.rainIntensity * this.config.rainIntensity);

    // Keep the shadow frustum centred under the camera's look-at point.
    this.sky.sun.position
      .copy(this.sky.sunDirection)
      .multiplyScalar(this.world.terrain.worldSize)
      .add(this.sky.sun.target.position);
    this.sky.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.water.dispose();
    this.rain?.dispose();
    this.renderer.dispose();
  }
}
