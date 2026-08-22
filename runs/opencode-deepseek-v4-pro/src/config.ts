/**
 * Runtime configuration.
 *
 * The demo is fully autonomous and has no on-screen controls. Tuning happens
 * exclusively through code constants (below) or URL query parameters:
 *
 *   ?seed=1337&size=256&rain=0.012&springs=0.03&evap=0.0004&speed=1&cam=1
 *
 * `seed` seeds the terrain (deterministic), `rain` is the rainfall per cell
 * per second, `speed` scales simulation time, `cam` scales the orbit speed.
 */

export interface Config {
  seed: number;
  gridSize: number;
  rain: number;
  springs: number;
  evaporation: number;
  edgeDrain: number;
  speed: number;
  cameraSpeed: number;
  fluxRate: number;
  flowIterations: number;
}

export const DEFAULTS: Config = {
  seed: 1337,
  gridSize: 256,
  rain: 0.001,
  springs: 0.008,
  evaporation: 0.004,
  edgeDrain: 6.0,
  speed: 1.0,
  cameraSpeed: 1.0,
  fluxRate: 0.3,
  flowIterations: 8
};

function queryParams(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

function intParam(name: string, fallback: number, lo: number, hi: number): number {
  const raw = queryParams().get(name);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function floatParam(name: string, fallback: number, lo: number, hi: number): number {
  const raw = queryParams().get(name);
  const n = raw === null ? NaN : Number.parseFloat(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function readConfig(): Config {
  return {
    seed: intParam('seed', DEFAULTS.seed, 0, 0xffffffff),
    gridSize: intParam('size', DEFAULTS.gridSize, 32, 512),
    rain: floatParam('rain', DEFAULTS.rain, 0, 1),
    springs: floatParam('springs', DEFAULTS.springs, 0, 1),
    evaporation: floatParam('evap', DEFAULTS.evaporation, 0, 1),
    edgeDrain: floatParam('drain', DEFAULTS.edgeDrain, 0, 100),
    speed: floatParam('speed', DEFAULTS.speed, 0.01, 100),
    cameraSpeed: floatParam('cam', DEFAULTS.cameraSpeed, 0, 100),
    fluxRate: DEFAULTS.fluxRate,
    flowIterations: DEFAULTS.flowIterations
  };
}