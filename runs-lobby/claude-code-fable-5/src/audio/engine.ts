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
  // B19: a whole tile letting go, and coming down
  'slab_creak', 'slab_crash_0', 'slab_crash_1', 'slab_rubble',
  // B25: the squad rush
  'boot_run_0', 'boot_run_1', 'boot_run_2', 'boot_plant', 'gear_rattle',
  // B28: the blow landing, as distinct from the swing
  'hit_body_0', 'hit_body_1', 'hit_body_2',
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
  private voiceGain: GainNode | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private voices: Voice[] = [];
  private director: AudioDirector;
  private timeScale = 1;
  private unlocked = false;
  private musicStartedAtSimT = -1;
  private duckUntil = 0;
  private sfxDuckUntil = 0;

  constructor(seed: number, private volume: number) {
    this.director = new AudioDirector(seed);
  }

  async init(): Promise<void> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    // B27: three buses into a master tap.
    //
    // The shouted command used to be routed to the MUSIC bus so the effects
    // duck would not attenuate it — but the same cue ducks the music by 0.88,
    // so it was routed into the one bus it was itself pulling down 18 dB. That
    // is why it measured flat against the bed in the rendered mix despite the
    // sample being normalised to -1.4 dBFS. Voice now has its own bus that
    // neither duck touches.
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    // no compressor or limiter here on purpose: a master limiter would pull a
    // deliberately loud cue straight back into the bed it is meant to clear
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volume;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.volume * 0.9;
    this.musicGain.connect(this.master);
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = this.volume;
    this.voiceGain.connect(this.master);

    // headless-verification aid (no UI): RMS of the RENDERED mix, so the
    // command's level can be measured where it actually matters rather than
    // in the sample or in the intended gain structure.
    const an = this.analyser;
    const buf = new Float32Array(an.fftSize);
    (window as unknown as { __level: () => number }).__level = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    };

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

  /** B25: where the lens is, for distance attenuation. */
  private listener: [number, number, number] | null = null;

  setListener(x: number, y: number, z: number) {
    this.listener = [x, y, z];
  }

  private distanceGain(pos?: number[]): number {
    if (!pos || !this.listener) return 1;
    const dx = pos[0] - this.listener[0];
    const dy = pos[1] - this.listener[1];
    const dz = pos[2] - this.listener[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // gentle inverse falloff with a floor, so distant men stay present in the
    // clatter rather than vanishing — a squad is heard as a body
    return Math.min(1, 3.2 / Math.max(d, 1.2)) * 0.75 + 0.25;
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
  /**
   * B27: pull EVERYTHING else down under a line, not just the music.
   *
   * The command was mixed at the same level as any other spoken line and
   * competed with the alarm and the last boots landing, so it read as somebody
   * saying the word rather than an order barked across a hall. The line it
   * introduces is the beat the whole standoff hangs on, so for its duration it
   * is the loudest thing in the mix by construction.
   */
  /** Bus for a cue that is ducking the bed: it must not be on a ducked bus. */
  private voiceBus(): AudioNode {
    return this.voiceGain ?? this.sfxGain!;
  }

  private duckSfx(amount: number, realDuration: number) {
    if (!this.ctx || !this.sfxGain) return;
    const g = this.sfxGain.gain;
    const full = this.volume;
    const t = this.ctx.currentTime;
    const until = t + realDuration + 0.2;
    if (until <= this.sfxDuckUntil) return;
    this.sfxDuckUntil = until;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(full * (1 - amount), t, 0.05);
    g.setTargetAtTime(full, until, 0.2);
  }

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
        // B25: a cue that carries a world position is attenuated against the
        // lens, so the squad gets louder as it comes toward camera and the
        // far side of the hall sits back. Cues without a position (music
        // stings, VO, the director's non-diegetic layer) are unaffected.
        gain.gain.value = cmd.volume * this.distanceGain(cmd.pos);
        src.connect(gain);
        gain.connect(cmd.duckSfx ? this.voiceBus() : this.sfxGain);
        src.start();
        const dur = buf.duration / Math.max(this.timeScale, 0.05);
        if (cmd.duck && this.musicGain) this.duckMusic(cmd.duck, dur);
        // B27: a cue can also clear the effects bed under itself. The voice
        // is routed to the MUSIC bus rather than the ducked effects bus, so
        // ducking the bed does not attenuate the line it is clearing space for.
        if (cmd.duckSfx) this.duckSfx(cmd.duckSfx, dur);
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
