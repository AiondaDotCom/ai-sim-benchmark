/**
 * Choreographed camera: a cut list of shots keyed to simulation time.
 * Orbit angles advance in REAL time, so during slow motion the camera keeps
 * sweeping at full speed around the frozen action (the signature shots).
 * All paths were chosen to stay clear of column/wall geometry.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';

interface ShotCtx {
  world: World;
  simT: number;
  realT: number; // real seconds since this shot started
  neo: THREE.Vector3;
  trin: THREE.Vector3;
  shake: number;
}

interface Shot {
  t0: number;
  update(ctx: ShotCtx, eye: THREE.Vector3, look: THREE.Vector3): void;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class CameraDirector {
  camera: THREE.PerspectiveCamera;
  private shots: Shot[];
  private activeIdx = -1;
  private shotStartReal = 0;
  private realClock = 0;
  private tmpEye = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();

  constructor(aspect: number, private shakeScale: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.08, 90);
    this.shots = buildShots();
  }

  update(world: World, realDt: number) {
    this.realClock += realDt;
    const t = world.t;
    let idx = 0;
    for (let i = 0; i < this.shots.length; i++) {
      if (t >= this.shots[i].t0) idx = i;
    }
    if (idx !== this.activeIdx) {
      this.activeIdx = idx;
      this.shotStartReal = this.realClock;
    }
    const neoP = world.actors.get('neo')!.pose.pos;
    const trinP = world.actors.get('trin')!.pose.pos;
    const battle = t > 13 && t < 40 ? 1 : 0;
    const ctx: ShotCtx = {
      world,
      simT: t,
      realT: this.realClock - this.shotStartReal,
      neo: v(neoP[0], neoP[1], neoP[2]),
      trin: v(trinP[0], trinP[1], trinP[2]),
      shake: battle * this.shakeScale,
    };
    this.shots[idx].update(ctx, this.tmpEye, this.tmpLook);
    // subtle handheld shake during the battle
    if (ctx.shake > 0) {
      const s = 0.025 * ctx.shake;
      this.tmpEye.x += Math.sin(this.realClock * 13.7) * s;
      this.tmpEye.y += Math.sin(this.realClock * 17.3 + 1.7) * s;
      this.tmpLook.x += Math.sin(this.realClock * 11.1 + 0.5) * s * 1.4;
    }
    this.camera.position.copy(this.tmpEye);
    this.camera.lookAt(this.tmpLook);
  }
}

function buildShots(): Shot[] {
  return [
    // 1 — establishing wide from the elevator end: the man pushes in.
    {
      t0: 0,
      update(ctx, eye, look) {
        const k = clamp01(ctx.simT / 3.5);
        // symmetric one-point perspective down the empty hall; the man
        // pushes through the doors as a silhouette at the far end
        eye.copy(lerpV(v(1.15, 5.3, -14.8), v(0.9, 4.4, -13.6), k));
        look.set(0, 1.6, 14);
      },
    },
    // 2 — frontal dolly-back on the man walking the centerline.
    {
      t0: 3.5,
      update(ctx, eye, look) {
        eye.set(0.9, 1.55, ctx.neo.z - 6.2);
        look.set(ctx.neo.x, 1.35, ctx.neo.z);
      },
    },
    // 3 — checkpoint side shot: detector beep, guard steps up.
    {
      t0: 8.0,
      update(ctx, eye, look) {
        eye.set(4.9, 1.65, 8.9 + Math.sin(ctx.realT * 0.3) * 0.1);
        look.set(0.1, 1.4, 9.9);
      },
    },
    // 4 — slow push-in for the coat reveal, over the guard's shoulder.
    {
      t0: 10.3,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 2.4);
        eye.copy(lerpV(v(2.55, 1.6, 7.75), v(2.3, 1.5, 8.2), k));
        look.set(-0.1, 1.3, 9.65);
      },
    },
    // 5 — eruption: strikes + flying kick, wide from the right.
    {
      t0: 12.2,
      update(ctx, eye, look) {
        eye.set(5.2, 2.0, 9.0);
        look.set(-0.3, 1.2, 9.3);
      },
    },
    // 6 — high behind the pair (clearing the detector): soldiers storm in.
    {
      t0: 14.6,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(2.4, 3.15, mid.z + 5.5);
        look.set(0, 0.7, -7);
      },
    },
    // 7 — SET PIECE 1: orbit the cartwheel (slow-mo inside).
    {
      t0: 18.5,
      update(ctx, eye, look) {
        const a = 2.6 + ctx.realT * 0.5;
        const r = 2.6;
        // orbit tracks the cartwheel (x damped to stay clear of the columns)
        eye.set(ctx.neo.x * 0.25 + Math.sin(a) * r, 1.62, ctx.neo.z + Math.cos(a) * r);
        look.copy(ctx.neo).add(v(0, 1.25, 0));
      },
    },
    // 8 — low wide: crouch fire, casings raining down.
    {
      t0: 20.3,
      update(ctx, eye, look) {
        eye.set(-2.0, 0.9, -2.4);
        look.copy(ctx.neo).add(v(0, 0.95, 0));
      },
    },
    // 9 — tracking the woman as she breaks for the left wall.
    {
      t0: 22.7,
      update(ctx, eye, look) {
        eye.set(Math.max(ctx.trin.x + 3.4, -4.3), 1.7, ctx.trin.z - 3.3);
        look.copy(ctx.trin).add(v(0, 1.2, 0));
      },
    },
    // 10 — SET PIECE 2: alongside the wall run (slow-mo inside).
    {
      t0: 24.9,
      update(ctx, eye, look) {
        const sway = Math.sin(ctx.realT * 0.45) * 0.4;
        eye.set(-3.75 + sway * 0.3, 1.7 + ctx.trin.y * 0.3, ctx.trin.z + 3.3);
        look.copy(ctx.trin).add(v(0, 1.0, -0.4));
      },
    },
    // 11 — wide from the right: landing crouch, advance to cover.
    {
      t0: 26.8,
      update(ctx, eye, look) {
        eye.set(4.7, 2.4, 0.8);
        look.copy(lerpV(ctx.trin.clone().add(v(0, 1, 0)), v(-3.2, 0.9, -2.2), 0.35));
      },
    },
    // 12 — close: the man dumps his empty pistols, draws fresh ones.
    {
      t0: 29.6,
      update(ctx, eye, look) {
        eye.set(0.6, 1.5, 0.3);
        look.copy(ctx.neo).add(v(0, 1.25, 0));
      },
    },
    // 13 — SET PIECE 3: orbit both column-cover spins (slow-mo inside).
    {
      t0: 31.4,
      update(ctx, eye, look) {
        const a = 0.9 + ctx.realT * 0.42;
        const r = 2.55;
        eye.set(Math.sin(a) * r * 0.92, 1.75, -0.1 + Math.cos(a) * r);
        const m = Math.sin(ctx.realT * 0.35);
        look.copy(lerpV(ctx.neo.clone().add(v(0, 1.2, 0)), ctx.trin.clone().add(v(0, 1.2, 0)), 0.5 + m * 0.42));
      },
    },
    // 14 — the final advance, high over the soldiers' cover line.
    {
      t0: 33.6,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(0.15, 2.95, Math.max(mid.z - 5.8, -12.6));
        look.copy(mid).add(v(0, 1.05, 0));
      },
    },
    // 15 — wind-down: slow pan across the wreckage.
    {
      t0: 40.2,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 7.0);
        eye.copy(lerpV(v(-5.6, 1.9, -12.6), v(5.4, 2.3, -11.6), k));
        look.copy(lerpV(v(-3.5, 1.6, 3.5), v(3.5, 0.9, -1.5), k));
      },
    },
    // 16 — exit walk to the elevator, from beside the bank.
    {
      t0: 47.2,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(4.9, 1.7, -15.5);
        look.copy(mid).add(v(0, 1.25, 0));
      },
    },
    // 17 — final wide: doors close on the pair; hold on the wrecked lobby.
    {
      t0: 53.6,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 6);
        eye.copy(lerpV(v(2.6, 4.7, 13.2), v(1.8, 4.4, 12.2), k));
        look.set(0, 1.5, -13);
      },
    },
  ];
}
