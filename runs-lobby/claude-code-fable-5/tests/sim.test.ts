import { bodyBlockers } from '../src/sim/layout';
import { SOLDIERS, STANDOFF } from '../src/sim/timeline';
import { fitPatch, CLAD_DEPTH, LUMP_AMP, CORE_DEPTH } from '../src/render/cladding';
import { describe, it, expect } from 'vitest';
import { World, FIXED_DT } from '../src/sim/world';
import { FixedStepper } from '../src/sim/stepper';
import { hashWorld } from '../src/sim/hash';
import { stripChunk, cellArea, cellSize, TILE, isStripped, localOf, STRIP } from '../src/sim/damage';
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
    // derived from the roster rather than hardcoded: A15 doubled the squad and
    // this assertion said 8, which is exactly the kind of expectation that
    // should follow the death list instead of being written out by hand
    expect(world.droppedGuns.filter((g) => g.kind === 'smg').length).toBe(SOLDIERS.length);
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

  it('one round scars the polish; the second takes the chunk', () => {
    // B16/B20 accumulation model: a round ADDS damage, and the facing only
    // lets go once the accumulated damage crosses the threshold. This is what
    // makes a facing mark reachable at all — before it, every hit stripped its
    // own cell and a spall crater in polished stone could never be seen.
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('col'))!;
    stripChunk(slab, TILE * 0.5, TILE * 3.5, 0.09, 7);
    expect(slab.stripped, 'a single hit must not take the facing off').toBe(0);
    // ...but it did mark the stone
    expect(slab.cells.some((c) => c > 0)).toBe(true);
  });

  it('a mid-tile chunk is palm-to-hand sized, not a pinprick or a whole wall', () => {
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('col'))!;
    // squarely inside a tile, away from any seam; twice, because one hit only
    // scars it now (see the accumulation test above)
    stripChunk(slab, TILE * 0.5, TILE * 3.5, 0.09, 7);
    stripChunk(slab, TILE * 0.5, TILE * 3.5, 0.09, 7);
    const area = slab.stripped * cellArea;
    expect(area).toBeGreaterThan(0.004); // > ~6 cm across
    // B13 widened this ceiling from 0.09. The fracture plates were enlarged
    // and their merge probability raised to answer "far too little damage",
    // so one hit now takes ~0.11 m2 (~33 cm across) rather than under 30 cm.
    // The bound still has to sit well under a whole tile (TILE^2 = 0.384 m2),
    // which is what separates a chunk from the seam case tested below.
    expect(area).toBeLessThan(0.16); // < ~40 cm across, well under a tile
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

/**
 * B13 supplement. The operator's complaint was specific: "every chunk is an
 * axis-aligned rectangle". These lock in the two properties that fixed it —
 * the outline meanders rather than following the cell grid, and the mark the
 * round leaves behind is a pock rather than a palm-sized painted crater.
 */
describe('wound shape (B13)', () => {
  it('a chunk outline is not an axis-aligned rectangle', () => {
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('col'))!;
    stripChunk(slab, TILE * 0.5, TILE * 3.5, 0.09, 7);

    // bounding box of the stripped cells
    let minI = 1e9, maxI = -1e9, minJ = 1e9, maxJ = -1e9;
    for (let j = 0; j < slab.h; j++) {
      for (let i = 0; i < slab.w; i++) {
        if (!slab.cells[j * slab.w + i]) continue;
        if (i < minI) minI = i;
        if (i > maxI) maxI = i;
        if (j < minJ) minJ = j;
        if (j > maxJ) maxJ = j;
      }
    }
    const boxCells = (maxI - minI + 1) * (maxJ - minJ + 1);

    // per-row extents: a rectangle has one identical span on every row
    const lefts: number[] = [];
    const rights: number[] = [];
    for (let j = minJ; j <= maxJ; j++) {
      let l = -1, r = -1;
      for (let i = minI; i <= maxI; i++) {
        if (!slab.cells[j * slab.w + i]) continue;
        if (l < 0) l = i;
        r = i;
      }
      if (l >= 0) { lefts.push(l); rights.push(r); }
    }
    // total vertical movement of both side edges. An axis-aligned rectangle
    // has identical left and right indices on every row and therefore scores
    // exactly 0 here, so any positive score is boundary that steps in and out.
    // (Measured for this chunk: 15. Peak row width 10 cells against a minimum
    // of 2, and both top corners and the whole bottom-right corner cut away
    // diagonally.)
    const steps = (a: number[]) =>
      a.slice(1).reduce((acc, v, k) => acc + Math.abs(v - a[k]), 0);
    const widths = lefts.map((l, k) => rights[k] - l + 1);

    // it fills well under its own bounding box...
    expect(slab.stripped / boxCells).toBeLessThan(0.82);
    // ...its rows are not all the same span...
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(5);
    // ...and the outline steps in and out rather than running straight
    expect(steps(lefts) + steps(rights)).toBeGreaterThan(8);
  });

  it('a round leaves a pock, not a palm-sized painted crater', () => {
    const world = new World(42);
    // A15 moved the first exchange later, so this has to run past the break
    for (let i = 0; i < 8000 && world.decals.length < 12; i++) world.step();
    expect(world.decals.length).toBeGreaterThan(0);
    for (const d of world.decals) {
      // the cladding chunk is genuinely gone (stripChunk), so all that is
      // painted on is the pit the round itself punched: a few centimetres
      // the crater branch tops out at rand(0.3, 0.48) * 0.2 = 0.096 m, so this
      // is the real design ceiling; the previous 0.08 passed by luck of the
      // rng stream rather than by construction
      expect(d.size).toBeLessThan(0.1);
      expect(d.size).toBeGreaterThan(0.01);
    }
  });
});

