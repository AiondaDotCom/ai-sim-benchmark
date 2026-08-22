import type { Terrain } from "../terrain/terrain";

/**
 * Shallow-water style cell automaton on the terrain grid.
 *
 * Each cell stores a water depth. Every step, water is pushed from each cell
 * towards its lowest neighbour(s) proportionally to the terrain gradient,
 * so it flows downhill, accumulates in depressions (lakes) and drains
 * along channels (streams). Rain and springs add mass; edge cells drain
 * off-map. Total mass is conserved up to explicit sources/sinks.
 */
export interface WaterConfig {
  /** Depth added per second per cell while raining. */
  rainRate: number;
  /** Number of spring cells near peaks. */
  springCount: number;
  /** Depth added per second per spring. */
  springRate: number;
  /** Fraction of a cell's depth that may move downhill per step. */
  flowSpeed: number;
  /** Constant infiltration/evaporation depth removed per second from
   *  every wet cell. Must exceed `rainRate` so thin rain films cannot
   *  accumulate; converging runoff (streams, lakes) outpaces it locally. */
  absorptionRate: number;
  /** Whether the outermost ring drains off-map (island outlet). */
  borderDrain: boolean;
  /** Fraction of depth lost per step by border cells (proportional). */
  borderDrainFactor: number;
  /** Simulation timestep in seconds (fixed step). */
  dt: number;
}

export const defaultWaterConfig: WaterConfig = {
  rainRate: 0.05,
  springCount: 6,
  springRate: 0.6,
  flowSpeed: 0.55,
  absorptionRate: 0.08,
  borderDrain: true,
  borderDrainFactor: 0.5,
  dt: 1 / 30,
};

export class WaterSimulation {
  readonly gridN: number;
  readonly cellSize: number;
  /** Water depth per cell (world units). */
  readonly depth: Float32Array;
  /** Flux leaving each cell per step (for diagnostics/tests). */
  private nextDepth: Float32Array;
  private config: WaterConfig;
  private terrain: Terrain;
  /** Cell indices acting as springs (near local peaks). */
  readonly springCells: number[];

  constructor(terrain: Terrain, config: Partial<WaterConfig> = {}) {
    this.terrain = terrain;
    this.gridN = terrain.gridN;
    this.cellSize = terrain.cell;
    this.config = { ...defaultWaterConfig, ...config };
    const n = this.gridN * this.gridN;
    this.depth = new Float32Array(n);
    this.nextDepth = new Float32Array(n);
    this.springCells = findSpringCells(terrain, this.config.springCount);
  }

  get config_(): WaterConfig {
    return this.config;
  }

