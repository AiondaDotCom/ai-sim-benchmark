/**
 * Procedural mountain terrain generation.
 *
 * The heightfield is a plain `Float32Array` of `size * size` samples laid out
 * row-major (`index = row * size + col`). It is produced purely from the seed:
 * same seed in, byte-identical heightfield out. Nothing here touches Three.js,
 * the DOM or `Math.random()`, which is what makes it unit-testable.
 *
 * Pipeline:
 *   1. domain warp        - bends the noise field so ridges are not axis-aligned
 *   2. ridged multifractal- sharp crest lines / mountain spines
 *   3. fBm base           - broad landmass shape underneath the ridges
 *   4. radial massif mask - a central massif that falls off to outer plains
 *   5. carved basins      - guaranteed depressions so lakes have somewhere to go
 *   6. thermal erosion    - knocks material off over-steep slopes into valleys
 *   7. smoothing          - removes single-cell noise that would trap water
 */

import { Noise2D, clamp, lerp, smoothstep } from './noise';
import { createRng, randRange } from './rng';

export interface TerrainOptions {
  /** Seed — any string or number. Identical seeds give identical terrain. */
  seed: string | number;
  /** Number of grid cells per side. */
  size?: number;
  /** World units per grid cell. */
  cellSize?: number;
  /** Peak elevation of the massif in world units. */
  amplitude?: number;
  /** Noise frequency for the base landmass (lower = larger features). */
  baseFrequency?: number;
  /** Number of fBm / ridged octaves. */
  octaves?: number;
  /** 0 = smooth hills, 1 = fully ridged alpine crests. */
  ridgeWeight?: number;
  /** How strongly the domain is warped before sampling. */
  warpStrength?: number;
  /** Number of explicitly carved lake basins. */
  basinCount?: number;
  /** Thermal-erosion iterations. */
  erosionIterations?: number;
  /** Maximum stable slope (height units per cell) before erosion kicks in. */
  talusAngle?: number;
  /** Hydraulic-erosion droplets per cell. 0 disables the pass. */
  dropletDensity?: number;
}

export interface ResolvedTerrainOptions extends Required<TerrainOptions> {}

export const DEFAULT_TERRAIN_OPTIONS: Omit<ResolvedTerrainOptions, 'seed'> = {
  size: 192,
  cellSize: 1,
  amplitude: 58,
  baseFrequency: 4.1,
  octaves: 7,
  ridgeWeight: 0.78,
  warpStrength: 0.42,
  basinCount: 6,
  erosionIterations: 18,
  talusAngle: 0.62,
  dropletDensity: 0.55,
};

export class Terrain {
  readonly size: number;
  readonly cellSize: number;
  readonly worldSize: number;
  readonly heights: Float32Array;
  readonly options: ResolvedTerrainOptions;
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor(heights: Float32Array, options: ResolvedTerrainOptions) {
    this.heights = heights;
    this.options = options;
    this.size = options.size;
    this.cellSize = options.cellSize;
    this.worldSize = options.size * options.cellSize;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i];
      if (h < min) min = h;
      if (h > max) max = h;
    }
    this.minHeight = min;
    this.maxHeight = max;
  }

  /** Height at integer grid coordinates, clamped at the borders. */
  at(col: number, row: number): number {
    const c = clamp(col | 0, 0, this.size - 1);
    const r = clamp(row | 0, 0, this.size - 1);
    return this.heights[r * this.size + c];
  }

  /** Convert a world X/Z coordinate to fractional grid coordinates. */
  worldToGrid(wx: number, wz: number): { col: number; row: number } {
    const half = this.worldSize / 2;
    return {
      col: (wx + half) / this.cellSize - 0.5,
      row: (wz + half) / this.cellSize - 0.5,
    };
  }

  /** Bilinearly interpolated height for a world-space X/Z position. */
  heightAt(wx: number, wz: number): number {
    const { col, row } = this.worldToGrid(wx, wz);
    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const tc = col - c0;
    const tr = row - r0;
    const h00 = this.at(c0, r0);
    const h10 = this.at(c0 + 1, r0);
    const h01 = this.at(c0, r0 + 1);
    const h11 = this.at(c0 + 1, r0 + 1);
    return lerp(lerp(h00, h10, tc), lerp(h01, h11, tc), tr);
  }

  /**
   * Central-difference gradient in *grid* space (height change per cell).
   * Water flows along the negative gradient.
   */
  gradientAt(col: number, row: number): { dx: number; dy: number } {
    return {
      dx: (this.at(col + 1, row) - this.at(col - 1, row)) * 0.5,
      dy: (this.at(col, row + 1) - this.at(col, row - 1)) * 0.5,
    };
  }

  /** Indices of the `count` highest cells, kept at least `minSpacing` apart. */
  findPeaks(count: number, minSpacing = 12): number[] {
    const n = this.size;
    const candidates: number[] = [];
    // Only consider genuine local maxima away from the domain border.
    for (let r = 2; r < n - 2; r++) {
      for (let c = 2; c < n - 2; c++) {
        const i = r * n + c;
        const h = this.heights[i];
        if (
          h >= this.heights[i - 1] &&
          h >= this.heights[i + 1] &&
          h >= this.heights[i - n] &&
          h >= this.heights[i + n] &&
          h >= this.heights[i - n - 1] &&
          h >= this.heights[i - n + 1] &&
          h >= this.heights[i + n - 1] &&
          h >= this.heights[i + n + 1]
        ) {
          candidates.push(i);
        }
      }
    }
    candidates.sort((a, b) => this.heights[b] - this.heights[a]);

    const picked: number[] = [];
    const spacingSq = minSpacing * minSpacing;
    for (const i of candidates) {
      if (picked.length >= count) break;
      const c = i % n;
      const r = (i / n) | 0;
      let ok = true;
      for (const j of picked) {
        const dc = (j % n) - c;
        const dr = ((j / n) | 0) - r;
        if (dc * dc + dr * dr < spacingSq) {
          ok = false;
          break;
        }
      }
      if (ok) picked.push(i);
    }
    return picked;
  }
}

