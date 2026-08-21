import { ValueNoise2D } from './noise';
import { createRng } from './prng';

export interface TerrainOptions {
  /** Deterministic seed - same seed always produces the exact same terrain. */
  seed: string | number;
  /** Number of vertices along each edge of the (square) height-field grid. */
  resolution: number;
  /** Physical size of the terrain in world units (both X and Z). */
  worldSize: number;
  /** Maximum elevation of the tallest peak, in world units. */
  maxHeight: number;
}

export interface TerrainData {
  readonly resolution: number;
  readonly worldSize: number;
  readonly maxHeight: number;
  /** Row-major heights, length = resolution * resolution. */
  readonly heights: Float32Array;
  /** Grid indices (row-major) of the most prominent peaks, tallest first. */
  readonly peakIndices: number[];
}

const DEFAULT_OPTIONS: TerrainOptions = {
  seed: 'water-sim',
  resolution: 128,
  worldSize: 200,
  maxHeight: 34,
};

/**
 * Generates a deterministic procedural mountain landscape.
 *
 * Approach: fractal value noise (fBm) gives natural high-frequency detail,
 * a radial falloff pulls elevation down towards the edges of the map so
 * water has somewhere to drain "off" the landmass, and a handful of
 * seed-derived Gaussian peak bumps guarantee a few unmistakable mountain
 * summits (good sources for springs) rather than a uniformly bumpy field.
 * A final "ridged" pass sharpens ridgelines so slopes read clearly enough
 * for water to visibly commit to flow paths.
 */
export function generateTerrain(options: Partial<TerrainOptions> = {}): TerrainData {
  const opts: TerrainOptions = { ...DEFAULT_OPTIONS, ...options };
  const { seed, resolution, worldSize, maxHeight } = opts;

  const noise = new ValueNoise2D(seed, 256);
  const heights = new Float32Array(resolution * resolution);

  // Derive a handful of deterministic "mountain seed" peaks from the seed.
  // Salted differently from the noise field so it stays decorrelated from it.
  const rng = createRng(`${seed}::peaks`);
  const peakCount = 4;
  const peaks: { x: number; y: number; strength: number; radius: number }[] = [];
  for (let i = 0; i < peakCount; i++) {
    peaks.push({
      x: 0.2 + rng() * 0.6,
      y: 0.2 + rng() * 0.6,
      strength: 0.55 + rng() * 0.45,
      radius: 0.18 + rng() * 0.14,
    });
  }

  const noiseScale = 3.1;
  for (let gy = 0; gy < resolution; gy++) {
    for (let gx = 0; gx < resolution; gx++) {
      const u = gx / (resolution - 1); // 0..1
      const v = gy / (resolution - 1); // 0..1

      // Base fractal detail.
      let h = noise.fbm(u * noiseScale, v * noiseScale, 6, 2.05, 0.5);
      // Ridged variant sharpens ridgelines for clearer downhill paths.
      const ridged = 1 - Math.abs(noise.fbm(u * noiseScale * 0.6 + 11.3, v * noiseScale * 0.6 - 7.1, 4, 2.0, 0.5));
      h = h * 0.6 + (ridged * 2 - 1) * 0.4;

      // Gaussian mountain bumps to guarantee a few strong, unmistakable summits.
      // NOTE: combined with max(), not sum() - summing overlapping Gaussians let
      // amplitude stack past the intended ceiling, which (after clamping) produced a
      // wide flat-topped plateau instead of a pointy peak. A flat plateau has zero
      // local gradient, so water raining/springing onto it had nowhere to flow and
      // just pooled forever - the "convex water dome on the summit" bug. max() bounds
      // the bump contribution to a single peak's own strength everywhere.
      let bump = 0;
      for (const p of peaks) {
        const dx = u - p.x;
        const dy = v - p.y;
        const d2 = dx * dx + dy * dy;
        bump = Math.max(bump, p.strength * Math.exp(-d2 / (2 * p.radius * p.radius)));
      }

      // Radial falloff so the map edges slope down towards a "sea level" rim,
      // giving water an obvious basin/outlet instead of an infinite plateau.
      const cx = u - 0.5;
      const cy = v - 0.5;
      const edgeDist = Math.sqrt(cx * cx + cy * cy) / 0.72; // ~1 at the border
      const falloff = 1 - smoothstep(0.55, 1.05, edgeDist);

      let elevation = (h * 0.35 + bump * 0.85) * falloff;
      // Softly (not hard-) clamp: a hard Math.min/Math.max clamp maps every cell above/
      // below the ceiling/floor to the *exact same* value, producing a perfectly flat
      // plateau/shelf with zero local gradient - water raining onto it then has nowhere
      // to flow and pools forever. softClamp is strictly monotonic everywhere instead,
      // so every cell keeps an (increasingly gentle, but non-zero) slope.
      elevation = softClamp(elevation, 1, 0.16);
      elevation = -softClamp(-elevation, 0.08, 0.06);
      heights[gy * resolution + gx] = elevation * maxHeight;
    }
  }

  const peakIndices = findPeakIndices(heights, resolution, 6);

  return { resolution, worldSize, maxHeight, heights, peakIndices };
}

