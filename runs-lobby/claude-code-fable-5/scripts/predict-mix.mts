/**
 * B27: predict the level of a cue in the rendered mix.
 *
 * The command measured flat against the bed in the finished audio even though
 * the sample was normalised to -1.4 dBFS, and the cause was a ROUTING error:
 * the cue was sent to the music bus so the effects duck would not touch it,
 * while the same cue ducked that bus by 0.88 — so it was attenuated ~18 dB by
 * its own duck. Nothing in the sample-level or cue-level checks could see that,
 * because both are upstream of the bus graph.
 *
 * This models the graph: bus routing, both duck envelopes, and each cue
 * weighted by its own sample's measured RMS. It is a MODEL, not a capture —
 * it cannot see anything the browser does that the model omits — but it does
 * see the class of fault that was missed, which is the point.
 *
 * Usage: npx tsx scripts/predict-mix.mts
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { World } from '../src/sim/world';
import { AudioDirector } from '../src/audio/director';
import { COMMAND_T } from '../src/sim/timeline';

const VOL = 0.9;                 // engine default volume
const MUSIC_BUS = VOL * 0.9;
const SFX_BUS = VOL;
const VOICE_BUS = VOL;

function samplePath(n: string): string | null {
  for (const d of ['public/assets/sfx', 'public/assets/vo']) {
    if (existsSync(`${d}/${n}.mp3`)) return `${d}/${n}.mp3`;
  }
  return null;
}
/**
 * Per-40 ms RMS envelope of a sample, decoded for real.
 *
 * A file-average RMS is the wrong statistic here and using it was my second
 * modelling error: the command peaks 12.5 dB above its own average, so
 * averaging it over a file that is half tail made it look quiet against dense
 * cues like boots. The measurement this is predicting is a per-40 ms window of
 * the rendered mix, so the model has to sum real envelopes, not one number
 * per sample.
 */
