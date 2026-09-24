import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { World } from '../sim/world';
import { CameraRig } from './cameraRig';
import { FOG_COLOR, SUN_COLOR } from './palette';
import { RainView } from './rain';
import { createSky } from './sky';
import { TerrainView } from './terrainMesh';
import { WaterView } from './waterMesh';

export interface SceneViewOptions {
  orbitSpeed: number;
  seed: number;
}

/**
 * Owns everything Three.js: renderer, scene graph, lights and the individual
 * views. It reads the simulation state but never modifies it.
 */
export class SceneView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly terrainView: TerrainView;
  private readonly waterView: WaterView;
  private readonly rainView: RainView;
  private readonly rig: CameraRig;
  private readonly sky: Mesh;
  private wetTimer = 0;

  constructor(container: HTMLElement, private readonly world: World, options: SceneViewOptions) {
    const { terrain } = world;
    const extent = terrain.size - 1;

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(FOG_COLOR, 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = FOG_COLOR.clone();
    this.scene.fog = new Fog(FOG_COLOR, extent * 1.1, extent * 3.4);

    this.camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, extent * 24);

    const sunDir = new Vector3(0.55, 0.62, 0.35).normalize();
    const sun = new DirectionalLight(SUN_COLOR, 2.4);
    sun.position.copy(sunDir).multiplyScalar(extent * 1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = extent * 0.75;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: extent * 3 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
    this.scene.add(new HemisphereLight('#cfe9ff', '#5d6b3f', 1.5));

    this.sky = createSky(extent * 20, sunDir);
    this.scene.add(this.sky);

    this.terrainView = new TerrainView(terrain);
    this.scene.add(this.terrainView.mesh, this.terrainView.plain);

    this.waterView = new WaterView(terrain.size, terrain.heights, sunDir);
    this.scene.add(this.waterView.mesh);

    this.rainView = new RainView(extent, options.seed);
    this.scene.add(this.rainView.mesh);

    this.rig = new CameraRig(this.camera, extent, terrain.maxHeight, options.orbitSpeed);

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Syncs the views with the simulation and draws one frame. */
  render(time: number, frameDt: number): void {
    const water = this.world.water;
    this.waterView.update(water, time);
    this.wetTimer += frameDt;
    if (this.wetTimer > 0.2) {
      this.terrainView.updateWetness(water.depth, this.wetTimer);
      this.wetTimer = 0;
    }
    this.rainView.update(time, this.world.rainStrengthAt(water.time));
    this.rig.update(time);
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
