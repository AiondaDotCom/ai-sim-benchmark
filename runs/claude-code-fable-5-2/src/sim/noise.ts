import type { Rng } from './rng';

export type Noise2D = (x: number, y: number) => number;

const GRAD: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Classic 2D gradient (Perlin) noise with a seeded permutation table.
 * Uses only +, -, * so results are bit-identical on every JS engine.
 * Output is roughly in [-1, 1].
 */
export function createNoise2D(rng: Rng): Noise2D {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (hash: number, x: number, y: number) => {
    const g = GRAD[hash & 7];
    return g[0] * x + g[1] * y;
  };

  return (x, y) => {
    const xf = Math.floor(x);
    const yf = Math.floor(y);
    const xi = xf & 255;
    const yi = yf & 255;
    const dx = x - xf;
    const dy = y - yf;
    const u = fade(dx);
    const v = fade(dy);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = dot(aa, dx, dy) + u * (dot(ba, dx - 1, dy) - dot(aa, dx, dy));
    const x2 = dot(ab, dx, dy - 1) + u * (dot(bb, dx - 1, dy - 1) - dot(ab, dx, dy - 1));
    return (x1 + v * (x2 - x1)) * 1.41421356;
  };
}

/** Fractal Brownian motion, normalised to roughly [-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq + o * 17.3, y * freq - o * 9.1);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal noise in [0, 1]; produces sharp mountain crests. */
export function ridged(noise: Noise2D, x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise(x * freq + o * 31.7, y * freq + o * 12.9));
    n *= n;
    sum += amp * n * prev;
    norm += amp;
    prev = n;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
