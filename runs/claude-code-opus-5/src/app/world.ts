/**
 * Composition layer: turns an `AppConfig` into a running simulation world.
 *
 * Deliberately free of any Three.js or DOM reference so the whole water model
 * can be driven headlessly from tests or a tuning script.
 */

import { generateTerrain, Terrain } from '../sim/terrain';
import { WaterSimulation } from '../sim/waterSim';
import { clamp } from '../sim/noise';
import type { AppConfig } from './config';
import { SIM_TUNING } from './config';

export interface Spring {
  index: number;
  col: number;
  row: number;
  worldX: number;
  worldZ: number;
  height: number;
  rate: number;
}

export class World {
  readonly config: AppConfig;
  readonly terrain: Terrain;
  readonly sim: WaterSimulation;
  readonly springs: Spring[];

  /** Simulated seconds since start. */
  private elapsed = 0;
  /** Current rainfall intensity in [0, 1], driven by the weather cycle. */
  private currentRainIntensity = 0;

  constructor(config: AppConfig) {
    this.config = config;

    this.terrain = generateTerrain({
      seed: config.seed,
      size: config.size,
      cellSize: config.cellSize,
      amplitude: config.amplitude,
    });

    this.sim = new WaterSimulation({
      width: this.terrain.size,
      height: this.terrain.size,
      terrain: this.terrain.heights,
      cellSize: this.terrain.cellSize,
      pipeArea: SIM_TUNING.pipeArea,
      damping: SIM_TUNING.damping,
      maxTimeStep: SIM_TUNING.maxTimeStep,
      maxVelocity: SIM_TUNING.maxVelocity,
      dryThreshold: SIM_TUNING.dryThreshold,
      evaporation: SIM_TUNING.baseEvaporation * config.evaporation,
      // Water leaves at the border, which is what keeps lakes confined to real
      // depressions instead of slowly flooding the entire map.
      boundary: 'open',
      rainWeights: buildOrographicWeights(this.terrain),
      rainRate: 0,
    });

    this.springs = placeSprings(this.terrain, config.springCount, SIM_TUNING.springRate);
    for (const s of this.springs) this.sim.addSourceAtIndex(s.index, s.rate);

    if (config.prewarmSeconds > 0) {
      this.advance(config.prewarmSeconds);
    }
  }

  get time(): number {
    return this.elapsed;
  }

  get rainIntensity(): number {
    return this.currentRainIntensity;
  }

  /**
   * Advance the world by `dtSimulated` seconds of simulated time.
   * The caller is responsible for applying `config.simSpeed`.
   */
  advance(dtSimulated: number): void {
    if (!(dtSimulated > 0)) return;
    // Update the weather before stepping so rain rate matches this interval.
    this.currentRainIntensity = weatherIntensity(this.elapsed);
    this.sim.rainRate =
      SIM_TUNING.baseRainRate * this.config.rainIntensity * this.currentRainIntensity;
    this.sim.step(dtSimulated);
    this.elapsed += dtSimulated;
  }

  /** Advance using a wall-clock delta, applying the configured speed factor. */
  update(wallDelta: number): void {
    const dt = Math.min(wallDelta, SIM_TUNING.maxFrameDelta) * this.config.simSpeed;
    this.advance(dt);
  }
}

/**
 * Rainfall multiplier per cell. Real mountains wring more water out of clouds
 * than the plains do (orographic lift); weighting rain by elevation makes the
 * streams start high up where they look best. Normalised to mean 1 so the
 * total rainfall stays independent of the terrain.
 */
export function buildOrographicWeights(terrain: Terrain): Float32Array {
  const n = terrain.heights.length;
  const weights = new Float32Array(n);
  const range = Math.max(1e-6, terrain.maxHeight - terrain.minHeight);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = clamp((terrain.heights[i] - terrain.minHeight) / range, 0, 1);
    const w = 0.28 + 1.9 * Math.pow(t, 1.6);
    weights[i] = w;
    sum += w;
  }
  const mean = sum / n;
  for (let i = 0; i < n; i++) weights[i] /= mean;
  return weights;
}

/**
 * Springs at the highest well-separated summits. They never stop, so there is
 * always a visible stream network even between rain showers.
 */
export function placeSprings(terrain: Terrain, count: number, rate: number): Spring[] {
  if (count <= 0) return [];
  const peaks = terrain.findPeaks(count, Math.max(8, Math.round(terrain.size * 0.09)));
  const half = terrain.worldSize / 2;
  const cell = terrain.cellSize;
  return peaks.map((index, rank) => {
    const col = index % terrain.size;
    const row = (index / terrain.size) | 0;
    return {
      index,
      col,
      row,
      worldX: (col + 0.5) * cell - half,
      worldZ: (row + 0.5) * cell - half,
      height: terrain.heights[index],
      // Taper the rate for lower-ranked peaks so the main summit dominates.
      rate: rate * (1 - rank / (count + 3)),
    };
  });
}

/**
 * Weather cycle in [0, 1]. A smooth shower that swells and fades, followed by a
 * dry spell during which the streams thin out and the lakes calm down. Phase
 * shifted so that t = 0 lands inside a shower: the demo has to be interesting
 * from the very first frame.
 */
export function weatherIntensity(t: number): number {
  const period = SIM_TUNING.weatherPeriod;
  const wet = SIM_TUNING.weatherWetFraction;
  const u = ((t / period + 0.25) % 1 + 1) % 1;
  const drizzle = 0.2;
  if (u >= wet) return drizzle;
  const shower = Math.pow(Math.sin((Math.PI * u) / wet), 0.7);
  return drizzle + (1 - drizzle) * shower;
}
