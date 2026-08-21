/**
 * All tunable knobs for the autonomous demo live here. There is intentionally
 * NO on-screen UI to change any of this - the only way to configure a run is
 * URL query parameters (for people sharing links / recording variations) or
 * editing these code constants directly.
 *
 * Supported query parameters (all optional):
 *   ?seed=1234        - any string/number, deterministic terrain + spring seed
 *   ?rain=0.5          - multiplier on the base rain rate (0 disables rain)
 *   ?speed=2            - simulation time multiplier (1 = real time)
 *   ?orbit=0.6           - camera orbit speed multiplier
 */

export interface DemoConfig {
  seed: string;
  rainMultiplier: number;
  simSpeed: number;
  orbitSpeed: number;

  // Terrain
  gridResolution: number;
  worldSize: number;
  maxHeight: number;

  // Water
  baseRainRate: number;
  springRate: number;
  flowRate: number;
  evaporationRate: number;

  // Camera - see render/cameraPath.ts for how these drive an *exact* analytic
  // auto-framing model (not a hand-tuned radius/height guess).
  /** Target fraction (0-1) of the frame's WIDTH the terrain's silhouette should span. */
  cameraWidthTarget: number;
  /** How much cameraWidthTarget breathes up/down over time, as a fraction of itself. */
  cameraWidthBreath: number;
  /** Base camera elevation angle above the horizon, in degrees. */
  cameraElevationDeg: number;
  /** How many degrees the elevation angle breathes up/down over time. */
  cameraElevationBreathDeg: number;
}

// Exported (not just used internally) so debug/*.ts tooling can simulate/verify against
// the exact same numbers the app actually ships with, instead of a hand-copied duplicate.
export const DEFAULTS: DemoConfig = {
  seed: 'summit-42',
  rainMultiplier: 1,
  simSpeed: 1,
  orbitSpeed: 1,

  gridResolution: 128,
  worldSize: 220,
  maxHeight: 38,

  // Tuned via debug/diagnose.ts and debug/trace_stream.ts (numerically simulating the
  // exact same terrain/water code offline, logging wet-cell % and summit depth over
  // 300s of simulated time) after discovering the previous defaults let a uniform rain
  // sheet plus a weak evaporation sink flood ~90%+ of the map with unbounded average
  // depth growth. At these values the system reaches a STABLE equilibrium by ~60-120s:
  // wet-cell fraction plateaus at ~13% (a clear minority - most terrain stays dry),
  // a visible stream forms along roughly two-thirds of the spring's downhill flow path,
  // a real lake forms at the terrain's low-elevation rim (~1.5 units deep), and the
  // summit itself settles at a small, bounded, non-growing ~0.14-deep spring pool
  // (<0.4% of the mountain's height) rather than the runaway dome the old defaults
  // produced. Do not change these without re-running the debug/ scripts to confirm the
  // system still converges instead of flooding.
  baseRainRate: 0.0008,
  springRate: 0.7,
  flowRate: 4.5,
  evaporationRate: 0.05,

  // 0.76 means the terrain's silhouette spans ~76% of the frame's WIDTH at the breathing
  // midpoint - tuned (with +-6% breathing) so the low point of the breathing cycle still
  // sits at ~71%, comfortably within the "fills 60-80% of frame width, some sky margin"
  // target throughout, not just on average. render/cameraPath.ts derives camera distance
  // analytically from this fraction every frame (not a fixed radius), verified across
  // aspect ratios and orbit angles in debug/verify_framing.mjs. On wide/ultra-wide aspect
  // ratios, at some points in the orbit a hard anti-clipping safety cap (also in
  // cameraPath.ts) takes over and backs the camera off further than this target to
  // guarantee peaks/corners never clip out of frame - see debug/verify_framing.mjs's
  // printed range for exactly how much.
  cameraWidthTarget: 0.76,
  cameraWidthBreath: 0.06,
  cameraElevationDeg: 28,
  cameraElevationBreathDeg: 6,
};

function readParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function numParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): DemoConfig {
  const params = readParams();
  return {
    ...DEFAULTS,
    seed: params.get('seed') ?? DEFAULTS.seed,
    rainMultiplier: numParam(params, 'rain', DEFAULTS.rainMultiplier),
    simSpeed: numParam(params, 'speed', DEFAULTS.simSpeed),
    orbitSpeed: numParam(params, 'orbit', DEFAULTS.orbitSpeed),
  };
}
