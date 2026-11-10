import { createNoise2D, fbm, ridged, smoothstep } from './noise';
import { mulberry32 } from './rng';

/** Edge length of the simulated square of land + coastal sea, in world units. */
export const WORLD_SIZE = 256;
/** Height of the sea surface. Terrain below this level is permanently flooded. */
export const SEA_LEVEL = 0;
/** Depth of the sea floor at the border of the grid (world units below sea level). */
export const SEA_FLOOR_DEPTH = 4;

export interface Basin {
  /** Grid coordinates of the basin centre. */
  x: number;
  y: number;
  /** Radius in grid cells. */
  radius: number;
  /** Height of the flattened basin floor. */
  floor: number;
}

export interface Terrain {
  seed: number;
  /** Number of grid points per side. */
  size: number;
  /** Distance between neighbouring grid points in world units. */
  cellSize: number;
  /** Row-major bed heights, index = y * size + x. */
  heights: Float32Array;
  seaLevel: number;
  minHeight: number;
  maxHeight: number;
  /** Depressions that were carved to guarantee lakes (natural ones exist too). */
  basins: Basin[];
}

export interface TerrainOptions {
  seed: number;
  /** Grid points per side (default 256). */
  size?: number;
  /** Approximate height of the highest summits in world units (default 78). */
  peakHeight?: number;
  /** Number of guaranteed lake basins (default 3). */
  basinCount?: number;
}

/**
 * Generates a mountainous island as a height field. Fully deterministic:
 * the same options always produce the same Float32Array, bit for bit.
 *
 * Recipe: domain-warped fBm for the broad shape, ridged multifractal noise for
 * crests and valleys, a noisy radial mask so the land sinks into the sea
 * towards the border, and a few carved cirque basins that become lakes.
 */
export function generateTerrain(options: TerrainOptions): Terrain {
  const size = options.size ?? 256;
  const peakHeight = options.peakHeight ?? 78;
  const basinCount = options.basinCount ?? 3;
  const seed = options.seed >>> 0;
  const cellSize = WORLD_SIZE / (size - 1);

  const rng = mulberry32(seed ^ 0x9e3779b9);
  const warpA = createNoise2D(rng);
  const warpB = createNoise2D(rng);
  const baseNoise = createNoise2D(rng);
  const ridgeNoise = createNoise2D(rng);
  const detailNoise = createNoise2D(rng);
  const maskNoise = createNoise2D(rng);
  const ox = rng() * 64;
  const oy = rng() * 64;

  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);

      const wu = u + 0.07 * fbm(warpA, u * 2.4 + ox, v * 2.4 + oy, 3);
      const wv = v + 0.07 * fbm(warpB, u * 2.4 - oy, v * 2.4 + ox, 3);

      const base = 0.5 + 0.5 * fbm(baseNoise, wu * 2.3 + ox, wv * 2.3 + oy, 4);
      const ridge = ridged(ridgeNoise, wu * 3.1 + oy, wv * 3.1 - ox, 5);
      const detail = fbm(detailNoise, u * 13 + ox, v * 13 + oy, 3);

      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const rr = r + 0.11 * fbm(maskNoise, u * 3 + oy, v * 3 + ox, 3);
      // The second factor guarantees open sea all along the border of the grid.
      const mask = (1 - smoothstep(0.52, 0.93, rr)) * (1 - smoothstep(0.84, 0.97, r));
      const dome = 0.62 + 0.38 * (1 - smoothstep(0.0, 0.8, rr));

      let e = 0.38 * base + 0.62 * ridge * (0.35 + 0.65 * base);
      e = e * dome + 0.035 * detail;
      const land = 5 + peakHeight * 1.9 * Math.max(0, e) * Math.max(0, e) + peakHeight * 0.35 * e;
      heights[y * size + x] = mask * (land + SEA_FLOOR_DEPTH) - SEA_FLOOR_DEPTH;
    }
  }

  const basins = carveBasins(heights, size, cellSize, rng, basinCount);

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
  }

  return { seed, size, cellSize, heights, seaLevel: SEA_LEVEL, minHeight, maxHeight, basins };
}

/**
 * Carves bowl-shaped depressions into the gentlest mid-altitude areas.
 * The bowl floor is placed below the lowest point of the surrounding disc, so
 * each basin is a guaranteed closed depression that must fill before it spills.
 */
function carveBasins(heights: Float32Array, size: number, cellSize: number, rng: () => number, count: number): Basin[] {
  let maxH = -Infinity;
  for (let i = 0; i < heights.length; i++) if (heights[i] > maxH) maxH = heights[i];

  interface Candidate { x: number; y: number; radius: number; min: number; score: number }
  const candidates: Candidate[] = [];
  const margin = Math.ceil(size * 0.14);
  for (let n = 0; n < 400; n++) {
    const x = margin + Math.floor(rng() * (size - 2 * margin));
    const y = margin + Math.floor(rng() * (size - 2 * margin));
    const radius = Math.round((11 + rng() * 5) / cellSize);
    const centre = heights[y * size + x];
    if (centre < 0.14 * maxH || centre > 0.5 * maxH) continue;
    let min = Infinity;
    let max = -Infinity;
    for (let j = -radius; j <= radius; j++) {
      for (let i = -radius; i <= radius; i++) {
        if (i * i + j * j > radius * radius) continue;
        const h = heights[(y + j) * size + (x + i)];
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    if (min < 3) continue;
    candidates.push({ x, y, radius, min, score: max - min });
  }
  candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);

  const basins: Basin[] = [];
  const minSeparation = 52 / cellSize;
  for (const c of candidates) {
    if (basins.length >= count) break;
    if (basins.some((b) => Math.hypot(b.x - c.x, b.y - c.y) < minSeparation)) continue;
    const floor = c.min - 2.2;
    for (let j = -c.radius; j <= c.radius; j++) {
      for (let i = -c.radius; i <= c.radius; i++) {
        const d = Math.sqrt(i * i + j * j);
        if (d >= c.radius) continue;
        const w = smoothstep(c.radius, c.radius * 0.4, d);
        const idx = (c.y + j) * size + (c.x + i);
        // A gently curved floor keeps the lake bed from being perfectly flat.
        const bowl = floor + 0.8 * (d / c.radius) * (d / c.radius);
        heights[idx] = heights[idx] + (Math.min(bowl, heights[idx]) - heights[idx]) * w;
      }
    }
    basins.push({ x: c.x, y: c.y, radius: c.radius, floor });
  }
  return basins;
}

/** Bed height at integer grid coordinates, clamped to the grid. */
export function heightAt(terrain: Terrain, x: number, y: number): number {
  const s = terrain.size;
  const cx = Math.min(s - 1, Math.max(0, x));
  const cy = Math.min(s - 1, Math.max(0, y));
  return terrain.heights[cy * s + cx];
}

/** Central-difference bed gradient (dh/dx, dh/dy) in world units per world unit. */
export function gradientAt(terrain: Terrain, x: number, y: number): [number, number] {
  const inv = 1 / (2 * terrain.cellSize);
  return [
    (heightAt(terrain, x + 1, y) - heightAt(terrain, x - 1, y)) * inv,
    (heightAt(terrain, x, y + 1) - heightAt(terrain, x, y - 1)) * inv,
  ];
}

/** Converts grid coordinates to world X/Z (the island is centred on the origin). */
export function gridToWorld(terrain: Terrain, g: number): number {
  return (g - (terrain.size - 1) / 2) * terrain.cellSize;
}
