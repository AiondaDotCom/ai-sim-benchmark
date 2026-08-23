/**
 * The choreography: a fixed, deterministic script of the whole scene.
 * Every actor's position/action is a pure function of simulation time.
 * The seed does NOT influence this file — it only varies debris/particles/
 * sound-variant selection elsewhere.
 *
 * Beats (sim seconds):
 *  0-8     entrance walk                       (calm)
 *  8-11.6  metal detector beep, coat reveal
 *  11.6-14 eruption: CQC strikes + flying kick, alarm
 *  14-18   soldiers pour in, pair advances firing
 *  19-20.2 SET PIECE 1: cartwheel dual-wield   (slow-mo 19.2-20.05)
 *  24.9-27 SET PIECE 2: wall run               (slow-mo 25.35-26.25)
 *  29.9-33 SET PIECE 3: column-cover spins, gun discards (slow-mo 31.5-32.3)
 *  33-40   final advance; last soldier drops at 39.8
 *  40-47   wind-down: settling dust, final casing, wreckage pan
 *  47-60   holster, walk to elevator, doors close, final wide shot
 */
import { V3, lerp, clamp, smooth } from './math3';

export const DURATION = 60;

export interface Pose {
  pos: V3;
  yaw: number;
  action: string;
  phase: number; // 0..1 within the action where meaningful
  speed: number; // horizontal speed (drives walk cycles)
}

// ---------------------------------------------------------------- deaths ---

export const DEATHS: Record<string, number> = {
  g0: 12.6, g1: 13.3, g2: 14.0,
  s0: 20.3, s1: 21.2, s2: 26.2, s3: 27.4,
  s4: 31.8, s5: 34.5, s6: 37.5, s7: 39.8,
};

export const DEATH_STYLE: Record<string, 'crumple' | 'slide' | 'drop'> = {
  g0: 'crumple', g1: 'drop', g2: 'crumple',
  s0: 'slide', s1: 'crumple', s2: 'drop', s3: 'crumple',
  s4: 'slide', s5: 'crumple', s6: 'drop', s7: 'crumple',
};

/** Which protagonist's shot kills each soldier (guards die to melee). */
export const KILLERS: Record<string, 'neo' | 'trin'> = {
  s0: 'neo', s1: 'neo', s2: 'trin', s3: 'trin',
  s4: 'neo', s5: 'trin', s6: 'neo', s7: 'trin',
};

// ------------------------------------------------------------- slow-mo -----

interface SlowmoWindow { t0: number; t1: number; scale: number }
export const SLOWMO: SlowmoWindow[] = [
  { t0: 15.06, t1: 15.3, scale: 0.05 }, // A5: muzzle-exit insert
  { t0: 19.2, t1: 20.05, scale: 0.18 },
  { t0: 20.55, t1: 20.95, scale: 0.12 }, // A5: casing close-up insert
  { t0: 23.45, t1: 24.15, scale: 0.12 }, // A5: bullet-dodge set piece
  { t0: 25.35, t1: 26.25, scale: 0.2 },
  { t0: 31.5, t1: 32.3, scale: 0.2 },
];
const EASE = 0.18;

/** Choreographed time scale (1 = real time). Smooth eased edges. */
export function timeScaleAt(t: number): number {
  for (const w of SLOWMO) {
    if (t >= w.t0 - EASE && t <= w.t1 + EASE) {
      const fadeIn = smooth(w.t0 - EASE, w.t0, t);
      const fadeOut = 1 - smooth(w.t1, w.t1 + EASE, t);
      const k = Math.min(fadeIn, fadeOut);
      return lerp(1, w.scale, k);
    }
  }
  return 1;
}

// ------------------------------------------------------------------ cues ---

