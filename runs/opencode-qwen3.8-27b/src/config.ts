import { DEFAULT_SIM } from './sim/simulation';

/**
 * Runtime configuration. The demo is fully autonomous, so the only way to
 * configure it is via URL query parameters — there is deliberately no on-screen
 * UI. Examples:
 *
 *   ?seed=42            different landscape
 *   ?rain=2             twice the rainfall
 *   ?speed=2            twice simulation speed
 *   ?springs=5          more mountain springs
 *   ?res=192            higher-resolution grid
 */
export interface AppConfig {
  seed: number;
  /** Rainfall multiplier (1 = default). */
  rain: number;
  /** Simulation speed multiplier (1 = real time). */
  speed: number;
  /** Number of mountain springs. */
  springs: number;
  /** Simulation grid resolution (cells per side). */
  gridN: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  seed: DEFAULT_SIM.seed,
  rain: 1,
  speed: 1,
  springs: DEFAULT_SIM.numSprings,
  gridN: DEFAULT_SIM.gridN
};

function readParam(
  query: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = query.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Read the configuration from the page URL, falling back to defaults. */
export function loadConfig(): AppConfig {
  const query = new URLSearchParams(window.location.search);
  return {
    seed: Math.floor(readParam(query, 'seed', DEFAULT_CONFIG.seed, 0, 0x7fffffff)),
    rain: readParam(query, 'rain', DEFAULT_CONFIG.rain, 0, 5),
    speed: readParam(query, 'speed', DEFAULT_CONFIG.speed, 0.1, 4),
    springs: Math.floor(readParam(query, 'springs', DEFAULT_CONFIG.springs, 0, 8)),
    gridN: Math.floor(readParam(query, 'res', DEFAULT_CONFIG.gridN, 32, 256))
  };
}
