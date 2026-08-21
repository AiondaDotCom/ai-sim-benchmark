import { describe, expect, it } from 'vitest';
import { WaterSimulation } from '../src/sim/waterSim';
import { generateTerrain } from '../src/sim/terrain';

/** Terrain that drops by `slope` per cell in +x (and optionally +y). */
function ramp(n: number, slopeX: number, slopeY = 0): Float32Array {
  const h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) h[r * n + c] = 100 - slopeX * c - slopeY * r;
  }
  return h;
}

/** Parabolic bowl with its minimum at the grid centre. */
function bowl(n: number, depth: number): Float32Array {
  const h = new Float32Array(n * n);
  const mid = (n - 1) / 2;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dx = (c - mid) / mid;
      const dy = (r - mid) / mid;
      h[r * n + c] = depth * (dx * dx + dy * dy);
    }
  }
  return h;
}

function flat(n: number, height = 0): Float32Array {
  return new Float32Array(n * n).fill(height);
}

describe('water mass conservation', () => {
  it('conserves volume exactly in a closed domain with no rain or evaporation', () => {
    const n = 48;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: bowl(n, 14),
      boundary: 'closed',
      rainRate: 0,
      evaporation: 0,
    });
    sim.addWaterBlob(16, 20, 7, 2.0);
    sim.addWaterBlob(34, 30, 5, 1.4);

    const initial = sim.totalVolume();
    expect(initial).toBeGreaterThan(0);

    for (let i = 0; i < 600; i++) sim.step(0.02);

    const final = sim.totalVolume();
    expect(Math.abs(final - initial) / initial).toBeLessThan(1e-4);
  });

  it('conserves volume on rough procedural terrain', () => {
    const terrain = generateTerrain({ seed: 'conservation', size: 64, amplitude: 40 });
    const sim = new WaterSimulation({
      width: terrain.size,
      height: terrain.size,
      terrain: terrain.heights,
      cellSize: terrain.cellSize,
      boundary: 'closed',
      rainRate: 0,
      evaporation: 0,
    });
    // A uniform initial layer exercises every cell, including steep ones.
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = 0.8;
    const initial = sim.totalVolume();

    for (let i = 0; i < 500; i++) sim.step(0.02);

    expect(Math.abs(sim.totalVolume() - initial) / initial).toBeLessThan(1e-4);
  });

  it('balances the full ledger: added = onTerrain + drained + evaporated', () => {
    const terrain = generateTerrain({ seed: 'ledger', size: 48, amplitude: 36 });
    const sim = new WaterSimulation({
      width: terrain.size,
      height: terrain.size,
      terrain: terrain.heights,
      cellSize: terrain.cellSize,
      boundary: 'open',
      rainRate: 0.02,
      evaporation: 0.004,
    });
    sim.addSource(24, 24, 3);

    for (let i = 0; i < 400; i++) sim.step(0.02);

    const s = sim.stats();
    const accountedFor = s.volume + s.drained + s.evaporated;
    expect(s.added).toBeGreaterThan(0);
    expect(s.drained).toBeGreaterThan(0);
    expect(Math.abs(accountedFor - s.added) / s.added).toBeLessThan(1e-3);
  });

  it('never produces negative depth or NaN', () => {
    const terrain = generateTerrain({ seed: 'stability', size: 64, amplitude: 60 });
    const sim = new WaterSimulation({
      width: terrain.size,
      height: terrain.size,
      terrain: terrain.heights,
      cellSize: terrain.cellSize,
      boundary: 'open',
      rainRate: 0.05,
      evaporation: 0.01,
    });
    for (let i = 0; i < 500; i++) sim.step(0.02);
    for (let i = 0; i < sim.depth.length; i++) {
      expect(Number.isFinite(sim.depth[i])).toBe(true);
      expect(sim.depth[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('a dry domain with no inflow stays dry', () => {
    const n = 24;
    const sim = new WaterSimulation({ width: n, height: n, terrain: bowl(n, 10) });
    for (let i = 0; i < 100; i++) sim.step(0.02);
    expect(sim.totalVolume()).toBe(0);
    expect(sim.stats().wetCells).toBe(0);
  });

  it('accounts for rainfall volume exactly', () => {
    const n = 32;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: flat(n, 5),
      cellSize: 2,
      boundary: 'closed',
      rainRate: 0.1,
      evaporation: 0,
    });
    sim.step(1.0);
    // 1 second of 0.1 depth/s over n*n cells of area 4.
    expect(sim.totalVolume()).toBeCloseTo(0.1 * n * n * 4, 3);
    expect(sim.stats().added).toBeCloseTo(sim.totalVolume(), 3);
  });
});

describe('downhill flow direction', () => {
  it('moves water down the terrain gradient, never up', () => {
    const n = 40;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: ramp(n, 0.6),
      boundary: 'closed',
      evaporation: 0,
    });
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = 0.4;

    for (let i = 0; i < 40; i++) sim.step(0.02);

    // Terrain descends toward +x, so the depth-averaged velocity must too.
    let checked = 0;
    for (let r = 5; r < n - 5; r++) {
      for (let c = 5; c < n - 5; c++) {
        const i = r * n + c;
        expect(sim.velocityX[i]).toBeGreaterThan(0);
        expect(Math.abs(sim.velocityY[i])).toBeLessThan(1e-6);
        expect(sim.fluxR[i]).toBeGreaterThan(sim.fluxL[i]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('follows a diagonal gradient in both axes', () => {
    const n = 40;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: ramp(n, 0.4, 0.4),
      boundary: 'closed',
      evaporation: 0,
    });
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = 0.4;
    for (let i = 0; i < 40; i++) sim.step(0.02);

    const i = 20 * n + 20;
    expect(sim.velocityX[i]).toBeGreaterThan(0);
    expect(sim.velocityY[i]).toBeGreaterThan(0);
    expect(sim.velocityX[i]).toBeCloseTo(sim.velocityY[i], 5);
  });

  it('reverses when the slope reverses', () => {
    const n = 40;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: ramp(n, -0.6),
      boundary: 'closed',
      evaporation: 0,
    });
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = 0.4;
    for (let i = 0; i < 40; i++) sim.step(0.02);
    expect(sim.velocityX[20 * n + 20]).toBeLessThan(0);
  });

  it('carries a blob of water downhill: its centroid descends', () => {
    const n = 60;
    const terrain = ramp(n, 0.5);
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain,
      boundary: 'closed',
      evaporation: 0,
    });
    sim.addWaterBlob(12, 30, 5, 1.5);

    const centroid = () => {
      let sx = 0;
      let sw = 0;
      let sh = 0;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const d = sim.depth[r * n + c];
          if (d <= 0) continue;
          sx += c * d;
          sh += terrain[r * n + c] * d;
          sw += d;
        }
      }
      return { x: sx / sw, height: sh / sw };
    };

    const before = centroid();
    for (let i = 0; i < 300; i++) sim.step(0.02);
    const after = centroid();

    expect(after.x).toBeGreaterThan(before.x + 3);
    // The mass-weighted terrain elevation under the water must have dropped.
    expect(after.height).toBeLessThan(before.height - 1);
  });

  it('drains a sloped open domain through its downhill edge only', () => {
    const n = 40;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: ramp(n, 0.8),
      boundary: 'open',
      evaporation: 0,
    });
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = 0.5;
    for (let i = 0; i < 600; i++) sim.step(0.02);

    // The uphill quarter must be essentially dry; the water has run off.
    let uphill = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n / 4; c++) uphill += sim.depth[r * n + c];
    expect(uphill / (n * (n / 4))).toBeLessThan(0.02);
    expect(sim.stats().drained).toBeGreaterThan(0);
  });

  it('spreads a spring on flat ground radially and symmetrically', () => {
    const n = 41;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain: flat(n, 3),
      boundary: 'closed',
      evaporation: 0,
    });
    const mid = (n - 1) / 2;
    sim.addSource(mid, mid, 4);
    for (let i = 0; i < 200; i++) sim.step(0.02);

    const at = (c: number, r: number) => sim.depth[r * n + c];
    const east = at(mid + 6, mid);
    const west = at(mid - 6, mid);
    const north = at(mid, mid - 6);
    const south = at(mid, mid + 6);
    expect(east).toBeGreaterThan(0);
    expect(east).toBeCloseTo(west, 4);
    expect(north).toBeCloseTo(south, 4);
    expect(east).toBeCloseTo(north, 4);
    // and it is deepest at the source
    expect(at(mid, mid)).toBeGreaterThan(east);
  });
});

