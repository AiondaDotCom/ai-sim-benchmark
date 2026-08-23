/**
 * Procedural articulated characters (requirement A2: beyond box primitives).
 * Smoothed low-poly anatomy built entirely in code: tapered limbs whose
 * shoulder mass is part of the arm itself, single-surface sculpted heads
 * (brow, cheekbones, nose, lips, jaw displaced from one sphere), real
 * sunglasses, uniform peaked caps with a front-only visor, helmets with
 * rims, articulated two-phalanx hands with thumbs, boots with a toe box and
 * a heeled sole, and a long coat built as one wrapped skirt with lapels.
 *
 * A small forward-kinematics rig (hips → torso/head/arms/legs (+coat))
 * is posed per-frame from the simulation's actor state.
 */
import * as THREE from 'three';
import type { Mats } from './materials';
import type { ActorSim } from '../sim/world';
import type { V3 } from '../sim/math3';

export type CharKind = 'neo' | 'trin' | 'guard' | 'soldier';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

interface Hand {
  group: THREE.Group;
  prox: THREE.Group;
  dist: THREE.Group;
  thumb: THREE.Group;
}

interface Rig {
  root: THREE.Group; // world position + yaw
  tilt: THREE.Group; // whole-body rotations (cartwheel, falls, wall-run lean)
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; foreL: THREE.Group;
  armR: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; shinL: THREE.Group;
  legR: THREE.Group; shinR: THREE.Group;
  handL: Hand;
  handR: Hand;
  coatBack?: THREE.Group;
  coatFL?: THREE.Group;
  coatFR?: THREE.Group;
  gunL?: THREE.Group;
  gunR?: THREE.Group;
}

const HIP_Y = 0.96;

// scratch objects for the per-frame gun swivel (B6) — no allocation in update
const _qChain = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qIdent = new THREE.Quaternion();
const _vWant = new THREE.Vector3();
const _vLocal = new THREE.Vector3();
const _vCur = new THREE.Vector3();

/**
 * Poses in which the character is actually shooting, so the held weapons
 * must track the aim point rather than follow the arm's staging (B6).
 * Value = how far the wrist may swivel to get there, in radians.
 */
const GUN_TRACK: Record<string, number> = {
  shootAdvance: 0.7, crouchFire: 0.7, coverL: 0.7, coverR: 0.7, cover: 0.7,
  lower: 0.7, dodge: 1.1, cartwheel: 1.6, wallrun: 1.6, walk: 0.9, run: 0.9,
};

/** How long (sim seconds) a fired round keeps the barrel on its own line. */
const SHOT_HOLD = 0.3;

// ------------------------------------------------------- geometry helpers --

/** Tapered limb segment with a rounded joint sphere at the pivot. */
function limbSeg(
  mat: THREE.Material, rTop: number, rBot: number, len: number, jointR?: number,
): THREE.Group {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10, 1), mat);
  cyl.position.y = -len / 2;
  g.add(cyl);
  // A11: the joint used to be a sphere 12% wider than the limb, which is a
  // literal ball joint and the reason the limbs read as a toy figure. It now
  // sits flush and squashed, closing the seam without bulging.
  const joint = new THREE.Mesh(new THREE.SphereGeometry(jointR ?? rTop * 0.99, 12, 8), mat);
  joint.scale.set(1, 0.82, 1);
  g.add(joint);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(rBot * 0.985, 12, 8), mat);
  cap.scale.set(1, 0.88, 1);
  cap.position.y = -len;
  g.add(cap);
  return g;
}

/**
 * A11: the head as ONE sculpted surface.
 *
 * The face used to be an egg with a nose cone, cheek ellipsoids, a jaw
 * ellipsoid and a lip box stuck onto it. At any distance those read as
 * separate lumps — warts, not anatomy. This displaces a single sphere
 * instead, so brow, cheekbones, nose, lips and jaw are continuous with the
 * skull and catch light as one form.
 */
function sculptedHead(mat: THREE.Material, female: boolean): THREE.Mesh {
  const R = 0.105;
  const geo = new THREE.SphereGeometry(R, 40, 30);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  /** smooth radial falloff in [0,1] */
  const fall = (d: number, r: number) => {
    const k = Math.max(0, 1 - d / r);
    return k * k * (3 - 2 * k);
  };
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.copy(p).normalize();
    // cranial proportions: taller than wide, occiput a little flattened
    p.x *= female ? 0.78 : 0.80;
    p.y *= 1.05;
    p.z *= n.z < 0 ? 0.88 : 0.98;

    const yy = p.y / (R * 1.05);      // -1 chin .. +1 crown
    const front = Math.max(0, n.z);

    // jaw and cheek taper below the cheekbones
    if (yy < 0.02) {
      const k = Math.min(1, (0.02 - yy) / 0.9);
      p.x *= 1 - (female ? 0.34 : 0.26) * k * k;
      p.z *= 1 - 0.08 * k * k;
    }
    // temple narrowing above the brow
    if (yy > 0.45) p.x *= 1 - 0.1 * ((yy - 0.45) / 0.55);

    // --- features, all pushed along the surface normal -------------------
    const add = (dx: number, dy: number, dz: number, r: number, amt: number) => {
      const d = Math.hypot(p.x - dx, p.y - dy, p.z - dz);
      const w = fall(d, r);
      if (w > 0) { p.x += n.x * amt * w; p.y += n.y * amt * w * 0.4; p.z += n.z * amt * w; }
    };
    // brow ridge across the eyes
    if (front > 0.2) add(0, R * 0.32, R * 0.9, R * 0.6, 0.011);
    // eye sockets set back under the brow
    if (front > 0.3) {
      for (const sx of [-1, 1]) add(sx * R * 0.4, R * 0.14, R * 0.85, R * 0.33, -0.0105);
    }
    // cheekbones, with the hollow under them
    if (front > 0.15) {
      for (const sx of [-1, 1]) {
        add(sx * R * 0.5, R * 0.0, R * 0.62, R * 0.4, 0.0085);
        add(sx * R * 0.42, -R * 0.3, R * 0.6, R * 0.3, -0.005);
      }
    }
    // nose: bridge, tip, and wings at the base
    if (front > 0.35) {
      add(0, R * 0.18, R * 0.95, R * 0.19, 0.014);
      add(0, -R * 0.05, R * 0.98, R * 0.15, 0.028);
      for (const sx of [-1, 1]) add(sx * R * 0.13, -R * 0.12, R * 0.88, R * 0.11, 0.012);
    }
    // mouth: a cut between two lips, so it reads as a mouth and not a smooth
    // patch of cheek
    if (front > 0.4) {
      add(0, -R * 0.3, R * 0.88, R * 0.21, 0.009);   // upper lip
      add(0, -R * 0.38, R * 0.9, R * 0.1, -0.008);   // mouth line
      add(0, -R * 0.47, R * 0.86, R * 0.19, 0.0085); // lower lip
      add(0, -R * 0.58, R * 0.8, R * 0.15, -0.005);  // crease below the lip
    }
    // chin
    if (front > 0.3) add(0, -R * 0.76, R * 0.66, R * 0.32, 0.012);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function ellipsoid(
  mat: THREE.Material, r: number, sx: number, sy: number, sz: number,
  x = 0, y = 0, z = 0, seg = 12,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 2)), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/**
 * A coat panel with vertical folds: corrugated, flaring toward the hem.
 * Pivot is the top edge (hangs down from y=0).
 */
