/** A tiny hand-built humanoid rig. Every character in the demo — protagonists,
 *  guards and soldiers — uses this skeleton; the renderer builds boxes for the
 *  bones, the simulation only ever deals with joint angles. */

export const JOINTS = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
] as const;

export type JointName = (typeof JOINTS)[number];

export const J: Record<JointName, number> = JOINTS.reduce(
  (acc, name, i) => {
    acc[name] = i;
    return acc;
  },
  {} as Record<JointName, number>,
);

export const JOINT_COUNT = JOINTS.length;

export interface BoneDef {
  name: JointName;
  parent: JointName | null;
  /** Offset from the parent joint, in parent space. */
  offset: [number, number, number];
  /** Bone length along its rest axis. */
  length: number;
  /** Rest direction of the bone from its joint. */
  axis: 'up' | 'down' | 'forward';
  /** Cross-section (width, depth) used by the renderer. */
  thick: [number, number];
}

export const RIG: BoneDef[] = [
  { name: 'pelvis', parent: null, offset: [0, 0.92, 0], length: 0.16, axis: 'up', thick: [0.30, 0.20] },
  { name: 'spine', parent: 'pelvis', offset: [0, 0.16, 0], length: 0.22, axis: 'up', thick: [0.32, 0.21] },
  { name: 'chest', parent: 'spine', offset: [0, 0.22, 0], length: 0.24, axis: 'up', thick: [0.37, 0.23] },
  { name: 'neck', parent: 'chest', offset: [0, 0.24, 0], length: 0.09, axis: 'up', thick: [0.11, 0.11] },
  { name: 'head', parent: 'neck', offset: [0, 0.09, 0], length: 0.24, axis: 'up', thick: [0.19, 0.22] },

  { name: 'shoulderL', parent: 'chest', offset: [0.19, 0.19, 0], length: 0.29, axis: 'down', thick: [0.11, 0.12] },
  { name: 'elbowL', parent: 'shoulderL', offset: [0, -0.29, 0], length: 0.26, axis: 'down', thick: [0.09, 0.10] },
  { name: 'wristL', parent: 'elbowL', offset: [0, -0.26, 0], length: 0.11, axis: 'down', thick: [0.08, 0.09] },
  { name: 'shoulderR', parent: 'chest', offset: [-0.19, 0.19, 0], length: 0.29, axis: 'down', thick: [0.11, 0.12] },
  { name: 'elbowR', parent: 'shoulderR', offset: [0, -0.29, 0], length: 0.26, axis: 'down', thick: [0.09, 0.10] },
  { name: 'wristR', parent: 'elbowR', offset: [0, -0.26, 0], length: 0.11, axis: 'down', thick: [0.08, 0.09] },

  { name: 'hipL', parent: 'pelvis', offset: [0.11, -0.02, 0], length: 0.45, axis: 'down', thick: [0.16, 0.17] },
  { name: 'kneeL', parent: 'hipL', offset: [0, -0.45, 0], length: 0.44, axis: 'down', thick: [0.13, 0.14] },
  { name: 'ankleL', parent: 'kneeL', offset: [0, -0.44, 0], length: 0.27, axis: 'forward', thick: [0.12, 0.10] },
  { name: 'hipR', parent: 'pelvis', offset: [-0.11, -0.02, 0], length: 0.45, axis: 'down', thick: [0.16, 0.17] },
  { name: 'kneeR', parent: 'hipR', offset: [0, -0.45, 0], length: 0.44, axis: 'down', thick: [0.13, 0.14] },
  { name: 'ankleR', parent: 'kneeR', offset: [0, -0.44, 0], length: 0.27, axis: 'forward', thick: [0.12, 0.10] },
];

/** Joint angles, packed as XYZ euler triples in radians. */
export type Pose = Float32Array;

export const newPose = (): Pose => new Float32Array(JOINT_COUNT * 3);

export function setJoint(p: Pose, j: number, x: number, y: number, z: number): void {
  const i = j * 3;
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
}

export function addJoint(p: Pose, j: number, x: number, y: number, z: number): void {
  const i = j * 3;
  p[i] += x;
  p[i + 1] += y;
  p[i + 2] += z;
}

/** out = mix(a, b, w) over every joint. */
export function blendPose(out: Pose, a: Pose, b: Pose, w: number): void {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * w;
}

/** Blend `b` over `out` only for the listed joints (used for aim overlays). */
export function blendJoints(out: Pose, b: Pose, w: number, joints: readonly number[]): void {
  for (const j of joints) {
    const i = j * 3;
    out[i] += (b[i] - out[i]) * w;
    out[i + 1] += (b[i + 1] - out[i + 1]) * w;
    out[i + 2] += (b[i + 2] - out[i + 2]) * w;
  }
}

export const UPPER_BODY = [
  J.spine,
  J.chest,
  J.neck,
  J.head,
  J.shoulderL,
  J.elbowL,
  J.wristL,
  J.shoulderR,
  J.elbowR,
  J.wristR,
];

export const ARMS = [J.shoulderL, J.elbowL, J.wristL, J.shoulderR, J.elbowR, J.wristR];
export const LEGS = [J.hipL, J.kneeL, J.ankleL, J.hipR, J.kneeR, J.ankleR];

/** Local-space position of a hand (used to spawn muzzle flashes and casings). */
export interface RigTransform {
  pos: [number, number, number];
  rot: [number, number, number];
}