/**
 * B17. Damage removes material, so a shot column can only ever become
 * narrower or notched — never thicker. The operator saw the pale core standing
 * proud of the granite at a chewed corner: each face's core plane is recessed
 * by CLAD_DEPTH behind its OWN cladding, so two perpendicular patches that
 * each ran to their full face width crossed past one another at the arris and
 * grew a flange outside the column's outline.
 *
 * The invariant is asserted over every destructible face after a full run,
 * so no future change can reintroduce an outward bulge.
 */
describe('damage only ever cuts inward (B17)', () => {
  it('no core patch extends past its own face, on any face, after a full run', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }

    let checked = 0;
    for (const s of world.slabs) {
      if (s.maxI < 0) continue; // never damaged
      checked++;
      const { u0, u1, v0, v1 } = fitPatch(s, cellSize);
      // inside the face on both axes...
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v0).toBeGreaterThanOrEqual(0);
      expect(u1).toBeLessThanOrEqual(s.uSize);
      expect(v1).toBeLessThanOrEqual(s.vSize);
      // ...and clear of the arris by the full recess depth, so a perpendicular
      // face's patch cannot be crossed
      expect(u0).toBeGreaterThanOrEqual(CLAD_DEPTH - 1e-9);
      expect(v0).toBeGreaterThanOrEqual(CLAD_DEPTH - 1e-9);
      expect(u1).toBeLessThanOrEqual(s.uSize - CLAD_DEPTH + 1e-9);
      expect(v1).toBeLessThanOrEqual(s.vSize - CLAD_DEPTH + 1e-9);
      // a patch is never inside-out
      expect(u1).toBeGreaterThan(u0);
      expect(v1).toBeGreaterThan(v0);
    }
    // the run must actually have damaged something, or this proves nothing
    expect(checked).toBeGreaterThan(8);
  });

  it('the core is recessed behind the cladding plane, never in front of it', () => {
    // The core plane is offset CLAD_DEPTH behind its face and the shader may
    // only push it further in: the displacement term is clamped at 0, so the
    // signed lump can never lift it out through the cladding whatever the
    // constants become.
    expect(CLAD_DEPTH).toBeGreaterThan(0);
    // the lumpy relief is signed, so its raised half must stay strictly
    // shallower than the cavity it sits in on every surface class
    for (const d of Object.values(CORE_DEPTH)) {
      expect(d * 1.35).toBeGreaterThan(LUMP_AMP);
    }
  });
});

/**
 * B16/B20. Two mark types, and nothing that describes the facing may survive
 * where the facing is gone.
 */
