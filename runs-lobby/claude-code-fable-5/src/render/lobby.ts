/**
 * Static lobby set: columns, walls, coffered ceiling, mirror floor,
 * checkpoint (metal detector + guard desk), entrance doors, elevator bank.
 */
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { HALL, COLUMN, COLUMNS, CHECKPOINT, ELEVATOR } from '../sim/layout';
import { elevatorDoorAt, entranceDoorAt } from '../sim/timeline';
import type { Mats } from './materials';

export class Lobby {
  group = new THREE.Group();
  private elevDoorL!: THREE.Mesh;
  private elevDoorR!: THREE.Mesh;
  private entrDoorL!: THREE.Group;
  private entrDoorR!: THREE.Group;
  private detectorLamp!: THREE.MeshStandardMaterial;
  /** Column meshes by surface id, used to anchor decals. */
  columnMeshes = new Map<string, THREE.Mesh>();

  constructor(mats: Mats) {
    const g = this.group;
    const box = (
      w: number, h: number, d: number,
      mat: THREE.Material, x: number, y: number, z: number,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    // --- floor: real mirror + dark stone overlay -------------------------
    const mirror = new Reflector(new THREE.PlaneGeometry(HALL.halfWidth * 2, HALL.halfLength * 2 + 3), {
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x777f7a,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.005;
    g.add(mirror);
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL.halfWidth * 2, HALL.halfLength * 2 + 3),
      mats.floorOverlay,
    );
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.001;
    g.add(overlay);

    // --- columns ----------------------------------------------------------
    for (let i = 0; i < COLUMNS.length; i++) {
      const c = COLUMNS[i];
      const m = box(COLUMN.size, COLUMN.height, COLUMN.size, mats.marble, c.x, COLUMN.height / 2, c.z);
      this.columnMeshes.set(`col${i}`, m);
      // base + capital trim
      box(COLUMN.size + 0.24, 0.22, COLUMN.size + 0.24, mats.metal, c.x, 0.11, c.z);
      box(COLUMN.size + 0.2, 0.3, COLUMN.size + 0.2, mats.marble, c.x, COLUMN.height - 0.15, c.z);
    }

    // --- walls ------------------------------------------------------------
    const wallH = HALL.height;
    const L = HALL.halfLength;
    const W = HALL.halfWidth;
    const mkWall = (x: number, rotY: number) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, wallH), mats.wall);
      wall.position.set(x, wallH / 2, 0);
      wall.rotation.y = rotY;
      g.add(wall);
      // Wainscot strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, L * 2), mats.metal);
      strip.position.set(x + (rotY > 0 ? 0.03 : -0.03), 0.55, 0);
      g.add(strip);
    };
    mkWall(-W, Math.PI / 2);
    mkWall(W, -Math.PI / 2);

    // front (entrance) wall with door opening
    const frontMat = mats.wall;
    box(W - 1.8, wallH, 0.3, frontMat, -(1.8 + (W - 1.8) / 2), wallH / 2, L + 0.15);
    box(W - 1.8, wallH, 0.3, frontMat, 1.8 + (W - 1.8) / 2, wallH / 2, L + 0.15);
    box(3.6, wallH - 3.0, 0.3, frontMat, 0, 3.0 + (wallH - 3.0) / 2, L + 0.15);
    // glass door panels (two swinging doors)
    const mkDoor = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.7, 0, L);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.0, 0.08), mats.black);
      frame.position.set(-side * 0.85, 1.5, 0);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.7, 0.03), mats.glass);
      glass.position.set(-side * 0.85, 1.45, 0);
      pivot.add(frame, glass);
      g.add(pivot);
      return pivot;
    };
    this.entrDoorL = mkDoor(-1);
    this.entrDoorR = mkDoor(1);

    // back (elevator) wall
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, wallH), mats.wall);
    back.position.set(0, wallH / 2, -L);
    back.rotation.y = 0;
    g.add(back);

    // elevator bank
    for (const dx of ELEVATOR.doors) {
      // surround (granite, per the film reference)
      box(ELEVATOR.doorW + 0.5, ELEVATOR.doorH + 0.4, 0.24, mats.marble, dx, (ELEVATOR.doorH + 0.4) / 2, -L + 0.14);
      if (dx === 0) {
        // center elevator: openable double doors + lit cab behind
        const cab = new THREE.Group();
        const cabMat = mats.metal;
        const cw = ELEVATOR.doorW + 0.3;
        const cabBack = new THREE.Mesh(new THREE.BoxGeometry(cw, ELEVATOR.doorH, 0.1), cabMat);
        cabBack.position.set(dx, ELEVATOR.doorH / 2, -L - 1.65);
        const cabL = new THREE.Mesh(new THREE.BoxGeometry(0.1, ELEVATOR.doorH, 1.7), cabMat);
        cabL.position.set(dx - cw / 2, ELEVATOR.doorH / 2, -L - 0.85);
        const cabR = cabL.clone();
        cabR.position.x = dx + cw / 2;
        const cabTop = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, 1.7), cabMat);
        cabTop.position.set(dx, ELEVATOR.doorH, -L - 0.85);
        const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.05, 1.7), mats.wood);
        cabFloor.position.set(dx, 0.02, -L - 0.85);
        const cabLight = new THREE.PointLight(0xfff2dd, 6, 5);
        cabLight.position.set(dx, ELEVATOR.doorH - 0.3, -L - 0.85);
        cab.add(cabBack, cabL, cabR, cabTop, cabFloor, cabLight);
        g.add(cab);
        const dw = ELEVATOR.doorW / 2;
        this.elevDoorL = box(dw, ELEVATOR.doorH, 0.1, mats.metal, dx - dw / 2, ELEVATOR.doorH / 2, -L + 0.05);
        this.elevDoorR = box(dw, ELEVATOR.doorH, 0.1, mats.metal, dx + dw / 2, ELEVATOR.doorH / 2, -L + 0.05);
      } else {
        box(ELEVATOR.doorW / 2 - 0.02, ELEVATOR.doorH, 0.1, mats.metal, dx - ELEVATOR.doorW / 4, ELEVATOR.doorH / 2, -L + 0.05);
        box(ELEVATOR.doorW / 2 - 0.02, ELEVATOR.doorH, 0.1, mats.metal, dx + ELEVATOR.doorW / 4, ELEVATOR.doorH / 2, -L + 0.05);
      }
      // call-button pedestal
      box(0.12, 1.15, 0.12, mats.metal, dx + ELEVATOR.doorW / 2 + 0.45, 0.57, -L + 0.2);
    }

    // --- ceiling ----------------------------------------------------------
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L * 2 + 3), mats.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = HALL.height;
    g.add(ceil);
    // light strips between coffers
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xf5fff2, emissiveIntensity: 1.6,
    });
    for (let zi = -2; zi <= 2; zi++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.06, 0.5), stripMat);
      strip.position.set(0, HALL.height - 0.05, zi * 7);
      g.add(strip);
    }

    // --- checkpoint ---------------------------------------------------------
    const det = CHECKPOINT.detector;
    const frameMat = mats.gunmetal;
    box(0.16, det.height, det.depth, frameMat, det.x - det.width / 2, det.height / 2, det.z);
    box(0.16, det.height, det.depth, frameMat, det.x + det.width / 2, det.height / 2, det.z);
    box(det.width + 0.16, 0.16, det.depth, frameMat, det.x, det.height + 0.08, det.z);
    this.detectorLamp = new THREE.MeshStandardMaterial({
      color: 0x222222, emissive: 0x001100, emissiveIntensity: 1,
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), this.detectorLamp);
    lamp.position.set(det.x, det.height + 0.02, det.z + det.depth / 2 + 0.02);
    g.add(lamp);

    const d = CHECKPOINT.desk;
    box(d.w, d.h, d.d, mats.wood, d.x, d.h / 2, d.z);
    box(d.w + 0.15, 0.05, d.d + 0.15, mats.gunmetal, d.x, d.h + 0.025, d.z);
    // X-ray belt beside the desk
    box(1.6, 0.82, 0.7, mats.gunmetal, d.x + 0.3, 0.41, d.z + 1.05);
    box(0.5, 0.6, 0.7, mats.black, d.x + 1.0, 1.1, d.z + 1.05);

    // --- benches along walls (set dressing) -------------------------------
    for (const side of [-1, 1]) {
      for (const bz of [5, -7]) {
        box(0.6, 0.45, 2.6, mats.wood, side * (W - 0.75), 0.22, bz);
      }
    }
  }

  /** Animate doors + detector lamp from choreography time. */
  update(t: number) {
    const e = elevatorDoorAt(t);
    const dw = ELEVATOR.doorW / 2;
    this.elevDoorL.position.x = -dw / 2 - e * dw * 0.96;
    this.elevDoorR.position.x = dw / 2 + e * dw * 0.96;
    const en = entranceDoorAt(t);
    this.entrDoorL.rotation.y = -en * 1.15;
    this.entrDoorR.rotation.y = en * 1.15;
    // Detector alert lamp flashes red on the beep.
    const beeping = t >= 8.0 && t < 9.0;
    this.detectorLamp.emissive.setHex(beeping && Math.floor(t * 6) % 2 === 0 ? 0xff2211 : 0x001100);
    this.detectorLamp.emissiveIntensity = beeping ? 3 : 1;
  }
}
