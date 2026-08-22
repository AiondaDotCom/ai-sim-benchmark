/**
 * Deterministic pseudo-random and noise helpers.
 *
 * Everything here is pure and seeded so that a given seed always produces the
 * exact same terrain (verified by tests).
 */

/** Convert an arbitrary string to a 32-bit unsigned seed. */
export function stringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash two integer lattice coordinates plus a seed into [0, 1). */
function hash2(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 374761393);
  h = Math.imul(h ^ (y | 0), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinearly interpolated value noise in [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Fractional Brownian motion: sum of `octaves` value-noise layers.
 * Returns a value in roughly [0, 1].
 */
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, (seed + i * 1013) >>> 0);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}