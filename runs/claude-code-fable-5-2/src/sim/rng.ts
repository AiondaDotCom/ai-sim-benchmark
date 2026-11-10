/** Deterministic pseudo random numbers (no dependence on Math.random). */

export type Rng = () => number;

/** mulberry32: small, fast, well distributed 32-bit generator returning [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turns an arbitrary seed (number or text, e.g. from a URL parameter) into a
 * 32-bit unsigned integer. Integers map to themselves, everything else is
 * hashed with FNV-1a.
 */
export function toSeed(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(Math.abs(value)) >>> 0;
  }
  const text = String(value).trim();
  if (/^\d{1,9}$/.test(text)) return Number(text) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
