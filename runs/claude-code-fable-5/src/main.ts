/**
 * Bootstrap: wires config -> simulation -> rendering.
 *
 * Fully autonomous demo: the simulation (rain + mountain springs) starts on
 * page load, the camera orbits by itself, and there is no on-screen UI.
 * Configuration only via URL query parameters (see src/config.ts).
 */

import { loadConfig } from './config';
import { generateTerrain, findSprings } from './sim/terrain';
import { WaterSim } from './sim/water';
import { createScene } from './render/scene';
import { createTerrainMesh } from './render/terrainMesh';
import { WaterMesh } from './render/waterMesh';
import { CameraRig } from './render/cameraRig';

const config = loadConfig(window.location.search);

// --- Simulation setup -------------------------------------------------------
const gridW = config.gridSize;
const gridH = config.gridSize;

const terrain = generateTerrain({ width: gridW, height: gridH, seed: config.seed });
const springs = findSprings(terrain, gridW, gridH, config.springCount);

const sim = new WaterSim({
  width: gridW,
  height: gridH,
  terrain,
  rainRate: config.rain,
  springRate: config.springRate,
  springs,
  evaporation: config.evaporation,
});

// --- Rendering setup --------------------------------------------------------
const { renderer, scene, camera } = createScene();

scene.add(createTerrainMesh(terrain, gridW, gridH));

const waterMesh = new WaterMesh(sim);
scene.add(waterMesh.mesh);

let minH = Infinity;
let maxH = -Infinity;
for (let i = 0; i < terrain.length; i++) {
  if (terrain[i] < minH) minH = terrain[i];
  if (terrain[i] > maxH) maxH = terrain[i];
}
const rig = new CameraRig(
  camera,
  gridW * 0.92, // orbit radius
  maxH + gridW * 0.34, // camera height
  (minH + maxH) * 0.35, // look-at height
  config.orbitPeriod,
);

// --- Main loop --------------------------------------------------------------
// Fixed timestep for stability; wall-clock accumulator scaled by `speed`.
const SIM_DT = 1 / 90;
const MAX_STEPS_PER_FRAME = 12;

let last = performance.now();
let elapsed = 0;
let accumulator = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += frameDt;
  accumulator += frameDt * config.speed;

  let steps = 0;
  while (accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
    sim.step(SIM_DT);
    accumulator -= SIM_DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // drop backlog on slow frames

  waterMesh.update();
  rig.update(elapsed);
  renderer.render(scene, camera);
});
