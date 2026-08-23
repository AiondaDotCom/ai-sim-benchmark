import { describe, it, expect } from 'vitest';
import { World, FIXED_DT } from '../src/sim/world';
import { FixedStepper } from '../src/sim/stepper';
import { hashWorld } from '../src/sim/hash';
import { AudioDirector } from '../src/audio/director';
import { DEATHS } from '../src/sim/timeline';
import type { SimEvent } from '../src/sim/events';

function runWorld(seed: number, seconds: number, onStep?: (w: World) => void): { world: World; events: SimEvent[] } {
  const world = new World(seed);
  const events: SimEvent[] = [];
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    world.step(FIXED_DT);
    events.push(...world.drainEvents());
    onStep?.(world);
  }
  return { world, events };
}

describe('deterministic replay', () => {
  it('identical seed ⇒ identical state hash after N steps', () => {
    const a = runWorld(42, 25).world;
    const b = runWorld(42, 25).world;
    expect(a.casings.length).toBeGreaterThan(50);
    expect(a.decals.length).toBeGreaterThan(20);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('different seed ⇒ different state hash', () => {
    const a = runWorld(42, 20).world;
    const b = runWorld(1337, 20).world;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('time-scale correctness', () => {
  it('at 0.1× the simulation advances exactly 1/10 as far per real second', () => {
    // choreographed slow-mo disabled so only the config scale applies
    const full = new FixedStepper(new World(7), 1.0, false);
    const slow = new FixedStepper(new World(7), 0.1, false);
    for (let i = 0; i < 60; i++) {
      full.advance(1 / 60);
      slow.advance(1 / 60);
    }
    expect(full.world.t).toBeGreaterThan(0.9);
    expect(Math.abs(slow.world.t - full.world.t * 0.1)).toBeLessThanOrEqual(FIXED_DT + 1e-9);
  });

  it('slow motion never changes the step size, only the step count', () => {
    const slow = new FixedStepper(new World(7), 0.25, false);
    let steps = 0;
    for (let i = 0; i < 4; i++) steps += slow.advance(0.25);
    expect(steps).toBe(Math.floor((0.25 * 0.25) / FIXED_DT) * 4);
  });
});

describe('hit-event / audio pairing', () => {
  it('every guard-down event triggers exactly one hit-reaction sound', () => {
    const { events } = runWorld(42, 41);
    const downs = events.filter((e) => e.type === 'GUARD_DOWN');
    expect(downs.length).toBe(Object.keys(DEATHS).length); // all 11 defenders
    const director = new AudioDirector(42);
    let reactions = 0;
    for (const e of events) {
      for (const cmd of director.handle(e)) {
        if (cmd.category === 'hit-reaction') reactions++;
      }
    }
    expect(reactions).toBe(downs.length);
  });
});

describe('no friendly fire', () => {
  it("the protagonists' shots never hit each other over the whole scene", () => {
    const { events } = runWorld(42, 60);
    const friendly = events.filter((e) => e.type === 'FRIENDLY_HIT');
    expect(friendly).toHaveLength(0);
    const protagonistShots = events.filter(
      (e) => e.type === 'SHOT' && (e.shooter === 'neo' || e.shooter === 'trin'),
    );
    expect(protagonistShots.length).toBeGreaterThan(50);
  });

  it('holds for other seeds too', () => {
    for (const seed of [1, 99, 20260823]) {
      const { events } = runWorld(seed, 41);
      expect(events.filter((e) => e.type === 'FRIENDLY_HIT')).toHaveLength(0);
    }
  });
});

describe('destruction persistence', () => {
  it('the damage map never reverts and debris count grows monotonically', () => {
    let lastDecals = 0;
    let lastDebris = 0;
    let lastCasings = 0;
    const firstDecalSnapshot: { size: number; pos: number[] }[] = [];
    const { world } = runWorld(42, 41, (w) => {
      expect(w.decals.length).toBeGreaterThanOrEqual(lastDecals);
      expect(w.debris.length).toBeGreaterThanOrEqual(lastDebris);
      expect(w.casings.length).toBeGreaterThanOrEqual(lastCasings);
      lastDecals = w.decals.length;
      lastDebris = w.debris.length;
      lastCasings = w.casings.length;
      if (firstDecalSnapshot.length === 0 && w.decals.length > 0) {
        firstDecalSnapshot.push({ size: w.decals[0].size, pos: [...w.decals[0].pos] });
      }
    });
    // early decals are still there, unchanged, at the end
    expect(world.decals[0].size).toBe(firstDecalSnapshot[0].size);
    expect(world.decals[0].pos).toEqual(firstDecalSnapshot[0].pos);
    // a wrecked lobby: hundreds of casings, plenty of debris and craters
    expect(world.casings.length).toBeGreaterThan(200);
    expect(world.debris.length).toBeGreaterThan(400);
    expect(world.decals.filter((d) => d.kind === 'crater').length).toBeGreaterThan(5);
    expect(world.droppedGuns.length).toBe(3);
  });
});

describe('choreography sanity', () => {
  it('all defenders are down by t=40 and the pair survives', () => {
    const { world } = runWorld(42, 40.5);
    for (const id of Object.keys(DEATHS)) {
      expect(world.actors.get(id)!.alive).toBe(false);
    }
    expect(world.actors.get('neo')!.alive).toBe(true);
    expect(world.actors.get('trin')!.alive).toBe(true);
  });
});
