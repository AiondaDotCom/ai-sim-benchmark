/**
 * Shallow-water simulation on a heightfield using the "virtual pipes" model
 * (O'Brien & Hodgins 1995; Mei, Decaudin & Hu 2007).
 *
 * Every grid cell stores a water depth d. Neighbouring cells are connected by
 * virtual pipes that carry a volume flux f (volume per second). Each step:
 *
 *   1. Sources add water (rain everywhere, springs at a few points).
 *   2. Every outgoing pipe flux is accelerated by the hydrostatic pressure
 *      difference, i.e. the difference in water *surface* height:
 *          f <- max(0, damping * f + dt * g * A * (H_self - H_neighbour) / l)
 *      with H = terrain + depth. Water therefore moves along the negative
 *      gradient of the surface, which on a dry or thinly wetted slope is the
 *      terrain gradient: water flows downhill.
 *   3. Outflows are scaled down so a cell never loses more water than it holds
 *      (keeps depths non-negative).
 *   4. Depths are updated from the net flux. Because every pipe flux is removed
 *      from exactly one cell and added to exactly one other cell, the transport
 *      step conserves water volume exactly (up to floating point rounding).
 *   5. Evaporation removes a small constant depth per second from wet cells.
 *
 * With `boundary: 'open'` water flowing across the map border leaves the
 * domain (tracked as `drained`), with `'closed'` the border is a wall.
 *
 * Water collects in depressions naturally: a depression is a place where no
 * neighbouring surface is lower, so all outgoing fluxes decay to zero until the
 * water surface rises to the spill point.
 */

export type Boundary = 'open' | 'closed';

export interface WaterParams {
  /** Gravitational acceleration (cell units / s^2). */
  gravity: number;
  /** Virtual pipe cross-section area. */
  pipeArea: number;
  /** Horizontal distance between grid cells (pipe length). */
  cellSize: number;
  /** Flux damping per step in (0, 1]; values < 1 calm oscillations. */
  damping: number;
  /** Evaporation, in depth units per second, applied to every wet cell. */
  evaporation: number;
  /** Behaviour at the map border. */
  boundary: Boundary;
}

export const DEFAULT_WATER_PARAMS: WaterParams = {
  gravity: 9.81,
  pipeArea: 1,
  cellSize: 1,
  damping: 0.995,
  evaporation: 0,
  boundary: 'closed',
};

export interface Spring {
  x: number;
  y: number;
  /** Volume added per second. */
  rate: number;
  /** Radius (cells) over which the spring's water is spread. */
  radius: number;
}

/** Cumulative water budget, all in volume units. */
export interface WaterBudget {
  rained: number;
  sprung: number;
  evaporated: number;
  drained: number;
}

export class WaterSimulation {
  readonly size: number;
  readonly params: WaterParams;
  /** Terrain heights (read only for the simulation). */
  readonly terrain: Float32Array;
  /** Water depth per cell. */
  readonly depth: Float64Array;
  /** Outgoing fluxes towards -x, +x, -y, +y. */
  readonly fluxLeft: Float64Array;
  readonly fluxRight: Float64Array;
  readonly fluxDown: Float64Array;
  readonly fluxUp: Float64Array;
  /** Depth-averaged water velocity (cells per second), for rendering and tests. */
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  /**
   * Relative rainfall weight per cell (mean ~1). Rain rate at a cell is
   * rainRate * rainWeight[i]. Defaults to uniform rain.
   */
  readonly rainWeight: Float32Array;

  /** Uniform rainfall in depth units per second (multiplied by rainWeight). */
  rainRate = 0;
  readonly springs: Spring[] = [];
  readonly budget: WaterBudget = { rained: 0, sprung: 0, evaporated: 0, drained: 0 };
  time = 0;
  steps = 0;

  constructor(terrain: Float32Array, size: number, params: Partial<WaterParams> = {}) {
    if (terrain.length !== size * size) {
      throw new Error(`Terrain has ${terrain.length} samples, expected ${size * size}`);
    }
    this.size = size;
    this.terrain = terrain;
    this.params = { ...DEFAULT_WATER_PARAMS, ...params };
    const n = size * size;
    this.depth = new Float64Array(n);
    this.fluxLeft = new Float64Array(n);
    this.fluxRight = new Float64Array(n);
    this.fluxDown = new Float64Array(n);
    this.fluxUp = new Float64Array(n);
    this.velocityX = new Float32Array(n);
    this.velocityY = new Float32Array(n);
    this.rainWeight = new Float32Array(n).fill(1);
  }

  /**
   * Largest time step for which the explicit update stays stable (CFL
   * condition for shallow water waves, speed sqrt(g * depth), with a safety
   * factor of 0.5).
   */
  maxStableDt(): number {
    const { gravity, pipeArea, cellSize } = this.params;
    const waveSpeed = Math.sqrt((gravity * pipeArea * Math.max(0.05, this.maxDepth())) / (cellSize * cellSize));
    return (0.5 * cellSize) / waveSpeed;
  }

  addWater(x: number, y: number, volume: number): void {
    const l2 = this.params.cellSize * this.params.cellSize;
    this.depth[y * this.size + x] += volume / l2;
  }

  addSpring(spring: Spring): void {
    this.springs.push(spring);
  }

  totalVolume(): number {
    const d = this.depth;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    return sum * this.params.cellSize * this.params.cellSize;
  }

