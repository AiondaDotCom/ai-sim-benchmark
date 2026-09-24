import { findSprings, generateTerrain, type GridPoint, type Terrain } from './terrain';
import { WaterSimulation } from './water';

/**
 * A complete, renderer-independent world: terrain + water + weather.
 * Nothing in here knows about Three.js or the DOM.
 */
export interface WorldOptions {
  seed: number;
  /** Grid resolution (size x size cells). */
  size: number;
  /** Rain multiplier; 0 disables rain, 1 is the default weather. */
  rainIntensity: number;
  /** Number of springs placed just below the highest peaks. */
  springCount: number;
  /** Volume per second of each spring (before `rainIntensity` is applied). */
  springRate: number;
}

export const DEFAULT_WORLD_OPTIONS: WorldOptions = {
  seed: 1337,
  size: 256,
  rainIntensity: 1,
  springCount: 5,
  springRate: 5,
};

/** Base rainfall in depth units per simulated second at intensity 1. */
export const BASE_RAIN_RATE = 0.0016;
/** Evaporation in depth units per simulated second. */
export const EVAPORATION_RATE = 0.0009;
/** Fixed simulation time step (simulated seconds). */
export const SIM_DT = 0.05;

export class World {
  readonly options: WorldOptions;
  readonly terrain: Terrain;
  readonly water: WaterSimulation;
  readonly springs: GridPoint[];
  private accumulator = 0;

  constructor(options: Partial<WorldOptions> = {}) {
    this.options = { ...DEFAULT_WORLD_OPTIONS, ...options };
    const { seed, size, springCount, springRate, rainIntensity } = this.options;

    this.terrain = generateTerrain({ size, seed, maxHeight: size * 0.23 });
    this.water = new WaterSimulation(this.terrain.heights, size, {
      boundary: 'open',
      evaporation: EVAPORATION_RATE,
    });

    // Orographic rain: mountains catch more rain than valleys.
    const w = this.water.rainWeight;
    const h = this.terrain.heights;
    const maxH = this.terrain.maxHeight;
    let sum = 0;
    for (let i = 0; i < w.length; i++) {
      w[i] = 0.3 + (h[i] / maxH) * 1.4;
      sum += w[i];
    }
    const mean = sum / w.length;
    for (let i = 0; i < w.length; i++) w[i] /= mean;

    this.springs = findSprings(this.terrain, springCount);
    // Springs keep running even with rain disabled (intensity 0 -> base rate).
    const springScale = Math.max(0.5, Math.sqrt(Math.max(0, rainIntensity)));
    for (const p of this.springs) {
      this.water.addSpring({ x: p.x, y: p.y, rate: springRate * springScale * (size / 256) ** 2, radius: 1 });
    }
    this.water.rainRate = this.rainRateAt(0);
  }

  /**
   * Rainfall (depth per second) at simulated time t: an initial downpour that
   * gets streams going quickly, settling into slowly pulsing showers.
   */
  rainRateAt(t: number): number {
    const intensity = Math.max(0, this.options.rainIntensity);
    const burst = 1.6 * Math.exp(-t / 60);
    const showers = 0.75 + 0.35 * Math.sin((t / 90) * Math.PI * 2) + 0.15 * Math.sin((t / 23) * Math.PI * 2 + 1.3);
    return BASE_RAIN_RATE * intensity * (showers + burst);
  }

  /** Normalised rain strength in [0, ~1.5] for driving rain particles. */
  rainStrengthAt(t: number): number {
    return BASE_RAIN_RATE > 0 ? this.rainRateAt(t) / BASE_RAIN_RATE / 1.6 : 0;
  }

  /**
   * Advances simulated time by `simSeconds` using fixed steps of SIM_DT.
   * At most `maxSteps` steps are taken per call (leftover time is dropped) so
   * a slow frame can never cause a runaway spiral. Returns the number of steps.
   */
  advance(simSeconds: number, maxSteps = 16): number {
    this.accumulator += Math.max(0, simSeconds);
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < maxSteps) {
      this.water.rainRate = this.rainRateAt(this.water.time);
      const dt = Math.min(SIM_DT, this.water.maxStableDt());
      this.water.step(dt);
      this.accumulator -= dt;
      steps++;
    }
    if (steps >= maxSteps) this.accumulator = 0;
    return steps;
  }
}
