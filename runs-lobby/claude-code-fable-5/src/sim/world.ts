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
import { Surface, buildSurfaces } from './layout';
import * as TL from './timeline';
import { Slab, makeSlab, localOf, stripChunk, cellArea } from './damage';
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
export interface Debris {
  pos: V3; vel: V3; spin: V3; angle: V3;
  size: number; kind: number; resting: boolean; bounces: number;
}
export interface Decal {
  surface: string; pos: V3; normal: V3; size: number;
  kind: 'hole' | 'crater'; rot: number;
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
  private deathList: { t: number; id: string }[] = [];
  private deathIdx = 0;
  private settleIdx = 0;
  private dodgeIdx = 0;
  private chaseIdx = 0;
  private finalCasingDone = false;
  private walkAcc: Record<string, number> = { neo: 0, trin: 0 };
  private lastPos: Record<string, V3 | null> = { neo: null, trin: null };

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
      } else {
        const def = TL.SOLDIERS.find((s) => s.id === a.id)!;
        a.pose = TL.soldierPose(def, t);
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
      } else if (c.type === 'VO') {
        this.emit({ type: 'VO', t: c.t, line: c.line! });
      } else {
        this.emit({ ...( { type: c.type } as SimEvent), t: c.t, ...(c.actor ? { actor: c.actor } : {}) } as SimEvent);
      }
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
        if (p.impact) this.applyImpact(p.impact.surface, p.impact.pos, p.impact.normal, p.chew);
      }
    }

    // 8. Debris / casing / dropped-gun physics.
    this.physics(dt);

    // 9. Wind-down extras.
    while (this.settleIdx < TL.SETTLE_TIMES.length && TL.SETTLE_TIMES[this.settleIdx] <= t) {
      this.settleIdx++;
      if (this.decals.length > 0) {
        const d = this.decals[randInt(this.rng, this.decals.length)];
        for (let i = 0; i < 3; i++) this.spawnDebris(d.pos, d.normal, 0.5);
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
      // Deliberately chew the marble near the target's cover.
      aimPoint = [
        tgt.pose.pos[0] + rand(this.rng, -0.9, 0.9),
        rand(this.rng, 0.6, 2.2),
        tgt.pose.pos[2] + rand(this.rng, -0.3, 0.6),
      ];
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

  private applyImpact(surface: string, pos: V3, normal: V3, chew = false) {
    if (surface === 'floor') {
      for (let i = 0; i < 2; i++) this.spawnDebris(pos, normal, 0.6);
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
    const crater = nearby >= 3 || chew;
    const size = crater ? rand(this.rng, 0.3, 0.48) : rand(this.rng, 0.13, 0.22);

    // B8: take a real chunk of cladding off. A first hit knocks a palm-sized
    // piece loose; a worked-over spot (or a deliberate chew burst) takes a
    // hand-sized one, and because every chunk writes into the same per-face
    // grid, repeated hits merge into larger stripped areas and eventually
    // whole missing tiles.
    const slab = this.slabFor(surface, normal);
    let strippedCells = 0;
    if (slab) {
      const [lu, lv] = localOf(slab, pos);
      const radius = crater ? rand(this.rng, 0.1, 0.16) : rand(this.rng, 0.045, 0.075);
      const seed = (Math.round(lu * 131) ^ Math.round(lv * 197)) | 0;
      strippedCells = stripChunk(slab, lu, lv, radius, seed);
    }
    // Keep the decal fully on the surface face (no floating past edges).
    const surf = this.surfaces.find((s) => s.id === surface);
    const cpos: V3 = [...pos];
    if (surf) {
      for (let ax = 0; ax < 3; ax++) {
        if (Math.abs(normal[ax]) > 0.5) continue;
        const m = Math.min(size / 2, (surf.max[ax] - surf.min[ax]) / 2);
        cpos[ax] = Math.min(surf.max[ax] - m, Math.max(surf.min[ax] + m, cpos[ax]));
      }
    }
    // B8: a crater is no longer painted on — the cladding is actually gone
    // there. Only small bullet holes in intact facing remain as decals.
    this.decals.push({
      surface, pos: cpos, normal: [...normal],
      size: crater ? size * 0.42 : size,
      kind: 'hole',
      rot: rand(this.rng, 0, Math.PI * 2),
    });
    // Debris is sized to what actually went missing from the wall: roughly
    // one visible fragment per 40 cm2 of stripped cladding, plus the usual
    // dust-and-chips from the impact itself.
    const chunkArea = strippedCells * cellArea;
    const n = 3 + randInt(this.rng, 3) + Math.min(9, Math.round(chunkArea / 0.004));
    for (let i = 0; i < n; i++) this.spawnDebris(pos, normal, 1);
    this.emit({ type: 'IMPACT_MARBLE', t: this.t, surface, pos: [...pos], normal: [...normal] });
    if (this.rng() < 0.22) this.emit({ type: 'RICOCHET', t: this.t, pos: [...pos] });
  }

  private spawnDebris(pos: V3, normal: V3, power: number) {
    const r = this.rng;
    this.debris.push({
      pos: [pos[0] + normal[0] * 0.05, pos[1] + normal[1] * 0.05 + 0.02, pos[2] + normal[2] * 0.05],
      vel: [
        normal[0] * rand(r, 1.2, 3.2) * power + rand(r, -1.1, 1.1),
        normal[1] * rand(r, 0.5, 1.5) + rand(r, 0.6, 2.4),
        normal[2] * rand(r, 1.2, 3.2) * power + rand(r, -1.1, 1.1),
      ],
      spin: [rand(r, -12, 12), rand(r, -12, 12), rand(r, -12, 12)],
      angle: [rand(r, 0, 3), rand(r, 0, 3), rand(r, 0, 3)],
      size: rand(r, 0.035, 0.11),
      kind: randInt(r, 3),
      resting: false, bounces: 0,
    });
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
