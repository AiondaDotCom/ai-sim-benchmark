import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/sim/terrain';
import { WaterSim, type WaterConfig } from '../src/sim/water';

function closedConfig(overrides: Partial<WaterConfig> = {}): WaterConfig {
  return {
    rainRate: 0,
    evaporation: 0,
    flowRate: 2.0,
    springRate: 0,
    springs: [],
    openBorders: false,
    ...overrides,
  };
}

describe('water simulation', () => {
  it('conserves total water mass (no sources or sinks)', () => {
    const terrain = new Terrain({ size: 48, seed: 99 });
    const sim = new WaterSim(terrain, closedConfig());

    // Scatter some water blobs.
    sim.addWater(10, 10, 5);
    sim.addWater(24, 24, 8);
    sim.addWater(40, 12, 3);

    const before = sim.totalMass();
    for (let i = 0; i < 300; i++) sim.step(1 / 30);
    const after = sim.totalMass();

    expect(after / before).toBeGreaterThan(1 - 1e-6);
    expect(after / before).toBeLessThan(1 + 1e-6);
  });

  it('flows downhill: water moves towards lower terrain', () => {
    // Uniform slope: terrain descends towards +x.
    const size = 40;
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        heights[y * size + x] = (size - 1 - x) * 0.5;
      }
    }
    const terrain = Terrain.fromHeights(size, heights);
    const sim = new WaterSim(terrain, closedConfig());

    // Blob on the high side (low x).
    for (let y = 15; y < 25; y++) sim.addWater(5, y, 2);
    const startX = sim.centerOfMass().x;

    for (let i = 0; i < 200; i++) sim.step(1 / 30);
    const endX = sim.centerOfMass().x;

    // Downhill is +x, so the center of mass must move right.
    expect(endX).toBeGreaterThan(startX + 5);
  });

  it('collects in depressions and stays there', () => {
    // Bowl: height increases away from the center.
    const size = 40;
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 20;
        const dy = y - 20;
        heights[y * size + x] = Math.sqrt(dx * dx + dy * dy) * 0.4;
      }
    }
    const terrain = Terrain.fromHeights(size, heights);
    const sim = new WaterSim(terrain, closedConfig());

    // Water on the rim of the bowl.
    for (let a = 0; a < 360; a += 6) {
      const x = Math.round(20 + 15 * Math.cos((a * Math.PI) / 180));
      const y = Math.round(20 + 15 * Math.sin((a * Math.PI) / 180));
      sim.addWater(x, y, 2);
    }

    for (let i = 0; i < 400; i++) sim.step(1 / 30);

    // Nearly all water should be pooled near the center (grid coords 20,20).
    const { size: s, depth } = sim;
    let near = 0;
    let total = 0;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const w = depth[y * s + x];
        total += w;
        if (Math.abs(x - 20) <= 5 && Math.abs(y - 20) <= 5) near += w;
      }
    }
    expect(near / total).toBeGreaterThan(0.9);
  });

  it('is deterministic: identical runs give identical water states', () => {
    const t1 = new Terrain({ size: 40, seed: 5 });
    const t2 = new Terrain({ size: 40, seed: 5 });
    const cfg = closedConfig({ rainRate: 0.05, springRate: 0.3, springs: [{ x: 10, y: 10 }] });
    const s1 = new WaterSim(t1, cfg);
    const s2 = new WaterSim(t2, cfg);
    for (let i = 0; i < 100; i++) {
      s1.step(1 / 30);
      s2.step(1 / 30);
    }
    expect(Array.from(s1.depth)).toEqual(Array.from(s2.depth));
  });
});
