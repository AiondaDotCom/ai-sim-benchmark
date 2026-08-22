import * as THREE from 'three';
import type { AppConfig } from '../config';
import type { Terrain } from '../sim/terrain';
import type { WaterSim } from '../sim/water';
import { createSky, setupLighting, SKY_HORIZON } from './sky';
import { createTerrainMesh, type TerrainMesh } from './terrainMesh';
import { createWaterMesh, type WaterMesh } from './waterMesh';
import { createRain, type RainSystem } from './rain';

/**
 * Three.js scene bootstrap: renderer, camera, lights, sky, fog and the
 * slow autonomous orbit used for showcase recordings. No user interaction.
 */

export interface SceneApp {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrainMesh: TerrainMesh;
  waterMesh: WaterMesh;
  rain: RainSystem | null;
  /** Advance camera orbit + rain animation. */
  updateVisuals(elapsed: number, dt: number): void;
  render(): void;
}

export function createSceneApp(
  container: HTMLElement,
  terrain: Terrain,
  sim: WaterSim,
  config: AppConfig,
): SceneApp {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(SKY_HORIZON, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = SKY_HORIZON.clone();
  scene.fog = new THREE.Fog(SKY_HORIZON.clone(), config.worldSize * 0.9, config.worldSize * 2.6);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    3000,
  );

  scene.add(createSky());
  setupLighting(scene);

  const cellSize = config.worldSize / (terrain.size - 1);
  const terrainMesh = createTerrainMesh(terrain, cellSize);
  scene.add(terrainMesh.mesh);

  const waterMesh = createWaterMesh(terrain, sim, cellSize);
  scene.add(waterMesh.mesh);

  const rain =
    config.rain > 0
      ? createRain(2200, config.worldSize * 1.1, 110, terrain.seed + 5)
      : null;
  if (rain) scene.add(rain.points);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const target = new THREE.Vector3(0, 8, 0);

  return {
    renderer,
    scene,
    camera,
    terrainMesh,
    waterMesh,
    rain,
    updateVisuals(elapsed: number, dt: number): void {
      // Slow, smooth autonomous orbit with gentle breathing of radius/height.
      const angle = elapsed * config.cameraSpeed + 0.6;
      const radius = config.worldSize * (0.78 + 0.1 * Math.sin(elapsed * 0.06));
      const height = config.worldSize * (0.36 + 0.08 * Math.sin(elapsed * 0.043 + 1.2));
      camera.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );
      camera.lookAt(target);
      if (rain) rain.update(dt);
    },
    render(): void {
      renderer.render(scene, camera);
    },
  };
}
