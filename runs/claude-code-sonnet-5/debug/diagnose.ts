/**
 * Offline diagnostic harness: runs the ACTUAL terrain/water simulation code
 * (not a re-implementation) with the app's real default config, and logs
 * wet-cell percentage, summit depth, lake depth and total water volume over
 * simulated time. Used to catch/verify water-balance regressions (e.g. the
 * whole map slowly flooding) that are easy to miss just by eyeballing a
 * screenshot a few seconds after page load.
 *
 * Run with: npx tsx debug/diagnose.ts
 * Override any parameter via env vars, e.g.:
 *   RAIN=0.002 SPRING=1.0 FLOW=4 EVAP=0.03 npx tsx debug/diagnose.ts
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

let min = Infinity;
let max = -Infinity;
const heightCounts = new Map<number, number>();
for (const h of terrain.heights) {
  min = Math.min(min, h);
  max = Math.max(max, h);
  const rounded = Math.round(h * 1000) / 1000;
  heightCounts.set(rounded, (heightCounts.get(rounded) ?? 0) + 1);
}
const maxCellCount = heightCounts.get(Math.round(max * 1000) / 1000) ?? 0;
console.log(`Terrain: min=${min.toFixed(3)} max=${max.toFixed(3)} maxHeight=${DEFAULTS.maxHeight}`);
console.log(
  `Cells at max elevation (plateau check): ${maxCellCount} (1 = a real single-point peak; >1 means a flat, ` +
    `zero-gradient plateau formed - water raining/springing onto it has nowhere to flow and will pool forever)`,
);
console.log(`Peak/spring indices: ${terrain.peakIndices.length}`);

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

console.log(`params: rain=${rainRate} spring=${springRate} flow=${flowRate} evap=${evaporationRate} vis=${visibleThreshold}`);

const totalCells = resolution * resolution;
const summitIdx = terrain.peakIndices[0];

function wetFraction(): number {
  let wet = 0;
  for (let i = 0; i < water.depth.length; i++) if (water.depth[i] > visibleThreshold) wet++;
  return wet / totalCells;
}

function maxDepth(): number {
  let m = 0;
  for (let i = 0; i < water.depth.length; i++) m = Math.max(m, water.depth[i]);
  return m;
}

const dt = 1 / 60;
const checkpoints = [1, 5, 10, 20, 30, 60, 120, 300];
let nextCheckpoint = 0;
let t = 0;
const maxT = checkpoints[checkpoints.length - 1];

while (t < maxT) {
  water.tick(dt);
  t += dt;
  if (nextCheckpoint < checkpoints.length && t >= checkpoints[nextCheckpoint]) {
    const wf = wetFraction();
    const summitDepth = water.depth[summitIdx];
    const totalVol = water.totalVolume();
    console.log(
      `t=${checkpoints[nextCheckpoint]}s  wet%=${(wf * 100).toFixed(1)}  summitDepth=${summitDepth.toFixed(4)}  ` +
        `maxDepth(lake)=${maxDepth().toFixed(3)}  totalVolume=${totalVol.toFixed(1)}  avgDepth=${(totalVol / totalCells).toFixed(4)}`,
    );
    nextCheckpoint++;
  }
}

console.log(
  '\nExpect: wet% converges to a stable, clearly-minority value (roughly 10-20%) rather than growing ' +
    'without bound; summitDepth stays small and roughly constant (a tiny spring pool, not a growing dome).',
);
