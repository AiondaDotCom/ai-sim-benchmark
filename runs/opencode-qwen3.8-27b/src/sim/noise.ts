import { hash2 } from './rng';

/**
 * Deterministic 2D value noise, smooth-interpolated (quintic) lattice noise.
 * Returns values in [0, 1]. Fully a function of (x, y, seed) — no hidden state.
 */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);

  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Fractal Brownian motion built from value noise.
 * Result is normalized to roughly [0, 1]. Deterministic for fixed inputs.
 */
export function fbm2(
  x: number,
  y: number,
  seed: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // Offset each octave's seed so the octaves are independent of each other.
    sum += amp * valueNoise2(x * freq, y * freq, (seed + o * 1013904223) | 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged variant of fbm: folds each octave around 0.5 and sharpens it,
 * producing knife-edge mountain crests instead of rounded hills.
 */
export function ridgedFbm2(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
  sharpness = 1.8
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise2(x * freq, y * freq, (seed + o * 1013904223) | 0);
    const ridged = 1 - Math.abs(2 * n - 1);
    sum += amp * Math.pow(ridged, sharpness);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Hermite smoothstep. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
