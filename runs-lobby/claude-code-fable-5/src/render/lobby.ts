/**
 * Static lobby set: columns, walls, coffered ceiling, mirror floor,
 * checkpoint (metal detector + guard desk), entrance doors, elevator bank.
 */
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { HALL, COLUMN, COLUMNS, CHECKPOINT, ELEVATOR, BENCH } from '../sim/layout';
import { CLAD_DEPTH } from './cladding';
import { elevatorDoorAt, entranceDoorAt, detectorLampAt } from '../sim/timeline';
import type { Mats } from './materials';

export class Lobby {
  group = new THREE.Group();
  private elevDoorL!: THREE.Mesh;
  private elevDoorR!: THREE.Mesh;
  private entrDoorL!: THREE.Group;
  private entrDoorR!: THREE.Group;
  private detectorLamp!: THREE.MeshBasicMaterial;
  private detectorLight!: THREE.PointLight;
  private detectorLight2!: THREE.PointLight;
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
      // B8: the column box is now the substrate CORE, inset behind the
      // granite; the four cladding faces are built by render/cladding.ts and
      // are what actually gets shot off.
      // A12: the core is well inside the cladding so the substrate shell can
      // be displaced deep into the column without the core poking through —
      // that displacement is what chews the corner silhouette.
      const core = COLUMN.size - 0.42;
      const m = box(core, COLUMN.height, core, mats.substrate, c.x, COLUMN.height / 2, c.z);
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
      // B8: no single-layer wall plane any more — render/cladding.ts builds a
      // granite face over a substrate back for each wall segment.
      void rotY;
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

