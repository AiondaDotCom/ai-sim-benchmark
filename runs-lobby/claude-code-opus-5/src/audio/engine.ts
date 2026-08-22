/** Audio.
 *
 *  Everything is driven by simulation events. Slow motion is a property of the
 *  simulation, so every voice — effects, ambience and the score — is pitched and
 *  stretched by the current time scale rather than being faded or muted, which is
 *  what gives the slow-motion beats their dropped-pitch growl.
 *
 *  Browsers block audio until a user gesture; the visual demo starts immediately
 *  and the context is resumed on the first click or key press. No UI is involved.
 */
import type { SfxEvent, SimEvent } from '../sim/events.ts';
import { AMBIENCE, CUE_GAIN, MUSIC, SFX_FILES } from './manifest.ts';

const MAX_VOICES = 28;

export interface AudioOptions {
  volume: number;
  muted: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private music: AudioBufferSourceNode | null = null;
  private alarm: AudioBufferSourceNode | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private voices = 0;
  private musicPos = 0;
  private started = false;
  private loaded = false;
  private pendingStoryTime = 0;

  constructor(private readonly opts: AudioOptions) {}

  get isRunning(): boolean {
    return this.started && this.ctx?.state === 'running';
  }

  /** Decode every asset. Safe to call before any user gesture. */
  async load(): Promise<void> {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.opts.muted ? 0 : this.opts.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.16;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    const names = new Set<string>();
    for (const list of Object.values(SFX_FILES)) for (const n of list) names.add(n);
    names.add(AMBIENCE);

    const fetchDecode = async (url: string, key: string) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      this.buffers.set(key, await ctx.decodeAudioData(buf));
    };
    await Promise.all([
      ...[...names].map((n) => fetchDecode(`sfx/${n}.mp3`, n)),
      fetchDecode(MUSIC, '__music'),
    ]);
    this.loaded = true;
  }

  /** Called on the first user gesture. */
  async start(storyTime: number): Promise<void> {
    if (!this.ctx || !this.loaded || this.started) return;
    this.started = true;
    await this.ctx.resume();
    this.pendingStoryTime = storyTime;
    this.startMusic(storyTime, 1);
    this.startAmbience();
  }

  private startMusic(offset: number, rate: number): void {
    const ctx = this.ctx;
    const buf = this.buffers.get('__music');
    if (!ctx || !buf || !this.master) return;
    this.music?.stop();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = false;
    src.playbackRate.value = Math.max(0.06, rate);
    const g = ctx.createGain();
    g.gain.value = 0.62;
    src.connect(g).connect(this.master);
    src.start(0, Math.max(0, Math.min(offset, buf.duration - 0.05)));
    this.music = src;
    this.musicPos = offset;
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(AMBIENCE);
    if (!ctx || !buf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    src.connect(g).connect(this.master);
    src.start();
    this.ambience = src;
  }

  /** Per-frame: keep every voice locked to story time. */
  update(storyTime: number, timeScale: number, realDelta: number, cam: { x: number; z: number }): void {
    this.camX = cam.x;
    this.camZ = cam.z;
    if (!this.isRunning) {
      this.pendingStoryTime = storyTime;
      return;
    }
    const rate = Math.max(0.06, timeScale);
    if (this.music) {
      this.music.playbackRate.value = rate;
      this.musicPos += rate * realDelta;
      // the score is authored in story seconds, so any drift is corrected
      if (Math.abs(this.musicPos - storyTime) > 0.28) this.startMusic(storyTime, rate);
    }
    if (this.alarm) this.alarm.playbackRate.value = rate;
    if (this.ambience) this.ambience.playbackRate.value = 0.55 + rate * 0.45;
  }

  /** Restart the score when the demo loops. */
  rewind(): void {
    if (!this.isRunning) return;
    this.stopAlarm();
    this.startMusic(0, 1);
  }

  handle(events: readonly SimEvent[], timeScale: number): void {
    if (!this.isRunning) return;
    for (const e of events) {
      if (e.k === 'sfx') this.playSfx(e, timeScale);
      else if (e.k === 'alarm') (e.on ? this.startAlarm(timeScale) : this.stopAlarm());
    }
  }

  private camX = 0;
  private camZ = 0;

  private playSfx(e: SfxEvent, timeScale: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.voices >= MAX_VOICES) return;
    if (e.cue === 'alarm') return; // handled as a loop
    const list = SFX_FILES[e.cue];
    const buf = this.buffers.get(list[e.variant % list.length]);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.06, timeScale * e.rate);
    const g = ctx.createGain();
    const dx = e.x - this.camX;
    const dz = e.z - this.camZ;
    const dist = Math.hypot(dx, dz);
    g.gain.value = (CUE_GAIN[e.cue] ?? 0.7) * e.gain * (1 / (1 + dist * 0.055));
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.85, Math.min(0.85, dx / Math.max(4, dist)));
    src.connect(g).connect(pan).connect(this.master);
    this.voices++;
    src.onended = () => {
      this.voices--;
    };
    src.start();
  }

  private startAlarm(timeScale: number): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(SFX_FILES.alarm[0]);
    if (!ctx || !buf || !this.master || this.alarm) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = Math.max(0.06, timeScale);
    const g = ctx.createGain();
    g.gain.value = CUE_GAIN.alarm;
    src.connect(g).connect(this.master);
    src.start();
    this.alarm = src;
  }

  private stopAlarm(): void {
    if (!this.alarm) return;
    try {
      this.alarm.stop();
    } catch {
      /* already stopped */
    }
    this.alarm = null;
  }

  get storyTimeAtStart(): number {
    return this.pendingStoryTime;
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = v;
  }
}
