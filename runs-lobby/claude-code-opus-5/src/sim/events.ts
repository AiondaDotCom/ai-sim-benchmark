/** Events the simulation emits for the audio engine and the renderer. */
export type SfxCue =
  | 'pistol'
  | 'smg'
  | 'ricochet'
  | 'marble_chip'
  | 'marble_shatter'
  | 'debris_fall'
  | 'casing'
  | 'casing_shower'
  | 'casing_spin'
  | 'step'
  | 'coat_swish'
  | 'gundrop'
  | 'draw'
  | 'punch'
  | 'kick'
  | 'hit'
  | 'detector_beep'
  | 'alarm'
  | 'door_push'
  | 'elev_ding'
  | 'elev_doors';

export interface SfxEvent {
  k: 'sfx';
  cue: SfxCue;
  x: number;
  y: number;
  z: number;
  gain: number;
  /** Seeded variant selector. */
  variant: number;
  /** Playback rate multiplier applied on top of the time scale. */
  rate: number;
  t: number;
}

export interface DownEvent {
  k: 'down';
  actor: number;
  cause: 'bullet' | 'melee';
  x: number;
  y: number;
  z: number;
  t: number;
}

export interface ShotEvent {
  k: 'shot';
  actor: number;
  hand: 'L' | 'R';
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  t: number;
}

export interface MusicEvent {
  k: 'music';
  section: 'start' | 'drop' | 'outro';
  t: number;
}

export interface AlarmEvent {
  k: 'alarm';
  on: boolean;
  t: number;
}

export type SimEvent = SfxEvent | DownEvent | ShotEvent | MusicEvent | AlarmEvent;
