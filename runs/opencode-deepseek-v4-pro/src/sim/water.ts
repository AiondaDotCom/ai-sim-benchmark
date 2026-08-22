/**
 * Grid based shallow-water-on-terrain simulation.
 *
 * Model
 * -----
 * Each cell stores a water *depth* (a column of water sitting on the terrain).
 * The water *surface height* of a cell is `terrain + depth`. Water flows from
 * a cell to an adjacent cell whenever the source's surface is higher than the
 * neighbour's. This makes water:
 *   - flow downhill  (surface ~= terrain when depth is small), and
 *   - level out and pool in depressions (in a basin the surface is flat, so
 *     there is no net flow -> a lake forms).
 *
 * Flow is applied as symmetric, edge-by-edge transfers (a "virtual pipes"
 * relaxation), so mass is conserved exactly by construction: any amount removed
 * from one cell is added to the other.
 *
 * Inputs are uniform rain plus "springs" on high (peak) cells, which is what
 * seeds the streams and rivers that run down the mountains.
 */

export interface WaterParams {
  /** Uniform rainfall, in (normalized) water units per cell per second. */
  rain: number;
  /** Extra peak-source water, per spring cell per second. */
  springs: number;
  /** Fraction of a cell's water removed per second (0 disables it). */
  evaporation: number;
  /** Fraction of border-cell water drained per second ("ocean", 0 disables). */
  edgeDrain: number;
  /** Per-iteration flow factor (0..0.5 recommended for stability). */
  fluxRate: number;
  /** Flow relaxation sub-iterations performed on every step(). */
  iterations: number;
  /** Normalized terrain height threshold for a cell to be a spring source. */
  springHeight: number;
}

export const DEFAULT_WATER_PARAMS: WaterParams = {
  rain: 0.001,
  springs: 0.008,
  evaporation: 0.004,
  edgeDrain: 0,
  fluxRate: 0.3,
  iterations: 8,
  springHeight: 0.6
};

export class WaterSimulation {
  readonly size: number;
  readonly terrain: Float64Array;
  readonly depth: Float64Array;
  params: WaterParams;
  private peaks: number[] = [];
  private pass = 0;

  constructor(
    size: number,
    terrain: ArrayLike<number>,
    params: Partial<WaterParams> = {}
  ) {
    this.size = size;
    this.terrain = Float64Array.from(terrain);
    this.depth = new Float64Array(size * size);
    this.params = { ...DEFAULT_WATER_PARAMS, ...params };
    this.computePeaks();
  }

  private computePeaks(): void {
    this.peaks = [];
    const { size, terrain } = this;
    const th = this.params.springHeight;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const h = terrain[i];
        if (h < th) continue;
        // Spring sources are local summits (strictly above all four neighbours),
        // so water emerges at distinct mountain peaks rather than over whole
        // plateaus.
        if (x > 0 && terrain[i - 1] >= h) continue;
        if (x < size - 1 && terrain[i + 1] >= h) continue;
        if (y > 0 && terrain[i - size] >= h) continue;
        if (y < size - 1 && terrain[i + size] >= h) continue;
        this.peaks.push(i);
      }
    }
  }

  /** Total water volume across the whole grid. */
  totalWater(): number {
    let s = 0;
    for (let i = 0; i < this.depth.length; i++) s += this.depth[i];
    return s;
  }

  /** Add rain and spring water for a time step. */
  applyRain(dt: number): void {
    const n = this.size * this.size;
    const r = this.params.rain * dt;
    if (r !== 0) {
      for (let i = 0; i < n; i++) this.depth[i] += r;
    }
    const s = this.params.springs * dt;
    if (s !== 0) {
      for (const i of this.peaks) this.depth[i] += s;
    }
  }

  private evaporate(dt: number): void {
    const e = this.params.evaporation * dt;
    if (e === 0) return;
    for (let i = 0; i < this.depth.length; i++) {
      this.depth[i] -= Math.min(this.depth[i], this.depth[i] * e);
    }
  }

  /** Drain water out of the map through the sea-level border cells. */
  private drainEdges(dt: number): void {
    const e = this.params.edgeDrain * dt;
    if (e <= 0) return;
    const size = this.size;
    const depth = this.depth;
    for (let x = 0; x < size; x++) {
      depth[x] *= 1 - e;
      depth[(size - 1) * size + x] *= 1 - e;
    }
    for (let y = 0; y < size; y++) {
      depth[y * size] *= 1 - e;
      depth[y * size + (size - 1)] *= 1 - e;
    }
  }

  private flowEdge(a: number, b: number): void {
    const depth = this.depth;
    const sa = this.terrain[a] + depth[a];
    const sb = this.terrain[b] + depth[b];
    const f = this.params.fluxRate;
    if (sa > sb) {
      const flow = Math.min(depth[a], sa - sb) * f;
      depth[a] -= flow;
      depth[b] += flow;
    } else if (sb > sa) {
      const flow = Math.min(depth[b], sb - sa) * f;
      depth[a] += flow;
      depth[b] -= flow;
    }
  }

  private flowPass(): void {
    const size = this.size;
    const reverse = (this.pass & 1) === 1;
    this.pass++;

    if (!reverse) {
      for (let y = 0; y < size; y++) {
        const row = y * size;
        for (let x = 0; x < size - 1; x++) this.flowEdge(row + x, row + x + 1);
      }
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size - 1; y++) this.flowEdge(y * size + x, (y + 1) * size + x);
      }
    } else {
      for (let y = 0; y < size; y++) {
        const row = y * size;
        for (let x = size - 2; x >= 0; x--) this.flowEdge(row + x, row + x + 1);
      }
      for (let x = 0; x < size; x++) {
        for (let y = size - 2; y >= 0; y--) this.flowEdge(y * size + x, (y + 1) * size + x);
      }
    }
  }

  /**
   * Advance the simulation by `dt` seconds: apply inputs, run flow relaxation,
   * then evaporate.
   */
  step(dt: number): void {
    this.applyRain(dt);
    for (let k = 0; k < this.params.iterations; k++) this.flowPass();
    this.evaporate(dt);
    this.drainEdges(dt);
  }
}