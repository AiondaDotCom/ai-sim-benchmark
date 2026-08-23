/**
 * Procedural articulated characters (requirement A2: beyond box primitives).
 * Smoothed low-poly anatomy built entirely in code: tapered capsule limbs
 * with joint spheres, ellipsoid heads with nose/jaw/ears, real sunglasses
 * (lenses + temples), caps with round brims, helmets with rims, articulated
 * two-phalanx hands with thumbs, and a long coat whose panels are corrugated
 * fold-geometry that drapes and flares.
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

// ------------------------------------------------------- geometry helpers --

/** Tapered limb segment with a rounded joint sphere at the pivot. */
function limbSeg(
  mat: THREE.Material, rTop: number, rBot: number, len: number, jointR?: number,
): THREE.Group {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10, 1), mat);
  cyl.position.y = -len / 2;
  g.add(cyl);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(jointR ?? rTop * 1.12, 10, 8), mat);
  g.add(joint);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(rBot * 1.02, 10, 8), mat);
  cap.position.y = -len;
  g.add(cap);
  return g;
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
    pos.setX(i, x * (1 + 0.22 * v));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  return m;
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

  constructor(kind: CharKind, mats: Mats, scene: THREE.Object3D) {
    this.kind = kind;
    this.mats = mats;
    this.rig = this.build();
    scene.add(this.rig.root);
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
      : kind === 'guard' ? m.blueShirt : m.darkCloth;
    const legMat = kind === 'guard' ? m.darkCloth : kind === 'trin' ? m.latex : m.trouser;
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
    const chestW = kind === 'soldier' ? 0.21 : isW ? 0.165 : 0.19;
    // chest: capsule squashed into a smooth trunk
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.3, 6, 14), bodyMat);
    chest.position.y = 0.29;
    chest.scale.set(chestW / 0.155, 1.0, 0.62);
    torso.add(chest);
    // waist filler bridging chest and hips (covers the pelvis top)
    torso.add(ellipsoid(bodyMat, 0.155, (chestW + 0.005) / 0.155, 1.0, 0.6, 0, 0.02, 0));
    // shoulders
    torso.add(ellipsoid(bodyMat, 0.06, 1, 1, 1, -(chestW + 0.03), 0.5, 0, 10));
    torso.add(ellipsoid(bodyMat, 0.06, 1, 1, 1, chestW + 0.03, 0.5, 0, 10));
    // neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.09, 10), skin);
    neck.position.y = 0.58;
    torso.add(neck);

    if (kind === 'guard') {
      // tie with knot, duty belt, holster, badge
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.02), m.black);
      knot.position.set(0, 0.5, 0.105);
      torso.add(knot);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.014), m.black);
      tie.position.set(0, 0.36, 0.117);
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
      // strapped arsenal under the coat: harness + holstered guns
      for (const sx of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.46, 0.2), m.black);
        strap.position.set(sx * 0.1, 0.32, 0);
        strap.rotation.z = -sx * 0.2;
        torso.add(strap);
        const hg1 = pistolMesh(m);
        hg1.scale.setScalar(0.85);
        hg1.position.set(sx * 0.15, 0.24, 0.12);
        hg1.rotation.z = sx * 1.35;
        torso.add(hg1);
        const hg2 = smgMesh(m);
        hg2.scale.setScalar(0.6);
        hg2.position.set(sx * 0.12, 0.02, 0.11);
        hg2.rotation.z = sx * 1.5;
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
    // skull + jaw + nose + ears
    head.add(ellipsoid(skin, 0.1, 0.94, 1.12, 1.0, 0, 0.115, 0.005, 14));
    head.add(ellipsoid(skin, 0.055, 0.98, 0.72, 0.85, 0, 0.035, 0.028, 10)); // jaw/chin
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.038, 6), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.095, 0.102);
    head.add(nose);
    head.add(ellipsoid(skin, 0.02, 0.5, 1, 0.8, -0.093, 0.1, 0, 8));
    head.add(ellipsoid(skin, 0.02, 0.5, 1, 0.8, 0.093, 0.1, 0, 8));
    // lip line so the lower face reads
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.008), m.trouser);
    lip.position.set(0, 0.052, 0.088);
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
      // peaked cap: crown, band, round brim
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.118, 0.07, 14), m.darkCloth);
      crown.position.y = 0.235;
      head.add(crown);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.112, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.35), m.darkCloth);
      top.position.y = 0.255;
      top.scale.set(1.06, 0.55, 1.06);
      head.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.022, 14), m.black);
      band.position.y = 0.205;
      head.add(band);
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.125, 0.125, 0.01, 12, 1, false, Math.PI * 0.62, Math.PI * 0.76),
        m.black,
      );
      brim.position.set(0, 0.198, 0.03);
      brim.scale.set(1, 1, 1.3);
      head.add(brim);
    }
    if (kind === 'soldier') {
      // combat helmet: dome + rim + chin strap
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), m.black);
      dome.position.y = 0.13;
      dome.scale.set(1.06, 0.92, 1.18);
      head.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.011, 6, 16), m.black);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.115;
      rim.scale.set(1.04, 1.16, 1);
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
      arm.position.set(side * (chestW + 0.055), 0.5, 0);
      torso.add(arm);
      const upperMat = kind === 'trin' ? m.latex : bodyMat;
      arm.add(limbSeg(upperMat, 0.06, 0.05, 0.3, 0.068));
      const fore = new THREE.Group();
      fore.position.y = -0.3;
      arm.add(fore);
      fore.add(limbSeg(upperMat, 0.049, 0.038, 0.28));
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
      shin.add(limbSeg(legMat, 0.058, 0.048, 0.44));
      // boot: shaft + body + rounded toe, one connected form
      const boot = new THREE.Group();
      boot.position.set(0, -0.4, 0.01);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.09, 10), m.black);
      shaft.position.set(0, 0.0, -0.01);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.075, 0.17), m.black);
      body.position.set(0, -0.045, 0.02);
      const toe = ellipsoid(m.black, 0.047, 1, 0.8, 1.35, 0, -0.055, 0.1, 10);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.016, 0.25), m.black);
      sole.position.set(0, -0.082, 0.045);
      boot.add(shaft, body, toe, sole);
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
      // back panel with folds
      const coatBack = new THREE.Group();
      coatBack.position.set(0, 0.52, -0.15);
      torso.add(coatBack);
      const back = foldedPanel(m.coat, 0.5, 1.38, 5, 0.035);
      coatBack.add(back);
      // side skirts filling the gap between back and front panels
      for (const sx of [-1, 1]) {
        const sidePanel = foldedPanel(m.coat, 0.2, 1.3, 2, 0.028, 1.3);
        sidePanel.rotation.y = sx * Math.PI * 0.42;
        sidePanel.position.set(sx * 0.26, 0, 0.07);
        coatBack.add(sidePanel);
      }
      const mkFront = (side: number) => {
        const p = new THREE.Group();
        p.position.set(side * 0.2, 0.52, 0.1);
        torso.add(p);
        const panel = foldedPanel(m.coat, 0.26, 1.32, 3, 0.03, side * 0.8);
        panel.position.x = -side * 0.11;
        p.add(panel);
        return p;
      };
      rig.coatBack = coatBack;
      rig.coatFL = mkFront(-1);
      rig.coatFR = mkFront(1);
    }

    // hand weapons
    if (kind === 'neo' || kind === 'trin') {
      const gunR = pistolMesh(m);
      gunR.position.set(0, -0.075, -0.02);
      gunR.rotation.x = -0.15;
      handR.group.add(gunR);
      const gunL = pistolMesh(m);
      gunL.position.set(0, -0.075, -0.02);
      gunL.rotation.x = -0.15;
      handL.group.add(gunL);
      gunL.visible = gunR.visible = false;
      rig.gunL = gunL;
      rig.gunR = gunR;
    }
    if (kind === 'soldier') {
      const gun = smgMesh(m);
      gun.position.set(0, -0.08, -0.06);
      gun.rotation.x = -0.1;
      handR.group.add(gun);
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

    const aim = actor.aim;
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

    // coat dynamics: trail behind with speed, flare in acrobatics
    if (r.coatBack && r.coatFL && r.coatFR) {
      const flare = p.action === 'cartwheel' ? 0.9 : p.action === 'kick' ? 0.7 : 0;
      const sway = Math.sin(c) * 0.06 * Math.min(1, p.speed);
      const trail = Math.min(0.5, p.speed * 0.14) + flare * 0.4;
      r.coatBack.rotation.x = trail * 0.55 + sway * 0.4;
      const open = this.coatOpen;
      r.coatFL.rotation.y = open * 1.1 + flare * 0.3;
      r.coatFR.rotation.y = -open * 1.1 - flare * 0.3;
      r.coatFL.rotation.x = -trail * 0.25 + sway;
      r.coatFR.rotation.x = -trail * 0.25 - sway;
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
    // tilted into the wall (wall on the left, x = -8)
    r.tilt.rotation.z = -0.62 * Math.sin(Math.PI * Math.min(1, phase * 1.2));
    const s = Math.sin(c * 1.4);
    r.legL.rotation.x = s * 1.0;
    r.legR.rotation.x = -s * 1.0;
    r.shinL.rotation.x = Math.max(0, -Math.sin(c * 1.4 - 0.6)) * 1.3;
    r.shinR.rotation.x = Math.max(0, Math.sin(c * 1.4 - 0.6)) * 1.3;
    r.torso.rotation.x = 0.25;
    // right arm fires across the hall
    this.aimArms(actor, aim, true, 1, 'R');
    r.armL.rotation.z = 0.8;
    r.armL.rotation.x = 0.4;
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
    dYaw = Math.max(-0.9, Math.min(0.9, dYaw));
    const pitch = Math.atan2(dy, dist);
    const armX = -(Math.PI / 2) - pitch * 0.9;
    const s = strength;
    if (only !== 'L') {
      r.armR.rotation.x = lerp(r.armR.rotation.x, armX, s);
      r.armR.rotation.y = lerp(r.armR.rotation.y, dYaw * 0.85, s);
      r.foreR.rotation.x = lerp(r.foreR.rotation.x, 0.05, s);
    }
    if (dual && only !== 'R') {
      r.armL.rotation.x = lerp(r.armL.rotation.x, armX, s);
      r.armL.rotation.y = lerp(r.armL.rotation.y, dYaw * 0.85 + 0.12, s);
      r.foreL.rotation.x = lerp(r.foreL.rotation.x, 0.05, s);
    }
    r.torso.rotation.y = dYaw * 0.35 * s;
    r.head.rotation.y = dYaw * 0.5 * s;
  }
}
