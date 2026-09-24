import { createSimplexNoise2D, fbm, ridged } from './noise';
import { mulberry32 } from './random';

export interface TerrainOptions {
  /** Number of grid points along each side (the grid is size x size). */
  size: number;
  /** Deterministic seed; the same seed always yields the same heightfield. */
  seed: number;
  /** Height of the highest point, in cell units (horizontal cell size is 1). */
  maxHeight: number;
  /** Number of carved basins that are guaranteed to hold lakes. */
  basins?: number;
}

export interface Terrain {
  readonly size: number;
  readonly seed: number;
  readonly maxHeight: number;
  /** Row-major heights, index = y * size + x, values in [0, maxHeight]. */
  readonly heights: Float32Array;
  /** Grid centres of the guaranteed basins (closed depressions). */
  readonly basins: ReadonlyArray<GridPoint>;
}

export interface GridPoint {
  x: number;
  y: number;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generates a procedural mountain landscape.
 *
 * Shape recipe (all driven by the seed):
 *  1. Domain-warped ridged multifractal noise for sharp mountain ridges.
 *  2. Low-frequency fBm for rolling foothills and valleys.
 *  3. A soft radial mask that concentrates the massif in the centre and lowers
 *     the map border, so rivers have somewhere to leave the map.
 *  4. A few flat-bottomed basins blended in, each deeper than its surroundings,
 *     which guarantees closed depressions that fill up into lakes.
 *  5. Normalisation to [0, maxHeight].
 */
export function generateTerrain(options: TerrainOptions): Terrain {
  const { size, seed, maxHeight } = options;
  const basinCount = options.basins ?? 3;
  if (!Number.isInteger(size) || size < 8) {
    throw new Error(`Terrain size must be an integer >= 8, got ${size}`);
  }

  const rng = mulberry32(seed);
  const ridgeNoise = createSimplexNoise2D(rng);
  const hillNoise = createSimplexNoise2D(rng);
  const warpNoise = createSimplexNoise2D(rng);
  // Random offsets move the sampling window so different seeds differ in layout,
  // not only in fine detail.
  const ox = rng() * 100;
  const oy = rng() * 100;
  // Slightly off-centre massif.
  const cx = 0.5 + (rng() - 0.5) * 0.16;
  const cy = 0.5 + (rng() - 0.5) * 0.16;

  const heights = new Float32Array(size * size);
  const inv = 1 / (size - 1);

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const wx = fbm(warpNoise, u * 2.2 + ox, v * 2.2 + oy, 3) * 0.18;
      const wy = fbm(warpNoise, u * 2.2 + oy + 17.3, v * 2.2 + ox - 4.1, 3) * 0.18;

      const ridge = ridged(ridgeNoise, (u + wx) * 2.6 + ox, (v + wy) * 2.6 + oy, 6);
      const hills = fbm(hillNoise, u * 2.4 - oy, v * 2.4 + ox, 5) * 0.5 + 0.5;
      const mass = fbm(hillNoise, (u + wx) * 1.3 + 31.7, (v + wy) * 1.3 - 12.9, 3) * 0.5 + 0.5;

      const dx = u - cx;
      const dy = v - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / 0.5;
      const massif = 1 - smoothstep(0.1, 1.05, r);

      // Broad mountain bodies (mass * massif) carry sharp ridges on top.
      const body = massif * (0.45 + 0.55 * mass);
      let h = body * (0.45 + 0.55 * ridge) + 0.12 * hills;
      h = Math.pow(Math.max(h, 0), 1.25);

      // Lower the outer border so water can drain off the map.
      const edge = Math.min(u, v, 1 - u, 1 - v);
      // The last few cells ramp down to zero so the border meets the plain
      // around the map without a visible step.
      h *= (0.35 + 0.65 * smoothstep(0, 0.14, edge)) * smoothstep(0, 0.025, edge);

      heights[y * size + x] = h;
    }
  }

  // Carve basins. Each is blended towards a floor that lies below the lowest
  // point of its neighbourhood, so its centre is always a closed depression.
  const basins: GridPoint[] = [];
  const radius = Math.max(3, size * 0.055);
  for (let b = 0; b < basinCount; b++) {
    const angle = rng() * Math.PI * 2;
    const dist = 0.18 + rng() * 0.2;
    const bx = Math.round((cx + Math.cos(angle) * dist) * (size - 1));
    const by = Math.round((cy + Math.sin(angle) * dist) * (size - 1));
    if (bx < radius * 2 || by < radius * 2 || bx >= size - radius * 2 || by >= size - radius * 2) continue;
    basins.push({ x: bx, y: by });

    const reach = Math.ceil(radius * 2.5);
    let localMin = Infinity;
    for (let y = by - reach; y <= by + reach; y++) {
      for (let x = bx - reach; x <= bx + reach; x++) {
        localMin = Math.min(localMin, heights[y * size + x]);
      }
    }
    // Never below 0 so the (zero-height) map border stays the global minimum.
    const floor = Math.max(localMin - 0.035, localMin * 0.5);
    const sigma2 = 2 * radius * radius;
    for (let y = by - reach; y <= by + reach; y++) {
      for (let x = bx - reach; x <= bx + reach; x++) {
        const d2 = (x - bx) * (x - bx) + (y - by) * (y - by);
        const w = Math.exp(-d2 / sigma2);
        const i = y * size + x;
        heights[i] = heights[i] * (1 - w) + floor * w;
      }
    }
  }

  // Normalise to [0, maxHeight].
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const scale = max > min ? maxHeight / (max - min) : 0;
  for (let i = 0; i < heights.length; i++) {
    heights[i] = (heights[i] - min) * scale;
  }

  return { size, seed, maxHeight, heights, basins };
}

