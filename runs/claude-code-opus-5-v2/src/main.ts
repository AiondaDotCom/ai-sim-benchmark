/**
 * Bootstrap.
 *
 * Creates the canvas, builds the world, and starts the animation loop.
 * There is intentionally nothing else here: no buttons, no sliders, no HUD,
 * no pointer or keyboard handlers. The page is a self-running showcase.
 */

import { resolveConfig } from './app/config';
import { World } from './app/world';
import { SceneRenderer } from './render/scene';

function mount(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('canvas #scene not found');

  const config = resolveConfig(window.location.search);
  const world = new World(config);
  const renderer = new SceneRenderer(canvas, world, config);

  window.addEventListener('resize', () => renderer.resize(), { passive: true });

  let last = performance.now();
  let elapsed = 0;

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += dt;

    world.update(dt);
    renderer.render(elapsed, dt);

    requestAnimationFrame(frame);
  }

  // Reveal the canvas only once the first frame is on screen, so the sky-blue
  // page background carries the load instead of a flash of empty canvas.
  requestAnimationFrame((now) => {
    last = now;
    world.update(1 / 60);
    renderer.render(0, 1 / 60);
    document.body.classList.add('ready');
    requestAnimationFrame(frame);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
