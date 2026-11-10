import { toSeed } from './sim/rng';

/** Everything that can be configured. There is deliberately no on-screen UI. */
export interface AppConfig {
  /** Terrain / weather seed. `?seed=1234` or any text. */
  seed: number;
  /** Rain intensity multiplier, 0..5. `?rain=1.5` */
  rain: number;
  /** Spring discharge multiplier, 0..5. `?springs=1` */
  springs: number;
  /** Simulation speed multiplier, 0..4. `?speed=2` */
  speed: number;
  /** Grid points per side, 96..384. `?grid=256` */
  grid: number;
  /** Simulated seconds computed before the first frame, 0..3600. `?warmup=300` */
  warmup: number;
}

export const DEFAULT_CONFIG: Readonly<AppConfig> = Object.freeze({
  seed: 7,
  rain: 1,
  springs: 1,
  speed: 1,
  grid: 256,
  warmup: 0,
});

function numberParam(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Parses a URL query string (e.g. `location.search`) into a validated config. */
export function parseConfig(search: string): AppConfig {
  const params = new URLSearchParams(search);
  const seedRaw = params.get('seed');
  return {
    seed: seedRaw === null || seedRaw.trim() === '' ? DEFAULT_CONFIG.seed : toSeed(seedRaw),
    rain: numberParam(params, 'rain', DEFAULT_CONFIG.rain, 0, 5),
    springs: numberParam(params, 'springs', DEFAULT_CONFIG.springs, 0, 5),
    speed: numberParam(params, 'speed', DEFAULT_CONFIG.speed, 0, 4),
    grid: Math.round(numberParam(params, 'grid', DEFAULT_CONFIG.grid, 96, 384)),
    warmup: numberParam(params, 'warmup', DEFAULT_CONFIG.warmup, 0, 3600),
  };
}
