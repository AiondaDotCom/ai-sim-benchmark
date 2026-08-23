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

export interface Shot {
  /** Cut-list label, e.g. '8b'. Declarative header, kept out of the motion. */
  id: string;
  /** What the shot is on, where it has one subject. */
  subject?: string;
  t0: number;
  update(ctx: ShotCtx, eye: THREE.Vector3, look: THREE.Vector3): void;
}

/** The cut list as data, for the timeline consistency tests (A8 step 1). */
export function shotList(): { id: string; subject?: string; t0: number }[] {
  return buildShots().map(({ id, subject, t0 }) => ({ id, subject, t0 }));
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

  /** Pin the per-shot real clock so ?freeze renders a reproducible frame. */
  freezeRealT: number | null = null;
  /** Dev-only fixed camera, for verification framings the cut list lacks. */
  overrideCam: number[] | null = null;

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
      realT: this.freezeRealT ?? this.realClock - this.shotStartReal,
      neo: v(neoP[0], neoP[1], neoP[2]),
      trin: v(trinP[0], trinP[1], trinP[2]),
      shake: battle * this.shakeScale,
    };
    this.shots[idx].update(ctx, this.tmpEye, this.tmpLook);
    if (this.overrideCam) {
      const c = this.overrideCam;
      this.tmpEye.set(c[0], c[1], c[2]);
      this.tmpLook.set(c[3], c[4], c[5]);
    }
    // subtle handheld shake during the battle
    if (ctx.shake > 0) {
      const s = 0.025 * ctx.shake;
      // pinned under ?freeze so the frame is reproducible
      const c = this.freezeRealT ?? this.realClock;
      this.tmpEye.x += Math.sin(c * 13.7) * s;
      this.tmpEye.y += Math.sin(c * 17.3 + 1.7) * s;
      this.tmpLook.x += Math.sin(c * 11.1 + 0.5) * s * 1.4;
    }
    this.camera.position.copy(this.tmpEye);
    this.camera.lookAt(this.tmpLook);
  }
}

