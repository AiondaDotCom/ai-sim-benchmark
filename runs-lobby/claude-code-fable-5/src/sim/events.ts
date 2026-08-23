import type { V3 } from './math3';

/** Discrete events emitted by the simulation; consumed by audio + VFX. */
export type SimEvent =
  | { type: 'SHOT'; t: number; shooter: string; weapon: 'pistol' | 'smg'; pos: V3; dir: V3 }
  | { type: 'BURST'; t: number; shooter: string; pos: V3 }
  | { type: 'IMPACT_MARBLE'; t: number; surface: string; pos: V3; normal: V3 }
  | { type: 'RICOCHET'; t: number; pos: V3 }
  | { type: 'CASING_BOUNCE'; t: number; pos: V3 }
  | { type: 'DEBRIS_SETTLE'; t: number; pos: V3 }
  | { type: 'GUARD_DOWN'; t: number; id: string; style: 'crumple' | 'slide' | 'drop' }
  | { type: 'BLOOD'; t: number; pos: V3 } // brief stylized impact spray (A4)
  | { type: 'WAKE_SHOT'; t: number; pos: V3; dir: V3 } // A5 dodge near-miss with air wake
  | { type: 'FRIENDLY_HIT'; t: number; shooter: string } // must never occur; asserted in tests
  | { type: 'STRIKE'; t: number; actor: string }
  | { type: 'KICK'; t: number; actor: string }
  | { type: 'FOOTSTEP'; t: number; actor: string; pos: V3 }
  | { type: 'BEEP'; t: number }
  | { type: 'ALARM'; t: number }
  | { type: 'COAT'; t: number }
  | { type: 'DRAW'; t: number; actor: string }
  | { type: 'GUN_DROP'; t: number; pos: V3 }
  | { type: 'ELEVATOR'; t: number }
  | { type: 'HOLSTER'; t: number };

export type SimEventType = SimEvent['type'];
