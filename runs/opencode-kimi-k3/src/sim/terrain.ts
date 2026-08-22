import { hash2i, mulberry32 } from './rng';

/**
 * Procedural mountain terrain generated deterministically from an integer seed.
 *
 * The heightmap is a combination of:
 *  - fractal Brownian motion (value noise, 5 octaves) for rolling base relief,
 *  - a ridged noise layer for sharp mountain crests,
 *  - a handful of seeded Gaussian basins that act as natural lake beds,
 *  - a downward slope towards the map border so water can drain off the edge.
 */

export interface TerrainConfig {
  /** Grid resolution (size x size cells). */
  size: number;
  /** Integer seed — same seed => identical terrain. */
  seed: number;
  /** Overall height multiplier (world units). */
  heightScale?: number;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smoothly interpolated value noise in [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = hash2i(xi, yi, seed);
  const b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed);
  const d = hash2i(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal Brownian motion: weighted sum of value-noise octaves, normalized to ~[0,1]. */
export function fbm(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Ridged fBm: sharp crests, good for mountain ranges, ~[0,1]. */
function ridgedFbm(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(x * freq, y * freq, seed + 771 + o * 131);
    const r = 1 - Math.abs(2 * n - 1);
    sum += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.11;
  }
  return sum / norm;
}

export interface Peak {
  x: number;
  y: number;
  h: number;
}

export class Terrain {
  readonly size: number;
  readonly seed: number;
  readonly heights: Float32Array;

  constructor(config: TerrainConfig) {
    this.size = config.size;
    this.seed = config.seed;
    this.heights = new Float32Array(this.size * this.size);
    this.generate(config.heightScale ?? 1);
  }

  /** Build a terrain directly from a heightmap (used by tests). */
  static fromHeights(size: number, heights: ArrayLike<number>, seed = 0): Terrain {
    const t = Object.create(Terrain.prototype) as Terrain;
    (t as { size: number }).size = size;
    (t as { seed: number }).seed = seed;
    (t as { heights: Float32Array }).heights = Float32Array.from(heights);
    return t;
  }

  index(x: number, y: number): number {
    return y * this.size + x;
  }

  height(x: number, y: number): number {
    return this.heights[this.index(x, y)];
  }

  private generate(heightScale: number): void {
    const { size, seed } = this;
    const rng = mulberry32(seed ^ 0x9e3779b9);

    // Seeded lake basins (Gaussian depressions).
    const basins: { x: number; y: number; r: number; d: number }[] = [];
    const basinCount = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < basinCount; i++) {
      basins.push({
        x: 0.15 + rng() * 0.7,
        y: 0.15 + rng() * 0.7,
        r: 0.08 + rng() * 0.12,
        d: 0.25 + rng() * 0.3,
      });
    }

    const F = 3.0; // base noise frequency across the map
    let min = Infinity;
    let max = -Infinity;
    const raw = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / (size - 1);
        const ny = y / (size - 1);
        const base = fbm(nx * F, ny * F, 5, seed);
        const ridge = ridgedFbm(nx * F, ny * F, 4, seed);
        // Ridged mountains only where the base noise is already high.
        const mask = Math.min(1, Math.max(0, (base - 0.45) / 0.3));
        let h = Math.pow(base, 1.6) * 0.75 + ridge * ridge * mask * 0.55;

        // Carve lake basins.
        for (const b of basins) {
          const dx = (nx - b.x) / b.r;
          const dy = (ny - b.y) / b.r;
          h -= b.d * Math.exp(-(dx * dx + dy * dy));
        }

        // Slope the outer rim downwards so water can drain off the map.
        const edge = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2;
        const rim = Math.min(1, Math.max(0, (edge - 0.86) / 0.14));
        h -= rim * rim * 0.6;

        const i = y * size + x;
        raw[i] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }

    // Normalize to [0, 1] then scale to world heights.
    const range = max - min || 1;
    const HEIGHT = 22 * heightScale;
    for (let i = 0; i < raw.length; i++) {
      this.heights[i] = ((raw[i] - min) / range) * HEIGHT;
    }
  }

  /**
   * Find local maxima (mountain peaks) — used to place springs.
   * Deterministic for a given terrain.
   */
  findPeaks(count: number, minHeightFraction = 0.55): Peak[] {
    const { size, heights } = this;
    let max = 0;
    for (let i = 0; i < heights.length; i++) if (heights[i] > max) max = heights[i];
    const threshold = max * minHeightFraction;
    const peaks: Peak[] = [];
    const R = 3; // local-maximum window radius
    for (let y = R; y < size - R; y++) {
      for (let x = R; x < size - R; x++) {
        const h = heights[y * size + x];
        if (h < threshold) continue;
        let isMax = true;
        for (let dy = -R; dy <= R && isMax; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (heights[(y + dy) * size + (x + dx)] > h) {
              isMax = false;
              break;
            }
          }
        }
        if (isMax) peaks.push({ x, y, h });
      }
    }
    // Highest peaks first, enforce a minimum separation.
    peaks.sort((a, b) => b.h - a.h);
    const chosen: Peak[] = [];
    const minDist = size / 8;
    for (const p of peaks) {
      if (chosen.every((c) => Math.hypot(c.x - p.x, c.y - p.y) >= minDist)) {
        chosen.push(p);
        if (chosen.length >= count) break;
      }
    }
    return chosen;
  }
}
