import { describe, expect, it } from 'vitest';
import { runFull } from './helpers.ts';

describe('hit events and audio', () => {
  const w = runFull();
  const log = w.eventLog!;

  it('plays exactly one hit reaction for every man down', () => {
    const downs = log.filter((e) => e.k === 'down');
    const hits = log.filter((e) => e.k === 'sfx' && e.cue === 'hit');
    expect(downs.length).toBeGreaterThan(0);
    expect(hits).toHaveLength(downs.length);
    expect(w.stats.hitSfx).toBe(w.stats.downed);
  });

  it('pairs them one to one, in order, at the same moment', () => {
    const pairs: { down: number; hit: number }[] = [];
    for (let i = 0; i < log.length; i++) {
      if (log[i].k !== 'down') continue;
      // the hit reaction is emitted by the same kill(), immediately after
      const next = log[i + 1];
      expect(next?.k).toBe('sfx');
      expect((next as { cue: string }).cue).toBe('hit');
      pairs.push({ down: log[i].t, hit: next.t });
    }
    expect(pairs).toHaveLength(w.stats.downed);
    for (const p of pairs) expect(p.hit).toBe(p.down);
  });

  it('never plays a hit reaction without a man going down', () => {
    let open = 0;
    for (const e of log) {
      if (e.k === 'down') open++;
      else if (e.k === 'sfx' && e.cue === 'hit') {
        open--;
        expect(open).toBe(0);
      }
    }
    expect(open).toBe(0);
  });

  it('emits one shot event and one casing per round fired', () => {
    const shots = log.filter((e) => e.k === 'shot').length;
    expect(shots).toBe(w.stats.shotsFired);
    expect(w.stats.casingsSpawned).toBe(w.stats.shotsFired);
  });

  it('fires the music cues in dramaturgical order', () => {
    const music = log.filter((e) => e.k === 'music');
    expect(music.map((m) => (m as { section: string }).section)).toEqual(['start', 'drop', 'outro']);
  });
});
