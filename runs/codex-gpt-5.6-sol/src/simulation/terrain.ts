import { fbm2D, hashString, mulberry32, valueNoise2D } from './random';

export interface TerrainData {
  width: number;
  height: number;
  worldSize: number;
  cellSize: number;
  heights: Float64Array;
  minHeight: number;
  maxHeight: number;
  peaks: readonly TerrainPeak[];
}

export interface TerrainPeak {
  x: number;
  z: number;
  height: number;
}

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function generateTerrain(seedText: string, size = 97, worldSize = 120): TerrainData {
  if (size < 3) throw new Error('Terrain size must be at least 3.');

  const seed = hashString(seedText);
  const random = mulberry32(seed);
  const heights = new Float64Array(size * size);
  const peakShapes = Array.from({ length: 6 }, (_, index) => ({
    x: (random() - 0.5) * (index < 3 ? 0.75 : 1.25),
    z: (random() - 0.5) * (index < 3 ? 0.75 : 1.25),
    radius: 0.2 + random() * 0.25,
    height: 9 + random() * 12,
  }));

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const nz = (z / (size - 1)) * 2 - 1;
      const warpedX = nx * 1.45 + (fbm2D(nx * 1.2 + 8, nz * 1.2 - 3, seed + 41, 3) - 0.5) * 0.34;
      const warpedZ = nz * 1.45 + (fbm2D(nx * 1.2 - 5, nz * 1.2 + 6, seed + 73, 3) - 0.5) * 0.34;
      const continental = fbm2D(warpedX + 12.8, warpedZ - 4.2, seed, 6);
      const ridgeNoise = valueNoise2D(warpedX * 1.55 - 7.1, warpedZ * 1.55 + 2.6, seed + 997);
      const ridges = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), 2.6);
      const edgeDistance = Math.max(Math.abs(nx), Math.abs(nz));
      const islandMask = 1 - smoothstep(0.68, 1.04, edgeDistance);

      let mountainHeight = 2.1 + islandMask * (continental * 9.5 + ridges * 8.5);
      for (const peak of peakShapes) {
        const dx = nx - peak.x;
        const dz = nz - peak.z;
        mountainHeight += peak.height * Math.exp(-(dx * dx + dz * dz) / (peak.radius * peak.radius));
      }

      const fineDetail = fbm2D(warpedX * 5 + 21, warpedZ * 5 - 11, seed + 2027, 3) - 0.5;
      const basinNoise = fbm2D(nx * 2.5 - 31, nz * 2.5 + 17, seed + 3011, 4);
      const basinCut = Math.pow(Math.max(0, 0.5 - basinNoise), 2) * 7;
      const height = Math.max(0.35, mountainHeight + fineDetail * 1.5 - basinCut * islandMask);
      heights[z * size + x] = height;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  // Overlapping seeded peak kernels can otherwise produce rare, outsized spires.
  // A shared relief scale keeps every seed cinematic without changing its shape.
  const maximumRelief = 34;
  const rawRelief = maxHeight - minHeight;
  if (rawRelief > maximumRelief) {
    const reliefScale = maximumRelief / rawRelief;
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = minHeight + (heights[index] - minHeight) * reliefScale;
    }
    maxHeight = minHeight + maximumRelief;
  }

  const peakCandidates: TerrainPeak[] = [];
  for (let z = 2; z < size - 2; z += 1) {
    for (let x = 2; x < size - 2; x += 1) {
      const height = heights[z * size + x];
      let localMaximum = true;
      for (let dz = -2; dz <= 2 && localMaximum; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (heights[(z + dz) * size + x + dx] > height) {
            localMaximum = false;
            break;
          }
        }
      }
      if (localMaximum && height > minHeight + (maxHeight - minHeight) * 0.58) {
        peakCandidates.push({ x, z, height });
      }
    }
  }
  peakCandidates.sort((a, b) => b.height - a.height);

  const peaks: TerrainPeak[] = [];
  for (const candidate of peakCandidates) {
    if (peaks.every((peak) => Math.hypot(peak.x - candidate.x, peak.z - candidate.z) > size * 0.16)) {
      peaks.push(candidate);
      if (peaks.length === 4) break;
    }
  }

  if (peaks.length < 4) {
    const highRidges: TerrainPeak[] = [];
    for (let z = 3; z < size - 3; z += 1) {
      for (let x = 3; x < size - 3; x += 1) {
        const height = heights[z * size + x];
        if (height > minHeight + (maxHeight - minHeight) * 0.46) highRidges.push({ x, z, height });
      }
    }
    highRidges.sort((a, b) => b.height - a.height);
    for (const candidate of highRidges) {
      if (peaks.every((peak) => Math.hypot(peak.x - candidate.x, peak.z - candidate.z) > size * 0.18)) {
        peaks.push(candidate);
        if (peaks.length === 4) break;
      }
    }
  }

  return {
    width: size,
    height: size,
    worldSize,
    cellSize: worldSize / (size - 1),
    heights,
    minHeight,
    maxHeight,
    peaks,
  };
}

export function sampleTerrainHeight(terrain: TerrainData, worldX: number, worldZ: number): number {
  const gx = Math.min(terrain.width - 1, Math.max(0, (worldX / terrain.worldSize + 0.5) * (terrain.width - 1)));
  const gz = Math.min(terrain.height - 1, Math.max(0, (worldZ / terrain.worldSize + 0.5) * (terrain.height - 1)));
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(terrain.width - 1, x0 + 1);
  const z1 = Math.min(terrain.height - 1, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const top = terrain.heights[z0 * terrain.width + x0] * (1 - tx) + terrain.heights[z0 * terrain.width + x1] * tx;
  const bottom = terrain.heights[z1 * terrain.width + x0] * (1 - tx) + terrain.heights[z1 * terrain.width + x1] * tx;
  return top * (1 - tz) + bottom * tz;
}
