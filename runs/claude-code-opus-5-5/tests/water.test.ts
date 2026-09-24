import { describe, expect, it } from 'vitest';
import { WaterSimulation } from '../src/sim/water';
import { findSprings, generateTerrain, terrainGradient } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/random';
import { World } from '../src/sim/world';

function plane(size: number, fn: (x: number, y: number) => number): Float32Array {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x, y);
  return h;
}

function centroid(sim: WaterSimulation): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let s = 0;
  for (let y = 0; y < sim.size; y++) {
    for (let x = 0; x < sim.size; x++) {
      const d = sim.depth[y * sim.size + x];
      sx += d * x;
      sy += d * y;
      s += d;
    }
  }
  return { x: sx / s, y: sy / s };
}

function minDepth(sim: WaterSimulation): number {
  let m = Infinity;
  for (const d of sim.depth) m = Math.min(m, d);
  return m;
}

describe('water mass conservation', () => {
  it('conserves volume exactly (to rounding) with closed boundaries and no sources', () => {
    const t = generateTerrain({ size: 64, seed: 21, maxHeight: 16 });
    const sim = new WaterSimulation(t.heights, t.size, { boundary: 'closed' });
    const rng = mulberry32(4);
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = rng() * 0.5;
    const v0 = sim.totalVolume();
    for (let s = 0; s < 2000; s++) sim.step(0.05);
    const v1 = sim.totalVolume();
    expect(Math.abs(v1 - v0) / v0).toBeLessThan(1e-9);
    expect(minDepth(sim)).toBeGreaterThanOrEqual(0);
  });

  it('matches the water budget with rain, springs, evaporation and open borders', () => {
    const t = generateTerrain({ size: 64, seed: 8, maxHeight: 16 });
    const sim = new WaterSimulation(t.heights, t.size, { boundary: 'open', evaporation: 0.001 });
    sim.rainRate = 0.004;
    sim.addSpring({ x: 30, y: 30, rate: 3, radius: 1 });
    sim.addSpring({ x: 20, y: 40, rate: 2, radius: 2 });
    const v0 = sim.totalVolume();
    for (let s = 0; s < 3000; s++) sim.step(0.05);
    const v1 = sim.totalVolume();
    const expected = sim.expectedVolume(v0);
    expect(sim.budget.rained).toBeGreaterThan(0);
    expect(sim.budget.sprung).toBeCloseTo(5 * 150, 6);
    expect(sim.budget.evaporated).toBeGreaterThan(0);
    expect(sim.budget.drained).toBeGreaterThan(0);
    expect(Math.abs(v1 - expected) / expected).toBeLessThan(1e-6);
  });

  it('keeps the world simulation within its water budget over a long run', () => {
    const world = new World({ seed: 99, size: 64, springCount: 3 });
    const v0 = world.water.totalVolume();
    for (let i = 0; i < 200; i++) world.advance(1);
    const v1 = world.water.totalVolume();
    const expected = world.water.expectedVolume(v0);
    expect(v1).toBeGreaterThan(0);
    expect(Math.abs(v1 - expected) / expected).toBeLessThan(1e-6);
  });

  it('never produces negative depths, even from a single tall column', () => {
    const size = 32;
    const sim = new WaterSimulation(plane(size, () => 0), size, { boundary: 'closed' });
    sim.addWater(16, 16, 50);
    for (let s = 0; s < 500; s++) {
      sim.step(0.02);
      expect(minDepth(sim)).toBeGreaterThanOrEqual(0);
    }
    expect(sim.totalVolume()).toBeCloseTo(50, 8);
  });
});

