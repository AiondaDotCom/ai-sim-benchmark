import { describe, it, expect } from 'vitest';
import { WaterSimulation } from '../src/sim/water';

function flatTerrain(size: number, value = 0.5): Float64Array {
  return new Float64Array(size * size).fill(value);
}

describe('water mass conservation', () => {
  it('conserves total volume when there are no inputs or evaporation', () => {
    const size = 48;
    const sim = new WaterSimulation(size, flatTerrain(size, 0.5), {
      rain: 0,
      springs: 0,
      evaporation: 0,
      fluxRate: 0.12,
      iterations: 2
    });

    // A tall, uneven column of water in the centre.
    sim.depth[24 * size + 24] = 5.0;
    sim.depth[24 * size + 25] = 3.0;
    sim.depth[25 * size + 24] = 1.0;
    const before = sim.totalWater();

    for (let i = 0; i < 300; i++) sim.step(0);

    const after = sim.totalWater();
    expect(after).toBeCloseTo(before, 9);
  });

  it('grows total volume under rainfall', () => {
    const size = 32;
    const sim = new WaterSimulation(size, flatTerrain(size), {
      rain: 0.1,
      springs: 0,
      evaporation: 0,
      iterations: 1
    });
    const before = sim.totalWater();
    sim.step(1);
    expect(sim.totalWater()).toBeGreaterThan(before);
  });
});

describe('downhill flow direction', () => {
  it('moves water from high terrain toward lower terrain', () => {
    const size = 64;
    // Height decreases with column index: col 0 is highest, col 63 lowest.
    const terrain = new Float64Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        terrain[y * size + x] = 1 - x / (size - 1);
      }
    }

    const sim = new WaterSimulation(size, terrain, {
      rain: 0,
      springs: 0,
      evaporation: 0,
      fluxRate: 0.15,
      iterations: 2
    });

    // A drop near the top (low column index = high terrain).
    const row = Math.floor(size / 2);
    const source = row * size + 1;
    sim.depth[source] = 1.0;

    for (let i = 0; i < 600; i++) sim.step(0);

    // Water has flowed into the lower (high column index = downhill) half.
    let downhillAfter = 0;
    for (let y = 0; y < size; y++) {
      for (let x = size / 2; x < size; x++) {
        downhillAfter += sim.depth[y * size + x];
      }
    }

    expect(downhillAfter).toBeGreaterThan(0);
    // The top source cell must have drained.
    expect(sim.depth[source]).toBeLessThan(1.0);
  });
});