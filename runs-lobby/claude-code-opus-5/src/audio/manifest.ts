/** Every sound in the demo, generated with the ElevenLabs sound-generation API
 *  and checked into `assets/sfx`. Several variants per category; the simulation
 *  picks one with its seeded RNG so repeats are not noticeable. */
import type { SfxCue } from '../sim/events.ts';

export const SFX_FILES: Record<SfxCue, string[]> = {
  pistol: ['pistol_a', 'pistol_b', 'pistol_c'],
  smg: ['smg_a', 'smg_b', 'smg_c'],
  ricochet: ['ricochet_a', 'ricochet_b', 'ricochet_c'],
  marble_chip: ['marble_chip_a', 'marble_chip_b', 'marble_chip_c'],
  marble_shatter: ['marble_shatter_a', 'marble_shatter_b'],
  debris_fall: ['debris_fall_a', 'debris_fall_b'],
  casing: ['casing_a', 'casing_b', 'casing_c'],
  casing_shower: ['casing_d'],
  casing_spin: ['casing_spin'],
  step: ['step_a', 'step_b', 'step_c'],
  coat_swish: ['coat_swish_a', 'coat_swish_b'],
  gundrop: ['gundrop_a', 'gundrop_b'],
  draw: ['draw_a', 'draw_b'],
  punch: ['punch_a', 'punch_b'],
  kick: ['kick_a'],
  hit: ['hit_a', 'hit_b', 'hit_c', 'hit_d'],
  detector_beep: ['detector_beep'],
  alarm: ['alarm_loop'],
  door_push: ['door_push'],
  elev_ding: ['elev_ding'],
  elev_doors: ['elev_doors'],
};

export const AMBIENCE = 'hall_tone';
export const MUSIC = 'music/score.mp3';

/** Per-category mixing, so gunfire sits above the marble and the score. */
export const CUE_GAIN: Record<SfxCue, number> = {
  pistol: 0.95,
  smg: 0.6,
  ricochet: 0.5,
  marble_chip: 0.55,
  marble_shatter: 0.8,
  debris_fall: 0.5,
  casing: 0.75,
  casing_shower: 0.7,
  casing_spin: 0.9,
  step: 0.7,
  coat_swish: 0.5,
  gundrop: 0.8,
  draw: 0.6,
  punch: 1.0,
  kick: 1.0,
  hit: 0.85,
  detector_beep: 1.0,
  alarm: 0.42,
  door_push: 0.7,
  elev_ding: 0.9,
  elev_doors: 0.8,
};
