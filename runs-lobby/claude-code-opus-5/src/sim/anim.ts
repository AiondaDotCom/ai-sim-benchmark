/** The animation library.
 *
 *  Every clip is a pure function of a normalised phase, so poses are perfectly
 *  reproducible from the simulation time alone. Local forward is +Z, +X is the
 *  character's left. A positive X rotation swings a limb forward.
 */
import { J, newPose, setJoint, type Pose } from './rig.ts';
import { clamp, easeIn, easeInOut, easeOut, mix, smoothstep } from './vec.ts';

const TAU = Math.PI * 2;
const scratch = newPose();

export function zeroPose(out: Pose): void {
  out.fill(0);
}

/** Relaxed standing. */
export function poseStand(out: Pose, breathe = 0): void {
  zeroPose(out);
  setJoint(out, J.spine, 0.02, 0, 0);
  setJoint(out, J.chest, -0.03 + breathe * 0.02, 0, 0);
  setJoint(out, J.shoulderL, 0.04, 0, -0.13);
  setJoint(out, J.elbowL, 0.22, 0, -0.06);
  setJoint(out, J.shoulderR, 0.04, 0, 0.13);
  setJoint(out, J.elbowR, 0.22, 0, 0.06);
  setJoint(out, J.hipL, 0, 0, -0.03);
  setJoint(out, J.hipR, 0, 0, 0.03);
}

/**
 * Walk cycle. `amp` scales stride, `swagger` adds the unhurried shoulder roll
 * the protagonists walk in with.
 */
export function poseWalk(out: Pose, phase: number, amp = 1, swagger = 0): void {
  zeroPose(out);
  const p = phase * TAU;
  const s = Math.sin(p);
  const c = Math.cos(p);
  setJoint(out, J.hipL, s * 0.52 * amp, 0, -0.03);
  setJoint(out, J.hipR, -s * 0.52 * amp, 0, 0.03);
  setJoint(out, J.kneeL, -Math.max(0, -Math.sin(p + 0.9)) * 0.95 * amp, 0, 0);
  setJoint(out, J.kneeR, -Math.max(0, -Math.sin(p + 0.9 + Math.PI)) * 0.95 * amp, 0, 0);
  setJoint(out, J.ankleL, 0.14 - s * 0.24 * amp, 0, 0);
  setJoint(out, J.ankleR, 0.14 + s * 0.24 * amp, 0, 0);

  setJoint(out, J.pelvis, 0, -s * 0.10 * amp, c * 0.03);
  setJoint(out, J.spine, 0.03, s * 0.06 * amp, 0);
  setJoint(out, J.chest, -0.04, s * 0.10 * amp + swagger * s * 0.06, 0);
  setJoint(out, J.head, 0, -s * 0.04, 0);

  setJoint(out, J.shoulderL, -s * 0.34 * amp, 0, -0.14 - swagger * 0.05);
  setJoint(out, J.elbowL, 0.28 + Math.max(0, -s) * 0.22, 0, -0.05);
  setJoint(out, J.shoulderR, s * 0.34 * amp, 0, 0.14 + swagger * 0.05);
  setJoint(out, J.elbowR, 0.28 + Math.max(0, s) * 0.22, 0, 0.05);
}

/** Vertical bob that goes with poseWalk, added to the root height. */
export const walkBob = (phase: number, amp = 1): number =>
  -0.028 * amp * Math.cos(phase * TAU * 2) - 0.01 * amp;

export function poseRun(out: Pose, phase: number): void {
  poseWalk(out, phase, 1.35, 0);
  const p = phase * TAU;
  const s = Math.sin(p);
  setJoint(out, J.spine, 0.16, s * 0.08, 0);
  setJoint(out, J.chest, 0.10, s * 0.14, 0);
  setJoint(out, J.shoulderL, -s * 0.75, 0, -0.22);
  setJoint(out, J.elbowL, 1.35, 0, -0.1);
  setJoint(out, J.shoulderR, s * 0.75, 0, 0.22);
  setJoint(out, J.elbowR, 1.35, 0, 0.1);
}

