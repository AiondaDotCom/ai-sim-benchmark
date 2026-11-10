import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../src/config';
import { cameraPoseAt } from '../src/render/cameraPath';
import { mulberry32, toSeed } from '../src/sim/rng';
import { WORLD_SIZE } from '../src/sim/terrain';

describe('configuration via URL query parameters', () => {
  it('uses the defaults when nothing is given', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('reads seed, rain and speed', () => {
    const c = parseConfig('?seed=99&rain=2.5&speed=0.5&springs=0&grid=128&warmup=120');
    expect(c).toEqual({ seed: 99, rain: 2.5, speed: 0.5, springs: 0, grid: 128, warmup: 120 });
  });

  it('accepts text seeds and maps them to stable numbers', () => {
    expect(parseConfig('?seed=matterhorn').seed).toBe(toSeed('matterhorn'));
    expect(toSeed('matterhorn')).not.toBe(toSeed('eiger'));
  });

  it('clamps out-of-range values and ignores garbage', () => {
    const c = parseConfig('?rain=1000&speed=-3&grid=5&springs=abc');
    expect(c.rain).toBe(5);
    expect(c.speed).toBe(0);
    expect(c.grid).toBe(96);
    expect(c.springs).toBe(DEFAULT_CONFIG.springs);
  });
});

describe('seeded random numbers', () => {
  it('repeats exactly for the same seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('automatic camera', () => {
  it('orbits smoothly outside the island and above the summits', () => {
    let previous = cameraPoseAt(0);
    for (let frame = 1; frame < 60 * 240; frame++) {
      const pose = cameraPoseAt(frame / 60);
      const [x, y, z] = pose.position;
      expect(Math.hypot(x, z)).toBeGreaterThan(WORLD_SIZE * 0.72);
      expect(y).toBeGreaterThan(55);
      // No jumps: less than half a world unit per frame at 60 fps.
      const step = Math.hypot(x - previous.position[0], y - previous.position[1], z - previous.position[2]);
      expect(step).toBeLessThan(0.5);
      previous = pose;
    }
  });

  it('keeps moving around the terrain', () => {
    const a = cameraPoseAt(0).position;
    const b = cameraPoseAt(30).position;
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(100);
  });
});
