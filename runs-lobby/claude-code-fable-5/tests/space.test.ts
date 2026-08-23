/**
 * B29 / B30: a body occupies real space — it stands on the floor, not in it,
 * and it is never in the same place as the set.
 *
 * Both defects had the same shape: something was true of the FINAL pose, so
 * the checks that existed only looked at the final pose, and the failure lived
 * everywhere else. Bodies were up to 0.54 m below the marble because the fall
 * poses rotate about an origin that sits at floor level for a STANDING figure;
 * defenders were up to 0.84 m inside a column because the run to cover is a
 * straight line from the door and several of those lines pass through the very
 * columns they are running to hide behind. The bullet-cam target was the
 * visible symptom of the second one — half inside his column at the exact
 * frame the camera is closest to him.
 *
 * So these are scene-wide invariants over the whole run, not spot checks.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Character } from '../src/render/characters';
import type { CharKind } from '../src/render/characters';
import type { Mats } from '../src/render/materials';
import { World } from '../src/sim/world';
import type { ActorSim } from '../src/sim/world';
import { isClearOfSet, bodyRadiusFor, bodyBlockers, HALL } from '../src/sim/layout';

/** Mats is a type-only import in characters.ts, so a stub is enough. */
function stubMats(): Mats {
  const t = new THREE.Texture();
  return new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key === 'textures') return new Proxy({}, { get: () => t });
      if (!(key in target)) target[key] = new THREE.MeshStandardMaterial({ name: key });
      return target[key];
    },
  }) as unknown as Mats;
}

const KIND_OF = (a: ActorSim): CharKind =>
  a.id === 'neo' ? 'neo' : a.id === 'trin' ? 'trin' : a.role === 'guard' ? 'guard' : 'soldier';

const _box = new THREE.Box3();
const _tmp = new THREE.Box3();
function subtree(o: THREE.Object3D | undefined, into: Set<THREE.Object3D>) {
  if (o) o.traverse((c) => into.add(c));
}
/**
 * `trunk` measures hips, torso and head only — the part of a body the sim
 * reserves space for. The limbs are excluded on purpose: a kicking leg reaches
 * 1.07 m from the spine and a man braced on a column puts his hands and his
 * weapon past its face, and neither is a defect. `full` keeps the limbs (a
 * hand sunk into the marble is a defect) but still drops the weapons, since a
 * rifle is rigidly held and levelling a body on its barrel floats the body.
 */
function boxOf(c: Character, scope: 'trunk' | 'full'): THREE.Box3 {
  const skip = new Set<THREE.Object3D>();
  subtree(c.rig.gunL, skip);
  subtree(c.rig.gunR, skip);
  if (scope === 'trunk') {
    subtree(c.rig.armL, skip);
    subtree(c.rig.armR, skip);
    subtree(c.rig.legL, skip);
    subtree(c.rig.legR, skip);
  }
  c.rig.root.updateMatrixWorld(true);
  _box.makeEmpty();
  c.rig.root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || skip.has(o)) return;
    _tmp.setFromObject(o);
    _box.union(_tmp);
  });
  return _box;
}

/** The whole sequence, with a character rig driven off every actor. */
function runScene() {
  const w = new World(42);
  const mats = stubMats();
  const scene = new THREE.Group();
  const chars = new Map<string, Character>();
  for (const a of w.actors.values()) chars.set(a.id, new Character(KIND_OF(a), mats, scene));
  return { w, chars };
}

