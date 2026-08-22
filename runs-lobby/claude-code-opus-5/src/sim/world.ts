/** The simulation. A deterministic interpreter for `choreography.ts`.
 *
 *  Runs at a fixed 120 Hz. Given the same seed it produces bit-identical state,
 *  which the replay test relies on. It knows nothing about three.js, WebAudio or
 *  the DOM.
 */
import {
  crouchDrop,
  deathRoot,
  poseAim,
  poseCartwheel,
  poseCoatOpen,
  poseCrouch,
  poseDeath,
  poseDualSideFire,
  poseFlyingKick,
  poseRadioReach,
  poseAskHalt,
  poseRun,
  poseStand,
  poseStrike,
  poseWalk,
  poseWallRun,
  walkBob,
  type DeathStyle,
} from './anim.ts';
import {
  BEAT,
  DISCARDS,
  ENEMY_FIRE_WINDOW,
  END_TIME,
  KILL_ORDERS,
  MELEE,
  MUSIC_CUES,
  NEO,
  SCRIPTS,
  TRINITY,
  timeScaleAt,
  type ActorScript,
  type Grip,
  type PathKey,
  type PoseKey,
} from './choreography.ts';
import { FLOOR_ID, DamageField, raycast } from './damage.ts';
import { DustPool, RigidPool, SIZE_CASING } from './debris.ts';
import type { SimEvent, SfxCue } from './events.ts';
import { eulerYXZ, muzzleWorld, xform, type Mat3 } from './fk.ts';
import { blockers, buildSurfaceDefs, LAYOUT } from './lobby.ts';
import { ARMS, J, JOINT_COUNT, newPose, UPPER_BODY, blendJoints, type Pose } from './rig.ts';
import { Rng } from './rng.ts';
import { StateHasher } from './hash.ts';
import { SIM_DT } from './clock.ts';
import {
  addScaled,
  clamp,
  cross,
  dist,
  easeIn,
  easeInOut,
  easeOut,
  len,
  normalize,
  segPointDist,
  smoothstep,
  sub,
  v3,
  type Vec3,
} from './vec.ts';

const ACTOR_RADIUS = 0.34;
const ACTOR_TOP = 1.72;
const BULLET_SPEED = 165;

export interface Actor {
  id: number;
  name: string;
  role: 'neo' | 'trinity' | 'guard' | 'soldier';
  script: ActorScript;
  active: boolean;
  alive: boolean;
  deathT: number;
  deathStyle: DeathStyle;
  pos: Vec3;
  prevPos: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  pose: Pose;
  gait: number;
  lastGaitTick: number;
  grip: Grip;
  aimPoint: Vec3;
  recoilL: number;
  recoilR: number;
  flashL: number;
  flashR: number;
  hasGunL: boolean;
  hasGunR: boolean;
  /** Which of the strapped weapons is currently in hand. */
  weaponKind: 'pistol' | 'smg';
  nextShot: number;
  /** Lateral offset produced by the cover lean-out cycle. */
  leanOffset: number;
  /** Set when a man has stayed pinned too long and breaks cover. */
  exposed: number;
  /** Coat cloth nodes (protagonists only). */
  coat: CoatSim | null;
}

export interface Bullet {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  /** distance travelled so far / distance at which it lands */
  travelled: number;
  range: number;
  owner: number;
  enemyShot: boolean;
  hitActor: number;
  surfaceId: number;
  hu: number;
  hv: number;
  nx: number;
  ny: number;
  nz: number;
  alive: boolean;
}

/* ------------------------------------------------------------------ */
/* coat                                                                */
/* ------------------------------------------------------------------ */

export const COAT_COLUMNS = 18;
export const COAT_ROWS = 5;

/** A verlet skirt hanging from the pelvis: the coat that swings with every turn. */
export class CoatSim {
  readonly px = new Float32Array(COAT_COLUMNS * COAT_ROWS);
  readonly py = new Float32Array(COAT_COLUMNS * COAT_ROWS);
  readonly pz = new Float32Array(COAT_COLUMNS * COAT_ROWS);
  readonly ox = new Float32Array(COAT_COLUMNS * COAT_ROWS);
  readonly oy = new Float32Array(COAT_COLUMNS * COAT_ROWS);
  readonly oz = new Float32Array(COAT_COLUMNS * COAT_ROWS);
  readonly segment: number;
  readonly radius: number;
  private init = false;

  constructor(length = 1.14, radius = 0.205) {
    this.segment = length / (COAT_ROWS - 1);
    this.radius = radius;
  }

  private anchor(col: number, pos: Vec3, rot: Mat3, open: number): Vec3 {
    const a = (col / COAT_COLUMNS) * Math.PI * 2;
    // the front two panels swing wide when the coat is thrown open
    const front = Math.max(0, Math.cos(a));
    const r = this.radius * (1 + open * front * 1.7);
    const local = v3(Math.sin(a) * r, 0.98, Math.cos(a) * r * (1 + open * front * 0.5));
    const w = xform(rot, local);
    return v3(pos.x + w.x, pos.y + w.y, pos.z + w.z);
  }

