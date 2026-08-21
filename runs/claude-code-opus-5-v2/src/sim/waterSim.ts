/**
 * Shallow-water simulation on a regular grid, using the "virtual pipes" model
 * (Mei, Decaudin & Hu, 2007).
 *
 * Every cell stores a water column depth `d`. Neighbouring cells are connected
 * by four virtual pipes carrying a volumetric flux. The flux through a pipe is
 * accelerated by the hydrostatic pressure difference between the two cells,
 * which is the difference of their *total* heights (terrain + water):
 *
 *     f' = max(0, damping * f + dt * A * g * dh / l)
 *
 * Because the driving term uses terrain + water rather than terrain alone,
 * water does three things for free:
 *   - it runs down the steepest local terrain gradient (dh is dominated by the
 *     terrain term where the layer is thin)  -> streams
 *   - it comes to rest with a flat free surface once a depression is filled
 *     (dh -> 0 when the water surfaces level out)  -> lakes
 *   - it spills over the lowest saddle when a basin overflows  -> outflow
 *
 * Mass is conserved by construction: whatever leaves cell A through a pipe is
 * added to cell B in the same step. Before the depths are integrated, all four
 * outgoing fluxes of a cell are scaled down by a common factor if they would
 * drain more water than the cell actually holds, which both preserves mass and
 * keeps depths non-negative.
 *
 * This module is pure TypeScript: no Three.js, no DOM, no Math.random().
 */

export type BoundaryMode = 'open' | 'closed';

export interface WaterSimOptions {
  /** Grid width in cells. */
  width: number;
  /** Grid height in cells. */
  height: number;
  /** Terrain elevation per cell, row-major, length width*height. */
  terrain: Float32Array;
  /** World units per cell. */
  cellSize?: number;
  /** Gravitational acceleration. */
  gravity?: number;
  /** Virtual pipe cross-section area; higher = faster, less stable. */
  pipeArea?: number;
  /** Per-step flux damping in [0, 1]; bleeds off sloshing so lakes settle. */
  damping?: number;
  /** Uniform rainfall in depth units per second. */
  rainRate?: number;
  /** Optional per-cell rainfall multiplier (e.g. orographic weighting). */
  rainWeights?: Float32Array | null;
  /** Depth lost per second to evaporation. */
  evaporation?: number;
  /** `open` lets water leave the domain, `closed` seals it in. */
  boundary?: BoundaryMode;
  /** Depths below this are treated as dry (rendering + wet-cell counts). */
  dryThreshold?: number;
  /** Largest integration step accepted; larger dt values are sub-stepped. */
  maxTimeStep?: number;
  /**
   * Upper bound on the depth-averaged flow speed, standing in for bed
   * friction. Without it a thin film on a steep slope is evacuated completely
   * in a single step (one cell per sub-step), which keeps stream beds too
   * shallow to see. Capping the speed makes runoff pile up into channels the
   * way a real mountain stream does.
   */
  maxVelocity?: number;
}

/** A point inflow, e.g. a spring near a summit. */
export interface WaterSource {
  /** Cell index (row * width + col). */
  index: number;
  /** Volume per second added at that cell. */
  rate: number;
}

export interface WaterStats {
  /** Volume currently on the terrain. */
  volume: number;
  /** Cumulative volume added by rain and springs. */
  added: number;
  /** Cumulative volume that left through the domain border. */
  drained: number;
  /** Cumulative volume removed by evaporation. */
  evaporated: number;
  /** Deepest water column. */
  maxDepth: number;
  /** Number of cells wetter than `dryThreshold`. */
  wetCells: number;
  /** Simulated seconds elapsed. */
  time: number;
}

const DEFAULTS = {
  cellSize: 1,
  gravity: 9.81,
  pipeArea: 1.0,
  damping: 0.985,
  rainRate: 0,
  rainWeights: null as Float32Array | null,
  evaporation: 0,
  boundary: 'open' as BoundaryMode,
  dryThreshold: 0.02,
  maxTimeStep: 0.02,
  maxVelocity: Infinity,
};

export class WaterSimulation {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly terrain: Float32Array;

  /** Water column depth per cell. */
  readonly depth: Float32Array;
  /** Outgoing flux to the -x, +x, -y and +y neighbour. */
  readonly fluxL: Float32Array;
  readonly fluxR: Float32Array;
  readonly fluxT: Float32Array;
  readonly fluxB: Float32Array;
  /** Depth-averaged velocity, used for foam/flow shading and for tests. */
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;

  gravity: number;
  pipeArea: number;
  damping: number;
  rainRate: number;
  rainWeights: Float32Array | null;
  evaporation: number;
  boundary: BoundaryMode;
  dryThreshold: number;
  maxTimeStep: number;
  maxVelocity: number;

  private sources: WaterSource[] = [];

  private addedVolume = 0;
  private drainedVolume = 0;
  private evaporatedVolume = 0;
  private elapsed = 0;

