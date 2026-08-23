/**
 * Bootstrap: wires simulation, rendering, camera direction and audio.
 * Fully autonomous — no UI, starts on page load, loops at the end.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { parseConfig } from './config';
import { World } from './sim/world';
import { FixedStepper } from './sim/stepper';
import { DURATION, SOLDIERS, GUARDS } from './sim/timeline';
import { loadMats } from './render/materials';
import { Lobby } from './render/lobby';
import { Character } from './render/characters';
import { Effects } from './render/effects';
import { CameraDirector } from './render/camera';
import { AudioEngine } from './audio/engine';

const cfg = parseConfig(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
// Paint the institutional tone immediately — the page must never flash dark.
renderer.setClearColor(0x87948a, 1);
document.body.appendChild(renderer.domElement);
renderer.clear();

const scene = new THREE.Scene();
// the signature look: moody desaturated green-grey, falloff into the hall
scene.background = new THREE.Color(0x49564c);
scene.fog = new THREE.FogExp2(0x49564c, 0.026);

scene.add(new THREE.HemisphereLight(0x9fb6a0, 0x20261f, 0.55));
// key: cold daylight pouring in from the entrance glazing (+Z end)
const key = new THREE.DirectionalLight(0xe6f5df, 1.8);
key.position.set(2, 9, 30);
scene.add(key);
const fill = new THREE.DirectionalLight(0x66766a, 0.35);
fill.position.set(-8, 10, -14);
scene.add(fill);
// ceiling fixtures: pools of green-white light with real falloff
for (const z of [10, 0, -10]) {
  const pt = new THREE.PointLight(0xd2eccb, 10, 13, 2);
  pt.position.set(0, 6.3, z);
  scene.add(pt);
}
// blown-out daylight outside the entrance doors
const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(7.5, 5.2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
);
glow.position.set(0, 2.4, 18.55);
glow.rotation.y = Math.PI;
scene.add(glow);
const glowSoft = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 7),
  new THREE.MeshBasicMaterial({ color: 0xdff0d8, fog: false }),
);
glowSoft.position.set(0, 3, 19.4);
glowSoft.rotation.y = Math.PI;
scene.add(glowSoft);

async function boot() {
  const mats = await loadMats();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const lobby = new Lobby(mats);
  scene.add(lobby.group);

  const effects = new Effects(mats, cfg.seed);
  scene.add(effects.group);

  const chars = new Map<string, Character>();
  chars.set('neo', new Character('neo', mats, scene));
  chars.set('trin', new Character('trin', mats, scene));
  for (const g of GUARDS) chars.set(g.id, new Character('guard', mats, scene));
  for (const s of SOLDIERS) chars.set(s.id, new Character('soldier', mats, scene));

  let world = new World(cfg.seed);
  // fast-forward to ?t= start time (events are consumed silently)
  while (world.t < cfg.startT) {
    world.step();
    world.drainEvents();
  }
  if (cfg.startT > 0) {
    // restore event-driven visual state after a fast-forward
    const t = cfg.startT;
    if (t > 9.7) chars.get('neo')!.coatOpen = 1;
    if (t >= 14.7 && t < 46.9) chars.get('neo')!.setGuns(true);
    if (t >= 15.0 && t < 46.9) chars.get('trin')!.setGuns(true);
  }
  let stepper = new FixedStepper(world, cfg.timeScale);
  const director = new CameraDirector(window.innerWidth / window.innerHeight, cfg.camShake);

  const audio = new AudioEngine(cfg.seed, cfg.volume);
  void audio.init().then(() => audio.startMusic(world.t));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    director.camera.aspect = window.innerWidth / window.innerHeight;
    director.camera.updateProjectionMatrix();
  });

  let last = performance.now();
  function frame(now: number) {
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;

    const prevT = world.t;
    stepper.advance(realDt);
    const simDt = world.t - prevT;
    const events = world.drainEvents();

    // weapon visibility follows the choreography events
    for (const e of events) {
      if (e.type === 'DRAW') chars.get(e.actor)?.setGuns(true);
      if (e.type === 'GUN_DROP') {
        // find who dropped: nearest protagonist
        for (const id of ['neo', 'trin']) {
          const a = world.actors.get(id)!;
          const d = Math.hypot(a.pose.pos[0] - e.pos[0], a.pose.pos[2] - e.pos[2]);
          if (d < 1.2) chars.get(id)?.setGuns(false);
        }
      }
    }

    audio.setTimeScale(stepper.scale());
    audio.handleEvents(events);

    for (const [id, ch] of chars) ch.update(world.actors.get(id)!, world.t);
    lobby.update(world.t);
    effects.onEvents(events, 1 / Math.max(stepper.scale(), 0.05));
    effects.update(world, simDt);
    director.update(world, realDt);

    renderer.render(scene, director.camera);
    // headless-verification aid (no UI): current sim time on the window
    (window as unknown as { __simT: number }).__simT = world.t;

    // loop the demo
    if (world.t >= DURATION + 0.5 && cfg.loop) {
      world = new World(cfg.seed);
      stepper = new FixedStepper(world, cfg.timeScale);
      effects.reset();
      for (const ch of chars.values()) ch.reset();
      audio.startMusic(0);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot();
