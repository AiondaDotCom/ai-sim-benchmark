/**
 * Procedural terrain generation using deterministic noise.
 */

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0; // Ensure 32-bit unsigned
  }

  next(): number {
    // Improved LCG with much larger modulo for better distribution
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed >>> 0) / 4294967296; // Divide by 2^32
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Simple Perlin-like noise using value noise with interpolation.
 */
function valueNoise(
  x: number,
  y: number,
  seed: number
): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const rng0 = new SeededRandom(seed + xi * 73856093 ^ yi * 19349663);
  const v00 = rng0.next();

  const rng1 = new SeededRandom(seed + (xi + 1) * 73856093 ^ yi * 19349663);
  const v10 = rng1.next();

  const rng2 = new SeededRandom(seed + xi * 73856093 ^ (yi + 1) * 19349663);
  const v01 = rng2.next();

  const rng3 = new SeededRandom(
    seed + (xi + 1) * 73856093 ^ (yi + 1) * 19349663
  );
  const v11 = rng3.next();

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  const nx0 = lerp(v00, v10, u);
  const nx1 = lerp(v01, v11, u);
  return lerp(nx0, nx1, v);
}

/**
 * Fractional Brownian Motion for multi-scale terrain.
 */
function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  persistence: number = 0.5
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

export interface TerrainData {
  heights: Float32Array;
  width: number;
  height: number;
  minHeight: number;
  maxHeight: number;
  cellSize: number;
}

export function generateTerrain(
  width: number,
  height: number,
  seed: number,
  mountainHeight: number = 100
): TerrainData {
  const heightMap = new Float32Array(width * height);
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  const scale = 0.01; // Controls feature size
  const cellSize = 1.0; // For water flow simulation

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Create valleys with ridges
      const nx = (x / width) * 4 - 2;
      const ny = (y / height) * 4 - 2;

      // Base FBM noise with 6 octaves for interesting terrain
      let baseHeight = fbm(nx * scale, ny * scale, seed, 6, 2.0, 0.5);

      // Add some ridges to create more interesting flow patterns
      const ridgeNoise =
        Math.abs(fbm(nx * scale * 0.5, ny * scale * 0.5, seed + 100, 3));
      baseHeight = baseHeight * 0.7 + ridgeNoise * 0.3;

      // Normalize to 0-1 and apply mountain height
      const elevation = Math.max(0, baseHeight) * mountainHeight;

      heightMap[y * width + x] = elevation;

      minHeight = Math.min(minHeight, elevation);
      maxHeight = Math.max(maxHeight, elevation);
    }
  }

  return {
    heights: heightMap,
    width,
    height,
    minHeight,
    maxHeight,
    cellSize,
  };
}

/**
 * Get height at arbitrary coordinates using bilinear interpolation.
 */
export function getHeightAt(
  terrain: TerrainData,
  x: number,
  y: number
): number {
  // Clamp to terrain bounds
  x = Math.max(0, Math.min(terrain.width - 1, x));
  y = Math.max(0, Math.min(terrain.height - 1, y));

  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const x0 = Math.min(xi, terrain.width - 2);
  const y0 = Math.min(yi, terrain.height - 2);

  const h00 = terrain.heights[y0 * terrain.width + x0];
  const h10 = terrain.heights[y0 * terrain.width + (x0 + 1)];
  const h01 = terrain.heights[(y0 + 1) * terrain.width + x0];
  const h11 = terrain.heights[(y0 + 1) * terrain.width + (x0 + 1)];

  const hx0 = lerp(h00, h10, xf);
  const hx1 = lerp(h01, h11, xf);
  return lerp(hx0, hx1, yf);
}

/**
 * Get normal vector at a point on the terrain (for shading and flow direction).
 */
export function getNormalAt(
  terrain: TerrainData,
  x: number,
  y: number,
  epsilon: number = 1.0
): [number, number, number] {
  const h0 = getHeightAt(terrain, x, y);
  const hx = getHeightAt(terrain, x + epsilon, y);
  const hy = getHeightAt(terrain, x, y + epsilon);

  const dx = hx - h0;
  const dy = hy - h0;

  // Create normal: (-dx, -dy, epsilon*epsilon) normalized
  const length = Math.sqrt(dx * dx + dy * dy + epsilon * epsilon);
  return [-dx / length, -dy / length, (epsilon * epsilon) / length];
}

/**
 * Get gradient (downhill direction) at a point.
 */
export function getGradientAt(
  terrain: TerrainData,
  x: number,
  y: number,
  epsilon: number = 1.0
): [number, number] {
  const h0 = getHeightAt(terrain, x, y);
  const hx = getHeightAt(terrain, x + epsilon, y);
  const hy = getHeightAt(terrain, x, y + epsilon);

  const gradX = (h0 - hx) / epsilon; // Negative gradient for downhill
  const gradY = (h0 - hy) / epsilon;

  const magnitude = Math.sqrt(gradX * gradX + gradY * gradY);
  if (magnitude < 0.001) return [0, 0];

  return [gradX / magnitude, gradY / magnitude];
}
