import { describe, expect, it } from "vitest";
import { Terrain } from "../src/terrain/terrain";
import { WaterSimulation, findSpringCells } from "../src/water/simulation";

const TERRAIN = { seed: 1337, gridN: 65, size: 100 };

function quietSim(t: Terrain) {
  // No sources, no sinks: pure redistribution.
  return new WaterSimulation(t, {
    rainRate: 0,
    springRate: 0,
    absorptionRate: 0,
    borderDrain: false,
    flowSpeed: 0.5,
  });
}

describe("water mass conservation", () => {
  it("conserves mass during pure downhill redistribution", () => {
    const t = new Terrain(TERRAIN);
    const sim = quietSim(t);

    // Drop water on a few cells.
    for (let k = 0; k < sim.depth.length; k += 97) sim.depth[k] = 0.5;
    const m0 = sim.totalMass();

    for (let s = 0; s < 200; s++) sim.step();

    expect(sim.totalMass()).toBeCloseTo(m0, 3);
  });

  it("gains mass by exactly the injected amount from rain and springs", () => {
    const t = new Terrain(TERRAIN);
    const rainRate = 0.02;
    const springRate = 0.4;
    const dt = 1 / 30;
    const sim = new WaterSimulation(t, {
      rainRate,
      springRate,
      springCount: 4,
      absorptionRate: 0,
      borderDrain: false,
      flowSpeed: 0, // no movement -> exact analytic gain
      dt,
    });
    const m0 = sim.totalMass();
    const steps = 10;
    for (let s = 0; s < steps; s++) sim.step();
    const expected = m0 + steps * dt * (rainRate * t.gridN * t.gridN + 4 * springRate);
    expect(sim.totalMass()).toBeCloseTo(expected, 3);
  });

  it("loses mass only through the border drain when enabled", () => {
    const t = new Terrain(TERRAIN);
    const sim = quietSim(t);
    sim.setConfig({ borderDrain: true });
    for (let k = 0; k < sim.depth.length; k++) sim.depth[k] = 0.2;
    const m0 = sim.totalMass();
    for (let s = 0; s < 50; s++) sim.step();
    expect(sim.totalMass()).toBeLessThan(m0);
    expect(sim.totalMass()).toBeGreaterThanOrEqual(0);
  });
});

