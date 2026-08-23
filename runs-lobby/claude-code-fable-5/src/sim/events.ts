import type { V3 } from './math3';

/** Discrete events emitted by the simulation; consumed by audio + VFX. */
export type SimEvent =
  | { type: 'SHOT'; t: number; shooter: string; weapon: 'pistol' | 'smg'; pos: V3; dir: V3 }
  | { type: 'BURST'; t: number; shooter: string; pos: V3 }
  | { type: 'IMPACT_MARBLE'; t: number; surface: string; pos: V3; normal: V3 }
  | { type: 'RICOCHET'; t: number; pos: V3 }
  | { type: 'CASING_BOUNCE'; t: number; pos: V3; born: number }
  | { type: 'DEBRIS_SETTLE'; t: number; pos: V3 }
  // B19: a whole tile of cladding separates from the wall, then comes down
  | { type: 'SLAB_RELEASE'; t: number; pos: V3 }
  | { type: 'SLAB_LAND'; t: number; pos: V3; onRubble: boolean }
  | { type: 'GUARD_DOWN'; t: number; id: string; style: 'crumple' | 'slide' | 'drop' | 'knockback' | 'sprawl' }
  | { type: 'WAKE_SHOT'; t: number; pos: V3; dir: V3 } // A5 dodge near-miss with air wake
  | { type: 'FRIENDLY_HIT'; t: number; shooter: string } // must never occur; asserted in tests
  | { type: 'STRIKE'; t: number; actor: string }
  | { type: 'KICK'; t: number; actor: string }
  /**
   * B28: the blow LANDING, as distinct from the swing. Scheduled at the
   * contact frame rather than on the animation cue, because a flying kick
   * launches well before it connects.
   */
  | { type: 'MELEE_HIT'; t: number; actor: string; target: string; pos: V3 }
  /**
   * B28: the reaction of the one who was hit, deliberately offset behind the
   * impact — cause and effect, never the same frame.
   */
  | { type: 'MELEE_REACT'; t: number; target: string; pos: V3 }
  | { type: 'FOOTSTEP'; t: number; actor: string; pos: V3 }
  /**
   * B25: a combat boot on polished stone during the squad rush. Carries the
   * soldier's own index so the sample choice and pitch vary per man — a squad
   * has to sound like many feet out of step, not one loud person.
   * `plant` is the hard stop as he sets into cover.
   */
  | { type: 'BOOT'; t: number; who: number; pos: V3; plant: boolean }
  /** B25: webbing, vest and slung weapon rattling while a man runs. */
  | { type: 'GEAR'; t: number; who: number; pos: V3 }
  | { type: 'BEEP'; t: number }
  // A10: a spoken line; `line` is the asset name under public/assets/vo
  | { type: 'VO'; t: number; line: string }
  | { type: 'ALARM'; t: number }
  | { type: 'COAT'; t: number }
  | { type: 'DRAW'; t: number; actor: string }
  // `by` is the protagonist who discarded it; absent for defender deaths
  | { type: 'GUN_DROP'; t: number; pos: V3; by?: string }
  | { type: 'ELEVATOR'; t: number }
  | { type: 'HOLSTER'; t: number };

export type SimEventType = SimEvent['type'];
