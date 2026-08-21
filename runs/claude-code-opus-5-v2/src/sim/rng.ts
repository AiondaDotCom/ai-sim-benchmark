/**
 * Deterministic pseudo-random number generation.
 *
 * Everything procedural in this project derives from a single seed so that a
 * given seed always reproduces the exact same landscape, on every machine and
 * in every browser. No `Math.random()` is used anywhere in the simulation.
 */

/**
 * xmur3 string hash -> 32 bit integer state.
 * Accepts numbers as well so `?seed=42` and `?seed=alpine` both work.
 */
export function hashSeed(seed: string | number): number {
  const str = typeof seed === 'number' ? `n:${seed}` : seed;
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A deterministic random source producing floats in [0, 1). */
export type Rng = () => number;

/** mulberry32 — small, fast, good enough statistical quality for terrain. */
export function createRng(seed: string | number): Rng {
  let a = hashSeed(seed);
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
