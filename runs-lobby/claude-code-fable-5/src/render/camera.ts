/**
 * Choreographed camera: a cut list of shots keyed to simulation time.
 * Orbit angles advance in REAL time, so during slow motion the camera keeps
 * sweeping at full speed around the frozen action (the signature shots).
 * All paths were chosen to stay clear of column/wall geometry.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/events';

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

  /**
   * B24: camera shake is punctuation, not a background state.
   *
   * It used to be `battle * shakeScale` — a continuous handheld wobble for the
   * entire firefight, which reads as restless rather than energetic and was
   * actively hurting the shots that depend on stillness. Now each impulse is
   * a discrete kick that decays within a fraction of a second, its magnitude
   * falling off with distance from the lens, and between events the camera is
   * still.
   *
   * Two things keep it honest. The oscillation phase is driven by SIM time,
   * not the wall clock, so a replay reproduces it exactly and freeze mode is
   * pinned. And the whole response is multiplied by the choreographed time
   * scale, so in the slow-motion windows it essentially vanishes — a locked,
   * gliding camera is what makes bullet-time read.
   */
  private kicks: { t: number; mag: number }[] = [];
  /** current shake displacement in metres (dev verification) */
  shakeAmp = 0;

  /**
   * Beats that must be perfectly still. Gunfire does not occur in most of
   * these anyway, but the closing beats can carry impacts (a slab coming down)
   * and the point of them is silence.
   */
  private static readonly CALM: [number, number][] = [
    [0, 14],      // entrance walk and the checkpoint
    [17.6, 19.0], // A15: the held standoff — stillness is the whole point
    [46.6, 90],   // wind-down, the exit to the elevator, and the closing hold
  ];

  private addKick(simT: number, pos: number[], strength: number, eye: THREE.Vector3) {
    const dx = pos[0] - eye.x, dy = pos[1] - eye.y, dz = pos[2] - eye.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const mag = strength / (1 + d2 / 7);
    if (mag < 0.01) return;
    this.kicks.push({ t: simT, mag });
    if (this.kicks.length > 48) this.kicks.shift();
  }

  update(world: World, realDt: number, events: SimEvent[] = [], timeScale = 1) {
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

    // B24: turn this frame's events into impulses, measured from where the
    // lens actually ended up
    const calm = CameraDirector.CALM.some(([a, b]) => t >= a && t < b);
    if (!calm) {
      for (const e of events) {
        if (e.type === 'SHOT') this.addKick(t, e.pos, 0.22, this.tmpEye);
        else if (e.type === 'IMPACT_MARBLE') this.addKick(t, e.pos, 0.8, this.tmpEye);
        // a slab coming down is the heaviest impulse in the scene
        else if (e.type === 'SLAB_LAND') this.addKick(t, e.pos, 2.6, this.tmpEye);
      }
    }
    // sum the live impulses; each decays within a fraction of a second
    let amp = 0;
    for (const k of this.kicks) {
      const age = t - k.t;
      if (age < 0 || age > 0.35) continue;
      amp += k.mag * Math.exp(-age / 0.055);
    }
    // ...scaled by the choreographed time scale, so slow motion is locked
    const s = 0.009 * Math.min(amp, 2.2) * this.shakeScale * timeScale;
    // headless-verification aid (no UI): the live shake amplitude, so
    // "still during the calm beats" is a measurement rather than an opinion
    this.shakeAmp = s;
    if (s > 1e-5 && !calm) {
      // phase from SIM time: reproducible on replay, pinned under ?freeze
      this.tmpEye.x += Math.sin(t * 121.0) * s;
      this.tmpEye.y += Math.sin(t * 157.0 + 1.7) * s * 0.8;
      this.tmpLook.x += Math.sin(t * 97.0 + 0.5) * s * 1.3;
      this.tmpLook.y += Math.sin(t * 113.0 + 2.3) * s * 0.9;
    }
    this.camera.position.copy(this.tmpEye);
    this.camera.lookAt(this.tmpLook);
  }
}