describe('lakes in depressions', () => {
  it('collects water at the bottom of a basin with a level surface', () => {
    const n = 48;
    const terrain = bowl(n, 20);
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain,
      boundary: 'closed',
      evaporation: 0,
      damping: 0.94,
    });
    // Pour the water in off-centre: it has to find the basin by itself.
    sim.addWaterBlob(10, 10, 6, 3.0);

    for (let i = 0; i < 3000; i++) sim.step(0.02);

    const mid = Math.round((n - 1) / 2);
    const centre = sim.depth[mid * n + mid];
    const corner = sim.depth[4 * n + 4];
    expect(centre).toBeGreaterThan(0.5);
    expect(corner).toBeLessThan(0.05);

    // A settled lake has a flat free surface: terrain + depth is constant.
    const surfaces: number[] = [];
    for (let i = 0; i < sim.depth.length; i++) {
      if (sim.depth[i] > 0.2) surfaces.push(terrain[i] + sim.depth[i]);
    }
    expect(surfaces.length).toBeGreaterThan(30);
    const min = Math.min(...surfaces);
    const max = Math.max(...surfaces);
    expect(max - min).toBeLessThan(0.5);
  });

  it('fills a basin from rainfall and holds the water there', () => {
    const n = 48;
    const terrain = bowl(n, 20);
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain,
      boundary: 'open',
      rainRate: 0.02,
      evaporation: 0,
      damping: 0.94,
    });
    for (let i = 0; i < 2000; i++) sim.step(0.02);

    const mid = Math.round((n - 1) / 2);
    // Deep in the middle, dry on the rim.
    expect(sim.depth[mid * n + mid]).toBeGreaterThan(1);
    expect(sim.depth[1 * n + 1]).toBeLessThan(0.2);
  });

  it('overflows once the basin is full', () => {
    const n = 32;
    // Basin with a low saddle on the +x side.
    const terrain = bowl(n, 12);
    for (let r = 0; r < n; r++) terrain[r * n + (n - 1)] = 2;
    const sim = new WaterSimulation({
      width: n,
      height: n,
      terrain,
      boundary: 'open',
      rainRate: 0.05,
      evaporation: 0,
      damping: 0.94,
    });
    for (let i = 0; i < 3000; i++) sim.step(0.02);
    const s = sim.stats();
    // The lake keeps a body of water AND sheds the surplus over the saddle.
    expect(s.maxDepth).toBeGreaterThan(1);
    expect(s.drained).toBeGreaterThan(0);
  });
});
