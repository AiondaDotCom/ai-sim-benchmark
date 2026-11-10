import * as THREE from 'three';
import type { Simulation } from '../sim/simulation';
import { SEA_FLOOR_DEPTH, WORLD_SIZE } from '../sim/terrain';
import { cameraPoseAt } from './cameraPath';
import { FOG_COLOR, SKY_MID, SUN_DIRECTION } from './palette';
import { createSky } from './sky';
import { createTerrainMesh } from './terrainMesh';
import { WaterView } from './waterMesh';
import { WeatherView } from './weather';

/**
 * Owns everything Three.js: scene graph, lights, camera choreography and the
 * WebGL renderer. It only reads from the Simulation, never writes to it.
 */
export class SceneRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly water: WaterView;
  private readonly weather: WeatherView;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement, sim: Simulation) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(SKY_MID, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.scene.background = new THREE.Color(SKY_MID);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 420, 1900);

    this.camera = new THREE.PerspectiveCamera(40, 1, 2, 9000);

    this.scene.add(createSky());

    this.scene.add(new THREE.HemisphereLight(0xd6ecff, 0x8a7a62, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(SUN_DIRECTION[0] * 420, SUN_DIRECTION[1] * 420, SUN_DIRECTION[2] * 420);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const extent = WORLD_SIZE * 0.62;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 900;
    sun.shadow.intensity = 0.6;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 1.2;
    this.scene.add(sun);

    this.scene.add(createTerrainMesh(sim.terrain));

    // Sea floor continuing beyond the simulated square.
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(12000, 12000),
      new THREE.MeshStandardMaterial({ color: 0x8a8f72, roughness: 1 }),
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = sim.terrain.seaLevel - SEA_FLOOR_DEPTH - 0.05;
    this.scene.add(seabed);

    this.water = new WaterView(sim);
    this.scene.add(this.water.object);

    this.weather = new WeatherView(sim);
    this.scene.add(this.weather.object);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep the whole island in frame on portrait / narrow viewports too.
    this.camera.fov = this.camera.aspect >= 1.2 ? 40 : Math.min(75, 40 * (1.2 / this.camera.aspect) ** 0.8);
    this.camera.updateProjectionMatrix();
  }

  /** Draws one frame. `seconds` is wall-clock time since start, `delta` the frame time. */
  render(seconds: number, delta: number): void {
    const pose = cameraPoseAt(seconds);
    this.camera.position.set(...pose.position);
    this.camera.lookAt(...pose.target);
    this.water.update(seconds);
    this.weather.update(delta);
    this.renderer.render(this.scene, this.camera);
  }
}
