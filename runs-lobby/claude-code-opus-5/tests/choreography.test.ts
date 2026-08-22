import { describe, expect, it } from 'vitest';
import { BEAT, END_TIME, GUARD0, N_GUARDS, N_SOLDIERS, SOLDIER0 } from '../src/sim/choreography.ts';
import { SIM_DT } from '../src/sim/clock.ts';
import { World } from '../src/sim/world.ts';
import { buildSurfaceDefs, columns, LAYOUT } from '../src/sim/lobby.ts';
import { runFull } from './helpers.ts';

describe('choreography', () => {
  const w = runFull();

  it('takes every defender down before the wind-down beat', () => {
    const standing = w.actors.filter(
      (a) => (a.role === 'guard' || a.role === 'soldier') && a.alive,
    );
    expect(standing.map((a) => a.name)).toEqual([]);
    expect(w.stats.downed).toBe(N_GUARDS + N_SOLDIERS);
    const last = Math.max(...w.actors.filter((a) => !a.alive).map((a) => a.deathT));
    expect(last).toBeLessThan(BEAT.windDown);
  });

  it('never kills a protagonist', () => {
    expect(w.actors[0].alive).toBe(true);
    expect(w.actors[1].alive).toBe(true);
    expect(w.stats.protagonistsHit).toBe(0);
  });

  it('takes the first three guards down in close quarters', () => {
    const melee = w.eventLog!.filter((e) => e.k === 'down' && e.cause === 'melee');
    expect(melee).toHaveLength(3);
    expect(melee.map((e) => (e as { actor: number }).actor).sort()).toEqual([
      GUARD0, GUARD0 + 1, GUARD0 + 2,
    ]);
  });

  it('ends with both protagonists inside the elevator', () => {
    expect(w.time).toBeGreaterThanOrEqual(END_TIME - 0.02);
    for (const id of [0, 1]) {
      expect(w.actors[id].pos.z).toBeGreaterThan(48);
      expect(Math.abs(w.actors[id].pos.x)).toBeLessThan(1);
    }
  });

  it('fires the beep, the alarm and the elevator cues in order', () => {
    const cues = w
      .eventLog!.filter((e) => e.k === 'sfx')
      .filter((e) => ['detector_beep', 'alarm', 'elev_ding'].includes((e as { cue: string }).cue));
    expect(cues.map((c) => (c as { cue: string }).cue)).toEqual([
      'detector_beep',
      'alarm',
      'elev_ding',
    ]);
  });

  it('spawns the reinforcement squad only after the alarm', () => {
    for (let i = 0; i < N_SOLDIERS; i++) {
      expect(w.actors[SOLDIER0 + i].script.spawnT).toBeGreaterThan(BEAT.firstStrike);
    }
  });
});

describe('set geometry', () => {
  it('builds every destructible slab on a right-handed (u, v, n) basis', () => {
    for (const d of buildSurfaceDefs()) {
      const cx = d.u.y * d.v.z - d.u.z * d.v.y;
      const cy = d.u.z * d.v.x - d.u.x * d.v.z;
      const cz = d.u.x * d.v.y - d.u.y * d.v.x;
      expect(cx).toBeCloseTo(d.n.x, 9);
      expect(cy).toBeCloseTo(d.n.y, 9);
      expect(cz).toBeCloseTo(d.n.z, 9);
    }
  });

  it('never walks anybody through a column, at any point in the sequence', () => {
    // sampled every step of the run, not just at the end: a path that clips a
    // column corner mid-move both looks wrong and hides the shot's subject
    const cols = columns();
    const w = new World({ seed: 3 });
    const offenders = new Set<string>();
    for (let i = 0; i < Math.round(END_TIME / SIM_DT); i++) {
      w.step();
      for (const a of w.actors) {
        if (!a.active) continue;
        for (const c of cols) {
          if (
            Math.abs(a.pos.x - c.center.x) < LAYOUT.columnHalf &&
            Math.abs(a.pos.z - c.center.z) < LAYOUT.columnHalf
          ) {
            offenders.add(`${a.name}@t=${w.time.toFixed(1)}`);
          }
        }
      }
    }
    expect([...offenders]).toEqual([]);
  });
});