  constructor(options: WaterSimOptions) {
    const o = { ...DEFAULTS, ...options };
    this.width = o.width;
    this.height = o.height;
    this.cellSize = o.cellSize;
    this.terrain = o.terrain;

    const n = this.width * this.height;
    if (this.terrain.length !== n) {
      throw new Error(
        `terrain length ${this.terrain.length} does not match ${this.width}x${this.height}`,
      );
    }

    this.depth = new Float32Array(n);
    this.fluxL = new Float32Array(n);
    this.fluxR = new Float32Array(n);
    this.fluxT = new Float32Array(n);
    this.fluxB = new Float32Array(n);
    this.velocityX = new Float32Array(n);
    this.velocityY = new Float32Array(n);

    this.gravity = o.gravity;
    this.pipeArea = o.pipeArea;
    this.damping = o.damping;
    this.rainRate = o.rainRate;
    this.rainWeights = o.rainWeights;
    this.evaporation = o.evaporation;
    this.boundary = o.boundary;
    this.dryThreshold = o.dryThreshold;
    this.maxTimeStep = o.maxTimeStep;
    this.maxVelocity = o.maxVelocity;
  }

  /** Area of a single cell — the conversion factor between depth and volume. */
  get cellArea(): number {
    return this.cellSize * this.cellSize;
  }

  index(col: number, row: number): number {
    return row * this.width + col;
  }

  /** Register a permanent point inflow (a spring). */
  addSource(col: number, row: number, rate: number): void {
    this.sources.push({ index: this.index(col, row), rate });
  }

  addSourceAtIndex(index: number, rate: number): void {
    this.sources.push({ index, rate });
  }

  clearSources(): void {
    this.sources = [];
  }

