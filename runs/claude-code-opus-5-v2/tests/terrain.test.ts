import { describe, expect, it } from 'vitest';
import { generateTerrain, Terrain } from '../src/sim/terrain';
import { createRng, hashSeed } from '../src/sim/rng';
import { Noise2D } from '../src/sim/noise';

const SMALL = { size: 64, cellSize: 1, amplitude: 40 };

function checksum(values: Float32Array): string {
  // Order-sensitive FNV-1a over the raw bytes: any single-sample difference
  // changes the digest.
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

describe('deterministic random source', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('alpenglow');
    const b = createRng('alpenglow');
    const seqA = Array.from({ length: 64 }, () => a());
    const seqB = Array.from({ length: 64 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = Array.from({ length: 32 }, createRng('alpenglow'));
    const b = Array.from({ length: 32 }, createRng('alpenglow-2'));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(1234);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes numeric and string seeds distinctly', () => {
    expect(hashSeed('7')).not.toBe(hashSeed(7));
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });
});

describe('noise', () => {
  it('is reproducible and bounded', () => {
    const n1 = new Noise2D('seed');
    const n2 = new Noise2D('seed');
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * -0.19;
      const v = n1.noise(x, y);
      expect(v).toBeCloseTo(n2.noise(x, y), 12);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });

  it('ridged noise stays within [0, 1]', () => {
    const n = new Noise2D('ridge');
    for (let i = 0; i < 500; i++) {
      const v = n.ridged(i * 0.11, i * 0.23, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous — neighbouring samples never jump', () => {
    const n = new Noise2D('continuity');
    let prev = n.noise(0, 0.5);
    for (let i = 1; i < 2000; i++) {
      const v = n.noise(i * 0.01, 0.5);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });
});

describe('deterministic terrain generation', () => {
  it('returns byte-identical heightfields for the same seed', () => {
    const a = generateTerrain({ seed: 'alpenglow', ...SMALL });
    const b = generateTerrain({ seed: 'alpenglow', ...SMALL });
    expect(a.heights.length).toBe(SMALL.size * SMALL.size);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(checksum(a.heights)).toBe(checksum(b.heights));
  });

  it('supports numeric seeds and is stable across instances', () => {
    const a = generateTerrain({ seed: 20260821, ...SMALL });
    const b = generateTerrain({ seed: 20260821, ...SMALL });
    expect(checksum(a.heights)).toBe(checksum(b.heights));
  });

  it('produces a genuinely different landscape for a different seed', () => {
    const a = generateTerrain({ seed: 'alpenglow', ...SMALL });
    const b = generateTerrain({ seed: 'glacier', ...SMALL });
    expect(checksum(a.heights)).not.toBe(checksum(b.heights));

    let differing = 0;
    for (let i = 0; i < a.heights.length; i++) {
      if (Math.abs(a.heights[i] - b.heights[i]) > 1e-3) differing++;
    }
    // Not just a few cells: essentially the whole field must differ.
    expect(differing / a.heights.length).toBeGreaterThan(0.95);
  });

  it('is independent of generation order (no shared global state)', () => {
    const first = generateTerrain({ seed: 'order-a', ...SMALL });
    generateTerrain({ seed: 'order-b', ...SMALL });
    generateTerrain({ seed: 'order-c', ...SMALL });
    const again = generateTerrain({ seed: 'order-a', ...SMALL });
    expect(checksum(first.heights)).toBe(checksum(again.heights));
  });

  it('yields finite heights and a mountainous relief', () => {
    const t = generateTerrain({ seed: 'relief', ...SMALL });
    for (let i = 0; i < t.heights.length; i++) {
      expect(Number.isFinite(t.heights[i])).toBe(true);
    }
    expect(t.maxHeight).toBeGreaterThan(t.minHeight);
    // The massif must actually rise: at least a third of the amplitude.
    expect(t.maxHeight - t.minHeight).toBeGreaterThan(SMALL.amplitude / 3);
  });

  it('is highest in the middle and lower around the border', () => {
    const t = generateTerrain({ seed: 'massif', size: 96, cellSize: 1, amplitude: 40 });
    const n = t.size;
    const mean = (predicate: (c: number, r: number) => boolean) => {
      let sum = 0;
      let count = 0;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!predicate(c, r)) continue;
          sum += t.heights[r * n + c];
          count++;
        }
      }
      return sum / count;
    };
    const centre = mean((c, r) => Math.hypot(c - n / 2, r - n / 2) < n * 0.18);
    const border = mean((c, r) => Math.min(c, r, n - 1 - c, n - 1 - r) < n * 0.06);
    expect(centre).toBeGreaterThan(border);
  });

  it('contains local depressions that can hold a lake', () => {
    const t = generateTerrain({ seed: 'basins', size: 128, cellSize: 1, amplitude: 46 });
    const n = t.size;
    let pits = 0;
    for (let r = 2; r < n - 2; r++) {
      for (let c = 2; c < n - 2; c++) {
        const i = r * n + c;
        const h = t.heights[i];
        if (
          h < t.heights[i - 1] &&
          h < t.heights[i + 1] &&
          h < t.heights[i - n] &&
          h < t.heights[i + n]
        ) {
          pits++;
        }
      }
    }
    expect(pits).toBeGreaterThan(0);
  });

  it('exposes bilinear sampling that agrees with the grid', () => {
    const t = generateTerrain({ seed: 'sampling', ...SMALL });
    const half = t.worldSize / 2;
    for (const [c, r] of [
      [0, 0],
      [7, 13],
      [31, 31],
      [63, 63],
    ] as const) {
      const wx = (c + 0.5) * t.cellSize - half;
      const wz = (r + 0.5) * t.cellSize - half;
      expect(t.heightAt(wx, wz)).toBeCloseTo(t.at(c, r), 4);
    }
  });

  it('finds distinct, well-separated summits', () => {
    const t = generateTerrain({ seed: 'peaks', size: 128, cellSize: 1, amplitude: 46 });
    const peaks = t.findPeaks(5, 12);
    expect(peaks.length).toBeGreaterThan(0);
    expect(new Set(peaks).size).toBe(peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        const ci = peaks[i] % t.size;
        const ri = (peaks[i] / t.size) | 0;
        const cj = peaks[j] % t.size;
        const rj = (peaks[j] / t.size) | 0;
        expect(Math.hypot(ci - cj, ri - rj)).toBeGreaterThanOrEqual(12);
      }
    }
    // Summits must be in the upper part of the elevation range.
    const mid = (t.minHeight + t.maxHeight) / 2;
    for (const p of peaks) expect(t.heights[p]).toBeGreaterThan(mid);
  });

  it('reports gradients that point along the slope', () => {
    // Synthetic ramp: h = 2 * col, so d/dcol = 2 and d/drow = 0.
    const n = 16;
    const heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = 2 * c;
    const t = new Terrain(heights, {
      seed: 'ramp',
      size: n,
      cellSize: 1,
      amplitude: 1,
      baseFrequency: 1,
      octaves: 1,
      ridgeWeight: 0,
      warpStrength: 0,
      basinCount: 0,
      erosionIterations: 0,
      talusAngle: 1,
      dropletDensity: 0,
    });
    const g = t.gradientAt(8, 8);
    expect(g.dx).toBeCloseTo(2, 6);
    expect(g.dy).toBeCloseTo(0, 6);
  });
});