/** Crouched, ready. */
export function poseCrouch(out: Pose, depth = 1): void {
  zeroPose(out);
  setJoint(out, J.hipL, 1.15 * depth, 0.10, -0.22);
  setJoint(out, J.kneeL, -1.85 * depth, 0, 0);
  setJoint(out, J.ankleL, 0.62 * depth, 0, 0);
  setJoint(out, J.hipR, 0.72 * depth, -0.10, 0.28);
  setJoint(out, J.kneeR, -1.65 * depth, 0, 0);
  setJoint(out, J.ankleR, 0.55 * depth, 0, 0);
  setJoint(out, J.pelvis, 0.16 * depth, 0, 0);
  setJoint(out, J.spine, 0.10 * depth, 0, 0);
  setJoint(out, J.chest, 0.06 * depth, 0, 0);
  setJoint(out, J.head, -0.12 * depth, 0, 0);
}

/** Root height offset that goes with poseCrouch. */
export const crouchDrop = (depth: number): number => -0.42 * depth;

/**
 * Aim overlay for the arms and torso.
 * @param yaw   aim direction relative to the body, positive = to the left
 * @param pitch positive = aiming up
 * @param grip  'right' | 'left' | 'both' | 'dual'
 */
export function poseAim(
  out: Pose,
  yaw: number,
  pitch: number,
  grip: 'right' | 'left' | 'both' | 'dual',
  recoil = 0,
): void {
  const fwd = -Math.PI / 2 - pitch + recoil * 0.30;
  const twist = clamp(yaw, -1.1, 1.1);
  setJoint(out, J.spine, 0.02, twist * 0.22, 0);
  setJoint(out, J.chest, -0.02, twist * 0.34, 0);
  setJoint(out, J.head, -pitch * 0.35, twist * 0.30, 0);

  const extendR = () => {
    setJoint(out, J.shoulderR, fwd, twist * 0.5 + 0.10, 0.20);
    setJoint(out, J.elbowR, 0.16 + recoil * 0.5, 0, -0.06);
    setJoint(out, J.wristR, -0.10, 0, 0);
  };
  const extendL = () => {
    setJoint(out, J.shoulderL, fwd, twist * 0.5 - 0.10, -0.20);
    setJoint(out, J.elbowL, 0.16 + recoil * 0.5, 0, 0.06);
    setJoint(out, J.wristL, -0.10, 0, 0);
  };
  switch (grip) {
    case 'right':
      extendR();
      setJoint(out, J.shoulderL, 0.30, 0, -0.30);
      setJoint(out, J.elbowL, 1.10, 0, -0.2);
      break;
    case 'left':
      extendL();
      setJoint(out, J.shoulderR, 0.30, 0, 0.30);
      setJoint(out, J.elbowR, 1.10, 0, 0.2);
      break;
    case 'both':
      extendR();
      extendL();
      setJoint(out, J.shoulderL, fwd, twist * 0.5 + 0.16, -0.36);
      setJoint(out, J.elbowL, 0.52, 0, 0.22);
      break;
    case 'dual':
      extendR();
      extendL();
      setJoint(out, J.shoulderR, fwd, twist * 0.5 - 0.34, 0.30);
      setJoint(out, J.shoulderL, fwd, twist * 0.5 + 0.34, -0.30);
      break;
  }
}

/** Arms out to both sides, firing sideways — used during the cartwheel. */
export function poseDualSideFire(out: Pose, spread: number, recoil: number): void {
  setJoint(out, J.shoulderL, -0.15 + recoil * 0.2, 0, Math.PI / 2 + spread);
  setJoint(out, J.elbowL, 0.12, 0, 0.10);
  setJoint(out, J.shoulderR, -0.15 + recoil * 0.2, 0, -Math.PI / 2 - spread);
  setJoint(out, J.elbowR, 0.12, 0, -0.10);
  setJoint(out, J.chest, -0.05, 0, 0);
}

