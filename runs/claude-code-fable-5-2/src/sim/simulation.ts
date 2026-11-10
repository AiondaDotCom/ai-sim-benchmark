import { placeSprings, Storm, type Spring } from './sources';
import { generateTerrain, type Terrain } from './terrain';
import { WaterSim } from './water';

export interface SimulationOptions {
  seed: number;
  /** Multiplier for rainfall (0 disables rain). */
  rain?: number;
  /** Multiplier for spring discharge (0 disables springs). */
  springs?: number;
  /** Grid points per side. */
  gridSize?: number;
}

/** Nominal fixed time step in simulated seconds. */
export const BASE_DT = 0.04;
/** How often (in steps) the slowly changing inputs are refreshed. */
const REFRESH_INTERVAL = 8;

/**
 * The complete headless world: terrain + water + the autonomous water sources.
 * Rendering code only ever reads from this object.
 */
export class Simulation {
  readonly terrain: Terrain;
  readonly water: WaterSim;
  readonly springs: Spring[];
  readonly storm: Storm;
  readonly rainField: Float32Array;
  rainMultiplier: number;
  springMultiplier: number;
  /** Simulated seconds since start. */
  time = 0;
  stepCount = 0;

  private dt = BASE_DT;

  constructor(options: SimulationOptions) {
    this.terrain = generateTerrain({ seed: options.seed, size: options.gridSize });
    this.rainMultiplier = options.rain ?? 1;
    this.springMultiplier = options.springs ?? 1;

    const { size, heights, seaLevel, cellSize } = this.terrain;
    // The sea and the outer border swallow water: rivers end at the coast.
    const sinkMask = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
        if (border || heights[i] <= seaLevel) sinkMask[i] = 1;
      }
    }
    this.water = new WaterSim(size, cellSize, heights, { sinkMask, evaporation: 0.0004 });
    this.springs = placeSprings(this.terrain);
    this.storm = new Storm(options.seed);
    this.rainField = new Float32Array(size * size);
  }

  /** Advances the world by one fixed step. */
  step(): void {
    if (this.stepCount % REFRESH_INTERVAL === 0) {
      this.storm.fillRainField(this.terrain, this.time, this.rainField);
      // Keep the step inside the CFL limit even if a lake becomes very deep
      // or a finer grid is selected.
      this.dt = Math.min(BASE_DT, this.water.maxStableDt());
    }
    const dt = this.dt;
    const water = this.water;

    water.addRain(this.rainField, this.rainMultiplier, dt);
    if (this.springMultiplier > 0) {
      for (const spring of this.springs) {
        // Spread over a plus-shaped patch so the source is not a single spike.
        const v = (spring.rate * this.springMultiplier * dt) / 5;
        water.addVolume(spring.x, spring.y, v);
        water.addVolume(spring.x + 1, spring.y, v);
        water.addVolume(spring.x - 1, spring.y, v);
        water.addVolume(spring.x, spring.y + 1, v);
        water.addVolume(spring.x, spring.y - 1, v);
      }
    }
    water.step(dt);

    this.time += dt;
    this.stepCount++;
  }

  /** Steps until `targetTime` is reached or `maxSteps` were taken. Returns steps taken. */
  advanceTo(targetTime: number, maxSteps: number): number {
    let n = 0;
    while (this.time < targetTime && n < maxSteps) {
      this.step();
      n++;
    }
    return n;
  }
}