function buildShots(): Shot[] {
  return [
    // 1 — establishing wide from the elevator end: the man pushes in.
    {
      id: '1',
      subject: 'establishing wide from the elevator end',
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
      id: '2',
      subject: 'frontal dolly-back on the man walking the',
      t0: 3.5,
      update(ctx, eye, look) {
        eye.set(0.9, 1.55, ctx.neo.z - 6.2);
        look.set(ctx.neo.x, 1.35, ctx.neo.z);
      },
    },
    // 3 — checkpoint side shot: detector beep, guard steps up.
    {
      id: '3',
      subject: 'checkpoint side shot',
      t0: 8.0,
      update(ctx, eye, look) {
        eye.set(4.9, 1.65, 8.9 + Math.sin(ctx.realT * 0.3) * 0.1);
        look.set(0.1, 1.4, 9.9);
      },
    },
    // 4 — slow push-in for the coat reveal, over the guard's shoulder.
    {
      id: '4',
      subject: 'slow push-in for the coat reveal, over the',
      t0: 10.3,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 2.4);
        eye.copy(lerpV(v(2.55, 1.6, 7.75), v(2.3, 1.5, 8.2), k));
        look.set(-0.1, 1.3, 9.65);
      },
    },
    // 5 — eruption: strikes + flying kick, wide from the right.
    {
      id: '5',
      subject: 'eruption',
      t0: 12.2,
      update(ctx, eye, look) {
        eye.set(5.2, 2.0, 9.0);
        look.set(-0.3, 1.2, 9.3);
      },
    },
    // 6 — high behind the pair (clearing the detector): soldiers storm in.
    {
      id: '6',
      subject: 'high behind the pair',
      t0: 14.6,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(2.4, 3.15, mid.z + 5.5);
        look.set(0, 0.7, -7);
      },
    },
    // 6b — A5 INSERT: the bullet leaves the muzzle — flash, smoke, casing.
    {
      id: '6b',
      subject: 'a5 insert',
      t0: 14.95,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 4);
        eye.set(1.55 - k * 0.15, 1.42, 7.95 + k * 0.1);
        look.set(0.02, 1.36, 8.4);
      },
    },
    // 6c — resume the storm-in coverage.
    {
      id: '6c',
      subject: 'resume the storm-in coverage',
      t0: 15.5,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(2.4, 3.15, mid.z + 5.5);
        look.set(0, 0.7, -7);
      },
    },
    // 7 — SET PIECE 1: orbit the cartwheel (slow-mo inside).
    {
      id: '7',
      subject: 'set piece 1',
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
      id: '8',
      subject: 'low wide',
      t0: 20.3,
      update(ctx, eye, look) {
        eye.set(-2.0, 0.9, -2.4);
        look.copy(ctx.neo).add(v(0, 0.95, 0));
      },
    },
    // 8b — A5/A7 INSERT: brass casings as the subject. The camera picks the
    // first casing ejected inside the window and follows it in slow motion
    // from ejection through its bounces to rest (bounce clinks play in the
    // same slow-mo).
    {
      id: '8b',
      subject: 'a5/a7 insert',
      t0: 20.45,
      update(ctx, eye, look) {
        // the casing ejected by the man's dual-wield shot at t=20.8
        const c = ctx.world.casings.find((q) => q.born >= 20.78 && q.born < 20.92);
        if (c && !c.resting) {
          // ride on the ejection side (casings fly to his right, -X),
          // looking back at the tumbling brass with the shooter beyond
          eye.set(c.pos[0] - 0.17, Math.max(0.07, c.pos[1] + 0.07), c.pos[2] - 0.14);
          look.set(c.pos[0], c.pos[1], c.pos[2]);
          return;
        }
        if (c && c.resting) {
          // hold on the settled casing for a beat
          eye.set(c.pos[0] - 0.22, 0.1, c.pos[2] - 0.18);
          look.set(c.pos[0], c.pos[1], c.pos[2]);
          return;
        }
        const k = clamp01(ctx.realT / 4);
        eye.set(0.35 + k * 0.1, 0.32, 2.75 + k * 0.12);
        look.copy(ctx.neo).add(v(-0.15, 0.6, -0.15));
      },
    },
    // 8c — resume the low wide.
    {
      id: '8c',
      subject: 'resume the low wide',
      t0: 22.0,
      update(ctx, eye, look) {
        eye.set(-2.0, 0.9, -2.4);
        look.copy(ctx.neo).add(v(0, 0.95, 0));
      },
    },
    // 9 — brief cut: the woman breaks for the left wall.
    {
      id: '9',
      subject: 'brief cut',
      t0: 22.7,
      update(ctx, eye, look) {
        eye.set(Math.max(ctx.trin.x + 3.4, -4.3), 1.7, ctx.trin.z - 3.3);
        look.copy(ctx.trin).add(v(0, 1.2, 0));
      },
    },
    // 9b — A5 SET PIECE: extreme slow-mo bullet dodge, orbiting ellipse
    // (x-radius 1.5 keeps the lens clear of the column row).
    {
      id: '9b',
      subject: 'a5 set piece',
      t0: 23.15,
      update(ctx, eye, look) {
        const a = 1.05 + ctx.realT * 0.5;
        eye.set(
          1.35 + Math.sin(a) * 1.5,
          1.3 + Math.sin(ctx.realT * 0.7) * 0.2,
          3.3 + Math.cos(a) * 2.6,
        );
        look.set(1.35, 1.02, 3.3);
      },
    },
    // 10 — SET PIECE 2 (B3): low close TRACKING shot moving WITH her along
    // the wall — granite wall in steep one-point perspective on one side,
    // her horizontal body on the other, impact trail between.
    {
      id: '10',
      subject: 'set piece 2',
      t0: 24.9,
      update(ctx, eye, look) {
        // ride alongside: locked to her z, low, tight to the wall; framing
        // keeps a stretch of wall behind her so the impact trail reads
        eye.set(-5.05, 0.75 + ctx.trin.y * 0.45, ctx.trin.z + 2.3);
        look.set(-7.2, ctx.trin.y + 0.25, ctx.trin.z - 0.7);
      },
    },
    // 11 — wide from the right: landing crouch, advance to cover.
    {
      id: '11',
      subject: 'wide from the right',
      t0: 26.8,
      update(ctx, eye, look) {
        eye.set(4.7, 2.4, 0.8);
        look.copy(lerpV(ctx.trin.clone().add(v(0, 1, 0)), v(-3.2, 0.9, -2.2), 0.35));
      },
    },
    // 12 — close: the man dumps his empty pistols, draws fresh ones.
    {
      id: '12',
      subject: 'close',
      t0: 29.6,
      update(ctx, eye, look) {
        eye.set(0.6, 1.5, 0.3);
        look.copy(ctx.neo).add(v(0, 1.25, 0));
      },
    },
    // 13 — SET PIECE 3: orbit both column-cover spins (slow-mo inside).
    {
      id: '13',
      subject: 'set piece 3',
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
      id: '14',
      subject: 'the final advance, high over the soldiers',
      t0: 33.6,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(0.15, 2.95, Math.max(mid.z - 5.8, -12.6));
        look.copy(mid).add(v(0, 1.05, 0));
      },
    },
    // 14b — A7 BULLET-CAM: ride the last kill shot across the hall in
    // extreme slow motion; cut wide the moment it connects.
    {
      id: '14b',
      subject: 'a7 bullet-cam',
      t0: 39.64,
      update(ctx, eye, look) {
        const p = ctx.world.projectiles.find((q) => q.cam);
        const flight = p ? (ctx.world.t - p.born) * p.speed : 0;
        // hand over to the wide cut before the lens reaches the figure
        if (p && !p.done && flight < p.hitDist - 0.75) {
          const h = Math.max(0.25, flight);
          const hx = p.from[0] + p.dir[0] * h;
          const hy = p.from[1] + p.dir[1] * h;
          const hz = p.from[2] + p.dir[2] * h;
          // abeam the round, riding along with it: the projectile is held in
          // profile in the foreground while the hall streaks past behind it.
          const px = -p.dir[2], pz = p.dir[0]; // horizontal perpendicular
          eye.set(
            hx + px * 0.4 - p.dir[0] * 0.1,
            hy + 0.055,
            hz + pz * 0.4 - p.dir[2] * 0.1,
          );
          look.set(hx + p.dir[0] * 0.12, hy, hz + p.dir[2] * 0.12);
          return;
        }
        if (p) {
          // impact: cut wide as the last soldier drops (no dwelling)
          eye.set(0.3, 2.5, -6.0);
          look.set(3.2, 0.9, -9.4);
          return;
        }
        // moments before the shot: on the woman taking aim
        eye.set(ctx.trin.x + 1.7, 1.55, ctx.trin.z + 1.5);
        look.copy(ctx.trin).add(v(0, 1.3, 0));
      },
    },
    // 15 — wind-down: slow pan across the wreckage.
    {
      id: '15',
      subject: 'wind-down',
      t0: 40.2,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 7.0);
        eye.copy(lerpV(v(-5.6, 1.9, -12.6), v(5.4, 2.3, -11.6), k));
        look.copy(lerpV(v(-3.5, 1.6, 3.5), v(3.5, 0.9, -1.5), k));
      },
    },
    // 16 — exit walk to the elevator, from beside the bank.
    {
      id: '16',
      subject: 'exit walk to the elevator, from beside the',
      t0: 47.2,
      update(ctx, eye, look) {
        const mid = lerpV(ctx.neo, ctx.trin, 0.5);
        eye.set(4.9, 1.7, -15.5);
        look.copy(mid).add(v(0, 1.25, 0));
      },
    },
    // 17 — final wide: doors close on the pair; hold on the wrecked lobby.
    {
      id: '17',
      subject: 'final wide',
      t0: 53.6,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 6);
        eye.copy(lerpV(v(2.6, 4.7, 13.2), v(1.8, 4.4, 12.2), k));
        look.set(0, 1.5, -13);
      },
    },
  ];
}