  /** Drop a volume of water into a disc — used to seed lakes or for tests. */
  addWaterBlob(col: number, row: number, radius: number, depthAmount: number): void {
    const c0 = Math.max(0, Math.floor(col - radius));
    const c1 = Math.min(this.width - 1, Math.ceil(col + radius));
    const r0 = Math.max(0, Math.floor(row - radius));
    const r1 = Math.min(this.height - 1, Math.ceil(row + radius));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dc = c - col;
        const dr = r - row;
        const d = Math.sqrt(dc * dc + dr * dr);
        if (d > radius) continue;
        const falloff = radius > 0 ? 1 - d / radius : 1;
        const add = depthAmount * falloff;
        this.depth[r * this.width + c] += add;
        this.addedVolume += add * this.cellArea;
      }
    }
  }

  /** Total water volume currently sitting on the terrain. */
  totalVolume(): number {
    let sum = 0;
    for (let i = 0; i < this.depth.length; i++) sum += this.depth[i];
    return sum * this.cellArea;
  }

  stats(): WaterStats {
    let maxDepth = 0;
    let wet = 0;
    let sum = 0;
    for (let i = 0; i < this.depth.length; i++) {
      const d = this.depth[i];
      sum += d;
      if (d > maxDepth) maxDepth = d;
      if (d > this.dryThreshold) wet++;
    }
    return {
      volume: sum * this.cellArea,
      added: this.addedVolume,
      drained: this.drainedVolume,
      evaporated: this.evaporatedVolume,
      maxDepth,
      wetCells: wet,
      time: this.elapsed,
    };
  }

  /**
   * Advance by `dt` seconds, transparently sub-stepping so that no single
   * integration step exceeds `maxTimeStep` (the model is only conditionally
   * stable; the flux limiter keeps it safe but large steps look mushy).
   */
  step(dt: number): void {
    if (!(dt > 0)) return;
    const steps = Math.max(1, Math.ceil(dt / this.maxTimeStep));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.substep(h);
  }

  private substep(dt: number): void {
    this.applyInflow(dt);
    this.updateFlux(dt);
    this.limitFlux(dt);
    this.integrateDepth(dt);
    if (this.evaporation > 0) this.applyEvaporation(dt);
    this.elapsed += dt;
  }

  /** Rainfall over the whole grid plus all registered point sources. */
  private applyInflow(dt: number): void {
    const area = this.cellArea;
    if (this.rainRate > 0) {
      const w = this.rainWeights;
      let addedDepth = 0;
      if (w) {
        for (let i = 0; i < this.depth.length; i++) {
          const a = this.rainRate * w[i] * dt;
          this.depth[i] += a;
          addedDepth += a;
        }
      } else {
        const a = this.rainRate * dt;
        for (let i = 0; i < this.depth.length; i++) this.depth[i] += a;
        addedDepth = a * this.depth.length;
      }
      this.addedVolume += addedDepth * area;
    }
    for (const src of this.sources) {
      const volume = src.rate * dt;
      this.depth[src.index] += volume / area;
      this.addedVolume += volume;
    }
  }

  /**
   * Accelerate every pipe by the hydrostatic pressure difference across it.
   * Only outgoing (positive) flux is stored; the reverse direction is handled
   * by the neighbour's own pipe, so each pipe pair stays antisymmetric.
   */
  private updateFlux(dt: number): void {
    const w = this.width;
    const h = this.height;
    const k = (dt * this.pipeArea * this.gravity) / this.cellSize;
    const damping = this.damping;
    const open = this.boundary === 'open';
    const terrain = this.terrain;
    const depth = this.depth;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        const total = terrain[i] + depth[i];

        // -x
        let dh: number;
        if (c > 0) dh = total - (terrain[i - 1] + depth[i - 1]);
        else dh = open ? depth[i] : -Infinity;
        this.fluxL[i] = dh === -Infinity ? 0 : Math.max(0, this.fluxL[i] * damping + k * dh);

        // +x
        if (c < w - 1) dh = total - (terrain[i + 1] + depth[i + 1]);
        else dh = open ? depth[i] : -Infinity;
        this.fluxR[i] = dh === -Infinity ? 0 : Math.max(0, this.fluxR[i] * damping + k * dh);

        // -y
        if (r > 0) dh = total - (terrain[i - w] + depth[i - w]);
        else dh = open ? depth[i] : -Infinity;
        this.fluxT[i] = dh === -Infinity ? 0 : Math.max(0, this.fluxT[i] * damping + k * dh);

        // +y
        if (r < h - 1) dh = total - (terrain[i + w] + depth[i + w]);
        else dh = open ? depth[i] : -Infinity;
        this.fluxB[i] = dh === -Infinity ? 0 : Math.max(0, this.fluxB[i] * damping + k * dh);
      }
    }
  }

  /**
   * Scale a cell's four outgoing fluxes by a common factor K <= 1 so they can
   * never move more water than the cell holds. Using one shared factor keeps
   * the outflow distribution physical and guarantees depth >= 0.
   */
  private limitFlux(dt: number): void {
    const area = this.cellArea;
    const n = this.depth.length;
    const vCap = this.maxVelocity;
    const capFactor = vCap * this.cellSize;
    for (let i = 0; i < n; i++) {
      // Bed friction: volume rate through a pipe of width `cellSize` carrying a
      // column of depth d can never exceed d * cellSize * vMax.
      if (vCap < Infinity) {
        const cap = this.depth[i] * capFactor;
        if (this.fluxL[i] > cap) this.fluxL[i] = cap;
        if (this.fluxR[i] > cap) this.fluxR[i] = cap;
        if (this.fluxT[i] > cap) this.fluxT[i] = cap;
        if (this.fluxB[i] > cap) this.fluxB[i] = cap;
      }

      const out = this.fluxL[i] + this.fluxR[i] + this.fluxT[i] + this.fluxB[i];
      if (out <= 0) continue;
      const available = this.depth[i] * area;
      const wanted = out * dt;
      if (wanted <= available) continue;
      const kScale = available > 0 ? available / wanted : 0;
      this.fluxL[i] *= kScale;
      this.fluxR[i] *= kScale;
      this.fluxT[i] *= kScale;
      this.fluxB[i] *= kScale;
    }
  }

  /**
   * Integrate depth from net flux and derive the depth-averaged velocity used
   * by the renderer. Water crossing the border of an `open` domain is booked
   * into `drainedVolume` so mass can still be audited exactly.
   */
  private integrateDepth(dt: number): void {
    const w = this.width;
    const h = this.height;
    const area = this.cellArea;
    const invArea = 1 / area;
    const depth = this.depth;
    let drained = 0;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;

        const inFromLeft = c > 0 ? this.fluxR[i - 1] : 0;
        const inFromRight = c < w - 1 ? this.fluxL[i + 1] : 0;
        const inFromTop = r > 0 ? this.fluxB[i - w] : 0;
        const inFromBottom = r < h - 1 ? this.fluxT[i + w] : 0;

        const outL = this.fluxL[i];
        const outR = this.fluxR[i];
        const outT = this.fluxT[i];
        const outB = this.fluxB[i];

        const inflow = inFromLeft + inFromRight + inFromTop + inFromBottom;
        const outflow = outL + outR + outT + outB;

        // Flux leaving the domain never arrives anywhere: account for it.
        if (c === 0) drained += outL * dt;
        if (c === w - 1) drained += outR * dt;
        if (r === 0) drained += outT * dt;
        if (r === h - 1) drained += outB * dt;

        const before = depth[i];
        let after = before + ((inflow - outflow) * dt) * invArea;
        if (after < 0) after = 0;

        // Net horizontal volume transport through the cell centre.
        const dWx = (inFromLeft - outL + outR - inFromRight) * 0.5;
        const dWy = (inFromTop - outT + outB - inFromBottom) * 0.5;
        const avg = (before + after) * 0.5;
        if (avg > 1e-6) {
          this.velocityX[i] = dWx / (this.cellSize * avg);
          this.velocityY[i] = dWy / (this.cellSize * avg);
        } else {
          this.velocityX[i] = 0;
          this.velocityY[i] = 0;
        }

        depth[i] = after;
      }
    }
    this.drainedVolume += drained;
  }

  private applyEvaporation(dt: number): void {
    const loss = this.evaporation * dt;
    let removedDepth = 0;
    for (let i = 0; i < this.depth.length; i++) {
      const d = this.depth[i];
      if (d <= 0) continue;
      const nd = Math.max(0, d - loss);
      removedDepth += d - nd;
      this.depth[i] = nd;
    }
    this.evaporatedVolume += removedDepth * this.cellArea;
  }
}