function foldedPanel(
  mat: THREE.Material, w: number, h: number, folds: number, amp: number, phase = 0,
  topScale = 1, hemScale = 1.22,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h, Math.max(10, folds * 4), 8);
  geo.translate(0, -h / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = x / w + 0.5;
    const v = -y / h; // 0 at top, 1 at hem
    // folds deepen toward the hem; panel flares slightly
    const z = amp * (0.25 + 0.95 * v) * Math.sin(u * Math.PI * folds + phase);
    pos.setZ(i, z);
    // A11: taper gives the coat a waist and an A-line hem instead of the
    // constant-width slab that made the silhouette read as a bollard
    pos.setX(i, x * (topScale + (hemScale - topScale) * v));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  return m;
}

/**
 * A11: the coat skirt as ONE continuous wrapped shell, open at the front,
 * tapered from the waist to a flared hem and rippled with vertical folds.
 * It replaces the three flat planes that used to stand in for a coat and
 * read, from any angle off-axis, as loose planks beside the body.
 */
function coatSkirt(
  mat: THREE.Material, rTop: number, rBot: number, h: number, folds: number, amp: number,
): THREE.Mesh {
  const gap = Math.PI * 0.36; // front opening
  const geo = new THREE.CylinderGeometry(
    rTop, rBot, h, 48, 12, true, gap / 2, Math.PI * 2 - gap,
  );
  geo.translate(0, -h / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ang = Math.atan2(x, z);
    const v = -y / h; // 0 at the waist, 1 at the hem
    const r = 1 + amp * (0.18 + 0.95 * v) * Math.sin(ang * folds);
    pos.setX(i, x * r * 1.06); // body is wider than it is deep
    pos.setZ(i, z * r * 0.86);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function pistolMesh(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.045, 0.21), mats.gunmetal);
  slide.position.set(0, 0.03, -0.09);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 8), mats.gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.025, -0.215);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), mats.black);
  grip.position.set(0, -0.045, 0.02);
  grip.rotation.x = 0.22;
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 10, Math.PI), mats.black);
  guard.rotation.z = Math.PI / 2;
  guard.position.set(0, -0.005, -0.03);
  g.add(slide, barrel, grip, guard);
  return g;
}

function smgMesh(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.36), mats.gunmetal);
  body.position.set(0, 0, -0.1);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), mats.gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, -0.33);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.055), mats.black);
  mag.position.set(0, -0.1, -0.04);
  mag.rotation.x = 0.12;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.15), mats.black);
  stock.position.set(0, 0.015, 0.12);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.04), mats.black);
  grip.position.set(0, -0.06, 0.03);
  grip.rotation.x = 0.25;
  g.add(body, barrel, mag, stock, grip);
  return g;
}

export class Character {
  static instanceCount = 0;
  rig: Rig;
  kind: CharKind;
  private mats: Mats;
  private stridePhase = 0;
  private prevPos: V3 | null = null;
  gunsVisible = false;
  coatOpen = 0;
  /** target hand curl 0 (open) .. 1 (fist/grip); smoothed per frame */
  private curl = 0.45;
  /** direction + sim time of the most recent round fired (B6) */
  private shotDir: V3 | null = null;
  private shotT = -1;

  constructor(kind: CharKind, mats: Mats, scene: THREE.Object3D) {
    this.kind = kind;
    this.mats = mats;
    this.rig = this.build();
    scene.add(this.rig.root);
  }

  /**
   * B6: remember the direction of the round this character just fired, so the
   * barrel lines up with its own tracer. Soldiers deliberately shoot wide of
   * their target (scripted misses), so aiming the muzzle at the target alone
   * would leave the tracer leaving the gun at an angle.
   */
  noteShot(dir: V3, t: number) {
    this.shotDir = [dir[0], dir[1], dir[2]];
    this.shotT = t;
  }

  /**
   * World position of the barrel tip of whichever held weapon points closest
   * to `dir`. The simulation's muzzle point is a coarse body-relative
   * approximation; the muzzle flash has to sit exactly on the rendered barrel
   * or it reads as a glowing blob hanging in mid-air (B5).
   */
  muzzleTipFor(dir: V3, out: THREE.Vector3): boolean {
    const r = this.rig;
    let best: THREE.Group | null = null;
    let bestDot = -2;
    _vWant.set(dir[0], dir[1], dir[2]).normalize();
    for (const g of [r.gunR, r.gunL]) {
      if (!g || !g.visible || !g.parent) continue;
      this.chainQuat(g, _qChain);
      const d = _vCur.set(0, 0, -1).applyQuaternion(_qChain).dot(_vWant);
      if (d > bestDot) { bestDot = d; best = g; }
    }
    if (!best) return false;
    best.updateWorldMatrix(true, false);
    out.set(0, 0, this.kind === 'soldier' ? -0.39 : -0.25).applyMatrix4(best.matrixWorld);
    return true;
  }

  setGuns(visible: boolean) {
    this.gunsVisible = visible;
  }


  /** Reset per-run state when the demo loops. */
  reset() {
    this.stridePhase = 0;
    this.prevPos = null;
    this.coatOpen = 0;
    this.gunsVisible = false;
    this.curl = 0.45;
  }

  // -------------------------------------------------------------- build ---

  private buildHand(side: number, skin: THREE.Material): Hand {
    const m = this.mats;
    const group = new THREE.Group();
    group.scale.setScalar(1.38); // A11: hands were mitten-small for the body
    // palm: slightly rounded block
    const palm = ellipsoid(skin, 0.036, 1.0, 1.35, 0.62, 0, -0.028, 0, 10);
    group.add(palm);
    // four fingers as two articulated phalanx rows
    const prox = new THREE.Group();
    prox.position.set(0, -0.062, 0.004);
    const p1 = ellipsoid(skin, 0.026, 1.15, 1.5, 0.75, 0, -0.024, 0, 8);
    prox.add(p1);
    const dist = new THREE.Group();
    dist.position.set(0, -0.052, 0);
    const p2 = ellipsoid(skin, 0.023, 1.1, 1.4, 0.7, 0, -0.02, 0, 8);
    dist.add(p2);
    prox.add(dist);
    group.add(prox);
    // thumb on the inner edge
    const thumb = new THREE.Group();
    thumb.position.set(-side * 0.032, -0.03, 0.012);
    const th = ellipsoid(skin, 0.017, 1.0, 1.9, 0.9, 0, -0.02, 0, 8);
    thumb.add(th);
    thumb.rotation.z = -side * 0.5;
    group.add(thumb);
    void m;
    return { group, prox, dist, thumb };
  }

