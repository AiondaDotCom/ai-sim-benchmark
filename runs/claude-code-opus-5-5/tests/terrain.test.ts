import { describe, expect, it } from 'vitest';
import { findSprings, generateTerrain, steepestDescentNeighbour } from '../src/sim/terrain';
import { mulberry32, seedFromString } from '../src/sim/random';
import { createSimplexNoise2D } from '../src/sim/noise';

function hash(values: Float32Array): number {
  let h = 0x811c9dc5;
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('deterministic randomness', () => {
  it('mulberry32 reproduces the same sequence for the same seed', () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('mulberry32 stays in [0, 1)', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seedFromString maps numbers to themselves and strings to stable hashes', () => {
    expect(seedFromString('42')).toBe(42);
    expect(seedFromString('alps')).toBe(seedFromString('alps'));
    expect(seedFromString('alps')).not.toBe(seedFromString('andes'));
  });

  it('simplex noise is deterministic and bounded', () => {
    const n1 = createSimplexNoise2D(mulberry32(7));
    const n2 = createSimplexNoise2D(mulberry32(7));
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.137 - 50;
      const y = i * 0.071 + 13;
      const v = n1(x, y);
      expect(v).toBe(n2(x, y));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('generateTerrain', () => {
  it('produces bit-identical heightfields for the same seed', () => {
    const a = generateTerrain({ size: 96, seed: 1234, maxHeight: 20 });
    const b = generateTerrain({ size: 96, seed: 1234, maxHeight: 20 });
    expect(hash(a.heights)).toBe(hash(b.heights));
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(a.basins).toEqual(b.basins);
  });

  it('produces different heightfields for different seeds', () => {
    const a = generateTerrain({ size: 96, seed: 1, maxHeight: 20 });
    const b = generateTerrain({ size: 96, seed: 2, maxHeight: 20 });
    let diff = 0;
    for (let i = 0; i < a.heights.length; i++) diff += Math.abs(a.heights[i] - b.heights[i]);
    expect(diff / a.heights.length).toBeGreaterThan(0.5);
  });

  it('normalises heights to [0, maxHeight] with finite values', () => {
    const t = generateTerrain({ size: 128, seed: 77, maxHeight: 30 });
    let min = Infinity;
    let max = -Infinity;
    for (const h of t.heights) {
      expect(Number.isFinite(h)).toBe(true);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeCloseTo(0, 4);
    expect(max).toBeCloseTo(30, 3);
  });

  it('is a mountain landscape: the interior is much higher than the border', () => {
    const t = generateTerrain({ size: 128, seed: 3, maxHeight: 30 });
    const n = t.size;
    let border = 0;
    let borderCount = 0;
    let centre = 0;
    let centreCount = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const h = t.heights[y * n + x];
        const edge = Math.min(x, y, n - 1 - x, n - 1 - y);
        if (edge < 4) {
          border += h;
          borderCount++;
        } else if (Math.abs(x - n / 2) < n / 5 && Math.abs(y - n / 2) < n / 5) {
          centre += h;
          centreCount++;
        }
      }
    }
    expect(centre / centreCount).toBeGreaterThan(2 * (border / borderCount));
  });

  it('carves basins whose centre is a closed depression', () => {
    const t = generateTerrain({ size: 128, seed: 11, maxHeight: 30 });
    expect(t.basins.length).toBeGreaterThan(0);
    for (const b of t.basins) {
      // Walking downhill from the basin centre goes nowhere: it is a local minimum.
      expect(steepestDescentNeighbour(t, b.x, b.y)).toBeNull();
    }
  });

  it('places springs near high peaks deterministically', () => {
    const t = generateTerrain({ size: 128, seed: 5, maxHeight: 30 });
    const s1 = findSprings(t, 4);
    const s2 = findSprings(t, 4);
    expect(s1).toEqual(s2);
    expect(s1.length).toBeGreaterThan(0);
    const sorted = Array.from(t.heights).sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    for (const s of s1) expect(t.heights[s.y * t.size + s.x]).toBeGreaterThan(p75);
  });

  it('rejects invalid sizes', () => {
    expect(() => generateTerrain({ size: 3, seed: 1, maxHeight: 1 })).toThrow();
  });
});
