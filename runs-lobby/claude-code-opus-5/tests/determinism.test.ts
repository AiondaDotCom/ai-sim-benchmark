import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world.ts';
import { run, runFull } from './helpers.ts';

describe('deterministic replay', () => {
  it('produces an identical state hash for the same seed after N steps', () => {
    const a = run(new World({ seed: 1234 }), 12);
    const b = run(new World({ seed: 1234 }), 12);
    expect(a.steps).toBe(b.steps);
    expect(a.hash()).toBe(b.hash());
  });

  it('stays identical across the whole sequence', () => {
    const a = runFull({ seed: 77 });
    const b = runFull({ seed: 77 });
    expect(a.hash()).toBe(b.hash());
    expect(a.stats).toEqual(b.stats);
    expect(a.eventLog!.length).toBe(b.eventLog!.length);
    expect(JSON.stringify(a.eventLog)).toBe(JSON.stringify(b.eventLog));
  });

  it('agrees step by step, not just at the end', () => {
    const a = new World({ seed: 5 });
    const b = new World({ seed: 5 });
    for (let i = 0; i < 900; i++) {
      a.step();
      b.step();
      if (i % 90 === 0) expect(a.hash()).toBe(b.hash());
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('varies the procedural detail with the seed', () => {
    const a = run(new World({ seed: 1 }), 20);
    const b = run(new World({ seed: 2 }), 20);
    expect(a.hash()).not.toBe(b.hash());
  });

  it('keeps the fixed choreography identical whatever the seed', () => {
    const a = runFull({ seed: 11 });
    const b = runFull({ seed: 999 });
    // every defender still goes down, and the protagonists still end up in the lift
    expect(a.stats.downed).toBe(b.stats.downed);
    for (const id of [0, 1]) {
      expect(a.actors[id].pos.z).toBeCloseTo(b.actors[id].pos.z, 6);
      expect(a.actors[id].pos.x).toBeCloseTo(b.actors[id].pos.x, 6);
    }
  });
});