  private build(): Rig {
    const m = this.mats;
    const kind = this.kind;
    const isW = kind === 'trin';
    const bodyMat = kind === 'neo' ? m.coat : kind === 'trin' ? m.latex
      : kind === 'guard' ? m.shirt : m.darkCloth;
    const legMat = kind === 'guard' ? m.guardTrouser : kind === 'trin' ? m.latex : m.trouser;
    const skinBase = isW ? m.skinW : m.skin;

    // subtle deterministic per-character skin variation (no two identical eggs)
    const skin = skinBase.clone();
    const jit = ((Character.instanceCount++ % 7) - 3) * 0.022;
    skin.color.offsetHSL(jit * 0.02, jit * 0.4, jit * 0.35);

    const root = new THREE.Group();
    const tilt = new THREE.Group();
    root.add(tilt);
    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    tilt.add(hips);

    // pelvis: one full mass with the thigh roots tucked inside
    hips.add(ellipsoid(legMat, isW ? 0.14 : 0.155, 1.1, 0.72, 0.78, 0, 0.0, 0));

    // torso
    const torso = new THREE.Group();
    torso.position.y = 0.12;
    hips.add(torso);
    const chestW = kind === 'soldier' ? 0.215 : isW ? 0.168 : 0.195;
    // chest: capsule squashed into a smooth trunk
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.3, 6, 14), bodyMat);
    chest.position.y = 0.29;
    chest.scale.set(chestW / 0.155, 1.0, 0.72);
    torso.add(chest);
    // waist filler bridging chest and hips (covers the pelvis top)
    torso.add(ellipsoid(bodyMat, 0.155, (chestW - 0.02) / 0.155, 1.0, 0.66, 0, 0.02, 0));
    // shoulders: a deltoid cap that flows into the arm plus a trapezius wedge
    // running up to the neck. Spheres here were the strongest toy tell (A11).
    // A11: the woman's frame is narrower — the same shoulder mass on her read
    // as an exaggerated male wedge.
    const shoulderK = isW ? 0.82 : 1;
    // A11 follow-up: there is no separate deltoid ellipsoid any more. A
    // rounded mass parked on top of the arm reads as a water wing however it
    // is sized or seated — three attempts confirmed it. The deltoid is now
    // simply the widest part of the upper arm itself (see mkArm), so shoulder
    // and arm are one continuous tapering form. All that remains here is the
    // trapezius slope from the neck out to the joint.
    for (const sx of [-1, 1]) {
      const trap = ellipsoid(
        bodyMat, 0.062 * shoulderK, 1.9, 0.42, 0.85,
        sx * (chestW * 0.42), 0.522, -0.008, 10,
      );
      trap.rotation.z = -sx * 0.24;
      torso.add(trap);
    }
    if (isW) {
      // bust, nipped waist and a wider hip line, so the figure reads female
      // rather than as a narrow man in the same suit
      for (const sx of [-1, 1]) {
        torso.add(ellipsoid(bodyMat, 0.058, 0.95, 0.82, 0.78, sx * 0.062, 0.36, 0.088, 12));
      }
      torso.add(ellipsoid(bodyMat, 0.148, 1.0, 0.62, 0.66, 0, 0.13, 0.0, 14));
      hips.add(ellipsoid(legMat, 0.152, 1.12, 0.68, 0.84, 0, -0.02, 0, 14));
    }
    // neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.09, 10), skin);
    neck.position.y = 0.58;
    torso.add(neck);

    if (kind === 'guard') {
      // A11: a uniform shirt needs garment geometry — a collar the tie sits
      // under, a button placket, breast pockets and epaulettes. Without them
      // it is a white blob whatever texture is on it.
      for (const sx of [-1, 1]) {
        const collarWing = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.012), bodyMat);
        collarWing.position.set(sx * 0.045, 0.532, 0.086);
        collarWing.rotation.set(0.32, -sx * 0.42, sx * 0.3);
        torso.add(collarWing);
        // epaulette across the top of the shoulder
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.012, 0.055), bodyMat);
        ep.position.set(sx * (chestW * 0.72), 0.512, 0.005);
        ep.rotation.z = -sx * 0.18;
        torso.add(ep);
        // breast pocket with a flap
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.07, 0.01), bodyMat);
        pocket.position.set(sx * 0.083, 0.375, 0.104);
        torso.add(pocket);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.022, 0.013), bodyMat);
        flap.position.set(sx * 0.083, 0.412, 0.106);
        torso.add(flap);
      }
      // button placket down the centre front
      const plac = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.42, 0.009), bodyMat);
      plac.position.set(0, 0.33, 0.108);
      torso.add(plac);
      for (let b = 0; b < 4; b++) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.004, 8), m.black);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(0, 0.475 - b * 0.1, 0.115);
        torso.add(btn);
      }
      // tie: knot tucked under the collar, blade over the placket
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.032, 0.018), m.black);
      knot.position.set(0, 0.505, 0.108);
      knot.rotation.x = 0.1;
      torso.add(knot);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.25, 0.011), m.black);
      tie.position.set(0, 0.365, 0.115);
      tie.rotation.x = 0.06;
      torso.add(tie);
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.055, 14), m.black);
      belt.scale.set(1.12, 1, 0.68);
      belt.position.y = 0.0;
      torso.add(belt);
      const holster = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), m.black);
      holster.position.set(0.185, -0.05, 0.02);
      holster.rotation.z = -0.1;
      torso.add(holster);
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 8), m.brass);
      badge.rotation.x = Math.PI / 2;
      badge.position.set(-0.09, 0.42, 0.1);
      torso.add(badge);
    }
    if (kind === 'soldier') {
      // rounded armor vest with pouches
      const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.16, 6, 12), m.black);
      vest.position.y = 0.3;
      vest.scale.set(1.28, 0.95, 0.82);
      torso.add(vest);
      for (const px of [-0.06, 0.06]) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.035), m.darkCloth);
        pouch.position.set(px, 0.22, 0.145);
        torso.add(pouch);
      }
    }
    if (kind === 'neo') {
      // strapped arsenal under the coat: harness + holstered weapons,
      // barrels down, grips back, snug against the chest (B6)
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.46, 0.2), m.black);
        strap.position.set(sx * 0.1, 0.32, 0);
        strap.rotation.z = -sx * 0.2;
        torso.add(strap);
        // B6: muzzles hang straight down, grips angled back along the ribs —
        // Rz(PI) rolls the weapon about its own barrel so the grip faces aft
        // instead of jutting forward out of the coat.
        const hg1 = pistolMesh(m);
        hg1.scale.setScalar(0.8);
        hg1.position.set(sx * 0.19, 0.3, 0.015);
        hg1.rotation.set(-Math.PI / 2, 0, Math.PI + sx * 0.14);
        torso.add(hg1);
        const hg2 = smgMesh(m);
        hg2.scale.setScalar(0.5);
        hg2.position.set(sx * 0.155, 0.1, -0.02);
        hg2.rotation.set(-Math.PI / 2 + 0.1, 0, Math.PI - sx * 0.1);
        torso.add(hg2);
      }
    }
    if (isW) {
      // thigh holster strap (right thigh)
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.01, 6, 12), m.black);
      strap.rotation.x = Math.PI / 2;
      strap.position.set(0.11, -0.18, 0);
      hips.add(strap);
      const hol = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), m.black);
      hol.position.set(0.165, -0.19, 0.01);
      hips.add(hol);
    }

    // ---------------------------------------------------------- head ---
    const head = new THREE.Group();
    head.position.y = 0.62;
    torso.add(head);
    // A11: skull, brow, cheekbones, nose, lips and jaw are one sculpted
    // surface — see sculptedHead(). Only the ears are separate.
    const skull = sculptedHead(skin, isW);
    skull.position.set(0, 0.108, 0.004);
    head.add(skull);
    for (const ex of [-1, 1]) {
      const ear = ellipsoid(skin, 0.019, 0.42, 1.05, 0.72, ex * 0.079, 0.104, -0.004, 8);
      ear.rotation.z = ex * 0.12;
      head.add(ear);
    }
    // a faint shadow in the mouth line; the lips themselves are sculpted
    const lipMat = (skin as THREE.MeshStandardMaterial).clone();
    lipMat.color.offsetHSL(0, 0.05, -0.16);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.005), lipMat);
    lip.position.set(0, 0.0665, 0.1);
    head.add(lip);
    if (kind === 'guard' || kind === 'soldier') {
      // visible eyes + brows (the protagonists wear sunglasses instead)
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), m.black);
        eye.position.set(sx * 0.036, 0.122, 0.092);
        head.add(eye);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.01), m.trouser);
        brow.position.set(sx * 0.038, 0.145, 0.092);
        brow.rotation.z = -sx * 0.15;
        head.add(brow);
      }
      // hairline around the back and sides under cap/helmet
      const hairBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.099, 0.096, 0.055, 12, 1, true, Math.PI * 0.3, Math.PI * 1.4),
        m.black,
      );
      hairBand.position.set(0, 0.155, -0.004);
      head.add(hairBand);
      // sideburns
      for (const sx of [-1, 1]) {
        const burn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.03), m.black);
        burn.position.set(sx * 0.092, 0.135, 0.015);
        head.add(burn);
      }
    }

    if (kind === 'neo' || isW) {
      // narrow dark sunglasses: two lenses, bridge, temples to the ears
      const lensGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.009, 12);
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(lensGeo, m.black);
        lens.rotation.x = Math.PI / 2;
        lens.scale.set(1.25, 1, 0.72);
        lens.position.set(sx * 0.043, 0.128, 0.092);
        head.add(lens);
        const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6), m.black);
        temple.rotation.x = Math.PI / 2;
        temple.position.set(sx * 0.085, 0.128, 0.04);
        head.add(temple);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.008), m.black);
      bridge.position.set(0, 0.132, 0.096);
      head.add(bridge);
    }
    if (kind === 'neo') {
      // short dark hair: top dome
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.103, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), m.black);
      hair.position.y = 0.135;
      hair.scale.set(0.96, 0.95, 1.02);
      head.add(hair);
    }
    if (isW) {
      // slicked-back hair + bun
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), m.latex);
      hair.position.set(0, 0.125, -0.012);
      hair.scale.set(0.98, 1.02, 1.06);
      head.add(hair);
      head.add(ellipsoid(m.latex, 0.042, 1, 1, 1, 0, 0.1, -0.115, 10));
    }
    if (kind === 'guard') {
      // B9: a uniform peaked cap. What was here was a wide flat-topped
      // cylinder with an all-round rim — a pillbox — and it had been left at
      // its old radius when A11 narrowed the skull, so it overhung the head
      // on both sides. Now: a crown raked so it stands taller at the front, a
      // contrasting band at the base, a visor at the FRONT ONLY angled down,
      // and a badge above the band. It is parented to the head group, so it
      // follows head rotation in every pose, downed guards included.
      const cap = new THREE.Group();
      cap.position.set(0, 0.163, 0.004);
      cap.rotation.x = -0.13; // forward rake: taller at the front
      head.add(cap);
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.108, 0.089, 0.058, 20), m.darkCloth,
      );
      crown.scale.set(1.0, 1, 0.93);
      crown.position.y = 0.04;
      cap.add(crown);
      // flat top, slightly domed so it is not a perfect disc
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.108, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), m.darkCloth,
      );
      top.scale.set(1.0, 0.16, 0.93);
      top.position.y = 0.068;
      cap.add(top);
      // contrasting band around the base of the crown
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0945, 0.0925, 0.026, 20), m.black,
      );
      band.scale.set(1.0, 1, 0.94);
      band.position.y = 0.006;
      cap.add(band);
      // visor: a front-only arc (theta centred on +Z, the facing direction),
      // projecting forward and tipped down
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.125, 0.125, 0.017, 20, 1, false, -Math.PI * 0.29, Math.PI * 0.58),
        m.black,
      );
      visor.scale.set(0.84, 1, 1.16);
      visor.position.set(0, -0.001, 0.016);
      visor.rotation.x = 0.3; // angled down over the brow
      cap.add(visor);
      // badge on the front of the crown, just above the band
      const badgeC = new THREE.Mesh(
        new THREE.CylinderGeometry(0.017, 0.017, 0.005, 8), m.brass,
      );
      badgeC.rotation.set(Math.PI / 2 - 0.1, 0, 0);
      badgeC.position.set(0, 0.036, 0.09);
      cap.add(badgeC);
    }
    if (kind === 'soldier') {
      // combat helmet: dome + rim + chin strap
      // B9: sized to sit ON the skull. At the old radius it floated as a
      // hemisphere above the (A11-narrowed) head.
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m.black,
      );
      dome.position.y = 0.125;
      dome.scale.set(1.0, 1.0, 1.14);
      head.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.013, 8, 20), m.black);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.118;
      rim.scale.set(1.0, 1.14, 1);
      head.add(rim);
      const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.014), m.black);
      strapL.position.set(-0.09, 0.05, 0.01);
      head.add(strapL);
      const strapR = strapL.clone();
      strapR.position.x = 0.09;
      head.add(strapR);
    }

    // ---------------------------------------------------------- arms ---
    const mkArm = (side: number): [THREE.Group, THREE.Group, Hand] => {
      const arm = new THREE.Group();
      // YXZ: yaw the shoulder first, then pitch. With the default XYZ order a
      // shoulder's rotation.y only rolls the limb, so aimArms could not swing
      // an arm sideways at all (B6). Every other pose leaves .y at 0, where
      // the two orders are identical.
      arm.rotation.order = 'YXZ';
      // arms hang close to the torso, so the body reads as one mass with
      // limbs rather than a torso with two balloons bolted on
      arm.position.set(side * (chestW + 0.012), 0.5, 0);
      torso.add(arm);
      const upperMat = kind === 'trin' ? m.latex : bodyMat;
      // deltoid at the top, tapering into the elbow — one continuous form
      arm.add(limbSeg(upperMat, 0.058, 0.0435, 0.3, 0.052));
      const fore = new THREE.Group();
      fore.position.y = -0.3;
      arm.add(fore);
      fore.add(limbSeg(upperMat, 0.0425, 0.034, 0.28));
      if (kind === 'neo') {
        // turned-back coat cuff, so the sleeve ends in a garment edge (A11)
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.047, 0.075, 12), m.coat);
        cuff.position.y = -0.25;
        fore.add(cuff);
      }
      const hand = this.buildHand(side, skin);
      hand.group.position.y = -0.285;
      fore.add(hand.group);
      return [arm, fore, hand];
    };
    const [armL, foreL, handL] = mkArm(-1);
    const [armR, foreR, handR] = mkArm(1);

    // ---------------------------------------------------------- legs ---
    const mkLeg = (side: number): [THREE.Group, THREE.Group] => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0, 0);
      hips.add(leg);
      leg.add(limbSeg(legMat, 0.082, 0.062, 0.45, 0.078));
      const shin = new THREE.Group();
      shin.position.y = -0.45;
      leg.add(shin);
      shin.add(limbSeg(legMat, 0.062, 0.046, 0.44));
      // calf belly so the lower leg is not a plain cone (A11)
      shin.add(ellipsoid(legMat, 0.058, 0.95, 1.5, 1.05, 0, -0.13, -0.014, 10));
      // A11 follow-up: a real boot instead of a ball on a plank — ankle
      // shaft, instep, tapered toe box, and a sole with a distinguishable
      // heel. Four landmarks, still low-poly.
      const boot = new THREE.Group();
      boot.position.set(0, -0.4, 0.01);
      // shaft rising above the ankle joint
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.13, 12), m.black);
      shaft.scale.set(1, 1, 0.92);
      shaft.position.set(0, 0.028, -0.012);
      // instep: the arch of the foot from ankle to toe box
      const instep = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.068, 0.13), m.black);
      instep.position.set(0, -0.038, 0.028);
      instep.rotation.x = -0.1;
      // toe box: tapered forward and slightly down, not a sphere
      const toeGeo = new THREE.BoxGeometry(0.088, 0.052, 0.085);
      const tp = toeGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        if (tp.getZ(i) > 0) { // front face pulled in and dropped
          tp.setX(i, tp.getX(i) * 0.72);
          tp.setY(i, tp.getY(i) * 0.66 - 0.008);
        }
      }
      toeGeo.computeVertexNormals();
      const toe = new THREE.Mesh(toeGeo, m.black);
      toe.position.set(0, -0.056, 0.115);
      // sole: thin under the forefoot...
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.014, 0.2), m.black);
      sole.position.set(0, -0.085, 0.062);
      // ...with a thicker heel block at the back
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.032, 0.072), m.black);
      heel.position.set(0, -0.076, -0.028);
      boot.add(shaft, instep, toe, sole, heel);
      shin.add(boot);
      return [leg, shin];
    };
    const [legL, shinL] = mkLeg(-1);
    const [legR, shinR] = mkLeg(1);

    const rig: Rig = {
      root, tilt, hips, torso, head,
      armL, foreL, armR, foreR, legL, shinL, legR, shinR,
      handL, handR,
    };

    // ------------------------------------------------- long draped coat ---
    if (kind === 'neo') {
      // raised collar
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.105, 0.09, 12, 1, true, Math.PI * 0.6, Math.PI * 1.8),
        m.coat,
      );
      collar.material = m.coat;
      collar.position.set(0, 0.58, -0.01);
      torso.add(collar);
      // skirt: one wrapped shell from the waist down, open at the front
      const coatBack = new THREE.Group();
      // The skirt starts up at the chest and its top rim is narrower than the
      // torso, so it tucks inside the body instead of needing a separate yoke
      // ring — that ring read as a stiff bucket around the chest.
      coatBack.position.set(0, 0.46, -0.01);
      torso.add(coatBack);
      const skirtMat = (m.coat as THREE.MeshStandardMaterial).clone();
      skirtMat.side = THREE.DoubleSide;
      coatBack.add(coatSkirt(skirtMat, 0.172, 0.30, 1.36, 7, 0.05));
      const mkFront = (side: number) => {
        const p = new THREE.Group();
        p.position.set(side * 0.11, 0.3, 0.075);
        torso.add(p);
        const panel = foldedPanel(m.coat, 0.24, 1.2, 3, 0.028, side * 0.8, 0.95, 1.45);
        panel.position.x = -side * 0.055;
        p.add(panel);
        return p;
      };
      // A11: lapels lie ON the chest — the earlier version stuck flaps out
      // into the air beside the shoulder.
      for (const sx of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.27, 0.011), m.coat);
        lapel.position.set(sx * 0.058, 0.4, 0.1);
        lapel.rotation.set(0.08, -sx * 0.1, sx * 0.18);
        torso.add(lapel);
      }
      // buttoned overlap running down the centre of the chest
      const placket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.013), m.coat);
      placket.position.set(0.022, 0.33, 0.113);
      placket.rotation.x = 0.05;
      torso.add(placket);

      rig.coatBack = coatBack;
      rig.coatFL = mkFront(-1);
      rig.coatFR = mkFront(1);
    }

    // hand weapons
    if (kind === 'neo' || kind === 'trin') {
      // barrel along the hand's reach axis, magazine/grip toward the palm
      // (Euler XYZ: the z-roll is applied first, then the x-pitch) — B6
      const gunR = pistolMesh(m);
      gunR.position.set(0, -0.08, -0.01);
      gunR.rotation.set(-Math.PI / 2 + 0.12, 0, Math.PI);
      handR.group.add(gunR);
      const gunL = pistolMesh(m);
      gunL.position.set(0, -0.08, -0.01);
      gunL.rotation.set(-Math.PI / 2 + 0.12, 0, Math.PI);
      handL.group.add(gunL);
      gunL.visible = gunR.visible = false;
      gunL.userData.rest = gunL.quaternion.clone();
      gunR.userData.rest = gunR.quaternion.clone();
      rig.gunL = gunL;
      rig.gunR = gunR;
    }
    if (kind === 'soldier') {
      const gun = smgMesh(m);
      gun.position.set(0, -0.09, -0.03);
      // barrel forward along the aim, magazine raking down-forward (B6)
      gun.rotation.set(-Math.PI / 2 + 0.1, 0, Math.PI);
      handR.group.add(gun);
      gun.userData.rest = gun.quaternion.clone();
      rig.gunR = gun;
    }

    return rig;
  }

  // ------------------------------------------------------------- update ---

  /** Apply the simulation pose. */
  update(actor: ActorSim, simT: number) {
    const r = this.rig;
    const p = actor.pose;
    if (p.action === 'hidden') {
      r.root.visible = false;
      return;
    }
    r.root.visible = true;
    r.root.position.set(p.pos[0], p.pos[1], p.pos[2]);
    r.root.rotation.set(0, p.yaw, 0);

    // reset joints (cheap)
    r.tilt.rotation.set(0, 0, 0);
    r.tilt.position.set(0, 0, 0);
    r.hips.position.y = HIP_Y;
    r.torso.rotation.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    for (const j of [r.armL, r.armR]) j.rotation.set(0, 0, 0);
    r.foreL.rotation.set(0, 0, 0);
    r.foreR.rotation.set(0, 0, 0);
    for (const j of [r.legL, r.legR]) j.rotation.set(0, 0, 0);
    r.shinL.rotation.set(0, 0, 0);
    r.shinR.rotation.set(0, 0, 0);

    // walk cycle phase from distance traveled
    if (this.prevPos) {
      const d = Math.hypot(p.pos[0] - this.prevPos[0], p.pos[2] - this.prevPos[2]);
      this.stridePhase += d * 4.4;
    }
    this.prevPos = [...p.pos];
    const c = this.stridePhase;

    if (r.gunL) r.gunL.visible = this.gunsVisible;
    if (r.gunR && this.kind !== 'soldier') r.gunR.visible = this.gunsVisible;
    // the aim swivel is applied fresh each frame, never accumulated (B6)
    for (const g of [r.gunL, r.gunR]) {
      if (g && g.userData.rest) g.quaternion.copy(g.userData.rest);
    }

    // B6: for a moment after firing, the whole arm follows the round that
    // just left the barrel (soldiers shoot deliberately wide, so the target
    // point and the bullet's line are not the same).
    let aim = actor.aim;
    const recoil = !!this.shotDir && simT - this.shotT >= 0 && simT - this.shotT < SHOT_HOLD;
    if (recoil) {
      const d = this.shotDir!;
      aim = [p.pos[0] + d[0] * 8, p.pos[1] + 1.35 + d[1] * 8, p.pos[2] + d[2] * 8];
    }
    switch (p.action) {
      case 'idle':
      case 'talk':
        this.poseIdle(simT);
        break;
      case 'walk':
      case 'alert':
      case 'lunge':
        this.poseWalk(c, p.speed, false);
        break;
      case 'run':
        this.poseWalk(c, p.speed, true);
        break;
      case 'reveal':
        this.poseReveal(p.phase);
        break;
      case 'strike':
        this.poseStrike(p.phase);
        break;
      case 'kick':
        this.poseKick(p.phase);
        break;
      case 'land':
        this.poseLand(p.phase);
        break;
      case 'draw':
        this.poseDraw();
        break;
      case 'shootAdvance':
        this.poseWalk(c, p.speed, false);
        this.aimArms(actor, aim, true);
        break;
      case 'crouchFire':
        this.poseCrouch(p.phase);
        this.aimArms(actor, aim, true);
        break;
      case 'cartwheel':
        this.poseCartwheel(p.phase, actor, aim);
        break;
      case 'wallrun':
        this.poseWallrun(c, p.phase, actor, aim);
        break;
      case 'coverL':
      case 'coverR':
        this.poseCover(p.action === 'coverL' ? -1 : 1, p.phase, actor, aim);
        break;
      case 'discard':
        this.poseDiscard(p.phase);
        break;
      case 'dodge':
        this.poseDodge(p.phase);
        break;
      case 'cover':
        this.poseSoldierCover(p.phase, actor, aim);
        break;
      case 'lower':
        this.aimArms(actor, aim, true, 1 - p.phase);
        break;
      case 'survey':
        this.poseIdle(simT);
        r.head.rotation.y = Math.sin(simT * 0.7) * 0.5;
        break;
      case 'holster':
        this.poseHolster(p.phase);
        break;
      case 'fall_crumple':
        this.poseFallCrumple(ease(p.phase));
        break;
      case 'fall_drop':
        this.poseFallDrop(ease(p.phase));
        break;
      case 'fall_slide':
        this.poseFallSlide(ease(p.phase));
        break;
      default:
        this.poseIdle(simT);
    }

    // B6: with the pose final, aim the barrels along the character's aim
    const track = GUN_TRACK[p.action];
    const armed = !!(r.gunR?.visible || r.gunL?.visible);
    if (track !== undefined && armed) {
      // in cover the soldier only aims while leaning out
      const strength = p.action === 'cover' && !recoil ? clamp01((p.phase - 0.25) / 0.4) : 1;
      this.pointGunsAt(actor, aim, track, simT, strength);
    }

    // articulated hands: grip when armed, open for the coat reveal,
    // relaxed otherwise
    const targetCurl =
      this.kind === 'soldier' ? 0.85
        : this.gunsVisible ? 0.8
          : p.action === 'reveal' ? 0.08
            : p.action.startsWith('fall') ? 0.25
              : 0.45;
    this.curl = lerp(this.curl, targetCurl, 0.25);
    for (const hand of [r.handL, r.handR]) {
      hand.prox.rotation.x = -this.curl * 1.35;
      hand.dist.rotation.x = -this.curl * 1.5;
    }
    r.handL.thumb.rotation.x = -this.curl * 0.7;
    r.handR.thumb.rotation.x = -this.curl * 0.7;

    // coat dynamics: trail behind with speed, flare in acrobatics.
    // A9 secondary motion: the coat follows the LAGGED velocity, not the
    // instantaneous one, so it swings out a beat after he starts moving and
    // keeps swinging after he stops. The lag is filtered in the fixed-step
    // simulation, so it stays reproducible.
    if (r.coatBack && r.coatFL && r.coatFR) {
      const flare = p.action === 'cartwheel' ? 0.9 : p.action === 'kick' ? 0.7 : 0;
      const lag = actor.velLag ?? [0, 0, 0];
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const lagFwd = lag[0] * fx + lag[2] * fz;
      const lagSide = lag[0] * fz - lag[2] * fx;
      const sway = Math.sin(c) * 0.06 * Math.min(1, p.speed);
      const trail = Math.min(0.55, Math.abs(lagFwd) * 0.15) + flare * 0.4;
      r.coatBack.rotation.z = Math.max(-0.3, Math.min(0.3, -lagSide * 0.1));
      r.coatBack.rotation.x = trail * 0.55 + sway * 0.4;
      const open = this.coatOpen;
      r.coatFL.rotation.y = open * 1.1 + flare * 0.3;
      r.coatFR.rotation.y = -open * 1.1 - flare * 0.3;
      r.coatFL.rotation.x = -trail * 0.25 + sway;
      r.coatFR.rotation.x = -trail * 0.25 - sway;
    }
    // the head settles onto a new facing a little after the body does (A9)
    if (actor.velLag) {
      const dv = (actor.vel[0] - actor.velLag[0]) * Math.cos(p.yaw)
        - (actor.vel[2] - actor.velLag[2]) * Math.sin(p.yaw);
      r.head.rotation.z += Math.max(-0.12, Math.min(0.12, -dv * 0.045));
    }
  }

  /** Accumulated world rotation of `obj` (root -> obj), without a full
   *  updateMatrixWorld pass. */
  private chainQuat(obj: THREE.Object3D, out: THREE.Quaternion) {
    const chain: THREE.Object3D[] = [];
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
      chain.push(o);
      if (o === this.rig.root) break;
    }
    out.identity();
    for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].quaternion);
  }

  /**
   * B6: swivel the held weapons at the wrist so the barrel points along the
   * character's aim direction, whatever the body staging is doing. The
   * cartwheel and the wall run rotate the whole body, so without this the
   * muzzles fire sideways. The rotation is the minimal one (it does not roll
   * the grip) and is clamped to a plausible wrist range.
   */
  private pointGunsAt(actor: ActorSim, aim: V3 | null, maxRad: number, simT: number, strength = 1) {
    if (strength <= 0) return;
    const r = this.rig;
    const p = actor.pose;
    const fresh = this.shotDir && simT - this.shotT >= 0 && simT - this.shotT < SHOT_HOLD;
    if (fresh) {
      _vWant.set(this.shotDir![0], this.shotDir![1], this.shotDir![2]);
    } else if (aim) {
      _vWant.set(aim[0] - p.pos[0], aim[1] - (p.pos[1] + 1.35), aim[2] - p.pos[2]);
    } else {
      return;
    }
    if (_vWant.lengthSq() < 1e-6) return;
    _vWant.normalize();
    for (const g of [r.gunR, r.gunL]) {
      if (!g || !g.visible || !g.parent) continue;
      this.chainQuat(g.parent, _qChain);
      _vLocal.copy(_vWant).applyQuaternion(_qChain.invert()).normalize();
      _vCur.set(0, 0, -1).applyQuaternion(g.quaternion).normalize();
      _qDelta.setFromUnitVectors(_vCur, _vLocal);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_qDelta.w)));
      const k = strength * (ang > maxRad ? maxRad / ang : 1);
      if (k < 1) _qDelta.slerpQuaternions(_qIdent, _qDelta, k);
      g.quaternion.premultiply(_qDelta);
    }
  }

  // ------------------------------------------------------------- poses ---

  private poseIdle(simT: number) {
    const r = this.rig;
    r.torso.rotation.x = 0.02 + Math.sin(simT * 1.8) * 0.012;
    r.armL.rotation.z = 0.08;
    r.armR.rotation.z = -0.08;
    r.foreL.rotation.x = -0.12;
    r.foreR.rotation.x = -0.12;
  }

  private poseWalk(c: number, speed: number, run: boolean) {
    const r = this.rig;
    const amp = run ? 0.85 : Math.min(0.55, 0.28 + speed * 0.14);
    const s = Math.sin(c);
    r.legL.rotation.x = s * amp;
    r.legR.rotation.x = -s * amp;
    r.shinL.rotation.x = Math.max(0, -Math.sin(c - 0.6)) * amp * 1.4;
    r.shinR.rotation.x = Math.max(0, Math.sin(c - 0.6)) * amp * 1.4;
    r.hips.position.y = HIP_Y - (run ? 0.06 : 0.02) + Math.abs(Math.cos(c)) * 0.03;
    r.torso.rotation.x = run ? 0.32 : 0.04;
    if (!this.gunsVisible) {
      r.armL.rotation.x = -s * amp * 0.55;
      r.armR.rotation.x = s * amp * 0.55;
      r.foreL.rotation.x = -0.25;
      r.foreR.rotation.x = -0.25;
    }
  }

  private poseReveal(phase: number) {
    const r = this.rig;
    // sweep the coat open, hold it open, arms slightly spread
    const open = ease(phase * 2.4);
    this.coatOpen = Math.max(this.coatOpen, open);
    r.armL.rotation.z = 0.5 * open;
    r.armR.rotation.z = -0.5 * open;
    r.armL.rotation.x = -0.5 * open;
    r.armR.rotation.x = -0.5 * open;
    r.foreL.rotation.x = -0.4 * open;
    r.foreR.rotation.x = -0.4 * open;
    r.head.rotation.x = -0.06 * open;
  }

  private poseStrike(phase: number) {
    const r = this.rig;
    // two rapid palm strikes
    const p1 = Math.sin(Math.min(1, phase * 2) * Math.PI);
    const p2 = Math.sin(clamp01(phase * 2 - 1) * Math.PI);
    r.armR.rotation.x = -1.7 * p1 - 0.1;
    r.foreR.rotation.x = -0.3 + 0.2 * p1;
    r.armL.rotation.x = -1.7 * p2 - 0.1;
    r.foreL.rotation.x = -0.3 + 0.2 * p2;
    r.torso.rotation.y = 0.35 * p1 - 0.35 * p2;
    r.torso.rotation.x = 0.15;
    r.hips.position.y = HIP_Y - 0.08;
    r.legL.rotation.x = 0.25;
    r.legR.rotation.x = -0.3;
    r.shinR.rotation.x = 0.45;
  }

  private poseKick(phase: number) {
    const r = this.rig;
    // dash then flying side kick
    const jump = Math.sin(Math.PI * clamp01((phase - 0.35) / 0.65));
    r.tilt.position.y = jump * 0.85;
    r.tilt.rotation.x = -0.35 * jump;
    r.legR.rotation.x = -1.75 * jump;
    r.shinR.rotation.x = 0.15;
    r.legL.rotation.x = 0.9 * jump;
    r.shinL.rotation.x = 1.6 * jump;
    r.armL.rotation.z = 0.9 * jump;
    r.armR.rotation.z = -0.9 * jump;
    if (phase < 0.35) this.poseWalk(this.stridePhase, 6, true);
  }

  private poseLand(phase: number) {
    const r = this.rig;
    const k = 1 - ease(phase);
    r.hips.position.y = HIP_Y - 0.3 * k;
    r.legL.rotation.x = 0.7 * k;
    r.legR.rotation.x = 0.5 * k;
    r.shinL.rotation.x = 1.1 * k;
    r.shinR.rotation.x = 0.9 * k;
    r.torso.rotation.x = 0.3 * k;
  }

  private poseDraw() {
    const r = this.rig;
    r.armL.rotation.x = -0.9;
    r.armR.rotation.x = -0.9;
    r.foreL.rotation.x = -0.7;
    r.foreR.rotation.x = -0.7;
    r.torso.rotation.x = 0.1;
  }

  private poseCrouch(_phase: number) {
    const r = this.rig;
    r.hips.position.y = HIP_Y - 0.34;
    r.legL.rotation.x = 1.0;
    r.legR.rotation.x = 0.55;
    r.shinL.rotation.x = 1.5;
    r.shinR.rotation.x = 1.35;
    r.torso.rotation.x = 0.18;
  }

  private poseCartwheel(phase: number, actor: ActorSim, aim: V3 | null) {
    const r = this.rig;
    // full lateral rotation about the body's center of mass, arc up,
    // limbs spread, firing both guns
    const spin = phase * Math.PI * 2;
    r.tilt.rotation.z = spin;
    r.tilt.position.y = 1.02 + Math.sin(Math.PI * phase) * 0.5;
    r.hips.position.y = HIP_Y - 1.02;
    r.legL.rotation.z = 0.6;
    r.legR.rotation.z = -0.6;
    r.legL.rotation.x = 0.2;
    r.legR.rotation.x = -0.2;
    // arms spread wide, guns out
    r.armL.rotation.z = 1.35;
    r.armR.rotation.z = -1.35;
    r.foreL.rotation.x = -0.2;
    r.foreR.rotation.x = -0.2;
    void actor; void aim;
  }

  private poseWallrun(c: number, phase: number, actor: ActorSim, aim: V3 | null) {
    const r = this.rig;
    // B3: body fully HORIZONTAL, parallel to the floor, boots on the wall.
    // Root sits at the foot-contact point on the wall (x=-8); with the rig
    // facing -Z, tilt.z = +PI/2 maps local up onto world +X (into the hall).
    const horiz = ease(clamp01((phase - 0.04) / 0.22)) * (1 - ease(clamp01((phase - 0.86) / 0.14)));
    r.tilt.rotation.z = 1.5 * horiz;
    // planted back leg: bent, boot flat against the wall surface
    r.legR.rotation.x = (0.95 + Math.sin(c * 1.3) * 0.1) * horiz;
    r.shinR.rotation.x = 1.4 * horiz;
    // front leg extended mid-stride
    r.legL.rotation.x = (-1.05 - Math.sin(c * 1.3) * 0.18) * horiz;
    r.shinL.rotation.x = 0.3 * horiz;
    r.torso.rotation.x = 0.12 * horiz;
    // right arm fires across the hall (world +X = local up when horizontal)
    r.armR.rotation.z = -2.5 * horiz;
    r.armR.rotation.x = -0.12;
    r.foreR.rotation.x = -0.15;
    // left arm trails along the body line
    r.armL.rotation.z = 0.55 * horiz;
    r.armL.rotation.x = -0.45 * horiz;
    // head turned to watch the hall / her targets
    r.head.rotation.x = -0.4 * horiz;
    void actor;
    void aim;
  }

  private poseCover(side: number, lean: number, actor: ActorSim, aim: V3 | null) {
    const r = this.rig;
    // pressed near column; lean out to fire, tuck back to reload posture
    r.tilt.position.x = side * lean * 0.55;
    r.tilt.rotation.z = -side * lean * 0.18;
    if (lean > 0.35) {
      this.aimArms(actor, aim, true, Math.min(1, (lean - 0.35) / 0.4));
    } else {
      // weapon held ready at the chest
      r.armR.rotation.x = -0.72;
      r.foreR.rotation.x = -1.25;
      r.armL.rotation.x = -0.6;
      r.foreL.rotation.x = -1.35;
    }
    r.legL.rotation.x = 0.12;
    r.legR.rotation.x = -0.1;
  }

  private poseDiscard(phase: number) {
    const r = this.rig;
    if (phase < 0.35) {
      // fling both guns aside
      const k = Math.sin((phase / 0.35) * Math.PI);
      r.armL.rotation.x = -0.5 - k * 0.9;
      r.armR.rotation.x = -0.5 - k * 0.9;
      r.armL.rotation.z = 0.9 * k;
      r.armR.rotation.z = -0.9 * k;
    } else if (phase < 0.75) {
      // reach under the coat
      const k = ease((phase - 0.35) / 0.4);
      r.armL.rotation.x = -1.1 * k;
      r.armR.rotation.x = -1.1 * k;
      r.foreL.rotation.x = -1.4 * k;
      r.foreR.rotation.x = -1.4 * k;
      r.torso.rotation.x = 0.12 * k;
    } else {
      this.poseDraw();
    }
  }

  /** A5: the iconic extreme lean-back under passing fire (pivots at heels). */
  private poseDodge(k: number) {
    const r = this.rig;
    const lean = ease(clamp01((k - 0.16) / 0.26)) * (1 - ease(clamp01((k - 0.74) / 0.2)));
    r.tilt.rotation.x = -1.02 * lean;
    // braced legs: front leg extended, back leg folded under
    r.legL.rotation.x = 0.85 * lean;
    r.shinL.rotation.x = 1.05 * lean;
    r.legR.rotation.x = 0.3 * lean;
    r.shinR.rotation.x = 0.55 * lean;
    r.hips.position.y = HIP_Y - 0.18 * lean;
    // arched back, head held up watching the rounds pass
    r.torso.rotation.x = -0.3 * lean;
    r.head.rotation.x = 0.55 * lean;
    // arms flung out and back, guns still in hand
    r.armL.rotation.z = 1.15 * lean;
    r.armR.rotation.z = -1.25 * lean;
    r.armL.rotation.x = -0.35 * lean;
    r.armR.rotation.x = -0.45 * lean;
    r.foreL.rotation.x = -0.25 * lean;
    r.foreR.rotation.x = -0.2 * lean;
  }

  private poseSoldierCover(lean: number, actor: ActorSim, aim: V3 | null) {
    const r = this.rig;
    // crouched behind the column, leaning out to fire bursts
    r.hips.position.y = HIP_Y - 0.28 + lean * 0.16;
    r.legL.rotation.x = 0.9 - lean * 0.4;
    r.legR.rotation.x = 0.5 - lean * 0.2;
    r.shinL.rotation.x = 1.3 - lean * 0.5;
    r.shinR.rotation.x = 1.2 - lean * 0.5;
    if (lean > 0.25) {
      this.aimArms(actor, aim, false, Math.min(1, (lean - 0.25) / 0.4));
    } else {
      r.armR.rotation.x = -0.85;
      r.foreR.rotation.x = -1.0;
      r.armL.rotation.x = -0.7;
      r.foreL.rotation.x = -1.15;
    }
  }

  private poseHolster(phase: number) {
    const r = this.rig;
    const k = 1 - ease(phase);
    r.armL.rotation.x = -0.9 * k;
    r.armR.rotation.x = -0.9 * k;
    r.foreL.rotation.x = -0.6 * k;
    r.foreR.rotation.x = -0.6 * k;
    if (phase > 0.7 && this.rig.gunL) {
      this.gunsVisible = false;
    }
  }

  private poseFallCrumple(k: number) {
    const r = this.rig;
    // knees buckle, then the body rolls onto its side on the floor
    r.hips.position.y = HIP_Y - 0.82 * k;
    r.legL.rotation.x = 1.15 * k;
    r.legR.rotation.x = 0.85 * k;
    r.shinL.rotation.x = 1.7 * k;
    r.shinR.rotation.x = 1.5 * k;
    r.torso.rotation.x = 0.85 * k;
    r.head.rotation.x = 0.45 * k;
    r.armL.rotation.z = 0.5 * k;
    r.armR.rotation.z = -0.6 * k;
    r.tilt.rotation.y = 0.35 * k;
    r.tilt.rotation.z = 0.75 * k;
    r.tilt.rotation.x = 0.3 * k;
  }

  private poseFallDrop(k: number) {
    const r = this.rig;
    // knocked flat onto the back (pivots at the heels)
    r.tilt.rotation.x = -1.52 * k;
    r.tilt.position.y = -0.06 * k;
    r.armL.rotation.z = 0.9 * k;
    r.armR.rotation.z = -1.1 * k;
    r.armL.rotation.x = -0.4 * k;
    r.armR.rotation.x = -0.3 * k;
    r.legL.rotation.x = 0.25 * k;
    r.legR.rotation.x = 0.12 * k;
    r.head.rotation.x = 0.3 * k;
  }

  private poseFallSlide(k: number) {
    const r = this.rig;
    // back against the column, sliding down to a seated slump
    r.hips.position.y = HIP_Y - 0.62 * k;
    r.torso.rotation.x = -0.12 * k;
    r.legL.rotation.x = -1.35 * k;
    r.legR.rotation.x = -1.15 * k;
    r.shinL.rotation.x = 0.4 * k;
    r.shinR.rotation.x = 0.6 * k;
    r.head.rotation.x = 0.55 * k;
    r.armL.rotation.z = 0.3 * k;
    r.armR.rotation.z = -0.35 * k;
    r.torso.position.z = -0.06 * k;
  }

  /**
   * Point arms (and guns) at the aim target. strength fades the pose in/out.
   */
  private aimArms(
    actor: ActorSim, aim: V3 | null, dual: boolean, strength = 1, only?: 'L' | 'R',
  ) {
    const r = this.rig;
    if (!aim) return;
    const p = actor.pose;
    // convert aim to pitch relative to shoulder height + yaw delta
    const dx = aim[0] - p.pos[0];
    const dz = aim[2] - p.pos[2];
    const dy = aim[1] - (p.pos[1] + 1.42);
    const dist = Math.hypot(dx, dz);
    const worldYaw = Math.atan2(dx, dz);
    let dYaw = worldYaw - p.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    dYaw = Math.max(-1.15, Math.min(1.15, dYaw));
    const pitch = Math.atan2(dy, dist);
    const armX = -(Math.PI / 2) - pitch * 0.9;
    const s = strength;
    if (only !== 'L') {
      r.armR.rotation.x = lerp(r.armR.rotation.x, armX, s);
      r.armR.rotation.y = lerp(r.armR.rotation.y, dYaw * 0.9, s);
      r.foreR.rotation.x = lerp(r.foreR.rotation.x, 0.05, s);
    }
    if (dual && only !== 'R') {
      r.armL.rotation.x = lerp(r.armL.rotation.x, armX, s);
      r.armL.rotation.y = lerp(r.armL.rotation.y, dYaw * 0.9 + 0.12, s);
      r.foreL.rotation.x = lerp(r.foreL.rotation.x, 0.05, s);
    }
    r.torso.rotation.y = dYaw * 0.35 * s;
    r.head.rotation.y = dYaw * 0.5 * s;
  }
}
