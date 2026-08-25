import { describe, expect, it } from 'vitest';
import { flowTick, totalDepth } from '../src/sim/water';
import { generateTerrain } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';

function randomDepths(n: number, seed: number, maxDepth: number): Float32Array {
  const depth = new Float32Array(n * n);
  const rand = mulberry32(seed);
  for (let k = 0; k < depth.length; k++) depth[k] = rand() * maxDepth;
  return depth;
}

describe('heightfield water solver', () => {
  it('conserves total water mass (approximate, within float tolerance)', () => {
    const n = 64;
    const terrain = generateTerrain({ seed: 7, n });
    const depth = randomDepths(n, 1234, 1.5);
    const before = totalDepth(depth);

    for (let t = 0; t < 400; t++) {
      flowTick(terrain.height, depth, n, 0.35, t % 2 === 1);
    }

    const after = totalDepth(depth);
    expect(Math.abs(after - before) / before).toBeLessThan(1e-4);
  });

  it('never produces negative or non-finite depth', () => {
    const n = 64;
    const terrain = generateTerrain({ seed: 7, n });
    // Include deep pools and dry cells in the same field.
    const depth = randomDepths(n, 99, 6);
    for (let k = 0; k < depth.length; k += 7) depth[k] = 0;

    for (let t = 0; t < 500; t++) {
      flowTick(terrain.height, depth, n, 0.35, t % 2 === 1);
    }

    for (let k = 0; k < depth.length; k++) {
      expect(depth[k]).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(depth[k])).toBe(true);
    }
  });

  it('moves water downhill on a slope, never uphill', () => {
    const n = 64;
    // A ramp descending in +x: height 20 -> ~10 across the grid.
    const height = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) height[j * n + i] = 20 - 0.15 * i;
    }
    const depth = new Float32Array(n * n);
    // A water block on the upper part of the ramp.
    for (let j = 28; j <= 35; j++) {
      for (let i = 8; i <= 12; i++) depth[j * n + i] = 0.5;
    }

    const centroidBefore: [number, number] = centroid(depth, n, height);
    const massBefore = totalDepth(depth);

    for (let t = 0; t < 2000; t++) {
      flowTick(height, depth, n, 0.35, t % 2 === 1);
    }

    const massAfter = totalDepth(depth);
    const [meanX, meanElev] = centroid(depth, n, height);

    // Mass conserved...
    expect(Math.abs(massAfter - massBefore) / massBefore).toBeLessThan(1e-4);
    // ...and the water traveled far downhill.
    expect(meanX).toBeGreaterThan(centroidBefore[0] + 20);
    // Mass-weighted elevation dropped.
    expect(meanElev).toBeLessThan(centroidBefore[1]);
    // Almost no water is left on the upper half of the ramp.
    let upper = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n / 2; i++) upper += depth[j * n + i];
    }
    expect(upper / massAfter).toBeLessThan(0.05);
  });

  it('never raises a water surface above its previous maximum', () => {
    const n = 48;
    const height = new Float32Array(n * n).fill(10);
    const depth = randomDepths(n, 55, 2);
    const maxSurfaceBefore = Math.max(...height.map((h, k) => h + depth[k]));

    for (let t = 0; t < 300; t++) {
      flowTick(height, depth, n, 0.35, t % 2 === 1);
    }

    let maxSurfaceAfter = -Infinity;
    for (let k = 0; k < height.length; k++) {
      maxSurfaceAfter = Math.max(maxSurfaceAfter, height[k] + depth[k]);
    }
    expect(maxSurfaceAfter).toBeLessThanOrEqual(maxSurfaceBefore + 1e-6);
  });

  it('collects water in a depression and levels the surface', () => {
    const n = 64;
    // A paraboloid bowl centered on the grid, lowest at the center.
    const c = (n - 1) / 2;
    const height = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        height[j * n + i] = 0.08 * ((i - c) ** 2 + (j - c) ** 2);
      }
    }
    const depth = new Float32Array(n * n);
    // A pool of water far up the bowl wall, off-center.
    for (let j = 30; j <= 33; j++) {
      for (let i = 14; i <= 17; i++) depth[j * n + i] = 1;
    }
    const massBefore = totalDepth(depth);

    for (let t = 0; t < 4000; t++) {
      flowTick(height, depth, n, 0.35, t % 2 === 1);
    }

    const massAfter = totalDepth(depth);
    expect(Math.abs(massAfter - massBefore) / massBefore).toBeLessThan(1e-4);

    // The collected pool sits at the bottom of the bowl.
    let massX = 0;
    let massY = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        massX += depth[j * n + i] * i;
        massY += depth[j * n + i] * j;
      }
    }
    const cx = massX / massAfter;
    const cy = massY / massAfter;
    expect(Math.hypot(cx - c, cy - c)).toBeLessThan(6);

    // The free surface of the pooled water is (nearly) level.
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < depth.length; k++) {
      if (depth[k] > 1e-4) {
        const s = height[k] + depth[k];
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    }
    expect(hi - lo).toBeLessThan(1.0);
  });
});

/** Mass-weighted centroid [meanIndexX, meanElevation]. */
function centroid(
  depth: Float32Array,
  n: number,
  height: Float32Array
): [number, number] {
  let mass = 0;
  let mx = 0;
  let me = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const w = depth[j * n + i];
      mass += w;
      mx += w * i;
      me += w * height[j * n + i];
    }
  }
  return [mx / mass, me / mass];
}
