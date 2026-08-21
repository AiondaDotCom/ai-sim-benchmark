/**
 * Application configuration.
 *
 * There is deliberately NO on-screen UI: everything is configured through
 * URL query parameters (or by editing the defaults below).
 *
 * Examples:
 *   ?seed=42            different landscape
 *   ?rain=0.03          heavier rainfall (depth units / second)
 *   ?speed=2            2x simulation speed
 *   ?springs=8          number of mountain springs
 *   ?grid=224           simulation grid resolution
 */

export interface AppConfig {
  /** Terrain seed (any integer). */
  seed: number;
  /** Simulation grid resolution (cells per side). */
  gridSize: number;
  /** Uniform rainfall, depth units per second. */
  rain: number;
  /** Number of springs placed near mountain peaks. */
  springCount: number;
  /** Volume per spring per second. */
  springRate: number;
  /** Simulation speed multiplier. */
  speed: number;
  /** Fraction of water depth evaporating per second. */
  evaporation: number;
  /** Camera orbit period in seconds. */
  orbitPeriod: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  seed: 1337,
  gridSize: 192,
  rain: 0.012,
  springCount: 6,
  springRate: 14,
  speed: 1,
  evaporation: 0.012,
  orbitPeriod: 75,
};

function num(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** Parse configuration from a query string (defaults when absent/invalid). */
export function loadConfig(search: string): AppConfig {
  const p = new URLSearchParams(search);
  const d = DEFAULT_CONFIG;
  return {
    seed: Math.floor(num(p, 'seed', d.seed, -2147483648, 2147483647)),
    gridSize: Math.floor(num(p, 'grid', d.gridSize, 32, 512)),
    rain: num(p, 'rain', d.rain, 0, 1),
    springCount: Math.floor(num(p, 'springs', d.springCount, 0, 32)),
    springRate: num(p, 'springRate', d.springRate, 0, 200),
    speed: num(p, 'speed', d.speed, 0.1, 8),
    evaporation: num(p, 'evap', d.evaporation, 0, 1),
    orbitPeriod: num(p, 'orbit', d.orbitPeriod, 10, 600),
  };
}
