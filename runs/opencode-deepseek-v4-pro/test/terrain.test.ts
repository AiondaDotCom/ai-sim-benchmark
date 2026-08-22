import { describe, it, expect } from 'vitest';
import { generateTerrain } from '../src/sim/terrain';

describe('deterministic terrain generation', () => {
  it('produces identical heights for the same seed and size', () => {
    const a = generateTerrain(42, 128);
    const b = generateTerrain(42, 128);
    expect(a.heights).toEqual(b.heights);
  });

  it('produces different landscapes for different seeds', () => {
    const a = generateTerrain(1, 128);
    const b = generateTerrain(2, 128);
    expect(Array.from(a.heights)).not.toEqual(Array.from(b.heights));
  });

  it('has the correct size and a normalised height range', () => {
    const t = generateTerrain(7, 64);
    expect(t.size).toBe(64);
    expect(t.heights.length).toBe(64 * 64);
    for (let i = 0; i < t.heights.length; i++) {
      expect(Number.isFinite(t.heights[i])).toBe(true);
      expect(t.heights[i]).toBeGreaterThanOrEqual(0);
      expect(t.heights[i]).toBeLessThanOrEqual(1);
    }
  });

  it('is higher in the mountainous centre than at the coastal edge', () => {
    const t = generateTerrain(99, 129);
    const center = t.heights[64 * 129 + 64];
    let edge = 0;
    for (let i = 0; i < t.size; i++) edge += t.heights[i];
    edge /= t.size;
    expect(center).toBeGreaterThan(edge);
  });
});