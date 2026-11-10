import { describe, expect, it } from 'vitest';
import { WaterSim } from '../src/sim/water';

const DT = 0.04;

/** Builds a bed from a height function on an n x n grid with unit cells. */
function bed(n: number, fn: (x: number, y: number) => number): Float32Array {
  const b = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) b[y * n + x] = fn(x, y);
  return b;
}

function centroid(sim: WaterSim): { x: number; y: number; meanBed: number } {
  let sx = 0, sy = 0, sb = 0, m = 0;
  const n = sim.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = sim.depth[y * n + x];
      sx += d * x;
      sy += d * y;
      sb += d * sim.bed[y * n + x];
      m += d;
    }
  }
  return { x: sx / m, y: sy / m, meanBed: sb / m };
}

function assertPhysical(sim: WaterSim): void {
  for (let i = 0; i < sim.depth.length; i++) {
    const d = sim.depth[i];
    if (!(d >= 0) || !Number.isFinite(d)) throw new Error(`invalid depth ${d} at cell ${i}`);
  }
}

describe('conservation of water mass', () => {
  it('keeps the volume constant in a closed basin with no sources or sinks', () => {
    const n = 48;
    // A bumpy bowl: water sloshes around but cannot leave (closed borders).
    const sim = new WaterSim(n, 1, bed(n, (x, y) => 0.02 * ((x - 24) ** 2 + (y - 24) ** 2) + Math.sin(x * 0.9) * Math.cos(y * 0.7)));
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) sim.addVolume(x, y, 3);
    const initial = sim.totalVolume();
    expect(initial).toBeCloseTo(300, 9);
    for (let step = 0; step < 3000; step++) sim.step(DT);
    assertPhysical(sim);
    expect(Math.abs(sim.totalVolume() - initial) / initial).toBeLessThan(1e-10);
    expect(sim.stats.drained).toBe(0);
    expect(sim.stats.evaporated).toBe(0);
  });

  it('accounts for every drop when rain, evaporation and sinks are active', () => {
    const n = 64;
    const sinkMask = new Uint8Array(n * n);
    for (let k = 0; k < n; k++) sinkMask[k] = sinkMask[(n - 1) * n + k] = sinkMask[k * n] = sinkMask[k * n + n - 1] = 1;
    const sim = new WaterSim(n, 1.5, bed(n, (x, y) => 12 * Math.exp(-((x - 32) ** 2 + (y - 32) ** 2) / 300) + 0.6 * Math.sin(x * 0.5) * Math.sin(y * 0.4)), {
      sinkMask,
      evaporation: 0.001,
    });
    const rain = new Float32Array(n * n).fill(0.01);
    for (let step = 0; step < 2500; step++) {
      sim.addRain(rain, 1, DT);
      if (step % 10 === 0) sim.addVolume(32, 32, 0.5);
      sim.step(DT);
    }
    assertPhysical(sim);
    const { added, evaporated, drained } = sim.stats;
    expect(added).toBeGreaterThan(100);
    expect(evaporated).toBeGreaterThan(0);
    expect(drained).toBeGreaterThan(0);
    // stored = added - evaporated - drained, to floating point precision.
    expect(Math.abs(sim.massBalanceError()) / added).toBeLessThan(1e-10);
    expect(sim.totalVolume()).toBeCloseTo(added - evaporated - drained, 6);
  });

  it('leaves a lake at rest undisturbed', () => {
    const n = 32;
    const sim = new WaterSim(n, 1, bed(n, (x, y) => 0.05 * ((x - 16) ** 2 + (y - 16) ** 2)));
    // Fill to a perfectly level surface at height 4.
    for (let i = 0; i < n * n; i++) sim.depth[i] = Math.max(0, 4 - sim.bed[i]);
    const before = Float64Array.from(sim.depth);
    for (let step = 0; step < 500; step++) sim.step(DT);
    for (let i = 0; i < n * n; i++) expect(sim.depth[i]).toBeCloseTo(before[i], 5);
  });
});