export interface Cue { t: number; type: string; actor?: string; pos?: V3 }
export const CUES: Cue[] = [
  { t: 8.0, type: 'BEEP' },
  { t: 9.7, type: 'COAT' },
  { t: 12.4, type: 'STRIKE', actor: 'neo' },
  { t: 12.65, type: 'STRIKE', actor: 'neo' },
  { t: 13.15, type: 'KICK', actor: 'trin' },
  { t: 13.5, type: 'ALARM' },
  { t: 13.85, type: 'STRIKE', actor: 'neo' },
  { t: 14.05, type: 'STRIKE', actor: 'neo' },
  { t: 14.7, type: 'DRAW', actor: 'neo' },
  { t: 15.0, type: 'DRAW', actor: 'trin' },
  { t: 16.6, type: 'ALARM' },
  { t: 30.05, type: 'GUN_DROP', actor: 'neo' },
  { t: 30.25, type: 'GUN_DROP', actor: 'neo' },
  { t: 30.6, type: 'DRAW', actor: 'neo' },
  { t: 33.15, type: 'GUN_DROP', actor: 'trin' },
  { t: 33.6, type: 'DRAW', actor: 'trin' },
  { t: 46.6, type: 'HOLSTER' },
  { t: 51.5, type: 'ELEVATOR' },
];

/** Elevator center door open fraction 0..1. */
export function elevatorDoorAt(t: number): number {
  return smooth(51.6, 52.6, t) * (1 - smooth(54.6, 55.8, t));
}

/** Entrance door swing fraction (two pushes: man, then woman). */
export function entranceDoorAt(t: number): number {
  const a = smooth(0.15, 0.7, t) * (1 - smooth(1.0, 1.8, t));
  const b = smooth(1.5, 2.0, t) * (1 - smooth(2.3, 3.1, t));
  return Math.max(a, b);
}

// ------------------------------------------------------------- helpers -----

function seg(t: number, t0: number, t1: number): number {
  return clamp((t - t0) / (t1 - t0), 0, 1);
}

function yawTo(from: V3, to: V3): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function walkPose(
  t: number, t0: number, t1: number,
  from: [number, number], to: [number, number],
  action = 'walk',
): Pose {
  const k = seg(t, t0, t1);
  const x = lerp(from[0], to[0], k);
  const z = lerp(from[1], to[1], k);
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const dist = Math.hypot(dx, dz);
  const speed = dist / (t1 - t0);
  return {
    pos: [x, 0, z],
    yaw: Math.atan2(dx, dz),
    action,
    phase: k,
    speed,
  };
}

const still = (x: number, z: number, yaw: number, action: string, phase = 0): Pose => ({
  pos: [x, 0, z], yaw, action, phase, speed: 0,
});

const FACE_ELEV = Math.PI; // walking toward -Z
const FACE_DOOR = 0;

// ------------------------------------------------------- protagonists ------

