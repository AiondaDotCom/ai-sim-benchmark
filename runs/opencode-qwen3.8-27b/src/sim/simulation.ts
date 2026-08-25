import { generateTerrain, channelSource, type Terrain } from './terrain';
import { flowTick, totalDepth } from './water';
import { findSprings } from './sources';

/** Tunable simulation parameters. All rates are in world units of depth per second. */
export interface SimConfig {
  /** Seed for terrain generation. */
  seed: number;
  /** Grid resolution, cells per side. */
  gridN: number;
  /** Rainfall depth added to every cell each second (strong: a visible sheen + a rising lake). */
  rainRate: number;
  /** Depth each spring adds each second (strong: the visible star). */
  springRate: number;
  /** Number of springs on the highest, separated peaks. */
  numSprings: number;
  /** Depth the river source adds each second, at the top of the carved channel. */
  riverRate: number;
  /**
   * Depth-proportional evaporation, applied to all water. Because it scales
   * with depth it is negligible in a thin stream but meaningful in a deep
   * lake, so the sealed basin settles at a stable lake level instead of
   * rising without bound.
   */
  evapRate: number;
  /** Relaxation stiffness of the flow solver per tick (must be <= 0.5 for stability). */
  flowCoeff: number;
  /** Length of one flow tick, in seconds. */
  tickDt: number;
}

export const DEFAULT_SIM: SimConfig = {
  seed: 1337,
  gridN: 128,
  // Strong rain: its equilibrium film (rainRate / evapRate ≈ 0.15) is deep
  // enough to read as a visible wet sheen over the ground and, accumulating in
  // the sealed basin, to raise the lake level so the rise is visible in the
  // animation. The water renderer fades in smoothly with depth, so this shows
  // as rising water rather than a hard-edged flood sheet.
  rainRate: 0.003,
  // Mountain springs: strong enough that each carves a distinct, visible stream
  // that flows down the ring and reaches the lake, without flooding the peaks
  // into a wide sheet before draining.
  springRate: 3.5,
  numSprings: 3,
  // The river: a strong source at the top of the carved channel that keeps a
  // clear, wide stream flowing down the mountain into the lake at all times.
  // Strong enough to fill the broad riverbed into a solid, dominant blue band.
  riverRate: 14,
  // Evaporation is depth-proportional: negligible in a thin stream, but strong
  // enough in the deep lake to bound it at a distinct, stable level rather
  // than letting it spread into a shallow sheet across the lowland.
  evapRate: 0.02,
  flowCoeff: 0.35,
  tickDt: 1 / 45
};

/**
 * The full simulation: a terrain, a water depth field, and source terms.
 *
 * `step(dt)` advances the simulation by `dt` seconds:
 *   1. continuous sources and sinks — rain over the whole map, springs at
 *      the peaks, the river at the channel top, and depth-proportional
 *      evaporation — all applied proportionally to dt;
 *   2. the flow relaxation, run as `round(dt / tickDt)` fixed-length ticks so
 *      behavior (and tests) are independent of frame rate.
 *
 * The class is a pure function of its config and its step history: no time,
 * no randomness after construction, no global state — fully deterministic.
 */
export class Simulation {
  readonly config: SimConfig;
  readonly terrain: Terrain;
  /** Water depth per cell, in world units. */
  readonly depth: Float32Array;
  /** Cell indices that emit spring water every step. */
  readonly springs: number[];
  /** The cell at the top of the carved river channel (the river source). */
  readonly riverSource: number;
  /** Elapsed simulated time, in seconds. */
  time = 0;

  private tickParity = false;

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_SIM, ...config };
    const { seed, gridN } = this.config;
    this.terrain = generateTerrain({ seed, n: gridN });
    this.depth = new Float32Array(gridN * gridN);
    this.springs = findSprings(this.terrain, this.config.numSprings);
    this.riverSource = channelSource(this.terrain);
  }

  /** Advance the simulation by `dt` seconds. Zero or negative dt is a no-op. */
  step(dt: number): void {
    if (dt <= 0) return;
    const c = this.config;
    const { depth, terrain } = this;
    this.time += dt;

    if (c.rainRate > 0) {
      const add = c.rainRate * dt;
      for (let k = 0; k < depth.length; k++) depth[k] += add;
    }

    if (c.springRate > 0) {
      const add = c.springRate * dt;
      for (const s of this.springs) depth[s] += add;
    }

    if (c.riverRate > 0) {
      // The river source: a single strong emitter at the top of the carved
      // channel, so a clear, continuous stream flows down the ring into the lake.
      depth[this.riverSource] += c.riverRate * dt;
    }

    if (c.evapRate > 0) {
      // Evaporation: a gentle, depth-proportional loss. It is negligible in a
      // thin stream (so streams survive) but meaningful in a deep lake, which
      // keeps the lakes from rising without bound in the sealed basin.
      const keep = 1 - c.evapRate * dt;
      for (let k = 0; k < depth.length; k++) {
        if (depth[k] > 0) depth[k] *= keep;
      }
    }

    const ticks = Math.max(1, Math.round(dt / c.tickDt));
    const { height, n } = terrain;
    for (let t = 0; t < ticks; t++) {
      flowTick(height, depth, n, c.flowCoeff, this.tickParity);
      this.tickParity = !this.tickParity;
    }
  }

  /** Total water mass expressed as sum of cell depths (volume / cell area). */
  totalWater(): number {
    return totalDepth(this.depth);
  }

  /** Total water volume in world units^3. */
  volume(): number {
    const a = this.terrain.cellSize * this.terrain.cellSize;
    return totalDepth(this.depth) * a;
  }

  /** Water surface height per cell (terrain + depth). */
  surface(): Float32Array {
    const { height } = this.terrain;
    const { depth } = this;
    const out = new Float32Array(height.length);
    for (let k = 0; k < out.length; k++) out[k] = height[k] + depth[k];
    return out;
  }
}
