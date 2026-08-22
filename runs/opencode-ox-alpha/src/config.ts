/**
 * Runtime configuration, resolved from URL query parameters with
 * code-constant defaults. There is deliberately no on-screen UI.
 */
export interface AppConfig {
  seed: number;
  /** Rain depth per second per cell. */
  rainRate: number;
  /** Simulation time multiplier. */
  simSpeed: number;
  /** Terrain grid resolution per side. */
  gridN: number;
  /** World size (units) of the terrain square. */
  size: number;
}

const DEFAULTS: AppConfig = {
  seed: 1337,
  rainRate: 0.02,
  simSpeed: 1,
  gridN: 193,
  size: 200,
};

function num(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? v : undefined;
}

/** Parse config from a query string (defaults apply to missing keys). */
export function parseConfig(query: string = window.location.search): AppConfig {
  const params = new URLSearchParams(query);
  const seed = num(params, "seed");
  const rainRate = num(params, "rain");
  const simSpeed = num(params, "speed");
  const gridN = num(params, "grid");
  const size = num(params, "size");
  return {
    seed: seed ?? DEFAULTS.seed,
    rainRate: Math.max(0, rainRate ?? DEFAULTS.rainRate),
    simSpeed: Math.max(0.1, Math.min(8, simSpeed ?? DEFAULTS.simSpeed)),
    gridN: Math.round(Math.max(33, Math.min(385, gridN ?? DEFAULTS.gridN))),
    size: Math.max(50, Math.min(500, size ?? DEFAULTS.size)),
  };
}