/** Generate a deterministic mountain heightfield. */
export function generateTerrain(options: TerrainOptions): Terrain {
  const opts: ResolvedTerrainOptions = {
    ...DEFAULT_TERRAIN_OPTIONS,
    ...options,
  };
  const n = opts.size;
  const heights = new Float32Array(n * n);

  // Three decorrelated noise fields, all derived from the one seed.
  const shape = new Noise2D(`${opts.seed}::shape`);
  const ridge = new Noise2D(`${opts.seed}::ridge`);
  const warp = new Noise2D(`${opts.seed}::warp`);
  const rng = createRng(`${opts.seed}::features`);

  // A slight random rotation keeps ridge lines off the grid axes.
  const rot = randRange(rng, 0, Math.PI * 2);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const offsetX = randRange(rng, -1000, 1000);
  const offsetY = randRange(rng, -1000, 1000);

  const f = opts.baseFrequency;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // Normalised coordinates in [-0.5, 0.5].
      const nx0 = c / n - 0.5;
      const ny0 = r / n - 0.5;
      const nx = nx0 * cosR - ny0 * sinR;
      const ny = nx0 * sinR + ny0 * cosR;

      const sx = nx * f + offsetX;
      const sy = ny * f + offsetY;

      // 1. Domain warp.
      const wx = sx + opts.warpStrength * warp.fbm(sx * 1.9 + 11.3, sy * 1.9 - 7.1, 3);
      const wy = sy + opts.warpStrength * warp.fbm(sx * 1.9 - 5.7, sy * 1.9 + 3.9, 3);

      // 2/3. Ridged crests blended over a broad fBm landmass.
      const base = shape.fbm(wx, wy, opts.octaves) * 0.5 + 0.5; // -> [0, 1]
      const crest = ridge.ridged(wx * 1.15 + 21.7, wy * 1.15 - 13.4, opts.octaves);
      // Ridges dominate higher up, the base shape dominates in the lowlands.
      const w = opts.ridgeWeight * smoothstep(0.18, 0.72, base);
      let h = lerp(base, crest, w);

      // Gentle gamma pushes valleys down and keeps summits pointy.
      h = Math.pow(clamp(h, 0, 1), 1.35);

      // 4. Radial massif mask: high in the middle, plains near the border so
      //    water has somewhere to drain to instead of flooding the whole map.
      const dist = Math.sqrt(nx0 * nx0 + ny0 * ny0) / 0.5; // 0 at centre, 1 at edge mid-side
      const massif = Math.pow(1 - smoothstep(0.12, 1.22, dist), 0.9);
      const plain = 0.09 + 0.05 * (shape.fbm(wx * 0.8, wy * 0.8, 3) * 0.5 + 0.5);

      let height = (plain + h * massif * 1.25) * opts.amplitude;

      // Fine detail, scaled down in the lowlands so lakes get flat beds.
      height += shape.fbm(wx * 7.5, wy * 7.5, 3) * opts.amplitude * 0.02 * (0.3 + massif);

      heights[r * n + c] = height;
    }
  }

  thermalErosion(heights, n, opts.erosionIterations, opts.talusAngle);
  hydraulicErosion(heights, n, opts.dropletDensity, rng);
  carveBasins(heights, opts, rng);
  smooth(heights, n, 1);
  // A shallow rim keeps water from instantly running off a knife-edge border.
  flattenBorder(heights, n, 10);

  return new Terrain(heights, opts);
}

