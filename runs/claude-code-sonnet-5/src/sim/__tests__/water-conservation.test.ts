import { describe, expect, it } from 'vitest';
import type { TerrainData } from '../terrain';
import { WaterSimulation } from '../water';

/** Builds a bumpy synthetic terrain (no rain/springs involved) purely for flow-mechanics tests. */
function makeBumpyTerrain(resolution: number): TerrainData {
  const heights = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / (resolution - 1);
      const v = y / (resolution - 1);
      // A couple of overlapping hills/valleys - enough irregularity to exercise multi-directional flow.
      heights[y * resolution + x] =
        Math.sin(u * Math.PI * 2) * 4 + Math.cos(v * Math.PI * 1.5) * 3 + (u - v) * 2;
    }
  }
  return { resolution, worldSize: resolution, maxHeight: 10, heights, peakIndices: [] };
}

describe('WaterSimulation mass conservation', () => {
  it('conserves total water volume across many flow-only steps (no rain, no springs, no evaporation)', () => {
    const resolution = 40;
    const terrain = makeBumpyTerrain(resolution);
    const water = new WaterSimulation(terrain, {
      rainRate: 0,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
      flowRate: 2.5,
    });

    // Seed a few "puddles" of water at arbitrary cells.
    const seedCells = [
      { x: 5, y: 5, amount: 3 },
      { x: 20, y: 12, amount: 5 },
      { x: 30, y: 30, amount: 2 },
      { x: 10, y: 25, amount: 4 },
    ];
    for (const c of seedCells) {
      water.depth[c.y * resolution + c.x] = c.amount;
    }

    const initialVolume = water.totalVolume();
    expect(initialVolume).toBeGreaterThan(0);

    for (let i = 0; i < 300; i++) {
      water.step(1 / 60);
    }

    const finalVolume = water.totalVolume();
    const relativeError = Math.abs(finalVolume - initialVolume) / initialVolume;
    expect(relativeError).toBeLessThan(1e-3);
  });

  it('does not fabricate water when starting completely dry', () => {
    const resolution = 24;
    const terrain = makeBumpyTerrain(resolution);
    const water = new WaterSimulation(terrain, {
      rainRate: 0,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
    });

    for (let i = 0; i < 50; i++) water.step(1 / 60);
    expect(water.totalVolume()).toBe(0);
  });

  it('increases volume by approximately the injected amount when only rain sources run', () => {
    const resolution = 16;
    const terrain = makeBumpyTerrain(resolution);
    const rainRate = 0.02;
    const water = new WaterSimulation(terrain, {
      rainRate,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
    });

    const dt = 1 / 60;
    const steps = 120;
    for (let i = 0; i < steps; i++) {
      water.addSources(dt);
      water.step(dt);
    }

    const expectedVolume = rainRate * dt * steps * resolution * resolution;
    const actualVolume = water.totalVolume();
    const relativeError = Math.abs(actualVolume - expectedVolume) / expectedVolume;
    expect(relativeError).toBeLessThan(1e-2);
  });
});
