/**
 * Deterministic pseudo random number generation.
 *
 * Everything that is random in the simulation (terrain shape, basin placement,
 * rain particle placement, ...) is derived from a single integer seed through
 * these functions, so the same seed always reproduces the same world.
 */

/** A function returning uniformly distributed numbers in [0, 1). */
export type Rng = () => number;

/** Mulberry32: tiny, fast, well distributed 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turns an arbitrary seed string (e.g. from a URL parameter) into a 32-bit
 * integer. Numeric strings map to their integer value so `?seed=42` means 42.
 */
export function seedFromString(input: string): number {
  const trimmed = input.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) >>> 0;
  }
  // FNV-1a hash for non-numeric seeds.
  let h = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