export function neoPose(t: number): Pose {
  if (t < 0.8) return still(0, 17.4, FACE_ELEV, 'idle');
  if (t < 6.4) return walkPose(t, 0.8, 6.4, [0, 17.4], [0, 10.9]);
  if (t < 7.4) return still(0, 10.9, FACE_ELEV, 'idle');
  if (t < 8.3) return walkPose(t, 7.4, 8.3, [0, 10.9], [0, 9.55]);
  if (t < 9.5) return still(0, 9.55, Math.atan2(0.75, 0.65), 'talk', seg(t, 8.3, 9.5));
  if (t < 11.6) return still(0, 9.55, Math.atan2(0.75, 0.65), 'reveal', seg(t, 9.5, 11.6));
  if (t < 12.2) return still(0, 9.55, Math.atan2(0.75, 0.65), 'idle');
  if (t < 12.9) {
    const p = walkPose(t, 12.2, 12.5, [0, 9.55], [0.72, 9.6], 'strike');
    p.phase = seg(t, 12.2, 12.9);
    p.yaw = Math.atan2(1, 0.2);
    return p;
  }
  if (t < 13.6) return walkPose(t, 12.9, 13.6, [0.72, 9.6], [1.65, 10.0]);
  if (t < 14.3) return still(1.65, 10.0, Math.atan2(1, 0.6), 'strike', seg(t, 13.6, 14.3));
  if (t < 15.0) {
    const p = walkPose(t, 14.3, 15.0, [1.65, 10.0], [0.2, 8.8]);
    if (t > 14.6) p.action = 'draw';
    return p;
  }
  if (t < 18.4) return walkPose(t, 15.0, 18.4, [0.2, 8.8], [-1.3, 4.6], 'shootAdvance');
  if (t < 18.95) return still(-1.5, 4.5, FACE_ELEV, 'crouchFire', seg(t, 18.4, 18.95));
  if (t < 20.25) {
    // Cartwheel across the open floor, dual-wield firing.
    const k = seg(t, 18.95, 20.25);
    return {
      pos: [lerp(-1.5, 1.7, k), 0, lerp(4.5, 3.9, k)],
      yaw: FACE_ELEV,
      action: 'cartwheel',
      phase: k,
      speed: 2.4,
    };
  }
  if (t < 21.1) return still(1.7, 3.9, FACE_ELEV, 'crouchFire', seg(t, 20.25, 21.1));
  if (t < 22.6) return walkPose(t, 21.1, 22.6, [1.7, 3.9], [2.5, 2.75]);
  if (t < 23.2) {
    const cyc = t - 22.6;
    const lean = smooth(0, 0.25, cyc) * (1 - smooth(0.45, 0.6, cyc));
    return { pos: [2.52, 0, 2.75], yaw: FACE_ELEV, action: 'coverR', phase: lean, speed: 0 };
  }
  if (t < 24.6) {
    // A5 SET PIECE: steps into the open and leans back under passing fire.
    const k = seg(t, 23.2, 24.6);
    const mix = Math.max(0, smooth(0, 0.16, k) - smooth(0.8, 1, k));
    return {
      pos: [lerp(2.52, DODGE_POS[0], mix), 0, lerp(2.75, DODGE_POS[1], mix)],
      yaw: FACE_ELEV,
      action: 'dodge',
      phase: k,
      speed: 0,
    };
  }
  if (t < 29.9) {
    // Cover behind column at (3.5, 2): lean out cycles.
    const cyc = (t - 24.6) % 2.4;
    const lean = cyc < 1.1 ? smooth(0, 0.3, cyc) * (1 - smooth(0.85, 1.1, cyc)) : 0;
    return { pos: [2.52, 0, 2.75], yaw: FACE_ELEV, action: 'coverR', phase: lean, speed: 0 };
  }
  if (t < 30.8) return still(2.52, 2.75, FACE_ELEV, 'discard', seg(t, 29.9, 30.8));
  if (t < 33.4) {
    const cyc = (t - 30.8) % 1.6;
    const lean = smooth(0, 0.35, cyc) * (1 - smooth(1.2, 1.6, cyc));
    return { pos: [2.52, 0, 2.75], yaw: FACE_ELEV, action: 'coverR', phase: lean, speed: 0 };
  }
  if (t < 40.0) return walkPose(t, 33.4, 40.0, [2.5, 2.75], [0.8, -5.6], 'shootAdvance');
  if (t < 41.5) return still(0.8, -5.6, FACE_ELEV, 'lower', seg(t, 40, 41.5));
  if (t < 46.4) return still(0.8, -5.6, FACE_ELEV, 'survey', seg(t, 41.5, 46.4));
  if (t < 47.4) return still(0.8, -5.6, FACE_ELEV, 'holster', seg(t, 46.4, 47.4));
  if (t < 51.9) return walkPose(t, 47.4, 51.9, [0.8, -5.6], [0.55, -16.8]);
  if (t < 52.6) return still(0.55, -16.8, FACE_ELEV, 'idle');
  if (t < 53.8) return walkPose(t, 52.6, 53.8, [0.55, -16.8], [0.5, -18.75]);
  if (t < 54.4) return still(0.5, -18.75, lerp(FACE_ELEV, 0, seg(t, 53.8, 54.4)), 'idle');
  return still(0.5, -18.75, FACE_DOOR, 'idle');
}