  maxDepth(): number {
    const d = this.depth;
    let m = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > m) m = d[i];
    return m;
  }

  /** Surface height (terrain + water) at a cell. */
  surface(x: number, y: number): number {
    const i = y * this.size + x;
    return this.terrain[i] + this.depth[i];
  }

  /** Advances the simulation by dt seconds. */
  step(dt: number): void {
    if (!(dt > 0)) return;
    const n = this.size;
    const { gravity, pipeArea, cellSize: l, damping, evaporation, boundary } = this.params;
    const l2 = l * l;
    const b = this.terrain;
    const d = this.depth;
    const fL = this.fluxLeft;
    const fR = this.fluxRight;
    const fD = this.fluxDown;
    const fU = this.fluxUp;
    const open = boundary === 'open';

    // 1. Sources ----------------------------------------------------------------
    if (this.rainRate > 0) {
      const w = this.rainWeight;
      const base = this.rainRate * dt;
      let added = 0;
      for (let i = 0; i < d.length; i++) {
        const a = base * w[i];
        d[i] += a;
        added += a;
      }
      this.budget.rained += added * l2;
    }
    for (const s of this.springs) {
      this.budget.sprung += this.applySpring(s, dt);
    }

    // 2 + 3. Flux update with outflow limiting -------------------------------
    const c = (dt * gravity * pipeArea) / l;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const di = d[i];
        const h = b[i] + di;

        let fl = 0;
        let fr = 0;
        let fd = 0;
        let fu = 0;
        if (x > 0) fl = damping * fL[i] + c * (h - b[i - 1] - d[i - 1]);
        else if (open) fl = damping * fL[i] + c * di;
        if (x < n - 1) fr = damping * fR[i] + c * (h - b[i + 1] - d[i + 1]);
        else if (open) fr = damping * fR[i] + c * di;
        if (y > 0) fd = damping * fD[i] + c * (h - b[i - n] - d[i - n]);
        else if (open) fd = damping * fD[i] + c * di;
        if (y < n - 1) fu = damping * fU[i] + c * (h - b[i + n] - d[i + n]);
        else if (open) fu = damping * fU[i] + c * di;

        if (fl < 0) fl = 0;
        if (fr < 0) fr = 0;
        if (fd < 0) fd = 0;
        if (fu < 0) fu = 0;

        const out = (fl + fr + fd + fu) * dt;
        if (out > 0) {
          const avail = di * l2;
          if (out > avail) {
            const k = avail / out;
            fl *= k;
            fr *= k;
            fd *= k;
            fu *= k;
          }
        }
        fL[i] = fl;
        fR[i] = fr;
        fD[i] = fd;
        fU[i] = fu;
      }
    }

    // 4. Depth + velocity update ---------------------------------------------
    const vx = this.velocityX;
    const vy = this.velocityY;
    let drained = 0;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const inLeft = x > 0 ? fR[i - 1] : 0; // from the -x neighbour
        const inRight = x < n - 1 ? fL[i + 1] : 0; // from the +x neighbour
        const inDown = y > 0 ? fU[i - n] : 0; // from the -y neighbour
        const inUp = y < n - 1 ? fD[i + n] : 0; // from the +y neighbour
        const outflow = fL[i] + fR[i] + fD[i] + fU[i];
        const before = d[i];
        let after = before + (dt * (inLeft + inRight + inDown + inUp - outflow)) / l2;
        if (after < 0) after = 0; // only ever rounding noise thanks to step 3
        d[i] = after;

        if (open) {
          if (x === 0) drained += fL[i];
          if (x === n - 1) drained += fR[i];
          if (y === 0) drained += fD[i];
          if (y === n - 1) drained += fU[i];
        }

        const mean = 0.5 * (before + after);
        if (mean > 1e-4) {
          const flowX = 0.5 * (inLeft - fL[i] + fR[i] - inRight);
          const flowY = 0.5 * (inDown - fD[i] + fU[i] - inUp);
          vx[i] = flowX / (l * mean);
          vy[i] = flowY / (l * mean);
        } else {
          vx[i] = 0;
          vy[i] = 0;
        }
      }
    }
    this.budget.drained += drained * dt;

    // 5. Evaporation -------------------------------------------------------------
    if (evaporation > 0) {
      const e = evaporation * dt;
      let removed = 0;
      for (let i = 0; i < d.length; i++) {
        const di = d[i];
        if (di > 0) {
          const r = di < e ? di : e;
          d[i] = di - r;
          removed += r;
        }
      }
      this.budget.evaporated += removed * l2;
    }

    this.time += dt;
    this.steps++;
  }

  /** Adds a spring's water spread over a disc; returns the volume added. */
  private applySpring(s: Spring, dt: number): number {
    const n = this.size;
    const r = Math.max(0, Math.floor(s.radius));
    const cells: number[] = [];
    for (let y = s.y - r; y <= s.y + r; y++) {
      for (let x = s.x - r; x <= s.x + r; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        if ((x - s.x) ** 2 + (y - s.y) ** 2 > r * r + 0.5) continue;
        cells.push(y * n + x);
      }
    }
    if (cells.length === 0) return 0;
    const volume = s.rate * dt;
    const perCell = volume / cells.length / (this.params.cellSize * this.params.cellSize);
    for (const i of cells) this.depth[i] += perCell;
    return volume;
  }

  /**
   * Volume that should be present according to the budget, given the volume
   * that was present when the budget started at zero.
   */
  expectedVolume(initialVolume: number): number {
    const b = this.budget;
    return initialVolume + b.rained + b.sprung - b.evaporated - b.drained;
  }
}