    // back (elevator) wall.
    // B8 made this the opaque backing behind the two-layer cladding; B12 gives
    // it REAL openings. It used to be one 16 x 7 plane straight across the
    // bank, which meant the three portals had no hole in them at all — the lit
    // cabs and anyone standing in them were behind a solid wall. The wall is
    // now built as the panel above the portals plus the piers between them.
    {
      const ph = ELEVATOR.doorH;
      const hw = ELEVATOR.doorW / 2;
      const above = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, wallH - ph), mats.substrate);
      above.position.set(0, ph + (wallH - ph) / 2, -L);
      g.add(above);
      // solid spans between and outside the three openings, up to lintel height
      const edges = [-W];
      for (const dx of ELEVATOR.doors) edges.push(dx - hw, dx + hw);
      edges.push(W);
      for (let i = 0; i < edges.length; i += 2) {
        const w = edges[i + 1] - edges[i];
        if (w <= 0.001) continue;
        const pier = new THREE.Mesh(new THREE.PlaneGeometry(w, ph), mats.substrate);
        pier.position.set(edges[i] + w / 2, ph / 2, -L);
        g.add(pier);
      }
    }

    // elevator bank (B2 + supplement): tall portals in the granite wall,
    // thin dark architraves, dark brushed-metal center-split leaves that
    // retract fully, lit cabs, call panels on the piers, soffit band,
    // floor-range signage and pale marble thresholds.
    const doorMat = mats.elevatorDoor;
    const dw = ELEVATOR.doorW / 2; // leaf width
    for (const dx of ELEVATOR.doors) {
      // granite surround strips framing a real opening
      const surH = ELEVATOR.doorH + 0.5;
      box(0.5, surH, 0.2, mats.marble, dx - ELEVATOR.doorW / 2 - 0.25, surH / 2, -L + 0.1);
      box(0.5, surH, 0.2, mats.marble, dx + ELEVATOR.doorW / 2 + 0.25, surH / 2, -L + 0.1);
      box(ELEVATOR.doorW + 1.0, 0.5, 0.2, mats.marble, dx, ELEVATOR.doorH + 0.25, -L + 0.1);
      // thin dark-metal architrave slightly proud of the granite
      const jambH = ELEVATOR.doorH + 0.08;
      box(0.07, jambH, 0.26, mats.gunmetal, dx - ELEVATOR.doorW / 2 - 0.035, jambH / 2, -L + 0.13);
      box(0.07, jambH, 0.26, mats.gunmetal, dx + ELEVATOR.doorW / 2 + 0.035, jambH / 2, -L + 0.13);
      box(ELEVATOR.doorW + 0.14, 0.09, 0.26, mats.gunmetal, dx, ELEVATOR.doorH + 0.045, -L + 0.13);
      // lit cab behind every portal (the open one becomes the money shot)
      const cab = new THREE.Group();
      const cw = ELEVATOR.doorW + 0.35;
      const cabBack = new THREE.Mesh(new THREE.BoxGeometry(cw, ELEVATOR.doorH, 0.1), mats.cabWall);
      cabBack.position.set(dx, ELEVATOR.doorH / 2, -L - 1.55);
      const cabL = new THREE.Mesh(new THREE.BoxGeometry(0.1, ELEVATOR.doorH, 1.6), mats.cabWall);
      cabL.position.set(dx - cw / 2, ELEVATOR.doorH / 2, -L - 0.8);
      const cabR = cabL.clone();
      cabR.position.x = dx + cw / 2;
      const cabTop = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, 1.6), mats.cabWall);
      cabTop.position.set(dx, ELEVATOR.doorH + 0.02, -L - 0.8);
      const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.05, 1.6), mats.gunmetal);
      cabFloor.position.set(dx, 0.02, -L - 0.8);
      // cool fluorescent ceiling strip — the brightest element in frame
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(cw - 0.3, 0.04, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 4.2 }),
      );
      strip.position.set(dx, ELEVATOR.doorH - 0.05, -L - 0.8);
      const cabLight = new THREE.PointLight(0xdfeaff, dx === 0 ? 40 : 14, 7, 1.5);
      cabLight.position.set(dx, ELEVATOR.doorH - 0.35, -L - 0.7);
      cab.add(cabBack, cabL, cabR, cabTop, cabFloor, strip, cabLight);
      g.add(cab);
      // door leaves (dark brushed metal, center split)
      if (dx === 0) {
        this.elevDoorL = box(dw, ELEVATOR.doorH, 0.08, doorMat, dx - dw / 2, ELEVATOR.doorH / 2, -L + 0.06);
        this.elevDoorR = box(dw, ELEVATOR.doorH, 0.08, doorMat, dx + dw / 2, ELEVATOR.doorH / 2, -L + 0.06);
      } else {
        box(dw - 0.01, ELEVATOR.doorH, 0.08, doorMat, dx - dw / 2, ELEVATOR.doorH / 2, -L + 0.06);
        box(dw - 0.01, ELEVATOR.doorH, 0.08, doorMat, dx + dw / 2, ELEVATOR.doorH / 2, -L + 0.06);
      }
      // pale marble threshold strip at the cab entrance
      const thr = new THREE.Mesh(
        new THREE.BoxGeometry(ELEVATOR.doorW + 0.2, 0.012, 0.34),
        new THREE.MeshStandardMaterial({ color: 0xb9c1b6, roughness: 0.35 }),
      );
      thr.position.set(dx, 0.006, -L + 0.24);
      g.add(thr);
      // call panel on the pier: dark plate, two stacked round buttons
      const px = dx + ELEVATOR.doorW / 2 + 0.62;
      box(0.11, 0.26, 0.03, mats.gunmetal, px, 1.12, -L + 0.12);
      for (const by of [1.17, 1.07]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 10), mats.metal);
        b.rotation.x = Math.PI / 2;
        b.position.set(px, by, -L + 0.14);
        g.add(b);
      }
    }
    // warm indicator lamp glowing beside the active (center) elevator
    const activeLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45e, emissiveIntensity: 2.2 }),
    );
    activeLamp.position.set(ELEVATOR.doorW / 2 + 0.62, 1.5, -L + 0.14);
    g.add(activeLamp);
    // floor-range signage: dark metal lettering on the granite piers
    const sign = (text: string, x: number) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const ctx2 = c.getContext('2d')!;
      ctx2.clearRect(0, 0, 512, 96);
      ctx2.font = '600 58px Helvetica, Arial, sans-serif';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillStyle = '#14171a';
      ctx2.fillText(text, 256, 50);
      const t = new THREE.CanvasTexture(c);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.16),
        new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, metalness: 0.5 }),
      );
      m.position.set(x, 1.92, -L + 0.205);
      g.add(m);
    };
    sign('LEVELS 1 – 20', -1.6);
    sign('LEVELS 21 – 40', 1.6);
    // dark soffit band with recessed downlights washing the granite
    box(HALL.halfWidth * 2, 0.55, 0.16, mats.gunmetal, 0, 6.65, -L + 0.08);
    for (const sx of [-4.8, -1.6, 1.6, 4.8]) {
      const dl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.04, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6f0e2, emissiveIntensity: 2 }),
      );
      dl.position.set(sx, 6.36, -L + 0.14);
      g.add(dl);
    }
    // a soft downlight so the bank reads through the dark grade
    const bankLight = new THREE.PointLight(0xdcead9, 7, 11, 2);
    bankLight.position.set(0, 5.6, -L + 1.6);
    g.add(bankLight);

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
    // B7: alarm lamp — a lens strip on both faces of the top crossbar, a dome
    // over it, and thin indicator strips down the inner jambs. Neutral until
    // the detector triggers, then pulsed red in step with the alarm beeps.
    // Self-luminous lens: unlit, so the red wash lamps sitting inside the
    // fixture cannot over-light its own surface and bleach it to cream. The
    // colour alone carries the alarm state.
    this.detectorLamp = new THREE.MeshBasicMaterial({ color: 0x0d0706 });
    const lampY = det.height + 0.08;
    // a sleeve around the whole crossbar, so the lamp reads from any angle
    // (a flat lens on the front face alone is edge-on to the checkpoint shot)
    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(det.width + 0.2, 0.085, det.depth + 0.05), this.detectorLamp,
    );
    sleeve.position.set(det.x, lampY, det.z);
    g.add(sleeve);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), this.detectorLamp,
    );
    dome.scale.set(2.6, 1.25, 1.15);
    dome.position.set(det.x, det.height + 0.15, det.z);
    g.add(dome);
    // indicator strips on the inner AND outer faces of both jambs
    for (const side of [-1, 1]) {
      for (const [dx, w, d] of [[side * 0.085, 0.02, 0.055], [0, 0.19, 0.02]] as const) {
        const strip2 = new THREE.Mesh(
          new THREE.BoxGeometry(w, det.height * 0.74, d), this.detectorLamp,
        );
        strip2.position.set(
          det.x + side * (det.width / 2) - dx,
          det.height * 0.45,
          det.z + (d < 0.03 ? det.depth / 2 + 0.01 : 0),
        );
        g.add(strip2);
      }
    }
    // red wash over the frame, the granite around it and whoever is in the portal
    // B9: short falloff so the wash stays on the detector frame and whoever
    // is standing in it, instead of painting the granite across the hall
    this.detectorLight = new THREE.PointLight(0xff2a14, 0, 3.4, 2);
    this.detectorLight.position.set(det.x, det.height - 0.1, det.z);
    g.add(this.detectorLight);
    // a second, lower lamp catches whoever is standing in the portal
    this.detectorLight2 = new THREE.PointLight(0xff3a1c, 0, 2.6, 2);
    this.detectorLight2.position.set(det.x, 1.5, det.z - 0.35);
    g.add(this.detectorLight2);

    const d = CHECKPOINT.desk;
    box(d.w, d.h, d.d, mats.wood, d.x, d.h / 2, d.z);
    box(d.w + 0.15, 0.05, d.d + 0.15, mats.gunmetal, d.x, d.h + 0.025, d.z);
    // X-ray belt beside the desk
    box(1.6, 0.82, 0.7, mats.gunmetal, d.x + 0.3, 0.41, d.z + 1.05);
    box(0.5, 0.6, 0.7, mats.black, d.x + 1.0, 1.1, d.z + 1.05);

    // --- benches along walls (set dressing) -------------------------------
    // dimensions from layout.ts, so the clearance the sim reserves and the
    // mesh built here cannot drift apart (they had: the sim did not know the
    // benches were there at all)
    for (const side of [-1, 1]) {
      for (const bz of BENCH.rows) {
        box(BENCH.w, BENCH.h, BENCH.d, mats.wood,
          side * (W - BENCH.inset), BENCH.h / 2, bz);
      }
    }
  }

  /** Animate doors + detector lamp from choreography time. */
  update(t: number) {
    const e = elevatorDoorAt(t);
    const dw = ELEVATOR.doorW / 2;
    // leaves slide fully aside and tuck behind the wall plane (full retract)
    this.elevDoorL.position.x = -dw / 2 - e * dw * 1.1;
    this.elevDoorR.position.x = dw / 2 + e * dw * 1.1;
    this.elevDoorL.position.z = -18 + 0.06 - e * 0.14;
    this.elevDoorR.position.z = -18 + 0.06 - e * 0.14;
    const en = entranceDoorAt(t);
    this.entrDoorL.rotation.y = -en * 1.15;
    this.entrDoorR.rotation.y = en * 1.15;
    // B7: lamp + wash pulse on the same train as the alarm beeps.
    const lamp = detectorLampAt(t);
    // driven above 1.0 so the tone mapper keeps it hot; the CSS grade
    // desaturates, and A9's bloom pass will pick this up further, so the level
    // is re-checked once the post stack is in
    // A9's bloom amplifies emissives, so the lens is driven less hard than it
    // was before the post stack landed; it still pulses clearly (B9).
    this.detectorLamp.color.setRGB(
      0.05 + lamp * 1.75, 0.035 + lamp * 0.11, 0.03 + lamp * 0.06,
    );
    this.detectorLight.intensity = lamp * 12;
    this.detectorLight2.intensity = lamp * 6.5;
  }
}
