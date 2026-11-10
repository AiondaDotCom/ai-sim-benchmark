import { parseConfig } from './config';
import { SceneRenderer } from './render/sceneRenderer';
import { Simulation } from './sim/simulation';

/** Simulated seconds per wall-clock second at `?speed=1`. */
const SIM_RATE = 8;
/** Upper bound of simulation steps per frame, so a slow device degrades gracefully. */
const MAX_STEPS_PER_FRAME = 12;

function start(): void {
  const config = parseConfig(window.location.search);
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const sim = new Simulation({
    seed: config.seed,
    rain: config.rain,
    springs: config.springs,
    gridSize: config.grid,
  });
  // Optional head start so a recording can begin with rivers and lakes in place.
  if (config.warmup > 0) sim.advanceTo(config.warmup, Number.MAX_SAFE_INTEGER);
  const view = new SceneRenderer(container, sim);

  // Hook for automated measurements (no visible effect).
  (window as unknown as { __waterSim?: Simulation }).__waterSim = sim;

  let last = performance.now();
  let elapsed = 0;
  let simTarget = sim.time;

  const frame = (now: number) => {
    // Clamp so a background tab does not cause a huge catch-up burst.
    const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    elapsed += delta;

    simTarget += delta * SIM_RATE * config.speed;
    sim.advanceTo(simTarget, MAX_STEPS_PER_FRAME);
    // If the device cannot keep up, drop the backlog instead of spiralling.
    if (simTarget - sim.time > 1) simTarget = sim.time;

    view.render(elapsed, delta);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
