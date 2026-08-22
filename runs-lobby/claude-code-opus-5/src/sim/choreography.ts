/** THE SCRIPT.
 *
 *  Everything the sequence does lives here as data: where every character walks,
 *  which pose they play, when the time scale drops into slow motion, when the
 *  music changes section and where the camera is. The world module is a dumb
 *  interpreter of this file, which is what keeps the whole demo deterministic.
 *
 *  All times are STORY seconds (simulation time). Because the slow-motion beats
 *  stretch story time, the wall-clock runtime is roughly 60-65 s.
 */
import { LAYOUT } from './lobby.ts';
import { v3, type Vec3 } from './vec.ts';
import type { DeathStyle } from './anim.ts';

export const END_TIME = 47.5;

/** Named beats, so the camera / music / audio tracks stay in sync with edits. */
export const BEAT = {
  entrance: 0,
  detectorBeep: 6.62,
  guardSteps: 7.2,
  guardAsks: 8.2,
  coatOpen: 9.35,
  frozen: 10.05,
  radioLunge: 11.0,
  firstStrike: 11.25,
  trinityKick: 12.45,
  alarm: 13.0,
  drawGuns: 13.35,
  advance: 14.6,
  shootout: 15.0,
  cartwheel: 17.4,
  wallRun: 21.6,
  reload: 24.6,
  columnSpin: 28.9,
  lastSoldier: 32.4,
  windDown: 33.0,
  holster: 37.8,
  walkOut: 38.4,
  elevatorDing: 42.6,
  doorsOpen: 42.9,
  stepIn: 43.5,
  doorsClose: 44.6,
  finalWide: 45.5,
} as const;

/* ------------------------------------------------------------------ */
/* time scale                                                          */
/* ------------------------------------------------------------------ */

export interface SlowMoWindow {
  t0: number;
  t1: number;
  scale: number;
  ramp: number;
}

/** Sustained slow-motion beats. Each one is covered by an orbiting camera. */
export const SLOWMO: SlowMoWindow[] = [
  { t0: 10.05, t1: 10.85, scale: 0.34, ramp: 0.18 }, // the frozen beat after the reveal
  { t0: 12.45, t1: 13.35, scale: 0.28, ramp: 0.16 }, // Trinity's flying kick
  { t0: 17.9, t1: 19.05, scale: 0.26, ramp: 0.2 },   // the cartwheel
  { t0: 22.2, t1: 23.35, scale: 0.26, ramp: 0.2 },   // the wall run
  { t0: 29.15, t1: 30.3, scale: 0.28, ramp: 0.2 },   // the column spin
  { t0: 33.15, t1: 34.0, scale: 0.34, ramp: 0.22 },  // the last man falls
];

