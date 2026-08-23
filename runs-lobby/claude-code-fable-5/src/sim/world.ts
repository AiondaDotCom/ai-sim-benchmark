/**
 * Deterministic fixed-timestep simulation. No three.js, no DOM — pure state.
 * All randomness comes from the seeded RNG; the choreography (timeline.ts)
 * is fixed. Nothing ever despawns: decals, debris, casings and dropped guns
 * only accumulate (asserted by tests).
 */
import { mulberry32, rand, randInt, Rng } from './rng';
import {
  V3, add, scale, norm, sub, len, rayAABB, segmentHitsCapsule, RayHit,
} from './math3';
import { Surface, buildSurfaces } from './layout';
import * as TL from './timeline';
import type { SimEvent } from './events';

export const FIXED_DT = 1 / 240;

export interface ActorSim {
  id: string;
  role: 'protag' | 'guard' | 'soldier';
  pose: TL.Pose;
  alive: boolean;
  /** World point currently aimed at (render uses it for arm IK). */
  aim: V3 | null;
}

export interface Casing {
  pos: V3; vel: V3; spin: V3; angle: V3;
  resting: boolean; bounces: number;
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
}
/** Persistent stylized floor blood stain under a downed defender (A4). */
export interface BloodStain {
  pos: V3; size: number; rot: number;
}
interface Projectile {
  from: V3; dir: V3; speed: number; born: number; hitDist: number;
  impact: { surface: string; pos: V3; normal: V3 } | null;
  shooter: string; done: boolean;
  /** A5: near-miss round that carries a visible air wake. */
  wake?: boolean;
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
  bloodStains: BloodStain[] = [];
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
  private finalCasingDone = false;
  private walkAcc: Record<string, number> = { neo: 0, trin: 0 };
  private lastPos: Record<string, V3 | null> = { neo: null, trin: null };

  constructor(seed: number) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.surfaces = buildSurfaces();
    this.actors.set('neo', { id: 'neo', role: 'protag', pose: TL.neoPose(0), alive: true, aim: null });
    this.actors.set('trin', { id: 'trin', role: 'protag', pose: TL.trinPose(0), alive: true, aim: null });
    for (const g of TL.GUARDS) {
      this.actors.set(g.id, { id: g.id, role: 'guard', pose: TL.guardPose(g.id, 0), alive: true, aim: null });
    }
    for (const s of TL.SOLDIERS) {
      this.actors.set(s.id, { id: s.id, role: 'soldier', pose: TL.soldierPose(s, 0), alive: true, aim: null });
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
    for (const a of this.actors.values()) {
      if (a.role === 'protag') {
        a.pose = a.id === 'neo' ? TL.neoPose(t) : TL.trinPose(t);
      } else if (a.role === 'guard') {
        a.pose = TL.guardPose(a.id, t);
      } else {
        const def = TL.SOLDIERS.find((s) => s.id === a.id)!;
        a.pose = TL.soldierPose(def, t);
      }
      const death = TL.DEATHS[a.id];
      a.alive = death === undefined || t < death;
    }
    this.updateAims();

    // 2. Deaths crossing this step.
    while (this.deathIdx < this.deathList.length && this.deathList[this.deathIdx].t <= t) {
      const d = this.deathList[this.deathIdx++];
      this.emit({ type: 'GUARD_DOWN', t: d.t, id: d.id, style: TL.DEATH_STYLE[d.id] });
      // A4: brief stylized spray + a persistent stain where the defender falls
      const a = this.actors.get(d.id)!;
      const p = a.pose.pos;
      this.emit({ type: 'BLOOD', t: d.t, pos: [p[0], p[1] + 1.25, p[2]] });
      this.bloodStains.push({
        pos: [p[0] + rand(this.rng, -0.25, 0.25), 0.006, p[2] + rand(this.rng, -0.25, 0.25)],
        size: rand(this.rng, 0.55, 0.95),
        rot: rand(this.rng, 0, Math.PI * 2),
      });
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
        };
        this.droppedGuns.push(gun);
        this.emit({ type: 'GUN_DROP', t: c.t, pos: [...gun.pos] });
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

    // 7. Projectiles reaching their impact point.
    for (const p of this.projectiles) {
      if (p.done) continue;
      const dist = (t - p.born) * p.speed;
      if (dist >= p.hitDist) {
        p.done = true;
        if (p.impact) this.applyImpact(p.impact.surface, p.impact.pos, p.impact.normal);
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
        angle: [0, 0, 0], resting: false, bounces: 0,
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
      s.aim = [target.pose.pos[0], CHEST, target.pose.pos[2]];
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
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rx = fz, rz = -fx; // right vector
    const side = left ? -0.22 : 0.22;
    const y = p.pos[1] + (p.action === 'cartwheel' ? 1.0 : p.action.startsWith('crouch') ? 1.05 : 1.38);
    return [p.pos[0] + fx * 0.45 + rx * side, y, p.pos[2] + fz * 0.45 + rz * side];
  }

  /** Segment blocked by a protagonist capsule? (The capsule follows the
   *  pose: a dodging body is leaned flat backward, so its upright extent
   *  shrinks — that is exactly what the dodge exploits.) */
  private hitsProtagonist(from: V3, to: V3, exclude: string): string | null {
    for (const id of ['neo', 'trin']) {
      if (id === exclude) continue;
      const a = this.actors.get(id)!;
      const h = a.pose.action === 'dodge' ? 0.85 : CAPSULE_H;
      if (segmentHitsCapsule(from, to, a.pose.pos, h, CAPSULE_R)) return id;
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
    const muzzle: V3 = [def.cover[0] + lean, 1.32, def.cover[1] + 0.35];
    const chest: V3 = [target.pose.pos[0], target.pose.pos[1] + CHEST, target.pose.pos[2]];

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

  // -------------------------------------------------------- destruction ---

  private applyImpact(surface: string, pos: V3, normal: V3) {
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
    const crater = nearby >= 3;
    const size = crater ? rand(this.rng, 0.3, 0.48) : rand(this.rng, 0.13, 0.22);
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
    this.decals.push({
      surface, pos: cpos, normal: [...normal],
      size,
      kind: crater ? 'crater' : 'hole',
      rot: rand(this.rng, 0, Math.PI * 2),
    });
    const n = crater ? 5 + randInt(this.rng, 3) : 3 + randInt(this.rng, 3);
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
      resting: false, bounces: 0,
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
        if (c.bounces <= 3) this.emit({ type: 'CASING_BOUNCE', t: this.t, pos: [...c.pos] });
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
