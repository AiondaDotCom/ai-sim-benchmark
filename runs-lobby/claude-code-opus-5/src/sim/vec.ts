/** Minimal deterministic 3D vector maths. The simulation deliberately does not
 *  depend on three.js so it can run head-less inside the test suite. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const set = (o: Vec3, x: number, y: number, z: number): Vec3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
export const copy = (o: Vec3, a: Vec3): Vec3 => set(o, a.x, a.y, a.z);
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 =>
  v3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: Vec3): number => Math.sqrt(dot(a, a));
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 0, 1);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** Rotate `a` around the world Y axis by `ang` radians. */
export const rotY = (a: Vec3, ang: number): Vec3 => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return v3(a.x * c + a.z * s, a.y, -a.x * s + a.z * c);
};

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Normalised 0..1 progress of `x` inside [a,b]. */
export const t01 = (x: number, a: number, b: number): number => clamp((x - a) / (b - a || 1e-9), 0, 1);
export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeIn = (t: number): number => t * t * t;

/** Shortest distance between the segment a→b and the point p. */
export function segPointDist(a: Vec3, b: Vec3, p: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return dist(a, p);
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return dist(addScaled(a, ab, t), p);
}