  setConfig(patch: Partial<WaterConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  reset(): void {
    this.depth.fill(0);
  }

  /** Advance the simulation by one fixed step; `elapsed` scales rain/springs. */
  step(): void {
    const { gridN, depth, nextDepth, terrain } = this;
    const cfg = this.config;
    const dt = cfg.dt;

    // Sources: rain everywhere + springs.
    for (let k = 0; k < depth.length; k++) {
      nextDepth[k] = depth[k] + cfg.rainRate * dt;
    }
    for (const s of this.springCells) {
      nextDepth[s] += cfg.springRate * dt;
    }

    // Downhill transport.
    for (let j = 0; j < gridN; j++) {
      for (let i = 0; i < gridN; i++) {
        const k = j * gridN + i;
        const d = nextDepth[k];
        if (d <= 1e-6) continue;

        const hSelf = terrain.heights[k] + d;

        // Find steepest downhill neighbour(s): push water proportional
        // to how far below us each neighbour's surface is.
        let downSum = 0;
        let iMin = -1;
        let jMin = -1;
        let bestDrop = 0;

        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= gridN || nj >= gridN) continue;
            const nk = nj * gridN + ni;
            const drop = hSelf - (terrain.heights[nk] + nextDepth[nk]);
            if (drop > bestDrop) {
              bestDrop = drop;
              iMin = ni;
              jMin = nj;
            }
            if (drop > 0) downSum += drop;
          }
        }

        if (iMin >= 0) {
          // Move a fraction of our depth towards the steepest descent,
          // scaled by how dominant that drop is among all downhill drops
          // so water spreads across wide slopes but channels in steep ones.
          const slopeShare = bestDrop / Math.max(downSum, 1e-6);
          let amount = Math.min(d * cfg.flowSpeed * slopeShare * 2, d * 0.9);
          // Never move more than would invert the surface difference.
          const target = terrain.heights[jMin * gridN + iMin] + nextDepth[jMin * gridN + iMin];
          amount = Math.min(amount, Math.max(0, (hSelf - target) / 2));
          amount = Math.max(0, amount);
          nextDepth[k] -= amount;
          nextDepth[jMin * gridN + iMin] += amount;
        }
      }
    }

    // Infiltration/evaporation: constant-rate absorption from every wet
    // cell. Because absorptionRate > rainRate, isolated rain films cannot
    // accumulate (cells stay dry); only cells receiving converging runoff
    // or spring inflow sustain a standing depth -> streams and lakes.
    const absorb = cfg.absorptionRate * dt;
    for (let k = 0; k < nextDepth.length; k++) {
      if (nextDepth[k] > 0) {
        nextDepth[k] = Math.max(0, nextDepth[k] - absorb);
      }
    }

    if (cfg.borderDrain) {
      drainBorders(nextDepth, gridN, cfg.borderDrainFactor);
    }

    depth.set(nextDepth);
  }

  /** Total water mass currently in the system. */
  totalMass(): number {
    let sum = 0;
    for (let k = 0; k < this.depth.length; k++) sum += this.depth[k];
    return sum;
  }
}

/** Remove a proportional fraction of the water at the outermost ring so
 *  the island can drain freely (free outflow at the map edge). */
function drainBorders(depth: Float32Array, gridN: number, factor: number): void {
  const keep = 1 - Math.min(Math.max(factor, 0), 1);
  for (let i = 0; i < gridN; i++) {
    depth[i] *= keep;
    depth[(gridN - 1) * gridN + i] *= keep;
    depth[i * gridN] *= keep;
    depth[i * gridN + gridN - 1] *= keep;
  }
}

/**
 * Pick the N highest local-maximum cells as springs, deterministic.
 */
export function findSpringCells(terrain: Terrain, count: number): number[] {
  const { gridN, heights } = terrain;
  const candidates: Array<{ k: number; score: number }> = [];
  const minHeight = terrain.minHeight + (terrain.maxHeight - terrain.minHeight) * 0.35;
  for (let j = 2; j < gridN - 2; j++) {
    for (let i = 2; i < gridN - 2; i++) {
      const k = j * gridN + i;
      const h = heights[k];
      if (h < minHeight) continue;
      let isPeak = true;
      let hasDownhill = false;
      let neighbourSum = 0;
      let neighbourCount = 0;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          if (di === 0 && dj === 0) continue;
          const nk = (j + dj) * gridN + (i + di);
          neighbourSum += heights[nk];
          neighbourCount++;
          if (heights[nk] > h) {
            isPeak = false;
          }
          if (heights[nk] < h) {
            hasDownhill = true;
          }
        }
      }
      if (!isPeak || !hasDownhill) continue;
      // Prominence above neighbourhood average -> prefer real summits.
      candidates.push({ k, score: h - neighbourSum / neighbourCount });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Enforce minimum spacing so springs spread over different mountains.
  const chosen: number[] = [];
  const minDist = gridN / 8;
  for (const c of candidates) {
    const ci = c.k % gridN;
    const cj = Math.floor(c.k / gridN);
    let ok = true;
    for (const other of chosen) {
      const oi = other % gridN;
      const oj = Math.floor(other / gridN);
      if ((ci - oi) ** 2 + (cj - oj) ** 2 < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) chosen.push(c.k);
    if (chosen.length >= count) break;
  }
  return chosen;
}
