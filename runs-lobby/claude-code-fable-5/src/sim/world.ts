/**
 * Deterministic fixed-timestep simulation. No three.js, no DOM — pure state.
 * All randomness comes from the seeded RNG; the choreography (timeline.ts)
 * is fixed. Nothing ever despawns: decals, debris, casings and dropped guns
 * only accumulate (asserted by tests).
 */
import { mulberry32, rand, randInt, Rng } from './rng';
import {
  V3, add, scale, norm, sub, len, rayAABB, segmentHitsCapsule, segSegDist, RayHit,
} from './math3';
import { Surface, buildSurfaces, COLUMNS, COLUMN, settleClearOfSet, bodyRadiusFor } from './layout';
import * as TL from './timeline';
import { Slab, makeSlab, localOf, stripChunk, cellArea, isStripped, cellSize, releaseTile, forceReleaseTile } from './damage';
import type { SimEvent } from './events';

export const FIXED_DT = 1 / 240;

export interface ActorSim {
  id: string;
  role: 'protag' | 'guard' | 'soldier';
  pose: TL.Pose;
  alive: boolean;
  /** World point currently aimed at (render uses it for arm IK). */
  aim: V3 | null;
  /** A9: instantaneous horizontal velocity of the pose (m/s). */
  vel: V3;
  /**
   * A9: the same velocity run through a fixed-timestep low-pass. The gap
   * between `vel` and `velLag` is what the coat lags by, which is the
   * secondary motion. Fixed dt keeps it bit-reproducible.
   */
  velLag: V3;
}

export interface Casing {
  pos: V3; vel: V3; spin: V3; angle: V3;
  resting: boolean; bounces: number;
  /** spawn time (A7: lets the casing insert follow one casing). */
  born: number;
}
/**
 * B18: the fragment pool ceiling. Large enough that a full run does not reach
 * it (measured below 9000), with an explicit recycle policy if it ever does.
 */
const MAX_DEBRIS_SIM = 12000;

export interface Debris {
  pos: V3; vel: V3; spin: V3; angle: V3;
  size: number; kind: number; resting: boolean; bounces: number;
  /**
   * B18 size class: 0 fine grit, 1 gravel-sized chip, 2 larger flake. The
   * renderer draws each class from its own instanced mesh with its own
   * geometry, so the cheap class can carry the density.
   */
  cls: 0 | 1 | 2;
}
export interface Decal {
  surface: string; pos: V3; normal: V3; size: number;
  kind: 'hole' | 'crater'; rot: number;
  /**
   * B16/B20: which layer this mark describes. A `facing` mark is a spall
   * crater in polished stone and is only valid while that stone is still
   * there — it must vanish if the cladding under it is later shot away.
   * A `core` mark is a pock in the exposed coarse material and stays.
   */
  layer: 'facing' | 'core';
  /** slab this mark sits on, and its centre in that slab's grid uv */
  slab: string; su: number; sv: number;
}
/**
 * B19: a whole tile of cladding that has let go and is falling.
 *
 * Deliberately an order of magnitude larger than a chip and much heavier in
 * its motion: slower rotation, a steeper fall, no fluttering. A handful of
 * these over the fight — they are punctuation, not texture.
 */
export interface TileSlab {
  pos: V3; vel: V3; angle: V3; spin: V3;
  size: number; thickness: number;
  /** which way the face it came off was pointing, for the initial pose */
  axis: 0 | 2; sign: 1 | -1;
  born: number; landed: boolean;
}

export interface DroppedGun {
  pos: V3; vel: V3; yaw: number; spinY: number; resting: boolean;
  /** B10: the weapon that was actually being carried. */
  kind: 'pistol' | 'smg';
}
interface Projectile {
  from: V3; dir: V3; speed: number; born: number; hitDist: number;
  impact: { surface: string; pos: V3; normal: V3 } | null;
  shooter: string; done: boolean;
  /** A5: near-miss round that carries a visible air wake. */
  wake?: boolean;
  /** B3: always blows out a pale crater (light-on-dark read). */
  chew?: boolean;
  /** A7: the bullet-cam rides this projectile (last-soldier kill shot). */
  cam?: boolean;
}

const CHEST = 1.35;
const CAPSULE_R = 0.38;
const CAPSULE_H = 1.78;

export class World {
  readonly seed: number;
  t = 0;
  rng: Rng;
  surfaces: Surface[];
  actors = new Map<string, ActorSim>();
  casings: Casing[] = [];
  debris: Debris[] = [];
  decals: Decal[] = [];
  tileSlabs: TileSlab[] = [];
  droppedGuns: DroppedGun[] = [];
  /** B8: cladding damage grids, one per destructible face. */
  slabs: Slab[] = [];
  private slabById = new Map<string, Slab[]>();
  projectiles: Projectile[] = [];
  private events: SimEvent[] = [];

  private shotIdx = 0;
  private roundPlan: { t: number; soldier: number; first: boolean }[] = [];
  private roundIdx = 0;
  private cueIdx = 0;
  /** B28: events scheduled for a later frame (melee contact and reaction). */
  private pending: { t: number; ev: SimEvent }[] = [];
  private deathList: { t: number; id: string }[] = [];
  private deathIdx = 0;
  private settleIdx = 0;
  private dodgeIdx = 0;
  private chaseIdx = 0;
  private finalCasingDone = false;
  private walkAcc: Record<string, number> = { neo: 0, trin: 0 };
  private lastPos: Record<string, V3 | null> = { neo: null, trin: null };
  /** B25: per-soldier stride accumulation during the rush in. */
  private bootAcc: number[] = [];
  private bootPrev: (V3 | null)[] = [];
  private gearAcc: number[] = [];
  private planted: boolean[] = [];

