/** Characters. The rig from `sim/rig.ts` is realised as a tree of Object3Ds with
 *  a box per bone; the simulation supplies nothing but joint angles. Costume,
 *  weapons and the swinging coat are all built here. */
import * as THREE from 'three';
import { RIG, J, type Pose } from '../sim/rig.ts';
import { COAT_COLUMNS, COAT_ROWS, type Actor } from '../sim/world.ts';
import type { TextureSet } from './textures.ts';

export type Role = Actor['role'];

export interface CharacterMaterials {
  coat: THREE.Material;
  latex: THREE.Material;
  skin: THREE.Material;
  hair: THREE.Material;
  shades: THREE.Material;
  shirt: THREE.Material;
  trousers: THREE.Material;
  boot: THREE.Material;
  combat: THREE.Material;
  vest: THREE.Material;
  gunmetal: THREE.Material;
  tie: THREE.Material;
  cap: THREE.Material;
}

const rep = (t: THREE.Texture, x: number, y: number) => {
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  return c;
};

export function buildCharacterMaterials(tex: TextureSet): CharacterMaterials {
  return {
    coat: new THREE.MeshStandardMaterial({ map: rep(tex.coat, 2, 3), color: 0x24282d, roughness: 0.7 }),
    latex: new THREE.MeshStandardMaterial({ map: rep(tex.latex, 1, 2), color: 0x16181d, roughness: 0.24, metalness: 0.12 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc9a68e, roughness: 0.72 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x14100f, roughness: 0.62 }),
    shades: new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.3, metalness: 0.45 }),
    shirt: new THREE.MeshStandardMaterial({ map: rep(tex.uniform, 2, 2), color: 0xa8c6dd, roughness: 0.8 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.85 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5 }),
    combat: new THREE.MeshStandardMaterial({ map: rep(tex.combat, 2, 2), color: 0x3a403c, roughness: 0.88 }),
    vest: new THREE.MeshStandardMaterial({ map: rep(tex.combat, 1, 1), color: 0x1b1f1e, roughness: 0.75 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.36, metalness: 0.82 }),
    tie: new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.7 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x1d2530, roughness: 0.7 }),
  };
}

function boneMesh(
  len: number,
  thick: [number, number],
  axis: 'up' | 'down' | 'forward',
  mat: THREE.Material,
  scale = 1,
): THREE.Mesh {
  const w = thick[0] * scale;
  const d = thick[1] * scale;
  let geo: THREE.BoxGeometry;
  const m = new THREE.Mesh();
  if (axis === 'forward') {
    geo = new THREE.BoxGeometry(w, d * 0.75, len);
    m.position.set(0, -d * 0.3, len * 0.35);
  } else {
    geo = new THREE.BoxGeometry(w, len, d);
    m.position.y = axis === 'up' ? len / 2 : -len / 2;
  }
  m.geometry = geo;
  m.material = mat;
  m.castShadow = true;
  return m;
}

function buildPistol(mats: CharacterMaterials): THREE.Group {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.20), mats.gunmetal);
  slide.position.z = 0.05;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.115, 0.05), mats.gunmetal);
  grip.position.set(0, -0.075, -0.015);
  grip.rotation.x = -0.22;
  g.add(slide, grip);
  g.rotation.x = 0.3257; // align with the simulation's muzzle direction
  return g;
}

function buildSmg(mats: CharacterMaterials): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.062, 0.30), mats.gunmetal);
  body.position.z = 0.08;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 8), mats.gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.27;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.14, 0.045), mats.gunmetal);
  mag.position.set(0, -0.085, 0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.10, 0.05), mats.gunmetal);
  grip.position.set(0, -0.07, -0.05);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.14), mats.gunmetal);
  stock.position.set(0, -0.01, -0.13);
  g.add(body, barrel, mag, grip, stock);
  g.rotation.x = 0.3257;
  return g;
}

export class CharacterView {
  readonly root = new THREE.Group();
  readonly joints: THREE.Object3D[] = [];
  readonly coatMesh: THREE.Mesh | null = null;
  private readonly gunL: THREE.Group;
  private readonly gunR: THREE.Group;
  private readonly smgL: THREE.Group;
  private readonly smgR: THREE.Group;
  private readonly flashL: THREE.Sprite;
  private readonly flashR: THREE.Sprite;
  private readonly coatPos: Float32Array | null = null;

