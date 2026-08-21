/**
 * Shallow-water simulation on a heightfield using the classic
 * "virtual pipes" model (O'Brien & Hodgins 1995; Mei et al. 2007).
 *
 * Each cell stores a water depth and four outflow fluxes (L/R/T/B) to its
 * von-Neumann neighbours. Every step:
 *
 *   1. Sources: rainfall (uniform) and springs (point sources) add water.
 *   2. Flux update: each pipe's flux is accelerated by the hydrostatic
 *      pressure difference, i.e. the gradient of the *water surface*
 *      (terrain height + water depth). Fluxes are clamped to >= 0
 *      (each direction is an outflow pipe) and damped slightly.
 *   3. Limiter: if a cell's total outflow during dt would exceed the water
 *      it holds, all four fluxes are scaled down (this is what makes the
 *      scheme mass-conserving and free of negative depths).
 *   4. Depth integration: depth += dt * (inflow - outflow) / cellArea.
 *   5. Evaporation (optional, proportional to depth).
 *
 * Boundaries are closed (no flow across the map edge), so together with the
 * limiter the total water volume changes only through the explicitly tracked
 * source/sink terms — which the mass-conservation test verifies.
 *
 * Units: the grid spacing is 1 "cell unit"; heights/depths are in the same
 * unit, so a cell's water volume equals its depth. Volumes below are sums
 * of depths.
 */

import type { Spring } from './terrain';

export interface WaterSimOptions {
  width: number;
  height: number;
  /** Terrain heightfield, row-major, length width*height. Not modified. */
  terrain: Float32Array;
  /** Gravity times pipe-cross-section / pipe-length (flux acceleration). */
  flowCoefficient?: number;
  /** Uniform rainfall in depth units per second. */
  rainRate?: number;
  /** Water volume added per spring per second. */
  springRate?: number;
  /** Point sources near peaks. */
  springs?: Spring[];
  /** Fraction of depth evaporated per second. */
  evaporation?: number;
  /** Multiplicative flux damping per step (numerical stabilisation). */
  fluxDamping?: number;
}

export class WaterSim {
  readonly width: number;
  readonly height: number;
  readonly terrain: Float32Array;

  /** Water depth per cell. */
  readonly depth: Float32Array;

  // Outflow fluxes (volume/second) toward each neighbour.
  private readonly fluxL: Float32Array;
  private readonly fluxR: Float32Array;
  private readonly fluxT: Float32Array;
  private readonly fluxB: Float32Array;

  // Scratch: water surface height.
  private readonly surface: Float32Array;

  flowCoefficient: number;
  rainRate: number;
  springRate: number;
  springs: Spring[];
  evaporation: number;
  fluxDamping: number;

  /** Book-keeping for mass accounting (all in volume = summed depth units). */
  totalRained = 0;
  totalSpringInflow = 0;
  totalEvaporated = 0;

  constructor(opts: WaterSimOptions) {
    this.width = opts.width;
    this.height = opts.height;
    if (opts.terrain.length !== opts.width * opts.height) {
      throw new Error('terrain length must equal width * height');
    }
    this.terrain = opts.terrain;

    const n = this.width * this.height;
    this.depth = new Float32Array(n);
    this.fluxL = new Float32Array(n);
    this.fluxR = new Float32Array(n);
    this.fluxT = new Float32Array(n);
    this.fluxB = new Float32Array(n);
    this.surface = new Float32Array(n);

    this.flowCoefficient = opts.flowCoefficient ?? 9.81;
    this.rainRate = opts.rainRate ?? 0;
    this.springRate = opts.springRate ?? 0;
    this.springs = opts.springs ?? [];
    this.evaporation = opts.evaporation ?? 0;
    this.fluxDamping = opts.fluxDamping ?? 0.995;
  }

  /** Total water volume currently on the map (sum of depths). */
  totalVolume(): number {
    let sum = 0;
    for (let i = 0; i < this.depth.length; i++) sum += this.depth[i];
    return sum;
  }

  /** Add water to one cell (clamped to grid). Tracked as spring inflow. */
  addWater(x: number, y: number, volume: number): void {
    const cx = Math.min(this.width - 1, Math.max(0, x | 0));
    const cy = Math.min(this.height - 1, Math.max(0, y | 0));
    this.depth[cy * this.width + cx] += volume;
    this.totalSpringInflow += volume;
  }

  /** Advance the simulation by dt seconds. */
  step(dt: number): void {
    const { width: w, height: h, terrain: H, depth: d, surface: s } = this;
    const { fluxL: fL, fluxR: fR, fluxT: fT, fluxB: fB } = this;
    const n = w * h;

    // 1. Sources -----------------------------------------------------------
    if (this.rainRate > 0) {
      const add = this.rainRate * dt;
      for (let i = 0; i < n; i++) d[i] += add;
      this.totalRained += add * n;
    }
    if (this.springRate > 0) {
      const add = this.springRate * dt;
      for (const sp of this.springs) {
        d[sp.y * w + sp.x] += add;
        this.totalSpringInflow += add;
      }
    }

    // 2. Flux update -------------------------------------------------------
    for (let i = 0; i < n; i++) s[i] = H[i] + d[i];

    const c = this.flowCoefficient * dt;
    const damp = this.fluxDamping;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const si = s[i];

        // Closed boundaries: flux across the map edge stays 0.
        let f: number;

        f = x > 0 ? fL[i] * damp + c * (si - s[i - 1]) : 0;
        fL[i] = f > 0 ? f : 0;

        f = x < w - 1 ? fR[i] * damp + c * (si - s[i + 1]) : 0;
        fR[i] = f > 0 ? f : 0;

        f = y > 0 ? fT[i] * damp + c * (si - s[i - w]) : 0;
        fT[i] = f > 0 ? f : 0;

        f = y < h - 1 ? fB[i] * damp + c * (si - s[i + w]) : 0;
        fB[i] = f > 0 ? f : 0;

        // 3. Outflow limiter: never move more water than the cell holds.
        const out = fL[i] + fR[i] + fT[i] + fB[i];
        if (out > 0) {
          const maxOut = d[i] / dt;
          if (out > maxOut) {
            const k = maxOut / out;
            fL[i] *= k;
            fR[i] *= k;
            fT[i] *= k;
            fB[i] *= k;
          }
        }
      }
    }

    // 4. Depth integration -------------------------------------------------
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const inflow =
          (x > 0 ? fR[i - 1] : 0) +
          (x < w - 1 ? fL[i + 1] : 0) +
          (y > 0 ? fB[i - w] : 0) +
          (y < h - 1 ? fT[i + w] : 0);
        const outflow = fL[i] + fR[i] + fT[i] + fB[i];
        let nd = d[i] + dt * (inflow - outflow);
        if (nd < 0) nd = 0; // guard against float round-off only
        d[i] = nd;
      }
    }

    // 5. Evaporation -------------------------------------------------------
    if (this.evaporation > 0) {
      const keep = Math.max(0, 1 - this.evaporation * dt);
      for (let i = 0; i < n; i++) {
        const before = d[i];
        const after = before * keep;
        d[i] = after;
        this.totalEvaporated += before - after;
      }
    }
  }

  /**
   * Per-cell horizontal flow speed estimate (for rendering/diagnostics):
   * magnitude of the net flux vector through the cell.
   */
  flowSpeedAt(x: number, y: number): number {
    const i = y * this.width + x;
    const fx = this.fluxR[i] - this.fluxL[i];
    const fy = this.fluxB[i] - this.fluxT[i];
    return Math.sqrt(fx * fx + fy * fy);
  }
}
