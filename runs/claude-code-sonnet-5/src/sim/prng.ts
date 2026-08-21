/**
 * Deterministic pseudo-random number generation.
 *
 * Everything in the simulation that needs randomness (terrain noise gradients,
 * jittered spring placement, etc.) must derive from a single numeric seed so
 * that the same seed always reproduces exactly the same landscape and the
 * same initial simulation state.
 */

/**
 * Hashes an arbitrary string (or number) into a 32-bit unsigned integer.
 * Uses the classic xmur3 string hash - stable across platforms and fast.
 */
export function hashSeed(input: string | number): number {
  const str = String(input);
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

/**
 * Mulberry32 - a small, fast, deterministic PRNG.
 * Given the same 32-bit integer seed it always produces the same sequence
 * of floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a deterministic PRNG function directly from any seed value. */
export function createRng(seed: string | number): () => number {
  return mulberry32(hashSeed(seed));
}