export function trinPose(t: number): Pose {
  if (t < 1.6) return still(-0.9, 17.9, FACE_ELEV, 'idle');
  if (t < 7.0) return walkPose(t, 1.6, 7.0, [-0.9, 17.9], [-0.9, 11.6]);
  if (t < 12.9) return still(-0.9, 11.6, FACE_ELEV, 'idle', seg(t, 7, 12.9));
  if (t < 13.45) {
    // Dash + flying kick at guard g1.
    const k = seg(t, 12.9, 13.45);
    return {
      pos: [lerp(-0.9, -1.75, k), 0, lerp(11.6, 8.45, k)],
      yaw: yawTo([-0.9, 0, 11.6], [-1.75, 0, 8.45]),
      action: 'kick',
      phase: k,
      speed: 6,
    };
  }
  if (t < 14.2) return still(-1.75, 8.45, FACE_ELEV, 'land', seg(t, 13.45, 14.2));
  if (t < 15.2) {
    const p = walkPose(t, 14.2, 15.2, [-1.75, 8.45], [-0.8, 9.0]);
    if (t > 14.9) p.action = 'draw';
    return p;
  }
  if (t < 18.4) return walkPose(t, 15.2, 18.4, [-0.8, 9.0], [-1.6, 5.2], 'shootAdvance');
  if (t < 19.6) return walkPose(t, 18.4, 19.6, [-1.6, 5.2], [-2.5, 2.9]);
  if (t < 23.4) {
    const cyc = (t - 19.6) % 2.2;
    const lean = smooth(0, 0.3, cyc) * (1 - smooth(0.9, 1.2, cyc));
    return { pos: [-2.52, 0, 2.9], yaw: FACE_ELEV, action: 'coverL', phase: lean, speed: 0 };
  }
  if (t < 24.9) return walkPose(t, 23.4, 24.9, [-2.5, 2.9], [-6.9, 2.3]);
  if (t < 26.75) {
    // Wall run along the left wall (x=-8): elevated, tilted, firing mid-run.
    const k = seg(t, 24.9, 26.75);
    const h = Math.sin(Math.PI * clamp(k * 1.15, 0, 1)) * 1.5;
    return {
      pos: [-7.25, Math.max(0, h), lerp(2.2, -1.4, k)],
      yaw: FACE_ELEV,
      action: 'wallrun',
      phase: k,
      speed: 3.4,
    };
  }
  if (t < 27.6) return still(-6.7, -1.9, FACE_ELEV, 'crouchFire', seg(t, 26.75, 27.6));
  if (t < 29.4) return walkPose(t, 27.6, 29.4, [-6.7, -1.9], [-2.55, -2.9]);
  if (t < 33.0) {
    const cyc = (t - 29.4) % 1.9;
    const lean = smooth(0, 0.3, cyc) * (1 - smooth(1.1, 1.5, cyc));
    return { pos: [-2.55, 0, -2.9], yaw: FACE_ELEV, action: 'coverL', phase: lean, speed: 0 };
  }
  if (t < 33.9) return still(-2.55, -2.9, FACE_ELEV, 'discard', seg(t, 33, 33.9));
  if (t < 40.0) return walkPose(t, 33.9, 40.0, [-2.55, -2.9], [-0.7, -5.8], 'shootAdvance');
  if (t < 41.5) return still(-0.7, -5.8, FACE_ELEV, 'lower', seg(t, 40, 41.5));
  if (t < 46.4) return still(-0.7, -5.8, FACE_ELEV, 'survey', seg(t, 41.5, 46.4));
  if (t < 47.4) return still(-0.7, -5.8, FACE_ELEV, 'holster', seg(t, 46.4, 47.4));
  if (t < 51.9) return walkPose(t, 47.4, 51.9, [-0.7, -5.8], [-0.55, -16.8]);
  if (t < 52.6) return still(-0.55, -16.8, FACE_ELEV, 'idle');
  if (t < 53.8) return walkPose(t, 52.6, 53.8, [-0.55, -16.8], [-0.4, -18.75]);
  if (t < 54.4) return still(-0.4, -18.75, lerp(FACE_ELEV, 0, seg(t, 53.8, 54.4)), 'idle');
  return still(-0.4, -18.75, FACE_DOOR, 'idle');
}

