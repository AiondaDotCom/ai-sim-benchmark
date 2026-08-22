/** Persistent destruction state.
 *
 *  Every destructible slab owns two 8-bit maps:
 *    veneer[]  – how much of the polished marble skin has been blown off
 *    crater[]  – how deep the substrate underneath has been chewed out
 *
 *  Both are strictly monotonic: damage is only ever added, never healed, so the
 *  lobby can only get more wrecked as the sequence runs.
 */
import { LAYOUT } from './lobby.ts';
import type { SurfaceDef } from './lobby.ts';
import { addScaled, dot, sub, v3, type Vec3 } from './vec.ts';

export interface SurfaceHit {
  surfaceId: number;
  /** distance along the ray */
  t: number;
  point: Vec3;
  normal: Vec3;
  u: number;
  v: number;
}

export const FLOOR_ID = -1;
export const CEILING_ID = -2;

/** Cheap deterministic per-texel hash, used to give the edge of a blasted
 *  area the ragged outline of shattered stone instead of a clean circle. */
function texelNoise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class DamageField {
  readonly defs: readonly SurfaceDef[];
  readonly veneer: Uint8Array[] = [];
  readonly crater: Uint8Array[] = [];
  readonly dirty: boolean[] = [];
  /** Sum over every texel of veneer+crater – used by the persistence test. */
  totalDamage = 0;
  /** Bumped on every applied impact. */
  impactCount = 0;

  constructor(defs: readonly SurfaceDef[]) {
    this.defs = defs;
    for (const d of defs) {
      this.veneer.push(new Uint8Array(d.tw * d.th));
      this.crater.push(new Uint8Array(d.tw * d.th));
      this.dirty.push(false);
    }
  }

  clearDirty(): void {
    for (let i = 0; i < this.dirty.length; i++) this.dirty[i] = false;
  }

  /**
   * Blast a crater into one slab.
   * @param radius   metres
   * @param strength 0..1, how much veneer a direct hit removes
   */
  apply(surfaceId: number, u: number, v: number, radius: number, strength: number): void {
    if (surfaceId < 0 || surfaceId >= this.defs.length) return;
    const d = this.defs[surfaceId];
    const ven = this.veneer[surfaceId];
    const cra = this.crater[surfaceId];
    const su = d.tw / d.uSize;
    const sv = d.th / d.vSize;
    const cu = u * su;
    const cv = v * sv;
    const ru = radius * su;
    const rv = radius * sv;
    const u0 = Math.max(0, Math.floor(cu - ru));
    const u1 = Math.min(d.tw - 1, Math.ceil(cu + ru));
    const v0 = Math.max(0, Math.floor(cv - rv));
    const v1 = Math.min(d.th - 1, Math.ceil(cv + rv));
    let added = 0;
    for (let y = v0; y <= v1; y++) {
      const dy = (y + 0.5 - cv) / rv;
      for (let x = u0; x <= u1; x++) {
        const dx = (x + 0.5 - cu) / ru;
        const r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;
        const f = 1 - Math.sqrt(r2);
        const i = y * d.tw + x;
        const n = texelNoise(x, y);
        // the veneer shatters off well beyond the crater itself, and the edge
        // of the blasted patch breaks up along the stone's own grain
        const vAdd = Math.round(255 * strength * Math.max(0, Math.min(1, f * 2.4 - n * 0.55)));
        const cAdd = Math.round(255 * strength * f * f * 0.85);
        const nv = Math.min(255, ven[i] + vAdd);
        const nc = Math.min(255, cra[i] + cAdd);
        added += nv - ven[i] + (nc - cra[i]);
        ven[i] = nv;
        cra[i] = nc;
      }
    }
    if (added > 0) {
      this.totalDamage += added;
      this.dirty[surfaceId] = true;
    }
    this.impactCount++;
  }

  /** How stripped a slab is at (u,v), 0..1. */
  veneerAt(surfaceId: number, u: number, v: number): number {
    const d = this.defs[surfaceId];
    const x = Math.floor((u / d.uSize) * d.tw);
    const y = Math.floor((v / d.vSize) * d.th);
    if (x < 0 || y < 0 || x >= d.tw || y >= d.th) return 0;
    return this.veneer[surfaceId][y * d.tw + x] / 255;
  }
}

/** Ray/slab intersection in surface-local coordinates. */
function hitSurface(def: SurfaceDef, o: Vec3, dir: Vec3, maxT: number): SurfaceHit | null {
  const denom = dot(dir, def.n);
  if (denom > -1e-6) return null; // back faces do not stop bullets
  const t = dot(sub(def.origin, o), def.n) / denom;
  if (t < 1e-4 || t > maxT) return null;
  const p = addScaled(o, dir, t);
  const rel = sub(p, def.origin);
  const u = dot(rel, def.u);
  const v = dot(rel, def.v);
  if (u < 0 || u > def.uSize || v < 0 || v > def.vSize) return null;
  return { surfaceId: def.id, t, point: p, normal: def.n, u, v };
}

/**
 * Cast a ray against every destructible slab plus the floor and ceiling.
 * Returns the nearest hit, or null when the ray leaves the hall.
 */
export function raycast(
  defs: readonly SurfaceDef[],
  o: Vec3,
  dir: Vec3,
  maxT: number,
): SurfaceHit | null {
  let best: SurfaceHit | null = null;
  for (const d of defs) {
    const h = hitSurface(d, o, dir, best ? best.t : maxT);
    if (h) best = h;
  }
  // floor
  if (dir.y < -1e-6) {
    const t = -o.y / dir.y;
    if (t > 1e-4 && t <= (best ? best.t : maxT)) {
      const p = addScaled(o, dir, t);
      if (Math.abs(p.x) < LAYOUT.halfWidth && p.z > 0 && p.z < LAYOUT.hallLength)
        best = { surfaceId: FLOOR_ID, t, point: p, normal: v3(0, 1, 0), u: p.x, v: p.z };
    }
  }
  // ceiling
  if (dir.y > 1e-6) {
    const t = (LAYOUT.ceilingHeight - o.y) / dir.y;
    if (t > 1e-4 && t <= (best ? best.t : maxT)) {
      const p = addScaled(o, dir, t);
      if (Math.abs(p.x) < LAYOUT.halfWidth && p.z > 0 && p.z < LAYOUT.hallLength)
        best = { surfaceId: CEILING_ID, t, point: p, normal: v3(0, -1, 0), u: p.x, v: p.z };
    }
  }
  return best;
}

/** True when nothing solid stands between `a` and `b`. */
export function lineOfSight(defs: readonly SurfaceDef[], a: Vec3, b: Vec3): boolean {
  const d = sub(b, a);
  const dist = Math.sqrt(dot(d, d));
  if (dist < 1e-5) return true;
  const dir = v3(d.x / dist, d.y / dist, d.z / dist);
  const h = raycast(defs, a, dir, dist - 0.05);
  return h === null;
}