/**
 * Finds spring locations near the highest peaks: local maxima separated by at
 * least `minSeparation` cells, each moved a few cells downhill (steepest
 * descent) so the spring sits on the flank just below the summit. Only peaks
 * higher than `minPeakFraction * maxHeight` qualify, so there may be fewer
 * springs than requested on flat maps.
 */
export function findSprings(
  terrain: Terrain,
  count: number,
  minSeparation = terrain.size * 0.14,
  stepsDown = 3,
  minPeakFraction = 0.4,
): GridPoint[] {
  const { size, heights } = terrain;
  const window = Math.max(2, Math.round(size / 40));
  const margin = Math.max(window, Math.round(size * 0.08));
  const peaks: Array<GridPoint & { h: number }> = [];

  for (let y = margin; y < size - margin; y++) {
    for (let x = margin; x < size - margin; x++) {
      const h = heights[y * size + x];
      let isMax = true;
      for (let dy = -window; dy <= window && isMax; dy++) {
        for (let dx = -window; dx <= window; dx++) {
          if ((dx !== 0 || dy !== 0) && heights[(y + dy) * size + (x + dx)] >= h) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax && h >= terrain.maxHeight * minPeakFraction) peaks.push({ x, y, h });
    }
  }

  // Deterministic order: highest first, ties broken by index.
  peaks.sort((a, b) => b.h - a.h || a.y * size + a.x - (b.y * size + b.x));

  const chosen: GridPoint[] = [];
  const minSep2 = minSeparation * minSeparation;
  for (const p of peaks) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => (c.x - p.x) ** 2 + (c.y - p.y) ** 2 >= minSep2)) {
      chosen.push({ x: p.x, y: p.y });
    }
  }

  return chosen.map((p) => {
    let { x, y } = p;
    for (let s = 0; s < stepsDown; s++) {
      const next = steepestDescentNeighbour(terrain, x, y);
      if (!next) break;
      x = next.x;
      y = next.y;
    }
    return { x, y };
  });
}

/** The lowest of the 8 neighbours if it is lower than the cell itself. */
export function steepestDescentNeighbour(terrain: Terrain, x: number, y: number): GridPoint | null {
  const { size, heights } = terrain;
  const h0 = heights[y * size + x];
  let best: GridPoint | null = null;
  let bestSlope = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const slope = (h0 - heights[ny * size + nx]) / Math.hypot(dx, dy);
      if (slope > bestSlope) {
        bestSlope = slope;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

/** Central-difference terrain gradient (dh/dx, dh/dy) at a grid point. */
export function terrainGradient(terrain: Terrain, x: number, y: number): [number, number] {
  const { size, heights } = terrain;
  const xl = Math.max(0, x - 1);
  const xr = Math.min(size - 1, x + 1);
  const yd = Math.max(0, y - 1);
  const yu = Math.min(size - 1, y + 1);
  const gx = (heights[y * size + xr] - heights[y * size + xl]) / (xr - xl);
  const gy = (heights[yu * size + x] - heights[yd * size + x]) / (yu - yd);
  return [gx, gy];
}