// ------------------------------------------------------------- defenders ---

interface GuardDef { id: string; }
export const GUARDS: GuardDef[] = [{ id: 'g0' }, { id: 'g1' }, { id: 'g2' }];

function guardLivePose(id: string, t: number): Pose {
  switch (id) {
    case 'g0': {
      if (t < 8.2) return still(1.55, 9.6, Math.atan2(-1, 0.3), 'idle');
      if (t < 9.2) return walkPose(t, 8.2, 9.2, [1.55, 9.6], [0.75, 10.2]);
      if (t < 12.2) return still(0.75, 10.2, Math.atan2(-0.75, -0.65), 'talk', seg(t, 9.2, 12.2));
      // Lunge for the desk radio.
      return walkPose(t, 12.2, 12.6, [0.75, 10.2], [1.7, 10.1], 'lunge');
    }
    case 'g1': {
      if (t < 12.8) return still(-2.2, 7.8, FACE_DOOR, 'idle');
      return walkPose(t, 12.8, 13.3, [-2.2, 7.8], [-1.9, 8.3], 'alert');
    }
    default: {
      if (t < 13.2) return still(3.05, 11.3, Math.atan2(-1, -0.4), 'idle');
      return walkPose(t, 13.2, 14.0, [3.05, 11.3], [2.3, 10.15], 'alert');
    }
  }
}

// -------------------------------------------------------------- soldiers ---

export interface SoldierDef {
  id: string;
  door: [number, number];
  cover: [number, number];
  /** Which column shields them (index into COLUMNS) — used for lean + slide. */
  colIndex: number;
  /** Lean direction sign on X when firing. */
  leanSign: number;
  enterT: number;
}

export const SOLDIERS: SoldierDef[] = [
  { id: 's0', door: [-6.8, -17.3], cover: [-2.45, -4.75], colIndex: 2, leanSign: 1, enterT: 14.0 },
  { id: 's1', door: [6.8, -17.3], cover: [2.45, -4.75], colIndex: 6, leanSign: -1, enterT: 14.2 },
  { id: 's2', door: [-6.8, -17.3], cover: [-4.55, -4.75], colIndex: 2, leanSign: -1, enterT: 14.4 },
  { id: 's3', door: [6.8, -17.3], cover: [4.55, -4.75], colIndex: 6, leanSign: 1, enterT: 14.6 },
  { id: 's4', door: [-6.8, -17.3], cover: [-2.45, -10.75], colIndex: 3, leanSign: 1, enterT: 14.8 },
  { id: 's5', door: [6.8, -17.3], cover: [2.45, -10.75], colIndex: 7, leanSign: -1, enterT: 15.0 },
  { id: 's6', door: [-6.8, -17.3], cover: [-4.55, -10.75], colIndex: 3, leanSign: -1, enterT: 15.2 },
  { id: 's7', door: [6.8, -17.3], cover: [4.55, -10.75], colIndex: 7, leanSign: 1, enterT: 15.4 },
];

/** Deterministic burst start times for a soldier (while alive). */
export function soldierBursts(def: SoldierDef): number[] {
  const death = DEATHS[def.id];
  const idx = SOLDIERS.indexOf(def);
  const start = 16.4 + idx * 0.31;
  const period = 2.1 + (idx % 3) * 0.27;
  const out: number[] = [];
  for (let t = start; t < Math.min(death - 0.25, 40); t += period) out.push(t);
  return out;
}

