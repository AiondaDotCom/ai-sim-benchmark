/** The camera is choreographed, never controlled. Shots are cut from the list in
 *  `choreography.ts`; the slow-motion beats are covered by orbits so the action
 *  stays framed while story time crawls. */
import * as THREE from 'three';
import { CAMERA, type CamShot, type LookTarget } from '../sim/choreography.ts';
import { jointWorld } from '../sim/fk.ts';
import type { World } from '../sim/world.ts';
import { easeIn, easeInOut, easeOut, t01 } from '../sim/vec.ts';

/** Height of the chest joint in the rest pose; camera offsets are authored
 *  relative to it so that a cartwheeling or falling body stays framed. */
const CHEST_HEIGHT = 1.35;

/** Lens guard: how close anything may get to the camera before it is pushed
 *  aside. A body inside this radius fills — or clips through — the frame. */
const CLEARANCE_ACTOR = 2.35;
const CLEARANCE_BOX = 0.9;
/** Keep the rig inside the building. */
const BOUNDS = { x: 8.5, zMin: 0.5, zMax: 49.2, yMin: 0.32, yMax: 9.6 };

function ease(kind: string | undefined, t: number): number {
  switch (kind) {
    case 'out':
      return easeOut(t);
    case 'in':
      return easeIn(t);
    case 'linear':
      return t;
    default:
      return easeInOut(t);
  }
}

export class CameraDirector {
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly smoothPos = new THREE.Vector3();
  private lastShot: CamShot | null = null;
  private shakeEnergy = 0;
  private readonly subjects = new Set<number>();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /**
   * Actor targets follow the real chest joint rather than the root, so the frame
   * stays on the body through cartwheels, wall runs and knock-downs where the
   * root is nowhere near the torso.
   */
  private resolve(world: World, target: LookTarget, out: THREE.Vector3): THREE.Vector3 {
    if ('point' in target) return out.set(target.point.x, target.point.y, target.point.z);
    const a = world.actors[target.actor];
    const o = target.off;
    const chest = jointWorld({ pos: a.pos, yaw: a.yaw, pitch: a.pitch, roll: a.roll }, a.pose, 'chest');
    return out.set(
      chest.pos.x + (o?.x ?? 0),
      chest.pos.y + ((o?.y ?? CHEST_HEIGHT) - CHEST_HEIGHT),
      chest.pos.z + (o?.z ?? 0),
    );
  }

  /**
   * Nudge the camera clear of anything that would fill or clip the frame.
   *
   * Shots are authored, not solved, so a body can fall — or a man can take cover
   * — exactly where a dolly or an orbit is about to pass. This runs on the final
   * smoothed position every frame and slides the rig sideways out of any
   * character capsule or solid box it has come too close to, then keeps it
   * inside the hall. The look target is applied afterwards, so the framing is
   * preserved; only the standoff changes.
   */
  private avoid(
    world: World,
    pos: THREE.Vector3,
    look: THREE.Vector3,
    subjects: ReadonlySet<number>,
  ): void {
    let vx = look.x - pos.x;
    let vz = look.z - pos.z;
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl;
    vz /= vl;

    for (let iter = 0; iter < 4; iter++) {
      let moved = false;

      for (const a of world.actors) {
        if (!a.active) continue;
        // the shot's own subject is meant to be close — never push away from it
        if (subjects.has(a.id)) continue;
        // a body only matters while the lens is level with it
        if (pos.y > a.pos.y + 2.25 || pos.y < a.pos.y - 0.5) continue;
        let dx = pos.x - a.pos.x;
        let dz = pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= CLEARANCE_ACTOR) continue;
        // ignore anything clearly behind the lens
        if (-(dx * vx + dz * vz) < -0.3 * (d || 1)) continue;
        if (d < 1e-4) {
          dx = -vx;
          dz = -vz;
        }
        const l = Math.hypot(dx, dz) || 1;
        pos.x = a.pos.x + (dx / l) * CLEARANCE_ACTOR;
        pos.z = a.pos.z + (dz / l) * CLEARANCE_ACTOR;
        moved = true;
      }

      for (const b of world.blockers) {
        if (pos.y > b.max.y + 0.35 || pos.y < b.min.y - 0.35) continue;
        const minX = b.min.x - CLEARANCE_BOX;
        const maxX = b.max.x + CLEARANCE_BOX;
        const minZ = b.min.z - CLEARANCE_BOX;
        const maxZ = b.max.z + CLEARANCE_BOX;
        if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ) continue;
        // inside the expanded box: leave by the nearest face
        const dxl = pos.x - minX;
        const dxh = maxX - pos.x;
        const dzl = pos.z - minZ;
        const dzh = maxZ - pos.z;
        const m = Math.min(dxl, dxh, dzl, dzh);
        if (m === dxl) pos.x = minX;
        else if (m === dxh) pos.x = maxX;
        else if (m === dzl) pos.z = minZ;
        else pos.z = maxZ;
        moved = true;
      }

