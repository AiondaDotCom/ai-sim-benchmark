import type { TerrainData, TerrainPeak } from './terrain';

export interface WaterSource {
  index: number;
  rate: number;
  radius: number;
}

export interface WaterStepOptions {
  rainfallRate?: number;
  rainMask?: Float64Array;
  sources?: readonly WaterSource[];
}

export interface WaterStepStats {
  before: number;
  added: number;
  after: number;
}

const EAST = 0;
const WEST = 1;
const SOUTH = 2;
const NORTH = 3;

/**
 * Conservative, grid-based surface-flow model. Flux is driven by differences in
 * hydraulic head (terrain elevation + water depth), then capped by available water.
 */
export class WaterSimulation {
  readonly width: number;
  readonly height: number;
  readonly terrain: Float64Array;
  readonly water: Float64Array;
  readonly velocityX: Float64Array;
  readonly velocityZ: Float64Array;
  readonly flowMagnitude: Float64Array;

  private readonly surface: Float64Array;
  private readonly requestedFlow: Float64Array;
  private readonly delta: Float64Array;
  private readonly flowRate: number;
  private readonly minimumHead: number;

  constructor(terrain: TerrainData | { width: number; height: number; heights: Float64Array }, flowRate = 2.7) {
    this.width = terrain.width;
    this.height = terrain.height;
    this.terrain = terrain.heights;
    const cellCount = this.width * this.height;
    if (this.terrain.length !== cellCount) throw new Error('Terrain dimensions do not match its height data.');

    this.water = new Float64Array(cellCount);
    this.velocityX = new Float64Array(cellCount);
    this.velocityZ = new Float64Array(cellCount);
    this.flowMagnitude = new Float64Array(cellCount);
    this.surface = new Float64Array(cellCount);
    this.requestedFlow = new Float64Array(cellCount * 4);
    this.delta = new Float64Array(cellCount);
    this.flowRate = flowRate;
    this.minimumHead = 1e-7;
  }

  get totalWater(): number {
    let total = 0;
    for (const depth of this.water) total += depth;
    return total;
  }

  addWater(index: number, amount: number): void {
    if (index >= 0 && index < this.water.length && amount > 0) this.water[index] += amount;
  }

  step(dt: number, options: WaterStepOptions = {}): WaterStepStats {
    if (!(dt > 0)) return { before: this.totalWater, added: 0, after: this.totalWater };

    const before = this.totalWater;
    let added = 0;
    const rainfallRate = Math.max(0, options.rainfallRate ?? 0);
    if (rainfallRate > 0) {
      const rainMask = options.rainMask;
      for (let index = 0; index < this.water.length; index += 1) {
        const amount = rainfallRate * dt * (rainMask?.[index] ?? 1);
        this.water[index] += amount;
        added += amount;
      }
    }

    for (const source of options.sources ?? []) {
      added += this.applySource(source, dt);
    }

    this.requestedFlow.fill(0);
    this.delta.fill(0);
    this.velocityX.fill(0);
    this.velocityZ.fill(0);
    this.flowMagnitude.fill(0);

    for (let index = 0; index < this.water.length; index += 1) {
      this.surface[index] = this.terrain[index] + this.water[index];
    }

    for (let z = 0; z < this.height; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = z * this.width + x;
        if (this.water[index] <= 0) continue;
        const head = this.surface[index];
        let requestedTotal = 0;
        requestedTotal += this.requestFlow(index, EAST, x + 1 < this.width ? index + 1 : -1, head, dt);
        requestedTotal += this.requestFlow(index, WEST, x > 0 ? index - 1 : -1, head, dt);
        requestedTotal += this.requestFlow(index, SOUTH, z + 1 < this.height ? index + this.width : -1, head, dt);
        requestedTotal += this.requestFlow(index, NORTH, z > 0 ? index - this.width : -1, head, dt);

        if (requestedTotal > this.water[index]) {
          const scale = this.water[index] / requestedTotal;
          const offset = index * 4;
          for (let direction = 0; direction < 4; direction += 1) this.requestedFlow[offset + direction] *= scale;
        }
      }
    }

    for (let z = 0; z < this.height; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = z * this.width + x;
        const offset = index * 4;
        this.transfer(index, x + 1 < this.width ? index + 1 : -1, this.requestedFlow[offset + EAST], 1, 0);
        this.transfer(index, x > 0 ? index - 1 : -1, this.requestedFlow[offset + WEST], -1, 0);
        this.transfer(index, z + 1 < this.height ? index + this.width : -1, this.requestedFlow[offset + SOUTH], 0, 1);
        this.transfer(index, z > 0 ? index - this.width : -1, this.requestedFlow[offset + NORTH], 0, -1);
      }
    }

    for (let index = 0; index < this.water.length; index += 1) {
      this.water[index] = Math.max(0, this.water[index] + this.delta[index]);
      this.flowMagnitude[index] = Math.hypot(this.velocityX[index], this.velocityZ[index]);
    }

    return { before, added, after: this.totalWater };
  }

  private requestFlow(index: number, direction: number, neighbor: number, head: number, dt: number): number {
    if (neighbor < 0) return 0;
    const difference = head - this.surface[neighbor];
    if (difference <= this.minimumHead) return 0;
    const amount = difference * this.flowRate * dt * 0.25;
    this.requestedFlow[index * 4 + direction] = amount;
    return amount;
  }

  private transfer(index: number, neighbor: number, amount: number, dx: number, dz: number): void {
    if (neighbor < 0 || amount <= 0) return;
    this.delta[index] -= amount;
    this.delta[neighbor] += amount;
    this.velocityX[index] += dx * amount;
    this.velocityZ[index] += dz * amount;
    this.velocityX[neighbor] += dx * amount * 0.35;
    this.velocityZ[neighbor] += dz * amount * 0.35;
  }

  private applySource(source: WaterSource, dt: number): number {
    const centerX = source.index % this.width;
    const centerZ = Math.floor(source.index / this.width);
    const radius = Math.max(0, Math.floor(source.radius));
    const cells: Array<{ index: number; weight: number }> = [];
    let weightTotal = 0;

    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = centerX + dx;
        const z = centerZ + dz;
        if (x < 0 || x >= this.width || z < 0 || z >= this.height) continue;
        const distance = Math.hypot(dx, dz);
        if (distance > radius + 0.25) continue;
        const weight = radius === 0 ? 1 : Math.max(0.05, 1 - distance / (radius + 0.5));
        cells.push({ index: z * this.width + x, weight });
        weightTotal += weight;
      }
    }

    const totalAmount = Math.max(0, source.rate) * dt;
    for (const cell of cells) this.water[cell.index] += totalAmount * (cell.weight / weightTotal);
    return totalAmount;
  }
}

export function createSpringSources(peaks: readonly TerrainPeak[], width: number): WaterSource[] {
  return peaks.slice(0, 4).map((peak, index) => ({
    index: peak.z * width + peak.x,
    rate: 0.34 - index * 0.045,
    radius: 1 + (index % 2),
  }));
}

export function createRainMask(terrain: TerrainData): Float64Array {
  const mask = new Float64Array(terrain.heights.length);
  const range = Math.max(1e-6, terrain.maxHeight - terrain.minHeight);
  for (let index = 0; index < mask.length; index += 1) {
    const normalizedHeight = (terrain.heights[index] - terrain.minHeight) / range;
    mask[index] = 0.18 + normalizedHeight * normalizedHeight * 0.82;
  }
  return mask;
}
