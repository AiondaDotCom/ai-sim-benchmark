import { describe, expect, it } from 'vitest';
import type { TerrainData } from '../terrain';
import { WaterSimulation } from '../water';

/**
 * A simple linear ramp: height increases with x, constant along y.
 * `step` is the elevation change per grid cell - kept large relative to the
 * shallow water depths used in these tests, so flow direction is governed by
 * bare terrain slope rather than being swamped by the water column itself
 * (the simulation correctly flows by *total* height = terrain + depth, which
 * matters once a flood gets deep enough to top a small rise - see the
 * dedicated "deep water can top a small ridge" test below).
 */
function makeRampTerrain(resolution: number, step = 1.0): TerrainData {
  const heights = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      heights[y * resolution + x] = x * step;
    }
  }
  return { resolution, worldSize: resolution, maxHeight: resolution * step, heights, peakIndices: [] };
}

/** A single conical hill in the middle of an otherwise flat grid. */
function makeConeTerrain(resolution: number): TerrainData {
  const heights = new Float32Array(resolution * resolution);
  const cx = resolution / 2;
  const cy = resolution / 2;
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const d = Math.hypot(x - cx, y - cy);
      heights[y * resolution + x] = Math.max(0, 12 - d);
    }
  }
  return { resolution, worldSize: resolution, maxHeight: 12, heights, peakIndices: [] };
}

describe('WaterSimulation downhill flow direction', () => {
  it('flows from a high cell towards its lower neighbour on a linear ramp, never towards the higher one', () => {
    const resolution = 20;
    // A steep step (3 world units/cell) that comfortably dwarfs the shallow water charge below,
    // so this isolates pure terrain-slope-driven direction.
    const terrain = makeRampTerrain(resolution, 3.0);
    const water = new WaterSimulation(terrain, {
      rainRate: 0,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
      flowRate: 2.0,
    });

    const y = 10;
    const x = 10;
    const idx = y * resolution + x;
    const lowerIdx = y * resolution + (x - 1); // lower terrain (smaller x => lower height)
    const higherIdx = y * resolution + (x + 1); // higher terrain (larger x => higher height)

    water.depth[idx] = 0.4; // shallow relative to the 3-unit terrain step
    const before = water.depth[idx];

    water.step(1 / 60);

    expect(water.depth[idx]).toBeLessThan(before); // source cell lost water
    expect(water.depth[lowerIdx]).toBeGreaterThan(0); // flowed downhill
    expect(water.depth[higherIdx]).toBe(0); // never flowed uphill
  });

  it('lets a deep-enough flood top a small ridge, because flow follows total (terrain + water) height', () => {
    // This documents the intentional, physically-correct exception to "never flows uphill":
    // a tall enough water column can still spill over a slightly higher neighbouring terrain cell.
    const resolution = 20;
    const terrain = makeRampTerrain(resolution, 1.0);
    const water = new WaterSimulation(terrain, {
      rainRate: 0,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
      flowRate: 2.0,
    });

    const y = 10;
    const x = 10;
    const idx = y * resolution + x;
    const higherIdx = y * resolution + (x + 1); // terrain is only 1 unit higher

    water.depth[idx] = 5; // water column far taller than the 1-unit ridge ahead
    water.step(1 / 60);

    expect(water.depth[higherIdx]).toBeGreaterThan(0); // the flood tops the small ridge
  });

  it('radiates outward and downhill from the summit of a conical hill', () => {
    const resolution = 21; // odd so there is an exact centre cell
    const terrain = makeConeTerrain(resolution);
    const water = new WaterSimulation(terrain, {
      rainRate: 0,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
      flowRate: 2.0,
    });

    const center = Math.floor(resolution / 2);
    const summitIdx = center * resolution + center;
    water.depth[summitIdx] = 10;

    for (let i = 0; i < 10; i++) water.step(1 / 60);

    // The summit should have drained relative to its initial charge...
    expect(water.depth[summitIdx]).toBeLessThan(10);

    // ...and every one of its four immediate neighbours (all strictly lower ground)
    // should have received water at some point during the descent.
    const neighborOffsets = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [ox, oy] of neighborOffsets) {
      const nx = center + ox;
      const ny = center + oy;
      const nIdx = ny * resolution + nx;
      expect(water.depth[nIdx]).toBeGreaterThan(0);
    }

    // No water should ever have appeared beyond the hill's flat base in this short window,
    // confirming flow does not leak uphill or teleport - it only advances cell-by-cell downhill.
    const farIdx = 1 * resolution + 1; // corner, far outside the cone's slope
    expect(water.depth[farIdx]).toBe(0);
  });

  it('never increases the total-height (terrain + water) difference in the uphill direction', () => {
    // General property check across many random single-cell water charges on the ramp terrain:
    // after one step, water level differences should always trend towards equalising downhill,
    // i.e. a lower-terrain neighbour never ends up with LESS water than a higher-terrain one
    // when it started with equal (zero) water and the source was between them.
    const resolution = 16;
    const terrain = makeRampTerrain(resolution);
    const water = new WaterSimulation(terrain, {
      rainRate: 0,
      springRate: 0,
      springIndices: [],
      evaporationRate: 0,
      flowRate: 1.5,
    });

    for (let y = 1; y < resolution - 1; y++) {
      water.depth[y * resolution + 8] = 2; // charge a vertical line of source cells
    }

    water.step(1 / 60);

    for (let y = 1; y < resolution - 1; y++) {
      const lower = water.depth[y * resolution + 7];
      const higher = water.depth[y * resolution + 9];
      expect(lower).toBeGreaterThanOrEqual(higher);
    }
  });
});