export function buildShots(): Shot[] {
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
    // 5 — A16: the man's strike, close and from behind him.
    //
    // The eruption used to play in one static wide from the right, which reads
    // as two figures at a distance. These sit behind the striking figure with
    // the guard's light uniform filling the opposite side of frame, so the
    // blow lands in the foreground instead of across the room. Each holds
    // through the contact and cuts out; the beat times are untouched.
    {
      id: '5',
      subject: 'a16 strike close (man)',
      t0: 12.2,
      update(ctx, eye, look) {
        const g = ctx.world.actors.get('g0');
        const tgt = g ? v(g.pose.pos[0], 1.18, g.pose.pos[2]) : v(1.4, 1.18, 10.1);
        // behind his shoulder, offset to his left so the strike crosses frame
        const dx = tgt.x - ctx.neo.x, dz = tgt.z - ctx.neo.z;
        const L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;
        eye.set(
          ctx.neo.x - ux * 1.02 - uz * 0.52,
          1.62,
          ctx.neo.z - uz * 1.02 + ux * 0.52,
        );
        look.set(tgt.x * 0.72 + ctx.neo.x * 0.28, 1.24, tgt.z * 0.72 + ctx.neo.z * 0.28);
      },
    },
    // 5b — A16: the woman's kick, close and from behind her. This is the one
    // the beat is built around.
    {
      id: '5b',
      subject: 'a16 strike close (woman)',
      t0: 12.92,
      update(ctx, eye, look) {
        const g = ctx.world.actors.get('g1');
        const tgt = g ? v(g.pose.pos[0], 1.16, g.pose.pos[2]) : v(-1.95, 1.16, 8.2);
        const dx = tgt.x - ctx.trin.x, dz = tgt.z - ctx.trin.z;
        const L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;
        // Framed for the CONTACT frame, not the cue. The kick launches at
        // 13.15 with 1.9 m still between them and connects at 13.30 with 1.0 m
        // — a two-shot built on the cue time shows a strike landing on nobody.
        eye.set(
          ctx.trin.x - ux * 0.86 + uz * 0.42,
          1.60,
          ctx.trin.z - uz * 0.86 - ux * 0.42,
        );
        look.set(tgt.x * 0.66 + ctx.trin.x * 0.34, 1.22, tgt.z * 0.66 + ctx.trin.z * 0.34);
      },
    },
    // 5c — back out to the wide as the last two strikes land, which also
    // carries the beat into the storm-in without stretching it.
    {
      id: '5c',
      subject: 'eruption wide',
      t0: 13.52,
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
    // 6b — A15 DEPLOYMENT: a low wide down the hall, held, so the whole squad
    // is read as one body fanning out into cover rather than as individuals.
    // The lens drifts back as the line forms, which lets the frame fill.
    {
      id: '6b',
      subject: 'a15 deployment',
      t0: 15.0,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 2.6);
        eye.set(0.6, 1.02 + k * 0.18, -1.2 + k * 2.9);
        look.set(0, 1.15, -9.5);
      },
    },
    // 6c — A15 STANDOFF: lateral track across the formed line, weapons
    // trained, nobody firing. Slow and level — the stillness is the point, and
    // B24's shake is gated to zero through here.
    {
      id: '6c',
      subject: 'a15 standoff',
      t0: 17.62,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 1.4);
        eye.set(-2.5 + k * 1.9, 1.55, 0.4);
        look.set(-0.4 + k * 0.9, 1.25, -7.5);
      },
    },
    // 6d — A15 BREAK: cut to the man as he fires and moves in one motion.
    // This is where the A5 muzzle-exit insert now lands.
    {
      id: '6d',
      subject: 'a15 break / a5 insert',
      t0: 18.9,
      update(ctx, eye, look) {
        const k = clamp01(ctx.realT / 4);
        eye.set(ctx.neo.x + 1.15 - k * 0.2, 1.42, ctx.neo.z + 1.35 + k * 0.1);
        look.copy(ctx.neo).add(v(0, 1.3, 0));
      },
    },
    // 7 — SET PIECE 1: orbit the cartwheel (slow-mo inside).
    {
      id: '7',
      subject: 'set piece 1',
      t0: 19.2,
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
    // 14b — A7/B21 BULLET-CAM: leave the muzzle with the round, ride it
    // across the hall close enough to read it, and SEE it connect.
    //
    // The rebuild was driven by measuring the old one rather than by re-staging
    // it. The round lives from t=39.700 to 39.750 and the old ride handed over
    // at flight > hitDist - 0.75, so it lasted 38 ms of sim; a frame at 39.74
    // was already past it and on the impact wide, which is the wide, distant
    // view the report described. And the lens rode 0.40 m abeam a 4.6 cm
    // round, which is a few pixels — a shot that cannot show its subject has
    // failed however correct the path code is.
    {
      id: '14b',
      subject: 'a7 bullet-cam',
      t0: 39.62,
      update(ctx, eye, look) {
        const p = ctx.world.projectiles.find((q) => q.cam);
        // 1 — before the round exists: abeam the muzzle it is about to leave,
        //     so the flash and smoke at exit are the first thing seen. The
        //     framing is derived from her actual aim rather than from fixed
        //     offsets — offsets guessed against her facing put her behind the
        //     lens entirely — and it matches the ride geometry below, so the
        //     hand-over is continuous rather than a cut.
        if (!p) {
          const sh = ctx.trin;
          const a = ctx.world.actors.get('trin')?.aim;
          let dx = 0, dz = -1;
          if (a) {
            dx = a[0] - sh.x;
            dz = a[2] - sh.z;
            const L = Math.hypot(dx, dz) || 1;
            dx /= L; dz /= L;
          }
          const mx = sh.x + dx * 0.42;
          const mz = sh.z + dz * 0.42;
          const px = -dz, pz = dx;
          eye.set(mx + px * 0.78 - dx * 0.22, 1.26, mz + pz * 0.78 - dz * 0.22);
          look.set(mx + dx * 0.3, 1.32, mz + dz * 0.3);
          return;
        }
        const flight = (ctx.world.t - p.born) * p.speed;
        const hx = p.from[0] + p.dir[0] * flight;
        const hy = p.from[1] + p.dir[1] * flight;
        const hz = p.from[2] + p.dir[2] * flight;
        // 2 — the ride, right up to the moment it lands. 0.13 m abeam and a
        //     touch behind, so the round is large in frame, held in profile,
        //     with the hall streaking past behind it.
        if (!p.done && flight < p.hitDist - 0.06) {
          const px = -p.dir[2], pz = p.dir[0]; // horizontal perpendicular
          eye.set(
            hx + px * 0.13 - p.dir[0] * 0.055,
            hy + 0.022,
            hz + pz * 0.13 - p.dir[2] * 0.055,
          );
          look.set(hx + p.dir[0] * 0.05, hy, hz + p.dir[2] * 0.05);
          return;
        }
        // 3 — the hit, seen: pull off the round onto the man as he is thrown
        //     back into the stone. Close enough to read, moving away as he
        //     goes, so the frame is already leaving him as he settles.
        const since = clamp01((ctx.world.t - (p.born + p.hitDist / p.speed)) / 0.19);
        const tgt = v(
          p.from[0] + p.dir[0] * p.hitDist,
          1.15,
          p.from[2] + p.dir[2] * p.hitDist,
        );
        const px2 = -p.dir[2], pz2 = p.dir[0];
        eye.set(
          tgt.x + px2 * (1.5 + since * 1.7) - p.dir[0] * (0.6 + since * 1.5),
          1.5 + since * 0.75,
          tgt.z + pz2 * (1.5 + since * 1.7) - p.dir[2] * (0.6 + since * 1.5),
        );
        look.set(tgt.x, 1.15 - since * 0.35, tgt.z);
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
        // B26/B31: the closing hold is STATIC, framed from the outset so the
        // tile that lets go is readable where it falls.
        //
        // B26 solved the legibility by drifting in onto the near-left column
        // over 1.5 s. It worked — the slab went from 25 x 52 px (1.9% of a
        // 1280-wide frame, at 11.6 m and almost edge-on, which is why the gag
        // was reported as happening off camera) to 74 x 147 px. But a camera
        // that moves in on a column just before something happens there
        // announces the joke, and the drift was still running when the tile
        // went: the gag is at realT 1.8 and the move ended at 1.85.
        //
        // So the framing the drift ARRIVED at becomes the framing the shot
        // opens on, and nothing moves. Measured on this static frame, with no
        // camera motion helping it, the slab spans 4.7% of the frame width at
        // separation, 5.9% through the fall and 4.0% at the landing.
        //
        // The aim is 0.28 m lower than the drift's end point. Held at that
        // exact framing the tile landed with its centre 81 px from the bottom
        // edge and a quarter of it cropped; dropping the aim puts 95% of the
        // slab inside the frame at the landing without moving the camera and
        // without losing the wide — the wrecked column is still foreground and
        // the hall still runs back past the bodies to the elevators, with more
        // floor and less ceiling, which suits a shot about debris.
        eye.set(-0.9, 2.7, 5.8);
        look.set(-2.4, 1.22, -2.5);
      },
    },
  ];
}