describe('downhill flow', () => {
  it('moves water towards lower terrain on an inclined plane (+x is downhill)', () => {
    const size = 48;
    const sim = new WaterSimulation(plane(size, (x) => 20 - x * 0.4), size, { boundary: 'closed' });
    for (let y = 20; y < 28; y++) for (let x = 10; x < 14; x++) sim.addWater(x, y, 0.5);
    const before = centroid(sim);
    for (let s = 0; s < 100; s++) sim.step(0.05);
    const after = centroid(sim);
    expect(after.x).toBeGreaterThan(before.x + 3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
  });

  it('flows along the terrain gradient in an arbitrary direction (-y is downhill)', () => {
    const size = 48;
    const sim = new WaterSimulation(plane(size, (_x, y) => y * 0.3), size, { boundary: 'closed' });
    for (let y = 30; y < 34; y++) for (let x = 22; x < 26; x++) sim.addWater(x, y, 0.4);
    for (let s = 0; s < 40; s++) sim.step(0.05);
    // Velocity of every wet cell points downhill (negative y), never uphill.
    let wet = 0;
    for (let i = 0; i < sim.depth.length; i++) {
      if (sim.depth[i] > 1e-3) {
        wet++;
        expect(sim.velocityY[i]).toBeLessThanOrEqual(1e-9);
      }
    }
    expect(wet).toBeGreaterThan(0);
    expect(centroid(sim).y).toBeLessThan(31.5);
  });

  it('on generated terrain, velocities of thin sheet flow oppose the terrain gradient', () => {
    const t = generateTerrain({ size: 64, seed: 17, maxHeight: 16 });
    const sim = new WaterSimulation(t.heights, t.size, { boundary: 'open' });
    for (let i = 0; i < sim.depth.length; i++) sim.depth[i] = 0.01;
    sim.step(0.05);
    let agree = 0;
    let total = 0;
    for (let y = 2; y < t.size - 2; y++) {
      for (let x = 2; x < t.size - 2; x++) {
        const [gx, gy] = terrainGradient(t, x, y);
        const gLen = Math.hypot(gx, gy);
        const i = y * t.size + x;
        const vx = sim.velocityX[i];
        const vy = sim.velocityY[i];
        if (gLen < 0.05 || Math.hypot(vx, vy) < 1e-6) continue;
        total++;
        if (vx * -gx + vy * -gy > 0) agree++;
      }
    }
    expect(total).toBeGreaterThan(1000);
    expect(agree / total).toBeGreaterThan(0.95);
  });

  it('collects water in a depression: a bowl pools at its lowest point', () => {
    const size = 41;
    const c = 20;
    const sim = new WaterSimulation(plane(size, (x, y) => 0.02 * ((x - c) ** 2 + (y - c) ** 2)), size, {
      boundary: 'closed',
      damping: 0.98,
    });
    sim.rainRate = 0.01;
    for (let s = 0; s < 200; s++) sim.step(0.05);
    sim.rainRate = 0;
    for (let s = 0; s < 3000; s++) sim.step(0.05);
    const centre = sim.depth[c * size + c];
    const rim = sim.depth[2 * size + c];
    expect(centre).toBeGreaterThan(0.5);
    expect(centre).toBeGreaterThan(rim * 20);
    // The pooled water surface is (nearly) flat: a lake, not a mound.
    const surfaceCentre = sim.surface(c, c);
    const surfaceNear = sim.surface(c + 2, c);
    expect(Math.abs(surfaceCentre - surfaceNear)).toBeLessThan(0.05);
  });

  it('water from a spring near a peak ends up far below the spring', () => {
    const t = generateTerrain({ size: 96, seed: 3, maxHeight: 22 });
    const [spring] = findSprings(t, 1);
    const springHeight = t.heights[spring.y * t.size + spring.x];
    const sim = new WaterSimulation(t.heights, t.size, { boundary: 'closed' });
    sim.addSpring({ x: spring.x, y: spring.y, rate: 4, radius: 1 });
    const meanWaterElevation = () => {
      let s = 0;
      let v = 0;
      for (let i = 0; i < sim.depth.length; i++) {
        s += sim.depth[i] * t.heights[i];
        v += sim.depth[i];
      }
      return s / v;
    };
    for (let s = 0; s < 20; s++) sim.step(0.05);
    const early = meanWaterElevation();
    for (let s = 0; s < 2400; s++) sim.step(0.05);
    const late = meanWaterElevation();
    expect(late).toBeLessThan(early - 3);
    expect(late).toBeLessThan(springHeight * 0.6);
  });
});
