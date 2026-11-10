/**
 * Shallow-water flow on a height field, using a staggered-grid "virtual pipe"
 * scheme: every pair of neighbouring cells is connected by a face that carries
 * a signed discharge. Discharge is accelerated by the difference in water
 * SURFACE height (bed + depth), which is what makes water run down the local
 * terrain gradient, pool in depressions, level out into lakes and spill over
 * the lowest point of a rim.
 *
 * The scheme is written in flux form, so whatever leaves one cell enters its
 * neighbour: water volume is conserved to floating point precision, and every
 * source and sink is book-kept explicitly (see `WaterStats`).
 *
 * This file has no rendering or DOM dependencies.
 */

export interface WaterOptions {
  /** Gravitational acceleration (world units / s^2). */
  gravity?: number;
  /** Linear drag (1/s). Damps lake sloshing. */
  linearFriction?: number;
  /** Quadratic bed friction coefficient (Manning-like); slows thin films. */
  bedFriction?: number;
  /** Uniform evaporation / infiltration loss in depth units per second. */
  evaporation?: number;
  /** Cells flagged non-zero swallow all water that reaches them (sea, border). */
  sinkMask?: Uint8Array;
}

export interface WaterStats {
  /** Total volume ever added by rain and springs. */
  added: number;
  /** Total volume removed by evaporation. */
  evaporated: number;
  /** Total volume that left through sink cells (reached the sea). */
  drained: number;
}

export class WaterSim {
  readonly size: number;
  readonly cellSize: number;
  /** Bed elevation per cell (not modified by the simulation). */
  readonly bed: Float32Array;
  /** Water depth per cell. */
  readonly depth: Float64Array;
  /** Discharge per unit width through the face between (x, y) and (x + 1, y). */
  readonly fluxX: Float64Array;
  /** Discharge per unit width through the face between (x, y) and (x, y + 1). */
  readonly fluxY: Float64Array;
  /** Cell-centred velocity, refreshed by `updateVelocities()`. */
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly stats: WaterStats = { added: 0, evaporated: 0, drained: 0 };

  gravity: number;
  linearFriction: number;
  bedFriction: number;
  evaporation: number;

  private readonly sink: Uint8Array;
  private readonly outflow: Float64Array;

  constructor(size: number, cellSize: number, bed: Float32Array, options: WaterOptions = {}) {
    if (bed.length !== size * size) throw new Error('bed must contain size * size values');
    this.size = size;
    this.cellSize = cellSize;
    this.bed = bed;
    const n = size * size;
    this.depth = new Float64Array(n);
    this.fluxX = new Float64Array(n);
    this.fluxY = new Float64Array(n);
    this.velX = new Float32Array(n);
    this.velY = new Float32Array(n);
    this.outflow = new Float64Array(n);
    this.sink = options.sinkMask ?? new Uint8Array(n);
    this.gravity = options.gravity ?? 9.81;
    this.linearFriction = options.linearFriction ?? 0.25;
    this.bedFriction = options.bedFriction ?? 0.04;
    this.evaporation = options.evaporation ?? 0;
  }

  /** Largest stable time step for the current water depths (CFL condition). */
  maxStableDt(): number {
    let maxDepth = 0;
    const d = this.depth;
    for (let i = 0; i < d.length; i++) if (d[i] > maxDepth) maxDepth = d[i];
    return (0.45 * this.cellSize) / Math.sqrt(this.gravity * Math.max(maxDepth, 0.5) * 2);
  }

  /** Adds a volume of water (world units^3) to one cell. */
  addVolume(x: number, y: number, volume: number): void {
    if (volume <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.depth[y * this.size + x] += volume / (this.cellSize * this.cellSize);
    this.stats.added += volume;
  }

  /** Adds `rate[i] * scale * dt` depth to every cell (rainfall). */
  addRain(rate: Float32Array, scale: number, dt: number): void {
    if (scale <= 0) return;
    const d = this.depth;
    const k = scale * dt;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      const add = rate[i] * k;
      d[i] += add;
      sum += add;
    }
    this.stats.added += sum * this.cellSize * this.cellSize;
  }

  /** Current water volume on the grid (world units^3). */
  totalVolume(): number {
    let sum = 0;
    const d = this.depth;
    for (let i = 0; i < d.length; i++) sum += d[i];
    return sum * this.cellSize * this.cellSize;
  }

  /** added - evaporated - drained - stored; stays ~0 if mass is conserved. */
  massBalanceError(): number {
    return this.stats.added - this.stats.evaporated - this.stats.drained - this.totalVolume();
  }