/** The coat-opening reveal: both hands sweep the coat wide open. */
export function poseCoatOpen(out: Pose, t: number): void {
  const e = easeOut(clamp(t, 0, 1));
  poseStand(out);
  setJoint(out, J.shoulderL, 0.22 + e * 0.30, e * 0.55, -0.20 - e * 1.05);
  setJoint(out, J.elbowL, 0.85 - e * 0.55, 0, -0.25);
  setJoint(out, J.shoulderR, 0.22 + e * 0.30, -e * 0.55, 0.20 + e * 1.05);
  setJoint(out, J.elbowR, 0.85 - e * 0.55, 0, 0.25);
  setJoint(out, J.chest, -0.10 * e, 0, 0);
  setJoint(out, J.head, -0.05, 0, 0);
}

/** Sideways cartwheel; the body roll itself is applied to the root. */
export function poseCartwheel(out: Pose, t: number): void {
  zeroPose(out);
  const w = Math.sin(clamp(t, 0, 1) * Math.PI);
  setJoint(out, J.hipL, 0.10, 0, -0.55 - w * 0.62);
  setJoint(out, J.kneeL, -0.18 - (1 - w) * 0.5, 0, 0);
  setJoint(out, J.hipR, 0.10, 0, 0.42 + w * 0.55);
  setJoint(out, J.kneeR, -0.24 - (1 - w) * 0.4, 0, 0);
  setJoint(out, J.spine, 0, 0, -0.06);
  setJoint(out, J.chest, -0.08, 0, 0);
  setJoint(out, J.head, -0.10, 0, 0);
}

/** Running along a vertical surface; the 90° body roll lives on the root. */
export function poseWallRun(out: Pose, phase: number): void {
  poseRun(out, phase);
  setJoint(out, J.spine, 0.05, 0, -0.18);
  setJoint(out, J.chest, 0.02, 0, -0.10);
  setJoint(out, J.head, -0.25, 0.35, 0);
}

/** Flying kick — leading leg extended, trailing leg tucked, arms trailing. */
export function poseFlyingKick(out: Pose, t: number): void {
  zeroPose(out);
  const k = smoothstep(0.05, 0.42, t);
  const r = smoothstep(0.55, 1, t);
  setJoint(out, J.hipR, mix(0.6, 1.55, k) - r * 0.9, 0, 0.06);
  setJoint(out, J.kneeR, mix(-1.3, -0.08, k) - r * 0.9, 0, 0);
  setJoint(out, J.ankleR, 0.35, 0, 0);
  setJoint(out, J.hipL, mix(-0.2, -0.75, k) + r * 0.9, 0, -0.10);
  setJoint(out, J.kneeL, mix(-0.7, -1.9, k) + r * 1.1, 0, 0);
  setJoint(out, J.pelvis, -0.18, 0, 0);
  setJoint(out, J.spine, -0.20, 0, 0);
  setJoint(out, J.chest, -0.10, 0, 0);
  setJoint(out, J.shoulderL, -0.55 - k * 0.6, 0, -0.55);
  setJoint(out, J.elbowL, 1.0, 0, -0.2);
  setJoint(out, J.shoulderR, 0.75, 0, 0.65);
  setJoint(out, J.elbowR, 1.25, 0, 0.2);
  setJoint(out, J.head, -0.15, 0, 0);
}

