/**
 * Configuration via URL query parameters only (no UI, per spec):
 *   ?seed=42        procedural variation (debris, particles, sound variants)
 *   ?timeScale=1    global time-scale multiplier (0.1 = everything 10x slower)
 *   ?volume=0.8     master volume 0..1
 *   ?camShake=1     camera shake intensity multiplier
 *   ?loop=1         restart the scene after the final shot (default on)
 */
export interface Config {
  seed: number;
  timeScale: number;
  volume: number;
  camShake: number;
  loop: boolean;
  /** Start time in scene seconds (fast-forwards the simulation on load). */
  startT: number;
}

export function parseConfig(search: string): Config {
  const p = new URLSearchParams(search);
  const num = (key: string, def: number, lo: number, hi: number) => {
    const raw = p.get(key);
    if (raw === null) return def;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  };
  return {
    seed: Math.floor(num('seed', 42, 0, 2 ** 31)),
    timeScale: num('timeScale', 1, 0.02, 4),
    volume: num('volume', 0.8, 0, 1),
    camShake: num('camShake', 1, 0, 3),
    loop: p.get('loop') !== '0',
    startT: num('t', 0, 0, 59.5),
  };
}
