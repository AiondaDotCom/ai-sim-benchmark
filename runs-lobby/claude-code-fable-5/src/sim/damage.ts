/**
 * B8: the cladding damage map.
 *
 * The frozen task text requires that under fire "the veneer shatters off in
 * chunks revealing the rough substrate beneath". That means the granite is a
 * real second layer, not a decal painted onto a single surface: each wall and
 * column face carries a grid of cladding cells, a hit strips an irregular
 * chunk of them, and the renderer discards the cladding where cells are gone
 * so the substrate behind shows through a genuine recess.
 *
 * Everything here is deterministic simulation state:
 *  - a cell accumulates damage 0..255 and never decreases; nothing regenerates.
 *    Crossing STRIP means the facing is off; the value above that drives how
 *    DEEP the cavity is, so one hit is a shallow pock and sustained fire in
 *    one place becomes a real hole (A12)
 *  - the ragged chunk outline comes from an integer hash of the cell index,
 *    not from the RNG stream, so the same hit always removes the same cells
 *  - the grids are folded into the world hash
 */
import type { V3 } from './math3';

/** Approximate world size of one cladding cell, in metres. */
const CELL = 0.03;

/**
 * A hit landing within this distance of a face's vertical edge spalls the
 * corner right off, so the arris itself gets chewed (A12).
 */
const EDGE_SPALL = 0.14;

/** Accumulated damage at which the facing is considered off. */
export const STRIP = 128;

/** Cladding tile pitch. A hit near a seam can take a whole tile. */
export const TILE = 0.62;

/**
 * One damaged face. `u` runs along the face's width axis, `v` vertically.
 * `cells` is row-major, v-major: index = vi * w + ui.
 */
export interface Slab {
  id: string;
  /** which world axis the face normal points along, and its sign */
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  /** world position of the face's (u=0, v=0) corner */
  origin: V3;
  /** world axis index that `u` runs along, and the face extent in metres */
  uAxis: 0 | 1 | 2;
  uSize: number;
  vSize: number;
  w: number;
  h: number;
  cells: Uint8Array;
  /** bumped whenever cells change, so the renderer can re-upload lazily */
  version: number;
  /** count of stripped cells, for tests and debris sizing */
  stripped: number;
  /**
   * Cell-space bounding box of everything stripped so far. The renderer sizes
   * the substrate patch to this instead of drawing a full-face plane behind
   * every wall, which is most of what the second layer would otherwise cost.
   */
  minI: number; maxI: number; minJ: number; maxJ: number;
}

