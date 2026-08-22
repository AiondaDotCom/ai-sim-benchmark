import { describe, expect, it } from 'vitest';
import { runFull } from './helpers.ts';

describe('no friendly fire', () => {
  const w = runFull();

  it('never lets a protagonist round strike the other protagonist', () => {
    expect(w.stats.protagonistHitsOnProtagonist).toBe(0);
  });

  it('never lets any round strike a protagonist at all', () => {
    expect(w.stats.protagonistsHit).toBe(0);
    expect(w.actors[0].alive).toBe(true);
    expect(w.actors[1].alive).toBe(true);
  });

  it('only ever downs guards and soldiers', () => {
    for (const e of w.eventLog!) {
      if (e.k !== 'down') continue;
      const role = w.actors[e.actor].role;
      expect(['guard', 'soldier']).toContain(role);
    }
  });

  it('holds for other seeds too', () => {
    for (const seed of [1, 42, 20250822, 999999]) {
      const s = runFull({ seed });
      expect(s.stats.protagonistHitsOnProtagonist).toBe(0);
      expect(s.stats.protagonistsHit).toBe(0);
    }
  });
});
