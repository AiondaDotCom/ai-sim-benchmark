/**
 * B22: the hands hold their weapons the right way round.
 *
 * This is the second orientation bug in this subsystem (B6 was the first), and
 * both times looking at screenshots missed it for several rounds. So it is a
 * measurement, run over every armed frame of the whole sequence, for both
 * hands and all four character types — the same treatment barrel alignment got.
 *
 * The hand's local frame: fingers extend along -Y and curl toward +Z, so the
 * palm faces +Z, the fist forms a tube along X and the thumb sits at -side*X.
 * The defect was that BOTH hands used the same weapon rotation, and that
 * rotation put the grip's long axis along hand -Z — out through the back of
 * the hand. The palm faced away from the grip, which reads as a hand rotated
 * half a turn about the wrist.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  Character, seatWeapon, clampTwist, PALM_NORMAL, GRIP_SEAT,
} from '../src/render/characters';
import type { CharKind } from '../src/render/characters';
import type { Mats } from '../src/render/materials';
import type { ActorSim } from '../src/sim/world';

/** Mats is a type-only import in characters.ts, so a plain stub is enough. */
function stubMats(): Mats {
  const m = () => new THREE.MeshStandardMaterial();
  const t = new THREE.Texture();
  return new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key === 'textures') {
        return new Proxy({}, { get: () => t });
      }
      if (!(key in target)) target[key] = m();
      return target[key];
    },
  }) as unknown as Mats;
}

const KINDS: CharKind[] = ['neo', 'trin', 'guard', 'soldier'];

function actorAt(kind: CharKind, aim: [number, number, number], action: string): ActorSim {
  return {
    id: kind === 'neo' ? 'neo' : kind === 'trin' ? 'trin' : 'x',
    role: kind === 'guard' ? 'guard' : kind === 'soldier' ? 'soldier' : 'protag',
    alive: true,
    aim,
    pose: { pos: [0, 0, 0], yaw: 0, phase: 1, speed: 0, action },
  } as unknown as ActorSim;
}

describe('weapons are held palm-to-grip (B22)', () => {
  it('the grip seat is on the palm side of the hand, not behind it', () => {
    // palm block centre in hand-local space
    const palm = new THREE.Vector3(0, -0.028, 0);
    const toGrip = GRIP_SEAT.clone().sub(palm);
    expect(toGrip.dot(PALM_NORMAL)).toBeGreaterThan(0);
  });

  it('seats the grip in the fist, mirrored per hand, barrel along the reach', () => {
    // where the grip box sits inside the weapon's own frame
    const gripLocal = new THREE.Vector3(0, -0.055, 0.025);
    for (const side of [1, -1]) {
      const g = new THREE.Object3D();
      seatWeapon(g, side);

      // the grip centre lands in the fist
      const seated = gripLocal.clone().applyQuaternion(g.quaternion).add(g.position);
      expect(seated.distanceTo(GRIP_SEAT)).toBeLessThan(1e-9);

      // down the grip exits past the little finger, which is +X on the right
      // hand and -X on the left — the two hands must NOT share a rotation
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.quaternion);
      expect(down.x).toBeCloseTo(side, 6);
      expect(Math.abs(down.z)).toBeLessThan(1e-6);

      // and the barrel runs along the hand's reach
      const barrel = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion);
      expect(barrel.y).toBeCloseTo(-1, 6);
    }
  });

  it('holds over every armed frame, for both hands and all four types', () => {
    const mats = stubMats();
    const scene = new THREE.Object3D();
    let framesChecked = 0;
    let gunsChecked = 0;

    for (const kind of KINDS) {
      const ch = new Character(kind, mats, scene);
      ch.setGuns(true);
      const action = kind === 'soldier' ? 'cover' : 'shootAdvance';
      for (let f = 0; f < 90; f++) {
        const a = (f / 90) * Math.PI * 2;
        // sweep the aim right around the character, including behind it —
        // the old bug only showed at some aim directions
        const aim: [number, number, number] = [Math.sin(a) * 8, 1.35 + Math.cos(a * 0.7), Math.cos(a) * 8];
        ch.update(actorAt(kind, aim, action), f * 0.05);
        scene.updateMatrixWorld(true);
        framesChecked++;

        for (const g of [ch.rig.gunL, ch.rig.gunR]) {
          if (!g || !g.visible || !g.parent) continue;
          gunsChecked++;
          const hand = g.parent;

          // 1. the weapon is never rotated relative to the hand: the aim
          //    swivel lands on the wrist, so the grip cannot drift
          const rest = g.userData.rest as THREE.Quaternion;
          expect(g.quaternion.angleTo(rest)).toBeLessThan(1e-9);

          // 2. the palm faces the grip. Measured from the weapon's LIVE
          //    transform rather than from the seating constants: a check
          //    written against the constants alone is tautological and would
          //    have passed straight through the original bug.
          const gripInHand = new THREE.Vector3(0, -0.055, 0.025)
            .applyQuaternion(g.quaternion).add(g.position);
          const palm = new THREE.Vector3(0, -0.028, 0);
          expect(gripInHand.clone().sub(palm).dot(PALM_NORMAL)).toBeGreaterThan(0);

          //    ...and the grip runs through the fist tube (along X), exiting
          //    past the little finger on the correct side for this hand
          const side = hand === ch.rig.handR.group ? 1 : -1;
          const down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.quaternion);
          expect(down.x * side).toBeGreaterThan(0.9);

          // 3. the wrist never rolls past an anatomical limit, measured from
          //    the hand's REST orientation — the rest is itself a quarter-turn
          //    pronation, so an absolute measurement would call the neutral
          //    pose a violation
          const twistAxis = new THREE.Vector3(0, 1, 0);
          const handRest = hand.userData.rest as THREE.Quaternion;
          const q = handRest.clone().invert().multiply(hand.quaternion);
          const proj = twistAxis.clone().multiplyScalar(
            q.x * twistAxis.x + q.y * twistAxis.y + q.z * twistAxis.z,
          );
          const tw = new THREE.Quaternion(proj.x, proj.y, proj.z, q.w).normalize();
          const roll = 2 * Math.acos(Math.min(1, Math.abs(tw.w)));
          expect(roll).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
        }
      }
    }
    expect(framesChecked).toBe(360);
    // guard carries no drawn weapon; the other three do
    expect(gunsChecked).toBeGreaterThan(200);
  });

  it('clampTwist limits roll about an axis without eating the swing', () => {
    const axis = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, 2.9); // way past 90 deg
    clampTwist(q, axis, Math.PI / 2);
    const back = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    expect(Math.abs(back.y)).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);

    // a pure swing about a perpendicular axis must be left alone
    const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2);
    const copy = swing.clone();
    clampTwist(copy, axis, Math.PI / 2);
    expect(copy.angleTo(swing)).toBeLessThan(1e-6);
  });
});