/** Deterministic integer hash in [0,1). */
function hash2(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = (x ^ (x >>> 13)) | 0;
  x = Math.imul(x, 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function makeSlab(
  id: string, axis: 0 | 1 | 2, sign: 1 | -1, origin: V3,
  uAxis: 0 | 1 | 2, uSize: number, vSize: number,
): Slab {
  const w = Math.max(2, Math.round(uSize / CELL));
  const h = Math.max(2, Math.round(vSize / CELL));
  return {
    id, axis, sign, origin, uAxis, uSize, vSize, w, h,
    cells: new Uint8Array(w * h), version: 0, stripped: 0,
    minI: w, maxI: -1, minJ: h, maxJ: -1,
  };
}

/** Project a world point onto the slab's (u, v) in metres. */
export function localOf(s: Slab, p: V3): [number, number] {
  const u = p[s.uAxis] - s.origin[s.uAxis];
  const v = p[1] - s.origin[1];
  return [u, v];
}

/**
 * Strip an irregular chunk of cladding centred on (u, v).
 *
 * The outline is deliberately NOT a disc: the cell is inside the chunk when a
 * rectangular (Chebyshev-ish) metric passes, with a per-cell hash pushing the
 * boundary in and out. That yields palm- to hand-sized pieces with jagged,
 * broadly straight fracture edges rather than soft round craters. Repeated
 * chunks share the grid, so overlapping hits merge into larger stripped areas
 * automatically.
 *
 * If the hit lands near a tile seam, the whole tile goes instead — a shot at
 * the edge of a slab of cladding takes the slab off.
 *
 * Returns the number of cells newly stripped (0 if the area was already gone).
 */
export function stripChunk(
  s: Slab, u: number, v: number, radius: number, seed: number,
): number {
  const nearSeam =
    Math.min(u % TILE, TILE - (u % TILE)) < 0.11 ||
    Math.min(v % TILE, TILE - (v % TILE)) < 0.11;

  let u0: number, u1: number, v0: number, v1: number;
  let whole = false;
  if (nearSeam && hash2(Math.round(u * 97), Math.round(v * 89) ^ seed) < 0.55) {
    // take the entire tile the hit sits in
    whole = true;
    u0 = Math.floor(u / TILE) * TILE;
    v0 = Math.floor(v / TILE) * TILE;
    u1 = u0 + TILE;
    v1 = v0 + TILE;
  } else {
    u0 = u - radius; u1 = u + radius;
    v0 = v - radius; v1 = v + radius;
    // A12: a hit close to a vertical arris takes the corner off rather than
    // leaving a thin lip of facing standing along the edge. Without this the
    // outermost few centimetres always survived and the column kept a
    // razor-straight silhouette however much fire it had taken.
    if (u0 < EDGE_SPALL) u0 = -CELL;
    if (u1 > s.uSize - EDGE_SPALL) u1 = s.uSize + CELL;
  }

  const ci0 = Math.max(0, Math.floor(u0 / CELL));
  const ci1 = Math.min(s.w - 1, Math.ceil(u1 / CELL));
  const cj0 = Math.max(0, Math.floor(v0 / CELL));
  const cj1 = Math.min(s.h - 1, Math.ceil(v1 / CELL));
  let n = 0;
  let changed = false;
  for (let j = cj0; j <= cj1; j++) {
    for (let i = ci0; i <= ci1; i++) {
      const idx = j * s.w + i;
      if (s.cells[idx] >= 255) continue;
      const cu = (i + 0.5) * CELL;
      const cv = (j + 0.5) * CELL;
      let inside: boolean;
      if (whole) {
        // a clean tile edge, only lightly nibbled so it is not a perfect square
        const eu = Math.min(cu - u0, u1 - cu);
        const ev = Math.min(cv - v0, v1 - cv);
        inside = eu > 0 && ev > 0
          && (Math.min(eu, ev) > 0.02 || hash2(i * 7, j * 13 ^ seed) > 0.35);
      } else {
        // rectangular metric => straight-ish fracture lines, hash-jittered
        const du = Math.abs(cu - u) / radius;
        const dv = Math.abs(cv - v) / radius;
        const jitter = 0.62 + 0.55 * hash2(i + seed, j - seed);
        inside = Math.max(du, dv) * 0.78 + Math.min(du, dv) * 0.42 < jitter;
      }
      if (inside) {
        // Values are 0..255 because this array is uploaded straight to a byte
        // texture. One hit takes most of the chunk past STRIP; further hits
        // drive it toward 255, which the renderer turns into cavity depth.
        const before = s.cells[idx];
        const after = Math.min(255, before + (whole ? 190 : 160));
        if (after === before) continue;
        s.cells[idx] = after;
        if (before < STRIP && after >= STRIP) n++;
        if (i < s.minI) s.minI = i;
        if (i > s.maxI) s.maxI = i;
        if (j < s.minJ) s.minJ = j;
        if (j > s.maxJ) s.maxJ = j;
        changed = true;
      }
    }
  }
  if (changed) s.version++;
  if (n > 0) s.stripped += n;
  return n;
}

/** Area in square metres represented by a cell count. */
export const cellArea = CELL * CELL;

/** Cell pitch in metres, for sizing the exposed patch. */
export const cellSize = CELL;

/** Fold the grids into the determinism hash. */
export function hashSlabs(slabs: Slab[], fnv: (h: number, x: number) => number, h0: number): number {
  let h = h0;
  for (const s of slabs) {
    h = fnv(h, s.stripped);
    // sample sparsely: the full grid is large and `stripped` already moves
    // with every change, so this is a cheap corroborating check
    for (let i = 0; i < s.cells.length; i += 37) h = fnv(h, s.cells[i]);
  }
  return h;
}
