import { parseConfig } from './config';
import { SceneView } from './render/sceneView';
import { World } from './sim/world';

/**
 * Bootstrap: read URL configuration, build the world, start the render loop.
 * There is no user interface; the demo runs completely on its own.
 */

/** Simulated seconds per real second at ?speed=1. */
const TIME_SCALE = 8;
/** Upper bound on simulation steps per animation frame. */
const MAX_STEPS_PER_FRAME = 14;

const config = parseConfig(window.location.search);

const world = new World({
  seed: config.seed,
  size: config.gridSize,
  rainIntensity: config.rainIntensity,
  springCount: config.springCount,
});

if (config.warmupSeconds > 0) {
  let remaining = config.warmupSeconds;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 1);
    world.advance(chunk, 1000);
    remaining -= chunk;
  }
}

const view = new SceneView(document.body, world, { orbitSpeed: config.orbitSpeed, seed: config.seed });

// Read-only handle for automated inspection (recording scripts, tests in a
// browser). Not visible and not interactive.
(window as unknown as { __waterDemo: unknown }).__waterDemo = { world, view, config };

let last = performance.now();
let elapsed = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  elapsed += dt;
  world.advance(dt * TIME_SCALE * config.simSpeed, MAX_STEPS_PER_FRAME);
  view.render(elapsed, dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame((now) => {
  last = now;
  frame(now);
});
