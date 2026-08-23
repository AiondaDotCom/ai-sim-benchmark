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
  /** B25: world position, for distance attenuation against the lens. */
  pos?: number[];
  /** B27: how far to pull the effects bed down under this cue, 0..1. */
  duckSfx?: number;
  /** cents-style playback rate multiplier (variation, NOT slow-mo pitch). */
  rate: number;
  category: string;
  /** A10: how far to duck the music under this line, 0..1. */
  duck?: number;
}

const pick = (rng: Rng, base: string, n: number) => `${base}_${randInt(rng, n)}`;
/**
 * Same, for asset families whose names carry no separator before the index.
 *
 * The grunts are grunt_m0/1/2, not grunt_m_0/1/2, so pick() has been asking
 * for files that do not exist — which means the hit reaction has been silent
 * for every guard and soldier going down, for the whole run. Nothing caught it
 * because the existing test asserts the CUE is emitted, and a cue naming a
 * missing file is indistinguishable from a working one until you listen.
 */
const pickN = (rng: Rng, base: string, n: number) => `${base}${randInt(rng, n)}`;

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
      // B19: a slab is not a chip. The separation is a short scraping creak,
      // and the landing a deep crash with a shattering tail — clearly distinct
      // from the small chip and gravel sounds, and loud enough to punctuate.
      case 'SLAB_RELEASE':
        return [{ sample: 'slab_creak', volume: 0.5, rate: vary(), category: 'impact' }];
      case 'SLAB_LAND':
        return [{
          sample: e.onRubble ? 'slab_rubble' : pick(r, 'slab_crash', 2),
          volume: 0.95, rate: vary(), category: 'impact',
        }];
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
        return [{ sample: pickN(r, 'grunt_m', 3), volume: 0.65, rate: vary(), category: 'hit-reaction' }];
      case 'STRIKE':
        return [{ sample: pick(r, 'whoosh', 2), volume: 0.7, rate: vary(), category: 'melee' }];
      case 'KICK':
        // the attacker's own effort, on the swing
        return [
          { sample: 'grunt_f0', volume: 0.7, rate: vary(), category: 'melee-voice' },
          { sample: pick(r, 'whoosh', 2), volume: 0.7, rate: vary(), category: 'melee' },
        ];
      // B28: the blow LANDING. Dry and close, no tail beyond what the hall
      // gives it. Seeded per hit so repeated strikes are not identical.
      case 'MELEE_HIT':
        return [{
          sample: pick(r, 'hit_body', 3), volume: 0.85, rate: vary(),
          category: 'melee', pos: e.pos,
        }];
      // ...and the reaction of the one hit, which arrives AFTER it. The
      // grunts already existed but were firing on the swing, so cause and
      // effect landed together and neither read.
      case 'MELEE_REACT':
        return [{
          sample: pickN(r, 'grunt_m', 3), volume: 0.75, rate: vary(),
          category: 'melee-voice', pos: e.pos,
        }];
      case 'FOOTSTEP': {
        if (e.t - this.lastFootT < 0.2) return [];
        this.lastFootT = e.t;
        return [{ sample: pick(r, 'footstep', 2), volume: 0.5, rate: vary(), category: 'footstep' }];
      }
      // B25: combat boots on polished stone during the squad rush.
      case 'BOOT': {
        // seeded per man, so no two soldiers sound identical
        const v = e.who;
        return [{
          sample: e.plant ? 'boot_plant' : `boot_run_${v % 3}`,
          volume: e.plant ? 0.62 : 0.5,
          rate: 0.9 + ((v * 7) % 11) * 0.022,
          category: 'footstep',
          pos: e.pos,
        }];
      }
      case 'GEAR':
        return [{
          sample: 'gear_rattle', volume: 0.3,
          rate: 0.92 + ((e.who * 5) % 9) * 0.02,
          category: 'foley', pos: e.pos,
        }];
      case 'VO': {
        // A10: voice is texture under the music and gunfire, never a radio
        // play. Radio lines sit a little hotter to cut through the band-pass.
        const def = VO_BY_LINE.get(e.line);
        // B27: the shouted command is the beat the standoff hangs on, so it
        // clears the bed under itself and sits above every other line.
        //
        // 1.25 is set against a MEASURED target: in the modelled mix the
        // command has to clear the median of the two seconds before it by at
        // least 6 dB, and at 1.0 it cleared 4.7. The headroom is real rather
        // than guessed — the take is peak-normalised to -1.4 dBFS, so on the
        // voice bus this peaks at 0.95 and does not clip.
        const shout = e.line === 'vo_freeze';
        return [{
          sample: e.line,
          volume: shout ? 1.25 : def?.radio ? 0.92 : 0.8,
          rate: 1,
          category: 'vo',
          duck: def?.duck ?? 0,
          ...(shout ? { duckSfx: 0.72 } : {}),
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
