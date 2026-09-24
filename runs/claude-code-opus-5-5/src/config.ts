import { seedFromString } from './sim/random';

/**
 * Runtime configuration. There is deliberately no on-screen UI: everything is
 * set through URL query parameters (or the defaults below).
 *
 *   ?seed=42        terrain seed (integer or any string)
 *   ?rain=1.5       rain intensity multiplier (0 = no rain, springs only)
 *   ?speed=2        simulation speed multiplier
 *   ?springs=5      number of springs near the peaks
 *   ?size=256       simulation grid resolution (64..512)
 *   ?orbit=1        camera orbit speed multiplier (0 = static camera)
 *   ?warmup=0       simulated seconds to pre-compute before the first frame
 */
export interface AppConfig {
  seed: number;
  rainIntensity: number;
  simSpeed: number;
  springCount: number;
  gridSize: number;
  orbitSpeed: number;
  warmupSeconds: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  seed: 1337,
  rainIntensity: 1,
  simSpeed: 1,
  springCount: 5,
  gridSize: 256,
  orbitSpeed: 1,
  warmupSeconds: 0,
};

function num(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function parseConfig(search: string): AppConfig {
  const params = new URLSearchParams(search);
  const seedRaw = params.get('seed');
  return {
    seed: seedRaw && seedRaw.trim() !== '' ? seedFromString(seedRaw) : DEFAULT_CONFIG.seed,
    rainIntensity: num(params, 'rain', DEFAULT_CONFIG.rainIntensity, 0, 10),
    simSpeed: num(params, 'speed', DEFAULT_CONFIG.simSpeed, 0, 10),
    springCount: Math.round(num(params, 'springs', DEFAULT_CONFIG.springCount, 0, 20)),
    gridSize: Math.round(num(params, 'size', DEFAULT_CONFIG.gridSize, 64, 512)),
    orbitSpeed: num(params, 'orbit', DEFAULT_CONFIG.orbitSpeed, 0, 10),
    warmupSeconds: num(params, 'warmup', DEFAULT_CONFIG.warmupSeconds, 0, 3600),
  };
}
