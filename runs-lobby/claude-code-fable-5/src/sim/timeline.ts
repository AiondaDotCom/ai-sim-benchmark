import { settleClearOfSet, nearestSurfaceContact } from './layout';
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

/**
 * A13: which face the closing tile comes off.
 *
 * The final wide sits at the entrance end (x ~ 1.8, z ~ 12) looking down the
 * hall, so the near column on the right is the one the eye is already on, and
 * its INWARD face is the one turned toward that camera. Chosen by measurement
 * rather than by guess: at t=55 that face has four tiles eroded into the
 * loose-but-not-gone band, the most of any face the closing shot can see. The
 * obvious first guess, the near column's +z face, turned out to take no fire
 * at all during the fight.
 */
/**
 * A15: the deployment beat.
 *
 * The squad floods in and fans out to cover, the leader shouts one word, and
 * then there is a genuine pause before the pair move. The whole beat is fitted
 * INTO the existing 14-19 s window rather than inserted, so no time is added:
 * the music is a single track played against simulation time, so stretching
 * the sequence anywhere would slide the drop. The kill order (DEATHS) and
 * every beat from 20.3 onward are untouched.
 */
export const DEPLOY_T0 = 14.0;
/** The last man is in cover; the leader shouts. */
export const COMMAND_T = 17.65;
/** Held standoff: weapons trained, nobody fires. */
export const STANDOFF: [number, number] = [17.7, 18.95];
/** The break — the man fires and moves in the same instant. */
export const BREAK_T = 19.0;

/**
 * B26: the closing gag has to happen ON CAMERA.
 *
 * The face was previously chosen from the damage data — most tiles in the
 * loose-but-not-gone band among the faces the closing camera can see — and the
 * tile that fell turned out to be in the cluttered gap between the two
 * right-hand columns: occluded, distant and unreadable. A gag nobody sees is
 * not a gag.
 *
 * Chosen from the FRAME instead. Measured against the actual closing camera by
 * projecting every cladding face and then confirming visually with a tint
 * pass: the near-left column presents both of its camera-facing sides fully in
 * shot and unobstructed. Its +z side is the wider of the two but takes no
 * aimed fire all fight — no defender uses column 1 as cover — so it ends the
 * sequence undamaged and has nothing to drop. Its +x side is narrower in frame
 * but still squarely visible, is chewed to 24.6% by the fight as it stands,
 * and carries a loose tile at v = 2.48 m: the upper-middle of the column,
 * which is exactly where the eye is directed.
 *
 * So the order below is a frame-visibility ranking, not a damage ranking. The
 * camera did not have to move and no fire had to be staged to make it happen.
 */
/**
 * B28: melee timing. A punch lands essentially on its cue; a flying kick
 * leaves the ground well before it connects — measured, the kick cue at 13.15
 * still has 1.9 m to cross and does not reach the guard until 13.30. The
 * reaction then follows the impact rather than sharing a frame with it.
 */
export const STRIKE_CONTACT_DELAY = 0.02;
export const KICK_CONTACT_DELAY = 0.15;
export const MELEE_REACT_DELAY = 0.11;

export const GAG_SLAB = ['col1#px', 'col0#px', 'col4#nx', 'col4#nz', 'col5#nx'];

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
  // A15 supplement: the squad is roughly doubled so the deployment fills the
  // frame and the fight has enough bodies to sustain the advance. The extra
  // eight are interleaved into the SAME window — the last man still goes down
  // at 39.8, so the wind-down and everything after it are untouched.
  s8: 22.0, s9: 23.4, s10: 24.6, s11: 28.6,
  s12: 30.4, s13: 33.0, s14: 35.8, s15: 38.6,
};

export const DEATH_STYLE: Record<string, 'crumple' | 'slide' | 'drop' | 'knockback' | 'sprawl'> = {
  g0: 'crumple', g1: 'drop', g2: 'crumple',
  s0: 'slide', s1: 'crumple', s2: 'drop', s3: 'crumple',
  // B21: the last man takes the bullet-cam round and is thrown into the
  // stone behind him — his own reaction, distinct from the other three
  s4: 'slide', s5: 'crumple', s6: 'drop', s7: 'knockback',
  s8: 'drop', s9: 'slide', s10: 'crumple', s11: 'drop',
  s12: 'crumple', s13: 'slide', s14: 'drop', s15: 'slide',
};