      if (!moved) break;
    }

    pos.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, pos.x));
    pos.z = Math.max(BOUNDS.zMin, Math.min(BOUNDS.zMax, pos.z));
    pos.y = Math.max(BOUNDS.yMin, Math.min(BOUNDS.yMax, pos.y));
  }

  /** Who this shot is about: those actors may be as close as the shot wants. */
  private subjectsOf(shot: CamShot): ReadonlySet<number> {
    this.subjects.clear();
    if (shot.pos.k === 'follow') this.subjects.add(shot.pos.actor);
    else if (shot.pos.k === 'orbit' && 'actor' in shot.pos.c) this.subjects.add(shot.pos.c.actor);
    const look = shot.look;
    if ('k' in look && look.k === 'lerp') {
      if ('actor' in look.a) this.subjects.add(look.a.actor);
      if ('actor' in look.b) this.subjects.add(look.b.actor);
    } else if ('actor' in look) {
      this.subjects.add(look.actor);
    }
    return this.subjects;
  }

  private shotAt(t: number): CamShot {
    let s = CAMERA[0];
    for (const c of CAMERA) if (t >= c.t0) s = c;
    return s;
  }

  /** @param renderDelta real seconds since the last frame (for the shake decay) */
  update(world: World, renderDelta: number): void {
    const t = world.time;
    const shot = this.shotAt(t);
    const k = t01(t, shot.t0, shot.t1);
    const cut = shot !== this.lastShot;
    this.lastShot = shot;

    switch (shot.pos.k) {
      case 'fixed':
        this.pos.set(shot.pos.p.x, shot.pos.p.y, shot.pos.p.z);
        break;
      case 'dolly': {
        const e = ease(shot.pos.ease, k);
        this.pos.set(
          shot.pos.a.x + (shot.pos.b.x - shot.pos.a.x) * e,
          shot.pos.a.y + (shot.pos.b.y - shot.pos.a.y) * e,
          shot.pos.a.z + (shot.pos.b.z - shot.pos.a.z) * e,
        );
        break;
      }
      case 'orbit': {
        const c = this.resolve(world, shot.pos.c, this.tmp);
        const e = easeInOut(k);
        const ang = shot.pos.a0 + (shot.pos.a1 - shot.pos.a0) * e;
        const r = shot.pos.r0 + (shot.pos.r1 - shot.pos.r0) * e;
        const y = shot.pos.y0 + (shot.pos.y1 - shot.pos.y0) * e;
        this.pos.set(c.x + Math.sin(ang) * r, c.y + y - 0.2, c.z + Math.cos(ang) * r);
        break;
      }
      case 'follow': {
        // the offset's Y is an absolute camera height, so a dip in the actor's
        // root (a crouch, a fall) never drags the camera into the floor
        const a = world.actors[shot.pos.actor];
        this.pos.set(a.pos.x + shot.pos.off.x, shot.pos.off.y, a.pos.z + shot.pos.off.z);
        break;
      }
    }

    if ('k' in shot.look && shot.look.k === 'lerp') {
      const e = easeInOut(k);
      this.resolve(world, shot.look.a, this.look);
      this.resolve(world, shot.look.b, this.tmp);
      this.look.lerp(this.tmp, e);
    } else {
      this.resolve(world, shot.look as LookTarget, this.look);
    }

    if (cut) {
      this.smoothPos.copy(this.pos);
      this.smoothLook.copy(this.look);
    } else {
      const lag = shot.pos.k === 'follow' ? (shot.pos.lag ?? 0.25) : 0.08;
      const f = 1 - Math.exp(-renderDelta / Math.max(lag, 0.01));
      this.smoothPos.lerp(this.pos, f);
      this.smoothLook.lerp(this.look, Math.min(1, f * 1.6));
    }

    this.avoid(world, this.smoothPos, this.smoothLook, this.subjectsOf(shot));

    // hand-held energy, driven by the shot and by how much lead is in the air
    const gunfire = Math.min(1, world.bullets.length / 6);
    this.shakeEnergy += ((shot.shake ?? 0) * (0.35 + gunfire * 0.9) - this.shakeEnergy) * Math.min(1, renderDelta * 6);
    const s = this.shakeEnergy * 0.055;
    const jitter = (a: number, b: number) => Math.sin(t * a) * Math.sin(t * b + 1.7);
    this.camera.position.set(
      this.smoothPos.x + jitter(31.3, 7.9) * s,
      this.smoothPos.y + jitter(27.1, 11.3) * s,
      this.smoothPos.z + jitter(23.7, 9.1) * s,
    );
    this.camera.lookAt(this.smoothLook);
    if (shot.roll) {
      this.camera.rotateZ(shot.roll[0] + (shot.roll[1] - shot.roll[0]) * k);
    }
    this.camera.rotateZ(jitter(19.7, 5.3) * s * 0.35);

    const fov = shot.fov ? shot.fov[0] + (shot.fov[1] - shot.fov[0]) * easeInOut(k) : 45;
    if (Math.abs(this.camera.fov - fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