  /** Advances the flow by `dt` seconds. */
  step(dt: number): void {
    const n = this.size;
    const l = this.cellSize;
    const bed = this.bed;
    const d = this.depth;
    const fx = this.fluxX;
    const fy = this.fluxY;
    const out = this.outflow;
    const accel = (dt * this.gravity) / l;
    const kLin = this.linearFriction * dt;
    const kBed = this.bedFriction * this.gravity * dt;
    const maxSpeed = (0.4 * l) / dt;

    // 1. Accelerate the discharge through every face by the surface slope.
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const bi = bed[i];
        const di = d[i];
        const hi = bi + di;
        if (x < n - 1) fx[i] = faceFlux(fx[i], bi, di, hi, bed[i + 1], d[i + 1], accel, kLin, kBed, maxSpeed);
        else fx[i] = 0;
        if (y < n - 1) fy[i] = faceFlux(fy[i], bi, di, hi, bed[i + n], d[i + n], accel, kLin, kBed, maxSpeed);
        else fy[i] = 0;
      }
    }

    // 2. Sum what each cell wants to give away.
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        let o = 0;
        if (fx[i] > 0) o += fx[i];
        if (fy[i] > 0) o += fy[i];
        if (x > 0 && fx[i - 1] < 0) o -= fx[i - 1];
        if (y > 0 && fy[i - n] < 0) o -= fy[i - n];
        out[i] = o;
      }
    }

    // 3. Never remove more water than a cell holds: scale each face by its donor cell.
    const k = dt / l;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const f = fx[i];
        if (f > 0) {
          const o = out[i] * k;
          if (o > d[i]) fx[i] = (f * d[i]) / o;
        } else if (f < 0) {
          const o = out[i + 1] * k;
          if (o > d[i + 1]) fx[i] = (f * d[i + 1]) / o;
        }
        const g = fy[i];
        if (g > 0) {
          const o = out[i] * k;
          if (o > d[i]) fy[i] = (g * d[i]) / o;
        } else if (g < 0) {
          const o = out[i + n] * k;
          if (o > d[i + n]) fy[i] = (g * d[i + n]) / o;
        }
      }
    }

    // 4. Move the water. Face fluxes are antisymmetric, so this conserves volume.
    //    (out[] is reused as the per-cell depth change.)
    out.fill(0);
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const f = fx[i] * k;
        if (f !== 0) {
          out[i] -= f;
          out[i + 1] += f;
        }
        const g = fy[i] * k;
        if (g !== 0) {
          out[i] -= g;
          out[i + n] += g;
        }
      }
    }

    // 5. Apply the change, then evaporation and sinks, with exact book-keeping.
    const area = l * l;
    const evap = this.evaporation * dt;
    const sink = this.sink;
    let evaporated = 0;
    let drained = 0;
    let rounding = 0;
    for (let i = 0; i < d.length; i++) {
      let v = d[i] + out[i];
      if (v < 0) {
        // Only reachable through floating point rounding (|v| ~ 1e-17).
        rounding -= v;
        v = 0;
      }
      if (v > 0) {
        if (sink[i]) {
          drained += v;
          v = 0;
        } else if (evap > 0) {
          const e = v < evap ? v : evap;
          evaporated += e;
          v -= e;
        }
      }
      d[i] = v;
    }
    this.stats.evaporated += evaporated * area;
    this.stats.drained += drained * area;
    this.stats.added += rounding * area;
  }

  /** Recomputes cell-centred velocities from the face discharges. */
  updateVelocities(): void {
    const n = this.size;
    const d = this.depth;
    const fx = this.fluxX;
    const fy = this.fluxY;
    const vx = this.velX;
    const vy = this.velY;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const depth = d[i];
        if (depth < 1e-4) {
          vx[i] = 0;
          vy[i] = 0;
          continue;
        }
        const qx = 0.5 * (fx[i] + (x > 0 ? fx[i - 1] : 0));
        const qy = 0.5 * (fy[i] + (y > 0 ? fy[i - n] : 0));
        const inv = 1 / (depth + 0.01);
        vx[i] = qx * inv;
        vy[i] = qy * inv;
      }
    }
  }
}

/**
 * New discharge (per unit width) through the face from cell i to cell j.
 * Positive values flow from i to j.
 */
function faceFlux(
  f: number,
  bi: number,
  di: number,
  hi: number,
  bj: number,
  dj: number,
  accel: number,
  kLin: number,
  kBed: number,
  maxSpeed: number,
): number {
  if (di <= 0 && dj <= 0) return 0;
  const hj = bj + dj;
  // Depth of water that can actually pass over the higher of the two beds.
  const flowDepth = (hi > hj ? hi : hj) - (bi > bj ? bi : bj);
  if (flowDepth <= 1e-7) return 0;
  f += accel * flowDepth * (hi - hj);
  // Semi-implicit friction: linear drag plus quadratic bed friction (~ |q| q / h^2).
  const absF = f < 0 ? -f : f;
  f /= 1 + kLin + (kBed * absF) / (flowDepth * flowDepth + 1e-4);
  // A dry cell cannot donate water.
  if (f > 0 && di <= 0) return 0;
  if (f < 0 && dj <= 0) return 0;
  const limit = maxSpeed * flowDepth;
  if (f > limit) return limit;
  if (f < -limit) return -limit;
  return f;
}