/**
 * Subtract smooth bowls at mid elevations. Perlin terrain has natural
 * depressions, but carving a few explicit ones guarantees that the demo shows
 * proper lakes within the first few seconds regardless of seed.
 */
function carveBasins(
  heights: Float32Array,
  opts: ResolvedTerrainOptions,
  rng: () => number,
): void {
  const n = opts.size;
  for (let b = 0; b < opts.basinCount; b++) {
    // Keep basins in the mid-radius band: not on the summit, not off the map.
    const angle = randRange(rng, 0, Math.PI * 2);
    const radius = randRange(rng, 0.14, 0.36) * n;
    const cx = n / 2 + Math.cos(angle) * radius;
    const cy = n / 2 + Math.sin(angle) * radius;
    const rad = randRange(rng, 0.055, 0.11) * n;
    const depth = randRange(rng, 0.06, 0.13) * opts.amplitude;

    const c0 = Math.max(0, Math.floor(cx - rad * 2));
    const c1 = Math.min(n - 1, Math.ceil(cx + rad * 2));
    const r0 = Math.max(0, Math.floor(cy - rad * 2));
    const r1 = Math.min(n - 1, Math.ceil(cy + rad * 2));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dx = (c - cx) / rad;
        const dy = (r - cy) / rad;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1.6) continue;
        // Bowl profile: dig in the middle, raise a subtle lip on the outside.
        const dig = Math.exp(-d * d * 1.6) * depth;
        const lip = smoothstep(0.85, 1.35, d) * (1 - smoothstep(1.35, 1.6, d)) * depth * 0.18;
        heights[r * n + c] += lip - dig;
      }
    }
  }
}

/**
 * Droplet-based hydraulic erosion.
 *
 * Thousands of virtual raindrops are released on the heightfield. Each one
 * follows the local downhill gradient, picking up sediment while it accelerates
 * and dropping it again where the slope flattens out. The result is a dendritic
 * network of carved valleys — which is exactly what the water simulation then
 * needs in order to concentrate runoff into visible streams instead of
 * spreading it as an invisible film over the whole slope.
 *
 * Erosion works on a normalised copy of the field (0..1) so the tuning
 * constants are independent of the terrain amplitude.
 */
function hydraulicErosion(
  heights: Float32Array,
  n: number,
  density: number,
  rng: () => number,
): void {
  const droplets = Math.floor(n * n * density);
  if (droplets <= 0) return;

  // --- normalise -------------------------------------------------------
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < min) min = heights[i];
    if (heights[i] > max) max = heights[i];
  }
  const span = Math.max(1e-6, max - min);
  const h = new Float32Array(heights.length);
  for (let i = 0; i < heights.length; i++) h[i] = (heights[i] - min) / span;

  // --- deposition brush -------------------------------------------------
  const radius = 2;
  const brushOffsets: number[] = [];
  const brushWeights: number[] = [];
  let weightSum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      const w = 1 - d / radius;
      brushOffsets.push(dy * n + dx);
      brushWeights.push(w);
      weightSum += w;
    }
  }
  for (let i = 0; i < brushWeights.length; i++) brushWeights[i] /= weightSum;

  const INERTIA = 0.055;
  const CAPACITY = 3.4;
  const MIN_SLOPE = 0.0012;
  const ERODE = 0.32;
  const DEPOSIT = 0.28;
  const EVAPORATE = 0.018;
  const GRAVITY = 5;
  const LIFETIME = 34;
  const MARGIN = radius + 2;

  for (let d = 0; d < droplets; d++) {
    let px = MARGIN + rng() * (n - 1 - 2 * MARGIN);
    let py = MARGIN + rng() * (n - 1 - 2 * MARGIN);
    let dirX = 0;
    let dirY = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;

    for (let life = 0; life < LIFETIME; life++) {
      const cx = px | 0;
      const cy = py | 0;
      const fx = px - cx;
      const fy = py - cy;
      const i = cy * n + cx;

      const h00 = h[i];
      const h10 = h[i + 1];
      const h01 = h[i + n];
      const h11 = h[i + n + 1];

      // Bilinear gradient and height at the droplet position.
      const gradX = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gradY = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const height =
        h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;

      dirX = dirX * INERTIA - gradX * (1 - INERTIA);
      dirY = dirY * INERTIA - gradY * (1 - INERTIA);
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len < 1e-8) break;
      dirX /= len;
      dirY /= len;

      px += dirX;
      py += dirY;
      if (px < MARGIN || px >= n - 1 - MARGIN || py < MARGIN || py >= n - 1 - MARGIN) break;

      const ncx = px | 0;
      const ncy = py | 0;
      const nfx = px - ncx;
      const nfy = py - ncy;
      const j = ncy * n + ncx;
      const newHeight =
        h[j] * (1 - nfx) * (1 - nfy) +
        h[j + 1] * nfx * (1 - nfy) +
        h[j + n] * (1 - nfx) * nfy +
        h[j + n + 1] * nfx * nfy;
      const deltaH = newHeight - height;

      const capacity = Math.max(-deltaH, MIN_SLOPE) * speed * water * CAPACITY;

      if (sediment > capacity || deltaH > 0) {
        // Flowing uphill or over-loaded: drop sediment, filling small pits.
        const amount =
          deltaH > 0 ? Math.min(deltaH, sediment) : (sediment - capacity) * DEPOSIT;
        sediment -= amount;
        h[i] += amount * (1 - fx) * (1 - fy);
        h[i + 1] += amount * fx * (1 - fy);
        h[i + n] += amount * (1 - fx) * fy;
        h[i + n + 1] += amount * fx * fy;
      } else {
        // Cut into the bed, but never deeper than the drop we just fell.
        const amount = Math.min((capacity - sediment) * ERODE, -deltaH);
        for (let b = 0; b < brushOffsets.length; b++) {
          const k = i + brushOffsets[b];
          if (k < 0 || k >= h.length) continue;
          const take = Math.min(h[k], amount * brushWeights[b]);
          h[k] -= take;
          sediment += take;
        }
      }

      speed = Math.sqrt(Math.max(0, speed * speed + -deltaH * GRAVITY));
      water *= 1 - EVAPORATE;
      if (water < 0.01) break;
    }
  }

  for (let i = 0; i < heights.length; i++) heights[i] = min + h[i] * span;
}

