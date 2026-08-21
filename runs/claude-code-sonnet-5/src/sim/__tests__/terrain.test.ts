import { describe, expect, it } from 'vitest';
import { generateTerrain } from '../terrain';

describe('generateTerrain (determinism)', () => {
  it('produces byte-for-byte identical heightmaps for the same seed', () => {
    const a = generateTerrain({ seed: 'alpine-1', resolution: 48 });
    const b = generateTerrain({ seed: 'alpine-1', resolution: 48 });

    expect(a.heights.length).toBe(b.heights.length);
    for (let i = 0; i < a.heights.length; i++) {
      expect(a.heights[i]).toBe(b.heights[i]);
    }
    expect(a.peakIndices).toEqual(b.peakIndices);
  });

  it('produces identical results across repeated calls with a numeric seed too', () => {
    const a = generateTerrain({ seed: 12345, resolution: 32 });
    const b = generateTerrain({ seed: 12345, resolution: 32 });
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('produces different terrain for different seeds', () => {
    const a = generateTerrain({ seed: 'seed-one', resolution: 48 });
    const b = generateTerrain({ seed: 'seed-two', resolution: 48 });

    let differing = 0;
    for (let i = 0; i < a.heights.length; i++) {
      if (Math.abs(a.heights[i] - b.heights[i]) > 1e-6) differing++;
    }
    // The vast majority of cells should differ between two unrelated seeds.
    expect(differing).toBeGreaterThan(a.heights.length * 0.5);
  });

  it('generates elevations within the configured bounds and includes real relief', () => {
    const terrain = generateTerrain({ seed: 'bounds-check', resolution: 64, maxHeight: 30 });
    let min = Infinity;
    let max = -Infinity;
    for (const h of terrain.heights) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(max).toBeLessThanOrEqual(30 + 1e-6);
    expect(max - min).toBeGreaterThan(5); // there should be meaningful mountain relief, not a flat plane
  });

  it('finds at least one candidate peak for spring placement', () => {
    const terrain = generateTerrain({ seed: 'peaks-check', resolution: 64 });
    expect(terrain.peakIndices.length).toBeGreaterThan(0);
    // Every reported peak must be a real local maximum (>= all four axis neighbours).
    const { resolution, heights } = terrain;
    for (const idx of terrain.peakIndices) {
      const x = idx % resolution;
      const y = Math.floor(idx / resolution);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(resolution - 1);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(resolution - 1);
      const h = heights[idx];
      expect(h).toBeGreaterThanOrEqual(heights[idx - 1]);
      expect(h).toBeGreaterThanOrEqual(heights[idx + 1]);
      expect(h).toBeGreaterThanOrEqual(heights[idx - resolution]);
      expect(h).toBeGreaterThanOrEqual(heights[idx + resolution]);
    }
  });
});
