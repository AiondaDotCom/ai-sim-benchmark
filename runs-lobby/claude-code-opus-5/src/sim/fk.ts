/** Forward kinematics for the rig, matching three.js' XYZ euler convention
 *  exactly so that simulation-side muzzle positions line up with the rendered
 *  hands. */
import { J, RIG, type JointName, type Pose } from './rig.ts';
import { v3, type Vec3 } from './vec.ts';

export type Mat3 = Float32Array; // column-major 3x3, same layout as three.js

export function eulerXYZ(out: Mat3, x: number, y: number, z: number): Mat3 {
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  out[0] = c * e;
  out[3] = -c * f;
  out[6] = d;
  out[1] = af + be * d;
  out[4] = ae - bf * d;
  out[7] = -b * c;
  out[2] = bf - ae * d;
  out[5] = be + af * d;
  out[8] = a * c;
  return out;
}

/** Root uses YXZ so that yaw/pitch/roll read naturally. */
export function eulerYXZ(out: Mat3, x: number, y: number, z: number): Mat3 {
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ce = c * e;
  const cf = c * f;
  const de = d * e;
  const df = d * f;
  out[0] = ce + df * b;
  out[3] = de * b - cf;
  out[6] = a * d;
  out[1] = a * f;
  out[4] = a * e;
  out[7] = -b;
  out[2] = cf * b - de;
  out[5] = df + ce * b;
  out[8] = a * c;
  return out;
}

export function mul3(out: Mat3, a: Mat3, b: Mat3): Mat3 {
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8];
  const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8];
  out[0] = a0 * b0 + a3 * b1 + a6 * b2;
  out[1] = a1 * b0 + a4 * b1 + a7 * b2;
  out[2] = a2 * b0 + a5 * b1 + a8 * b2;
  out[3] = a0 * b3 + a3 * b4 + a6 * b5;
  out[4] = a1 * b3 + a4 * b4 + a7 * b5;
  out[5] = a2 * b3 + a5 * b4 + a8 * b5;
  out[6] = a0 * b6 + a3 * b7 + a6 * b8;
  out[7] = a1 * b6 + a4 * b7 + a7 * b8;
  out[8] = a2 * b6 + a5 * b7 + a8 * b8;
  return out;
}

export const xform = (m: Mat3, v: Vec3): Vec3 =>
  v3(
    m[0] * v.x + m[3] * v.y + m[6] * v.z,
    m[1] * v.x + m[4] * v.y + m[7] * v.z,
    m[2] * v.x + m[5] * v.y + m[8] * v.z,
  );

const PARENT: (number | null)[] = RIG.map((b) => (b.parent ? J[b.parent] : null));
const OFFSET: Vec3[] = RIG.map((b) => v3(b.offset[0], b.offset[1], b.offset[2]));
const CHAIN: number[][] = RIG.map((_, i) => {
  const chain: number[] = [];
  let k: number | null = i;
  while (k !== null) {
    chain.unshift(k);
    k = PARENT[k];
  }
  return chain;
});

export interface RootTransform {
  pos: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
}

const mRoot = new Float32Array(9) as Mat3;
const mJoint = new Float32Array(9) as Mat3;
const mAcc = new Float32Array(9) as Mat3;
const mTmp = new Float32Array(9) as Mat3;

/** World-space position and orientation of one joint. */
export function jointWorld(
  root: RootTransform,
  pose: Pose,
  joint: JointName | number,
): { pos: Vec3; rot: Mat3 } {
  const target = typeof joint === 'number' ? joint : J[joint];
  eulerYXZ(mRoot, root.pitch, root.yaw, root.roll);
  mAcc.set(mRoot);
  let p = v3(root.pos.x, root.pos.y, root.pos.z);
  for (const idx of CHAIN[target]) {
    const off = xform(mAcc, OFFSET[idx]);
    p = v3(p.x + off.x, p.y + off.y, p.z + off.z);
    eulerXYZ(mJoint, pose[idx * 3], pose[idx * 3 + 1], pose[idx * 3 + 2]);
    mul3(mTmp, mAcc, mJoint);
    mAcc.set(mTmp);
  }
  return { pos: p, rot: new Float32Array(mAcc) as Mat3 };
}

/** World position of the point a weapon's muzzle sits at for a given hand. */
export function muzzleWorld(
  root: RootTransform,
  pose: Pose,
  hand: 'L' | 'R',
  weaponLength = 0.30,
): { pos: Vec3; dir: Vec3 } {
  const { pos, rot } = jointWorld(root, pose, hand === 'L' ? 'wristL' : 'wristR');
  // the weapon points along the forearm's local -Y, rotated forward into +Z
  const dir = xform(rot, v3(0, -0.32, 0.95));
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const d = v3(dir.x / l, dir.y / l, dir.z / l);
  return { pos: v3(pos.x + d.x * weaponLength, pos.y + d.y * weaponLength, pos.z + d.z * weaponLength), dir: d };
}
