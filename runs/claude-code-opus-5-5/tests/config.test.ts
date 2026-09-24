import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('returns defaults for an empty query', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('reads and clamps parameters', () => {
    const c = parseConfig('?seed=42&rain=2.5&speed=3&springs=7&size=9999&orbit=0&warmup=30');
    expect(c.seed).toBe(42);
    expect(c.rainIntensity).toBe(2.5);
    expect(c.simSpeed).toBe(3);
    expect(c.springCount).toBe(7);
    expect(c.gridSize).toBe(512);
    expect(c.orbitSpeed).toBe(0);
    expect(c.warmupSeconds).toBe(30);
  });

  it('ignores garbage values and hashes string seeds', () => {
    const c = parseConfig('?rain=abc&speed=&seed=alps');
    expect(c.rainIntensity).toBe(DEFAULT_CONFIG.rainIntensity);
    expect(c.simSpeed).toBe(DEFAULT_CONFIG.simSpeed);
    expect(c.seed).toBe(parseConfig('?seed=alps').seed);
    expect(c.seed).not.toBe(DEFAULT_CONFIG.seed);
  });
});
