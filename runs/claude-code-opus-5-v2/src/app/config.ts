/**
 * All tunables live here.
 *
 * The demo is deliberately UI-free: nothing in this file is exposed as an
 * on-screen control. Values can only be changed through code constants or URL
 * query parameters, e.g.
 *
 *   ?seed=alpenglow&rain=1.4&speed=0.75&size=224
 *
 * which keeps the recorded frame completely clean.
 */

export interface AppConfig {
  /** Terrain seed. Same seed -> same landscape, always. */
  seed: string;
  /** Simulation/mesh grid resolution (cells per side). */
  size: number;
  /** World units per cell. */
  cellSize: number;
  /** Terrain peak height. */
  amplitude: number;

  /** Multiplier on the base rainfall rate. */
  rainIntensity: number;
  /** Multiplier on simulated time (1 = real time). */
  simSpeed: number;
  /** Number of permanent springs seeded near summits. */
  springCount: number;
  /** Multiplier on evaporation. */
  evaporation: number;
  /** Seconds of simulation to run before the first frame is shown. */
  prewarmSeconds: number;

  /** Draw the falling-rain particle layer. */
  showRain: boolean;
  /** Enable shadow mapping. */
  shadows: boolean;
  /** Upper bound on devicePixelRatio. */
  maxPixelRatio: number;

  /** Camera orbit speed in radians per second. */
  cameraSpeed: number;
}

/** Base physical rates, before the URL multipliers are applied. */
export const SIM_TUNING = {
  /** Depth units of rain per second at intensity 1, averaged over the map. */
  baseRainRate: 0.007,
  /** Depth units lost per second to evaporation at multiplier 1. */
  baseEvaporation: 0.0031,
  /** Volume per second delivered by each summit spring. */
  springRate: 2.0,
  /** Virtual pipe cross-section: higher = faster, flashier, less stable. */
  pipeArea: 0.5,
  /** Flux damping per step; lower makes lakes settle sooner. */
  damping: 0.982,
  /** Largest internal integration step. */
  maxTimeStep: 0.02,
  /** Depth-averaged flow speed cap (world units per second) — bed friction. */
  maxVelocity: 5.0,
  /** Depth under which a cell is considered dry. */
  dryThreshold: 0.026,
  /** Length of one weather cycle in seconds. */
  weatherPeriod: 52,
  /** Fraction of a weather cycle that is rainy. */
  weatherWetFraction: 0.62,
  /** Largest wall-clock delta fed to the simulation, to survive tab switches. */
  maxFrameDelta: 0.05,
} as const;

export const DEFAULT_CONFIG: AppConfig = {
  seed: 'alpenglow',
  size: 256,
  cellSize: 1,
  amplitude: 58,
  rainIntensity: 1,
  simSpeed: 1,
  springCount: 6,
  evaporation: 1,
  prewarmSeconds: 0,
  showRain: true,
  shadows: true,
  maxPixelRatio: 2,
  cameraSpeed: 0.045,
};

function clampNumber(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : NaN;
}

function readNumber(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const v = clampNumber(Number.parseFloat(raw), min, max);
  return Number.isFinite(v) ? v : fallback;
}

function readBool(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const v = raw.toLowerCase();
  if (v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return fallback;
}

/**
 * Resolve the effective configuration from `location.search`.
 * Unknown or out-of-range parameters silently fall back to the defaults so a
 * malformed URL can never break a recording session.
 */
export function resolveConfig(search = ''): AppConfig {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');

  return {
    seed: seed && seed.length > 0 ? seed.slice(0, 64) : DEFAULT_CONFIG.seed,
    size: Math.round(readNumber(params, 'size', DEFAULT_CONFIG.size, 64, 384)),
    cellSize: DEFAULT_CONFIG.cellSize,
    amplitude: readNumber(params, 'amplitude', DEFAULT_CONFIG.amplitude, 8, 120),
    rainIntensity: readNumber(params, 'rain', DEFAULT_CONFIG.rainIntensity, 0, 5),
    simSpeed: readNumber(params, 'speed', DEFAULT_CONFIG.simSpeed, 0.05, 6),
    springCount: Math.round(readNumber(params, 'springs', DEFAULT_CONFIG.springCount, 0, 24)),
    evaporation: readNumber(params, 'evap', DEFAULT_CONFIG.evaporation, 0, 6),
    prewarmSeconds: readNumber(params, 'prewarm', DEFAULT_CONFIG.prewarmSeconds, 0, 300),
    showRain: readBool(params, 'raindrops', DEFAULT_CONFIG.showRain),
    shadows: readBool(params, 'shadows', DEFAULT_CONFIG.shadows),
    maxPixelRatio: readNumber(params, 'dpr', DEFAULT_CONFIG.maxPixelRatio, 0.5, 3),
    cameraSpeed: readNumber(params, 'camspeed', DEFAULT_CONFIG.cameraSpeed, 0, 1),
  };
}
