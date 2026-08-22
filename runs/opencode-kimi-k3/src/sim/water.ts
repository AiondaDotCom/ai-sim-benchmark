import type { Terrain } from './terrain';

/**
 * Grid-based shallow-water style simulation.
 *
 * Model:
 *  - Every cell holds a water depth `w`. The free surface is `terrain + w`.
 *  - Each step, water flows from every cell to its 4 lower neighbours,
 *    distributed proportionally to the surface-height difference and
 *    capped at half the difference so surfaces equilibrate instead of
 *    oscillating. Flow only moves water between cells => mass is conserved.
 *  - Sources: uniform rainfall + point springs near mountain peaks.
 *  - Sinks: evaporation; optional drainage across the open map border.
 *
 * The simulation is fully deterministic: no Math.random, fixed grid order.
 */

export interface Spring {
  /** Grid coordinates. */
  x: number;
  y: number;
}

export interface WaterConfig {
  /** Rainfall rate (depth units per second, added uniformly). */
  rainRate: number;
  /** Evaporation rate (depth units per second, removed where water exists). */
  evaporation: number;
  /** Flow speed coefficient. */
  flowRate: number;
  /** Emission rate per spring (depth units per second). */
  springRate: number;
  /** Spring locations in grid coordinates. */
  springs: Spring[];
  /** If true, water drains off the map border. Default true. */
  openBorders?: boolean;
}

export class WaterSim {
  readonly size: number;
  readonly terrain: Terrain;
  readonly config: WaterConfig;
  /** Water depth per cell. */
  readonly depth: Float32Array;
  /** Simulated time in seconds. */
  time = 0;

  constructor(terrain: Terrain, config: WaterConfig) {
    this.terrain = terrain;
    this.size = terrain.size;
    this.config = config;
    this.depth = new Float32Array(this.size * this.size);
  }

  /** Total water volume currently on the map. */
  totalMass(): number {
    let m = 0;
    const d = this.depth;
    for (let i = 0; i < d.length; i++) m += d[i];
    return m;
  }

  /** Water-weighted center of mass in grid coordinates. */
  centerOfMass(): { x: number; y: number } {
    const { size, depth } = this;
    let m = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const w = depth[y * size + x];
        if (w > 0) {
          m += w;
          sx += w * x;
          sy += w * y;
        }
      }
    }
    if (m === 0) return { x: NaN, y: NaN };
    return { x: sx / m, y: sy / m };
  }

  addWater(x: number, y: number, amount: number): void {
    this.depth[y * this.size + x] += amount;
  }

  step(dt: number): void {
    this.time += dt;
    this.applySourcesAndSinks(dt, 'pre');
    this.flow(dt);
    this.applySourcesAndSinks(dt, 'post');
  }

  private applySourcesAndSinks(dt: number, phase: 'pre' | 'post'): void {
    const { depth, size, config } = this;
    if (phase === 'pre') {
      if (config.rainRate > 0) {
        const add = config.rainRate * dt;
        for (let i = 0; i < depth.length; i++) depth[i] += add;
      }
      if (config.springRate > 0) {
        const add = config.springRate * dt;
        for (const s of config.springs) {
          if (s.x >= 0 && s.x < size && s.y >= 0 && s.y < size) {
            depth[s.y * size + s.x] += add;
          }
        }
      }
    } else {
      if (config.evaporation > 0) {
        const ev = config.evaporation * dt;
        for (let i = 0; i < depth.length; i++) {
          if (depth[i] > 0) depth[i] = Math.max(0, depth[i] - ev);
        }
      }
    }
  }

  private flow(dt: number): void {
    const { size, depth } = this;
    const h = this.terrain.heights;
    const rate = this.config.flowRate * dt;
    const open = this.config.openBorders !== false;
    // Reusable scratch for the 4 neighbour deltas (E, W, S, N).
    const deltas = new Float64Array(4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const w = depth[i];
        if (w <= 0) continue;
        const surface = h[i] + w;

        let dsum = 0;
        deltas[0] = 0;
        deltas[1] = 0;
        deltas[2] = 0;
        deltas[3] = 0;

        if (x + 1 < size) {
          const j = i + 1;
          const d = surface - (h[j] + depth[j]);
          if (d > 0) {
            deltas[0] = d;
            dsum += d;
          }
        }
        if (x - 1 >= 0) {
          const j = i - 1;
          const d = surface - (h[j] + depth[j]);
          if (d > 0) {
            deltas[1] = d;
            dsum += d;
          }
        }
        if (y + 1 < size) {
          const j = i + size;
          const d = surface - (h[j] + depth[j]);
          if (d > 0) {
            deltas[2] = d;
            dsum += d;
          }
        }
        if (y - 1 >= 0) {
          const j = i - size;
          const d = surface - (h[j] + depth[j]);
          if (d > 0) {
            deltas[3] = d;
            dsum += d;
          }
        }

        if (dsum > 0) {
          let amount = Math.min(w, rate * dsum);
          if (amount > 0) {
            const share = amount / dsum;
            for (let n = 0; n < 4; n++) {
              const d = deltas[n];
              if (d <= 0) continue;
              // Cap at half the difference: surfaces meet, never overshoot.
              let f = share * d;
              if (f > d * 0.5) f = d * 0.5;
              const j =
                n === 0 ? i + 1 : n === 1 ? i - 1 : n === 2 ? i + size : i - size;
              depth[i] -= f;
              depth[j] += f;
            }
          }
        }

        // Drain water off the open border (mass leaves the world).
        if (open && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) {
          const drain = Math.min(depth[i], depth[i] * rate * 2);
          depth[i] -= drain;
        }
      }
    }
  }
}
