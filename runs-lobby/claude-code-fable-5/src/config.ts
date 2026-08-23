/**
 * Configuration via URL query parameters only (no UI, per spec):
 *   ?seed=42        procedural variation (debris, particles, sound variants)
 *   ?timeScale=1    global time-scale multiplier (0.1 = everything 10x slower)
 *   ?volume=0.8     master volume 0..1
 *   ?camShake=1     camera shake intensity multiplier
 *   ?loop=1         restart the scene after the final shot (default on)
 *   ?quality=low    disable SSAO and motion blur in the post stack (A9)
 *   ?cam=x,y,z,lx,ly,lz
 *                   dev-only camera override, for framing a verification shot
 *                   the cut list does not contain (A12)
 *   ?hot=1          dev diagnostic: show pre-grade HDR luminance / 8 as
 *                   greyscale, to locate an over-bright surface (B11)
 *   ?dev=char       look-dev turntable for one character (A11); see
 *                   render/devchar.ts for who/view/pose/silhouette/spin
 *   ?freeze=1       hold a single frame at ?t= — the simulation does not
 *                   advance and the camera's real-time terms are pinned, so
 *                   screenshots are exactly reproducible (verification aid)
 */
export interface Config {
  seed: number;
  timeScale: number;
  volume: number;
  camShake: number;
  loop: boolean;
  /** Hold one reproducible frame at startT (verification aid, no UI). */
  freeze: boolean;
  /** 'low' disables the heavier post-processing passes. */
  quality: string;
  /** Dev-only render mode ('char' = character look-dev turntable). */
  dev: string;
  devWho: string;
  devView: string;
  devPose: string;
  devSilhouette: boolean;
  devSpin: number | null;
  /** Dev camera override: [eye, look] in world space, or null. */
  devCam: number[] | null;
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
    freeze: p.get('freeze') === '1',
    quality: p.get('quality') ?? 'high',
    dev: p.get('dev') ?? '',
    devWho: p.get('who') ?? 'man',
    devView: p.get('view') ?? 'three-quarter',
    devPose: p.get('pose') ?? 'idle',
    devSilhouette: p.get('silhouette') === '1',
    devSpin: p.get('spin') === null ? null : Number(p.get('spin')),
    devCam: (() => {
      const raw = p.get('cam');
      if (!raw) return null;
      const v = raw.split(',').map(Number);
      return v.length === 6 && v.every(Number.isFinite) ? v : null;
    })(),
    startT: num('t', 0, 0, 59.5),
  };
}
