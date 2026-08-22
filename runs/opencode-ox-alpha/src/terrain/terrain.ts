import { fbm2D } from "./noise";

/**
 * Procedural, fully deterministic mountain landscape.
 * Height field over an N x N grid; world size is size x size units.
 */
export interface TerrainConfig {
  seed: number;
  gridN: number;
  size: number;
}

export class Terrain {
  readonly seed: number;
  readonly gridN: number;
  readonly size: number;
  /** Cell spacing in world units. */
  readonly cell: number;
  /** Row-major height field, heights[i] = height at (x = i % N, z = floor(i / N)). */
  readonly heights: Float32Array;
  /** Minimum / maximum terrain height. */
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor(config: TerrainConfig) {
    const { seed, gridN, size } = config;
    this.seed = seed;
    this.gridN = gridN;
    this.size = size;
    this.cell = size / (gridN - 1);

    const h = new Float32Array(gridN * gridN);
    let min = Infinity;
    let max = -Infinity;

    for (let j = 0; j < gridN; j++) {
      for (let i = 0; i < gridN; i++) {
        // Normalized coordinates centered on the island.
        const nx = (i / (gridN - 1)) * 2 - 1;
        const nz = (j / (gridN - 1)) * 2 - 1;

        // Domain-warped fBm for less axis-aligned, more organic ridges.
        const wx = nx + 0.35 * fbm2D(nx * 1.5 + 5.2, nz * 1.5 + 1.3, seed + 7777, 4);
        const wz = nz + 0.35 * fbm2D(nx * 1.5 - 3.1, nz * 1.5 + 9.7, seed + 8888, 4);
        let e = fbm2D(wx * 2.0, wz * 2.0, seed, 6);

        // Ridged component for sharp mountain crests.
        const ridge = 1 - Math.abs(fbm2D(wx * 3.0, wz * 3.0, seed + 12345, 5));
        e = e * 0.65 + (ridge * 2 - 1) * 0.45;

        // Radial falloff -> island so water can leave the map edges.
        const r = Math.sqrt(nx * nx + nz * nz);
        const falloff = smoothClamp(1.15 - r, 0, 1) ** 1.6;

        // Remap into [base..peak] with a power curve that favours valleys.
        let v = Math.max(-1, Math.min(1, e));
        v = Math.sign(v) * Math.abs(v) ** 1.25;
        const height = -6 + 46 * (0.5 + 0.5 * v) * falloff;

        h[j * gridN + i] = height;
        if (height < min) min = height;
        if (height > max) max = height;
      }
    }

    // Gentle smoothing pass to remove single-cell spikes.
    const smoothed = new Float32Array(h);
    for (let j = 1; j < gridN - 1; j++) {
      for (let i = 1; i < gridN - 1; i++) {
        const k = j * gridN + i;
        smoothed[k] =
          4 * h[k] +
          h[k - 1] + h[k + 1] + h[k - gridN] + h[k + gridN];
        smoothed[k] /= 8;
      }
    }

    this.heights = smoothed;
    let mn = Infinity;
    let mx = -Infinity;
    for (let k = 0; k < smoothed.length; k++) {
      if (smoothed[k] < mn) mn = smoothed[k];
      if (smoothed[k] > mx) mx = smoothed[k];
    }
    this.minHeight = mn;
    this.maxHeight = mx;
  }

  /** Bilinear terrain height at arbitrary world position (y-up, x/z plane). */
  heightAt(x: number, z: number): number {
    const fx = (x + this.size / 2) / this.cell;
    const fz = (z + this.size / 2) / this.cell;
    const i = Math.max(0, Math.min(this.gridN - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.gridN - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const tz = Math.max(0, Math.min(1, fz - j));

    const h00 = this.heights[j * this.gridN + i];
    const h10 = this.heights[j * this.gridN + i + 1];
    const h01 = this.heights[(j + 1) * this.gridN + i];
    const h11 = this.heights[(j + 1) * this.gridN + i + 1];

    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }
}

function smoothClamp(v: number, lo: number, hi: number): number {
  const t = Math.max(lo, Math.min(hi, v));
  return t * t * (3 - 2 * t);
}