  step(
    dt: number,
    pos: Vec3,
    yaw: number,
    pitch: number,
    roll: number,
    open: number,
    wind: number,
  ): void {
    const rot = eulerYXZ(new Float32Array(9) as Mat3, pitch, yaw, roll);
    const n = COAT_COLUMNS;
    for (let c = 0; c < n; c++) {
      const a = this.anchor(c, pos, rot, open);
      const i0 = c * COAT_ROWS;
      if (!this.init) {
        for (let r = 0; r < COAT_ROWS; r++) {
          const i = i0 + r;
          this.px[i] = this.ox[i] = a.x;
          this.py[i] = this.oy[i] = a.y - r * this.segment;
          this.pz[i] = this.oz[i] = a.z;
        }
        continue;
      }
      this.px[i0] = a.x;
      this.py[i0] = a.y;
      this.pz[i0] = a.z;
      this.ox[i0] = a.x;
      this.oy[i0] = a.y;
      this.oz[i0] = a.z;
      for (let r = 1; r < COAT_ROWS; r++) {
        const i = i0 + r;
        const vx = (this.px[i] - this.ox[i]) * 0.94;
        const vy = (this.py[i] - this.oy[i]) * 0.94;
        const vz = (this.pz[i] - this.oz[i]) * 0.94;
        this.ox[i] = this.px[i];
        this.oy[i] = this.py[i];
        this.oz[i] = this.pz[i];
        this.px[i] += vx + wind * dt * dt * 40 * Math.sin(a.x * 2.1 + r);
        this.py[i] += vy - 9.81 * dt * dt;
        this.pz[i] += vz;
      }
    }
    this.init = true;
    const upright = Math.cos(pitch) * Math.cos(roll);
    // constraints
    for (let iter = 0; iter < 3; iter++) {
      for (let c = 0; c < n; c++) {
        const i0 = c * COAT_ROWS;
        for (let r = 1; r < COAT_ROWS; r++) {
          const i = i0 + r;
          const p = i - 1;
          let dx = this.px[i] - this.px[p];
          let dy = this.py[i] - this.py[p];
          let dz = this.pz[i] - this.pz[p];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const k = (d - this.segment) / d;
          this.px[i] -= dx * k;
          this.py[i] -= dy * k;
          this.pz[i] -= dz * k;
          // while the body is upright the coat hangs close: never inside the
          // legs, never flaring out into a cone
          if (upright > 0.4) {
            dx = this.px[i] - pos.x;
            dz = this.pz[i] - pos.z;
            const hr = Math.hypot(dx, dz);
            const minR = this.radius * 0.88;
            const maxR = this.radius * (1.06 + 0.5 * (r / (COAT_ROWS - 1))) * (1 + open * 2.4);
            if (hr > 1e-5 && hr < minR) {
              this.px[i] = pos.x + (dx / hr) * minR;
              this.pz[i] = pos.z + (dz / hr) * minR;
            } else if (hr > maxR) {
              const k2 = 1 - (1 - maxR / hr) * upright;
              this.px[i] = pos.x + dx * k2;
              this.pz[i] = pos.z + dz * k2;
            }
          }
          if (this.py[i] < 0.04) this.py[i] = 0.04;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function applyEase(e: string | undefined, t: number): number {
  switch (e) {
    case 'out':
      return easeOut(t);
    case 'in':
      return easeIn(t);
    case 'linear':
      return t;
    default:
      return easeInOut(t);
  }
}

function samplePath(keys: PathKey[], t: number): { pos: Vec3; vel: Vec3; yaw: number | null } {
  if (t <= keys[0].t) return { pos: keys[0].p, vel: v3(), yaw: keys[0].yaw ?? null };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { pos: last.p, vel: v3(), yaw: last.yaw ?? null };
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const raw = clamp((t - a.t) / span, 0, 1);
  const k = applyEase(b.ease, raw);
  const dk =
    (applyEase(b.ease, Math.min(1, raw + 0.004)) - applyEase(b.ease, Math.max(0, raw - 0.004))) /
    0.008;
  const pos = v3(
    a.p.x + (b.p.x - a.p.x) * k,
    a.p.y + (b.p.y - a.p.y) * k,
    a.p.z + (b.p.z - a.p.z) * k,
  );
  const sp = dk / span;
  const vel = v3((b.p.x - a.p.x) * sp, (b.p.y - a.p.y) * sp, (b.p.z - a.p.z) * sp);
  let yaw: number | null = null;
  if (a.yaw !== undefined && b.yaw !== undefined) yaw = a.yaw + (b.yaw - a.yaw) * k;
  else if (b.yaw !== undefined && raw > 0.5) yaw = b.yaw;
  else if (a.yaw !== undefined && raw < 0.5) yaw = a.yaw;
  return { pos, vel, yaw };
}

function findPoseKey(keys: PoseKey[], t: number): { key: PoseKey; idx: number; dur: number } {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const dur = i < keys.length - 1 ? keys[i + 1].t - keys[i].t : 4;
  return { key: keys[i], idx: i, dur };
}

function gripAt(keys: { t: number; grip: Grip }[], t: number): Grip {
  let g: Grip = 'none';
  for (const k of keys) if (t >= k.t) g = k.grip;
  return g;
}

/**
 * Analytic ray/vertical-capsule intersection.
 * Returns the distance along `dir` at which the ray enters the capsule, or null.
 */
function rayCapsule(
  o: Vec3,
  dir: Vec3,
  maxT: number,
  c: Vec3,
  radius: number,
): number | null {
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * dir.x + oz * dir.z);
  const cc = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0.15 || t > maxT) continue;
    const y = o.y + dir.y * t;
    if (y < c.y + 0.15 || y > c.y + ACTOR_TOP) continue;
    return t;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* the world                                                           */
/* ------------------------------------------------------------------ */

export interface WorldOptions {
  seed?: number;
  /** Fixed time scale override, used by the time-scale test. */
  forceTimeScale?: number;
  /** Keep every emitted event for assertions. */
  recordEvents?: boolean;
}

export class World {
  readonly seed: number;
  rngState: Rng;
  readonly surfaces = buildSurfaceDefs();
  readonly blockers = blockers();
  readonly damage = new DamageField(this.surfaces);
  readonly casings = new RigidPool(9000, { restitution: 0.42, friction: 0.72, radius: 0.014 });
  readonly debris = new RigidPool(11000, { restitution: 0.24, friction: 0.55, radius: 0.045 });
  readonly dust = new DustPool(2600);
  readonly actors: Actor[] = [];
  readonly bullets: Bullet[] = [];
  /** Events produced by the most recent step. */
  events: SimEvent[] = [];
  eventLog: SimEvent[] | null = null;

  time = 0;
  steps = 0;
  alarmOn = false;
  /** Statistics used by the tests. */
  stats = {
    shotsFired: 0,
    bulletsResolved: 0,
    protagonistHitsOnProtagonist: 0,
    protagonistsHit: 0,
    downed: 0,
    hitSfx: 0,
    casingsSpawned: 0,
    debrisSpawned: 0,
  };

  private readonly pending = KILL_ORDERS.slice();
  private meleeIdx = 0;
  private discardIdx = 0;
  private readonly musicFired = new Set<string>();
  private bulletPool: Bullet[] = [];
  private bounceScratch: { x: number; y: number; z: number; speed: number; index: number }[] = [];
  private lastResolvedHit = -1;
  private lastCasingSfx = -1;
  private lastDebrisSfx = -1;
  private alarmFired = false;
  private beepFired = false;
  private doorFired = false;
  private dingFired = false;
  private doorsFired = false;
  private closeFired = false;
  private readonly forceTimeScale: number | undefined;
  private readonly aScratch = newPose();
  private readonly aimScratch = newPose();

  constructor(opts: WorldOptions = {}) {
    this.seed = opts.seed ?? 20250822;
    this.rngState = new Rng(this.seed);
    this.forceTimeScale = opts.forceTimeScale;
    if (opts.recordEvents) this.eventLog = [];
    for (const s of SCRIPTS) {
      this.actors.push({
        id: s.id,
        name: s.name,
        role: s.role,
        script: s,
        active: false,
        alive: true,
        deathT: -1,
        deathStyle: s.deathStyle,
        pos: v3(s.path[0].p.x, s.path[0].p.y, s.path[0].p.z),
        prevPos: v3(s.path[0].p.x, s.path[0].p.y, s.path[0].p.z),
        yaw: s.path[0].yaw ?? 0,
        pitch: 0,
        roll: 0,
        pose: newPose(),
        gait: 0,
        lastGaitTick: 0,
        grip: 'none',
        aimPoint: v3(0, 1.3, 40),
        recoilL: 0,
        recoilR: 0,
        flashL: 0,
        flashR: 0,
        hasGunL: false,
        hasGunR: false,
        weaponKind: s.weapon ?? 'pistol',
        nextShot: 0,
        leanOffset: 0,
        exposed: 0,
        coat: s.role === 'neo' ? new CoatSim(1.16, 0.205) : null,
      });
    }
  }

  get rng(): Rng {
    return this.rngState;
  }

  get timeScale(): number {
    return this.forceTimeScale ?? timeScaleAt(this.time);
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
    if (this.eventLog) this.eventLog.push(e);
  }

  private sfx(cue: SfxCue, p: Vec3, gain = 1, rate = 1): void {
    this.emit({
      k: 'sfx',
      cue,
      x: p.x,
      y: p.y,
      z: p.z,
      gain,
      variant: this.rngState.int(64),
      rate,
      t: this.time,
    });
    if (cue === 'hit') this.stats.hitSfx++;
  }

  actor(id: number): Actor {
    return this.actors[id];
  }

  /* ---------------- main step ---------------- */

  step(): void {
    const dt = SIM_DT;
    this.events = [];

    this.cues();
    for (const a of this.actors) this.updateActor(a, dt);
    this.melee();
    this.combat(dt);
    this.stepBullets(dt);

    this.bounceScratch.length = 0;
    this.casings.step(dt, this.blockers, this.bounceScratch);
    for (const b of this.bounceScratch) {
      if (this.time - this.lastCasingSfx > 0.055 && b.speed > 0.75) {
        this.lastCasingSfx = this.time;
        this.sfx('casing', v3(b.x, b.y, b.z), clamp(b.speed * 0.25, 0.12, 0.65), 0.94 + this.rngState.sym(0.16));
      }
    }
    this.bounceScratch.length = 0;
    this.debris.step(dt, this.blockers, this.bounceScratch);
    for (const b of this.bounceScratch) {
      if (this.time - this.lastDebrisSfx > 0.08 && b.speed > 1.1) {
        this.lastDebrisSfx = this.time;
        this.sfx('debris_fall', v3(b.x, b.y, b.z), clamp(b.speed * 0.16, 0.1, 0.5), 0.9 + this.rngState.sym(0.2));
      }
    }
    this.dust.step(dt);

    this.time += dt;
    this.steps++;
  }

  /* ---------------- one-shot cues ---------------- */

  private cues(): void {
    const t = this.time;
    if (!this.doorFired && t >= 0.35) {
      this.doorFired = true;
      this.sfx('door_push', v3(0, 1.2, 0.2), 0.8);
    }
    if (!this.beepFired && t >= BEAT.detectorBeep) {
      this.beepFired = true;
      this.sfx('detector_beep', v3(0, 1.5, LAYOUT.detectorZ), 1.0);
    }
    if (!this.alarmFired && t >= BEAT.alarm) {
      this.alarmFired = true;
      this.alarmOn = true;
      this.emit({ k: 'alarm', on: true, t });
      this.sfx('alarm', v3(0, 6, 24), 0.75);
    }
    if (this.alarmOn && t >= BEAT.windDown + 1.4) {
      this.alarmOn = false;
      this.emit({ k: 'alarm', on: false, t });
    }
    for (const [name, cue] of Object.entries(MUSIC_CUES)) {
      if (!this.musicFired.has(name) && t >= cue) {
        this.musicFired.add(name);
        this.emit({ k: 'music', section: name as 'start' | 'drop' | 'outro', t });
      }
    }
    if (!this.dingFired && t >= BEAT.elevatorDing) {
      this.dingFired = true;
      this.sfx('elev_ding', v3(0, 2.2, LAYOUT.elevatorZ), 0.9);
    }
    if (!this.doorsFired && t >= BEAT.doorsOpen) {
      this.doorsFired = true;
      this.sfx('elev_doors', v3(0, 1.4, LAYOUT.elevatorZ), 0.85);
    }
    if (!this.closeFired && t >= BEAT.doorsClose) {
      this.closeFired = true;
      this.sfx('elev_doors', v3(0, 1.4, LAYOUT.elevatorZ), 0.85, 0.92);
    }
    // one last casing spinning to rest in the silence
    if (Math.abs(t - (BEAT.windDown + 1.1)) < SIM_DT * 0.5) {
      this.sfx('casing_spin', v3(-1.2, 0.02, 34.5), 0.9);
    }
    while (this.discardIdx < DISCARDS.length && DISCARDS[this.discardIdx].t <= t) {
      const d = DISCARDS[this.discardIdx++];
      this.discardWeapon(this.actors[d.actor], d.hand);
    }
  }

  /* ---------------- actors ---------------- */

  private updateActor(a: Actor, dt: number): void {
    const t = this.time;
    if (!a.active) {
      if (t < a.script.spawnT) return;
      a.active = true;
    }
    a.prevPos = v3(a.pos.x, a.pos.y, a.pos.z);

    if (!a.alive) {
      this.updateDead(a, dt);
      return;
    }

    const { pos, vel, yaw } = samplePath(a.script.path, t);
    const speed = Math.hypot(vel.x, vel.z);

    // cover lean-out cycle for the reinforcement squad
    let lean = 0;
    const cov = a.script.cover;
    if (cov && t > a.script.spawnT + 1.8) {
      const ph = ((t - a.script.spawnT) / cov.period + cov.phase) % 1;
      lean = smoothstep(0.05, 0.16, ph) * (1 - smoothstep(0.68, 0.84, ph));
    }
    if (a.exposed > 0) lean = 1;
    a.leanOffset += (lean - a.leanOffset) * Math.min(1, dt * 9);
    if (a.exposed > 0) a.exposed = Math.min(1, a.exposed + dt * 1.4);

    a.pos = v3(
      pos.x + (cov ? (a.leanOffset * 0.95 + a.exposed * 1.05) * cov.leanDir : 0),
      pos.y,
      pos.z,
    );

    // facing
    let targetYaw = a.yaw;
    if (yaw !== null) targetYaw = yaw;
    else if (speed > 0.15) targetYaw = Math.atan2(vel.x, vel.z);
    if (a.role === 'soldier' || (a.grip !== 'none' && a.role !== 'guard')) {
      const d = sub(a.aimPoint, a.pos);
      if (Math.hypot(d.x, d.z) > 0.4) targetYaw = Math.atan2(d.x, d.z);
    }
    let dy = targetYaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    a.yaw += dy * Math.min(1, dt * 9);

    const before = a.gait;
    a.gait += (speed / 1.42) * dt;
    this.footsteps(a, before, speed);

    this.evalPose(a, dt, speed);
    this.aimOverlay(a, dt);

    a.recoilL = Math.max(0, a.recoilL - dt * 7);
    a.recoilR = Math.max(0, a.recoilR - dt * 7);
    a.flashL = Math.max(0, a.flashL - dt * 26);
    a.flashR = Math.max(0, a.flashR - dt * 26);

    if (a.coat) {
      const open = a.role === 'neo' ? smoothstep(BEAT.coatOpen, BEAT.coatOpen + 0.5, t) *
        (1 - smoothstep(BEAT.radioLunge, BEAT.radioLunge + 0.7, t)) : 0;
      const swing = Math.hypot(a.pos.x - a.prevPos.x, a.pos.z - a.prevPos.z) / Math.max(dt, 1e-6);
      a.coat.step(dt, a.pos, a.yaw, a.pitch, a.roll, open, clamp(swing * 0.12, 0, 1.4));
      if (open > 0.02 && open < 0.5 && this.rngState.next() < 0.02) {
        this.sfx('coat_swish', a.pos, 0.5);
      }
    }
  }

  private footsteps(a: Actor, before: number, speed: number): void {
    if (speed < 0.25) return;
    const prev = Math.floor(before * 2);
    const now = Math.floor(a.gait * 2);
    if (now !== prev) {
      const g = a.role === 'neo' || a.role === 'trinity' ? 0.72 : 0.5;
      this.sfx('step', a.pos, g * clamp(speed / 1.4, 0.35, 1.2), 0.92 + this.rngState.sym(0.14));
    }
  }

  private evalPose(a: Actor, dt: number, speed: number): void {
    const t = this.time;
    const { key, dur } = findPoseKey(a.script.poses, t);
    const local = t - key.t;
    const prog = clamp(local / Math.max(dur, 1e-6), 0, 1);
    const pose = this.aScratch;
    let dyRoot = 0;
    let pitch = 0;
    let roll = 0;

    switch (key.k) {
      case 'stand':
        poseStand(pose, Math.sin(t * 1.7));
        break;
      case 'walk':
        poseWalk(pose, a.gait, 1, a.role === 'neo' || a.role === 'trinity' ? 1 : 0);
        dyRoot = walkBob(a.gait);
        break;
      case 'walkSlow':
        poseWalk(pose, a.gait, 0.78, 0.4);
        dyRoot = walkBob(a.gait, 0.7);
        break;
      case 'run':
        poseRun(pose, a.gait);
        dyRoot = walkBob(a.gait, 1.3);
        break;
      case 'crouch': {
        const d = clamp(local / 0.28, 0, 1) * (1 - smoothstep(dur - 0.3, dur, local));
        poseCrouch(pose, d);
        dyRoot = crouchDrop(d);
        break;
      }
      case 'coatOpen':
        poseCoatOpen(pose, local / 0.55);
        break;
      case 'cartwheel': {
        poseCartwheel(pose, prog);
        roll = Math.PI * 2 * easeInOut(prog);
        // the root sits at the feet, so lift it to keep the roll centred on the
        // body — otherwise he would rotate straight through the floor
        dyRoot = (1 - Math.cos(roll)) * 0.94 + Math.sin(Math.PI * prog) * 0.22;
        break;
      }
      case 'wallrun': {
        const up = smoothstep(0, 0.28, prog);
        const down = 1 - smoothstep(0.82, 1, prog);
        poseWallRun(pose, a.gait * 1.6);
        roll = (Math.PI / 2) * 0.92 * up * down;
        dyRoot = (1 - Math.cos(roll)) * 0.2;
        break;
      }
      case 'kick': {
        poseFlyingKick(pose, prog);
        pitch = -0.34 * Math.sin(Math.PI * clamp(prog * 1.2, 0, 1));
        dyRoot = Math.sin(Math.PI * clamp(prog * 1.15, 0, 1)) * 0.62 + (1 - Math.cos(pitch)) * 0.9;
        break;
      }
      case 'strike':
        poseStrike(pose, local / 0.46, key.i ?? 0);
        break;
      case 'radio':
        poseRadioReach(pose, local / 0.42);
        break;
      case 'ask':
        poseAskHalt(pose, local / 0.5);
        break;
      case 'cover': {
        const cyc = (key.i ?? 0) === 1 ? 1 : 0;
        poseCrouch(pose, 0.34 + a.leanOffset * 0.1 + cyc * 0.12);
        dyRoot = crouchDrop(0.34 + cyc * 0.12);
        break;
      }
      case 'holster':
        poseStand(pose, 0);
        break;
      case 'dead':
        poseStand(pose, 0);
        break;
    }

    // short cross-fade out of the previous clip
    const blendT = clamp(local / 0.17, 0, 1);
    if (blendT < 1) {
      for (let i = 0; i < JOINT_COUNT * 3; i++) {
        a.pose[i] = a.pose[i] + (pose[i] - a.pose[i]) * (0.22 + 0.78 * blendT);
      }
    } else {
      a.pose.set(pose);
    }

    a.pitch += (pitch - a.pitch) * Math.min(1, dt * 12);
    a.roll += (roll - a.roll) * Math.min(1, dt * 14);
    a.pos = v3(a.pos.x, a.pos.y + dyRoot, a.pos.z);
    void speed;
  }

  private aimOverlay(a: Actor, dt: number): void {
    const t = this.time;
    a.grip = gripAt(a.script.aim, t);
    if (a.grip === 'none') {
      a.hasGunL = a.hasGunR = false;
      return;
    }
    a.hasGunR = a.grip === 'right' || a.grip === 'both' || a.grip === 'dual';
    a.hasGunL = a.grip === 'left' || a.grip === 'dual' || a.grip === 'both';
    a.weaponKind = a.script.weapon ?? 'pistol';
    for (const [t0, t1] of a.script.smgWindows ?? []) {
      if (t >= t0 && t < t1) a.weaponKind = 'smg';
    }

    const target = this.pickAimPoint(a);
    a.aimPoint = v3(
      a.aimPoint.x + (target.x - a.aimPoint.x) * Math.min(1, dt * 7),
      a.aimPoint.y + (target.y - a.aimPoint.y) * Math.min(1, dt * 7),
      a.aimPoint.z + (target.z - a.aimPoint.z) * Math.min(1, dt * 7),
    );

    const { key } = findPoseKey(a.script.poses, t);
    const aim = this.aimScratch;
    aim.fill(0);
    if (key.k === 'cartwheel') {
      poseDualSideFire(aim, 0.2, Math.max(a.recoilL, a.recoilR));
      blendJoints(a.pose, aim, 1, ARMS.concat([J.chest]));
      return;
    }
    const d = sub(a.aimPoint, v3(a.pos.x, a.pos.y + 1.35, a.pos.z));
    const flat = Math.hypot(d.x, d.z);
    let yawRel = Math.atan2(d.x, d.z) - a.yaw;
    while (yawRel > Math.PI) yawRel -= Math.PI * 2;
    while (yawRel < -Math.PI) yawRel += Math.PI * 2;
    const pitch = Math.atan2(d.y, Math.max(flat, 0.1));
    poseAim(aim, yawRel, pitch, a.grip, Math.max(a.recoilL, a.recoilR));
    const w = key.k === 'run' || key.k === 'wallrun' ? 0.82 : 1;
    blendJoints(a.pose, aim, w, key.k === 'run' ? ARMS : UPPER_BODY);
  }

  private pickAimPoint(a: Actor): Vec3 {
    if (a.role === 'neo' || a.role === 'trinity') {
      let best: Actor | null = null;
      let bestD = 1e9;
      for (const e of this.actors) {
        if (!e.alive || !e.active || (e.role !== 'soldier' && e.role !== 'guard')) continue;
        const d = dist(e.pos, a.pos);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) return v3(best.pos.x, best.pos.y + 1.25, best.pos.z);
      return v3(a.pos.x, 1.4, a.pos.z + 12);
    }
    const p = this.actors[a.role === 'soldier' ? (a.id % 2 === 0 ? NEO : TRINITY) : NEO];
    return v3(p.pos.x, p.pos.y + 1.2, p.pos.z);
  }

  private updateDead(a: Actor, dt: number): void {
    const td = this.time - a.deathT;
    poseDeath(a.pose, a.deathStyle, td);
    const [dyr, pitch, roll, fwd] = deathRoot(a.deathStyle, td);
    const base = samplePath(a.script.path, a.deathT);
    const c = Math.cos(a.yaw);
    const s = Math.sin(a.yaw);
    const off = a.script.cover ? a.leanOffset * a.script.cover.leanDir * 0.95 : 0;
    a.pos = v3(base.pos.x + off + s * fwd, base.pos.y + dyr, base.pos.z + c * fwd);
    a.pitch = pitch;
    a.roll = roll;
    a.grip = 'none';
    if (a.coat) a.coat.step(dt, a.pos, a.yaw, a.pitch, a.roll, 0, 0);
  }

  /* ---------------- melee ---------------- */

  private melee(): void {
    while (this.meleeIdx < MELEE.length && MELEE[this.meleeIdx].t <= this.time) {
      const m = MELEE[this.meleeIdx++];
      const by = this.actors[m.by];
      const target = this.actors[m.target];
      if (!target.alive) continue;
      const kick = by.role === 'trinity';
      this.sfx(kick ? 'kick' : 'punch', target.pos, 1.0);
      this.kill(target, 'melee');
      void by;
    }
  }

  /* ---------------- combat ---------------- */

  private combat(dt: number): void {
    const t = this.time;
    void dt;

    // protagonists work through the priority target list; if the head of the
    // list is behind cover the next order is attempted instead, so a blocked
    // sight line can never stall the whole sequence.
    const usedShooter = new Set<number>();
    for (let i = 0; i < this.pending.length; i++) {
      const o = this.pending[i];
      if (o.t > t) break;
      const target = this.actors[o.target];
      if (!target.active || !target.alive) {
        this.pending.splice(i, 1);
        i--;
        continue;
      }
      const overdue = t - o.t;
      // a man who stays pinned too long breaks cover and steps into the open
      if (overdue > 1.2 && target.script.cover && target.exposed === 0) target.exposed = 0.001;
      const force = overdue > 3.5;
      const order = [o.shooter, o.shooter === NEO ? TRINITY : NEO];
      let fired = false;
      for (const sid of order) {
        const shooter = this.actors[sid];
        if (usedShooter.has(sid)) continue;
        if (!shooter.alive || shooter.grip === 'none' || t < shooter.nextShot) continue;
        if (this.tryShootActor(shooter, target, force)) {
          fired = true;
          usedShooter.add(sid);
          break;
        }
      }
      if (fired) {
        this.pending.splice(i, 1);
        i--;
        if (usedShooter.size >= 2) break;
      }
    }

    // suppressive fire so the guns never fall silent during the shootout
    if (t >= BEAT.drawGuns && t <= BEAT.windDown) {
      for (const sid of [NEO, TRINITY]) {
        const s = this.actors[sid];
        if (!s.alive || s.grip === 'none' || t < s.nextShot) continue;
        const tgt = this.suppressPoint(s);
        if (tgt && this.fireFrom(s, tgt, false, 'suppress')) {
          const cadence = s.weaponKind === 'smg' ? 0.075 : s.grip === 'dual' ? 0.105 : 0.19;
          s.nextShot = t + cadence + this.rngState.range(0, 0.05);
        }
      }
    }

    // the squad answers with sustained bursts that chew the marble
    if (t >= ENEMY_FIRE_WINDOW.t0 && t <= ENEMY_FIRE_WINDOW.t1) {
      for (const e of this.actors) {
        if (!e.alive || !e.active || e.grip === 'none') continue;
        if (e.role !== 'soldier' && e.role !== 'guard') continue;
        if (t < e.nextShot) continue;
        if (e.leanOffset < 0.42 && e.role === 'soldier') continue;
        const p = this.enemyAimPoint(e);
        if (!p) continue;
        if (this.fireFrom(e, p, true, 'suppress'))
          e.nextShot = t + (e.role === 'soldier' ? 0.04 : 0.38) + this.rngState.range(0, 0.03);
        else e.nextShot = t + 0.03;
      }
    }
  }

  /** A point on the enemy's cover to shoot at — this is what wrecks the marble. */
  private suppressPoint(s: Actor): Vec3 | null {
    let best: Actor | null = null;
    let bestD = 1e9;
    for (const e of this.actors) {
      if (!e.alive || !e.active || (e.role !== 'soldier' && e.role !== 'guard')) continue;
      const d = dist(e.pos, s.pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return null;
    const cov = best.script.cover;
    const side = cov ? -cov.leanDir : 1;
    return v3(
      best.pos.x + side * this.rngState.range(0.9, 1.9),
      0.55 + this.rngState.range(0, 1.5),
      best.pos.z + this.rngState.sym(0.35),
    );
  }

  /** Deliberate near-misses: the squad never actually hits the protagonists. */
  private enemyAimPoint(e: Actor): Vec3 | null {
    const p = this.actors[e.id % 2 === 0 ? NEO : TRINITY];
    if (!p.active) return null;
    const away = normalize(sub(e.pos, p.pos));
    const side = cross(away, v3(0, 1, 0));
    const lateral = (this.rngState.next() < 0.5 ? -1 : 1) * this.rngState.range(0.95, 2.1);
    return v3(
      p.pos.x + side.x * lateral,
      p.pos.y + this.rngState.range(0.4, 2.4),
      p.pos.z + side.z * lateral,
    );
  }

  private tryShootActor(shooter: Actor, target: Actor, force = false): boolean {
    const aim = v3(target.pos.x, target.pos.y + 1.15, target.pos.z);
    const muzzle = this.muzzle(shooter, shooter.hasGunR ? 'R' : 'L');
    const d = sub(aim, muzzle.pos);
    const range = len(d);
    if (range < 0.3) return false;
    const dir = normalize(d);
    // is the line clear — of marble and of anyone standing in between?
    const hit = raycast(this.surfaces, muzzle.pos, dir, range - 0.15);
    if (hit) return false;
    if (!force) {
      for (const c of this.actors) {
        if (!c.active || !c.alive || c.id === shooter.id || c.id === target.id) continue;
        if (rayCapsule(muzzle.pos, dir, range - 0.2, c.pos, ACTOR_RADIUS + 0.1) !== null) return false;
      }
    }
    this.fireFrom(shooter, aim, false, 'kill', force ? target.id : -1);
    shooter.nextShot = this.time + 0.13;
    // The order is only ticked off when the round that just left the barrel is
    // actually going to land on the man it was meant for — the friendly-fire
    // guard can steer a shot off target, and then he simply fires again.
    return this.lastResolvedHit === target.id;
  }

  private muzzle(a: Actor, hand: 'L' | 'R'): { pos: Vec3; dir: Vec3 } {
    return muzzleWorld({ pos: a.pos, yaw: a.yaw, pitch: a.pitch, roll: a.roll }, a.pose, hand, 0.26);
  }

  /** Never let a protagonist's line cross the other protagonist. */
  private safeDir(from: Vec3, dir: Vec3, range: number, ignore: number): Vec3 {
    for (const id of [NEO, TRINITY]) {
      if (id === ignore) continue;
      const ally = this.actors[id];
      if (!ally.active || !ally.alive) continue;
      const end = addScaled(from, dir, range);
      const c = v3(ally.pos.x, ally.pos.y + 0.9, ally.pos.z);
      const d = segPointDist(from, end, c);
      if (d > ACTOR_RADIUS + 0.55) continue;
      // rotate the shot away from the ally around Y until it clears
      const toAlly = sub(c, from);
      const distAlly = Math.max(0.6, Math.hypot(toAlly.x, toAlly.z));
      const need = Math.asin(clamp((ACTOR_RADIUS + 0.75) / distAlly, -1, 1));
      const aAlly = Math.atan2(toAlly.x, toAlly.z);
      const aDir = Math.atan2(dir.x, dir.z);
      let diff = aDir - aAlly;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const sign = diff >= 0 ? 1 : -1;
      const na = aAlly + sign * need;
      const flat = Math.hypot(dir.x, dir.z);
      dir = normalize(v3(Math.sin(na) * flat, dir.y, Math.cos(na) * flat));
    }
    return dir;
  }

  /** True when a shot along `dir` would strike any living character. */
  private wouldHitSomeone(o: Vec3, dir: Vec3, owner: number): boolean {
    const surf = raycast(this.surfaces, o, dir, 70);
    const limit = surf ? surf.t : 70;
    for (const c of this.actors) {
      if (!c.active || !c.alive || c.id === owner) continue;
      if (rayCapsule(o, dir, limit, c.pos, ACTOR_RADIUS + 0.12) !== null) return true;
    }
    return false;
  }

  private fireFrom(
    a: Actor,
    aimPoint: Vec3,
    enemyShot: boolean,
    mode: 'kill' | 'suppress' = 'kill',
    forceTarget = -1,
  ): boolean {
    const hand: 'L' | 'R' = a.hasGunR && (!a.hasGunL || this.rngState.next() < 0.5) ? 'R' : 'L';
    const m = this.muzzle(a, hand);
    let dir = normalize(sub(aimPoint, m.pos));
    const spread = a.role === 'soldier' ? 0.02 : 0.008;
    dir = normalize(v3(dir.x + this.rngState.sym(spread), dir.y + this.rngState.sym(spread), dir.z + this.rngState.sym(spread)));
    if (!enemyShot || a.role === 'soldier' || a.role === 'guard') {
      dir = this.safeDir(m.pos, dir, 60, a.role === 'neo' ? NEO : a.role === 'trinity' ? TRINITY : -1);
    }
    // Suppressive fire is what chews the marble; it must never take a life, so a
    // round that would strike a body is simply not taken this step.
    if (mode === 'suppress' && this.wouldHitSomeone(m.pos, dir, a.id)) return false;
    this.spawnBullet(m.pos, dir, a.id, enemyShot, forceTarget);
    if (hand === 'R') {
      a.recoilR = 1;
      a.flashR = 1;
    } else {
      a.recoilL = 1;
      a.flashL = 1;
    }
    this.stats.shotsFired++;
    const smg = a.weaponKind === 'smg';
    this.sfx(smg ? 'smg' : 'pistol', m.pos, smg ? 0.55 : 0.8, 0.94 + this.rngState.sym(0.12));
    this.emit({
      k: 'shot',
      actor: a.id,
      hand,
      x: m.pos.x,
      y: m.pos.y,
      z: m.pos.z,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      t: this.time,
    });
    // eject a casing
    const right = v3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    const vel = v3(
      right.x * this.rngState.range(1.4, 2.6) + this.rngState.sym(0.5),
      this.rngState.range(1.6, 2.9),
      right.z * this.rngState.range(1.4, 2.6) + this.rngState.sym(0.5),
    );
    if (this.casings.spawn(m.pos, vel, 2, SIZE_CASING, this.rng, this.time) >= 0)
      this.stats.casingsSpawned++;
    return true;
  }

  private spawnBullet(o: Vec3, dir: Vec3, owner: number, enemyShot: boolean, forceTarget = -1): void {
    const maxRange = 70;
    let hitActor = -1;
    let hitT = maxRange;
    for (const c of this.actors) {
      if (!c.active || !c.alive || c.id === owner) continue;
      if (forceTarget >= 0 && c.id !== forceTarget) continue;
      const d = rayCapsule(o, dir, hitT, c.pos, ACTOR_RADIUS + (forceTarget >= 0 ? 0.25 : 0));
      if (d !== null && d < hitT) {
        hitT = d;
        hitActor = c.id;
      }
    }
    const surf = raycast(this.surfaces, o, dir, maxRange);
    let surfaceId = -999;
    let hu = 0;
    let hv = 0;
    let n = v3(0, 0, -1);
    if (surf && surf.t < hitT) {
      hitActor = -1;
      hitT = surf.t;
      surfaceId = surf.surfaceId;
      hu = surf.u;
      hv = surf.v;
      n = surf.normal;
    } else if (surf) {
      surfaceId = -999;
    }

    if (hitActor >= 0) {
      const victim = this.actors[hitActor];
      const shooter = this.actors[owner];
      const shooterIsHero = shooter.role === 'neo' || shooter.role === 'trinity';
      const victimIsHero = victim.role === 'neo' || victim.role === 'trinity';
      if (victimIsHero) {
        this.stats.protagonistsHit++;
        if (shooterIsHero) this.stats.protagonistHitsOnProtagonist++;
      }
    }

    this.lastResolvedHit = hitActor;
    const b = this.bulletPool.pop() ?? ({} as Bullet);
    b.x = o.x; b.y = o.y; b.z = o.z;
    b.dx = dir.x; b.dy = dir.y; b.dz = dir.z;
    b.travelled = 0;
    b.range = hitT;
    b.owner = owner;
    b.enemyShot = enemyShot;
    b.hitActor = hitActor;
    b.surfaceId = surfaceId;
    b.hu = hu;
    b.hv = hv;
    b.nx = n.x; b.ny = n.y; b.nz = n.z;
    b.alive = true;
    this.bullets.push(b);
  }

  private stepBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.travelled += BULLET_SPEED * dt;
      if (b.travelled < b.range) continue;
      const p = v3(b.x + b.dx * b.range, b.y + b.dy * b.range, b.z + b.dz * b.range);
      this.resolveImpact(b, p);
      b.alive = false;
      this.bullets.splice(i, 1);
      this.bulletPool.push(b);
      this.stats.bulletsResolved++;
    }
  }

  private resolveImpact(b: Bullet, p: Vec3): void {
    if (b.hitActor >= 0) {
      const victim = this.actors[b.hitActor];
      if (victim.alive) this.kill(victim, 'bullet');
      return;
    }
    if (b.surfaceId === -999) return;

    const n = v3(b.nx, b.ny, b.nz);
    const isSlab = b.surfaceId >= 0;
    if (isSlab) {
      const before = this.damage.veneerAt(b.surfaceId, b.hu, b.hv);
      // a wide shallow spall plus a deeper core, offset a little, so no two
      // impacts read as the same round dot
      const radius = this.rngState.range(0.10, 0.30);
      this.damage.apply(b.surfaceId, b.hu, b.hv, radius, this.rngState.range(0.4, 0.95));
      this.damage.apply(
        b.surfaceId,
        b.hu + this.rngState.sym(radius * 0.5),
        b.hv + this.rngState.sym(radius * 0.5),
        radius * this.rngState.range(0.3, 0.55),
        this.rngState.range(0.5, 1.0),
      );
      const after = this.damage.veneerAt(b.surfaceId, b.hu, b.hv);
      this.spawnChips(p, n, before, after);
      this.sfx('marble_chip', p, 0.55, 0.92 + this.rngState.sym(0.18));
      if (before < 0.5 && after >= 0.5 && this.rngState.next() < 0.28) {
        this.sfx('marble_shatter', p, 0.7, 0.9 + this.rngState.sym(0.2));
        this.spawnSlab(p, n);
      }
    } else if (b.surfaceId === FLOOR_ID) {
      this.spawnChips(p, n, 1, 1);
    }
    if (this.rngState.next() < 0.22) this.sfx('ricochet', p, 0.42, 0.9 + this.rngState.sym(0.25));

    // dust and sparks
    const k = 5 + this.rngState.int(5);
    for (let i = 0; i < k; i++) {
      const v = v3(
        n.x * this.rngState.range(0.4, 2.0) + this.rngState.sym(0.9),
        this.rngState.range(0.2, 1.6),
        n.z * this.rngState.range(0.4, 2.0) + this.rngState.sym(0.9),
      );
      this.dust.spawn(p, v, this.rngState.range(1.1, 2.6), this.rngState.range(0.16, 0.5), 0, this.rng);
    }
    for (let i = 0; i < 3; i++) {
      const v = v3(
        n.x * this.rngState.range(1, 5) + this.rngState.sym(3),
        this.rngState.range(0.6, 3.4),
        n.z * this.rngState.range(1, 5) + this.rngState.sym(3),
      );
      this.dust.spawn(p, v, this.rngState.range(0.18, 0.42), this.rngState.range(0.03, 0.07), 1, this.rng);
    }
  }

  /** Palm-sized veneer chips and rough substrate grit that stay on the floor. */
  private spawnChips(p: Vec3, n: Vec3, veneerBefore: number, veneerAfter: number): void {
    const stripping = veneerAfter > veneerBefore && veneerBefore < 0.9;
    const count = 3 + this.rngState.int(stripping ? 5 : 2);
    for (let i = 0; i < count; i++) {
      const kind = stripping && this.rngState.next() < 0.72 ? 0 : 1;
      const s = kind === 0 ? this.rngState.range(0.035, 0.085) : this.rngState.range(0.02, 0.05);
      const vel = v3(
        n.x * this.rngState.range(0.8, 3.4) + this.rngState.sym(1.4),
        this.rngState.range(0.6, 3.0),
        n.z * this.rngState.range(0.8, 3.4) + this.rngState.sym(1.4),
      );
      if (this.debris.spawn(p, vel, kind, v3(s, s * this.rngState.range(0.35, 0.8), s * this.rngState.range(0.7, 1.2)), this.rng, this.time) >= 0)
        this.stats.debrisSpawned++;
    }
  }

  /** A whole palm-sized slab of polished veneer shearing off the column. */
  private spawnSlab(p: Vec3, n: Vec3): void {
    const w = this.rngState.range(0.12, 0.24);
    const vel = v3(
      n.x * this.rngState.range(1.2, 2.8) + this.rngState.sym(0.8),
      this.rngState.range(0.4, 1.8),
      n.z * this.rngState.range(1.2, 2.8) + this.rngState.sym(0.8),
    );
    if (this.debris.spawn(p, vel, 0, v3(w, this.rngState.range(0.018, 0.03), w * this.rngState.range(0.6, 1.3)), this.rng, this.time, 7) >= 0)
      this.stats.debrisSpawned++;
    for (let i = 0; i < 9; i++) {
      const v = v3(n.x * this.rngState.range(0.3, 1.6) + this.rngState.sym(1.1), this.rngState.range(0.2, 1.4), n.z * this.rngState.range(0.3, 1.6) + this.rngState.sym(1.1));
      this.dust.spawn(p, v, this.rngState.range(1.6, 3.4), this.rngState.range(0.3, 0.75), 0, this.rng);
    }
  }

  private discardWeapon(a: Actor, hand: 'L' | 'R'): void {
    const m = this.muzzle(a, hand);
    const right = v3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    const s = hand === 'R' ? 1 : -1;
    const vel = v3(right.x * s * this.rngState.range(1.2, 2.4) + this.rngState.sym(0.6), this.rngState.range(-0.4, 0.8), right.z * s * this.rngState.range(1.2, 2.4) + this.rngState.sym(0.6));
    this.debris.spawn(m.pos, vel, 3, v3(0.055, 0.115, 0.19), this.rng, this.time, 9);
    this.stats.debrisSpawned++;
    this.sfx('gundrop', m.pos, 0.8, 0.95 + this.rngState.sym(0.1));
    this.sfx('draw', a.pos, 0.55, 0.98 + this.rngState.sym(0.08));
  }

  private kill(a: Actor, cause: 'bullet' | 'melee'): void {
    a.alive = false;
    a.deathT = this.time;
    a.grip = 'none';
    this.stats.downed++;
    this.emit({ k: 'down', actor: a.id, cause, x: a.pos.x, y: a.pos.y, z: a.pos.z, t: this.time });
    // exactly one stylised hit reaction per man down
    this.sfx('hit', a.pos, 0.85, 0.95 + this.rngState.sym(0.12));
    if (a.script.weapon) {
      const right = v3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
      this.debris.spawn(
        v3(a.pos.x, a.pos.y + 1.1, a.pos.z),
        v3(right.x * this.rngState.range(0.4, 1.6), this.rngState.range(0.2, 1.0), right.z * this.rngState.range(0.4, 1.6)),
        3,
        v3(0.055, 0.11, a.script.weapon === 'smg' ? 0.30 : 0.19),
        this.rng,
        this.time,
        8,
      );
      this.stats.debrisSpawned++;
    }
  }

  /* ---------------- reset (loop) ---------------- */

  /** Rewind everything in place so the demo can loop without rebuilding the
   *  scene graph. Actor objects are mutated, never replaced, so the renderer's
   *  views stay bound to them. */
  reset(): void {
    this.time = 0;
    this.steps = 0;
    this.alarmOn = false;
    this.alarmFired = false;
    this.beepFired = false;
    this.doorFired = false;
    this.dingFired = false;
    this.doorsFired = false;
    this.closeFired = false;
    this.meleeIdx = 0;
    this.discardIdx = 0;
    this.lastCasingSfx = -1;
    this.lastDebrisSfx = -1;
    this.lastResolvedHit = -1;
    this.musicFired.clear();
    this.pending.length = 0;
    for (const o of KILL_ORDERS) this.pending.push(o);
    this.bullets.length = 0;
    this.events = [];
    if (this.eventLog) this.eventLog.length = 0;
    this.rngState = new Rng(this.seed);
    for (const k of Object.keys(this.stats) as (keyof World['stats'])[]) this.stats[k] = 0;
    for (let i = 0; i < this.damage.veneer.length; i++) {
      this.damage.veneer[i].fill(0);
      this.damage.crater[i].fill(0);
      this.damage.dirty[i] = true;
    }
    this.damage.totalDamage = 0;
    this.damage.impactCount = 0;
    this.casings.count = 0;
    this.casings.spawnRequests = 0;
    this.debris.count = 0;
    this.debris.spawnRequests = 0;
    this.dust.count = 0;
    for (const a of this.actors) {
      const s = a.script;
      a.active = false;
      a.alive = true;
      a.deathT = -1;
      a.pos = v3(s.path[0].p.x, s.path[0].p.y, s.path[0].p.z);
      a.prevPos = v3(a.pos.x, a.pos.y, a.pos.z);
      a.yaw = s.path[0].yaw ?? 0;
      a.pitch = 0;
      a.roll = 0;
      a.pose.fill(0);
      a.gait = 0;
      a.grip = 'none';
      a.recoilL = a.recoilR = a.flashL = a.flashR = 0;
      a.hasGunL = a.hasGunR = false;
      a.weaponKind = a.script.weapon ?? 'pistol';
      a.nextShot = 0;
      a.leanOffset = 0;
      a.exposed = 0;
      if (a.coat) a.coat = new CoatSim(1.16, 0.205);
    }
  }

  /* ---------------- hashing ---------------- */

  /** A hash over everything that could possibly diverge between two runs. */
  hash(): string {
    const h = new StateHasher();
    h.num(this.time).int(this.steps).int(this.stats.shotsFired).int(this.stats.downed);
    for (const a of this.actors) {
      h.bool(a.active).bool(a.alive).num(a.deathT);
      h.vec(a.pos).num(a.yaw).num(a.pitch).num(a.roll).num(a.gait);
      for (let i = 0; i < a.pose.length; i++) h.num(a.pose[i]);
      if (a.coat) for (let i = 0; i < a.coat.px.length; i++) h.num(a.coat.px[i]).num(a.coat.py[i]).num(a.coat.pz[i]);
    }
    for (const b of this.bullets) h.vec(v3(b.x, b.y, b.z)).num(b.travelled).int(b.hitActor);
    h.int(this.casings.count).int(this.debris.count).int(this.dust.count);
    for (let i = 0; i < this.casings.count; i++) h.num(this.casings.px[i]).num(this.casings.py[i]).num(this.casings.pz[i]);
    for (let i = 0; i < this.debris.count; i++) h.num(this.debris.px[i]).num(this.debris.py[i]).num(this.debris.pz[i]);
    h.int(this.damage.totalDamage % 0x7fffffff).int(this.damage.impactCount);
    return h.hex;
  }

  get finished(): boolean {
    return this.time >= END_TIME;
  }
}
