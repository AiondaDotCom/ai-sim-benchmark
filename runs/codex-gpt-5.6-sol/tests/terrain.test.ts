import { describe, expect, it } from 'vitest';
import { generateTerrain } from '../src/simulation/terrain';

describe('deterministic terrain generation', () => {
  it('generates byte-for-byte identical height fields from the same seed', () => {
    const first = generateTerrain('repeatable-alps', 41, 80);
    const second = generateTerrain('repeatable-alps', 41, 80);

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
    expect(first.peaks).toEqual(second.peaks);
    expect(first.minHeight).toBe(second.minHeight);
    expect(first.maxHeight).toBe(second.maxHeight);
  });

  it('changes the landscape when the seed changes', () => {
    const first = generateTerrain('ridge-a', 33, 60);
    const second = generateTerrain('ridge-b', 33, 60);
    let changedCells = 0;
    for (let index = 0; index < first.heights.length; index += 1) {
      if (Math.abs(first.heights[index] - second.heights[index]) > 1e-9) changedCells += 1;
    }

    expect(changedCells).toBeGreaterThan(first.heights.length * 0.95);
    expect(first.maxHeight).toBeGreaterThan(first.minHeight + 10);
  });
});
