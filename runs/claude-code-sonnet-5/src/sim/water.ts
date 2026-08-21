import type { TerrainData } from './terrain';

export interface WaterSimOptions {
  /** Depth (world units) of rain added per second, spread uniformly over the grid. */
  rainRate: number;
  /** Extra depth (world units) added per second at each spring cell. */
  springRate: number;
  /** Grid cell indices where continuous springs emerge (near mountain peaks). */
  springIndices: number[];
  /** Fraction of a cell's water that is allowed to leave towards each downhill neighbour per second. */
  flowRate: number;
  /** Fraction of standing water lost to evaporation per second (keeps the system in equilibrium). */
  evaporationRate: number;
  /** Minimum water depth considered "present" - anything below this is treated as dry, avoids FP dust. */
  minDepth: number;
}

const DEFAULT_OPTIONS: WaterSimOptions = {
  rainRate: 0.012,
  springRate: 0.09,
  springIndices: [],
  flowRate: 3.2,
  evaporationRate: 0.0,
  minDepth: 1e-5,
};

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Grid-based shallow-water / "virtual pipes" style simulation.
 *
 * Each cell stores a water depth on top of the (fixed) terrain height. Every
 * step we look at the *total* height (terrain + water) of each cell versus
 * its four axis-neighbours; water flows from higher total-height cells to
 * lower ones, proportional to the height difference, and is capped so a
 * cell never sends out more water than it actually has (and never overshoots
 * into flowing uphill or past equilibrium). This is an explicit, local,
 * mass-conserving relaxation scheme - simple enough to run at interactive
 * frame rates over a few thousand cells with no external physics engine.
 */
export class WaterSimulation {
  readonly resolution: number;
  readonly options: WaterSimOptions;
  private readonly terrainHeights: Float32Array;
  /** Current water depth per cell. */
  depth: Float32Array;
  /** Scratch buffer for outflow accumulation, reused every step to avoid GC churn. */
  private readonly outflow: Float32Array;
  private elapsed = 0;

  constructor(terrain: TerrainData, options: Partial<WaterSimOptions> = {}) {
    this.resolution = terrain.resolution;
    this.terrainHeights = terrain.heights;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.depth = new Float32Array(this.resolution * this.resolution);
    this.outflow = new Float32Array(this.resolution * this.resolution);
  }

  /** Total water volume currently in the system (sum of depth * unit cell area). Cell area is 1 in grid units. */
  totalVolume(): number {
    let sum = 0;
    for (let i = 0; i < this.depth.length; i++) sum += this.depth[i];
    return sum;
  }

  /** Adds a uniform sheet of rain plus continuous spring sources. Does not touch flow/evaporation. */
  addSources(dt: number): void {
    const { rainRate, springRate, springIndices } = this.options;
    if (rainRate > 0) {
      for (let i = 0; i < this.depth.length; i++) {
        this.depth[i] += rainRate * dt;
      }
    }
    if (springRate > 0 && springIndices.length > 0) {
      for (const idx of springIndices) {
        this.depth[idx] += springRate * dt;
      }
    }
  }

  /**
   * Advances the flow-and-evaporation part of the simulation by `dt` seconds.
   * Kept separate from `addSources` so tests can exercise pure, mass-conserving
   * flow behaviour (no rain/springs/evaporation) in isolation.
   */
  step(dt: number): void {
    this.elapsed += dt;
    const res = this.resolution;
    const { flowRate, minDepth, evaporationRate } = this.options;
    const outflow = this.outflow;
    outflow.fill(0);

    // 1) Compute, for every cell, how much water flows to each lower neighbour.
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = y * res + x;
        const available = this.depth[idx];
        if (available <= minDepth) continue;

        const myTotal = this.terrainHeights[idx] + available;
        let diffSum = 0;
        const diffs: number[] = [0, 0, 0, 0];

        for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
          const [ox, oy] = NEIGHBOR_OFFSETS[n];
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= res || ny < 0 || ny >= res) continue;
          const nIdx = ny * res + nx;
          const neighborTotal = this.terrainHeights[nIdx] + this.depth[nIdx];
          const diff = myTotal - neighborTotal;
          if (diff > 0) {
            diffs[n] = diff;
            diffSum += diff;
          }
        }

        if (diffSum <= 0) continue;

        // Cap total outflow so a cell never empties past equilibrium (avoids oscillation/negative depth)
        // and never sends out more water than it currently holds.
        const maxOut = Math.min(available, (diffSum / 2) * flowRate * dt, available * flowRate * dt);

        for (let n = 0; n < NEIGHBOR_OFFSETS.length; n++) {
          if (diffs[n] <= 0) continue;
          const [ox, oy] = NEIGHBOR_OFFSETS[n];
          const nx = x + ox;
          const ny = y + oy;
          const nIdx = ny * res + nx;
          const share = (diffs[n] / diffSum) * maxOut;
          outflow[nIdx] += share; // inflow credited to neighbour
          outflow[idx] -= share; // outflow debited from this cell
        }
      }
    }

    // 2) Apply flux atomically so ordering within the pass never double-counts water.
    for (let i = 0; i < this.depth.length; i++) {
      this.depth[i] = Math.max(0, this.depth[i] + outflow[i]);
    }

    // 3) Evaporation, if configured - explicitly NOT mass-conserving, used to keep
    // long-running demos in a visual steady state rather than flooding forever.
    if (evaporationRate > 0) {
      const keep = Math.max(0, 1 - evaporationRate * dt);
      for (let i = 0; i < this.depth.length; i++) {
        this.depth[i] *= keep;
        if (this.depth[i] < minDepth) this.depth[i] = 0;
      }
    }
  }

  /** Convenience: sources + flow in one call, for the render loop. */
  tick(dt: number): void {
    this.addSources(dt);
    this.step(dt);
  }
}
