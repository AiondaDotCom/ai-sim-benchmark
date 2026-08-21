import { describe, it, expect } from 'vitest';
import { WaterSim } from '../src/sim/water';
import { generateTerrain } from '../src/sim/terrain';
import { hash2 } from '../src/sim/noise';

const DT = 1 / 90;

/** Simple deterministic bumpy terrain for closed-box tests. */
function bumpyTerrain(w: number, h: number): Float32Array {
  const t = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      t[y * w + x] = Math.sin(x * 0.4) * 2 + Math.cos(y * 0.3) * 2 + hash2(x, y, 5) * 0.5;
    }
  }
  return t;
}

describe('water mass conservation', () => {
  it('conserves an initial water deposit in a closed domain', () => {
    const w = 48;
    const h = 48;
    const sim = new WaterSim({ width: w, height: h, terrain: bumpyTerrain(w, h) });

    sim.addWater(10, 12, 40);
    sim.addWater(30, 35, 25);
    const initial = sim.totalVolume();
    expect(initial).toBeCloseTo(65, 5);

    for (let i = 0; i < 1000; i++) sim.step(DT);

    const final = sim.totalVolume();
    // Virtual-pipes with the outflow limiter is mass-conserving up to
    // float32 round-off.
    expect(Math.abs(final - initial) / initial).toBeLessThan(1e-3);
  });

  it('accounts for rain and spring inflow (volume == tracked sources)', () => {
    const w = 40;
    const h = 40;
    const sim = new WaterSim({
      width: w,
      height: h,
      terrain: bumpyTerrain(w, h),
      rainRate: 0.05,
      springRate: 3,
      springs: [
        { x: 8, y: 8 },
        { x: 30, y: 25 },
      ],
    });

    for (let i = 0; i < 800; i++) sim.step(DT);

    const expected = sim.totalRained + sim.totalSpringInflow - sim.totalEvaporated;
    const actual = sim.totalVolume();
    expect(expected).toBeGreaterThan(0);
    expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-3);
  });

  it('accounts for evaporation losses', () => {
    const w = 32;
    const h = 32;
    const sim = new WaterSim({
      width: w,
      height: h,
      terrain: new Float32Array(w * h), // flat
      evaporation: 0.1,
    });
    sim.addWater(16, 16, 100);

    for (let i = 0; i < 600; i++) sim.step(DT);

    const expected = sim.totalSpringInflow - sim.totalEvaporated;
    expect(sim.totalEvaporated).toBeGreaterThan(1);
    expect(Math.abs(sim.totalVolume() - expected) / 100).toBeLessThan(1e-3);
  });

  it('never produces negative depths or NaNs under heavy rain', () => {
    const w = 64;
    const h = 64;
    const terrain = generateTerrain({ width: w, height: h, seed: 42 });
    const sim = new WaterSim({ width: w, height: h, terrain, rainRate: 0.2, evaporation: 0.02 });

    for (let i = 0; i < 2000; i++) sim.step(DT);

    for (let i = 0; i < sim.depth.length; i++) {
      expect(Number.isFinite(sim.depth[i])).toBe(true);
      expect(sim.depth[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('downhill flow', () => {
  it('moves water down an inclined plane (centre of mass follows -gradient)', () => {
    const w = 64;
    const h = 16;
    // Plane sloping down towards +x: height = (w - x) * 0.5
    const terrain = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        terrain[y * w + x] = (w - x) * 0.5;
      }
    }
    const sim = new WaterSim({ width: w, height: h, terrain });

    // Deposit a blob near the top (small x = high ground).
    for (let y = 6; y < 10; y++) {
      for (let x = 4; x < 8; x++) {
        sim.depth[y * w + x] = 2;
      }
    }

    const comX = () => {
      let m = 0;
      let mx = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = sim.depth[y * w + x];
          m += d;
          mx += d * x;
        }
      }
      return mx / m;
    };

    const before = comX();
    for (let i = 0; i < 400; i++) sim.step(DT);
    const after = comX();

    // Water must have moved substantially downhill (towards larger x).
    expect(after).toBeGreaterThan(before + 5);
  });

  it('collects water in a depression (bowl) and settles there', () => {
    const w = 48;
    const h = 48;
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const terrain = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        terrain[y * w + x] = r * 0.6; // bowl, minimum at centre
      }
    }
    const sim = new WaterSim({ width: w, height: h, terrain });

    // Pour water near the rim.
    sim.addWater(4, 4, 60);

    for (let i = 0; i < 3000; i++) sim.step(DT);

    // The centre of the bowl must hold clearly more water than the rim,
    // and the deepest water must be near the centre.
    const centreDepth = sim.depth[Math.round(cy) * w + Math.round(cx)];
    expect(centreDepth).toBeGreaterThan(0.5);

    let deepest = 0;
    let deepestIdx = 0;
    for (let i = 0; i < sim.depth.length; i++) {
      if (sim.depth[i] > deepest) {
        deepest = sim.depth[i];
        deepestIdx = i;
      }
    }
    const dx = (deepestIdx % w) - cx;
    const dy = Math.floor(deepestIdx / w) - cy;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThan(w / 4);
  });

  it('drives flux in the direction of the water-surface gradient', () => {
    const w = 32;
    const h = 32;
    // Slope down towards +x.
    const terrain = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        terrain[y * w + x] = (w - x) * 1.0;
      }
    }
    const sim = new WaterSim({ width: w, height: h, terrain, rainRate: 0.05 });

    for (let i = 0; i < 300; i++) sim.step(DT);

    // Net x-transport must be positive (downhill) in the interior.
    let netDownhill = 0;
    for (let y = 4; y < h - 4; y++) {
      for (let x = 4; x < w - 4; x++) {
        const i = y * w + x;
        // flowSpeedAt gives magnitude; use depth movement instead:
        // compare water on high half vs low half after rain.
        netDownhill += sim.depth[i] * (x < w / 2 ? -1 : 1);
      }
    }
    expect(netDownhill).toBeGreaterThan(0);
  });
});