  constructor(
    readonly actor: Actor,
    mats: CharacterMaterials,
    tex: TextureSet,
  ) {
    const role = actor.role;
    const scale = role === 'trinity' ? 0.945 : role === 'guard' ? 0.99 : 1;
    this.root.scale.setScalar(scale);
    this.root.rotation.order = 'YXZ';

    const body =
      role === 'neo' ? mats.coat
      : role === 'trinity' ? mats.latex
      : role === 'guard' ? mats.shirt
      : mats.combat;
    const legs =
      role === 'neo' ? mats.coat
      : role === 'trinity' ? mats.latex
      : role === 'guard' ? mats.trousers
      : mats.combat;

    const byName = new Map<string, THREE.Object3D>();
    for (const bone of RIG) {
      const o = new THREE.Object3D();
      o.position.set(bone.offset[0], bone.offset[1], bone.offset[2]);
      const parent = bone.parent ? byName.get(bone.parent)! : this.root;
      parent.add(o);
      byName.set(bone.name, o);
      this.joints[J[bone.name]] = o;

      const isLeg = bone.name.startsWith('hip') || bone.name.startsWith('knee');
      const isFoot = bone.name.startsWith('ankle');
      const isArm = bone.name.startsWith('shoulder') || bone.name.startsWith('elbow');
      const isHand = bone.name.startsWith('wrist');
      let mat: THREE.Material = body;
      let fat = 1;
      if (bone.name === 'head') mat = mats.skin;
      else if (isFoot) mat = mats.boot;
      else if (isLeg) mat = legs;
      else if (isHand) mat = role === 'trinity' ? mats.latex : mats.skin;
      else if (isArm) mat = body;
      if (role === 'neo' && (bone.name === 'chest' || bone.name === 'spine')) fat = 1.18;
      if (role === 'soldier' && bone.name === 'chest') fat = 1.15;
      o.add(boneMesh(bone.length, bone.thick, bone.axis, mat, fat));
    }

    const head = byName.get('head')!;
    const chest = byName.get('chest')!;
    const pelvis = byName.get('pelvis')!;

    // hair
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.205, role === 'trinity' ? 0.19 : 0.14, 0.235),
      mats.hair,
    );
    hair.position.set(0, role === 'trinity' ? 0.145 : 0.175, -0.02);
    head.add(hair);
    if (role === 'trinity') {
      const bun = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.09), mats.hair);
      bun.position.set(0, 0.10, -0.145);
      head.add(bun);
    }

    // narrow dark sunglasses for the protagonists
    if (role === 'neo' || role === 'trinity') {
      const shades = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.036, 0.045), mats.shades);
      shades.position.set(0, 0.115, 0.105);
      head.add(shades);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.012, 0.02), mats.shades);
      bridge.position.set(0, 0.132, 0.108);
      head.add(bridge);
    }

    if (role === 'guard') {
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.085, 12), mats.cap);
      capTop.position.set(0, 0.225, -0.005);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, 0.14), mats.cap);
      brim.position.set(0, 0.192, 0.115);
      brim.rotation.x = -0.16;
      head.add(capTop, brim);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.30, 0.03), mats.tie);
      tie.position.set(0, 0.10, 0.115);
      chest.add(tie);
      const holster = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.09), mats.gunmetal);
      holster.position.set(-0.17, -0.02, 0.02);
      pelvis.add(holster);
    }

    if (role === 'soldier') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.vest);
      helmet.position.set(0, 0.135, -0.005);
      head.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), mats.shades);
      visor.position.set(0, 0.10, 0.105);
      head.add(visor);
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.28), mats.vest);
      vest.position.set(0, 0.12, 0);
      chest.add(vest);
    }

    if (role === 'neo') {
      // the coat's upper half rides with the chest; the skirt is simulated
      const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.27), mats.coat);
      shoulders.position.set(0, 0.14, 0);
      chest.add(shoulders);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.14, 0.24), mats.coat);
      collar.position.set(0, 0.30, -0.02);
      chest.add(collar);
      // the strapped arsenal under the coat
      for (let i = 0; i < 4; i++) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.05), mats.gunmetal);
        strap.position.set(-0.13 + (i % 2) * 0.26, 0.02 - Math.floor(i / 2) * 0.16, 0.15);
        chest.add(strap);
      }
    }
    if (role === 'trinity') {
      const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.40, 0.26), mats.latex);
      jacket.position.set(0, 0.12, 0);
      chest.add(jacket);
    }

    // both weapons hang on the rig; which one is in hand is a simulation state,
    // so the protagonists can throw a spent pistol away and pull the compact
    // submachine gun out from under the coat mid-fight
    this.gunL = buildPistol(mats);
    this.gunR = buildPistol(mats);
    this.smgL = buildSmg(mats);
    this.smgR = buildSmg(mats);
    for (const [j, g] of [
      [J.wristL, this.gunL], [J.wristR, this.gunR],
      [J.wristL, this.smgL], [J.wristR, this.smgR],
    ] as [number, THREE.Group][]) {
      this.joints[j].add(g);
      g.position.set(0, -0.08, 0.02);
      g.visible = false;
    }

    const flashMat = new THREE.SpriteMaterial({
      map: tex.spark,
      color: 0xfff0c8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.flashL = new THREE.Sprite(flashMat.clone());
    this.flashR = new THREE.Sprite(flashMat.clone());
    this.flashL.position.set(0, 0, 0.26);
    this.flashR.position.set(0, 0, 0.26);
    this.flashL.scale.setScalar(0.001);
    this.flashR.scale.setScalar(0.001);
    this.root.add(this.flashL);
    this.root.add(this.flashR);

    if (role === 'neo') {
      const n = COAT_COLUMNS * COAT_ROWS;
      const pos = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2);
      const idx: number[] = [];
      for (let c = 0; c < COAT_COLUMNS; c++) {
        for (let r = 0; r < COAT_ROWS; r++) {
          uv[(c * COAT_ROWS + r) * 2] = c / COAT_COLUMNS;
          uv[(c * COAT_ROWS + r) * 2 + 1] = r / (COAT_ROWS - 1);
        }
      }
      for (let c = 0; c < COAT_COLUMNS; c++) {
        const cn = (c + 1) % COAT_COLUMNS;
        for (let r = 0; r < COAT_ROWS - 1; r++) {
          const a = c * COAT_ROWS + r;
          const b = cn * COAT_ROWS + r;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const coatMat = (mats.coat as THREE.MeshStandardMaterial).clone();
      coatMat.side = THREE.DoubleSide;
      this.coatMesh = new THREE.Mesh(geo, coatMat);
      this.coatMesh.castShadow = true;
      this.coatMesh.frustumCulled = false;
      this.coatPos = pos;
    }
  }

  update(pose: Pose): void {
    const a = this.actor;
    this.root.visible = a.active;
    if (!a.active) {
      if (this.coatMesh) this.coatMesh.visible = false;
      return;
    }
    this.root.position.set(a.pos.x, a.pos.y, a.pos.z);
    this.root.rotation.set(a.pitch, a.yaw, a.roll);
    for (let i = 0; i < this.joints.length; i++) {
      this.joints[i].rotation.set(pose[i * 3], pose[i * 3 + 1], pose[i * 3 + 2]);
    }
    const smg = a.weaponKind === 'smg';
    this.gunL.visible = a.hasGunL && !smg;
    this.gunR.visible = a.hasGunR && !smg;
    this.smgL.visible = a.hasGunL && smg;
    this.smgR.visible = a.hasGunR && smg;
    const fl = a.flashL;
    const fr = a.flashR;
    // the flash rides on the barrel of whichever weapon is in that hand
    const muzzle = smg ? 0.42 : 0.28;
    for (const [flash, hand, weapon] of [
      [this.flashL, 'L', smg ? this.smgL : this.gunL],
      [this.flashR, 'R', smg ? this.smgR : this.gunR],
    ] as [THREE.Sprite, string, THREE.Group][]) {
      weapon.updateWorldMatrix(true, false);
      flash.position.set(0, 0, muzzle).applyMatrix4(weapon.matrixWorld);
      this.root.worldToLocal(flash.position);
      void hand;
    }
    this.flashL.scale.setScalar(fl > 0.02 ? 0.16 + fl * 0.5 : 0.001);
    this.flashR.scale.setScalar(fr > 0.02 ? 0.16 + fr * 0.5 : 0.001);
    (this.flashL.material as THREE.SpriteMaterial).opacity = fl;
    (this.flashR.material as THREE.SpriteMaterial).opacity = fr;

    if (this.coatMesh && this.coatPos && a.coat) {
      this.coatMesh.visible = true;
      const p = this.coatPos;
      for (let i = 0; i < a.coat.px.length; i++) {
        p[i * 3] = a.coat.px[i];
        p[i * 3 + 1] = a.coat.py[i];
        p[i * 3 + 2] = a.coat.pz[i];
      }
      const attr = this.coatMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
      this.coatMesh.geometry.computeVertexNormals();
    }
  }
}
