/** The stage: scene graph, lighting, and the per-frame bridge from simulation
 *  state to what you see. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BEAT, END_TIME } from '../sim/choreography.ts';
import { LAYOUT } from '../sim/lobby.ts';
import { clamp, smoothstep, t01 } from '../sim/vec.ts';
import type { World } from '../sim/world.ts';
import { buildCharacterMaterials, CharacterView } from './character.ts';
import { CameraDirector } from './camera.ts';
import { ParticleViews } from './particles.ts';
import { buildSet, type SetPieces } from './set.ts';
import { SlabRenderer } from './slabs.ts';
import type { TextureSet } from './textures.ts';

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 220);
  readonly director = new CameraDirector(this.camera);
  readonly set: SetPieces;
  private readonly slabs: SlabRenderer;
  private readonly characters: CharacterView[] = [];
  private readonly particles: ParticleViews;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly alarmLights: THREE.PointLight[] = [];
  private readonly detectorLamp: THREE.Mesh | null;
  private readonly muzzleLight = new THREE.PointLight(0xffd9a0, 0, 9, 2);

  constructor(world: World, tex: TextureSet, quality: 'low' | 'high', renderer: THREE.WebGLRenderer) {
    this.scene.background = new THREE.Color(0xb9c8bd);
    // A procedural room probe. Without it every metal in the scene — the
    // elevator doors, the brass casings, the gun metal — renders black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(0xbccbc0, 34, 118);

    this.set = buildSet(tex);
    this.scene.add(this.set.root);
    this.slabs = new SlabRenderer(world.damage, world.surfaces, tex);
    this.scene.add(this.slabs.group);

    /* ---------------- light: cool institutional daylight ------------------ */
    this.scene.add(new THREE.HemisphereLight(0xe8f2ec, 0x505a52, 1.45));
    const key = new THREE.DirectionalLight(0xeaf4ee, 2.1);
    key.position.set(-16, 17, 10);
    key.castShadow = quality === 'high';
    key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 62;
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xd8e8ec, 1.25);
    fill.position.set(14, 12, 34);
    this.scene.add(fill);
    const back = new THREE.DirectionalLight(0xd6e6de, 0.75);
    back.position.set(2, 9, -12);
    this.scene.add(back);
    // daylight pouring in through the entrance glass, silhouetting the arrivals
    const entrance = new THREE.PointLight(0xdff0e8, 15, 24, 2);
    entrance.position.set(0, 3.4, -1.6);
    this.scene.add(entrance);
    const elevatorGlow = new THREE.PointLight(0xdfeee6, 11, 15, 2);
    elevatorGlow.position.set(0, 2.3, LAYOUT.elevatorZ - 2.4);
    this.scene.add(elevatorGlow);

    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff2a12, 0, 24, 2);
      l.position.set(0, 8.4, 12 + i * 14);
      this.alarmLights.push(l);
      this.scene.add(l);
    }
    this.scene.add(this.muzzleLight);

    this.detectorLamp = (this.set.root.getObjectByName('detector-lamp') as THREE.Mesh) ?? null;

    /* ---------------- characters ------------------------------------------ */
    const mats = buildCharacterMaterials(tex);
    for (const a of world.actors) {
      const view = new CharacterView(a, mats, tex);
      this.characters.push(view);
      this.scene.add(view.root);
      if (view.coatMesh) this.scene.add(view.coatMesh);
    }

    this.particles = new ParticleViews(world, tex);
    this.scene.add(this.particles.group);
    this.slabs.sync(true);
  }

  update(world: World, renderDelta: number): void {
    const t = world.time;
    for (const c of this.characters) c.update(c.actor.pose);
    this.slabs.sync();
    this.particles.update(world);
    this.director.update(world, renderDelta);

    // keep the shadow frustum around the action
    const focus = world.actors[0];
    this.keyLight.position.set(focus.pos.x - 15, 17, focus.pos.z - 9);
    this.keyLight.target.position.set(focus.pos.x, 0, focus.pos.z + 3);
    this.keyLight.target.updateMatrixWorld();

    // muzzle flashes throw light onto the marble
    let flash = 0;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (const a of world.actors) {
      const f = Math.max(a.flashL, a.flashR);
      if (f > flash) {
        flash = f;
        fx = a.pos.x;
        fy = a.pos.y + 1.3;
        fz = a.pos.z;
      }
    }
    this.muzzleLight.intensity = flash * 26;
    if (flash > 0) this.muzzleLight.position.set(fx, fy, fz);

    // alarm strobing on the walls
    const alarm = world.alarmOn ? (Math.sin(t * 9.5) * 0.5 + 0.5) ** 2 : 0;
    for (const l of this.alarmLights) l.intensity = alarm * 12;
    if (this.detectorLamp) {
      const m = this.detectorLamp.material as THREE.MeshStandardMaterial;
      const beep = 1 - smoothstep(BEAT.detectorBeep, BEAT.detectorBeep + 1.1, t);
      m.emissiveIntensity = t >= BEAT.detectorBeep ? beep * 3.2 + alarm * 2 : 0.15;
    }

    this.animateDoors(t);
    if (this.scene.fog) {
      // the hall gets hazier as the marble dust builds up
      const haze = clamp(world.damage.impactCount / 900, 0, 1);
      (this.scene.fog as THREE.Fog).near = 34 - haze * 14;
      (this.scene.fog as THREE.Fog).far = 118 - haze * 40;
    }
  }

  private animateDoors(t: number): void {
    // entrance: the man pushes through, the woman follows
    for (let i = 0; i < this.set.entranceDoors.length; i++) {
      const leaf = this.set.entranceDoors[i];
      const hinge = (leaf.userData.hingeSide as number) ?? 1;
      let open = 0;
      if (i === 1) open = Math.max(pulse(t, 0.05, 0.55, 1.5), 0);
      if (i === 2) open = Math.max(pulse(t, 1.25, 0.55, 1.5), 0);
      leaf.rotation.y = -hinge * open * 1.15;
    }
    // elevator: opens for them, then closes on the final image
    const open =
      smoothstep(BEAT.doorsOpen, BEAT.doorsOpen + 0.9, t) *
      (1 - smoothstep(BEAT.doorsClose, BEAT.doorsClose + 1.0, t));
    for (const leaf of this.set.elevatorDoors) {
      const side = leaf.userData.side as number;
      const closed = leaf.userData.closedX as number;
      leaf.position.x = closed + side * (LAYOUT.elevatorWidth / 2) * open;
    }
    // the daylight shafts fade up as the dust rises
    this.set.shafts.visible = t > 1;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Refresh everything after a loop restart. */
  reset(world: World): void {
    this.particles.reset();
    this.slabs.sync(true);
    this.particles.update(world);
  }
}

/** 0 → 1 → 0 envelope: `up` seconds to open, `hold`, then closing again. */
function pulse(t: number, start: number, up: number, hold: number): number {
  const a = t01(t, start, start + up);
  const b = 1 - t01(t, start + up + hold, start + up + hold + 0.8);
  return Math.min(a, b);
}

export const STORY_END = END_TIME;
