import { describe, expect, it } from "vitest";
import { Terrain } from "../src/terrain/terrain";
import { mulberry32, valueNoise2D, fbm2D } from "../src/terrain/noise";

describe("deterministic terrain generation", () => {
  it("produces identical height fields for identical seeds", () => {
    const a = new Terrain({ seed: 42, gridN: 65, size: 100 });
    const b = new Terrain({ seed: 42, gridN: 65, size: 100 });
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it("produces different height fields for different seeds", () => {
    const a = new Terrain({ seed: 1, gridN: 65, size: 100 });
    const b = new Terrain({ seed: 2, gridN: 65, size: 100 });
    let diffs = 0;
    for (let i = 0; i < a.heights.length; i++) {
      if (a.heights[i] !== b.heights[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(a.heights.length * 0.5);
  });

  it("is a plausible mountain landscape (min < water line < max, real relief)", () => {
    const t = new Terrain({ seed: 1337, gridN: 129, size: 200 });
    expect(t.minHeight).toBeLessThan(-2);
    expect(t.maxHeight).toBeGreaterThan(20);
    expect(t.maxHeight - t.minHeight).toBeGreaterThan(25);
    // Heights must be finite everywhere.
    for (const h of t.heights) expect(Number.isFinite(h)).toBe(true);
  });

  it("heightAt matches the grid at cell centers and is continuous", () => {
    const t = new Terrain({ seed: 7, gridN: 65, size: 128 });
    for (let j = 0; j < t.gridN; j += 8) {
      for (let i = 0; i < t.gridN; i += 8) {
        const x = -t.size / 2 + i * t.cell;
        const z = -t.size / 2 + j * t.cell;
        expect(t.heightAt(x, z)).toBeCloseTo(t.heights[j * t.gridN + i], 5);
      }
    }
    // Continuity: small moves change height only a little.
    const h1 = t.heightAt(0, 0);
    const h2 = t.heightAt(0.01, 0.01);
    expect(Math.abs(h2 - h1)).toBeLessThan(1);
  });

  it("PRNG and noise are deterministic", () => {
    const r1 = mulberry32(99);
    const r2 = mulberry32(99);
    for (let i = 0; i < 100; i++) expect(r1()).toBe(r2());

    expect(valueNoise2D(3.7, -2.1, 5)).toBe(valueNoise2D(3.7, -2.1, 5));
    expect(fbm2D(1.5, 1.5, 11, 5)).toBe(fbm2D(1.5, 1.5, 11, 5));
    expect(valueNoise2D(3.7, -2.1, 5)).not.toBe(valueNoise2D(3.7, -2.1, 6));
  });
});
