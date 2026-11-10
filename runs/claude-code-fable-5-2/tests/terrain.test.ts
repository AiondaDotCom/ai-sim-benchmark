import { describe, expect, it } from 'vitest';
import { placeSprings } from '../src/sim/sources';
import { generateTerrain, gradientAt, SEA_FLOOR_DEPTH } from '../src/sim/terrain';

describe('deterministic terrain generation', () => {
  it('produces bit-identical height fields for the same seed', () => {
    const a = generateTerrain({ seed: 1234, size: 128 });
    const b = generateTerrain({ seed: 1234, size: 128 });
    expect(a.heights.length).toBe(128 * 128);
    expect(Buffer.from(a.heights.buffer).equals(Buffer.from(b.heights.buffer))).toBe(true);
    expect(a.basins).toEqual(b.basins);
    expect(a.maxHeight).toBe(b.maxHeight);
  });

  it('matches a pinned fingerprint, so accidental changes to the generator are caught', () => {
    const t = generateTerrain({ seed: 7, size: 64 });
    // FNV-1a over the raw float bytes.
    let h = 0x811c9dc5;
    for (const byte of new Uint8Array(t.heights.buffer)) {
      h ^= byte;
      h = Math.imul(h, 0x01000193);
    }
    expect((h >>> 0).toString(16)).toMatchInlineSnapshot(`"4076d78"`);
  });

  it('produces different landscapes for different seeds', () => {
    const a = generateTerrain({ seed: 1, size: 96 });
    const b = generateTerrain({ seed: 2, size: 96 });
    let differing = 0;
    for (let i = 0; i < a.heights.length; i++) if (Math.abs(a.heights[i] - b.heights[i]) > 0.5) differing++;
    expect(differing).toBeGreaterThan(a.heights.length * 0.2);
  });

  it('is a mountainous island: finite heights, real peaks, sea all along the border', () => {
    for (const seed of [1, 7, 42, 99]) {
      const t = generateTerrain({ seed, size: 128 });
      let land = 0;
      for (const h of t.heights) {
        expect(Number.isFinite(h)).toBe(true);
        if (h > t.seaLevel) land++;
      }
      expect(t.minHeight).toBeGreaterThanOrEqual(-SEA_FLOOR_DEPTH - 1e-4);
      expect(t.maxHeight).toBeGreaterThan(35);
      expect(t.maxHeight).toBeLessThan(140);
      expect(land / t.heights.length).toBeGreaterThan(0.25);
      expect(land / t.heights.length).toBeLessThan(0.8);
      const s = t.size;
      for (let k = 0; k < s; k++) {
        for (const i of [k, (s - 1) * s + k, k * s, k * s + s - 1]) {
          expect(t.heights[i]).toBeCloseTo(-SEA_FLOOR_DEPTH, 4);
        }
      }
    }
  });

  it('contains closed depressions: every basin centre lies below its entire rim', () => {
    for (const seed of [3, 7, 42]) {
      const t = generateTerrain({ seed });
      expect(t.basins.length).toBe(3);
      for (const basin of t.basins) {
        const centre = t.heights[basin.y * t.size + basin.x];
        expect(centre).toBeGreaterThan(t.seaLevel);
        let rimMin = Infinity;
        for (let a = 0; a < 720; a++) {
          const x = Math.round(basin.x + basin.radius * Math.cos((a / 720) * 2 * Math.PI));
          const y = Math.round(basin.y + basin.radius * Math.sin((a / 720) * 2 * Math.PI));
          rimMin = Math.min(rimMin, t.heights[y * t.size + x]);
        }
        expect(rimMin - centre).toBeGreaterThan(1);
      }
    }
  });

  it('places springs deterministically, on land, high up, and at least one per basin', () => {
    const t = generateTerrain({ seed: 7 });
    const a = placeSprings(t);
    const b = placeSprings(generateTerrain({ seed: 7 }));
    expect(a).toEqual(b);
    expect(a.filter((s) => s.kind === 'peak').length).toBeGreaterThanOrEqual(2);
    expect(a.filter((s) => s.kind === 'basin').length).toBe(t.basins.length);
    for (const s of a) {
      expect(t.heights[s.y * t.size + s.x]).toBeGreaterThan(t.seaLevel + 5);
    }
    for (const s of a.filter((q) => q.kind === 'peak')) {
      expect(t.heights[s.y * t.size + s.x]).toBeGreaterThan(t.maxHeight * 0.3);
    }
  });

  it('reports gradients that point uphill', () => {
    const t = generateTerrain({ seed: 7, size: 128 });
    const [gx, gy] = gradientAt(t, 40, 64);
    const h0 = t.heights[64 * 128 + 40];
    const stepX = Math.sign(gx);
    const stepY = Math.sign(gy);
    const h1 = t.heights[(64 + stepY) * 128 + 40 + stepX];
    expect(Math.hypot(gx, gy)).toBeGreaterThan(0);
    expect(h1).toBeGreaterThan(h0);
  });
});
