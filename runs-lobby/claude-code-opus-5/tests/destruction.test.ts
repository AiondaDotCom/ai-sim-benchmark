import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/sim/clock.ts';
import { END_TIME } from '../src/sim/choreography.ts';
import { World } from '../src/sim/world.ts';

describe('destruction persists', () => {
  it('never lets the damage map or the debris count go backwards', () => {
    const w = new World({ seed: 4 });
    let damage = 0;
    let debris = 0;
    let casings = 0;
    const n = Math.round(END_TIME / SIM_DT);
    for (let i = 0; i < n; i++) {
      w.step();
      expect(w.damage.totalDamage).toBeGreaterThanOrEqual(damage);
      expect(w.debris.count).toBeGreaterThanOrEqual(debris);
      expect(w.casings.count).toBeGreaterThanOrEqual(casings);
      damage = w.damage.totalDamage;
      debris = w.debris.count;
      casings = w.casings.count;
    }
    expect(damage).toBeGreaterThan(0);
    expect(debris).toBeGreaterThan(500);
    expect(casings).toBeGreaterThan(400);
  });

  it('never heals a single texel of a slab', () => {
    const w = new World({ seed: 6 });
    const snapshots: Uint8Array[] = w.damage.veneer.map((v) => v.slice());
    const n = Math.round(END_TIME / SIM_DT);
    for (let i = 0; i < n; i++) {
      w.step();
      if (i % 600 !== 0) continue;
      for (let s = 0; s < w.damage.veneer.length; s++) {
        const cur = w.damage.veneer[s];
        const old = snapshots[s];
        for (let k = 0; k < cur.length; k += 17) expect(cur[k]).toBeGreaterThanOrEqual(old[k]);
        snapshots[s] = cur.slice();
      }
    }
  });

  it('strips the marble veneer down to the substrate somewhere', () => {
    const w = new World({ seed: 8 });
    for (let i = 0; i < Math.round(END_TIME / SIM_DT); i++) w.step();
    let stripped = 0;
    let touchedSlabs = 0;
    for (const v of w.damage.veneer) {
      let any = false;
      for (const x of v) {
        if (x > 200) stripped++;
        if (x > 0) any = true;
      }
      if (any) touchedSlabs++;
    }
    expect(stripped).toBeGreaterThan(2000);
    expect(touchedSlabs).toBeGreaterThan(6);
  });

  it('leaves everything lying on the floor at the end', () => {
    const w = new World({ seed: 9 });
    for (let i = 0; i < Math.round(END_TIME / SIM_DT); i++) w.step();
    let resting = 0;
    for (let i = 0; i < w.casings.count; i++) if (w.casings.resting[i]) resting++;
    expect(resting).toBeGreaterThan(w.casings.count * 0.85);
    expect(w.debris.count).toBe(w.debris.spawnRequests);
  });
});
