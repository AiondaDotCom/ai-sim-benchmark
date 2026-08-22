/** Configuration. URL query parameters and code constants only — the demo has no
 *  on-screen controls of any kind. */
export interface Config {
  /** Procedural variation: debris, particle detail, sound-variant choice. */
  seed: number;
  /** Master volume, 0..1. */
  volume: number;
  /** Global time-scale multiplier on top of the choreographed slow motion. */
  timeScale: number;
  /** Story seconds to skip on load, for inspecting a specific beat. */
  startAt: number;
  /** Force a constant time scale (debugging / capture). */
  fixedTimeScale: number | null;
  /** Restart the sequence when it ends. */
  loop: boolean;
  /** Renderer resolution cap. */
  maxPixelRatio: number;
  quality: 'low' | 'high';
  /** Pause on the first frame (used by the screenshot tooling). */
  paused: boolean;
}

const DEFAULTS: Config = {
  seed: 20250822,
  volume: 0.85,
  timeScale: 1,
  startAt: 0,
  fixedTimeScale: null,
  loop: true,
  maxPixelRatio: 2,
  quality: 'high',
  paused: false,
};

function num(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

export function readConfig(search = window.location.search): Config {
  const p = new URLSearchParams(search);
  return {
    seed: Math.floor(num(p, 'seed', DEFAULTS.seed)) >>> 0,
    volume: Math.min(1, Math.max(0, num(p, 'volume', DEFAULTS.volume))),
    timeScale: Math.min(4, Math.max(0.05, num(p, 'timeScale', DEFAULTS.timeScale))),
    startAt: Math.max(0, num(p, 'startAt', DEFAULTS.startAt)),
    fixedTimeScale: p.has('fixedTimeScale') ? num(p, 'fixedTimeScale', 1) : null,
    loop: p.get('loop') !== '0',
    maxPixelRatio: Math.min(3, Math.max(0.5, num(p, 'maxPixelRatio', DEFAULTS.maxPixelRatio))),
    quality: p.get('quality') === 'low' ? 'low' : 'high',
    paused: p.get('paused') === '1',
  };
}