describe('impact marks belong to a layer (B16/B20)', () => {
  it('records both kinds, and core marks always sit on exposed core', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    const facing = world.decals.filter((d) => d.layer === 'facing');
    const core = world.decals.filter((d) => d.layer === 'core');
    // a spall crater in polished stone has to be reachable at all — before
    // this every hit stripped its own cell, so every mark was a core mark
    expect(facing.length).toBeGreaterThan(10);
    expect(core.length).toBeGreaterThan(facing.length);

    for (const d of core) {
      const s = world.slabs.find((x) => x.id === d.slab);
      if (!s) continue;
      const [lu, lv] = localOf(s, d.pos);
      expect(isStripped(s, lu, lv)).toBe(true);
    }
  });

  it('some facing marks are later swallowed by a wound, and are clipped there', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    // Decals are never removed (the persistence contract), so the renderer has
    // to clip them against the live damage grid instead. This asserts the case
    // actually occurs in a real run — otherwise the clipping path would be
    // dead code and the invariant untested.
    let swallowed = 0;
    for (const d of world.decals) {
      if (d.layer !== 'facing') continue;
      const s = world.slabs.find((x) => x.id === d.slab);
      if (!s) continue;
      const [lu, lv] = localOf(s, d.pos);
      if (isStripped(s, lu, lv)) swallowed++;
    }
    expect(swallowed).toBeGreaterThan(0);
  });
});

/**
 * B18: every round that bites stone is an ejection event, and the pool that
 * carries it never silently saturates.
 */
describe('impact ejection (B18)', () => {
  it('throws a dense cone in three size classes, and never runs out of pool', () => {
    const world = new World(42);
    let impacts = 0;
    while (world.t < 60) {
      world.step();
      for (const e of world.drainEvents()) if (e.type === 'IMPACT_MARBLE') impacts++;
    }
    const byCls = [0, 0, 0];
    for (const d of world.debris) byCls[d.cls]++;

    expect(impacts).toBeGreaterThan(200);
    // all three classes are actually used, with grit carrying the density
    expect(byCls[0]).toBeGreaterThan(byCls[1]);
    expect(byCls[1]).toBeGreaterThan(0);
    expect(byCls[2]).toBeGreaterThan(0);
    // a single round throws real material, not a few specks
    expect(world.debris.length / impacts).toBeGreaterThan(18);

    // The cap policy exists, but a silently saturated pool would make the
    // effect weakest exactly when it should be strongest. Assert it is never
    // reached in a full run rather than trusting that it is not.
    expect(world.debrisDropped).toBe(0);
  });

  it('nothing that has come to rest is ever recycled away', () => {
    const world = new World(42);
    while (world.t < 45) { world.step(); world.drainEvents(); }
    const restingBefore = world.debris.filter((d) => d.resting).length;
    const snapshot = world.debris.filter((d) => d.resting).map((d) => d.pos.join(','));
    while (world.t < 60) { world.step(); world.drainEvents(); }
    const after = new Set(world.debris.filter((d) => d.resting).map((d) => d.pos.join(',')));
    expect(restingBefore).toBeGreaterThan(500);
    for (const p of snapshot) expect(after.has(p)).toBe(true);
  });
});

/**
 * B19 + A13: whole tiles let go, fall and shatter — and one last one gives way
 * on its own after everyone has gone.
 */
describe('tile detachment (B19) and the closing gag (A13)', () => {
  it('a handful of slabs come off over the fight, not a rain of them', () => {
    const world = new World(42);
    const released: number[] = [];
    let landed = 0;
    while (world.t < 60) {
      world.step();
      for (const e of world.drainEvents()) {
        if (e.type === 'SLAB_RELEASE') released.push(world.t);
        if (e.type === 'SLAB_LAND') landed++;
      }
    }
    // punctuation, not texture: a threshold alone cannot bound this, since
    // under sustained fire nearly every tile erodes past any level
    expect(released.length).toBeGreaterThanOrEqual(5);
    expect(released.length).toBeLessThanOrEqual(20);
    // every one of them comes down
    expect(landed).toBe(released.length);
    // and they are spread across the fight rather than clumped
    const during = released.filter((t) => t < 45);
    expect(during[during.length - 1] - during[0]).toBeGreaterThan(12);
  });

  it('a landing slab breaks into pieces that are clearly bigger than chips', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    // slab wreckage is an order of magnitude larger than the grit
    const big = world.debris.filter((d) => d.size >= 0.12);
    expect(big.length).toBeGreaterThan(100);
    // and it comes to rest and stays, like everything else
    expect(big.every((d) => d.resting)).toBe(true);
  });

  it('one last tile lets go after everyone has gone, into silence', () => {
    const world = new World(42);
    const late: { type: string; t: number }[] = [];
    while (world.t < 60) {
      world.step();
      for (const e of world.drainEvents()) {
        if (world.t > 50 && (e.type === 'SLAB_RELEASE' || e.type === 'SLAB_LAND' || e.type === 'SHOT')) {
          late.push({ type: e.type, t: world.t });
        }
      }
    }
    const rel = late.filter((e) => e.type === 'SLAB_RELEASE');
    const land = late.filter((e) => e.type === 'SLAB_LAND');
    expect(rel.length).toBe(1);
    expect(land.length).toBe(1);
    // it separates, then falls for long enough to be seen going
    expect(land[0].t - rel[0].t).toBeGreaterThan(0.3);
    // nothing else is happening: the sound has to be clean and unmasked
    expect(late.filter((e) => e.type === 'SHOT')).toHaveLength(0);
  });
});

