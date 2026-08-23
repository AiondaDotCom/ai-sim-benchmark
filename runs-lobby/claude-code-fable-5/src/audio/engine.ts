/**
 * WebAudio backend. Applies the current time scale as playbackRate to every
 * voice (slow motion pitches audio down, film-style) and keeps the music
 * aligned with simulation time: both advance at timeScale × real time, so
 * the drop stays locked to the outbreak of the shootout.
 *
 * Autoplay: we try to start immediately; if the browser blocks it, the first
 * click/keypress unlocks audio and the music starts at the current sim time
 * offset (explicitly allowed by the spec; no UI involved).
 */
import { AudioDirector } from './director';
import { VO_LINES } from '../sim/timeline';
import type { SimEvent } from '../sim/events';

const SFX_NAMES = [
  'pistol_0', 'pistol_1', 'pistol_2', 'smg_0', 'smg_1',
  'ricochet_0', 'ricochet_1', 'marble_0', 'marble_1', 'marble_2',
  'casing_0', 'casing_1', 'casing_2', 'debris_0', 'debris_1',
  'footstep_0', 'footstep_1', 'beep', 'alarm',
  'grunt_m0', 'grunt_m1', 'grunt_m2', 'grunt_f0',
  'gundrop_0', 'gundrop_1', 'whoosh_0', 'whoosh_1',
  'elevator', 'coat', 'draw',
];

interface Voice {
  src: AudioBufferSourceNode;
  baseRate: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private musicBuffer: AudioBuffer | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voices: Voice[] = [];
  private director: AudioDirector;
  private timeScale = 1;
  private unlocked = false;
  private musicStartedAtSimT = -1;
  private duckUntil = 0;

  constructor(seed: number, private volume: number) {
    this.director = new AudioDirector(seed);
  }

  async init(): Promise<void> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volume;
    this.sfxGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.volume * 0.9;
    this.musicGain.connect(this.ctx.destination);

    const load = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        return await this.ctx!.decodeAudioData(arr);
      } catch {
        return null;
      }
    };
    const base = import.meta.env.BASE_URL;
    await Promise.all([
      ...SFX_NAMES.map(async (n) => {
        const b = await load(`${base}assets/sfx/${n}.mp3`);
        if (b) this.buffers.set(n, b);
      }),
      // A10: spoken lines live alongside the effects and go through the same
      // voice path, so they pitch and stretch with the time scale like
      // everything else.
      ...VO_LINES.map(async (v) => {
        const b = await load(`${base}assets/vo/${v.line}.mp3`);
        if (b) this.buffers.set(v.line, b);
      }),
      (async () => {
        this.musicBuffer = await load(`${base}assets/music/music.mp3`);
      })(),
    ]);

    const unlock = () => this.tryUnlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    void this.tryUnlock();
  }

  private async tryUnlock(): Promise<void> {
    if (!this.ctx || this.unlocked) return;
    try {
      await this.ctx.resume();
      if (this.ctx.state === 'running') {
        this.unlocked = true;
        if (this.musicStartedAtSimT >= 0) this.startMusic(this.musicStartedAtSimT);
      }
    } catch {
      /* blocked until gesture */
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** (Re)start the music aligned to the given simulation time. */
  startMusic(simT: number) {
    this.musicStartedAtSimT = simT;
    if (!this.ctx || !this.unlocked || !this.musicBuffer || !this.musicGain) return;
    if (this.musicSrc) {
      try { this.musicSrc.stop(); } catch { /* already stopped */ }
      this.musicSrc.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.playbackRate.value = this.timeScale;
    src.connect(this.musicGain);
    src.start(0, Math.min(Math.max(simT, 0), this.musicBuffer.duration - 0.05));
    this.musicSrc = src;
  }

  /** Called every frame with the current effective time scale. */
  setTimeScale(scale: number) {
    if (Math.abs(scale - this.timeScale) < 1e-4) return;
    this.timeScale = scale;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.musicSrc) this.musicSrc.playbackRate.setTargetAtTime(scale, t, 0.05);
    for (const v of this.voices) {
      v.src.playbackRate.setTargetAtTime(v.baseRate * scale, t, 0.03);
    }
  }

  /**
   * A10: pull the music down under a spoken line and let it back up when the
   * line ends, so the checkpoint dialogue is intelligible without muting the
   * score. Duration is in real seconds, so a line inside a slow-motion window
   * keeps the music down for as long as the stretched line actually lasts.
   */
  private duckMusic(amount: number, realDuration: number) {
    if (!this.ctx || !this.musicGain) return;
    const g = this.musicGain.gain;
    const full = this.volume * 0.9;
    const t = this.ctx.currentTime;
    const until = t + realDuration + 0.35;
    if (until <= this.duckUntil) return;
    this.duckUntil = until;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(full * (1 - amount), t, 0.09);
    g.setTargetAtTime(full, until, 0.28);
  }

  /** Feed simulation events; plays the mapped samples. */
  handleEvents(events: SimEvent[]) {
    if (!this.ctx || !this.unlocked || !this.sfxGain) {
      for (const e of events) this.director.handle(e); // keep RNG stream advancing
      return;
    }
    for (const e of events) {
      for (const cmd of this.director.handle(e)) {
        const buf = this.buffers.get(cmd.sample);
        if (!buf) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = cmd.rate * this.timeScale;
        const gain = this.ctx.createGain();
        gain.gain.value = cmd.volume;
        src.connect(gain);
        gain.connect(this.sfxGain);
        src.start();
        if (cmd.duck && this.musicGain) this.duckMusic(cmd.duck, buf.duration / Math.max(this.timeScale, 0.05));
        const voice: Voice = { src, baseRate: cmd.rate };
        this.voices.push(voice);
        src.onended = () => {
          const i = this.voices.indexOf(voice);
          if (i >= 0) this.voices.splice(i, 1);
        };
      }
    }
  }
}