function soldierLivePose(def: SoldierDef, t: number): Pose {
  const arriveT = def.enterT + 2.1;
  if (t < def.enterT) return still(def.door[0], def.door[1], FACE_DOOR, 'hidden');
  if (t < arriveT) return walkPose(t, def.enterT, arriveT, def.door, def.cover, 'run');
  // In cover, crouched; lean out around burst times.
  let lean = 0;
  for (const b of soldierBursts(def)) {
    if (t >= b - 0.35 && t <= b + 0.75) {
      lean = smooth(b - 0.35, b - 0.05, t) * (1 - smooth(b + 0.5, b + 0.75, t));
      break;
    }
  }
  return { pos: [def.cover[0], 0, def.cover[1]], yaw: FACE_DOOR, action: 'cover', phase: lean, speed: 0 };
}

// --------------------------------------------------------- death overlay ---

function applyDeath(id: string, t: number, live: (tt: number) => Pose): Pose {
  const death = DEATHS[id];
  if (death === undefined || t < death) return live(t);
  const style = DEATH_STYLE[id];
  const base = live(death - 0.001);
  const k = clamp((t - death) / 1.1, 0, 1);
  return { ...base, action: `fall_${style}`, phase: k, speed: 0 };
}

export function guardPose(id: string, t: number): Pose {
  return applyDeath(id, t, (tt) => guardLivePose(id, tt));
}

export function soldierPose(def: SoldierDef, t: number): Pose {
  return applyDeath(def.id, t, (tt) => soldierLivePose(def, tt));
}

// ----------------------------------------------------------- fire plans ----

export interface PlannedShot {
  t: number;
  shooter: 'neo' | 'trin';
  /** Soldier id if this is a scripted kill shot. */
  kill?: string;
  /** true = fired from left hand (dual wielding). */
  left?: boolean;
}

function fillShots(
  out: PlannedShot[], shooter: 'neo' | 'trin',
  t0: number, t1: number, interval: number, dual = false,
) {
  let left = false;
  for (let t = t0; t < t1; t += interval) {
    out.push({ t, shooter, left });
    if (dual) left = !left;
  }
}

function buildShotPlan(): PlannedShot[] {
  const out: PlannedShot[] = [];
  fillShots(out, 'neo', 15.1, 18.3, 0.5, true); // first round inside the muzzle insert
  fillShots(out, 'neo', 19.0, 20.2, 0.21, true); // cartwheel
  fillShots(out, 'neo', 20.4, 21.0, 0.4, true);
  fillShots(out, 'neo', 22.8, 23.15, 0.35); // pauses for the dodge
  fillShots(out, 'neo', 24.9, 29.7, 0.62);
  fillShots(out, 'neo', 31.0, 33.3, 0.42);
  fillShots(out, 'neo', 33.6, 39.7, 0.48, true);
  fillShots(out, 'trin', 15.3, 18.3, 0.55);
  fillShots(out, 'trin', 19.8, 23.3, 0.6);
  fillShots(out, 'trin', 25.0, 26.7, 0.28); // wall run
  fillShots(out, 'trin', 26.9, 27.5, 0.3);
  fillShots(out, 'trin', 29.6, 32.9, 0.55);
  fillShots(out, 'trin', 33.8, 39.7, 0.5);
  // Scripted kill shots (slightly before the death moment).
  for (const sid of Object.keys(KILLERS)) {
    out.push({ t: DEATHS[sid] - 0.1, shooter: KILLERS[sid], kill: sid });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export const SHOT_PLAN: PlannedShot[] = buildShotPlan();

/** A5 bullet-dodge set piece: where the man stands, and the scripted volley
 *  of near-miss rounds that carry visible air wakes. */
export const DODGE_POS: [number, number] = [1.35, 3.3];
export const DODGE_SHOT_TIMES = [23.42, 23.58, 23.76, 23.94];

/** Extra debris trickling down from damaged surfaces during the wind-down. */
export const SETTLE_TIMES = [40.8, 41.7, 42.9, 44.2];
/** One last casing dropped, spinning to rest, during near-silence. */
export const FINAL_CASING_T = 42.0;
