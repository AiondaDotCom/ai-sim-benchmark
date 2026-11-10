import { mulberry32 } from './rng';
import type { Terrain } from './terrain';
import { WORLD_SIZE } from './terrain';

/** A point source that continuously feeds water into the simulation. */
export interface Spring {
  /** Grid coordinates. */
  x: number;
  y: number;
  /** Discharge in world units^3 per simulated second (before the global multiplier). */
  rate: number;
  kind: 'peak' | 'basin';
}

function steepestStep(terrain: Terrain, x: number, y: number, uphill: boolean): [number, number] {
  const s = terrain.size;
  let best = terrain.heights[y * s + x];
  let bx = x;
  let by = y;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const nx = x + i;
      const ny = y + j;
      if ((i === 0 && j === 0) || nx < 1 || ny < 1 || nx >= s - 1 || ny >= s - 1) continue;
      const h = terrain.heights[ny * s + nx];
      if (uphill ? h > best : h < best) {
        best = h;
        bx = nx;
        by = ny;
      }
    }
  }
  return [bx, by];
}

/** True if the path of steepest descent from (x, y) passes within `radius` cells of (tx, ty). */
function descentReaches(terrain: Terrain, x: number, y: number, tx: number, ty: number, radius: number): boolean {
  for (let n = 0; n < terrain.size * 2; n++) {
    if (Math.hypot(x - tx, y - ty) <= radius) return true;
    const [nx, ny] = steepestStep(terrain, x, y, false);
    if (nx === x && ny === y) return false;
    x = nx;
    y = ny;
  }
  return false;
}

/**
 * Chooses spring locations deterministically from the terrain:
 *  - just below the highest, well separated summits, and
 *  - on the slope above each carved basin, so every lake has a feeder stream.
 */
export function placeSprings(terrain: Terrain, peakCount = 4): Spring[] {
  const s = terrain.size;
  const h = terrain.heights;
  const window = Math.max(2, Math.round(4 / terrain.cellSize));
  const peaks: { x: number; y: number; h: number }[] = [];
  for (let y = window; y < s - window; y++) {
    for (let x = window; x < s - window; x++) {
      const c = h[y * s + x];
      if (c < terrain.maxHeight * 0.45) continue;
      let isMax = true;
      for (let j = -window; j <= window && isMax; j++) {
        for (let i = -window; i <= window; i++) {
          if (h[(y + j) * s + (x + i)] > c) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ x, y, h: c });
    }
  }
  peaks.sort((a, b) => b.h - a.h || a.y - b.y || a.x - b.x);

  const springs: Spring[] = [];
  const separation = 38 / terrain.cellSize;
  for (const p of peaks) {
    if (springs.length >= peakCount) break;
    if (springs.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < separation)) continue;
    // Emerge a little below the summit rather than exactly on the tip.
    let x = p.x;
    let y = p.y;
    const steps = Math.round(5 / terrain.cellSize);
    for (let n = 0; n < steps; n++) [x, y] = steepestStep(terrain, x, y, false);
    springs.push({ x, y, rate: 1.9, kind: 'peak' });
  }

  for (const basin of terrain.basins) {
    // Climb the slope above the basin rim, starting from the highest rim point,
    // and keep the first start whose path of steepest descent really ends in
    // the basin. That stream will feed the lake.
    const r = basin.radius + 2;
    const rim: { x: number; y: number; h: number }[] = [];
    for (let a = 0; a < 32; a++) {
      const px = Math.round(basin.x + r * COS32[a]);
      const py = Math.round(basin.y + r * SIN32[a]);
      if (px < 1 || py < 1 || px >= s - 1 || py >= s - 1) continue;
      rim.push({ x: px, y: py, h: h[py * s + px] });
    }
    rim.sort((p, q) => q.h - p.h);
    const climb = Math.round(24 / terrain.cellSize);
    let chosen: [number, number] = [basin.x, basin.y];
    for (const start of rim) {
      let x = start.x;
      let y = start.y;
      for (let n = 0; n < climb; n++) [x, y] = steepestStep(terrain, x, y, true);
      for (let n = 0; n < 3; n++) [x, y] = steepestStep(terrain, x, y, false);
      if (descentReaches(terrain, x, y, basin.x, basin.y, basin.radius * 0.9)) {
        chosen = [x, y];
        break;
      }
    }
    springs.push({ x: chosen[0], y: chosen[1], rate: 1.8, kind: 'basin' });
  }
  return springs;
}

// Unit circle sampled at 32 points. Precomputed once; identical inputs to
// Math.cos/sin always give identical outputs within one engine.
const COS32: number[] = [];
const SIN32: number[] = [];
for (let a = 0; a < 32; a++) {
  COS32.push(Math.cos((a / 32) * Math.PI * 2));
  SIN32.push(Math.sin((a / 32) * Math.PI * 2));
}

/**
 * A rain storm that wanders over the island on a smooth closed path and
 * swells and fades over time. Purely a function of simulated time.
 */
export class Storm {
  /** Standard deviation of the gaussian rain footprint, in world units. */
  readonly sigma = 34;
  /** Peak rainfall in depth units per simulated second at intensity 1. */
  readonly peakRate = 0.0022;
  /** Light drizzle everywhere on land, as a fraction of the storm peak. */
  readonly drizzle = 0.06;
  /** Simulated seconds for one lap of the storm path. */
  readonly period = 520;

  private readonly phaseA: number;
  private readonly phaseB: number;
  private readonly phaseC: number;

  constructor(seed: number) {
    const rng = mulberry32(seed ^ 0x51ed270b);
    this.phaseA = rng() * Math.PI * 2;
    this.phaseB = rng() * Math.PI * 2;
    this.phaseC = rng() * Math.PI * 2;
  }

  /** Storm centre in world X/Z at simulated time `t`. */
  position(t: number): [number, number] {
    const w = (Math.PI * 2 * t) / this.period;
    const reach = WORLD_SIZE * 0.2;
    return [reach * Math.sin(w + this.phaseA), reach * Math.sin(w * 1.5 + this.phaseB)];
  }

  /** Storm strength in [0, 1]: it rains hard, eases off, and returns. */
  intensity(t: number): number {
    const w = (Math.PI * 2 * t) / (this.period * 0.62);
    const v = 0.5 + 0.5 * Math.sin(w + this.phaseC);
    // Start with some rain already falling so the demo opens with action.
    const opening = Math.max(0, 1 - t / 60);
    return Math.min(1, Math.max(0.12, v * v * (3 - 2 * v), opening));
  }

  /** Writes the rainfall rate (depth / s at multiplier 1) for every cell. */
  fillRainField(terrain: Terrain, t: number, out: Float32Array): void {
    const s = terrain.size;
    const [cx, cz] = this.position(t);
    const strength = this.intensity(t) * this.peakRate;
    const inv = 1 / (2 * this.sigma * this.sigma);
    const half = (s - 1) / 2;
    for (let y = 0; y < s; y++) {
      const wz = (y - half) * terrain.cellSize - cz;
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        if (terrain.heights[i] <= terrain.seaLevel) {
          out[i] = 0;
          continue;
        }
        const wx = (x - half) * terrain.cellSize - cx;
        out[i] = strength * (this.drizzle + Math.exp(-(wx * wx + wz * wz) * inv));
      }
    }
  }
}
