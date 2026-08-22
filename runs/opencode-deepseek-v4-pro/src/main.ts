import './index.css';
import { readConfig } from './config';
import { generateTerrain } from './sim/terrain';
import { WaterSimulation } from './sim/water';
import { createScene } from './render/scene';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app container');
}

const config = readConfig();
const size = config.gridSize;
const heightScale = size * 0.16;

const terrain = generateTerrain(config.seed, size);
const water = new WaterSimulation(size, terrain.heights, {
  rain: config.rain,
  springs: config.springs,
  evaporation: config.evaporation,
  edgeDrain: config.edgeDrain,
  fluxRate: config.fluxRate,
  iterations: config.flowIterations
});

const scene = createScene(container, size, terrain.heights, heightScale);
window.addEventListener('resize', scene.resize);

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  water.step(dt * config.speed);
  scene.updateWater(water.depth);
  scene.orbit.update(dt, config.cameraSpeed);
  scene.render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);