  constructor(seed: number) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.surfaces = buildSurfaces();
    this.buildSlabs();
    this.actors.set('neo', { id: 'neo', role: 'protag', pose: TL.neoPose(0), alive: true, aim: null , vel: [0, 0, 0], velLag: [0, 0, 0] });
    this.actors.set('trin', { id: 'trin', role: 'protag', pose: TL.trinPose(0), alive: true, aim: null , vel: [0, 0, 0], velLag: [0, 0, 0] });
    for (const g of TL.GUARDS) {
      this.actors.set(g.id, { id: g.id, role: 'guard', pose: TL.guardPose(g.id, 0), alive: true, aim: null , vel: [0, 0, 0], velLag: [0, 0, 0] });
    }
    for (const s of TL.SOLDIERS) {
      this.actors.set(s.id, { id: s.id, role: 'soldier', pose: TL.soldierPose(s, 0), alive: true, aim: null , vel: [0, 0, 0], velLag: [0, 0, 0] });
    }
    // Flatten soldier bursts into a global, time-sorted round plan.
    TL.SOLDIERS.forEach((def, si) => {
      for (const b of TL.soldierBursts(def)) {
        for (let j = 0; j < 5; j++) {
          this.roundPlan.push({ t: b + j * 0.09, soldier: si, first: j === 0 });
        }
      }
    });
    this.roundPlan.sort((a, b) => a.t - b.t);
    this.deathList = Object.entries(TL.DEATHS)
      .map(([id, t]) => ({ id, t }))
      .sort((a, b) => a.t - b.t);
  }

  /** Consume all events emitted since the last drain. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /**
   * B30: a defender never occupies the same space as the set, at any frame.
   *
   * The B28.1 clearance check only ever looked at the final resting pose.
   * Sampled across the whole run, defenders were up to 0.84 m inside a column
   * while RUNNING to cover: the run is a straight lerp from the door to the
   * cover point, and several of those lines pass straight through the very
   * columns they are running to hide behind. The bullet-cam target was the
   * visible symptom, standing half inside his column at the moment the shot
   * lands, which is the one frame the camera is closest to him.
   *
   * Defenders only. The protagonists' choreography touches the set on purpose
   * (the wall run is the obvious case) and pushing them off it would break a
   * set piece to fix a problem they do not have.
   */
  private keepClearOfSet(a: ActorSim) {
    if (a.pose.action === 'hidden') return;
    const [x, z] = settleClearOfSet(a.pose.pos[0], a.pose.pos[2], bodyRadiusFor(a.pose.action));
    if (x === a.pose.pos[0] && z === a.pose.pos[2]) return;
    a.pose = { ...a.pose, pos: [x, a.pose.pos[1], z] };
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  step(dt: number = FIXED_DT) {
    const t0 = this.t;
    this.t += dt;
    const t = this.t;

    // 1. Actor poses from the choreography.
    // A9: the previous pose is still in place here, so velocity is a plain
    // finite difference over the fixed step, and the lag filter below is
    // therefore deterministic.
    const lagK = 1 - Math.exp(-dt * 7);
    for (const a of this.actors.values()) {
      const prev = a.pose.pos;
      if (a.role === 'protag') {
        a.pose = a.id === 'neo' ? TL.neoPose(t) : TL.trinPose(t);
      } else if (a.role === 'guard') {
        a.pose = TL.guardPose(a.id, t);
        this.keepClearOfSet(a);
      } else {
        const def = TL.SOLDIERS.find((s) => s.id === a.id)!;
        a.pose = TL.soldierPose(def, t);
        this.keepClearOfSet(a);
      }
      a.vel = [(a.pose.pos[0] - prev[0]) / dt, 0, (a.pose.pos[2] - prev[2]) / dt];
      a.velLag = [
        a.velLag[0] + (a.vel[0] - a.velLag[0]) * lagK,
        0,
        a.velLag[2] + (a.vel[2] - a.velLag[2]) * lagK,
      ];
      const death = TL.DEATHS[a.id];
      a.alive = death === undefined || t < death;
    }
    this.updateAims();

    // 2. Deaths crossing this step.
    while (this.deathIdx < this.deathList.length && this.deathList[this.deathIdx].t <= t) {
      const d = this.deathList[this.deathIdx++];
      this.emit({ type: 'GUARD_DOWN', t: d.t, id: d.id, style: TL.DEATH_STYLE[d.id] });
      // B21: the knock-back punches a burst of dust out of the stone he is
      // thrown into. Aimed at the face behind him rather than at him — the
      // camera is on the stone, not on the man.
      if (TL.DEATH_STYLE[d.id] === 'knockback') {
        const a0 = this.actors.get(d.id);
        if (a0) {
          const back = this.slabBehind(a0.pose.pos);
          if (back) {
            this.applyImpact(back.surface, back.pos, back.normal, true, back.dir);
          }
        }
      }
      // B10: every defender who goes down leaves the weapon he was carrying
      // on the floor at the point of the fall — the guards a holstered
      // sidearm, the soldiers their submachine gun.
      const a = this.actors.get(d.id);
      if (a) {
        const p = a.pose;
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        this.droppedGuns.push({
          pos: [p.pos[0] + fx * 0.2 + rand(this.rng, -0.25, 0.25), 1.0,
                p.pos[2] + fz * 0.2 + rand(this.rng, -0.25, 0.25)],
          vel: [rand(this.rng, -1.4, 1.4), rand(this.rng, 0.1, 0.7), rand(this.rng, -1.4, 1.4)],
          yaw: p.yaw + rand(this.rng, -1, 1),
          spinY: rand(this.rng, -7, 7),
          resting: false,
          kind: a.role === 'guard' ? 'pistol' : 'smg',
        });
      }
    }

    // 3. Cues.
    // B28: scheduled melee events whose moment has arrived. Drained before
    // the cue list so a hit and its reaction cannot land on the same frame as
    // the swing that caused them.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].t > t) continue;
      this.emit(this.pending[i].ev);
      this.pending.splice(i, 1);
    }

    while (this.cueIdx < TL.CUES.length && TL.CUES[this.cueIdx].t <= t) {
      const c = TL.CUES[this.cueIdx++];
      if (c.type === 'GUN_DROP') {
        const a = this.actors.get(c.actor!)!;
        const p = a.pose;
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        const gun: DroppedGun = {
          pos: [p.pos[0] + fx * 0.35, 1.05, p.pos[2] + fz * 0.35],
          vel: [fx * rand(this.rng, 1.0, 2.2) + rand(this.rng, -0.6, 0.6), rand(this.rng, 0.2, 0.8), fz * rand(this.rng, 1.0, 2.2)],
          yaw: p.yaw, spinY: rand(this.rng, -9, 9), resting: false,
          kind: 'pistol',
        };
        this.droppedGuns.push(gun);
        this.emit({ type: 'GUN_DROP', t: c.t, pos: [...gun.pos], by: c.actor! });
      } else if (c.type === 'TILE_GAG') {
        // A13: the column the closing wide is already looking at, so the eye
        // is in the right place when it goes.
        // Candidates in preference order, because how destroyed a given face
        // ends up is not fixed: doubling the squad (A15) chewed the first
        // choice past the point where it had a loose tile left to give, and a
        // single hardcoded face silently produced no gag at all.
        for (const id of TL.GAG_SLAB) {
          const face = this.slabs.find((s) => s.id === id);
          const rel = face ? forceReleaseTile(face) : null;
          if (face && rel) { this.dropTile(face, rel, true); break; }
        }
      } else if (c.type === 'STRIKE' || c.type === 'KICK') {
        // the swing fires now; the landing and the reaction are scheduled.
        // A flying kick leaves the ground well before it connects, so the
        // contact delay is per-cue rather than assumed to be zero.
        this.emit({ ...({ type: c.type } as SimEvent), t: c.t, actor: c.actor } as SimEvent);
        const contact = c.t + (c.type === 'KICK' ? TL.KICK_CONTACT_DELAY : TL.STRIKE_CONTACT_DELAY);
        const victim = this.nearestGuardTo(c.actor!, contact);
        if (victim) {
          const vp = this.actors.get(victim)!.pose.pos;
          this.pending.push({
            t: contact,
            ev: { type: 'MELEE_HIT', t: contact, actor: c.actor!, target: victim, pos: [...vp] },
          });
          this.pending.push({
            t: contact + TL.MELEE_REACT_DELAY,
            ev: { type: 'MELEE_REACT', t: contact + TL.MELEE_REACT_DELAY, target: victim, pos: [...vp] },
          });
        }
      } else if (c.type === 'VO') {
        this.emit({ type: 'VO', t: c.t, line: c.line! });
      } else {
        this.emit({ ...( { type: c.type } as SimEvent), t: c.t, ...(c.actor ? { actor: c.actor } : {}) } as SimEvent);
      }
    }

    // 4b. B25: the squad rush. Each man's steps come off HIS OWN stride, so
    // the clatter is many feet out of step with each other rather than one
    // loud person; the sample and pitch vary per man from his index. The
    // clatter stops the moment he sets into cover, which is what hands into
    // the A15 standoff — the sudden absence is what makes the silence land.
    for (let i = 0; i < TL.SOLDIERS.length; i++) {
      const def = TL.SOLDIERS[i];
      const a = this.actors.get(def.id);
      if (!a) continue;
      const prev = this.bootPrev[i] ?? null;
      const running = a.alive && a.pose.action === 'run';
      if (prev && running) {
        const d = Math.hypot(a.pose.pos[0] - prev[0], a.pose.pos[2] - prev[2]);
        // Each man gets his OWN stride length as well as his own phase. With
        // a shared stride and a regularly spaced offset, men who set off
        // together stayed in lockstep — measured at 41% of steps landing
        // within 5 ms of another man's, which is a marching column rather than
        // a squad rushing a lobby. Both values come off a hash of his index,
        // so it is deterministic and they never re-sync.
        const h1 = ((i * 2654435761) >>> 0) / 4294967296;
        const h2 = ((i * 40503 + 12345) >>> 0 & 0xffff) / 65536;
        const stride = 0.54 + h1 * 0.19;
        this.bootAcc[i] = (this.bootAcc[i] ?? h2 * stride) + d;
        if (this.bootAcc[i] > stride) {
          this.bootAcc[i] -= stride;
          this.emit({ type: 'BOOT', t, who: i, pos: [...a.pose.pos], plant: false });
        }
        this.gearAcc[i] = (this.gearAcc[i] ?? 0) + d;
        if (this.gearAcc[i] > 1.45) {
          this.gearAcc[i] = 0;
          this.emit({ type: 'GEAR', t, who: i, pos: [...a.pose.pos] });
        }
      }
      // the hard stop as he plants into cover
      if (!this.planted[i] && a.alive && prev && !running && a.pose.action === 'cover') {
        this.planted[i] = true;
        this.emit({ type: 'BOOT', t, who: i, pos: [...a.pose.pos], plant: true });
      }
      this.bootPrev[i] = [...a.pose.pos];
    }

    // 4. Footsteps (audible only in the calm phases).
    if (t < 12.2 || t > 41) {
      for (const id of ['neo', 'trin'] as const) {
        const a = this.actors.get(id)!;
        const prev = this.lastPos[id];
        if (prev && (a.pose.action === 'walk' || a.pose.action === 'shootAdvance')) {
          const d = Math.hypot(a.pose.pos[0] - prev[0], a.pose.pos[2] - prev[2]);
          this.walkAcc[id] += d;
          if (this.walkAcc[id] > 0.78) {
            this.walkAcc[id] = 0;
            this.emit({ type: 'FOOTSTEP', t, actor: id, pos: [...a.pose.pos] });
          }
        }
        this.lastPos[id] = [...a.pose.pos];
      }
    }

    // 5. Protagonist shots.
    while (this.shotIdx < TL.SHOT_PLAN.length && TL.SHOT_PLAN[this.shotIdx].t <= t) {
      this.fireProtagonist(TL.SHOT_PLAN[this.shotIdx++]);
    }

    // 6. Soldier rounds.
    while (this.roundIdx < this.roundPlan.length && this.roundPlan[this.roundIdx].t <= t) {
      this.fireSoldier(this.roundPlan[this.roundIdx++]);
    }

    // 6b. A5 dodge volley: scripted near-misses that streak past the
    // leaning man, each carrying a visible air wake.
    while (
      this.dodgeIdx < TL.DODGE_SHOT_TIMES.length &&
      TL.DODGE_SHOT_TIMES[this.dodgeIdx] <= t
    ) {
      const i = this.dodgeIdx++;
      const s3 = this.actors.get('s3')!;
      const muzzle: V3 = [s3.pose.pos[0] + 0.4, 1.35, s3.pose.pos[2] + 0.35];
      // aim above/beside the leaned torso: passes where his chest WAS
      const target: V3 = [
        TL.DODGE_POS[0] + (i % 2 === 0 ? -0.18 : 0.22),
        1.32 + i * 0.09,
        TL.DODGE_POS[1],
      ];
      const dir = norm(sub(target, muzzle));
      const cast = this.raycastSurfaces(muzzle, dir);
      const dist = cast ? cast.hit.t : 60;
      const end: V3 = [muzzle[0] + dir[0] * dist, muzzle[1] + dir[1] * dist, muzzle[2] + dir[2] * dist];
      if (this.hitsProtagonist(muzzle, end, '')) continue; // must never connect
      this.projectiles.push({
        from: muzzle, dir, speed: 90, born: this.t, hitDist: dist,
        impact: cast ? { surface: cast.surface, pos: cast.hit.point, normal: cast.hit.normal } : null,
        shooter: 's3', done: false, wake: true,
      });
      this.emit({ type: 'WAKE_SHOT', t: this.t, pos: [...muzzle], dir: [...dir] });
      this.emit({ type: 'SHOT', t: this.t, shooter: 's3', weapon: 'smg', pos: [...muzzle], dir: [...dir] });
      this.spawnCasing(muzzle, Math.atan2(dir[0], dir[2]));
    }

    // 6c. B3 wall-chase volley: return fire raking the wall just behind
    // and below the wall run, so the impact trail visibly chases her.
    while (
      this.chaseIdx < TL.WALLCHASE_TIMES.length &&
      TL.WALLCHASE_TIMES[this.chaseIdx] <= t
    ) {
      this.chaseIdx++;
      const trin = this.actors.get('trin')!;
      if (trin.pose.action !== 'wallrun') continue;
      // s3 has a clear diagonal to the wall behind her (no column in the way)
      const s3c = this.actors.get('s3')!;
      const muzzle: V3 = [s3c.pose.pos[0] + 0.55, 1.32, s3c.pose.pos[2] + 0.35];
      const p = trin.pose.pos;
      if (p[1] < 1.0) continue; // only rake the wall while she is up high
      const aimPoint: V3 = [
        p[0],
        Math.max(1.28, p[1] - 0.45 + rand(this.rng, -0.12, 0.12)),
        p[2] + 0.75 + rand(this.rng, 0, 0.35),
      ];
      const dir = norm(sub(aimPoint, muzzle));
      const cast = this.raycastSurfaces(muzzle, dir);
      if (!cast) continue;
      const end: V3 = [muzzle[0] + dir[0] * cast.hit.t, muzzle[1] + dir[1] * cast.hit.t, muzzle[2] + dir[2] * cast.hit.t];
      // scripted rake: precise pass with a tight (but real) miss margin
      if (this.hitsProtagonist(muzzle, end, '', 0.15)) continue; // never connects
      this.projectiles.push({
        from: muzzle, dir, speed: 90, born: this.t, hitDist: cast.hit.t,
        impact: { surface: cast.surface, pos: cast.hit.point, normal: cast.hit.normal },
        shooter: 's3', done: false, chew: true,
      });
      this.emit({ type: 'SHOT', t: this.t, shooter: 's3', weapon: 'smg', pos: [...muzzle], dir: [...dir] });
      this.spawnCasing(muzzle, Math.atan2(dir[0], dir[2]));
    }

    // 7. Projectiles reaching their impact point.
    for (const p of this.projectiles) {
      if (p.done) continue;
      const dist = (t - p.born) * p.speed;
      if (dist >= p.hitDist) {
        p.done = true;
        if (p.impact) this.applyImpact(p.impact.surface, p.impact.pos, p.impact.normal, p.chew, p.dir);
      }
    }

    // 8. Debris / casing / dropped-gun physics.
    this.physics(dt);

    // 9. Wind-down extras.
    while (this.settleIdx < TL.SETTLE_TIMES.length && TL.SETTLE_TIMES[this.settleIdx] <= t) {
      this.settleIdx++;
      if (this.decals.length > 0) {
        const d = this.decals[randInt(this.rng, this.decals.length)];
        this.ejectCone(d.pos, d.normal, [...d.normal], 0.45, [3, 1, 0]);
      }
    }
    if (!this.finalCasingDone && t >= TL.FINAL_CASING_T) {
      this.finalCasingDone = true;
      this.casings.push({
        pos: [0.4, 1.4, -6.4],
        vel: [rand(this.rng, -0.3, 0.3), 0.4, rand(this.rng, -0.3, 0.3)],
        spin: [rand(this.rng, 14, 22), rand(this.rng, 25, 40), rand(this.rng, 10, 20)],
        angle: [0, 0, 0], resting: false, bounces: 0, born: this.t,
      });
    }
    void t0;
  }

  // ------------------------------------------------------------- aiming ---

  private updateAims() {
    const neo = this.actors.get('neo')!;
    const trin = this.actors.get('trin')!;
    for (const p of [neo, trin]) {
      const tgt = this.nearestAliveSoldier(p.pose.pos);
      if (tgt) {
        const h = tgt.pose.action === 'cover' ? 1.0 : CHEST;
        p.aim = [tgt.pose.pos[0], h, tgt.pose.pos[2]];
      } else {
        p.aim = [p.pose.pos[0] + Math.sin(p.pose.yaw) * 8, 1.3, p.pose.pos[2] + Math.cos(p.pose.yaw) * 8];
      }
    }
    TL.SOLDIERS.forEach((def, i) => {
      const s = this.actors.get(def.id)!;
      const target = this.actors.get(i % 2 === 0 ? 'neo' : 'trin')!;
      if (target.pose.action === 'wallrun') {
        // B3: return fire chases her along the wall — aim at the wall just
        // behind and below her body so the impact trail erupts in her wake
        const p = target.pose.pos;
        s.aim = [p[0] - 0.05, Math.max(1.3, p[1] - 0.35), p[2] + 0.7];
      } else {
        s.aim = [target.pose.pos[0], CHEST, target.pose.pos[2]];
      }
    });
  }

  private nearestAliveSoldier(p: V3): ActorSim | null {
    let best: ActorSim | null = null;
    let bestD = Infinity;
    for (const a of this.actors.values()) {
      if (a.role !== 'soldier' || !a.alive) continue;
      if (a.pose.action === 'hidden') continue;
      const d = Math.hypot(a.pose.pos[0] - p[0], a.pose.pos[2] - p[2]);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  // ------------------------------------------------------------- firing ---

  private muzzleOf(a: ActorSim, left: boolean): V3 {
    const p = a.pose;
    const fx0 = Math.sin(p.yaw), fz0 = Math.cos(p.yaw);
    if (p.action === 'wallrun') {
      // horizontal body off the left wall: the firing hand reaches toward
      // the hall (B3). Offsets follow the rendered arm, not a guess (B5).
      return [
        p.pos[0] + fx0 * 0.36 + fz0 * 0.1,
        p.pos[1] + 0.97,
        p.pos[2] + fz0 * 0.36 - fx0 * 0.1,
      ];
    }
    const fx = fx0, fz = fz0;
    const rx = fz, rz = -fx; // right vector
    // B5: these offsets track the barrel tip of the rendered rig (arm
    // extended, gun in the fist). They used to sit ~0.5 m short and 0.15 m
    // low, so the tracer appeared to start in mid-air beside the gun.
    const side = left ? -0.16 : 0.16;
    const crouch = p.action.startsWith('crouch');
    const fwd = p.action === 'cartwheel' ? 0.35 : crouch ? 0.98 : 0.92;
    const y = p.pos[1] + (p.action === 'cartwheel' ? 1.35 : crouch ? 1.16 : 1.52);
    // leaning out of cover shifts the whole body sideways; the muzzle goes
    // with it, otherwise the tracer starts a metre off the gun (B5)
    const leanSide = p.action === 'coverR' ? 1 : p.action === 'coverL' ? -1 : 0;
    const lean = leanSide * p.phase * 0.55;
    return [
      p.pos[0] + fx * fwd + rx * (side + lean),
      y,
      p.pos[2] + fz * fwd + rz * (side + lean),
    ];
  }

  /** Segment blocked by a protagonist capsule? (The capsule follows the
   *  pose: a dodging body is leaned flat backward, so its upright extent
   *  shrinks — that is exactly what the dodge exploits.) */
  private hitsProtagonist(from: V3, to: V3, exclude: string, radius = CAPSULE_R): string | null {
    for (const id of ['neo', 'trin']) {
      if (id === exclude) continue;
      const a = this.actors.get(id)!;
      if (a.pose.action === 'wallrun') {
        // horizontal body along +X off the left wall (B3)
        const p = a.pose.pos;
        const b0: V3 = [p[0], p[1], p[2]];
        const b1: V3 = [p[0] + 1.75, p[1], p[2]];
        if (segSegDist(from, to, b0, b1) <= radius) return id;
        continue;
      }
      const h = a.pose.action === 'dodge' ? 0.85 : CAPSULE_H;
      if (segmentHitsCapsule(from, to, a.pose.pos, h, radius)) return id;
    }
    return null;
  }

  private raycastSurfaces(from: V3, dir: V3): { surface: string; hit: RayHit } | null {
    let best: { surface: string; hit: RayHit } | null = null;
    for (const s of this.surfaces) {
      const h = rayAABB(from, dir, s.min, s.max);
      if (h && (!best || h.t < best.hit.t)) best = { surface: s.id, hit: h };
    }
    // Floor plane fallback.
    if (dir[1] < -1e-6) {
      const tF = -from[1] / dir[1];
      if (tF > 0 && (!best || tF < best.hit.t)) {
        best = {
          surface: 'floor',
          hit: { t: tF, point: [from[0] + dir[0] * tF, 0, from[2] + dir[2] * tF], normal: [0, 1, 0] },
        };
      }
    }
    return best;
  }

  private fireProtagonist(shot: TL.PlannedShot) {
    const shooter = this.actors.get(shot.shooter)!;
    const other = shot.shooter === 'neo' ? 'trin' : 'neo';
    const muzzle = this.muzzleOf(shooter, !!shot.left);

    let aimPoint: V3;
    if (shot.kill) {
      const tgt = this.actors.get(shot.kill)!;
      const h = tgt.pose.action === 'cover' ? 1.05 : 1.3;
      aimPoint = [tgt.pose.pos[0], h, tgt.pose.pos[2]];
    } else {
      const tgt = this.nearestAliveSoldier(shooter.pose.pos);
      if (!tgt) return;
      // B13: most covering fire is put ONTO the column the target is using,
      // not merely near him, so the facing of the columns the fight is fought
      // around is actually destroyed rather than lightly scuffed. The
      // remainder still sprays around his position, which keeps the rest of
      // the hall marked without flattening the contrast between the columns
      // that saw fire and the ones that did not.
      const def = TL.SOLDIERS.find((d) => d.id === tgt.id);
      const col = def ? COLUMNS[def.colIndex] : null;
      if (col && this.rng() < 0.85) {
        const half = COLUMN.size / 2;
        // pick the column face turned toward the shooter
        const dx = shooter.pose.pos[0] - col.x;
        const dz = shooter.pose.pos[2] - col.z;
        if (Math.abs(dx) > Math.abs(dz)) {
          aimPoint = [
            col.x + Math.sign(dx) * half,
            rand(this.rng, 0.5, 2.5),
            col.z + rand(this.rng, -half, half),
          ];
        } else {
          aimPoint = [
            col.x + rand(this.rng, -half, half),
            rand(this.rng, 0.5, 2.5),
            col.z + Math.sign(dz) * half,
          ];
        }
      } else {
        aimPoint = [
          tgt.pose.pos[0] + rand(this.rng, -0.9, 0.9),
          rand(this.rng, 0.6, 2.2),
          tgt.pose.pos[2] + rand(this.rng, -0.3, 0.6),
        ];
      }
    }

    const dir = norm(sub(aimPoint, muzzle));
    const cast = this.raycastSurfaces(muzzle, dir);
    const hitDist = shot.kill
      ? len(sub(aimPoint, muzzle))
      : cast
        ? cast.hit.t
        : 60;
    const endPoint: V3 = [muzzle[0] + dir[0] * hitDist, muzzle[1] + dir[1] * hitDist, muzzle[2] + dir[2] * hitDist];

    // Friendly-fire guard: never fire through the partner. Kill shots are
    // structurally clear (partner never stands in the lane), but verify.
    const blocked = this.hitsProtagonist(muzzle, endPoint, shot.shooter);
    if (blocked) {
      if (!shot.kill) return; // skip a filler shot entirely
      this.emit({ type: 'FRIENDLY_HIT', t: this.t, shooter: shot.shooter });
      return;
    }

    this.projectiles.push({
      from: muzzle, dir, speed: 90, born: this.t, hitDist,
      impact: shot.kill || !cast ? null : { surface: cast.surface, pos: cast.hit.point, normal: cast.hit.normal },
      shooter: shot.shooter, done: false,
      // A7: the last-soldier kill shot carries the bullet-cam and a wake
      cam: shot.kill === 's7' || undefined,
      wake: shot.kill === 's7' || undefined,
    });
    this.emit({ type: 'SHOT', t: this.t, shooter: shot.shooter, weapon: 'pistol', pos: [...muzzle], dir: [...dir] });
    this.spawnCasing(muzzle, shooter.pose.yaw);
  }

  private fireSoldier(round: { t: number; soldier: number; first: boolean }) {
    const def = TL.SOLDIERS[round.soldier];
    const s = this.actors.get(def.id)!;
    if (!s.alive) return;
    const target = this.actors.get(round.soldier % 2 === 0 ? 'neo' : 'trin')!;
    const lean = def.leanSign * 0.55;
    // B5: the SMG muzzle sits where the rendered arm actually holds it —
    // reaching toward its target — with a little lateral lean so the round
    // still clears the column the soldier is using as cover.
    const tdx = target.pose.pos[0] - s.pose.pos[0];
    const tdz = target.pose.pos[2] - s.pose.pos[2];
    const tl = Math.hypot(tdx, tdz) || 1;
    const muzzle: V3 = [
      s.pose.pos[0] + (tdx / tl) * 0.8 + lean * 0.35,
      s.pose.pos[1] + 1.45,
      s.pose.pos[2] + (tdz / tl) * 0.8,
    ];
    const wallrun = target.pose.action === 'wallrun';
    const chest: V3 = wallrun
      // B3: chase her along the wall — the trail erupts just behind/below her
      ? [target.pose.pos[0] - 0.05, Math.max(1.3, target.pose.pos[1] - 0.35), target.pose.pos[2] + 0.7]
      : [target.pose.pos[0], target.pose.pos[1] + CHEST, target.pose.pos[2]];

    // Scripted miss: offset the aim until the ray misses both protagonists.
    const toT = norm(sub(chest, muzzle));
    const rx = toT[2], rz = -toT[0];
    let off = rand(this.rng, 0.55, 1.3) * (this.rng() < 0.5 ? -1 : 1);
    let dv = rand(this.rng, -0.25, 1.0);
    let dir: V3 = [0, 0, 0];
    let cast: { surface: string; hit: RayHit } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const aimPoint: V3 = [chest[0] + rx * off, chest[1] + dv, chest[2] + rz * off];
      dir = norm(sub(aimPoint, muzzle));
      cast = this.raycastSurfaces(muzzle, dir);
      const dist = cast ? cast.hit.t : 60;
      const end: V3 = [muzzle[0] + dir[0] * dist, muzzle[1] + dir[1] * dist, muzzle[2] + dir[2] * dist];
      if (!this.hitsProtagonist(muzzle, end, '')) break;
      off *= 1.6;
      dv += 0.3;
      cast = null;
    }
    if (round.first) this.emit({ type: 'BURST', t: this.t, shooter: def.id, pos: [...muzzle] });
    this.emit({ type: 'SHOT', t: this.t, shooter: def.id, weapon: 'smg', pos: [...muzzle], dir: [...dir] });
    this.projectiles.push({
      from: muzzle, dir, speed: 90, born: this.t,
      hitDist: cast ? cast.hit.t : 60,
      impact: cast ? { surface: cast.surface, pos: cast.hit.point, normal: cast.hit.normal } : null,
      shooter: def.id, done: false,
    });
    this.spawnCasing(muzzle, Math.atan2(dir[0], dir[2]));
  }

  /**
   * B8: one damage grid per destructible face. Columns get their four side
   * faces; the side walls, the elevator wall and the entrance wall get their
   * inward face. Grids are sized from the face's world extent, so a chunk is
   * the same physical size wherever it lands.
   */
  private buildSlabs() {
    const add = (s: Slab) => {
      this.slabs.push(s);
      const list = this.slabById.get(s.id.split('#')[0]) ?? [];
      list.push(s);
      this.slabById.set(s.id.split('#')[0], list);
    };
    for (const surf of this.surfaces) {
      if (surf.kind === 'desk') continue;
      // the entrance wall is mostly doorway and blown-out daylight; leave it
      // as plain architecture rather than a destructible slab
      if (surf.id === 'wallFront') continue;
      const [x0, y0, z0] = surf.min;
      const [x1, y1, z1] = surf.max;
      const height = y1 - y0;
      if (surf.kind === 'column') {
        // +X, -X, +Z, -Z faces
        add(makeSlab(`${surf.id}#px`, 0, 1, [x1, y0, z0], 2, z1 - z0, height));
        add(makeSlab(`${surf.id}#nx`, 0, -1, [x0, y0, z0], 2, z1 - z0, height));
        add(makeSlab(`${surf.id}#pz`, 2, 1, [x0, y0, z1], 0, x1 - x0, height));
        add(makeSlab(`${surf.id}#nz`, 2, -1, [x0, y0, z0], 0, x1 - x0, height));
      } else if (x1 - x0 < z1 - z0) {
        // side wall: the inward face is the one nearer the hall centre
        const inward = Math.abs(x0) < Math.abs(x1) ? x0 : x1;
        const sign: 1 | -1 = inward > 0 ? -1 : 1;
        add(makeSlab(`${surf.id}#f`, 0, sign, [inward, y0, z0], 2, z1 - z0, height));
      } else {
        const inward = Math.abs(z0) < Math.abs(z1) ? z0 : z1;
        const sign: 1 | -1 = inward > 0 ? -1 : 1;
        add(makeSlab(`${surf.id}#f`, 2, sign, [x0, y0, inward], 0, x1 - x0, height));
      }
    }
  }

  /** Pick the damage grid whose face the hit normal points out of. */
  private slabFor(surface: string, normal: V3): Slab | null {
    const list = this.slabById.get(surface);
    if (!list) return null;
    let best: Slab | null = null;
    let bestDot = 0.5;
    for (const s of list) {
      const d = normal[s.axis] * s.sign;
      if (d > bestDot) { bestDot = d; best = s; }
    }
    return best;
  }

  // -------------------------------------------------------- destruction ---

  /**
   * B18: the axis the ejecta leave along — the incoming round reflected off
   * the face, then biased back toward the normal so the cone comes AWAY from
   * the surface rather than skimming along it.
   */
  private ejectAxis(dir: V3 | null, normal: V3): V3 {
    if (!dir) return [...normal];
    const d = dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2];
    const rx = dir[0] - 2 * d * normal[0];
    const ry = dir[1] - 2 * d * normal[1];
    const rz = dir[2] - 2 * d * normal[2];
    const ex = rx + normal[0] * 0.9, ey = ry + normal[1] * 0.9, ez = rz + normal[2] * 0.9;
    const L = Math.hypot(ex, ey, ez) || 1;
    return [ex / L, ey / L, ez / L];
  }

  /** B18: throw a full cone of material, in three size classes at once. */
  private ejectCone(pos: V3, normal: V3, axis: V3, power: number, counts: [number, number, number]) {
    for (let c = 0 as 0 | 1 | 2; c < 3; c++) {
      for (let i = 0; i < counts[c]; i++) this.spawnDebris(pos, normal, axis, power, c as 0 | 1 | 2);
    }
  }

  private applyImpact(surface: string, pos: V3, normal: V3, chew = false, dir: V3 | null = null) {
    if (surface === 'floor') {
      // a round skipping off the polished floor throws less, and flatter
      this.ejectCone(pos, normal, this.ejectAxis(dir, normal), 0.7, [10, 3, 1]);
      this.emit({ type: 'IMPACT_MARBLE', t: this.t, surface, pos: [...pos], normal: [...normal] });
      return;
    }
    // Damage accumulates: repeated hits in one spot blow out a crater
    // exposing the substrate. Decals are never removed.
    let nearby = 0;
    for (const d of this.decals) {
      if (d.surface !== surface) continue;
      const dx = d.pos[0] - pos[0], dy = d.pos[1] - pos[1], dz = d.pos[2] - pos[2];
      if (dx * dx + dy * dy + dz * dz < 0.36) nearby++;
    }
    const crater = nearby >= 2 || chew;
    const size = crater ? rand(this.rng, 0.3, 0.48) : rand(this.rng, 0.13, 0.22);

    // B8: take a real chunk of cladding off. A first hit knocks a palm-sized
    // piece loose; a worked-over spot (or a deliberate chew burst) takes a
    // hand-sized one, and because every chunk writes into the same per-face
    // grid, repeated hits merge into larger stripped areas and eventually
    // whole missing tiles.
    const slab = this.slabFor(surface, normal);
    let strippedCells = 0;

    // Keep the mark fully on the surface face (no floating past edges). This
    // is done BEFORE the layer decision, not after: the clamp can move a mark
    // near an edge off the very cell that was stripped, and a mark whose
    // recorded position disagrees with the cell it was classified from is a
    // mark the renderer will clip against the wrong grid square.
    const surf = this.surfaces.find((s) => s.id === surface);
    const cpos: V3 = [...pos];
    if (surf) {
      for (let ax = 0; ax < 3; ax++) {
        if (Math.abs(normal[ax]) > 0.5) continue;
        const m = Math.min(size / 2, (surf.max[ax] - surf.min[ax]) / 2);
        cpos[ax] = Math.min(surf.max[ax] - m, Math.max(surf.min[ax] + m, cpos[ax]));
      }
    }

    // B16/B20: which layer did this round actually hit, and does the facing
    // survive it?
    //
    // Before this, every impact stripped its own cell, so every mark sat on
    // exposed core and a spall crater in polished stone was unreachable. Now a
    // round landing on virgin facing may simply pock it: the stone stays and
    // the mark is a facing mark. A worked-over spot or a deliberate chew burst
    // still takes a chunk out, and repeat fire still merges chunks into whole
    // missing tiles, so B13's "far too little damage" is not undone — the
    // spall path only ever applies to an isolated FIRST hit.
    let layer: 'facing' | 'core' = 'core';
    let su = 0, sv = 0;
    if (slab) {
      const [lu, lv] = localOf(slab, cpos);
      su = lu / (slab.w * cellSize);
      sv = lv / (slab.h * cellSize);
      const onCore = isStripped(slab, lu, lv);
      {
        const radius = crater ? rand(this.rng, 0.30, 0.50) : rand(this.rng, 0.13, 0.24);
        const seed = (Math.round(lu * 131) ^ Math.round(lv * 197)) | 0;
        strippedCells = stripChunk(slab, lu, lv, radius, seed);
        // B16/B20: the mark describes whatever the round actually struck, and
        // that is decided AFTER the damage is applied. If the facing survived
        // the hit it keeps a spall scar; if this hit is the one that took the
        // chunk, the facing there no longer exists and the mark is a core
        // pock. No coin flip decides it — accumulation does.
        layer = isStripped(slab, lu, lv) ? 'core' : 'facing';
        // B19: once enough of a tile is gone, the remainder lets go in one
        // piece rather than being nibbled away cell by cell
        const rel = releaseTile(slab, lu, lv, seed);
        if (rel) {
          strippedCells += rel.stripped;
          this.dropTile(slab, rel);
        }
      }
    }
    // B8: a crater is no longer painted on — the cladding is actually gone
    // there. Only small bullet holes in intact facing remain as decals.
    this.decals.push({
      surface, pos: cpos, normal: [...normal],
      // B13 supplement: this is a POCK in the exposed core, not a painted-on
      // crater. The cladding chunk is really gone (stripChunk above), so all
      // that belongs here is the small pit the round itself punched — a few
      // centimetres, not the palm-sized disc the pre-B8 decal used to be.
      size: crater ? size * 0.2 : size * 0.32,
      layer, slab: slab?.id ?? '', su, sv,
      kind: 'hole',
      rot: rand(this.rng, 0, Math.PI * 2),
    });
    // Debris is sized to what actually went missing from the wall: roughly
    // one visible fragment per 40 cm2 of stripped cladding, plus the usual
    // dust-and-chips from the impact itself.
    // B18: every round that bites stone is an ejection event, not a puff.
    // Taking cladding off throws markedly more and larger material than a hit
    // on already-exposed core, and the flake count still scales with how much
    // facing actually went missing.
    const chunkArea = strippedCells * cellArea;
    const extraFlakes = Math.min(6, Math.round(chunkArea / 0.012));
    // A15 supplement: doubling the squad roughly doubled the round count into
    // the stone (317 impacts to 525), which pushed the fragment pool into its
    // recycle path. The per-impact cone is trimmed rather than the cap simply
    // raised without limit — a single hit still throws real material, and the
    // aggregate under sustained fire is what the storm needs.
    const counts: [number, number, number] = strippedCells > 0
      ? [15, 6, 2 + extraFlakes]
      : layer === 'core' ? [9, 3, 1] : [8, 2, 1];
    this.ejectCone(pos, normal, this.ejectAxis(dir, normal), strippedCells > 0 ? 1.15 : 0.85, counts);
    this.emit({ type: 'IMPACT_MARBLE', t: this.t, surface, pos: [...pos], normal: [...normal] });
    if (this.rng() < 0.22) this.emit({ type: 'RICOCHET', t: this.t, pos: [...pos] });
  }

  /**
   * B18: how much material a single round throws.
   *
   * The pool is capped, and the policy at the cap is deliberate: recycle the
   * oldest AIRBORNE piece, never one that has come to rest. The persistence
   * contract stands — what has landed stays landed. If every slot is occupied
   * by a resting piece the spawn is dropped and counted, so a silently
   * saturated pool cannot make the effect weaker exactly when it should be
   * strongest; `debrisDropped` is checked in the tests.
   */
  private recycleAt = 0;
  debrisDropped = 0;

  private pushDebris(d: Debris) {
    if (this.debris.length < MAX_DEBRIS_SIM) { this.debris.push(d); return; }
    // rolling scan for the oldest airborne slot, amortised O(1)
    for (let i = 0; i < MAX_DEBRIS_SIM; i++) {
      const k = (this.recycleAt + i) % MAX_DEBRIS_SIM;
      if (!this.debris[k].resting) {
        this.debris[k] = d;
        this.recycleAt = (k + 1) % MAX_DEBRIS_SIM;
        return;
      }
    }
    this.debrisDropped++;
  }

  /** Per size class: size range, ejection speed multiplier, spin range. */
  private static readonly DEBRIS_CLS: [number, number, number, number][] = [
    [0.012, 0.030, 1.55, 26], // fine grit: fast, light, sprays wide
    [0.032, 0.068, 1.10, 16], // gravel chip
    [0.075, 0.150, 0.75, 9],  // larger flake: heavy, slower, tumbles
  ];

  private spawnDebris(pos: V3, normal: V3, eject: V3, power: number, cls: 0 | 1 | 2) {
    const r = this.rng;
    const [lo, hi, spd, spin] = World.DEBRIS_CLS[cls];
    // cone about the ejection axis: tight for the heavy flakes, wide for grit
    const spread = cls === 0 ? 0.95 : cls === 1 ? 0.6 : 0.38;
    const v = rand(r, 2.6, 7.4) * spd * power;
    this.pushDebris({
      pos: [pos[0] + normal[0] * 0.05, pos[1] + normal[1] * 0.05 + 0.02, pos[2] + normal[2] * 0.05],
      vel: [
        eject[0] * v + rand(r, -v, v) * spread,
        eject[1] * v + rand(r, -v * 0.4, v) * spread + rand(r, 0.4, 1.6),
        eject[2] * v + rand(r, -v, v) * spread,
      ],
      spin: [rand(r, -spin, spin), rand(r, -spin, spin), rand(r, -spin, spin)],
      angle: [rand(r, 0, 3), rand(r, 0, 3), rand(r, 0, 3)],
      size: rand(r, lo, hi),
      kind: randInt(r, 3),
      resting: false, bounces: 0, cls,
    });
  }

  /** B19: turn a released tile into a falling body. */
  private dropTile(slab: Slab, rel: { u0: number; v0: number; size: number }, gag = false) {
    const r = this.rng;
    const cu = rel.u0 + rel.size / 2;
    const cv = rel.v0 + rel.size / 2;
    const pos: V3 = [slab.origin[0], slab.origin[1] + cv, slab.origin[2]];
    if (slab.uAxis === 0) pos[0] += cu; else pos[2] += cu;
    // stand it just clear of the face it came off
    const n = slab.sign;
    if (slab.axis === 0) pos[0] += n * 0.05; else pos[2] += n * 0.05;

    this.tileSlabs.push({
      pos,
      // it is pushed off the wall and drops; heavy, so barely any lateral
      // speed compared with a chip
      // A13: the closing tile is not blown off by a round — it gives way on
      // its own. It starts from rest and tips away from the column rather than
      // being punched off it, which is both what the beat asks for and what
      // gives the eye time to find it.
      vel: gag
        ? [
          (slab.axis === 0 ? n * 0.32 : 0),
          0.12,
          (slab.axis === 2 ? n * 0.32 : 0),
        ]
        : [
          (slab.axis === 0 ? n * rand(r, 0.5, 1.2) : rand(r, -0.35, 0.35)),
          rand(r, -0.4, 0.35),
          (slab.axis === 2 ? n * rand(r, 0.5, 1.2) : rand(r, -0.35, 0.35)),
        ],
      // start facing the way its face did, then tumble from there
      angle: [0, slab.axis === 0 ? n * Math.PI / 2 : (n > 0 ? 0 : Math.PI), 0],
      // slow tumble: a slab turns over lazily, it does not spin like a chip.
      // The gag tile tips about the horizontal axis away from the wall.
      spin: gag
        ? (slab.axis === 0 ? [0, 0, -n * 2.6] : [n * 2.6, 0, 0])
        : [rand(r, -2.2, 2.2), rand(r, -1.4, 1.4), rand(r, -2.2, 2.2)],
      size: rel.size,
      thickness: 0.026,
      axis: slab.axis === 1 ? 2 : (slab.axis as 0 | 2),
      sign: slab.sign,
      born: this.t,
      landed: false,
    });
    this.emit({ type: 'SLAB_RELEASE', t: this.t, pos: [...pos] });
  }

  /**
   * B19: fall, then shatter on the floor into several angular pieces that
   * scatter and come to rest. Those pieces persist like all other debris.
   */
  private stepTileSlabs(dt: number) {
    const G = -11.5;
    for (const s of this.tileSlabs) {
      if (s.landed) continue;
      // heavier than a chip: a steeper fall, and air does less to it
      s.vel[1] += G * 1.35 * dt;
      s.pos[0] += s.vel[0] * dt;
      s.pos[1] += s.vel[1] * dt;
      s.pos[2] += s.vel[2] * dt;
      s.angle[0] += s.spin[0] * dt;
      s.angle[1] += s.spin[1] * dt;
      s.angle[2] += s.spin[2] * dt;
      if (s.pos[1] > s.thickness || s.vel[1] >= 0) continue;

      s.pos[1] = s.thickness;
      s.landed = true;
      // did it come down on bare marble or on a pile of rubble already there?
      let rubble = 0;
      for (const d of this.debris) {
        if (!d.resting) continue;
        const dx = d.pos[0] - s.pos[0], dz = d.pos[2] - s.pos[2];
        if (dx * dx + dz * dz < 0.36) { rubble++; if (rubble > 6) break; }
      }
      this.emit({
        type: 'SLAB_LAND', t: this.t, pos: [...s.pos], onRubble: rubble > 6,
      });
      // it breaks into several smaller angular pieces
      const pieces = 5 + randInt(this.rng, 4);
      for (let i = 0; i < pieces; i++) {
        const a = rand(this.rng, 0, Math.PI * 2);
        const v = rand(this.rng, 0.7, 2.6);
        this.pushDebris({
          pos: [
            s.pos[0] + rand(this.rng, -s.size * 0.4, s.size * 0.4),
            s.thickness + 0.02,
            s.pos[2] + rand(this.rng, -s.size * 0.4, s.size * 0.4),
          ],
          vel: [Math.cos(a) * v, rand(this.rng, 0.6, 2.2), Math.sin(a) * v],
          spin: [rand(this.rng, -7, 7), rand(this.rng, -7, 7), rand(this.rng, -7, 7)],
          angle: [rand(this.rng, 0, 3), rand(this.rng, 0, 3), rand(this.rng, 0, 3)],
          // fragments of a slab are big — clearly slab wreckage among chips
          size: rand(this.rng, 0.12, 0.26),
          kind: randInt(this.rng, 3),
          resting: false, bounces: 0, cls: 2,
        });
      }
      // plus a burst of grit and dust off the break
      this.ejectCone(s.pos, [0, 1, 0], [0, 1, 0], 1.3, [18, 6, 0]);
      this.emit({
        type: 'IMPACT_MARBLE', t: this.t, surface: 'floor',
        pos: [...s.pos], normal: [0, 1, 0],
      });
    }
  }

  /**
   * B21: the wall or column face immediately behind a figure, so a knock-back
   * can punch dust and chips out of the stone it drives him into. Returns the
   * nearest destructible face within reach, or null if he is in the open.
   */
  private slabBehind(pos: V3): { surface: string; pos: V3; normal: V3; dir: V3 } | null {
    let best: { surface: string; pos: V3; normal: V3; dir: V3 } | null = null;
    let bestD = 1.4;
    for (const s of this.surfaces) {
      for (const ax of [0, 2] as const) {
        for (const sign of [1, -1] as const) {
          const plane = sign > 0 ? s.max[ax] : s.min[ax];
          const d = (pos[ax] - plane) * sign;
          if (d < 0 || d > bestD) continue;
          // the hit point has to actually lie on the face
          const other = ax === 0 ? 2 : 0;
          if (pos[other] < s.min[other] - 0.1 || pos[other] > s.max[other] + 0.1) continue;
          const hp: V3 = [pos[0], 1.15, pos[2]];
          hp[ax] = plane + sign * 0.01;
          const n: V3 = [0, 0, 0];
          n[ax] = sign;
          const dir: V3 = [0, 0, 0];
          dir[ax] = -sign;
          bestD = d;
          best = { surface: s.id, pos: hp, normal: n, dir };
        }
      }
    }
    return best;
  }

  /**
   * B28: which guard a strike actually connects with.
   *
   * Within arm's reach only — a first pass allowed anyone within 3.2 m and
   * duly registered a punch landing on a guard 2.9 m away across the
   * checkpoint. A guard who went down in the last third of a second still
   * counts, because a second blow in a combination lands while the first has
   * him falling; without that the follow-up strikes are silent again.
   */
  private nearestGuardTo(actorId: string, t: number): string | null {
    // Evaluated at the CONTACT time, not at the swing. The poses are pure
    // functions of time, so the future position is knowable — and it has to
    // be: the flying kick launches 2.05 m from its target and connects at
    // 1.0 m, so judging the range at launch put it out of reach and left the
    // kick silent, which is the defect this whole change is about.
    const ap = actorId === 'neo' ? TL.neoPose(t) : TL.trinPose(t);
    let best: string | null = null;
    let bestD = 1.8;
    for (const g of this.actors.values()) {
      if (g.role !== 'guard') continue;
      const death = TL.DEATHS[g.id];
      if (death !== undefined && t - death > 0.35) continue;
      const gp = TL.guardPose(g.id, t);
      const dx = gp.pos[0] - ap.pos[0];
      const dz = gp.pos[2] - ap.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = g.id; }
    }
    return best;
  }

  private spawnCasing(muzzle: V3, yaw: number) {
    const r = this.rng;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right of facing
    this.casings.push({
      pos: [muzzle[0], muzzle[1], muzzle[2]],
      vel: [
        rx * rand(r, 0.9, 1.9) + rand(r, -0.4, 0.4),
        rand(r, 1.6, 2.6),
        rz * rand(r, 0.9, 1.9) + rand(r, -0.4, 0.4),
      ],
      spin: [rand(r, -30, 30), rand(r, -30, 30), rand(r, -30, 30)],
      angle: [rand(r, 0, 3), rand(r, 0, 3), rand(r, 0, 3)],
      resting: false, bounces: 0, born: this.t,
    });
  }

  // ------------------------------------------------------------ physics ---

  private physics(dt: number) {
    const G = -11.5;
    for (const c of this.casings) {
      if (c.resting) continue;
      c.vel[1] += G * dt;
      c.pos[0] += c.vel[0] * dt;
      c.pos[1] += c.vel[1] * dt;
      c.pos[2] += c.vel[2] * dt;
      c.angle[0] += c.spin[0] * dt;
      c.angle[1] += c.spin[1] * dt;
      c.angle[2] += c.spin[2] * dt;
      if (c.pos[1] <= 0.02 && c.vel[1] < 0) {
        c.pos[1] = 0.02;
        c.vel[1] *= -0.38;
        c.vel[0] *= 0.62;
        c.vel[2] *= 0.62;
        c.spin[0] *= 0.55; c.spin[1] *= 0.75; c.spin[2] *= 0.55;
        c.bounces++;
        if (c.bounces <= 3) this.emit({ type: 'CASING_BOUNCE', t: this.t, pos: [...c.pos], born: c.born });
        if (Math.abs(c.vel[1]) < 0.45 && Math.hypot(c.vel[0], c.vel[2]) < 0.35) {
          c.resting = true;
          c.vel = [0, 0, 0];
          c.angle[0] = Math.PI / 2; // lying flat
          c.angle[2] = 0;
        }
      }
    }
    for (const d of this.debris) {
      if (d.resting) continue;
      d.vel[1] += G * 1.15 * dt;
      d.pos[0] += d.vel[0] * dt;
      d.pos[1] += d.vel[1] * dt;
      d.pos[2] += d.vel[2] * dt;
      d.angle[0] += d.spin[0] * dt;
      d.angle[1] += d.spin[1] * dt;
      d.angle[2] += d.spin[2] * dt;
      const rest = d.size * 0.5;
      if (d.pos[1] <= rest && d.vel[1] < 0) {
        d.pos[1] = rest;
        d.vel[1] *= -0.3;
        d.vel[0] *= 0.55;
        d.vel[2] *= 0.55;
        d.spin[0] *= 0.4; d.spin[1] *= 0.4; d.spin[2] *= 0.4;
        d.bounces++;
        if (Math.abs(d.vel[1]) < 0.5 && Math.hypot(d.vel[0], d.vel[2]) < 0.3) {
          d.resting = true;
          d.vel = [0, 0, 0];
        }
      }
    }
    this.stepTileSlabs(dt);
    for (const g of this.droppedGuns) {
      if (g.resting) continue;
      g.vel[1] += G * dt;
      g.pos[0] += g.vel[0] * dt;
      g.pos[1] += g.vel[1] * dt;
      g.pos[2] += g.vel[2] * dt;
      g.yaw += g.spinY * dt;
      if (g.pos[1] <= 0.035 && g.vel[1] < 0) {
        g.pos[1] = 0.035;
        g.vel[1] *= -0.25;
        g.vel[0] *= 0.6;
        g.vel[2] *= 0.6;
        g.spinY *= 0.5;
        if (Math.abs(g.vel[1]) < 0.4 && Math.hypot(g.vel[0], g.vel[2]) < 0.3) {
          g.resting = true;
          g.vel = [0, 0, 0];
          g.spinY = 0;
        }
      }
    }
  }
}