/**
 * Strictly monotonic soft ceiling: passes values through unchanged below
 * `ceiling - knee`, then smoothly compresses anything above that point so it
 * asymptotically approaches (but never reaches, and never flattens to) the
 * ceiling. Unlike Math.min(x, ceiling), this never produces two different
 * inputs mapping to the identical output, so it never creates a flat,
 * zero-gradient plateau in the terrain.
 */
function softClamp(x: number, ceiling: number, knee: number): number {
  const kneeStart = ceiling - knee;
  if (x <= kneeStart) return x;
  const t = (x - kneeStart) / knee;
  return kneeStart + knee * (1 - Math.exp(-t));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Finds up to `count` local-maximum grid cells with the highest elevation (candidate spring sites). */
function findPeakIndices(heights: Float32Array, resolution: number, count: number): number[] {
  const candidates: { index: number; height: number }[] = [];
  for (let gy = 1; gy < resolution - 1; gy++) {
    for (let gx = 1; gx < resolution - 1; gx++) {
      const idx = gy * resolution + gx;
      const h = heights[idx];
      const isLocalMax =
        h >= heights[idx - 1] &&
        h >= heights[idx + 1] &&
        h >= heights[idx - resolution] &&
        h >= heights[idx + resolution];
      if (isLocalMax) {
        candidates.push({ index: idx, height: h });
      }
    }
  }
  candidates.sort((a, b) => b.height - a.height);

  // Greedily pick tall, spatially-separated peaks so springs aren't clustered together.
  const chosen: { index: number; height: number }[] = [];
  const minSeparation = resolution * 0.12;
  for (const c of candidates) {
    const cx = c.index % resolution;
    const cy = Math.floor(c.index / resolution);
    const tooClose = chosen.some((o) => {
      const ox = o.index % resolution;
      const oy = Math.floor(o.index / resolution);
      const dx = cx - ox;
      const dy = cy - oy;
      return Math.sqrt(dx * dx + dy * dy) < minSeparation;
    });
    if (!tooClose) chosen.push(c);
    if (chosen.length >= count) break;
  }
  return chosen.map((c) => c.index);
}

/** Converts a grid-column index to world-space X, centring the terrain on the origin. */
export function gridToWorldX(terrain: TerrainData, gx: number): number {
  return (gx / (terrain.resolution - 1) - 0.5) * terrain.worldSize;
}

/** Converts a grid-row index to world-space Z, centring the terrain on the origin. */
export function gridToWorldZ(terrain: TerrainData, gy: number): number {
  return (gy / (terrain.resolution - 1) - 0.5) * terrain.worldSize;
}

/** Bilinear height sample at continuous grid coordinates (gx, gy) in [0, resolution-1]. */
export function sampleHeightBilinear(terrain: TerrainData, gx: number, gy: number): number {
  const { resolution, heights } = terrain;
  const cx = Math.min(Math.max(gx, 0), resolution - 1.0001);
  const cy = Math.min(Math.max(gy, 0), resolution - 1.0001);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = cx - x0;
  const ty = cy - y0;

  const h00 = heights[y0 * resolution + x0];
  const h10 = heights[y0 * resolution + x1];
  const h01 = heights[y1 * resolution + x0];
  const h11 = heights[y1 * resolution + x1];

  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * ty;
}

/** Central-difference terrain gradient (steepest ascent direction) at grid cell (gx, gy). */
export function gradientAt(terrain: TerrainData, gx: number, gy: number): { dx: number; dy: number } {
  const { resolution, heights } = terrain;
  const xL = Math.max(gx - 1, 0);
  const xR = Math.min(gx + 1, resolution - 1);
  const yU = Math.max(gy - 1, 0);
  const yD = Math.min(gy + 1, resolution - 1);
  const dx = (heights[gy * resolution + xR] - heights[gy * resolution + xL]) / (xR - xL || 1);
  const dy = (heights[yD * resolution + gx] - heights[yU * resolution + gx]) / (yD - yU || 1);
  return { dx, dy };
}
