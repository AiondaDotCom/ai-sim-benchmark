/**
 * Deterministic, seedable 2D value noise + fractal helpers.
 *
 * Everything here is a pure function of its inputs (including the seed):
 * no global state, no Math.random(). This is what makes terrain
 * generation reproducible across runs and platforms.
 */

/** 32-bit integer lattice hash -> [0, 1). Deterministic for (x, y, seed). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintic fade curve (C2-continuous interpolation weight). */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth 2D value noise in [-1, 1]. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const v00 = hash2(ix, iy, seed);
  const v10 = hash2(ix + 1, iy, seed);
  const v01 = hash2(ix, iy + 1, seed);
  const v11 = hash2(ix + 1, iy + 1, seed);

  const u = fade(fx);
  const v = fade(fy);

  const n = lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  return n * 2 - 1;
}

export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
}

/** Fractal Brownian motion (sum of octaves), output roughly in [-1, 1]. */
export function fbm2(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const octaves = opts.octaves ?? 5;
  const lacunarity = opts.lacunarity ?? 2.0;
  const gain = opts.gain ?? 0.5;

  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // Different derived seed per octave decorrelates the octaves.
    sum += amp * valueNoise2(x * freq + o * 17.31, y * freq - o * 9.7, seed + o * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged multifractal noise, output in [0, 1]; sharp crests at 1.
 * Produces mountain-ridge like features.
 */
export function ridged2(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const octaves = opts.octaves ?? 5;
  const lacunarity = opts.lacunarity ?? 2.0;
  const gain = opts.gain ?? 0.5;

  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise2(x * freq - o * 11.17, y * freq + o * 23.9, seed + 7919 + o * 271);
    const r = 1 - Math.abs(n); // ridge: fold noise around 0
    sum += amp * r * r;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
