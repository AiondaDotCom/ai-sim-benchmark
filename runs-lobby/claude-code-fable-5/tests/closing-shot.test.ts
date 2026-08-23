/**
 * B26 / B31: the closing gag is readable, and the shot that holds on it does
 * not move.
 *
 * B26 fixed a legibility problem by drifting the lens in onto the gag column
 * over 1.5 s. It worked as measurement (the falling slab went from 1.9% of the
 * frame width to 5.8%) and failed as filmmaking: a camera that moves in on a
 * column just before something happens there announces the joke, and the move
 * was in fact still running when the tile let go — the gag is at realT 1.8 and
 * the drift ended at 1.85.
 *
 * B31 moved the legibility into the FRAMING instead: the shot now opens on the
 * composition the drift used to arrive at, and holds. That is only safe as
 * long as nobody reintroduces motion into the beat to solve some later note,
 * so this asserts the shot is constant over its whole span.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildShots } from '../src/render/camera';
import type { World } from '../src/sim/world';

/** The closing hold takes no state from the world — it is fixed geometry. */
function ctxAt(realT: number) {
  return {
    world: {} as World,
    simT: 53.6 + realT,
    realT,
    neo: new THREE.Vector3(),
    trin: new THREE.Vector3(),
    shake: 0,
  };
}

describe('the closing hold (B31)', () => {
  const shots = buildShots();
  const closing = shots[shots.length - 1];

  it('is the last shot, and it is the one the gag happens in', () => {
    // TILE_GAG fires at 55.4 and this shot starts at 53.6, so the tile lets go
    // 1.8 s into it — well inside the hold, with the fall and the shatter
    // after that.
    expect(closing.t0).toBeLessThan(55.4);
    expect(closing.id).toBe('17');
  });

  it('does not move: same eye and same aim from the first frame to the last', () => {
    const eye = new THREE.Vector3();
    const look = new THREE.Vector3();
    let first: [THREE.Vector3, THREE.Vector3] | null = null;
    const moved: string[] = [];
    // across the whole hold, sampled far more finely than the 1.5 s move that
    // was removed — a drift of even a centimetre would show here
    for (let realT = 0; realT <= 9; realT += 0.05) {
      closing.update(ctxAt(realT), eye, look);
      if (!first) { first = [eye.clone(), look.clone()]; continue; }
      const de = eye.distanceTo(first[0]);
      const dl = look.distanceTo(first[1]);
      if (de > 1e-9 || dl > 1e-9) {
        moved.push(`realT=${realT.toFixed(2)}: eye moved ${de.toFixed(4)} m, aim moved ${dl.toFixed(4)} m`);
      }
    }
    expect(moved.slice(0, 5), `the closing hold drifts:\n  ${moved.slice(0, 5).join('\n  ')}`)
      .toEqual([]);
  });
});
