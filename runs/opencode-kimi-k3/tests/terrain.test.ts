import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/sim/terrain';

describe('terrain generation', () => {
  it('is deterministic: same seed produces an identical heightmap', () => {
    const a = new Terrain({ size: 64, seed: 42 });
    const b = new Terrain({ size: 64, seed: 42 });
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('produces different terrain for different seeds', () => {
    const a = new Terrain({ size: 64, seed: 42 });
    const b = new Terrain({ size: 64, seed: 43 });
    let diff = 0;
    for (let i = 0; i < a.heights.length; i++) {
      diff += Math.abs(a.heights[i] - b.heights[i]);
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('has meaningful relief (mountains and depressions)', () => {
    const t = new Terrain({ size: 96, seed: 1337 });
    let min = Infinity;
    let max = -Infinity;
    for (const h of t.heights) {
      if (h < min) min = h;
      if (h > max) max = h;
    }
    expect(max - min).toBeGreaterThan(5);
    // Basins should pull the minimum close to 0 after normalization.
    expect(min).toBeLessThan(1);
  });

  it('finds peaks deterministically', () => {
    const t = new Terrain({ size: 96, seed: 7 });
    const p1 = t.findPeaks(5);
    const p2 = t.findPeaks(5);
    expect(p1.length).toBeGreaterThan(0);
    expect(p1).toEqual(p2);
    // Peaks must be local maxima.
    for (const p of p1) {
      const h = t.height(p.x, p.y);
      expect(h).toBeGreaterThanOrEqual(t.height(p.x - 1, p.y));
      expect(h).toBeGreaterThanOrEqual(t.height(p.x + 1, p.y));
      expect(h).toBeGreaterThanOrEqual(t.height(p.x, p.y - 1));
      expect(h).toBeGreaterThanOrEqual(t.height(p.x, p.y + 1));
    }
  });
});
