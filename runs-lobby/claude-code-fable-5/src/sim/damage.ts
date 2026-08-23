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
 * B13: base pitch of the fracture pattern. Stone does not break into squares,
 * so the cladding is implicitly divided into irregular Voronoi plates from
 * jittered sites, and a hit removes whole plates. That yields angular outlines
 * with oblique edges and sharp corners at varied angles, and neighbouring hits
 * merge into larger irregular areas — instead of the axis-aligned rectangles
 * a box metric produced however much the boundary was frayed.
 */
const FRAC = 0.155;

/** Smooth value noise in [-1,1], for warping the fracture lattice. */
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return (top + (bot - top) * sy) * 2 - 1;
}

/** Site of the fracture lattice cell (li, lj), jittered off the lattice. */
function fracSite(li: number, lj: number): [number, number] {
  return [
    (li + 0.14 + 0.72 * hash2(li, lj)) * FRAC,
    (lj + 0.14 + 0.72 * hash2(li + 911, lj - 733)) * FRAC,
  ];
}

/**
 * Which fracture plate covers (u, v). Nearest jittered site over the 3x3
 * lattice neighbourhood, then a one-step merge so some plates are single
 * chips and others are two or three cells fused into a larger slab.
 */
function plateAt(uRaw: number, vRaw: number): number {
  // B13 supplement: warp the sample position before looking up the lattice.
  // Straight Voronoi gives polygonal cells that read as a mosaic; warping the
  // domain makes every cell boundary wander, bulge and pinch along its length,
  // which is what a fracture contour in stone actually does. Two octaves, the
  // coarse one moving the whole outline and the fine one roughening it.
  const u = uRaw
    + vnoise(uRaw * 3.1, vRaw * 3.1) * 0.075
    + vnoise(uRaw * 9.7 + 13, vRaw * 9.7) * 0.024;
  const v = vRaw
    + vnoise(uRaw * 3.1 + 41, vRaw * 3.1 + 7) * 0.075
    + vnoise(uRaw * 9.7, vRaw * 9.7 + 29) * 0.024;
  const li0 = Math.floor(u / FRAC);
  const lj0 = Math.floor(v / FRAC);
  let best = Infinity;
  let bi = li0;
  let bj = lj0;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const li = li0 + di;
      const lj = lj0 + dj;
      const [sx, sy] = fracSite(li, lj);
      const d = (u - sx) * (u - sx) + (v - sy) * (v - sy);
      if (d < best) { best = d; bi = li; bj = lj; }
    }
  }
  // fuse roughly half the chips onto a neighbour, so plate sizes vary
  if (hash2(bi * 31, bj * 17) < 0.58) {
    const dir = Math.floor(hash2(bi * 7 + 3, bj * 13 + 5) * 4);
    bi += dir === 0 ? 1 : dir === 1 ? -1 : 0;
    bj += dir === 2 ? 1 : dir === 3 ? -1 : 0;
  }
  return (bi + 64) * 256 + (bj + 64);
}

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
  /**
   * B19: tiles that have already let go as a whole, keyed tj * 1000 + ti, so
   * a tile can only ever detach once however much more fire it takes.
   */
  released: Set<number>;
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
    cells: new Uint8Array(w * h), released: new Set<number>(), version: 0, stripped: 0,
    minI: w, maxI: -1, minJ: h, maxJ: -1,
  };
}

/**
 * Is the cladding at this face-local point already gone?
 *
 * B16/B20: a round that lands on surviving facing leaves a spall crater in
 * polished stone; one that lands where the facing has already been shot away
 * leaves a rougher, shallower pock in the coarse core. The two look different
 * and are recorded as different marks, so the sim has to be able to tell which
 * layer it just hit.
 */