/**
 * Thermal ("talus") erosion: any slope steeper than `talus` sheds material to
 * its lower neighbours. Cheap, unconditionally stable, and it produces the
 * scree slopes and V-shaped valleys that guide streams.
 */
function thermalErosion(
  heights: Float32Array,
  n: number,
  iterations: number,
  talus: number,
): void {
  if (iterations <= 0) return;
  const delta = new Float32Array(heights.length);
  const neighbourOffsets = [-1, 1, -n, n];

  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let r = 1; r < n - 1; r++) {
      for (let c = 1; c < n - 1; c++) {
        const i = r * n + c;
        const h = heights[i];
        let totalDrop = 0;
        let maxDrop = 0;
        for (const off of neighbourOffsets) {
          const drop = h - heights[i + off];
          if (drop > talus) {
            totalDrop += drop - talus;
            if (drop > maxDrop) maxDrop = drop;
          }
        }
        if (totalDrop <= 0) continue;
        // Move half of the excess, distributed proportionally.
        const move = Math.min(maxDrop - talus, totalDrop) * 0.5;
        for (const off of neighbourOffsets) {
          const drop = h - heights[i + off];
          if (drop > talus) {
            const share = ((drop - talus) / totalDrop) * move;
            delta[i] -= share;
            delta[i + off] += share;
          }
        }
      }
    }
    for (let i = 0; i < heights.length; i++) heights[i] += delta[i];
  }
}

/** Small 3x3 box blur; removes one-cell pits that would trap water forever. */
function smooth(heights: Float32Array, n: number, passes: number): void {
  const tmp = new Float32Array(heights.length);
  for (let p = 0; p < passes; p++) {
    tmp.set(heights);
    for (let r = 1; r < n - 1; r++) {
      for (let c = 1; c < n - 1; c++) {
        const i = r * n + c;
        heights[i] =
          (tmp[i] * 4 +
            tmp[i - 1] +
            tmp[i + 1] +
            tmp[i - n] +
            tmp[i + n] +
            (tmp[i - n - 1] + tmp[i - n + 1] + tmp[i + n - 1] + tmp[i + n + 1]) * 0.5) /
          10;
      }
    }
  }
}

/** Blend the outermost `width` cells toward the field minimum. */
function flattenBorder(heights: Float32Array, n: number, width: number): void {
  let min = Infinity;
  for (let i = 0; i < heights.length; i++) if (heights[i] < min) min = heights[i];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const d = Math.min(r, c, n - 1 - r, n - 1 - c);
      if (d >= width) continue;
      const t = smoothstep(0, width, d);
      const i = r * n + c;
      heights[i] = lerp(min, heights[i], t);
    }
  }
}