/** Current story-time scale. Smooth ramps keep the audio pitch glide musical. */
export function timeScaleAt(t: number): number {
  let s = 1;
  for (const w of SLOWMO) {
    if (t < w.t0 - w.ramp || t > w.t1 + w.ramp) continue;
    let k: number;
    if (t < w.t0) k = (t - (w.t0 - w.ramp)) / w.ramp;
    else if (t > w.t1) k = 1 - (t - w.t1) / w.ramp;
    else k = 1;
    k = k * k * (3 - 2 * k);
    s = Math.min(s, 1 + (w.scale - 1) * k);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* motion & pose scripting                                             */
/* ------------------------------------------------------------------ */

export type Ease = 'linear' | 'inout' | 'out' | 'in';

export interface PathKey {
  t: number;
  p: Vec3;
  /** Explicit facing; omitted keys face along the direction of travel. */
  yaw?: number;
  ease?: Ease;
}

export type PoseKind =
  | 'stand'
  | 'walk'
  | 'walkSlow'
  | 'run'
  | 'crouch'
  | 'coatOpen'
  | 'cartwheel'
  | 'wallrun'
  | 'kick'
  | 'strike'
  | 'radio'
  | 'ask'
  | 'cover'
  | 'holster'
  | 'dead';

export interface PoseKey {
  t: number;
  k: PoseKind;
  /** Variation index for strikes, cover cycles, … */
  i?: number;
}

export type Grip = 'right' | 'left' | 'both' | 'dual' | 'none';

export interface AimKey {
  t: number;
  grip: Grip;
}

export interface ActorScript {
  id: number;
  name: string;
  role: 'neo' | 'trinity' | 'guard' | 'soldier';
  spawnT: number;
  path: PathKey[];
  poses: PoseKey[];
  aim: AimKey[];
  deathStyle: DeathStyle;
  /** Cover anchor used by the lean-out cycle (soldiers only). */
  cover?: { pos: Vec3; leanDir: number; period: number; phase: number };
  /** Melee kill: {t, targetId} — resolved without a bullet. */
  melee?: { t: number; target: number }[];
  /** Weapon carried once drawn. */
  weapon?: 'pistol' | 'smg';
  /** Story-time windows in which a compact submachine gun comes out from under
   *  the coat instead of the handguns. */
  smgWindows?: [number, number][];
}

/** Priority target list per protagonist; a shot is taken as soon as the line is
 *  clear, which keeps the choreography robust when bodies block a sight line. */
export interface KillOrder {
  t: number;
  target: number;
  shooter: number; // preferred shooter, the other one takes over if blocked
}

/** Empty guns thrown away and fresh ones pulled from under the coat. */
export interface DiscardCue {
  t: number;
  actor: number;
  hand: 'L' | 'R';
}

const P = v3;

/* ---- ids ---------------------------------------------------------- */
export const NEO = 0;
export const TRINITY = 1;
export const GUARD0 = 2;
export const SOLDIER0 = 7;
export const N_GUARDS = 5;
export const N_SOLDIERS = 16;

/* ---- protagonists -------------------------------------------------- */

const neoScript: ActorScript = {
  id: NEO,
  name: 'neo',
  role: 'neo',
  spawnT: 0,
  weapon: 'pistol',
  smgWindows: [[24.8, 31.0]],
  path: [
    { t: 0, p: P(0, 0, -1.6) },
    { t: 6.0, p: P(0, 0, 5.3), ease: 'linear' },
    { t: 7.05, p: P(0, 0, 6.95), ease: 'out' },
    { t: 11.2, p: P(0, 0, 6.95) },
    { t: 11.75, p: P(0.55, 0, 7.75), ease: 'inout' },
    { t: 12.4, p: P(1.35, 0, 8.35), ease: 'inout' },
    { t: 13.6, p: P(1.35, 0, 8.35) },
    { t: 15.0, p: P(1.9, 0, 10.6), ease: 'inout' },
    { t: 17.4, p: P(1.2, 0, 14.2), ease: 'inout' },
    // cartwheel: sideways across the open floor
    { t: 19.3, p: P(-2.9, 0, 15.6), ease: 'linear' },
    { t: 21.4, p: P(-3.9, 0, 18.9), ease: 'inout' },
    { t: 24.6, p: P(-4.6, 0, 19.05) },
    { t: 26.5, p: P(-4.6, 0, 19.05) },
    // break from cover around the near face of the column, never through it
    { t: 27.05, p: P(-3.2, 0, 19.75), ease: 'out' },
    { t: 28.0, p: P(-3.45, 0, 24.2), ease: 'linear' },
    { t: 28.9, p: P(-4.6, 0, 28.7), ease: 'inout' },
    // spin around the column — step clear of it before advancing
    { t: 29.4, p: P(-3.35, 0, 29.15), ease: 'out' },
    { t: 30.4, p: P(-3.3, 0, 31.0), ease: 'inout' },
    { t: 32.6, p: P(-2.1, 0, 35.4), ease: 'inout' },
    { t: 33.6, p: P(-1.6, 0, 37.4), ease: 'out' },
    { t: 38.4, p: P(-1.6, 0, 37.4) },
    { t: 42.9, p: P(-0.55, 0, 45.8), ease: 'inout' },
    { t: 44.3, p: P(-0.5, 0, 48.35), yaw: Math.PI, ease: 'inout' },
    { t: END_TIME, p: P(-0.5, 0, 48.35), yaw: Math.PI },
  ],
  poses: [
    { t: 0, k: 'walk' },
    { t: 7.05, k: 'stand' },
    { t: 9.35, k: 'coatOpen' },
    { t: 11.2, k: 'strike', i: 0 },
    { t: 11.72, k: 'strike', i: 1 },
    { t: 12.35, k: 'strike', i: 2 },
    { t: 12.95, k: 'stand' },
    { t: 14.6, k: 'walk' },
    { t: 17.4, k: 'cartwheel' },
    { t: 19.3, k: 'crouch' },
    { t: 19.9, k: 'run' },
    { t: 21.4, k: 'cover' },
    { t: 24.6, k: 'cover', i: 1 },
    { t: 26.5, k: 'run' },
    { t: 28.0, k: 'cover' },
    { t: 28.9, k: 'cover', i: 1 },
    { t: 30.4, k: 'run' },
    { t: 33.6, k: 'stand' },
    { t: 37.8, k: 'holster' },
    { t: 38.4, k: 'stand' },
    { t: 38.9, k: 'walkSlow' },
    { t: 44.3, k: 'stand' },
  ],
  aim: [
    { t: 0, grip: 'none' },
    { t: 13.35, grip: 'dual' },
    { t: 17.4, grip: 'dual' },
    { t: 37.8, grip: 'none' },
  ],
  deathStyle: 'crumple',
};

const trinityScript: ActorScript = {
  id: TRINITY,
  name: 'trinity',
  role: 'trinity',
  spawnT: 1.2,
  weapon: 'pistol',
  smgWindows: [[25.3, 31.6]],
  path: [
    { t: 1.2, p: P(1.05, 0, -1.6) },
    { t: 6.4, p: P(1.1, 0, 3.1), ease: 'linear' },
    { t: 7.6, p: P(1.25, 0, 4.5), ease: 'out' },
    { t: 11.6, p: P(1.25, 0, 4.5) },
    // run in for the flying kick
    { t: 12.4, p: P(-0.6, 0, 6.1), ease: 'in' },
    { t: 12.95, p: P(-2.0, 0, 7.2), ease: 'linear' },
    { t: 13.5, p: P(-2.55, 0, 7.9), ease: 'out' },
    { t: 14.6, p: P(-2.4, 0, 8.4) },
    { t: 16.6, p: P(2.4, 0, 11.6), ease: 'inout' },
    { t: 19.0, p: P(3.5, 0, 15.0), ease: 'inout' },
    { t: 21.6, p: P(3.55, 0, 18.5), ease: 'inout' },
    // wall run along the inner face of the right column at z = 20.5
    { t: 22.35, p: P(3.88, 1.05, 19.6), ease: 'in' },
    { t: 22.95, p: P(3.9, 2.05, 20.5), ease: 'linear' },
    { t: 23.35, p: P(3.9, 2.35, 21.25), ease: 'linear' },
    { t: 23.85, p: P(3.3, 0, 22.3), ease: 'out' },
    { t: 25.4, p: P(4.6, 0, 28.7), ease: 'inout' },
    { t: 28.4, p: P(4.6, 0, 28.7) },
    { t: 29.0, p: P(3.35, 0, 29.15), ease: 'out' },
    { t: 30.2, p: P(3.2, 0, 32.4), ease: 'inout' },
    { t: 32.8, p: P(1.8, 0, 36.6), ease: 'inout' },
    { t: 33.8, p: P(1.5, 0, 37.6), ease: 'out' },
    { t: 38.4, p: P(1.5, 0, 37.6) },
    { t: 42.9, p: P(0.6, 0, 45.8), ease: 'inout' },
    { t: 44.3, p: P(0.55, 0, 48.35), yaw: Math.PI, ease: 'inout' },
    { t: END_TIME, p: P(0.55, 0, 48.35), yaw: Math.PI },
  ],
  poses: [
    { t: 1.2, k: 'walk' },
    { t: 7.6, k: 'stand' },
    { t: 11.9, k: 'run' },
    { t: 12.45, k: 'kick' },
    { t: 13.5, k: 'crouch' },
    { t: 14.2, k: 'stand' },
    { t: 15.2, k: 'run' },
    { t: 16.6, k: 'walk' },
    { t: 19.0, k: 'cover' },
    { t: 21.6, k: 'run' },
    { t: 22.3, k: 'wallrun' },
    { t: 23.85, k: 'crouch' },
    { t: 24.6, k: 'run' },
    { t: 25.4, k: 'cover' },
    { t: 27.0, k: 'cover', i: 1 },
    { t: 30.2, k: 'run' },
    { t: 33.8, k: 'stand' },
    { t: 37.8, k: 'holster' },
    { t: 38.4, k: 'stand' },
    { t: 38.9, k: 'walkSlow' },
    { t: 44.3, k: 'stand' },
  ],
  aim: [
    { t: 0, grip: 'none' },
    { t: 13.6, grip: 'dual' },
    { t: 21.6, grip: 'right' },
    { t: 23.85, grip: 'dual' },
    { t: 37.8, grip: 'none' },
  ],
  deathStyle: 'crumple',
};

/* ---- lobby security ------------------------------------------------ */

function guardScript(
  id: number,
  spawn: Vec3,
  yaw: number,
  extra: Partial<ActorScript> = {},
): ActorScript {
  return {
    id,
    name: `guard${id - GUARD0}`,
    role: 'guard',
    spawnT: 0,
    weapon: 'pistol',
    path: [{ t: 0, p: spawn, yaw }],
    poses: [{ t: 0, k: 'stand' }],
    aim: [{ t: 0, grip: 'none' }],
    deathStyle: 'crumple',
    ...extra,
  };
}

const guards: ActorScript[] = [
  // desk guard
  guardScript(GUARD0 + 0, P(2.9, 0, 7.5), Math.PI, {
    path: [
      { t: 0, p: P(2.9, 0, 7.5), yaw: Math.PI },
      { t: 11.3, p: P(2.9, 0, 7.5), yaw: Math.PI },
      { t: 11.9, p: P(2.35, 0, 8.15), yaw: Math.PI + 0.5, ease: 'out' },
    ],
    poses: [
      { t: 0, k: 'stand' },
      { t: 11.3, k: 'run' },
      { t: 11.9, k: 'stand' },
    ],
    deathStyle: 'backfall',
  }),
  // metal-detector guard: steps up, asks, then lunges for his radio
  guardScript(GUARD0 + 1, P(1.5, 0, 6.9), Math.PI, {
    path: [
      { t: 0, p: P(1.5, 0, 6.9), yaw: Math.PI },
      { t: 7.2, p: P(1.5, 0, 6.9), yaw: Math.PI },
      { t: 8.15, p: P(1.45, 0, 8.15), yaw: Math.PI + 0.3, ease: 'inout' },
    ],
    poses: [
      { t: 0, k: 'stand' },
      { t: 7.2, k: 'walkSlow' },
      { t: 8.15, k: 'stand' },
      { t: 8.35, k: 'ask' },
      { t: BEAT.radioLunge, k: 'radio' },
    ],
    deathStyle: 'spin',
  }),
  // x-ray guard: takes Trinity's flying kick
  guardScript(GUARD0 + 2, P(-3.0, 0, 6.2), Math.PI * 0.5, {
    path: [
      { t: 0, p: P(-3.0, 0, 6.2), yaw: Math.PI * 0.5 },
      { t: 11.4, p: P(-3.0, 0, 6.2), yaw: Math.PI * 0.5 },
      { t: 12.3, p: P(-2.6, 0, 7.35), yaw: Math.PI * 0.9, ease: 'inout' },
    ],
    poses: [
      { t: 0, k: 'stand' },
      { t: 11.4, k: 'walkSlow' },
      { t: 12.3, k: 'stand' },
    ],
    deathStyle: 'spin',
  }),
  // two patrolling guards who draw once the alarm goes
  guardScript(GUARD0 + 3, P(6.4, 0, 13.6), Math.PI, {
    path: [
      { t: 0, p: P(6.4, 0, 13.6), yaw: Math.PI },
      { t: 6, p: P(6.4, 0, 16.4), yaw: 0, ease: 'linear' },
      { t: 11.2, p: P(6.4, 0, 13.4), yaw: Math.PI, ease: 'linear' },
      { t: 13.6, p: P(3.7, 0, 12.9), yaw: Math.PI, ease: 'out' },
    ],
    poses: [
      { t: 0, k: 'walkSlow' },
      { t: 11.2, k: 'run' },
      { t: 13.6, k: 'stand' },
    ],
    aim: [{ t: 0, grip: 'none' }, { t: 13.3, grip: 'right' }],
    deathStyle: 'backfall',
  }),
  guardScript(GUARD0 + 4, P(-6.2, 0, 17.4), 0, {
    path: [
      { t: 0, p: P(-6.2, 0, 17.4), yaw: 0 },
      { t: 11.4, p: P(-6.2, 0, 17.4), yaw: 0 },
      { t: 14.2, p: P(-4.4, 0, 13.4), yaw: Math.PI, ease: 'out' },
    ],
    poses: [
      { t: 0, k: 'stand' },
      { t: 11.4, k: 'run' },
      { t: 14.2, k: 'stand' },
    ],
    aim: [{ t: 0, grip: 'none' }, { t: 13.8, grip: 'right' }],
    deathStyle: 'crumple',
  }),
];

/* ---- reinforcement squad ------------------------------------------- */

interface SoldierDef {
  spawnT: number;
  from: Vec3;
  cover: Vec3;
  leanDir: number;
  style: DeathStyle;
  phase: number;
}

const SOLDIER_DEFS: SoldierDef[] = [
  // wave A — storms in from the elevator bank
  { spawnT: 14.4, from: P(-3.2, 0, 47.0), cover: P(-4.6, 0, 40.9), leanDir: 1, style: 'slide', phase: 0.0 },
  { spawnT: 14.4, from: P(3.2, 0, 47.0), cover: P(4.6, 0, 40.9), leanDir: -1, style: 'slide', phase: 0.35 },
  { spawnT: 14.9, from: P(-1.0, 0, 47.0), cover: P(-7.3, 0, 38.4), leanDir: 1, style: 'crumple', phase: 0.6 },
  { spawnT: 14.9, from: P(1.0, 0, 47.0), cover: P(7.3, 0, 38.4), leanDir: -1, style: 'backfall', phase: 0.15 },
  // wave B — side doors
  { spawnT: 18.5, from: P(-8.6, 0, 44.5), cover: P(-4.6, 0, 31.4), leanDir: 1, style: 'slide', phase: 0.2 },
  { spawnT: 18.5, from: P(8.6, 0, 44.5), cover: P(4.6, 0, 31.4), leanDir: -1, style: 'slide', phase: 0.55 },
  { spawnT: 19.1, from: P(-8.6, 0, 44.5), cover: P(-7.5, 0, 33.8), leanDir: 1, style: 'backfall', phase: 0.8 },
  { spawnT: 19.1, from: P(8.6, 0, 44.5), cover: P(7.5, 0, 33.8), leanDir: -1, style: 'crumple', phase: 0.45 },
  // wave C — pushes to the middle columns
  { spawnT: 22.5, from: P(-3.2, 0, 47.0), cover: P(-3.1, 0, 31.7), leanDir: -1, style: 'spin', phase: 0.1 },
  { spawnT: 22.5, from: P(3.2, 0, 47.0), cover: P(3.1, 0, 31.7), leanDir: 1, style: 'spin', phase: 0.5 },
  { spawnT: 23.1, from: P(-1.0, 0, 47.0), cover: P(-2.4, 0, 36.2), leanDir: 1, style: 'crumple', phase: 0.7 },
  { spawnT: 23.1, from: P(1.0, 0, 47.0), cover: P(2.4, 0, 36.2), leanDir: -1, style: 'backfall', phase: 0.25 },
  // wave D — the last push
  { spawnT: 26.5, from: P(-8.6, 0, 44.5), cover: P(-2.9, 0, 33.4), leanDir: 1, style: 'crumple', phase: 0.3 },
  { spawnT: 26.5, from: P(8.6, 0, 44.5), cover: P(2.9, 0, 33.4), leanDir: -1, style: 'slide', phase: 0.65 },
  { spawnT: 27.1, from: P(-3.2, 0, 47.0), cover: P(-3.5, 0, 41.2), leanDir: 1, style: 'spin', phase: 0.85 },
  { spawnT: 27.1, from: P(3.2, 0, 47.0), cover: P(3.5, 0, 41.2), leanDir: -1, style: 'backfall', phase: 0.05 },
];

function soldierScript(i: number, d: SoldierDef): ActorScript {
  const id = SOLDIER0 + i;
  const travel = 1.9 + (i % 3) * 0.25;
  return {
    id,
    name: `soldier${i}`,
    role: 'soldier',
    spawnT: d.spawnT,
    weapon: 'smg',
    path: [
      { t: d.spawnT, p: d.from },
      { t: d.spawnT + travel, p: d.cover, ease: 'out' },
      { t: END_TIME, p: d.cover },
    ],
    poses: [
      { t: d.spawnT, k: 'run' },
      { t: d.spawnT + travel, k: 'cover' },
    ],
    aim: [
      { t: d.spawnT, grip: 'none' },
      { t: d.spawnT + travel * 0.5, grip: 'both' },
    ],
    cover: { pos: d.cover, leanDir: d.leanDir, period: 1.5, phase: d.phase },
    deathStyle: d.style,
  };
}

export const SCRIPTS: ActorScript[] = [
  neoScript,
  trinityScript,
  ...guards,
  ...SOLDIER_DEFS.map((d, i) => soldierScript(i, d)),
];

/** Melee take-downs — the close-quarters part of the eruption. */
export const MELEE: { t: number; by: number; target: number }[] = [
  { t: 11.55, by: NEO, target: GUARD0 + 1 },
  { t: 12.15, by: NEO, target: GUARD0 + 0 },
  { t: 12.85, by: TRINITY, target: GUARD0 + 2 },
];

/** Priority target list. Times are the earliest moment the shot may be taken. */
export const KILL_ORDERS: KillOrder[] = [
  { t: 13.55, target: GUARD0 + 3, shooter: NEO },
  { t: 14.15, target: GUARD0 + 4, shooter: TRINITY },
  { t: 17.4, target: SOLDIER0 + 0, shooter: NEO },
  { t: 18.0, target: SOLDIER0 + 1, shooter: TRINITY },
  { t: 19.4, target: SOLDIER0 + 2, shooter: NEO },
  { t: 20.1, target: SOLDIER0 + 3, shooter: TRINITY },
  { t: 22.3, target: SOLDIER0 + 4, shooter: NEO },
  { t: 22.9, target: SOLDIER0 + 5, shooter: TRINITY },
  { t: 24.1, target: SOLDIER0 + 6, shooter: NEO },
  { t: 24.7, target: SOLDIER0 + 7, shooter: TRINITY },
  { t: 26.5, target: SOLDIER0 + 8, shooter: NEO },
  { t: 27.1, target: SOLDIER0 + 9, shooter: TRINITY },
  { t: 28.3, target: SOLDIER0 + 10, shooter: NEO },
  { t: 28.9, target: SOLDIER0 + 11, shooter: TRINITY },
  { t: 30.0, target: SOLDIER0 + 12, shooter: NEO },
  { t: 30.7, target: SOLDIER0 + 13, shooter: TRINITY },
  { t: 31.6, target: SOLDIER0 + 14, shooter: NEO },
  { t: 32.4, target: SOLDIER0 + 15, shooter: TRINITY },
];

/** Emptied guns hit the floor and stay there; a fresh one comes out of the coat. */
export const DISCARDS: DiscardCue[] = [
  { t: 19.6, actor: NEO, hand: 'L' },
  { t: 21.0, actor: TRINITY, hand: 'R' },
  { t: 24.8, actor: NEO, hand: 'R' },
  { t: 25.3, actor: TRINITY, hand: 'L' },
  { t: 27.4, actor: NEO, hand: 'L' },
  { t: 28.0, actor: TRINITY, hand: 'R' },
  { t: 31.0, actor: NEO, hand: 'R' },
  { t: 31.6, actor: TRINITY, hand: 'L' },
];

/** When the defenders are allowed to shoot back. */
export const ENEMY_FIRE_WINDOW = { t0: 14.9, t1: 33.0 };

/* ------------------------------------------------------------------ */
/* camera                                                              */
/* ------------------------------------------------------------------ */

export type LookTarget = { actor: number; off?: Vec3 } | { point: Vec3 };

export interface CamShot {
  t0: number;
  t1: number;
  /** Camera position: fixed, a dolly between two points, an orbit, or an
   *  actor-relative follow rig. */
  pos:
    | { k: 'fixed'; p: Vec3 }
    | { k: 'dolly'; a: Vec3; b: Vec3; ease?: Ease }
    | { k: 'orbit'; c: LookTarget; r0: number; r1: number; y0: number; y1: number; a0: number; a1: number }
    | { k: 'follow'; actor: number; off: Vec3; lag?: number };
  look: LookTarget | { k: 'lerp'; a: LookTarget; b: LookTarget };
  fov?: [number, number];
  /** Hand-held energy, 0..1. */
  shake?: number;
  roll?: [number, number];
}

const chest = v3(0, 1.35, 0);
const head = v3(0, 1.62, 0);

export const CAMERA: CamShot[] = [
  // 1 — the entrance, seen head-on from inside the hall
  {
    t0: 0,
    t1: 3.4,
    pos: { k: 'dolly', a: v3(0.25, 1.15, 10.4), b: v3(0.15, 1.5, 9.0), ease: 'inout' },
    look: { actor: NEO, off: chest },
    fov: [42, 40],
  },
  // 2 — low tracking side shot, the coat swinging
  {
    t0: 3.4,
    t1: 6.4,
    pos: { k: 'follow', actor: NEO, off: v3(-2.6, 0.85, -1.6) },
    look: { actor: NEO, off: v3(0, 1.05, 0) },
    fov: [38, 36],
  },
  // 3 — the checkpoint
  {
    t0: 6.4,
    t1: 9.3,
    pos: { k: 'dolly', a: v3(-3.5, 1.78, 11.6), b: v3(-2.6, 1.70, 10.5), ease: 'inout' },
    look: { k: 'lerp', a: { actor: NEO, off: head }, b: { actor: GUARD0 + 1, off: head } },
    fov: [40, 36],
  },
  // 4 — the reveal: push in on the opening coat
  {
    t0: 9.3,
    t1: 11.0,
    pos: { k: 'dolly', a: v3(-2.3, 1.55, 10.9), b: v3(-1.25, 1.28, 9.2), ease: 'inout' },
    look: { actor: NEO, off: v3(0, 1.18, 0) },
    fov: [46, 34],
  },
  // 5 — eruption, hand-held
  {
    t0: 11.0,
    t1: 12.4,
    pos: { k: 'follow', actor: NEO, off: v3(-3.5, 1.18, 3.3), lag: 0.35 },
    look: { actor: NEO, off: chest },
    fov: [44, 42],
    shake: 0.55,
  },
  // 6 — Trinity's flying kick, orbiting in slow motion
  {
    t0: 12.4,
    t1: 13.9,
    pos: { k: 'orbit', c: { actor: TRINITY, off: v3(0, 1.2, 0) }, r0: 4.0, r1: 3.2, y0: 1.1, y1: 1.9, a0: -0.55, a1: 1.35 },
    look: { actor: TRINITY, off: v3(0, 1.2, 0) },
    fov: [40, 36],
    shake: 0.12,
  },
  // 7 — the pair advance, camera retreating ahead of them
  {
    t0: 13.9,
    t1: 17.4,
    pos: { k: 'dolly', a: v3(0.4, 1.75, 14.6), b: v3(0.2, 1.85, 19.0), ease: 'inout' },
    look: { k: 'lerp', a: { actor: NEO, off: chest }, b: { actor: TRINITY, off: chest } },
    fov: [46, 44],
    shake: 0.35,
  },
  // 8 — THE CARTWHEEL, slow-motion orbit
  {
    t0: 17.4,
    t1: 19.6,
    pos: { k: 'orbit', c: { actor: NEO, off: v3(0, 1.0, 0) }, r0: 5.4, r1: 3.6, y0: 0.55, y1: 1.5, a0: -1.05, a1: 0.95 },
    look: { actor: NEO, off: v3(0, 1.0, 0) },
    fov: [42, 38],
    shake: 0.1,
  },
  // 9 — down the colonnade
  {
    t0: 19.6,
    t1: 21.9,
    pos: { k: 'dolly', a: v3(-0.6, 1.6, 22.6), b: v3(0.9, 1.5, 24.4), ease: 'inout' },
    look: { k: 'lerp', a: { actor: NEO, off: chest }, b: { actor: TRINITY, off: chest } },
    fov: [48, 46],
    shake: 0.4,
  },
  // 10 — THE WALL RUN, slow-motion orbit
  {
    t0: 21.9,
    t1: 24.2,
    pos: { k: 'orbit', c: { actor: TRINITY, off: v3(0, 1.3, 0) }, r0: 4.9, r1: 3.7, y0: 0.85, y1: 2.2, a0: -1.35, a1: -0.3 },
    look: { actor: TRINITY, off: v3(0, 1.25, 0) },
    fov: [44, 39],
    shake: 0.12,
  },
  // 11 — marble taking hits, close and low
  {
    t0: 24.2,
    t1: 26.4,
    pos: { k: 'dolly', a: v3(-7.9, 1.25, 22.2), b: v3(-7.4, 1.45, 20.2), ease: 'inout' },
    look: { actor: NEO, off: chest },
    fov: [50, 46],
    shake: 0.55,
  },
  // 12 — Trinity behind her column
  {
    t0: 26.4,
    t1: 28.9,
    pos: { k: 'follow', actor: TRINITY, off: v3(-2.7, 1.05, -2.9), lag: 0.5 },
    look: { actor: TRINITY, off: chest },
    fov: [46, 42],
    shake: 0.45,
  },
  // 13 — THE COLUMN SPIN, slow-motion orbit
  {
    t0: 28.9,
    t1: 30.7,
    pos: { k: 'orbit', c: { actor: NEO, off: v3(0, 1.15, 0) }, r0: 4.7, r1: 5.6, y0: 2.0, y1: 0.95, a0: 0.95, a1: 2.45 },
    look: { actor: NEO, off: v3(0, 1.15, 0) },
    fov: [42, 40],
    shake: 0.15,
  },
  // 14 — the final push
  {
    t0: 30.7,
    t1: 33.15,
    pos: { k: 'dolly', a: v3(1.3, 1.75, 40.8), b: v3(-0.4, 1.6, 42.6), ease: 'inout' },
    look: { k: 'lerp', a: { actor: TRINITY, off: chest }, b: { actor: NEO, off: chest } },
    fov: [50, 46],
    shake: 0.5,
  },
  // 15 — the last man falls, slow motion
  {
    t0: 33.15,
    t1: 34.6,
    pos: { k: 'orbit', c: { actor: SOLDIER0 + 15, off: v3(0, 0.9, 0) }, r0: 3.6, r1: 4.4, y0: 1.5, y1: 1.0, a0: -0.9, a1: 0.3 },
    look: { actor: SOLDIER0 + 15, off: v3(0, 0.85, 0) },
    fov: [40, 44],
    shake: 0.08,
  },
  // 16 — the slow pan across the wreckage
  {
    t0: 34.6,
    t1: 38.4,
    pos: { k: 'dolly', a: v3(-5.6, 2.1, 26.0), b: v3(5.6, 1.5, 33.0), ease: 'inout' },
    look: { k: 'lerp', a: { point: v3(-4.6, 1.6, 30.0) }, b: { point: v3(4.6, 1.4, 39.5) } },
    fov: [52, 44],
  },
  // 17 — walking out, tracking from behind
  {
    t0: 38.4,
    t1: 42.6,
    pos: { k: 'follow', actor: NEO, off: v3(2.5, 1.35, -4.6), lag: 0.8 },
    look: { k: 'lerp', a: { actor: NEO, off: chest }, b: { point: v3(0, 1.4, 47.6) } },
    fov: [44, 40],
  },
  // 18 — the elevator closes
  {
    t0: 42.6,
    t1: 45.5,
    pos: { k: 'dolly', a: v3(0.06, 1.68, 41.6), b: v3(0.03, 1.58, 43.4), ease: 'inout' },
    look: { point: v3(0, 1.3, 48.3) },
    fov: [46, 39],
  },
  // 19 — final wide on the wrecked lobby
  {
    t0: 45.5,
    t1: END_TIME,
    pos: { k: 'dolly', a: v3(0.45, 2.1, 8.6), b: v3(0.15, 3.3, 16.4), ease: 'inout' },
    look: { point: v3(0, 1.35, 40.0) },
    fov: [56, 60],
  },
];

/* ------------------------------------------------------------------ */
/* music                                                               */
/* ------------------------------------------------------------------ */

export const MUSIC_CUES = {
  /** the calm tense pulse starts with the scene */
  start: 0,
  /** the drop lands exactly on the guard's lunge for his radio */
  drop: BEAT.radioLunge,
  /** intensity holds through the shootout */
  outro: BEAT.windDown + 0.6,
} as const;

export const ELEVATOR_INTERIOR_Z = LAYOUT.elevatorZ + 0.85;
