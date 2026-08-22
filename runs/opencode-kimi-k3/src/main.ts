import { parseConfig } from './config';
import { Terrain } from './sim/terrain';
import { WaterSim } from './sim/water';
import { createSceneApp } from './render/scene';

/**
 * Bootstrap: build terrain + simulation + scene, then run a fully
 * autonomous loop (fixed-timestep simulation, free-running visuals).
 * There is deliberately no UI and no interaction of any kind.
 */

const config = parseConfig(window.location.search);

const terrain = new Terrain({ size: config.size, seed: config.seed });

const springs = terrain.findPeaks(6).map((p) => ({ x: p.x, y: p.y }));

const sim = new WaterSim(terrain, {
  rainRate: config.rain,
  evaporation: config.evaporation,
  flowRate: config.flow,
  springRate: config.springRate,
  springs,
  openBorders: true,
});

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');
const app = createSceneApp(container, terrain, sim, config);

// Expose internals for debugging / automated checks (not a UI).
(window as unknown as { __app: unknown }).__app = { terrain, sim, config, app };

const SIM_DT = 1 / 30;
const MAX_STEPS_PER_FRAME = 10;
let accumulator = 0;
let last = performance.now();
const startTime = last;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  accumulator += dt * config.speed;
  let steps = 0;
  while (accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
    sim.step(SIM_DT);
    accumulator -= SIM_DT;
    steps++;
  }
  if (steps > 0) {
    app.waterMesh.update();
    app.terrainMesh.updateWetness(sim);
  }

  app.updateVisuals((now - startTime) / 1000, dt);
  app.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
