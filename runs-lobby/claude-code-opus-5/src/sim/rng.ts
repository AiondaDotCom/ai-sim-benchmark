/** Seeded, allocation-free PRNG (mulberry32). Every stochastic decision in the
 *  simulation draws from one of these so that a seed fully determines the run. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0,1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [a,b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Uniform in [-a,a). */
  sym(a: number): number {
    return this.range(-a, a);
  }

  /** Integer in [0,n). */
  int(n: number): number {
    return Math.min(n - 1, Math.floor(this.next() * n));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  fork(salt: number): Rng {
    return new Rng((this.s ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
  }
}

/** Deterministic string → 32 bit seed, used to turn cue names into variants. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
