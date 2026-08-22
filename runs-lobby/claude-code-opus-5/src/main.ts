/** Bootstrap.
 *
 *  Creates the renderer, the simulation and the stage, then runs a fixed-timestep
 *  loop: real frame delta × story time scale feeds the accumulator, the world
 *  steps at a constant 120 Hz, and the renderer draws whatever the frame budget
 *  allows. There is no user interface of any kind — the only interaction the page
 *  listens for is the first gesture, which the browser requires before audio may
 *  start; the picture runs from load either way.
 */
import * as THREE from 'three';
import { AudioEngine } from './audio/engine.ts';
import { readConfig } from './bootstrap/config.ts';
import { FixedClock } from './sim/clock.ts';
import { END_TIME } from './sim/choreography.ts';
import { World } from './sim/world.ts';
import { buildPost } from './render/postfx.ts';
import { Stage } from './render/stage.ts';
import { loadTextures } from './render/textures.ts';

async function boot(): Promise<void> {
  const config = readConfig();

  const renderer = new THREE.WebGLRenderer({
    antialias: config.quality === 'high',
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xb9c8bd, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.42;
  renderer.shadowMap.enabled = config.quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const tex = await loadTextures();
  const world = new World({ seed: config.seed });
  const stage = new Stage(world, tex, config.quality, renderer);
  const post = buildPost(renderer, stage.scene, stage.camera);
  stage.resize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);

  const clock = new FixedClock();
  const audio = new AudioEngine({ volume: config.volume, muted: config.volume <= 0 });

  const scaleAt = (): number =>
    (config.fixedTimeScale ?? world.timeScale) * config.timeScale;

  /** Advance the simulation without drawing — used by ?startAt=. */
  const fastForward = (seconds: number): void => {
    const target = Math.min(seconds, END_TIME - 0.01);
    while (world.time < target) world.step();
  };
  if (config.startAt > 0) {
    fastForward(config.startAt);
    stage.reset(world);
  }

  // first frame before anything else, so the page never shows an empty canvas
  stage.update(world, 1 / 60);
  post.composer.render();

  // audio decodes in the background; the picture never waits for it
  void audio.load();
  const unlock = () => {
    void audio.start(world.time);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, unlock, { passive: true });
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    stage.resize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  const tick = (now: number): void => {
    requestAnimationFrame(tick);
    const realDelta = Math.min(0.25, (now - last) / 1000);
    last = now;

    if (!config.paused) {
      const ts = scaleAt();
      let steps = clock.advance(realDelta, ts);
      while (steps-- > 0) {
        world.step();
        clock.tick();
        audio.handle(world.events, ts);
      }
      if (world.time >= END_TIME) {
        if (config.loop) {
          world.reset();
          stage.reset(world);
          audio.rewind();
        } else {
          config.paused = true;
        }
      }
    }

    stage.update(world, realDelta);
    audio.update(world.time, scaleAt(), realDelta, stage.camera.position);
    (stage.set.floor.material as THREE.ShaderMaterial).uniforms.uCam.value.copy(stage.camera.position);
    post.grade.uniforms.uTime.value = now * 0.001;
    post.composer.render();
  };
  requestAnimationFrame(tick);

  // A small hook for the screenshot tooling. Not UI: nothing is rendered for it.
  (window as unknown as Record<string, unknown>).__lobby = {
    world,
    config,
    stage,
    camera: stage.camera,
    renderer,
    audio,
    seek(t: number) {
      if (t < world.time) world.reset();
      fastForward(t);
      stage.reset(world);
      stage.update(world, 1 / 60);
      post.composer.render();
    },
    pause(p: boolean) {
      config.paused = p;
    },
  };
}

void boot();
