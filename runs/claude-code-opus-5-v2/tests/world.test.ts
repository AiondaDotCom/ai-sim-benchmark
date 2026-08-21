import { describe, expect, it } from 'vitest';
import { resolveConfig, DEFAULT_CONFIG, SIM_TUNING } from '../src/app/config';
import { World, buildOrographicWeights, placeSprings, weatherIntensity } from '../src/app/world';
import { generateTerrain } from '../src/sim/terrain';

describe('configuration', () => {
  it('falls back to the defaults for an empty query string', () => {
    expect(resolveConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('reads seed, rain, speed and size from the URL', () => {
    const c = resolveConfig('?seed=glacier&rain=1.5&speed=0.4&size=128');
    expect(c.seed).toBe('glacier');
    expect(c.rainIntensity).toBeCloseTo(1.5);
    expect(c.simSpeed).toBeCloseTo(0.4);
    expect(c.size).toBe(128);
  });

  it('clamps out-of-range values instead of failing', () => {
    const c = resolveConfig('?size=99999&rain=-4&speed=1000&dpr=42');
    expect(c.size).toBe(384);
    expect(c.rainIntensity).toBe(0);
    expect(c.simSpeed).toBe(6);
    expect(c.maxPixelRatio).toBe(3);
  });

  it('ignores unparsable values', () => {
    const c = resolveConfig('?rain=abc&size=&speed=NaN');
    expect(c.rainIntensity).toBe(DEFAULT_CONFIG.rainIntensity);
    expect(c.size).toBe(DEFAULT_CONFIG.size);
    expect(c.simSpeed).toBe(DEFAULT_CONFIG.simSpeed);
  });

  it('parses boolean switches', () => {
    expect(resolveConfig('?shadows=0').shadows).toBe(false);
    expect(resolveConfig('?raindrops=false').showRain).toBe(false);
    expect(resolveConfig('?shadows=1').shadows).toBe(true);
  });
});

describe('weather cycle', () => {
  it('is already raining at t = 0 so the demo starts wet', () => {
    expect(weatherIntensity(0)).toBeGreaterThan(0.7);
  });

  it('stays within [0, 1] and always keeps at least a drizzle', () => {
    for (let t = 0; t < 400; t += 0.37) {
      const v = weatherIntensity(t);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('has both a wet peak and a dry spell within one period', () => {
    const period = SIM_TUNING.weatherPeriod;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < period; t += 0.25) {
      const v = weatherIntensity(t);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max).toBeGreaterThan(0.9);
    expect(min).toBeLessThan(0.3);
  });

  it('is periodic', () => {
    const p = SIM_TUNING.weatherPeriod;
    for (const t of [0, 3.5, 17, 40]) {
      expect(weatherIntensity(t)).toBeCloseTo(weatherIntensity(t + p), 6);
    }
  });
});

describe('orographic rain weighting', () => {
  it('averages to 1 and is monotone in elevation', () => {
    const terrain = generateTerrain({ seed: 'oro', size: 64, amplitude: 50 });
    const w = buildOrographicWeights(terrain);
    let sum = 0;
    for (let i = 0; i < w.length; i++) sum += w[i];
    expect(sum / w.length).toBeCloseTo(1, 5);

    let lowest = 0;
    let highest = 0;
    for (let i = 1; i < terrain.heights.length; i++) {
      if (terrain.heights[i] < terrain.heights[lowest]) lowest = i;
      if (terrain.heights[i] > terrain.heights[highest]) highest = i;
    }
    expect(w[highest]).toBeGreaterThan(w[lowest]);
  });
});

describe('springs', () => {
  it('places the requested number of springs on high ground', () => {
    const terrain = generateTerrain({ seed: 'springs', size: 128, amplitude: 50 });
    const springs = placeSprings(terrain, 5, 12);
    expect(springs.length).toBeGreaterThan(0);
    expect(springs.length).toBeLessThanOrEqual(5);
    const mid = (terrain.minHeight + terrain.maxHeight) / 2;
    for (const s of springs) {
      expect(s.height).toBeGreaterThan(mid);
      expect(s.rate).toBeGreaterThan(0);
    }
    // Rates taper with rank so the main summit dominates the scene.
    for (let i = 1; i < springs.length; i++) {
      expect(springs[i].rate).toBeLessThan(springs[i - 1].rate);
    }
  });

  it('returns nothing when springs are disabled', () => {
    const terrain = generateTerrain({ seed: 'springs', size: 64, amplitude: 50 });
    expect(placeSprings(terrain, 0, 12)).toEqual([]);
  });
});

describe('world integration', () => {
  const build = (extra = '') =>
    new World(resolveConfig(`?seed=integration&size=96&prewarm=70${extra}`));

  it('is fully deterministic: same seed -> identical water state', () => {
    const a = build();
    const b = build();
    expect(Array.from(a.terrain.heights)).toEqual(Array.from(b.terrain.heights));
    expect(Array.from(a.sim.depth)).toEqual(Array.from(b.sim.depth));
  });

  it('forms both flowing streams and standing lakes on its own', () => {
    const w = build();
    const sim = w.sim;
    let streams = 0;
    let lake = 0;
    let deepest = 0;
    for (let i = 0; i < sim.depth.length; i++) {
      const d = sim.depth[i];
      if (d > deepest) deepest = d;
      const speed = Math.hypot(sim.velocityX[i], sim.velocityY[i]);
      // Thin, fast water on a slope == a stream.
      if (d > SIM_TUNING.dryThreshold && d < 0.5 && speed > 1) streams++;
      // Thick, near-stationary water == a lake.
      if (d > 0.6 && speed < 0.5) lake++;
    }
    expect(streams).toBeGreaterThan(20);
    expect(lake).toBeGreaterThan(20);
    expect(deepest).toBeGreaterThan(1);
  });

  it('collects its water in local low ground, not on the ridges', () => {
    const w = build();
    const n = w.terrain.size;
    const h = w.terrain.heights;
    // For every wet cell, how far it sits below the mean of its neighbours.
    // Averaged over all the water, this has to be negative: water ends up in
    // valleys and basins, never perched on a crest.
    let weighted = 0;
    let mass = 0;
    for (let r = 1; r < n - 1; r++) {
      for (let c = 1; c < n - 1; c++) {
        const i = r * n + c;
        const d = w.sim.depth[i];
        if (d <= SIM_TUNING.dryThreshold) continue;
        const neighbourMean =
          (h[i - 1] + h[i + 1] + h[i - n] + h[i + n] +
            h[i - n - 1] + h[i - n + 1] + h[i + n - 1] + h[i + n + 1]) / 8;
        weighted += (h[i] - neighbourMean) * d;
        mass += d;
      }
    }
    expect(mass).toBeGreaterThan(0);
    expect(weighted / mass).toBeLessThan(0);
  });

  it('holds deeper water in flatter places than the thin runoff', () => {
    const w = build();
    const n = w.terrain.size;
    const slopeAt = (i: number) => {
      const c = i % n;
      const r = (i / n) | 0;
      const g = w.terrain.gradientAt(c, r);
      return Math.hypot(g.dx, g.dy);
    };
    let deepSlope = 0;
    let deepCount = 0;
    let thinSlope = 0;
    let thinCount = 0;
    for (let i = 0; i < w.sim.depth.length; i++) {
      const d = w.sim.depth[i];
      if (d > 0.8) {
        deepSlope += slopeAt(i);
        deepCount++;
      } else if (d > SIM_TUNING.dryThreshold && d < 0.2) {
        thinSlope += slopeAt(i);
        thinCount++;
      }
    }
    expect(deepCount).toBeGreaterThan(10);
    expect(thinCount).toBeGreaterThan(10);
    expect(deepSlope / deepCount).toBeLessThan(thinSlope / thinCount);
  });

  it('keeps its water ledger balanced while running', () => {
    const w = build();
    for (let i = 0; i < 600; i++) w.update(1 / 60);
    const s = w.sim.stats();
    const accounted = s.volume + s.drained + s.evaporated;
    expect(Math.abs(accounted - s.added) / s.added).toBeLessThan(1e-3);
  });

  it('honours the rain multiplier', () => {
    const dry = new World(resolveConfig('?seed=integration&size=64&rain=0&springs=0&prewarm=30'));
    expect(dry.sim.totalVolume()).toBe(0);
    const wet = new World(resolveConfig('?seed=integration&size=64&rain=1&springs=0&prewarm=30'));
    expect(wet.sim.totalVolume()).toBeGreaterThan(0);
  });

  it('applies the simulation speed multiplier to wall-clock updates', () => {
    const slow = new World(resolveConfig('?seed=integration&size=64&speed=0.25'));
    slow.update(1);
    expect(slow.time).toBeCloseTo(SIM_TUNING.maxFrameDelta * 0.25, 6);
  });
});
