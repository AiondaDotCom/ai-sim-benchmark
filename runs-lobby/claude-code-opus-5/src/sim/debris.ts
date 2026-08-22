/** Rigid-body-ish particle pools for shell casings and marble fragments.
 *
 *  Hand-rolled, deliberately simple: gravity, a floor with restitution and
 *  friction, and axis-aligned box rejection for the columns and the desk. No
 *  physics engine is used anywhere in this project.
 *
 *  Nothing is ever removed from a pool: once a casing or a chip has landed it
 *  stays on the marble for the rest of the sequence, which is what makes the
 *  final wide shot read as a wrecked lobby.
 */
import type { Blocker } from './lobby.ts';
import { LAYOUT } from './lobby.ts';
import type { Rng } from './rng.ts';
import { v3, type Vec3 } from './vec.ts';

export interface BounceEvent {
  x: number;
  y: number;
  z: number;
  speed: number;
  index: number;
}

export class RigidPool {
  readonly capacity: number;
  count = 0;
  /** Total number of spawn requests, including those refused at capacity. */
  spawnRequests = 0;

  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  readonly rz: Float32Array;
  readonly wx: Float32Array;
  readonly wy: Float32Array;
  readonly wz: Float32Array;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly sz: Float32Array;
  /** 0 = marble veneer, 1 = rough substrate, 2 = brass, 3 = discarded weapon */
  readonly kind: Uint8Array;
  readonly resting: Uint8Array;
  readonly born: Float32Array;

  private readonly restitution: number;
  private readonly friction: number;
  private readonly radius: number;

  constructor(capacity: number, opts: { restitution: number; friction: number; radius: number }) {
    this.capacity = capacity;
    this.restitution = opts.restitution;
    this.friction = opts.friction;
    this.radius = opts.radius;
    const f = () => new Float32Array(capacity);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.rx = f(); this.ry = f(); this.rz = f();
    this.wx = f(); this.wy = f(); this.wz = f();
    this.sx = f(); this.sy = f(); this.sz = f();
    this.kind = new Uint8Array(capacity);
    this.resting = new Uint8Array(capacity);
    this.born = new Float32Array(capacity);
  }

  spawn(
    p: Vec3,
    vel: Vec3,
    kind: number,
    size: Vec3,
    rng: Rng,
    time: number,
    spin = 14,
  ): number {
    this.spawnRequests++;
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
    this.vx[i] = vel.x; this.vy[i] = vel.y; this.vz[i] = vel.z;
    this.rx[i] = rng.sym(Math.PI); this.ry[i] = rng.sym(Math.PI); this.rz[i] = rng.sym(Math.PI);
    this.wx[i] = rng.sym(spin); this.wy[i] = rng.sym(spin); this.wz[i] = rng.sym(spin);
    this.sx[i] = size.x; this.sy[i] = size.y; this.sz[i] = size.z;
    this.kind[i] = kind;
    this.resting[i] = 0;
    this.born[i] = time;
    return i;
  }