/** Which protagonist's shot kills each soldier (guards die to melee). */
export const KILLERS: Record<string, 'neo' | 'trin'> = {
  s0: 'neo', s1: 'neo', s2: 'trin', s3: 'trin',
  s4: 'neo', s5: 'trin', s6: 'neo', s7: 'trin',
  s8: 'trin', s9: 'neo', s10: 'neo', s11: 'trin',
  s12: 'neo', s13: 'trin', s14: 'trin', s15: 'neo',
};

// ------------------------------------------------------------- slow-mo -----

interface SlowmoWindow { t0: number; t1: number; scale: number }
export const SLOWMO: SlowmoWindow[] = [
  { t0: 18.96, t1: 19.16, scale: 0.05 }, // A5: muzzle-exit insert, on the A15 break
  { t0: 19.2, t1: 20.05, scale: 0.18 },
  // A5/A7: casing close-up, held until the followed casing has bounced
  // to rest on the marble (it settles at t=21.95).
  { t0: 20.55, t1: 21.98, scale: 0.28 },
  { t0: 23.45, t1: 24.15, scale: 0.12 }, // A5: bullet-dodge set piece
  { t0: 25.35, t1: 26.25, scale: 0.2 },
  { t0: 31.5, t1: 32.3, scale: 0.2 },
  // A7/B21: bullet-cam on the last kill.
  //
  // The round crosses 4.4 m in 50 ms of sim time. The old single window began
  // at 39.69 and ended at 39.762, which is BEFORE the round lands — so the
  // ride was over in 38 ms of sim and the shot had already cut wide by 39.74,
  // which is exactly the frame the defect report captured. It now opens
  // earlier, so the round is seen leaving the muzzle, and runs through the
  // impact; the second window carries the knock-back at a lighter scale so the
  // hit reads without the beat dragging.
  { t0: 39.63, t1: 39.80, scale: 0.03 },
  { t0: 39.80, t1: 39.99, scale: 0.10 },
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

export interface Cue { t: number; type: string; actor?: string; pos?: V3; line?: string }
export const CUES: Cue[] = [
  { t: 8.0, type: 'BEEP' },
  // ---- A10 voice lines. All original generic security phrasing; each is
  // placed so it lands inside the beat it belongs to (see VO_LINES below).
  { t: 8.25, type: 'VO', line: 'vo_checkpoint_1' },
  { t: 10.5, type: 'VO', line: 'vo_checkpoint_2' },
  { t: 12.0, type: 'VO', line: 'vo_hands' },
  { t: 13.55, type: 'VO', line: 'vo_radio_backup' },
  { t: 14.6, type: 'VO', line: 'vo_go' },
  { t: 17.65, type: 'VO', line: 'vo_freeze' },
  { t: 15.6, type: 'VO', line: 'vo_takecover' },
  { t: 16.6, type: 'VO', line: 'vo_leftflank' },
  { t: 24.6, type: 'VO', line: 'vo_reloading' },
  { t: 27.6, type: 'VO', line: 'vo_column' },
  { t: 41.8, type: 'VO', line: 'vo_lobbypost' },
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
  // B10: the pair discard emptied guns repeatedly across the advance, not
  // three times in sixty seconds. Each discard sits in a lull in THAT
  // character's fire and is followed by a fresh draw.
  { t: 21.35, type: 'GUN_DROP', actor: 'neo' },
  { t: 21.75, type: 'DRAW', actor: 'neo' },
  { t: 22.2, type: 'GUN_DROP', actor: 'trin' },
  { t: 22.6, type: 'DRAW', actor: 'trin' },
  { t: 25.6, type: 'GUN_DROP', actor: 'neo' },
  { t: 26.0, type: 'DRAW', actor: 'neo' },
  { t: 27.0, type: 'GUN_DROP', actor: 'trin' },
  { t: 27.4, type: 'DRAW', actor: 'trin' },
  { t: 28.4, type: 'GUN_DROP', actor: 'neo' },
  { t: 28.8, type: 'DRAW', actor: 'neo' },
  { t: 30.05, type: 'GUN_DROP', actor: 'neo' },
  { t: 30.25, type: 'GUN_DROP', actor: 'neo' },
  { t: 30.6, type: 'DRAW', actor: 'neo' },
  { t: 31.5, type: 'GUN_DROP', actor: 'trin' },
  { t: 31.9, type: 'DRAW', actor: 'trin' },
  { t: 33.15, type: 'GUN_DROP', actor: 'trin' },
  { t: 33.6, type: 'DRAW', actor: 'trin' },
  { t: 35.4, type: 'GUN_DROP', actor: 'neo' },
  { t: 35.8, type: 'DRAW', actor: 'neo' },
  { t: 37.2, type: 'GUN_DROP', actor: 'trin' },
  { t: 37.6, type: 'DRAW', actor: 'trin' },
  { t: 38.6, type: 'GUN_DROP', actor: 'neo' },
  { t: 39.0, type: 'DRAW', actor: 'neo' },
  { t: 46.6, type: 'HOLSTER' },
  { t: 51.5, type: 'ELEVATOR' },
  // A13: the closing gag. The hall is empty and quiet; one last loosened tile
  // gives way on its own, falls and shatters, and then it is quiet again.
  { t: 55.4, type: 'TILE_GAG' },
  // The cue loop walks this list with a monotonic index, so it MUST be sorted
  // by time. Sorting here rather than relying on the literal being in order:
  // inserting the A10 voice lines out of order silently stopped every later
  // cue — the coat reveal, the draws, the gun drops, the elevator.
].sort((a, b) => a.t - b.t);

/**
 * B7: the metal detector's red alarm lamp. Its pulse train is the pulse train
 * of the generated alarm asset (7 beeps, 148 ms on, 294 ms apart — measured
 * from public/assets/sfx/beep.mp3, see ASSETS.md), so lamp and sound cannot
 * drift apart. Starts on the BEEP cue at t=8.0.
 */
export const DETECTOR_ALARM = {
  t0: 8.0,
  period: 0.294,
  on: 0.148,
  pulses: 7,
  /** after the beeps, a slow ember pulse carries the red into the eruption */
  emberUntil: 13.5,
  emberPeriod: 1.1,
};

/** Detector alarm lamp brightness 0..1 at scene time t. */
export function detectorLampAt(t: number): number {
  const a = DETECTOR_ALARM;
  const dt = t - a.t0;
  if (dt < 0) return 0;
  const k = Math.floor(dt / a.period);
  if (k < a.pulses) {
    const within = dt - k * a.period;
    if (within > a.on) return 0;
    // hard attack, slight decay across the pulse
    return 1 - 0.3 * (within / a.on);
  }
  if (t >= a.emberUntil) return 0;
  // slow, dim pulse holding the red through the eruption
  const phase = ((t - (a.t0 + a.pulses * a.period)) % a.emberPeriod) / a.emberPeriod;
  const fade = 1 - smooth(a.emberUntil - 1.2, a.emberUntil, t);
  return 0.34 * fade * Math.max(0, 1 - Math.abs(phase - 0.15) * 5);
}

/**
 * A10: every spoken line, with the beat window it has to land inside. The
 * windows are asserted in tests so a later timing change cannot silently move
 * a line off its beat.
 */
export const VO_LINES: {
  line: string; t: number; beat: [number, number]; radio: boolean; duck: number;
}[] = [
  // checkpoint: he must still be standing in the detector frame
  { line: 'vo_checkpoint_1', t: 8.25, beat: [8.0, 11.6], radio: false, duck: 0.45 },
  { line: 'vo_checkpoint_2', t: 10.5, beat: [8.0, 11.6], radio: false, duck: 0.35 },
  // eruption
  { line: 'vo_hands', t: 12.0, beat: [11.6, 14.0], radio: false, duck: 0 },
  // radio call on the alarm
  { line: 'vo_radio_backup', t: 13.55, beat: [13.5, 18.0], radio: true, duck: 0.2 },
  // reinforcements storming in (first soldier enters at 14.0)
  { line: 'vo_go', t: 14.6, beat: [14.0, 19.0], radio: false, duck: 0 },
  { line: 'vo_takecover', t: 15.6, beat: [14.0, 19.0], radio: false, duck: 0 },
  { line: 'vo_leftflank', t: 16.6, beat: [14.0, 19.0], radio: false, duck: 0 },
  // A15: one word, shouted, and then silence. It ducks the music hard because
  // the held beat after it is the point — the command has to land clean.
  { line: 'vo_freeze', t: 17.65, beat: [14.0, 19.0], radio: false, duck: 0.88 },
  // mid-fight
  { line: 'vo_reloading', t: 24.6, beat: [19.0, 39.8], radio: false, duck: 0 },
  { line: 'vo_column', t: 27.6, beat: [19.0, 39.8], radio: false, duck: 0 },
  // the unanswered call in the quiet after the last soldier drops
  { line: 'vo_lobbypost', t: 41.8, beat: [40.2, 46.6], radio: true, duck: 0.3 },
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
  // A9: ease in and out of every walk leg. Linear legs started and stopped
  // dead, which is the single most animatronic thing in the whole scene.
  const e = easeInOut(k);
  const x = lerp(from[0], to[0], e);
  const z = lerp(from[1], to[1], e);
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const dist = Math.hypot(dx, dz);
  // instantaneous speed of the eased motion, so the stride cycle matches
  const speed = (dist / (t1 - t0)) * easeInOutD(k);
  return {
    pos: [x, 0, z],
    yaw: Math.atan2(dx, dz),
    action,
    phase: k,
    speed,
  };
}

// ------------------------------------------------- animation shaping (A9) ---
// All pure functions of the choreography clock, so the replay hash is
// unaffected and the beat times below are untouched.

/** Classic ease-in-out; velocity starts and ends at zero. */
const easeInOut = (p: number): number => {
  const k = clamp(p, 0, 1);
  return k * k * (3 - 2 * k);
};
/** d/dp of easeInOut, so reported speed matches the eased motion. */
const easeInOutD = (p: number): number => {
  const k = clamp(p, 0, 1);
  return 6 * k * (1 - k);
};
/**
 * Anticipation + overshoot: dips slightly below 0 before the move starts and
 * past 1 before settling back. Poses that read `phase` as an angle or a blend
 * get a real counter-move and a settle out of it for free.
 */
const antic = (p: number, back = 0.16): number => {
  const k = clamp(p, 0, 1);
  // one half-sine of counter-motion over the first quarter of the move...
  const pre = Math.sin(Math.PI * clamp(k / 0.25, 0, 1));
  // ...and a smaller one past the end over the last quarter
  const post = Math.sin(Math.PI * clamp((k - 0.75) / 0.25, 0, 1));
  return k - back * pre + back * 0.62 * post;
};
/** Damped oscillation used to settle a limb after an explosive move. */
const settle = (p: number, freq = 3.2, damp = 5.5): number => {
  const k = clamp(p, 0, 1);
  return Math.exp(-damp * k) * Math.sin(freq * Math.PI * k);
};

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
    // Cartwheel across the open floor, dual-wield firing. The phase is shaped
    // so the body counter-rotates a little before it commits and overshoots
    // past the landing before settling (A9).
    const k = seg(t, 18.95, 20.25);
    const a = antic(k, 0.16);
    return {
      pos: [lerp(-1.5, 1.7, easeInOut(k)), 0, lerp(4.5, 3.9, easeInOut(k))],
      yaw: FACE_ELEV,
      action: 'cartwheel',
      phase: a,
      speed: 2.4 * easeInOutD(k),
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
      // a touch of counter-lean before he drops back, and a damped settle as
      // he comes upright again (A9)
      phase: k + 0.05 * settle(k, 2.4, 6.5),
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
  if (t < 53.8) return walkPose(t, 52.6, 53.8, [0.55, -16.8], [0.26, -18.7]);
  if (t < 54.4) return still(0.26, -18.7, lerp(FACE_ELEV, 0, seg(t, 53.8, 54.4)), 'idle');
  return still(0.26, -18.7, FACE_DOOR, 'idle');
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
    // B3 wall run along the left wall (x=-8): body fully horizontal, boots
    // on the wall surface (root = foot contact point AT the wall), firing
    // across the hall mid-run.
    const k = seg(t, 24.9, 26.75);
    const h = Math.sin(Math.PI * clamp(k * 1.15, 0, 1)) * 1.5;
    return {
      pos: [-7.92, Math.max(0, h), lerp(2.2, -1.4, k)],
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
  if (t < 53.8) return walkPose(t, 52.6, 53.8, [-0.55, -16.8], [-0.26, -18.7]);
  if (t < 54.4) return still(-0.26, -18.7, lerp(FACE_ELEV, 0, seg(t, 53.8, 54.4)), 'idle');
  return still(-0.26, -18.7, FACE_DOOR, 'idle');
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
  // A15 supplement: the second half of the squad. Their cover is BEHIND and
  // outboard of the first rank rather than in front of it — a forward rank
  // would have put men between the two protagonists and put the no-friendly-
  // fire invariant at risk for the sake of a wider spread.
  { id: 's8', door: [-6.8, -17.3], cover: [-2.45, -7.75], colIndex: 3, leanSign: 1, enterT: 14.1 },
  { id: 's9', door: [6.8, -17.3], cover: [2.45, -7.75], colIndex: 7, leanSign: -1, enterT: 14.3 },
  { id: 's10', door: [-6.8, -17.3], cover: [-4.55, -7.75], colIndex: 3, leanSign: -1, enterT: 14.5 },
  { id: 's11', door: [6.8, -17.3], cover: [4.55, -7.75], colIndex: 7, leanSign: 1, enterT: 14.7 },
  { id: 's12', door: [-6.8, -17.3], cover: [-6.3, -4.75], colIndex: 2, leanSign: -1, enterT: 14.15 },
  { id: 's13', door: [6.8, -17.3], cover: [6.3, -4.75], colIndex: 6, leanSign: 1, enterT: 14.35 },
  { id: 's14', door: [-6.8, -17.3], cover: [-6.3, -10.75], colIndex: 3, leanSign: -1, enterT: 14.55 },
  { id: 's15', door: [6.8, -17.3], cover: [6.3, -10.75], colIndex: 7, leanSign: 1, enterT: 14.75 },
];

/** Deterministic burst start times for a soldier (while alive). */
export function soldierBursts(def: SoldierDef): number[] {
  const death = DEATHS[def.id];
  const idx = SOLDIERS.indexOf(def);
  // A15: no defender fires before the break. The squad deploys, the command
  // lands, the standoff holds, and the shooting starts when the pair move.
  const start = BREAK_T + 0.15 + idx * 0.09;
  const period = 2.1 + (idx % 3) * 0.27;
  const out: number[] = [];
  for (let t = start; t < Math.min(death - 0.25, 40); t += period) {
    // A man sprinting between cover is not putting rounds on target, and
    // firing through that transition is where the last soldier's barrel came
    // off its own line (B6 measures exactly that). s7 breaks cover for the
    // final assault at 38.6 and is set again by 39.3.
    if (def.id === 's7' && t > 38.5 && t < 39.45) continue;
    out.push(t);
  }
  return out;
}

function soldierLivePose(def: SoldierDef, t: number): Pose {
  const arriveT = def.enterT + 2.1;
  if (t < def.enterT) return still(def.door[0], def.door[1], FACE_DOOR, 'hidden');
  if (t < arriveT) return walkPose(t, def.enterT, arriveT, def.door, def.cover, 'run');
  // A7: the last soldier breaks cover for a final assault — this also gives
  // the killing shot (and its bullet-cam) a clear line of sight.
  if (def.id === 's7' && t >= 38.6) {
    if (t < 39.3) return walkPose(t, 38.6, 39.3, def.cover, [3.2, -9.2], 'run');
    return { pos: [3.2, 0, -9.2], yaw: FACE_DOOR, action: 'cover', phase: 1, speed: 0 };
  }
  // A15: the held standoff. Weapons are UP and trained on the pair, not
  // stowed behind cover — at lean phase 0 the aim swivel is skipped entirely
  // and the squad would hold the beat pointing at the floor. A settled
  // half-lean puts the weapons on target without anyone leaning out to fire.
  if (t >= STANDOFF[0] && t <= STANDOFF[1]) {
    const settle = smooth(STANDOFF[0], STANDOFF[0] + 0.35, t);
    return {
      pos: [def.cover[0], 0, def.cover[1]], yaw: FACE_DOOR,
      action: 'cover', phase: 0.28 + 0.32 * settle, speed: 0,
    };
  }

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

/** How far a body may be moved to justify a `slide` (B29). */
const SLIDE_SNAP = 0.75;
/** Poses that make sense with nothing behind the body. */
const OPEN_FALLS = ['sprawl', 'crumple', 'drop'];
/**
 * Avalanche-mixed, because the obvious h*31 accumulator maps consecutive ids
 * to adjacent values: s9, s13 and s15 all landed on the same two buckets mod
 * 3 and the sprawl pose was never selected at all, which defeats the point of
 * having a third.
 */
const hashId = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h | 0;
};

function applyDeath(id: string, t: number, live: (tt: number) => Pose): Pose {
  const death = DEATHS[id];
  if (death === undefined || t < death) return live(t);
  const style = DEATH_STYLE[id];
  const base = live(death - 0.001);
  const k = clamp((t - death) / 1.1, 0, 1);
  // B28: a body settles AGAINST the set, never inside it. Two of the three
  // guards die on positions that are inside the desk footprint by
  // construction — g0 is lunging for the desk radio when he is hit — and
  // nothing was resolving that, so they came to rest embedded in it. The
  // body slides clear over the same 1.1 s the fall takes, so it reads as
  // being stopped by the desk rather than teleporting off it.
  let [cx, cz] = settleClearOfSet(base.pos[0], base.pos[2]);
  let yaw = base.yaw;
  let useStyle: string = style;

  // B29: `slide` describes a man sliding down a vertical surface and coming to
  // rest seated against it. With nothing behind him it renders as sitting bolt
  // upright in open floor, which is what all five slide-style defenders were
  // doing — measured at 0.41 to 2.15 m from the nearest surface, because their
  // cover positions sit diagonally off the column corner by design and were
  // never in contact.
  //
  // So the pose has to earn its support. A body close enough to a surface is
  // moved into contact with it and TURNED so its back is against it, which is
  // what the pose assumes; one that is too far away to justify the move gets a
  // pose that makes sense in the open instead.
  if (style === 'slide') {
    const c = nearestSurfaceContact(cx, cz, SLIDE_SNAP);
    if (c) {
      cx = c.x;
      cz = c.z;
      // face away from the surface, so the back is to it
      yaw = Math.atan2(c.nx, c.nz);
    } else {
      // deterministic per id, so a hall of casualties is not two repeated poses
      useStyle = OPEN_FALLS[Math.abs(hashId(id)) % OPEN_FALLS.length];
    }
  }

  const e = k * k * (3 - 2 * k);
  const pos: V3 = [
    base.pos[0] + (cx - base.pos[0]) * e,
    base.pos[1],
    base.pos[2] + (cz - base.pos[2]) * e,
  ];
  return { ...base, pos, yaw, action: `fall_${useStyle}`, phase: k, speed: 0 };
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
  // A15: the man does not fire during the deployment or the held standoff.
  // His first round IS the break, and it lands inside the muzzle-exit insert.
  // A15: his first round IS the break, but it is timed a beat into the move
  // rather than on its first frame — firing on the whip of a pose transition
  // is what produced most of the stray backwards-barrel frames B6 measures.
  fillShots(out, 'neo', 19.12, 20.2, 0.21, true); // cartwheel
  fillShots(out, 'neo', 20.4, 21.0, 0.4, true);
  fillShots(out, 'neo', 22.8, 23.15, 0.35); // pauses for the dodge
  fillShots(out, 'neo', 24.9, 29.7, 0.62);
  fillShots(out, 'neo', 31.0, 33.3, 0.42);
  fillShots(out, 'neo', 33.6, 39.7, 0.48, true);
  fillShots(out, 'trin', 19.75, 20.5, 0.3);
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

/** B3: dense return-fire volley that chases the wall run — one round every
 *  0.11 s through the slow-mo window, each landing just behind/below her. */
export const WALLCHASE_TIMES: number[] = Array.from({ length: 9 }, (_, i) => 25.32 + i * 0.11);

/** Extra debris trickling down from damaged surfaces during the wind-down. */
export const SETTLE_TIMES = [40.8, 41.7, 42.9, 44.2];
/** One last casing dropped, spinning to rest, during near-silence. */
export const FINAL_CASING_T = 42.0;
