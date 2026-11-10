import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';

describe('autonomous world', () => {
  it('is fully deterministic: two runs with the same seed stay identical', () => {
    const a = new Simulation({ seed: 11, gridSize: 96 });
    const b = new Simulation({ seed: 11, gridSize: 96 });
    a.advanceTo(40, 1e9);
    b.advanceTo(40, 1e9);
    expect(a.stepCount).toBe(b.stepCount);
    expect(Buffer.from(a.water.depth.buffer).equals(Buffer.from(b.water.depth.buffer))).toBe(true);
  });

  it('starts by itself: water appears, runs downhill to the sea and fills the lakes', () => {
    const sim = new Simulation({ seed: 7 });
    const { terrain, water } = sim;
    expect(water.totalVolume()).toBe(0);

    // Elevation at which the water was released.
    sim.advanceTo(2, 1e9);
    expect(water.totalVolume()).toBeGreaterThan(0);

    sim.advanceTo(320, 1e9);
    for (let i = 0; i < water.depth.length; i++) {
      expect(water.depth[i]).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(water.depth[i])).toBe(true);
    }

    // Streams: flowing water exists well away from every spring.
    water.updateVelocities();
    let streamCells = 0;
    for (let i = 0; i < water.depth.length; i++) {
      if (water.depth[i] > 0.03 && Math.hypot(water.velX[i], water.velY[i]) > 1) streamCells++;
    }
    expect(streamCells).toBeGreaterThan(200);

    // Rivers reached the coast.
    expect(water.stats.drained).toBeGreaterThan(500);

    // Lakes: every carved basin holds deep, almost still water.
    for (const basin of terrain.basins) {
      const i = basin.y * terrain.size + basin.x;
      expect(water.depth[i]).toBeGreaterThan(1.5);
      expect(Math.hypot(water.velX[i], water.velY[i])).toBeLessThan(0.6);
    }

    // And the books still balance after 8000 steps of rain, springs, evaporation and outflow.
    expect(Math.abs(water.massBalanceError()) / water.stats.added).toBeLessThan(1e-9);
  }, 60_000);

  it('respects the rain and spring multipliers', () => {
    const dry = new Simulation({ seed: 5, gridSize: 96, rain: 0, springs: 0 });
    dry.advanceTo(10, 1e9);
    expect(dry.water.totalVolume()).toBe(0);

    const light = new Simulation({ seed: 5, gridSize: 96, rain: 0.5, springs: 0 });
    const heavy = new Simulation({ seed: 5, gridSize: 96, rain: 2, springs: 0 });
    light.advanceTo(10, 1e9);
    heavy.advanceTo(10, 1e9);
    expect(heavy.water.stats.added / light.water.stats.added).toBeCloseTo(4, 6);
  });

  it('keeps the time step within the stability limit on a fine grid', () => {
    const sim = new Simulation({ seed: 7, gridSize: 320 });
    sim.advanceTo(30, 1e9);
    let max = 0;
    for (const d of sim.water.depth) max = Math.max(max, d);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeLessThan(20);
    expect(Math.abs(sim.water.massBalanceError()) / sim.water.stats.added).toBeLessThan(1e-9);
  }, 60_000);
});