export function isStripped(s: Slab, u: number, v: number): boolean {
  const i = Math.floor(u / CELL);
  const j = Math.floor(v / CELL);
  if (i < 0 || j < 0 || i >= s.w || j >= s.h) return false;
  // Against STRIP, not against zero. Under the old model a single hit always
  // crossed the threshold, so "has any damage" and "the facing is gone" agreed
  // and the difference never showed. Under accumulation they are completely
  // different questions: a scarred-but-intact cell holds a value below STRIP,
  // and testing it against zero classified every first hit as landing on
  // exposed core — which silently reduced facing marks to almost none.
  // The shader already clips on this threshold (dmg > 0.5 of a byte); this is
  // the CPU side agreeing with it.
  return s.cells[j * s.w + i] >= STRIP;
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

  // B16/B20, per the accumulation model: a round ADDS damage to the cells it
  // touches, and the facing only lets go once the accumulated damage crosses
  // STRIP. A single hit therefore scars the polish rather than taking a chunk
  // out, which is what makes a facing mark reachable at all — and it is closer
  // to how stone behaves: the first rounds scar it, sustained fire takes the
  // facing off. Raised well above STRIP/2 so that the SECOND hit into the same
  // place always strips, rather than needing three or four.
  const add = whole ? 255 : 96;
  const hit = (i: number, j: number) => {
    const idx = j * s.w + i;
    const before = s.cells[idx];
    if (before >= 255) return;
    const after = Math.min(255, before + add);
    s.cells[idx] = after;
    if (before < STRIP && after >= STRIP) n++;
    if (i < s.minI) s.minI = i;
    if (i > s.maxI) s.maxI = i;
    if (j < s.minJ) s.minJ = j;
    if (j > s.maxJ) s.maxJ = j;
    changed = true;
  };

  if (whole) {
    // the seam case: a whole tile lifts off, lightly nibbled at its edges so
    // it is not a perfect square either
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        const cu = (i + 0.5) * CELL;
        const cv = (j + 0.5) * CELL;
        const eu = Math.min(cu - u0, u1 - cu);
        const ev = Math.min(cv - v0, v1 - cv);
        if (eu > 0 && ev > 0
          && (Math.min(eu, ev) > 0.02 || hash2(i * 7, j * 13 ^ seed) > 0.35)) hit(i, j);
      }
    }
  } else {
    // B13: find every fracture plate the hit touches, then remove those plates
    // WHOLE. The outline is the union of Voronoi cells, so it is an irregular
    // angular polygon rather than a frayed rectangle.
    const plates = new Set<number>();
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        const cu = (i + 0.5) * CELL;
        const cv = (j + 0.5) * CELL;
        const du = cu - u;
        const dv = cv - v;
        if (du * du + dv * dv <= radius * radius) plates.add(plateAt(cu, cv));
      }
    }
    if (plates.size === 0) plates.add(plateAt(u, v));
    // a plate can reach beyond the hit radius, so sweep a wider box
    const gi0 = Math.max(0, Math.floor((u - radius - FRAC * 2) / CELL));
    const gi1 = Math.min(s.w - 1, Math.ceil((u + radius + FRAC * 2) / CELL));
    const gj0 = Math.max(0, Math.floor((v - radius - FRAC * 2) / CELL));
    const gj1 = Math.min(s.h - 1, Math.ceil((v + radius + FRAC * 2) / CELL));
    for (let j = gj0; j <= gj1; j++) {
      for (let i = gi0; i <= gi1; i++) {
        if (plates.has(plateAt((i + 0.5) * CELL, (j + 0.5) * CELL))) hit(i, j);
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


/** How much of a tile has to be gone before the remainder lets go. */
const TILE_RELEASE_FRAC = 0.68;

export interface TileRelease {
  /** face-local rect of the tile that came off */
  u0: number; v0: number; size: number;
  /** cells the release itself removed */
  stripped: number;
}

/**
 * B19: does the tile containing (u, v) let go as a whole?
 *
 * Cladding used to be eroded cell by cell until nothing was left, so the
 * moment of a slab letting go — one of the most memorable things about the
 * reference — never happened. Once a tile has lost enough of its area, or
 * takes a hit close to its seam, the REMAINING slab comes off in one piece and
 * the caller drops it as a physical body.
 *
 * Returns null when the tile stays put. Marks the tile so it can only ever
 * release once.
 */
export function releaseTile(
  s: Slab, u: number, v: number, seed: number,
): TileRelease | null {
  if (u < 0 || v < 0 || u >= s.uSize || v >= s.vSize) return null;
  const ti = Math.floor(u / TILE);
  const tj = Math.floor(v / TILE);
  const key = tj * 1000 + ti;
  if (s.released.has(key)) return null;

  const u0 = ti * TILE;
  const v0 = tj * TILE;
  const ci0 = Math.max(0, Math.floor(u0 / CELL));
  const ci1 = Math.min(s.w - 1, Math.ceil((u0 + TILE) / CELL) - 1);
  const cj0 = Math.max(0, Math.floor(v0 / CELL));
  const cj1 = Math.min(s.h - 1, Math.ceil((v0 + TILE) / CELL) - 1);
  if (ci1 < ci0 || cj1 < cj0) return null;

  let gone = 0;
  let total = 0;
  for (let j = cj0; j <= cj1; j++) {
    for (let i = ci0; i <= ci1; i++) {
      total++;
      if (s.cells[j * s.w + i] >= STRIP) gone++;
    }
  }
  if (total === 0) return null;
  const frac = gone / total;

  const nearSeam =
    Math.min(u % TILE, TILE - (u % TILE)) < 0.12 ||
    Math.min(v % TILE, TILE - (v % TILE)) < 0.12;
  const seamLuck = nearSeam && hash2(ti * 131 ^ seed, tj * 197) < 0.05;
  if (frac < TILE_RELEASE_FRAC && !seamLuck) return null;
  // A threshold alone cannot bound this: under sustained fire nearly every
  // tile erodes past any level, and 32 slabs coming down is texture rather
  // than punctuation. A deterministic per-tile gate decides which of the
  // eligible tiles are the ones that let go whole; the rest keep crumbling
  // away as before. Keyed on the face's own origin as well as the tile, so
  // different faces make different choices.
  const pick = hash2(
    (Math.round(s.origin[0] * 13) * 73 + ti * 131) | 0,
    (Math.round(s.origin[2] * 17) * 37 + tj * 197) | 0,
  );
  if (pick > 0.16) return null;
  // a tile with nothing left on it has nothing to drop
  if (frac > 0.93) { s.released.add(key); return null; }

  let stripped = 0;
  for (let j = cj0; j <= cj1; j++) {
    for (let i = ci0; i <= ci1; i++) {
      const idx = j * s.w + i;
      if (s.cells[idx] >= STRIP) continue;
      s.cells[idx] = 255;
      stripped++;
      if (i < s.minI) s.minI = i;
      if (i > s.maxI) s.maxI = i;
      if (j < s.minJ) s.minJ = j;
      if (j > s.maxJ) s.maxJ = j;
    }
  }
  s.released.add(key);
  s.stripped += stripped;
  s.version++;
  return { u0, v0, size: TILE, stripped };
}


/**
 * A13: pick the most-eroded tile on a face that has not already let go, and
 * release it regardless of the usual threshold and gate.
 *
 * Used only for the closing gag — the hall is empty, and one last loosened
 * tile gives way on its own. Deterministic: the tile is chosen by the highest
 * stripped fraction, ties broken by index, so a replay drops the same one.
 */
export function forceReleaseTile(s: Slab): TileRelease | null {
  const tilesU = Math.max(1, Math.floor(s.uSize / TILE));
  const tilesV = Math.max(1, Math.floor(s.vSize / TILE));
  let bestKey = -1;
  let bestFrac = 0;
  let bestU = 0;
  let bestV = 0;
  for (let tj = 0; tj < tilesV; tj++) {
    for (let ti = 0; ti < tilesU; ti++) {
      const key = tj * 1000 + ti;
      if (s.released.has(key)) continue;
      const u0 = ti * TILE;
      const v0 = tj * TILE;
      const ci0 = Math.max(0, Math.floor(u0 / CELL));
      const ci1 = Math.min(s.w - 1, Math.ceil((u0 + TILE) / CELL) - 1);
      const cj0 = Math.max(0, Math.floor(v0 / CELL));
      const cj1 = Math.min(s.h - 1, Math.ceil((v0 + TILE) / CELL) - 1);
      let gone = 0;
      let total = 0;
      for (let j = cj0; j <= cj1; j++) {
        for (let i = ci0; i <= ci1; i++) {
          total++;
          if (s.cells[j * s.w + i] >= STRIP) gone++;
        }
      }
      if (total === 0) continue;
      const frac = gone / total;
      // it has to have something left to fall, and enough gone to be loose
      if (frac < 0.12 || frac > 0.95) continue;
      // A13: prefer a HIGH loose tile. The gag is the last thing in the film,
      // so it wants air time — a tile at 1.5 m is on the floor in 0.4 s and is
      // over before the eye finds it, where one up the column falls for long
      // enough to be seen going. Erosion still counts, so the tile that lets
      // go is a plausibly loose one rather than an arbitrary high one.
      const score = frac * 0.45 + (v0 / s.vSize) * 0.55;
      if (score > bestFrac) { bestFrac = score; bestKey = key; bestU = u0; bestV = v0; }
    }
  }
  if (bestKey < 0) return null;
  const ci0 = Math.max(0, Math.floor(bestU / CELL));
  const ci1 = Math.min(s.w - 1, Math.ceil((bestU + TILE) / CELL) - 1);
  const cj0 = Math.max(0, Math.floor(bestV / CELL));
  const cj1 = Math.min(s.h - 1, Math.ceil((bestV + TILE) / CELL) - 1);
  let stripped = 0;
  for (let j = cj0; j <= cj1; j++) {
    for (let i = ci0; i <= ci1; i++) {
      const idx = j * s.w + i;
      if (s.cells[idx] >= STRIP) continue;
      s.cells[idx] = 255;
      stripped++;
      if (i < s.minI) s.minI = i;
      if (i > s.maxI) s.maxI = i;
      if (j < s.minJ) s.minJ = j;
      if (j > s.maxJ) s.maxJ = j;
    }
  }
  s.released.add(bestKey);
  s.stripped += stripped;
  s.version++;
  return { u0: bestU, v0: bestV, size: TILE, stripped };
}
