import { describe, expect, it } from 'vitest';
import { generateTerrain } from '../src/sim/terrain';

function minOf(t: { height: Float32Array }): number {
  let m = Infinity;
  for (let k = 0; k < t.height.length; k++) m = Math.min(m, t.height[k]);
  return m;
}

/** Mean height of the outermost cell ring (the border wall). */
function borderMean(t: { n: number; height: Float32Array }): number {
  const { n, height } = t;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (const j of [0, n - 1]) {
      sum += height[j * n + i];
      count++;
    }
    for (let j = 1; j < n - 1; j++) {
      sum += height[j * n + 0];
      sum += height[j * n + n - 1];
      count += 2;
    }
  }
  return sum / count;
}

describe('deterministic terrain generation', () => {
  it('produces bit-identical heightfields for the same seed', () => {
    const a = generateTerrain({ seed: 42, n: 64 });
    const b = generateTerrain({ seed: 42, n: 64 });
    expect(a.height.length).toBe(64 * 64);
    for (let k = 0; k < a.height.length; k++) {
      expect(a.height[k]).toBe(b.height[k]);
    }
    expect(a.maxHeight).toBe(b.maxHeight);
  });

  it('produces different terrain for different seeds', () => {
    const a = generateTerrain({ seed: 42, n: 64 });
    const b = generateTerrain({ seed: 43, n: 64 });
    let differs = false;
    for (let k = 0; k < a.height.length; k++) {
      if (a.height[k] !== b.height[k]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('respects the requested resolution and grid geometry', () => {
    const t = generateTerrain({ seed: 7, n: 96 });
    expect(t.n).toBe(96);
    expect(t.height.length).toBe(96 * 96);
    expect(t.size).toBeCloseTo(t.n * t.cellSize, 10);
  });

  it('only contains finite, non-negative heights', () => {
    const t = generateTerrain({ seed: 999, n: 64 });
    for (let k = 0; k < t.height.length; k++) {
      expect(Number.isFinite(t.height[k])).toBe(true);
      expect(t.height[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it('forms mountains: a wide height range with real relief', () => {
    const t = generateTerrain({ seed: 1337, n: 128 });
    const min = minOf(t);
    expect(t.maxHeight).toBeGreaterThan(12);
    expect(t.maxHeight - min).toBeGreaterThan(10);
  });

  it('seals the map border with a rim wall higher than the lowlands', () => {
    const t = generateTerrain({ seed: 1337, n: 128 });
    // The rim wall is 9..13 world units plus floor; the lowland floor
    // undulates 0..4.5. The wall must stand above the lowland everywhere.
    const lowlandMax = Math.max(...Array.from(t.height).filter((h) => h < 8));
    expect(borderMean(t)).toBeGreaterThan(8);
    expect(borderMean(t)).toBeGreaterThan(lowlandMax);
  });
});