describe("downhill flow direction", () => {
  it("moves water from the global maximum strictly to lower neighbours", () => {
    const t = new Terrain(TERRAIN);
    const sim = quietSim(t);

    let peak = 0;
    for (let k = 0; k < t.heights.length; k++) {
      if (t.heights[k] > t.heights[peak]) peak = k;
    }
    sim.depth[peak] = 1;
    const n = t.gridN;
    const pi = peak % n;
    const pj = Math.floor(peak / n);

    sim.step();

    // Source lost water...
    expect(sim.depth[peak]).toBeLessThan(1);
    // ...and every cell that gained water is lower than the peak.
    let gainedAnywhereLower = 0;
    let gainedTotal = 0;
    for (let j = pj - 1; j <= pj + 1; j++) {
      for (let i = pi - 1; i <= pi + 1; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n || (i === pi && j === pj)) continue;
        const k = j * n + i;
        if (sim.depth[k] > 1e-9) {
          gainedTotal++;
          if (t.heights[k] < t.heights[peak]) gainedAnywhereLower++;
        }
      }
    }
    expect(gainedTotal).toBeGreaterThan(0);
    expect(gainedAnywhereLower).toBe(gainedTotal);
  });

  it("preserves surface ordering: recipients stay below the donor surface", () => {
    const t = new Terrain(TERRAIN);
    const sim = quietSim(t);
    const n = t.gridN;

    // Probe a spread of cells across the map.
    for (let k = 0; k < sim.depth.length; k += 211) {
      sim.reset();
      sim.depth[k] = 0.6;
      const surfBefore = t.heights[k] + sim.depth[k];

      sim.step();

      // Every other wet cell must be a strict-downhill-surface neighbour
      // that did not rise above the donor's original surface.
      const ki = k % n;
      const kj = Math.floor(k / n);
      for (let j = kj - 2; j <= kj + 2; j++) {
        for (let i = ki - 2; i <= ki + 2; i++) {
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const kk = j * n + i;
          if (kk === k) continue;
          if (sim.depth[kk] <= 1e-9) continue;
          // Received water -> its pre-step surface was below the donor's.
          expect(t.heights[kk]).toBeLessThan(surfBefore);
          // And the clamp kept it from overshooting past the donor surface.
          expect(t.heights[kk] + sim.depth[kk]).toBeLessThanOrEqual(surfBefore + 1e-4);
        }
      }
    }
  });

  it("collects water in a carved depression (lake formation)", () => {
    const t = new Terrain(TERRAIN);
    const n = t.gridN;

    // Carve a sealed crater: bowl interior below a raised rim ring, so it
    // is guaranteed to be a closed depression.
    const ci = Math.floor(n / 2);
    const cj = Math.floor(n / 2);
    const rim = 10;
    for (let j = cj - rim - 1; j <= cj + rim + 1; j++) {
      for (let i = ci - rim - 1; i <= ci + rim + 1; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const r = Math.sqrt((i - ci) ** 2 + (j - cj) ** 2);
        if (r <= rim) {
          t.heights[j * n + i] = Math.min(t.heights[j * n + i], -8 - 3 * (1 - (r / rim) ** 2));
        } else if (r <= rim + 1) {
          t.heights[j * n + i] = Math.max(t.heights[j * n + i], -7); // rim wall
        }
      }
    }

    const sim = new WaterSimulation(t, {
      rainRate: 0,
      springRate: 0,
      springCount: 0,
      absorptionRate: 0,
      borderDrain: true,
      flowSpeed: 0.55,
      dt: 1 / 30,
    });

    // Seed a uniform water blanket; only downhill transport moves it.
    for (let k = 0; k < sim.depth.length; k++) sim.depth[k] = 0.15;

    for (let s = 0; s < 3000; s++) sim.step();

    // The bowl is ~7% of the cells but must retain >= 25% of all water:
    // depressions collect water while slopes shed theirs to the map edge.
    let inVol = 0;
    let totalVol = 0;
    let maxInside = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        totalVol += sim.depth[k];
        if ((i - ci) ** 2 + (j - cj) ** 2 <= (rim - 2) ** 2) {
          inVol += sim.depth[k];
          if (sim.depth[k] > maxInside) maxInside = sim.depth[k];
        }
      }
    }
    expect(maxInside).toBeGreaterThan(0.5);
    // Bowl interior is ~6.7% of the cells; a closed depression must trap
    // a clearly disproportionate share of all water.
    expect(inVol / totalVol).toBeGreaterThan(0.2);
  });

  it("reaches a mostly-dry equilibrium (no global flooding)", () => {
    const t = new Terrain({ seed: 1337, gridN: 65, size: 100 });
    const sim = new WaterSimulation(t);

    for (let s = 0; s < 1800; s++) sim.step(); // 60 simulated seconds

    let wet = 0;
    for (let k = 0; k < sim.depth.length; k++) {
      if (sim.depth[k] > 0.004) wet++;
    }
    const wetShare = wet / sim.depth.length;
    // Guard against the flooding regression: most terrain stays dry.
    expect(wetShare).toBeLessThan(0.2);

    // And streams/lakes do form: some water persists.
    expect(sim.totalMass()).toBeGreaterThan(0);
  });

  it("places springs on local peaks with a downhill neighbour", () => {
    const t = new Terrain(TERRAIN);
    const springs = findSpringCells(t, 6);
    expect(springs).toHaveLength(6);

    const n = t.gridN;
    for (const k of springs) {
      const i = k % n;
      const j = Math.floor(k / n);
      const h = t.heights[k];
      let isLocalMax = true;
      let hasDownhill = false;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const nk = (j + dj) * n + (i + di);
          if (t.heights[nk] > h) isLocalMax = false;
          if (t.heights[nk] < h) hasDownhill = true;
        }
      }
      expect(isLocalMax).toBe(true);
      expect(hasDownhill).toBe(true);
    }
  });

  it("is deterministic: same inputs, same state", () => {
    const t1 = new Terrain(TERRAIN);
    const t2 = new Terrain(TERRAIN);
    const s1 = new WaterSimulation(t1, { rainRate: 0.03, borderDrain: true });
    const s2 = new WaterSimulation(t2, { rainRate: 0.03, borderDrain: true });
    for (let s = 0; s < 100; s++) {
      s1.step();
      s2.step();
    }
    expect(Array.from(s1.depth)).toEqual(Array.from(s2.depth));
  });
});
