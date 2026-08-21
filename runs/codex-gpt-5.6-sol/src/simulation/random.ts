/** Stable 32-bit string hash used to turn URL-friendly seeds into numbers. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG suitable for procedural generation (not cryptography). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function latticeHash(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

const smooth = (value: number): number => value * value * value * (value * (value * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = lerp(latticeHash(x0, y0, seed), latticeHash(x0 + 1, y0, seed), tx);
  const b = lerp(latticeHash(x0, y0 + 1, seed), latticeHash(x0 + 1, y0 + 1, seed), tx);
  return lerp(a, b, ty);
}

export function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * frequency, y * frequency, seed + octave * 7919) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / normalizer;
}
