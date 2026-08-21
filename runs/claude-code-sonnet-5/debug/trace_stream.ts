/**
 * Traces the steepest-descent path (by bare terrain height, ignoring water) from the
 * tallest spring down to wherever it stops, and logs the simulated water depth at each
 * cell along the way after 30s. Confirms a visible stream actually forms connecting the
 * spring to the lake, not just an isolated pool at each end.
 *
 * Run with: npx tsx debug/trace_stream.ts
 */
import { DEFAULTS } from '../src/config';
import { generateTerrain } from '../src/sim/terrain';
import { WaterSimulation } from '../src/sim/water';

const resolution = DEFAULTS.gridResolution;
const terrain = generateTerrain({
  seed: DEFAULTS.seed,
  resolution,
  worldSize: DEFAULTS.worldSize,
  maxHeight: DEFAULTS.maxHeight,
});

const rainRate = Number(process.env.RAIN ?? DEFAULTS.baseRainRate);
const springRate = Number(process.env.SPRING ?? DEFAULTS.springRate);
const flowRate = Number(process.env.FLOW ?? DEFAULTS.flowRate);
const evaporationRate = Number(process.env.EVAP ?? DEFAULTS.evaporationRate);
const visibleThreshold = Number(process.env.VIS ?? 0.015);

const water = new WaterSimulation(terrain, {
  rainRate,
  springRate,
  springIndices: terrain.peakIndices,
  flowRate,
  evaporationRate,
});

const dt = 1 / 60;
for (let t = 0; t < 30; t += dt) water.tick(dt);

function steepestDescentPath(startIdx: number): number[] {
  const path = [startIdx];
  let cur = startIdx;
  const visited = new Set([cur]);
  for (let step = 0; step < resolution * 2; step++) {
    const x = cur % resolution;
    const y = Math.floor(cur / resolution);
    let best = cur;
    let bestH = terrain.heights[cur];
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution) continue;
      const nIdx = ny * resolution + nx;
      if (terrain.heights[nIdx] < bestH) {
        bestH = terrain.heights[nIdx];
        best = nIdx;
      }
    }
    if (best === cur || visited.has(best)) break;
    cur = best;
    visited.add(cur);
    path.push(cur);
  }
  return path;
}

const springIdx = terrain.peakIndices[0];
const path = steepestDescentPath(springIdx);
console.log(`params: rain=${rainRate} spring=${springRate} flow=${flowRate} evap=${evaporationRate} vis=${visibleThreshold}`);
console.log(`Steepest-descent path from spring (${path.length} cells):`);
console.log('idx  terrainHeight  waterDepth  visible?');
for (const idx of path) {
  const h = terrain.heights[idx];
  const d = water.depth[idx];
  console.log(`${idx}  ${h.toFixed(2)}  ${d.toFixed(4)}  ${d > visibleThreshold ? 'YES' : 'no'}`);
}

const visibleCount = path.filter((idx) => water.depth[idx] > visibleThreshold).length;
console.log(`\n${visibleCount}/${path.length} path cells are visibly wet.`);