  step(dt: number, blockers: readonly Blocker[], out: BounceEvent[]): void {
    const g = -9.81;
    for (let i = 0; i < this.count; i++) {
      if (this.resting[i]) continue;
      this.vy[i] += g * dt;
      const nx = this.px[i] + this.vx[i] * dt;
      const ny = this.py[i] + this.vy[i] * dt;
      const nz = this.pz[i] + this.vz[i] * dt;
      this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
      this.rx[i] += this.wx[i] * dt;
      this.ry[i] += this.wy[i] * dt;
      this.rz[i] += this.wz[i] * dt;

      // walls keep everything inside the hall
      const w = LAYOUT.halfWidth - this.radius;
      if (this.px[i] > w) { this.px[i] = w; this.vx[i] *= -0.35; }
      if (this.px[i] < -w) { this.px[i] = -w; this.vx[i] *= -0.35; }
      if (this.pz[i] < this.radius) { this.pz[i] = this.radius; this.vz[i] *= -0.35; }
      if (this.pz[i] > LAYOUT.hallLength - this.radius) {
        this.pz[i] = LAYOUT.hallLength - this.radius;
        this.vz[i] *= -0.35;
      }

      // columns and furniture: push the particle out along the shallowest axis
      for (let b = 0; b < blockers.length; b++) {
        const bl = blockers[b];
        if (
          this.px[i] > bl.min.x - this.radius && this.px[i] < bl.max.x + this.radius &&
          this.py[i] > bl.min.y - this.radius && this.py[i] < bl.max.y + this.radius &&
          this.pz[i] > bl.min.z - this.radius && this.pz[i] < bl.max.z + this.radius
        ) {
          const dxl = this.px[i] - (bl.min.x - this.radius);
          const dxh = (bl.max.x + this.radius) - this.px[i];
          const dyh = (bl.max.y + this.radius) - this.py[i];
          const dzl = this.pz[i] - (bl.min.z - this.radius);
          const dzh = (bl.max.z + this.radius) - this.pz[i];
          const m = Math.min(dxl, dxh, dyh, dzl, dzh);
          if (m === dyh) {
            this.py[i] = bl.max.y + this.radius;
            if (this.vy[i] < 0) {
              const sp = -this.vy[i];
              this.vy[i] = sp * this.restitution;
              this.vx[i] *= this.friction; this.vz[i] *= this.friction;
              if (sp > 0.8) out.push({ x: this.px[i], y: this.py[i], z: this.pz[i], speed: sp, index: i });
            }
          } else if (m === dxl) { this.px[i] = bl.min.x - this.radius; this.vx[i] *= -0.3; }
          else if (m === dxh) { this.px[i] = bl.max.x + this.radius; this.vx[i] *= -0.3; }
          else if (m === dzl) { this.pz[i] = bl.min.z - this.radius; this.vz[i] *= -0.3; }
          else { this.pz[i] = bl.max.z + this.radius; this.vz[i] *= -0.3; }
        }
      }

      // floor
      if (this.py[i] < this.radius) {
        this.py[i] = this.radius;
        const sp = -this.vy[i];
        if (sp > 0.25) {
          this.vy[i] = sp * this.restitution;
          this.vx[i] *= this.friction;
          this.vz[i] *= this.friction;
          this.wx[i] *= 0.55; this.wy[i] *= 0.75; this.wz[i] *= 0.55;
          if (sp > 0.6) out.push({ x: this.px[i], y: this.py[i], z: this.pz[i], speed: sp, index: i });
        } else {
          this.vy[i] = 0;
          this.vx[i] *= 0.80;
          this.vz[i] *= 0.80;
          this.wx[i] *= 0.5; this.wy[i] *= 0.6; this.wz[i] *= 0.5;
          const hs = Math.hypot(this.vx[i], this.vz[i]);
          if (hs < 0.12 && Math.abs(this.wy[i]) < 0.9) {
            this.resting[i] = 1;
            this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
            this.wx[i] = 0; this.wy[i] = 0; this.wz[i] = 0;
            // lie flat on the marble
            this.rx[i] = Math.round(this.rx[i] / (Math.PI / 2)) * (Math.PI / 2);
            this.rz[i] = Math.round(this.rz[i] / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
    }
  }
}

/** Volatile stone dust and smoke. Dust is the only thing in the demo that
 *  fades — it is smoke, not debris; every solid artefact persists. */
export class DustPool {
  readonly capacity: number;
  count = 0;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  readonly seed: Float32Array;
  readonly kind: Uint8Array; // 0 = dust, 1 = spark

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f(); this.size = f(); this.seed = f();
    this.kind = new Uint8Array(capacity);
  }

  spawn(p: Vec3, vel: Vec3, life: number, size: number, kind: number, rng: Rng): void {
    let i: number;
    if (this.count < this.capacity) {
      i = this.count++;
    } else {
      // recycle the oldest slot
      let oldest = 0;
      let best = -1;
      for (let k = 0; k < this.count; k += 7) {
        const r = this.age[k] / this.life[k];
        if (r > best) { best = r; oldest = k; }
      }
      i = oldest;
    }
    this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
    this.vx[i] = vel.x; this.vy[i] = vel.y; this.vz[i] = vel.z;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size;
    this.kind[i] = kind;
    this.seed[i] = rng.next();
  }

  step(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const spark = this.kind[i] === 1;
      if (spark) this.vy[i] -= 14 * dt;
      else this.vy[i] += 0.32 * dt; // dust drifts upward through the light
      const drag = spark ? 0.965 : 0.955;
      this.vx[i] *= drag; this.vy[i] *= spark ? drag : 0.985; this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02 && spark) { this.py[i] = 0.02; this.vy[i] *= -0.3; }
    }
  }
}

export const SIZE_CASING = v3(0.010, 0.024, 0.010);
