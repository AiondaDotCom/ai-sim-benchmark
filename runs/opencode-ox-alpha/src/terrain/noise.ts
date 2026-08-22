/**
 * Deterministic PRNG (mulberry32). Same seed -> same sequence.
 */
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

/** Hash an integer grid coordinate pair into [0,1) deterministically. */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic value noise in [-1, 1]. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smoothstep(x - xi);
  const ty = smoothstep(y - yi);

  const v00 = hash2(xi, yi, seed) * 2 - 1;
  const v10 = hash2(xi + 1, yi, seed) * 2 - 1;
  const v01 = hash2(xi, yi + 1, seed) * 2 - 1;
  const v11 = hash2(xi + 1, yi + 1, seed) * 2 - 1;

  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * ty;
  return a + (b - a) * ty;
}

/** Fractal Brownian motion built on value noise. Returns roughly [-1, 1]. */
export function fbm2D(x: number, y: number, seed: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 1013904223);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}
