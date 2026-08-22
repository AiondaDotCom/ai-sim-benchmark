/**
 * Application configuration.
 *
 * There is intentionally NO on-screen UI: configuration happens only via
 * URL query parameters (or the defaults below). Example:
 *   http://localhost:5173/?seed=42&rain=0.05&speed=1.5
 */

export interface AppConfig {
  /** Terrain seed. */
  seed: number;
  /** Grid resolution of terrain + water. */
  size: number;
  /** World size of the terrain square. */
  worldSize: number;
  /** Rainfall rate (depth/sec). */
  rain: number;
  /** Evaporation rate (depth/sec). */
  evaporation: number;
  /** Flow coefficient. */
  flow: number;
  /** Spring emission rate (depth/sec per spring). */
  springRate: number;
  /** Simulation speed multiplier. */
  speed: number;
  /** Camera orbit angular speed (rad/sec). */
  cameraSpeed: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  seed: 1337,
  size: 160,
  worldSize: 240,
  rain: 0.007,
  evaporation: 0.0035,
  flow: 2.4,
  springRate: 0.5,
  speed: 1.0,
  cameraSpeed: 0.05,
};

function num(params: URLSearchParams, key: string, fallback: number): number {
  const v = params.get(key);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseConfig(search: string): AppConfig {
  const params = new URLSearchParams(search);
  const cfg = { ...DEFAULT_CONFIG };
  cfg.seed = Math.floor(num(params, 'seed', cfg.seed));
  cfg.size = Math.max(32, Math.min(512, Math.floor(num(params, 'size', cfg.size))));
  cfg.rain = num(params, 'rain', cfg.rain);
  cfg.evaporation = num(params, 'evaporation', cfg.evaporation);
  cfg.flow = num(params, 'flow', cfg.flow);
  cfg.springRate = num(params, 'springRate', cfg.springRate);
  cfg.speed = Math.max(0.1, Math.min(8, num(params, 'speed', cfg.speed)));
  cfg.cameraSpeed = num(params, 'camera', cfg.cameraSpeed);
  return cfg;
}