/** Fast close-quarters strike combination, `i` selects the variation. */
export function poseStrike(out: Pose, t: number, i: number): void {
  zeroPose(out);
  const p = clamp(t, 0, 1);
  const punch = Math.sin(clamp(p * 1.15, 0, 1) * Math.PI) ** 0.6;
  const twist = (i % 2 === 0 ? 1 : -1) * punch;
  setJoint(out, J.pelvis, 0, twist * 0.28, 0);
  setJoint(out, J.spine, 0.06, twist * 0.30, 0);
  setJoint(out, J.chest, 0.04, twist * 0.36, 0);
  setJoint(out, J.head, -0.08, twist * 0.2, 0);
  if (i % 2 === 0) {
    setJoint(out, J.shoulderR, -Math.PI / 2 * punch - 0.1, 0.2 * punch, 0.25);
    setJoint(out, J.elbowR, mix(1.6, 0.12, punch), 0, 0);
    setJoint(out, J.shoulderL, 0.4, 0, -0.4);
    setJoint(out, J.elbowL, 1.7, 0, -0.2);
  } else {
    setJoint(out, J.shoulderL, -Math.PI / 2 * punch - 0.1, -0.2 * punch, -0.25);
    setJoint(out, J.elbowL, mix(1.6, 0.12, punch), 0, 0);
    setJoint(out, J.shoulderR, 0.4, 0, 0.4);
    setJoint(out, J.elbowR, 1.7, 0, 0.2);
  }
  setJoint(out, J.hipL, 0.20 + punch * 0.25, 0, -0.16);
  setJoint(out, J.kneeL, -0.45 - punch * 0.2, 0, 0);
  setJoint(out, J.hipR, -0.15, 0, 0.16);
  setJoint(out, J.kneeR, -0.35, 0, 0);
}

/** Guard reaching for the radio on his shoulder. */
export function poseRadioReach(out: Pose, t: number): void {
  poseStand(out);
  const e = easeIn(clamp(t, 0, 1));
  setJoint(out, J.shoulderR, -0.55 * e, -0.5 * e, 0.9 * e + 0.13);
  setJoint(out, J.elbowR, 1.1 + 1.0 * e, 0, 0.3 * e);
  setJoint(out, J.chest, -0.05, -0.25 * e, 0);
  setJoint(out, J.head, 0.05, -0.2 * e, 0);
}

/** Guard raising a hand: "remove any metal objects, sir". */
export function poseAskHalt(out: Pose, t: number): void {
  poseStand(out);
  const e = easeOut(clamp(t, 0, 1));
  setJoint(out, J.shoulderR, -1.15 * e, 0.15, 0.35);
  setJoint(out, J.elbowR, 1.25 * e, 0, 0.1);
  setJoint(out, J.wristR, -0.5 * e, 0, 0);
  setJoint(out, J.chest, -0.03, 0.06, 0);
}

export type DeathStyle = 'crumple' | 'backfall' | 'slide' | 'spin';

