import { describe, expect, it } from 'vitest';
import { Simulation, DEFAULT_SIM } from '../src/sim/simulation';

describe('Simulation (full pipeline: sources + flow)', () => {
  it('is fully deterministic: same config and step history give identical states', () => {
    const a = new Simulation({ seed: 42, gridN: 64 });
    const b = new Simulation({ seed: 42, gridN: 64 });
    for (let s = 0; s < 200; s++) {
      a.step(1 / 30);
      b.step(1 / 30);
    }
    expect(a.depth.length).toBe(64 * 64);
    for (let k = 0; k < a.depth.length; k++) {
      expect(a.depth[k]).toBe(b.depth[k]);
    }
    expect(a.time).toBe(b.time);
  });

  it('adds exactly the configured rainfall as mass (sources bookkeeping)', () => {
    const n = 48;
    const sim = new Simulation({
      seed: 5,
      gridN: n,
      rainRate: 0.05,
      springRate: 0,
      numSprings: 0,
      evapRate: 0,
      riverRate: 0 // isolate rainfall from the river source
    });
    const dt = 0.1;
    const steps = 100;
    for (let s = 0; s < steps; s++) sim.step(dt);

    const expected = n * n * 0.05 * dt * steps; // every cell rained on
    expect(sim.totalWater() / expected).toBeCloseTo(1, 2);
  });

  it('springs emit water that flows downhill from the peaks', () => {
    const sim = new Simulation({
      seed: 11,
      gridN: 64,
      rainRate: 0,
      springRate: 1,
      numSprings: 2,
      evapRate: 0,
      riverRate: 0 // isolate the springs from the river source
    });
    for (let s = 0; s < 60; s++) sim.step(0.1);

    // Emission accounted for: 2 springs x 1 depth/s x 6 s, flow conserves.
    expect(sim.totalWater()).toBeCloseTo(12, 0);

    // ...and some of it has left the spring cells and settled lower.
    const springElev = Math.min(...sim.springs.map((s) => sim.terrain.height[s]));
    let foundLower = false;
    for (let k = 0; k < sim.depth.length; k++) {
      if (sim.depth[k] > 0.01 && sim.terrain.height[k] < springElev - 1) {
        foundLower = true;
        break;
      }
    }
    expect(foundLower).toBe(true);
  });

  it('evaporation acts as a sink: evaporating runs hold less water than closed ones', () => {
    const mk = (evapRate: number) =>
      new Simulation({
        seed: 23,
        gridN: 64,
        rainRate: 0.01,
        springRate: 0.3,
        evapRate
      });
    const evaporating = mk(0.1);
    const closed = mk(0);
    for (let s = 0; s < 300; s++) {
      evaporating.step(1 / 30);
      closed.step(1 / 30);
    }
    expect(evaporating.totalWater()).toBeLessThan(closed.totalWater());
  });

  it('evaporation is depth-proportional: the same fraction is lost, so deep water drains faster in absolute terms', () => {
    const sim = new Simulation({
      seed: 23,
      gridN: 32,
      rainRate: 0,
      springRate: 0,
      numSprings: 0,
      evapRate: 0.1,
      riverRate: 0,
      // Zero flow stiffness so the step only applies evaporation, isolating it.
      flowCoeff: 0
    });
    sim.depth[16 * 32 + 16] = 1.0; // a deep pool
    sim.depth[16 * 32 + 10] = 0.01; // a thin film

    sim.step(1); // 1 second at 10% evaporation per second

    // Both lose the same fraction of their depth (90% remains)...
    expect(sim.depth[16 * 32 + 16]).toBeCloseTo(1.0 * 0.9, 5);
    expect(sim.depth[16 * 32 + 10]).toBeCloseTo(0.01 * 0.9, 5);
    // ...but the deep pool lost far more water in absolute terms.
    const deepLost = 1.0 - sim.depth[16 * 32 + 16];
    const thinLost = 0.01 - sim.depth[16 * 32 + 10];
    expect(deepLost).toBeGreaterThan(thinLost);
  });

  it('stays stable and finite over a long run with sources active', () => {
    const sim = new Simulation({ seed: 1337, gridN: 96 });
    for (let s = 0; s < 60 * 60; s++) sim.step(1 / 30); // 60 simulated seconds

    for (let k = 0; k < sim.depth.length; k++) {
      expect(Number.isFinite(sim.depth[k])).toBe(true);
      expect(sim.depth[k]).toBeGreaterThanOrEqual(0);
    }
    expect(sim.totalWater()).toBeGreaterThan(0);
  });

  it('zero or negative dt is a no-op', () => {
    const sim = new Simulation({ seed: 5, gridN: 32 });
    const snapshot = sim.depth.slice();
    sim.step(0);
    sim.step(-1);
    expect(sim.depth).toEqual(snapshot);
    expect(sim.time).toBe(0);
  });

  it('default config is self-consistent and documented', () => {
    expect(DEFAULT_SIM.flowCoeff).toBeGreaterThan(0);
    expect(DEFAULT_SIM.flowCoeff).toBeLessThanOrEqual(0.5);
    expect(DEFAULT_SIM.tickDt).toBeGreaterThan(0);
    expect(DEFAULT_SIM.evapRate).toBeGreaterThanOrEqual(0);
    // The rain is strong enough that its equilibrium film reads as a visible
    // wet sheen and raises the lake level in the animation, but not so strong
    // that it floods the whole map as a deep sheet. (The renderer fades in
    // smoothly with depth, so this range shows as rising water, not a flood.)
    expect(DEFAULT_SIM.rainRate / DEFAULT_SIM.evapRate).toBeGreaterThan(0.03);
    expect(DEFAULT_SIM.rainRate / DEFAULT_SIM.evapRate).toBeLessThan(0.5);
    expect(DEFAULT_SIM.seed).toBe(1337);
  });
});
