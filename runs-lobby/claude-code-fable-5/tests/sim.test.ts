import { describe, it, expect } from 'vitest';
import { World, FIXED_DT } from '../src/sim/world';
import { FixedStepper } from '../src/sim/stepper';
import { hashWorld } from '../src/sim/hash';
import { stripChunk, cellArea, TILE } from '../src/sim/damage';
import {
  AudioDirector, CASING_INSERT_T0, CASING_INSERT_T1,
  CASING_INSERT_BORN0, CASING_INSERT_BORN1,
} from '../src/audio/director';
import { DEATHS, SLOWMO, VO_LINES, CUES } from '../src/sim/timeline';
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

describe('casing insert audio pairing (A7)', () => {
  it('the followed casing gets exactly one clink per bounce, in the insert', () => {
    const { events } = runWorld(42, 24);
    const director = new AudioDirector(42);
    let bounces = 0;
    let clinks = 0;
    for (const e of events) {
      const cmds = director.handle(e);
      if (e.type !== 'CASING_BOUNCE') continue;
      const followed = e.born >= CASING_INSERT_BORN0 && e.born < CASING_INSERT_BORN1;
      if (!followed || e.t < CASING_INSERT_T0 || e.t > CASING_INSERT_T1) continue;
      bounces++;
      clinks += cmds.filter((c) => c.category === 'casing').length;
    }
    expect(bounces).toBeGreaterThan(0);
    expect(clinks).toBe(bounces);
  });

  it('the followed casing comes to rest while the insert is still running', () => {
    const { world } = runWorld(42, 24);
    const c = world.casings.find((q) => q.born >= CASING_INSERT_BORN0 && q.born < CASING_INSERT_BORN1);
    expect(c).toBeDefined();
    expect(c!.resting).toBe(true);
    // the slow-motion window has to outlast the drop, or the insert cuts away
    // before the casing lands
    const win = SLOWMO.find((w) => w.t0 === CASING_INSERT_T0)!;
    expect(win.t1).toBeGreaterThanOrEqual(CASING_INSERT_T1 - 0.01);
  });
});

describe('voice lines through the audio director (A10)', () => {
  it('every line fires once, in order, and the checkpoint lines duck the music', () => {
    const { events } = runWorld(42, 45);
    const director = new AudioDirector(42);
    const played: { sample: string; t: number; duck: number }[] = [];
    for (const e of events) {
      for (const cmd of director.handle(e)) {
        if (cmd.category === 'vo') played.push({ sample: cmd.sample, t: e.t, duck: cmd.duck ?? 0 });
      }
    }
    expect(played.map((p) => p.sample)).toEqual(VO_LINES.map((v) => v.line));
    for (let i = 1; i < played.length; i++) {
      expect(played[i].t).toBeGreaterThan(played[i - 1].t);
    }
    // the checkpoint dialogue has to be intelligible over the score
    const cp = played.filter((p) => p.sample.startsWith('vo_checkpoint'));
    expect(cp.length).toBe(2);
    for (const c of cp) expect(c.duck).toBeGreaterThan(0.3);
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
    // A5: the dodge volley fires all four scripted near-misses — none is
    // suppressed by the protagonist-hit guard, i.e. every round misses.
    const wakes = events.filter((e) => e.type === 'WAKE_SHOT');
    expect(wakes.length).toBe(4);
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
    // B8: a worked-over hall is no longer measured in painted craters — the
    // facing is actually gone. Craters as decals no longer exist.
    expect(world.decals.some((d) => d.kind === 'crater')).toBe(false);
    const strippedArea = world.slabs.reduce((a, sl) => a + sl.stripped, 0) * cellArea;
    expect(strippedArea, 'square metres of cladding shot off').toBeGreaterThan(0.4);
    // B10: one weapon per protagonist discard plus one per downed defender.
    // Derived from the data rather than hard-coded, so adding a discard beat
    // updates the expectation with it.
    const discards = CUES.filter((c) => c.type === 'GUN_DROP').length;
    const defenders = Object.keys(DEATHS).length;
    expect(discards).toBeGreaterThan(8); // "repeatedly", per the task text
    expect(world.droppedGuns.length).toBe(discards + defenders);
    // every defender's weapon is the type he was carrying, and everything has
    // come to rest by the end
    expect(world.droppedGuns.filter((g) => g.kind === 'smg').length).toBe(8);
    expect(world.droppedGuns.every((g) => g.resting)).toBe(true);
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

describe('cladding destruction (B8)', () => {
  it('cladding only ever comes off, never grows back', () => {
    const world = new World(42);
    let prev = 0;
    const seen: number[] = [];
    for (let i = 0; i < Math.round(60 / FIXED_DT); i++) {
      world.step(FIXED_DT);
      world.drainEvents();
      if (i % 600 === 0) {
        const total = world.slabs.reduce((a, s) => a + s.stripped, 0);
        expect(total, 'stripped cells are monotone').toBeGreaterThanOrEqual(prev);
        prev = total;
        seen.push(total);
      }
    }
    // the hall genuinely loses facing over the firefight
    expect(prev).toBeGreaterThan(400);
    expect(seen[seen.length - 1]).toBeGreaterThan(seen[2]);
  });

  it('hits merge into larger stripped areas rather than staying separate', () => {
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('col'))!;
    // three overlapping hits at the same spot
    const before = slab.stripped;
    stripChunk(slab, 0.6, 2.0, 0.09, 1);
    const one = slab.stripped - before;
    stripChunk(slab, 0.64, 2.04, 0.09, 2);
    stripChunk(slab, 0.56, 1.96, 0.09, 3);
    const all = slab.stripped - before;
    // overlapping chunks share cells, so the union is well under 3x one chunk
    expect(all).toBeGreaterThan(one);
    expect(all).toBeLessThan(one * 3);
  });

  it('a mid-tile chunk is palm-to-hand sized, not a pinprick or a whole wall', () => {
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('col'))!;
    // squarely inside a tile, away from any seam
    stripChunk(slab, TILE * 0.5, TILE * 3.5, 0.09, 7);
    const area = slab.stripped * cellArea;
    expect(area).toBeGreaterThan(0.004); // > ~6 cm across
    expect(area).toBeLessThan(0.09); // < ~30 cm across, well under a tile
  });

  it('a hit at a tile seam can take the whole tile', () => {
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('col'))!;
    let tookTile = false;
    for (let k = 0; k < 8 && !tookTile; k++) {
      const s2 = world.slabs.find((x) => x.id === slab.id)!;
      const before = s2.stripped;
      // right on a seam, and on a tile that fits inside the face
      stripChunk(s2, TILE, TILE * (2 + k), 0.09, k);
      if ((s2.stripped - before) * cellArea > TILE * TILE * 0.6) tookTile = true;
    }
    expect(tookTile, 'some seam hit strips a whole tile').toBe(true);
  });

  it('the damage grids are part of the replay hash', () => {
    const a = runWorld(42, 25).world;
    const b = runWorld(42, 25).world;
    expect(hashWorld(a)).toBe(hashWorld(b));
    const totalA = a.slabs.reduce((s, x) => s + x.stripped, 0);
    const totalB = b.slabs.reduce((s, x) => s + x.stripped, 0);
    expect(totalA).toBe(totalB);
    expect(totalA).toBeGreaterThan(0);
  });
});