/** Stylised knock-down. `t` is seconds since the hit; poses settle and hold. */
export function poseDeath(out: Pose, style: DeathStyle, t: number): void {
  const p = clamp(t / 0.95, 0, 1);
  const e = easeInOut(p);
  const settle = Math.exp(-t * 3.2) * Math.sin(t * 13) * (1 - p) * 0.12;
  zeroPose(out);
  switch (style) {
    case 'crumple':
      setJoint(out, J.hipL, 1.85 * e, 0.2 * e, -0.35 * e);
      setJoint(out, J.kneeL, -2.4 * e, 0, 0);
      setJoint(out, J.hipR, 1.55 * e, -0.2 * e, 0.4 * e);
      setJoint(out, J.kneeR, -2.2 * e, 0, 0);
      setJoint(out, J.spine, 0.55 * e + settle, 0.2 * e, 0);
      setJoint(out, J.chest, 0.35 * e, 0.15 * e, 0);
      setJoint(out, J.head, 0.5 * e, 0.1, 0);
      setJoint(out, J.shoulderL, 0.9 * e, 0, -0.5 * e);
      setJoint(out, J.shoulderR, 0.8 * e, 0, 0.55 * e);
      setJoint(out, J.elbowL, 0.7 * e, 0, 0);
      setJoint(out, J.elbowR, 0.6 * e, 0, 0);
      break;
    case 'backfall':
      setJoint(out, J.spine, -0.35 * e + settle, 0, 0);
      setJoint(out, J.chest, -0.25 * e, 0, 0);
      setJoint(out, J.head, 0.45 * e, 0.15, 0);
      setJoint(out, J.hipL, 0.55 * e, 0, -0.25 * e);
      setJoint(out, J.kneeL, -0.75 * e, 0, 0);
      setJoint(out, J.hipR, 0.35 * e, 0, 0.30 * e);
      setJoint(out, J.kneeR, -0.5 * e, 0, 0);
      setJoint(out, J.shoulderL, -1.5 * e, 0, -0.75 * e);
      setJoint(out, J.shoulderR, -1.4 * e, 0, 0.8 * e);
      setJoint(out, J.elbowL, 0.5 * e, 0, 0);
      setJoint(out, J.elbowR, 0.45 * e, 0, 0);
      break;
    case 'slide':
      // back against a column, knees folding, sliding down to sit
      setJoint(out, J.hipL, 1.35 * e, 0.05, -0.30 * e);
      setJoint(out, J.kneeL, -1.55 * e, 0, 0);
      setJoint(out, J.hipR, 1.15 * e, -0.05, 0.34 * e);
      setJoint(out, J.kneeR, -1.35 * e, 0, 0);
      setJoint(out, J.spine, 0.10 * e + settle, 0, 0.05 * e);
      setJoint(out, J.chest, 0.06 * e, 0, 0);
      setJoint(out, J.head, 0.55 * e, 0.25 * e, 0.1);
      setJoint(out, J.shoulderL, 0.35 * e, 0, -0.30 * e);
      setJoint(out, J.shoulderR, 0.30 * e, 0, 0.34 * e);
      setJoint(out, J.elbowL, 0.30 * e, 0, 0);
      setJoint(out, J.elbowR, 0.25 * e, 0, 0);
      break;
    case 'spin':
      setJoint(out, J.spine, 0.25 * e, 0.55 * e, 0.2 * e);
      setJoint(out, J.chest, 0.30 * e, 0.45 * e, 0);
      setJoint(out, J.head, 0.35 * e, 0.3 * e, 0);
      setJoint(out, J.hipL, 1.2 * e, 0.3 * e, -0.4 * e);
      setJoint(out, J.kneeL, -1.7 * e, 0, 0);
      setJoint(out, J.hipR, 0.9 * e, 0, 0.5 * e);
      setJoint(out, J.kneeR, -1.2 * e, 0, 0);
      setJoint(out, J.shoulderL, -0.9 * e, 0, -0.9 * e);
      setJoint(out, J.shoulderR, 0.5 * e, 0, 0.9 * e);
      setJoint(out, J.elbowL, 0.4 * e, 0, 0);
      setJoint(out, J.elbowR, 0.4 * e, 0, 0);
      break;
  }
}

/**
 * Root motion for each death style: [dy, pitch, roll, forward].
 *
 * The rig hangs off a root at the feet, so tipping the body over also swings it
 * upwards; the dy values below are chosen so that the pelvis lands just above
 * the marble for each pose rather than leaving the body floating.
 */
export function deathRoot(style: DeathStyle, t: number): [number, number, number, number] {
  const p = clamp(t / 0.95, 0, 1);
  const e = easeInOut(p);
  const bounce = Math.exp(-t * 4) * Math.abs(Math.sin(t * 9)) * 0.04 * (1 - p);
  switch (style) {
    case 'crumple':
      return [-0.49 * e + bounce, 0.35 * e, 0.08 * e, -0.15 * e];
    case 'backfall':
      return [-0.02 * e + bounce, -1.28 * e, 0.05 * e, -0.62 * e];
    case 'slide':
      return [-0.58 * e, 0.06 * e, 0, -0.08 * e];
    case 'spin':
      return [-0.26 * e + bounce, 0.25 * e, 0.9 * e, 0.1 * e];
  }
}

export { scratch as scratchPose };
