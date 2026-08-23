/** Minimal deterministic 3D math for the simulation (no three.js dependency). */

export type V3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3): number => Math.sqrt(dot(a, a));
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerp3 = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;
/** Smoothstep 0..1 over [e0,e1]. */
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface RayHit {
  t: number;
  point: V3;
  normal: V3;
}

/** Ray vs AABB (slab method). Returns nearest positive hit or null. */
export function rayAABB(
  o: V3,
  d: V3,
  min: [number, number, number],
  max: [number, number, number],
): RayHit | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || axis < 0) return null;
  const point: V3 = [o[0] + d[0] * tmin, o[1] + d[1] * tmin, o[2] + d[2] * tmin];
  const normal: V3 = [0, 0, 0];
  normal[axis] = sign;
  return { t: tmin, point, normal };
}

/**
 * Distance between segment [p0,p1] and a vertical capsule (line segment
 * [c_bottom, c_top] with given radius); returns true if they intersect.
 */
export function segmentHitsCapsule(
  p0: V3,
  p1: V3,
  base: V3,
  height: number,
  radius: number,
): boolean {
  const a0 = base;
  const a1: V3 = [base[0], base[1] + height, base[2]];
  return segSegDist(p0, p1, a0, a1) <= radius;
}

/** Minimum distance between two segments. */
export function segSegDist(p1: V3, p2: V3, q1: V3, q2: V3): number {
  const d1 = sub(p2, p1);
  const d2 = sub(q2, q1);
  const r = sub(p1, q1);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number, t: number;
  if (a <= 1e-12 && e <= 1e-12) return len(r);
  if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = add(p1, scale(d1, s));
  const c2 = add(q1, scale(d2, t));
  return len(sub(c1, c2));
}
