import { fbm } from './prng';

/** A square height field. Heights are normalized to [0, 1] (roughly). */
export interface Terrain {
  /** Number of cells along each axis. Total cell count is size * size. */
  size: number;
  /** Row-major heights: heights[row * size + col]. */
  heights: Float32Array;
  min: number;
  max: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generate a deterministic mountain landscape.
 *
 * The height of each cell is fractional Brownian motion, reshaped by a radial
 * "island" falloff so that the center of the map is mountainous and the edges
 * are near sea level (water pools at the coast and in interior depressions).
 * The result only depends on `seed` and `size`.
 */
export function generateTerrain(seed: number, size: number): Terrain {
  const heights = new Float32Array(size * size);
  const c = (size - 1) / 2;
  const freqLow = 3.0 / size;
  const freqHigh = 10.0 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Two-scale relief: broad ridges/valleys (which become large lakes and
      // river catchments) plus higher-frequency detail.
      const large = fbm(x * freqLow, y * freqLow, seed, 4);
      const detail = fbm(x * freqHigh, y * freqHigh, (seed + 991) >>> 0, 5);
      let h = large * 0.6 + detail * 0.4;

      // Radial island falloff: mountainous centre, near-sea-level coast.
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      const island = 1 - smoothstep(0.15, 1.25, d);
      h = (h * 0.85 + 0.15) * (0.05 + 0.95 * island);

      heights[y * size + x] = h;
    }
  }

  // Normalise to a full [0, 1] range so colouring thresholds and spring
  // sources always map to the same relative elevations regardless of seed.
  // min/max are taken from the (float32) stored values so the range is exact.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const v = heights[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < heights.length; i++) {
    heights[i] = (heights[i] - min) / range;
  }

  return { size, heights, min: 0, max: 1 };
}