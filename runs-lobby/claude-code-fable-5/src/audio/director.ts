/**
 * Pure event→sound mapping (no WebAudio here, fully testable in Node).
 * Sample variant selection is seeded so repeats differ per seed but are
 * deterministic for a given seed.
 */
import type { SimEvent } from '../sim/events';
import { mulberry32, randInt, Rng } from '../sim/rng';
import { VO_LINES } from '../sim/timeline';

const VO_BY_LINE = new Map(VO_LINES.map((v) => [v.line, v]));

export interface SoundCommand {
  sample: string;
  /** 0..1 */
  volume: number;
  /** cents-style playback rate multiplier (variation, NOT slow-mo pitch). */
  rate: number;
  category: string;
  /** A10: how far to duck the music under this line, 0..1. */
  duck?: number;
}

const pick = (rng: Rng, base: string, n: number) => `${base}_${randInt(rng, n)}`;

/** A7 casing close-up insert window (matches timeline.SLOWMO). */
export const CASING_INSERT_T0 = 20.55;
export const CASING_INSERT_T1 = 21.98;
/** Spawn time of the single casing the insert camera follows. */
export const CASING_INSERT_BORN0 = 20.78;
export const CASING_INSERT_BORN1 = 20.92;

export class AudioDirector {
  private rng: Rng;
  private lastImpactT = -1;
  private lastCasingT = -1;
  private lastFootT = -1;

  constructor(seed: number) {
    this.rng = mulberry32(seed ^ 0x9e3779b9);
  }

  /** Map one sim event to zero or more sound commands. */
  handle(e: SimEvent): SoundCommand[] {
    const r = this.rng;
    const vary = () => 0.92 + r() * 0.16;
    switch (e.type) {
      case 'SHOT':
        if (e.weapon === 'pistol') {
          return [{ sample: pick(r, 'pistol', 3), volume: 0.75, rate: vary(), category: 'gunshot' }];
        }
        return []; // SMG audio handled per burst
      case 'BURST':
        return [{ sample: pick(r, 'smg', 2), volume: 0.6, rate: vary(), category: 'gunshot' }];
      case 'WAKE_SHOT':
        // passing near-miss: shot + whizzing deflection tail
        return [
          { sample: pick(r, 'smg', 2), volume: 0.5, rate: vary(), category: 'gunshot' },
          { sample: pick(r, 'ricochet', 2), volume: 0.5, rate: 0.9, category: 'ricochet' },
        ];
      case 'IMPACT_MARBLE': {
        if (e.t - this.lastImpactT < 0.09) return [];
        this.lastImpactT = e.t;
        return [{ sample: pick(r, 'marble', 3), volume: 0.5, rate: vary(), category: 'impact' }];
      }
      case 'RICOCHET':
        return [{ sample: pick(r, 'ricochet', 2), volume: 0.45, rate: vary(), category: 'ricochet' }];
      case 'CASING_BOUNCE': {
        // A7: the one casing the insert camera follows gets a clean clink on
        // every visible contact, in the slow motion, at full weight. Other
        // brass keeps the sampled treatment so the beat stays legible.
        const inInsert = e.t >= CASING_INSERT_T0 && e.t <= CASING_INSERT_T1;
        const followed = e.born >= CASING_INSERT_BORN0 && e.born < CASING_INSERT_BORN1;
        if (inInsert && followed) {
          r(); // keep the RNG stream aligned with the sampled path
          return [{ sample: pick(r, 'casing', 3), volume: 0.62, rate: vary(), category: 'casing' }];
        }
        if (r() > 0.32 || e.t - this.lastCasingT < 0.07) return [];
        this.lastCasingT = e.t;
        return [{ sample: pick(r, 'casing', 3), volume: 0.32, rate: vary(), category: 'casing' }];
      }
      case 'GUARD_DOWN':
        // Exactly one stylized hit reaction per downed defender (tested).
        return [{ sample: pick(r, 'grunt_m', 3), volume: 0.65, rate: vary(), category: 'hit-reaction' }];
      case 'STRIKE':
        return [{ sample: pick(r, 'whoosh', 2), volume: 0.7, rate: vary(), category: 'melee' }];
      case 'KICK':
        return [
          { sample: 'grunt_f0', volume: 0.7, rate: vary(), category: 'melee-voice' },
          { sample: pick(r, 'whoosh', 2), volume: 0.7, rate: vary(), category: 'melee' },
        ];
      case 'FOOTSTEP': {
        if (e.t - this.lastFootT < 0.2) return [];
        this.lastFootT = e.t;
        return [{ sample: pick(r, 'footstep', 2), volume: 0.5, rate: vary(), category: 'footstep' }];
      }
      case 'VO': {
        // A10: voice is texture under the music and gunfire, never a radio
        // play. Radio lines sit a little hotter to cut through the band-pass.
        const def = VO_BY_LINE.get(e.line);
        return [{
          sample: e.line,
          volume: def?.radio ? 0.92 : 0.8,
          rate: 1,
          category: 'vo',
          duck: def?.duck ?? 0,
        }];
      }
      case 'BEEP':
        return [{ sample: 'beep', volume: 0.9, rate: 1, category: 'ui' }];
      case 'ALARM':
        return [{ sample: 'alarm', volume: 0.55, rate: 1, category: 'alarm' }];
      case 'COAT':
        return [{ sample: 'coat', volume: 0.8, rate: 1, category: 'foley' }];
      case 'DRAW':
        return [{ sample: 'draw', volume: 0.7, rate: vary(), category: 'foley' }];
      case 'HOLSTER':
        return [{ sample: 'draw', volume: 0.55, rate: 0.85, category: 'foley' }];
      case 'GUN_DROP':
        return [{ sample: pick(r, 'gundrop', 2), volume: 0.65, rate: vary(), category: 'foley' }];
      case 'ELEVATOR':
        return [{ sample: 'elevator', volume: 0.8, rate: 1, category: 'ui' }];
      case 'DEBRIS_SETTLE':
        return [{ sample: pick(r, 'debris', 2), volume: 0.4, rate: vary(), category: 'impact' }];
      default:
        return [];
    }
  }
}