/**
 * B25: the squad has to sound like many men, not one loud person, and the
 * clatter has to stop dead as they set into cover — the sudden absence is what
 * makes the A15 standoff land.
 */
describe('squad boot foley (B25)', () => {
  it('every man steps on his own stride, plants once, and none of it runs into the standoff', () => {
    const world = new World(42);
    const perMan = new Map<number, number[]>();
    let plants = 0;
    let gear = 0;
    let duringStandoff = 0;
    while (world.t < 60) {
      world.step();
      for (const e of world.drainEvents()) {
        if (e.type === 'BOOT') {
          const a = perMan.get(e.who) ?? [];
          a.push(world.t);
          perMan.set(e.who, a);
          if (e.plant) plants++;
          if (world.t >= STANDOFF[0] && world.t <= STANDOFF[1]) duringStandoff++;
        }
        if (e.type === 'GEAR') gear++;
      }
    }
    // every man is heard, and each on his own cycle rather than a shared loop:
    // the step counts differ because the stride length is seeded per man
    expect(perMan.size).toBe(SOLDIERS.length);
    const counts = [...perMan.values()].map((v) => v.length);
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
    // one hard plant per man as he sets into cover
    expect(plants).toBe(SOLDIERS.length);
    expect(gear).toBeGreaterThan(40);
    // and the held beat is silent
    expect(duringStandoff).toBe(0);
  });
});

/**
 * The destruction end state is a deliverable in its own right, so it gets a
 * test rather than a note. Splitting the mark types (B16/B20) and doubling the
 * squad (A15) both had the potential to quietly reduce how wrecked the hall
 * ends up, and "verify the strip percentages after the change" is exactly the
 * kind of check that is easy to skip and expensive to lose.
 *
 * Measured over the band fire can actually reach. A column face is 7 m tall
 * and nothing is fired above about 3 m, so a whole-face percentage is capped
 * near 43% by geometry and says more about the height of the column than about
 * how destroyed it looks.
 */
describe('destruction end state', () => {
  it('the worst-hit faces are stripped bare across the band under fire', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }

    const jMax = Math.ceil(3.0 / cellSize);
    const band = world.slabs.map((s) => {
      const hi = Math.min(s.h, jMax);
      let gone = 0, total = 0;
      for (let j = 0; j < hi; j++) {
        for (let i = 0; i < s.w; i++) {
          total++;
          if (s.cells[j * s.w + i] >= STRIP) gone++;
        }
      }
      return total ? (gone / total) * 100 : 0;
    }).sort((a, b) => b - a);

    // the columns the fight is fought around lose most of their facing
    expect(band[0]).toBeGreaterThan(55);
    expect(band[2]).toBeGreaterThan(50);
    // ...while the hall keeps its contrast: plenty of faces barely touched
    expect(band.filter((p) => p < 5).length).toBeGreaterThan(8);
  });

  it('both mark types are present in quantity, not just reachable in principle', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    const facing = world.decals.filter((d) => d.layer === 'facing').length;
    const core = world.decals.length - facing;
    // a spall scar on polished stone has to be a look you actually see, not a
    // code path that fires four times in a minute
    expect(facing).toBeGreaterThan(40);
    expect(core).toBeGreaterThan(facing);
  });
});

