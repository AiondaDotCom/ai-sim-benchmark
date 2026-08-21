/**
 * Procedural mountain-landscape generation.
 *
 * The terrain is a heightfield (row-major Float32Array, index = y * width + x)
 * generated purely from a numeric seed: same seed => bit-identical output.
 *
 * Shape recipe:
 *  - ridged multifractal noise for mountain ridges,
 *  - gentle fBm for rolling base relief,
 *  - a raised rim towards the map border (keeps water inside the map and
 *    reads as a surrounding mountain range),
 *  - a shallow central basin so lakes form in the interior.
 */

import { fbm2, ridged2, hash2 } from './noise';

export interface TerrainOptions {
  width: number;
  height: number;
  seed: number;
  /** Vertical scale of the mountains, in cell units. */
  amplitude?: number;
  /** Extra elevation of the map border rim, in cell units. */
  rimHeight?: number;
  /** Depth of the central basin, in cell units. */
  basinDepth?: number;
  /** Number of noise feature cycles across the map. */
  frequency?: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Generate a deterministic heightfield for the given options. */
export function generateTerrain(opts: TerrainOptions): Float32Array {
  const { width, height, seed } = opts;
  const amplitude = opts.amplitude ?? 34;
  const rimHeight = opts.rimHeight ?? 26;
  const basinDepth = opts.basinDepth ?? 10;
  const frequency = opts.frequency ?? 3.2;

  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const nv = y / (height - 1);
    const v = nv * 2 - 1; // [-1, 1]
    for (let x = 0; x < width; x++) {
      const nu = x / (width - 1);
      const u = nu * 2 - 1; // [-1, 1]

      // Radial distance from map centre (0 centre, ~1 at edge midpoints).
      const r = Math.sqrt(u * u + v * v);

      // Mild domain warp for less "griddy" noise features.
      const wx = fbm2(nu * 2.0 + 5.2, nv * 2.0 + 1.3, seed + 31, { octaves: 3 }) * 0.35;
      const wy = fbm2(nu * 2.0 - 3.1, nv * 2.0 + 7.7, seed + 67, { octaves: 3 }) * 0.35;
      const px = nu * frequency + wx;
      const py = nv * frequency + wy;

      const ridges = ridged2(px, py, seed, { octaves: 5, gain: 0.52 });
      const base = fbm2(px * 0.5, py * 0.5, seed + 101, { octaves: 4 });

      // Mountains get taller towards the rim; the very centre stays calmer.
      const rimMask = smoothstep(0.35, 0.95, r);
      const mountains = ridges * amplitude * (0.45 + 0.75 * rimMask);
      const rolling = base * amplitude * 0.22;
      const rim = rimHeight * smoothstep(0.62, 1.05, r);
      const basin = -basinDepth * (1 - smoothstep(0.0, 0.55, r));

      out[y * width + x] = mountains + rolling + rim + basin;
    }
  }
  return out;
}

export interface Spring {
  x: number;
  y: number;
}

/**
 * Deterministically pick spring locations near mountain peaks:
 * local maxima in a 5x5 neighbourhood, above a height percentile,
 * greedily selected highest-first with a minimum mutual distance.
 */
export function findSprings(
  heights: Float32Array,
  width: number,
  height: number,
  count: number,
  minDistance = Math.max(8, Math.floor(Math.min(width, height) / 7)),
): Spring[] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const threshold = min + 0.6 * (max - min);
  const margin = 4;

  const candidates: { x: number; y: number; h: number }[] = [];
  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const h = heights[y * width + x];
      if (h < threshold) continue;
      let isMax = true;
      for (let dy = -2; dy <= 2 && isMax; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (heights[(y + dy) * width + (x + dx)] > h) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) candidates.push({ x, y, h });
    }
  }

  // Sort by height (desc); break exact ties deterministically via hash.
  candidates.sort((a, b) => b.h - a.h || hash2(a.x, a.y, 1) - hash2(b.x, b.y, 1));

  const springs: Spring[] = [];
  const minD2 = minDistance * minDistance;
  for (const c of candidates) {
    if (springs.length >= count) break;
    let ok = true;
    for (const s of springs) {
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      if (dx * dx + dy * dy < minD2) {
        ok = false;
        break;
      }
    }
    if (ok) springs.push({ x: c.x, y: c.y });
  }
  return springs;
}
