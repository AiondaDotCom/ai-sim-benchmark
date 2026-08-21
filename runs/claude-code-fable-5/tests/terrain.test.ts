import { describe, it, expect } from 'vitest';
import { generateTerrain, findSprings } from '../src/sim/terrain';

const W = 96;
const H = 96;

describe('deterministic terrain generation', () => {
  it('produces bit-identical heightfields for the same seed', () => {
    const a = generateTerrain({ width: W, height: H, seed: 1337 });
    const b = generateTerrain({ width: W, height: H, seed: 1337 });
    expect(a.length).toBe(W * H);
    // Bytewise equality, not just approximate.
    const bytesA = new Uint8Array(a.buffer);
    const bytesB = new Uint8Array(b.buffer);
    let identical = true;
    for (let i = 0; i < bytesA.length; i++) {
      if (bytesA[i] !== bytesB[i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(true);
  });

  it('produces different heightfields for different seeds', () => {
    const a = generateTerrain({ width: W, height: H, seed: 1 });
    const b = generateTerrain({ width: W, height: H, seed: 2 });
    let differing = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) differing++;
    }
    // Practically every cell should differ.
    expect(differing / a.length).toBeGreaterThan(0.99);
  });

  it('produces finite heights with meaningful relief', () => {
    const t = generateTerrain({ width: W, height: H, seed: 99 });
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < t.length; i++) {
      expect(Number.isFinite(t[i])).toBe(true);
      if (t[i] < min) min = t[i];
      if (t[i] > max) max = t[i];
    }
    expect(max - min).toBeGreaterThan(10); // mountains, not a plain
  });

  it('picks deterministic springs near peaks', () => {
    const t = generateTerrain({ width: W, height: H, seed: 7 });
    const s1 = findSprings(t, W, H, 5);
    const s2 = findSprings(t, W, H, 5);
    expect(s1).toEqual(s2);
    expect(s1.length).toBeGreaterThan(0);

    // Springs must sit in the upper part of the height range.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < min) min = t[i];
      if (t[i] > max) max = t[i];
    }
    for (const s of s1) {
      const h = t[s.y * W + s.x];
      expect(h).toBeGreaterThan(min + 0.6 * (max - min));
    }
  });
});