const STEP = 0.04;
const envCache = new Map<string, number[]>();
function envelope(n: string): number[] {
  const cached = envCache.get(n);
  if (cached) return cached;
  const p = samplePath(n);
  if (!p) throw new Error(`sample not found: ${n}`);
  const SR = 22050;
  const raw = execSync(`ffmpeg -v error -i "${p}" -ac 1 -ar ${SR} -f s16le -`,
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  const n16 = raw.length >> 1;
  const win = Math.round(SR * STEP);
  const out: number[] = [];
  for (let i = 0; i < n16; i += win) {
    let sum = 0;
    let c = 0;
    for (let j = i; j < Math.min(i + win, n16); j++) {
      const v = raw.readInt16LE(j * 2) / 32768;
      sum += v * v;
      c++;
    }
    out.push(c ? Math.sqrt(sum / c) : 0);
  }
  envCache.set(n, out);
  return out;
}

// --- collect the cue stream ------------------------------------------------
interface Fired { t: number; sample: string; vol: number; duck: number; duckSfx: number; pos?: number[] }
const w = new World(42);
const d = new AudioDirector(42);
const fired: Fired[] = [];
while (w.t < 21) {
  w.step();
  for (const e of w.drainEvents()) {
    for (const c of d.handle(e)) {
      const x = c as unknown as { duck?: number; duckSfx?: number; pos?: number[] };
      fired.push({ t: w.t, sample: c.sample, vol: c.volume,
                   duck: x.duck ?? 0, duckSfx: x.duckSfx ?? 0, pos: x.pos });
    }
  }
}

// --- duck envelopes --------------------------------------------------------
const durOf = (n: string) => envelope(n).length * STEP;
const sfxDucks = fired.filter(f => f.duckSfx > 0).map(f => ({ t: f.t, a: f.duckSfx, d: durOf(f.sample) + 0.2 }));
const duckAt = (list: { t: number; a: number; d: number }[], t: number) => {
  let m = 1;
  for (const k of list) if (t >= k.t && t <= k.t + k.d) m = Math.min(m, 1 - k.a);
  return m;
};

// LEGACY=1 models the pre-1f77652 graph, where the voice was routed to the
// music bus that its own cue ducked by 0.88 — so the prediction can be checked
// against a recording of that build rather than only against the fixed one.
const LEGACY = process.env.LEGACY === '1';
// --- per-40 ms energy ------------------------------------------------------
const T0 = COMMAND_T - 2.2, T1 = COMMAND_T + 1.4;
// precompute per-cue constants: spawning ffprobe inside the bin loop made
// this take minutes
const prepped = fired.map(f => ({ ...f, env: envelope(f.sample), isVoice: f.duckSfx > 0 }));
const bins: { t: number; db: number }[] = [];
for (let t = T0; t < T1; t += STEP) {
  let energy = 0;
  for (const f of prepped) {
    const k = Math.floor((t - f.t) / STEP);
    if (k < 0 || k >= f.env.length) continue;
    const bus = f.isVoice ? (LEGACY ? MUSIC_BUS : VOICE_BUS) : SFX_BUS;
    const busDuck = f.isVoice
      ? (LEGACY ? 1 - f.duck : 1)
      : duckAt(sfxDucks, t);
    const g = f.vol * bus * busDuck;
    energy += Math.pow(g * f.env[k], 2);
  }
  bins.push({ t: +t.toFixed(2), db: 10 * Math.log10(energy + 1e-12) });
}

// LEGACY=1 models the pre-1f77652 graph, where the voice was routed to the
// music bus that its own cue ducked by 0.88 — so the prediction can be checked
// against a recording of that build rather than only against the fixed one.
const cmd = fired.find(f => f.sample === 'vo_freeze')!;
const cmdBins = bins.filter(b => b.t >= cmd.t && b.t <= cmd.t + durOf('vo_freeze'));
const cmdPeak = Math.max(...cmdBins.map(b => b.db));
const before = bins.filter(b => b.t < cmd.t && b.t >= cmd.t - 2.0).map(b => b.db).sort((a, b) => a - b);
const median = before[before.length >> 1];

console.log(`command at t=${cmd.t.toFixed(2)}  cue gain ${cmd.vol}  ducks music ${cmd.duck} / sfx ${cmd.duckSfx}`);
console.log(`predicted command peak      ${cmdPeak.toFixed(1)} dB`);
console.log(`predicted median, prior 2 s ${median.toFixed(1)} dB`);
console.log(`headroom over the bed       ${(cmdPeak - median).toFixed(1)} dB   (target >= 6.0)`);
// what is competing with it, which an acoustic envelope cannot show
const peakBin = cmdBins.reduce((a, b) => (b.db > a.db ? b : a));
const contrib: { sample: string; db: number }[] = [];
for (const f of prepped) {
  const k = Math.floor((peakBin.t - f.t) / STEP);
  if (k < 0 || k >= f.env.length) continue;
  const bus = f.isVoice ? (LEGACY ? MUSIC_BUS : VOICE_BUS) : SFX_BUS;
  const busDuck = f.isVoice ? (LEGACY ? 1 - f.duck : 1) : duckAt(sfxDucks, peakBin.t);
  const lin = f.vol * bus * busDuck * f.env[k];
  if (lin > 1e-5) contrib.push({ sample: f.sample, db: 20 * Math.log10(lin) });
}
contrib.sort((a, b) => b.db - a.db);
console.log();
console.log(`what is sounding at the command's loudest bin (t=${peakBin.t.toFixed(2)}):`);
for (const c of contrib.slice(0, 6)) console.log(`  ${c.sample.padEnd(16)} ${c.db.toFixed(1)} dB`);

console.log();
console.log('envelope around the command (40 ms bins):');
for (const b of bins.filter(b => b.t >= cmd.t - 0.6 && b.t <= cmd.t + 0.8)) {
  const mark = b.t >= cmd.t && b.t <= cmd.t + 0.4 ? '  <- command' : '';
  console.log(`  ${b.t.toFixed(2)}  ${b.db.toFixed(1).padStart(6)}${mark}`);
}