describe('bodies occupy real space (B29, B30)', () => {
  it('the clearance radius the sim reserves really does contain a body', () => {
    // Everything below leans on a 2D proxy: the sim keeps a defender's CENTRE
    // at least BODY_R from the set. That is only a volume guarantee if BODY_R
    // actually covers the widest that body gets, so measure it rather than
    // trusting the constant — if someone broadens the shoulders later, this
    // fails before the clearance quietly stops covering them. Defender kinds
    // and defender actions only: the protagonists are exempt from the
    // clearance because their choreography touches the set on purpose.
    const mats = stubMats();
    const scene = new THREE.Group();
    const over: string[] = [];
    for (const kind of ['guard', 'soldier'] as CharKind[]) {
      const c = new Character(kind, mats, scene);
      for (const action of ['idle', 'walk', 'run', 'cover', 'aim', 'fire', 'strike']) {
        const reserved = bodyRadiusFor(action);
        for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
          const actor = {
            id: 'x', role: 'soldier', alive: true, aim: [0, 1.4, -1],
            pose: { pos: [0, 0, 0], yaw: 0, phase, speed: 2, action },
          } as unknown as ActorSim;
          c.update(actor, 10 + phase);
          const b = boxOf(c, 'trunk');
          const reach = Math.max(
            Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z),
          );
          if (reach > reserved) {
            over.push(`${kind}/${action}@${phase}: trunk reaches ${reach.toFixed(3)} m, `
              + `sim reserves ${reserved.toFixed(2)} m`);
          }
        }
      }
    }
    expect(over, `poses that outgrow their reserved space:\n  ${over.join('\n  ')}`).toEqual([]);
  });

  it('every solid thing at shin height is reserved in the clearance set', async () => {
    // The check above is only as good as the boxes it is given, and those were
    // written by hand from the layout constants while the renderer built its
    // own geometry from the same constants PLUS its own trim. They disagreed:
    // a column's plinth is COLUMN.size + 0.24 across, the clearance reserved
    // COLUMN.size, and the 0.12 m lip is where the bullet-cam target's shins
    // ended up — at the exact height that camera sits at. So compare the
    // clearance against the geometry the renderer actually emits, and let the
    // next piece of trim that outgrows its blocker fail here instead.
    // The set builds a couple of canvas textures, which is all it wants the
    // DOM for; the geometry itself is pure three.
    const ctx = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'canvas') return { width: 4, height: 4 };
        return (...args: unknown[]) => {
          if (k === 'getImageData') return { data: new Uint8ClampedArray(64), width: 4, height: 4 };
          if (k === 'createLinearGradient' || k === 'createRadialGradient') {
            return { addColorStop: () => {} };
          }
          if (k === 'measureText') return { width: (String(args[0] ?? '')).length * 4 };
          return undefined;
        };
      },
      set: () => true,
    });
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({ width: 4, height: 4, getContext: () => ctx }),
    };
    const { Lobby } = await import('../src/render/lobby');
    const lobby = new Lobby(stubMats());
    const blockers = bodyBlockers();

    // Scope: where a body can actually get to. Derived from the run rather
    // than hand-drawn, so it tracks the choreography — the elevator and
    // entrance trim sit behind the end walls and no character ever reaches
    // them, and a test that demanded clearance around those would be noise.
    const w = new World(42);
    let rx0 = Infinity, rx1 = -Infinity, rz0 = Infinity, rz1 = -Infinity;
    while (w.t < 62) {
      w.step();
      w.drainEvents();
      for (const a of w.actors.values()) {
        if (a.pose.action === 'hidden') continue;
        rx0 = Math.min(rx0, a.pose.pos[0]); rx1 = Math.max(rx1, a.pose.pos[0]);
        rz0 = Math.min(rz0, a.pose.pos[2]); rz1 = Math.max(rz1, a.pose.pos[2]);
      }
    }
    const pad = 0.45;
    rx0 -= pad; rx1 += pad; rz0 -= pad; rz1 += pad;
    const b = new THREE.Box3();
    const uncovered: string[] = [];
    lobby.group.updateMatrixWorld(true);
    lobby.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      b.setFromObject(m);
      // Only things a standing body could walk into: they must sit on the
      // floor and rise far enough to matter. Wall panels and the ceiling are
      // out of scope — a body never leaves the hall's interior.
      if (b.min.y > 0.05 || b.max.y < 0.12) return;
      const bw = b.max.x - b.min.x;
      const bd = b.max.z - b.min.z;
      if (bw > 6 || bd > 6) return; // the floor slab and the hall shell
      if (b.max.x < rx0 || b.min.x > rx1 || b.max.z < rz0 || b.min.z > rz1) return;
      // The doorways at either end of the hall: elevator leaves, their frames
      // and call plates, and the entrance doors. They are set into the end
      // walls and characters walk THROUGH them by design — the leaves open.
      // A clearance check has nothing useful to say about a door.
      if (Math.abs((b.min.z + b.max.z) / 2) > HALL.halfLength - 1.2) return;
      const covered = blockers.some((k) => b.min.x >= k.min[0] - 1e-6 && b.max.x <= k.max[0] + 1e-6
        && b.min.z >= k.min[1] - 1e-6 && b.max.z <= k.max[1] + 1e-6);
      if (!covered) {
        uncovered.push(`${bw.toFixed(2)}x${bd.toFixed(2)} at `
          + `(${((b.min.x + b.max.x) / 2).toFixed(2)}, ${((b.min.z + b.max.z) / 2).toFixed(2)}) `
          + `rising to y=${b.max.y.toFixed(2)}`);
      }
    });
    expect(uncovered, `set geometry a body could stand inside:\n  ${uncovered.join('\n  ')}`)
      .toEqual([]);
  });

  it('no defender is inside the set at any frame of the whole run', () => {
    const w = new World(42);
    const bad: string[] = [];
    while (w.t < 62) {
      w.step();
      w.drainEvents();
      for (const a of w.actors.values()) {
        if (a.role === 'protag' || a.pose.action === 'hidden') continue;
        if (!isClearOfSet(a.pose.pos[0], a.pose.pos[2])) {
          bad.push(`${a.id} ${a.pose.action} t=${w.t.toFixed(2)} `
            + `(${a.pose.pos[0].toFixed(2)}, ${a.pose.pos[2].toFixed(2)})`);
        }
      }
      if (bad.length > 6) break;
    }
    expect(bad, `defenders inside the set:\n  ${bad.slice(0, 6).join('\n  ')}`).toEqual([]);
  });

  it('every settled body rests on the floor — not sunk into it, not hovering', () => {
    const { w, chars } = runScene();
    while (w.t < 62) { w.step(); w.drainEvents(); }
    const sunk: string[] = [];
    const floating: string[] = [];
    let settled = 0;
    for (const a of w.actors.values()) {
      const c = chars.get(a.id)!;
      c.update(a, w.t);
      if (!a.pose.action.startsWith('fall_')) continue;
      settled++;
      const low = boxOf(c, 'full').min.y;
      // 1 cm either way: below is a body inside the marble, above is a body
      // lying on air. Both are visible at floor level, which is where the
      // wreckage pan puts the camera.
      if (low < -0.01) sunk.push(`${a.id} ${a.pose.action} at ${low.toFixed(3)}`);
      if (low > 0.01) floating.push(`${a.id} ${a.pose.action} at ${low.toFixed(3)}`);
    }
    expect(settled, 'the run should end with a hall full of casualties').toBeGreaterThan(12);
    expect(sunk, `bodies below the floor:\n  ${sunk.join('\n  ')}`).toEqual([]);
    expect(floating, `bodies hovering above the floor:\n  ${floating.join('\n  ')}`).toEqual([]);
  });

  it('the bullet-cam target is clear of his column for the whole beat', () => {
    // B30 as it was reported: at the moment of the hit the camera is a metre
    // from him, and he was standing half inside the stone.
    const w = new World(42);
    let worst = -Infinity;
    let worstT = 0;
    while (w.t < 43) {
      w.step();
      w.drainEvents();
      if (w.t < 38 || w.t > 42) continue;
      const s = w.actors.get('s7')!;
      if (!isClearOfSet(s.pose.pos[0], s.pose.pos[2])) { worst = 1; worstT = w.t; break; }
    }
    expect(worst, `s7 inside his column at t=${worstT.toFixed(2)}`).toBeLessThan(0);
  });
});