describe('downhill flow direction', () => {
  it('moves water down an inclined plane, never up, in each of the four directions', () => {
    const n = 64;
    const slopes: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [sx, sy] of slopes) {
      // Bed rises along (sx, sy), so downhill is the opposite direction.
      const sim = new WaterSim(n, 1, bed(n, (x, y) => 0.3 * (sx * (x - 32) + sy * (y - 32)) + 20));
      for (let y = 29; y < 35; y++) for (let x = 29; x < 35; x++) sim.addVolume(x, y, 1);
      const start = centroid(sim);
      for (let step = 0; step < 200; step++) sim.step(DT);
      assertPhysical(sim);
      const end = centroid(sim);
      const moved = (end.x - start.x) * -sx + (end.y - start.y) * -sy;
      const sideways = Math.abs((end.x - start.x) * sy + (end.y - start.y) * sx);
      expect(moved).toBeGreaterThan(4);
      expect(sideways).toBeLessThan(0.05);
      expect(end.meanBed).toBeLessThan(start.meanBed - 1);
    }
  });

  it('follows the local gradient on an irregular surface (velocity opposes the bed slope)', () => {
    const n = 96;
    const height = (x: number, y: number) =>
      30 * Math.exp(-((x - 48) ** 2 + (y - 48) ** 2) / 900) + 1.5 * Math.sin(x * 0.21) * Math.cos(y * 0.17);
    const sim = new WaterSim(n, 1, bed(n, height));
    // A ring of springs around the summit.
    for (let step = 0; step < 900; step++) {
      for (let a = 0; a < 8; a++) {
        sim.addVolume(Math.round(48 + 6 * Math.cos(a * 0.785)), Math.round(48 + 6 * Math.sin(a * 0.785)), 0.03);
      }
      sim.step(DT);
    }
    sim.updateVelocities();
    let downhill = 0;
    let uphill = 0;
    let samples = 0;
    for (let y = 2; y < n - 2; y++) {
      for (let x = 2; x < n - 2; x++) {
        const i = y * n + x;
        const d = sim.depth[i];
        const speed = Math.hypot(sim.velX[i], sim.velY[i]);
        const gx = (sim.bed[i + 1] - sim.bed[i - 1]) / 2;
        const gy = (sim.bed[i + n] - sim.bed[i - n]) / 2;
        const slope = Math.hypot(gx, gy);
        // Only judge clearly flowing water on a clear slope (not ponds).
        if (d < 0.01 || speed < 0.2 || slope < 0.15) continue;
        const weight = d * speed;
        const cosine = -(sim.velX[i] * gx + sim.velY[i] * gy) / (speed * slope);
        if (cosine > 0) downhill += weight;
        else uphill += weight;
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(100);
    expect(downhill / (downhill + uphill)).toBeGreaterThan(0.97);
  });

  it('only ever loses potential energy once the sources stop', () => {
    const n = 64;
    const sim = new WaterSim(n, 1, bed(n, (x, y) => 0.25 * y + 2 * Math.sin(x * 0.3)));
    for (let x = 20; x < 44; x++) sim.addVolume(x, 58, 2);
    let previous = centroid(sim).meanBed;
    for (let block = 0; block < 10; block++) {
      for (let step = 0; step < 50; step++) sim.step(DT);
      const now = centroid(sim).meanBed;
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      previous = now;
    }
    expect(previous).toBeLessThan(0.25 * 58 - 4);
  });
});

describe('collection in depressions', () => {
  it('fills a hollow on a hillside to a level lake, then spills over the lowest rim', () => {
    const n = 64;
    // A slope descending towards +y with a bowl dug into it at (32, 34).
    const height = (x: number, y: number) => {
      const r2 = (x - 32) ** 2 + (y - 34) ** 2;
      return 0.2 * (n - y) + 0.02 * (x - 32) ** 2 - 5 * Math.exp(-r2 / 40);
    };
    const sinkMask = new Uint8Array(n * n);
    for (let x = 0; x < n; x++) sinkMask[(n - 1) * n + x] = 1;
    const sim = new WaterSim(n, 1, bed(n, height), { sinkMask });

    for (let step = 0; step < 12000; step++) {
      if (step < 9000) sim.addVolume(32, 8, 0.05);
      sim.step(DT);
    }
    assertPhysical(sim);

    // A lake exists in the hollow...
    const centre = 34 * n + 32;
    expect(sim.depth[centre]).toBeGreaterThan(1.5);
    // ...its surface is level...
    const level = sim.bed[centre] + sim.depth[centre];
    let lakeCells = 0;
    for (let y = 28; y < 41; y++) {
      for (let x = 26; x < 39; x++) {
        const i = y * n + x;
        if (sim.depth[i] < 0.3) continue;
        lakeCells++;
        expect(Math.abs(sim.bed[i] + sim.depth[i] - level)).toBeLessThan(0.05);
      }
    }
    expect(lakeCells).toBeGreaterThan(20);
    // ...and the surplus spilled over the rim and left at the bottom of the hill.
    expect(sim.stats.drained).toBeGreaterThan(50);
    expect(Math.abs(sim.massBalanceError())).toBeLessThan(1e-8);
  });
});
