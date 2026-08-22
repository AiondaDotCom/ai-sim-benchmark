/** FNV-1a based state hashing. Floats are quantised so that the hash is stable
 *  against irrelevant last-bit noise but still catches any real divergence. */
export class StateHasher {
  private h = 0x811c9dc5;

  int(v: number): this {
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= x & 0xff;
      this.h = Math.imul(this.h, 0x01000193) >>> 0;
      x >>>= 8;
    }
    return this;
  }

  /** Quantised to 1/4096 units. */
  num(v: number): this {
    if (!Number.isFinite(v)) return this.int(0x7fffffff);
    return this.int(Math.round(v * 4096));
  }

  vec(v: { x: number; y: number; z: number }): this {
    return this.num(v.x).num(v.y).num(v.z);
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.int(s.charCodeAt(i));
    return this;
  }

  bool(b: boolean): this {
    return this.int(b ? 1 : 0);
  }

  get value(): number {
    return this.h >>> 0;
  }

  get hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
