/**
 * B6: weapon orientation. Drives the real render rig from the real
 * simulation and checks, at every frame a round is fired, that the weapon
 * doing the firing actually points along that round — barrel outward, grip
 * down in the fist. Guards against the class of bug where a pose stages the
 * arms but never aims the gun (the cartwheel and the wall run both did).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/sim/world';
import { Character } from '../src/render/characters';
import type { CharKind } from '../src/render/characters';
import type { Mats } from '../src/render/materials';

/** Materials without the texture loading (which needs a DOM). */
function stubMats(): Mats {
  const tex = new THREE.Texture();
  const base: Record<string, unknown> = {
    textures: { bulletHole: tex, crack: tex, substrate: tex, radialAlpha: tex, dust: tex },
  };
  return new Proxy(base, {
    get(t, k: string) {
      if (!(k in t)) t[k] = new THREE.MeshStandardMaterial();
      return t[k];
    },
  }) as unknown as Mats;
}

interface Sample { dot: number; grip: number; t: number; action: string }

function collect(seconds: number): Map<string, Sample[]> {
  const world = new World(42);
  const mats = stubMats();
  const scene = new THREE.Scene();
  const chars = new Map<string, Character>();
  for (const a of world.actors.values()) {
    const kind: CharKind =
      a.id === 'neo' ? 'neo' : a.id === 'trin' ? 'trin' : a.role === 'guard' ? 'guard' : 'soldier';
    const c = new Character(kind, mats, scene);
    c.setGuns(true);
    chars.set(a.id, c);
  }
  const dt = 1 / 240;
  const out = new Map<string, Sample[]>();
  const want = new THREE.Vector3();
  for (let i = 0; i * dt < seconds; i++) {
    world.step(dt);
    const shots = world.drainEvents().filter((e) => e.type === 'SHOT');
    if (!shots.length) continue;
    for (const sh of shots) {
      if (sh.type === 'SHOT') chars.get(sh.shooter)?.noteShot(sh.dir, sh.t);
    }
    for (const a of world.actors.values()) chars.get(a.id)!.update(a, world.t);
    scene.updateMatrixWorld(true);
    for (const sh of shots) {
      if (sh.type !== 'SHOT') continue;
      const actor = world.actors.get(sh.shooter);
      const c = chars.get(sh.shooter);
      if (!actor || !c) continue;
      const rig = (c as unknown as { rig: Record<string, THREE.Group | undefined> }).rig;
      want.set(sh.dir[0], sh.dir[1], sh.dir[2]).normalize();
      let best = -2;
      let grip = 2;
      for (const side of ['gunR', 'gunL']) {
        const g = rig[side];
        if (!g || !g.visible) continue;
        const q = g.getWorldQuaternion(new THREE.Quaternion());
        const dot = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize().dot(want);
        if (dot > best) {
          best = dot;
          grip = new THREE.Vector3(0, -1, 0).applyQuaternion(q).normalize().y;
        }
      }
      if (best < -1.5) continue;
      const key = sh.shooter;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push({ dot: best, grip, t: world.t, action: actor.pose.action });
    }
  }
  return out;
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

describe('weapon orientation (B6)', () => {
  const perShooter = collect(61);

  it('every shooter fires along its own barrel', () => {
    expect(perShooter.size).toBeGreaterThan(5);
    for (const [id, samples] of perShooter) {
      expect(samples.length, id).toBeGreaterThan(0);
      // median is the honest measure: a pose blend can be off for a frame
      expect(median(samples.map((s) => s.dot)), `${id} median barrel alignment`)
        .toBeGreaterThan(0.95);
    }
  });

  it('barrels are never pointed backwards for more than a stray frame', () => {
    const all = [...perShooter.values()].flat();
    const backwards = all.filter((s) => s.dot < 0.5);
    expect(all.length).toBeGreaterThan(200);
    expect(backwards.length / all.length).toBeLessThan(0.02);
  });

  it('the grip sits below the barrel while firing upright', () => {
    for (const [id, samples] of perShooter) {
      // the cartwheel inverts the whole body, so the fist (and the gun in it)
      // legitimately turns over; every other pose keeps the grip down
      const upright = samples.filter((s) => s.action !== 'cartwheel');
      if (!upright.length) continue;
      expect(median(upright.map((s) => s.grip)), `${id} median grip.y`).toBeLessThan(-0.5);
    }
  });
});