/**
 * B28: the melee reads as cause and effect, and bodies stop at the set.
 */
describe('the strike beat (B28)', () => {
  it('every blow lands, and the reaction always follows the impact', () => {
    const world = new World(42);
    const log: { t: number; type: string }[] = [];
    while (world.t < 16) {
      world.step();
      for (const e of world.drainEvents()) {
        if (['STRIKE', 'KICK', 'MELEE_HIT', 'MELEE_REACT'].includes(e.type)) {
          log.push({ t: world.t, type: e.type });
        }
      }
    }
    const swings = log.filter((e) => e.type === 'STRIKE' || e.type === 'KICK');
    const hits = log.filter((e) => e.type === 'MELEE_HIT');
    const reacts = log.filter((e) => e.type === 'MELEE_REACT');
    expect(swings.length).toBeGreaterThan(3);
    // the beat was silent on contact: every swing that reaches someone must
    // produce an impact, and the flying kick must be one of them — judging its
    // range at launch rather than at contact left it connecting with nobody
    expect(hits.length).toBe(swings.length);
    expect(reacts.length).toBe(hits.length);

    // cause and effect: never the same frame, and always in that order
    for (let i = 0; i < hits.length; i++) {
      const gap = reacts[i].t - hits[i].t;
      expect(gap, `reaction ${i} follows its impact`).toBeGreaterThan(0.05);
      expect(gap, `reaction ${i} follows closely`).toBeLessThan(0.25);
    }
    const sameFrame = hits.some((h) => reacts.some((r) => Math.abs(r.t - h.t) < 1e-6));
    expect(sameFrame).toBe(false);
  });

  it('no body comes to rest inside the set', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    const blockers = bodyBlockers();
    for (const a of world.actors.values()) {
      if (a.alive) continue;
      const [x, , z] = a.pose.pos;
      for (const b of blockers) {
        const inside = x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1];
        expect(inside, `${a.id} rests inside set geometry at ${x.toFixed(2)},${z.toFixed(2)}`).toBe(false);
      }
    }
  });
});

/**
 * B29: a pose may not assume support that is not there.
 *
 * `slide` describes a man sliding down a vertical surface and ending seated
 * against it. Applied with nothing behind him it renders as sitting bolt
 * upright in open floor, which is what all five slide-style defenders were
 * doing — their cover positions sit diagonally off the column corner by
 * design, so they were never in contact in the first place.
 */
describe('death poses match what is behind the body (B29)', () => {
  it('a body only slides if it ends against a surface, and lies down otherwise', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    const blockers = bodyBlockers();
    const distToBlocker = (x: number, z: number) => {
      let best = Infinity;
      for (const b of blockers) {
        const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
        const dz = Math.max(b.min[1] - z, 0, z - b.max[1]);
        best = Math.min(best, Math.hypot(dx, dz));
      }
      return best;
    };

    let slides = 0;
    let open = 0;
    for (const a of world.actors.values()) {
      if (a.alive) continue;
      const style = a.pose.action.replace('fall_', '');
      const d = distToBlocker(a.pose.pos[0], a.pose.pos[2]);
      if (style === 'slide') {
        slides++;
        // in contact: a body radius from the face, not parked near it
        expect(d, `${a.id} slides but is ${d.toFixed(2)} m from any surface`)
          .toBeLessThanOrEqual(0.30);
      } else if (d > 0.30) {
        open++;
        // nothing in the open may use a pose that needs something behind it
        expect(['crumple', 'drop', 'sprawl'], `${a.id} in the open uses ${style}`)
          .toContain(style);
      }
    }
    // the case has to actually occur, or this proves nothing
    expect(slides).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(5);
  });

  it('all three open-floor poses are used, so a hall of casualties is not two shapes', () => {
    const world = new World(42);
    while (world.t < 60) { world.step(); world.drainEvents(); }
    const used = new Set<string>();
    for (const a of world.actors.values()) {
      if (!a.alive) used.add(a.pose.action.replace('fall_', ''));
    }
    for (const s of ['crumple', 'drop', 'sprawl']) {
      expect(used, `${s} is used somewhere`).toContain(s);
    }
  });
});
