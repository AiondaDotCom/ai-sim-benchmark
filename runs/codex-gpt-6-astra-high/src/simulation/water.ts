import type { Terrain } from './terrain';

export interface WaterOptions { conductivity?: number; rain?: number; springs?: boolean }

/** Conservative finite-volume surface-water transport on a closed, uniform grid.
 * Each undirected edge exchanges volume based on hydraulic-head difference.
 * All donor flows are scaled together before applying, preventing negative depth.
 */
export class WaterSimulation {
  readonly depth: Float64Array;
  readonly velocityX: Float32Array;
  readonly velocityZ: Float32Array;
  readonly terrain: Terrain;
  private readonly outgoing: Float64Array;
  private readonly fluxX: Float64Array;
  private readonly fluxZ: Float64Array;
  private readonly delta: Float64Array;
  private readonly conductivity: number;
  rain: number;
  springs: boolean;
  time = 0;
  addedVolume = 0;

  constructor(terrain: Terrain, options: WaterOptions = {}) {
    this.terrain = terrain;
    this.depth = new Float64Array(terrain.heights.length);
    this.velocityX = new Float32Array(this.depth.length);
    this.velocityZ = new Float32Array(this.depth.length);
    this.outgoing = new Float64Array(this.depth.length);
    this.fluxX = new Float64Array(this.depth.length);
    this.fluxZ = new Float64Array(this.depth.length);
    this.delta = new Float64Array(this.depth.length);
    this.conductivity = options.conductivity ?? 4;
    this.rain = options.rain ?? 0;
    this.springs = options.springs ?? true;
  }

  get volume(): number {
    let sum = 0;
    for (const d of this.depth) sum += d;
    return sum * this.terrain.spacing ** 2;
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new Error('dt must be in (0, 0.1]');
    const {size: n, spacing, heights: bed, springs} = this.terrain;
    const d = this.depth, area = spacing * spacing;
    if (this.rain > 0) {
      const add = this.rain * dt;
      for (let k = 0; k < d.length; k++) d[k] += add;
      this.addedVolume += add * d.length * area;
    }
    if (this.springs) for (const spring of springs) {
      d[spring.index] += spring.rate * dt / area;
      this.addedVolume += spring.rate * dt;
    }
    this.outgoing.fill(0); this.delta.fill(0);
    const edge = (a: number, b: number): number => {
      const headA = bed[a] + d[a], headB = bed[b] + d[b];
      const donor = headA > headB ? a : b;
      // Reconstruct the face above the higher bed, so dry uphill cells do not pull water.
      const wet = Math.max(0, (donor === a ? headA : headB) - Math.max(bed[a], bed[b]));
      // Bound explicit diffusivity below the four-neighbor stability limit.
      // Donor limiting alone preserves mass but can create deep-lake checkerboarding.
      const coupling = Math.min(0.2, this.conductivity * Math.min(wet, 1.5) * dt / area);
      const flux = coupling * (headA - headB);
      this.outgoing[donor] += Math.abs(flux);
      return flux;
    };
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const k = z * n + x;
      this.fluxX[k] = x < n - 1 ? edge(k, k + 1) : 0;
      this.fluxZ[k] = z < n - 1 ? edge(k, k + n) : 0;
    }
    const transfer = (a: number, b: number, q: number): number => {
      const donor = q > 0 ? a : b;
      const scale = this.outgoing[donor] > 0 ? Math.min(1, d[donor] * 0.8 / this.outgoing[donor]) : 0;
      const amount = q * scale;
      this.delta[a] -= amount; this.delta[b] += amount;
      return amount;
    };
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (x < n - 1) this.velocityX[k] = transfer(k, k + 1, this.fluxX[k]) * spacing / dt;
      if (z < n - 1) this.velocityZ[k] = transfer(k, k + n, this.fluxZ[k]) * spacing / dt;
    }
    for (let k = 0; k < d.length; k++) d[k] += this.delta[k];
    this.time += dt;
  }
}
