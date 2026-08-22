/** The set: a monumental government-building lobby.
 *
 *  All geometry is built procedurally here — no imported models. The pieces that
 *  can be shot to bits live in `slabs.ts`; this module builds everything else:
 *  structure, ceiling, windows, checkpoint, entrance and elevator bank.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { columns, LAYOUT } from '../sim/lobby.ts';
import type { TextureSet } from './textures.ts';

const HALL = LAYOUT.hallLength;
const HW = LAYOUT.halfWidth;
const CH = LAYOUT.ceilingHeight;

function repeat(src: THREE.Texture, x: number, y: number): THREE.Texture {
  const t = src.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
}

export interface SetPieces {
  root: THREE.Group;
  elevatorDoors: THREE.Object3D[];
  entranceDoors: THREE.Object3D[];
  floor: Reflector;
  shafts: THREE.Object3D;
}

export function buildSet(tex: TextureSet): SetPieces {
  const root = new THREE.Group();
  root.name = 'lobby';

  const marbleMat = (rx: number, ry: number, color = 0xeef0ec) =>
    new THREE.MeshStandardMaterial({
      map: repeat(tex.marble, rx, ry),
      color,
      roughness: 0.13,
      metalness: 0.02,
    });
  const substrateMat = new THREE.MeshStandardMaterial({
    map: repeat(tex.substrate, 3, 3),
    color: 0x9c9d99,
    roughness: 0.95,
  });
  const plasterMat = new THREE.MeshStandardMaterial({
    map: repeat(tex.plaster, 6, 6),
    color: 0xdfe3dc,
    roughness: 0.9,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    map: repeat(tex.metal, 1, 1),
    color: 0xb9bfbd,
    roughness: 0.28,
    metalness: 0.92,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x22262a,
    roughness: 0.42,
    metalness: 0.75,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    map: repeat(tex.glass, 1, 1),
    color: 0xdae8e4,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /* ---------------- floor: polished dark stone that mirrors the hall ------ */
  const floorGeo = new THREE.PlaneGeometry(HW * 2, HALL + 4);
  const floor = new Reflector(floorGeo, {
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x8a918d,
    shader: {
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        tStone: { value: repeat(tex.floor, (HW * 2) / 2.4, (HALL + 4) / 2.4) },
        uCam: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUvR;
        varying vec2 vUvT;
        varying vec3 vWorld;
        void main() {
          vUvT = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vUvR = textureMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform sampler2D tStone;
        uniform vec3 uCam;
        varying vec4 vUvR;
        varying vec2 vUvT;
        varying vec3 vWorld;
        void main() {
          vec4 stone = texture2D(tStone, vUvT * vec2(7.5, 21.6));
          vec4 refl = texture2DProj(tDiffuse, vUvR);
          vec3 view = normalize(uCam - vWorld);
          float fres = pow(1.0 - clamp(view.y, 0.0, 1.0), 3.2);
          float k = mix(0.08, 0.66, fres);
          // cool daylight washing in from the windows on both sides
          float across = abs(vWorld.x) / 9.0;
          float light = mix(0.85, 1.35, smoothstep(0.0, 1.0, across));
          light *= mix(1.12, 0.72, clamp(vWorld.z / 48.0, 0.0, 1.0));
          vec3 col = stone.rgb * color * light * 1.55 + refl.rgb * k;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, HALL / 2);
  root.add(floor);

  /* ---------------- columns ---------------------------------------------- */
  const colMarble = marbleMat(0.55, 5);
  for (const c of columns()) {
    const g = new THREE.Group();
    g.position.set(c.center.x, 0, c.center.z);
    // rough core, seen wherever the cladding has been blown away
    const core = new THREE.Mesh(new THREE.BoxGeometry(1.178, CH, 1.178), substrateMat);
    core.position.y = CH / 2;
    core.castShadow = true;
    core.receiveShadow = true;
    g.add(core);
    // intact marble above the shootable band
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, CH - LAYOUT.damageBandHeight - 0.2, 1.2),
      colMarble,
    );
    upper.position.y = LAYOUT.damageBandHeight + 0.1 + (CH - LAYOUT.damageBandHeight - 0.2) / 2;
    upper.castShadow = true;
    g.add(upper);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.2, 1.36), marbleMat(1, 0.2, 0xd8dcd6));
    plinth.position.y = 0.1;
    plinth.castShadow = true;
    g.add(plinth);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.26, 1.42), marbleMat(1, 0.2, 0xe4e7e2));
    cap.position.y = CH - 0.42;
    g.add(cap);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.09, 1.24), darkMetal);
    band.position.y = LAYOUT.damageBandHeight + 0.06;
    g.add(band);
    root.add(g);
  }

  /* ---------------- walls ------------------------------------------------- */
  for (const side of [-1, 1] as const) {
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, CH, HALL), substrateMat);
    core.position.set(side * (HW + 0.25), CH / 2, HALL / 2);
    core.receiveShadow = true;
    root.add(core);
    // upper wall above the damage band
    const upper = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL, CH - LAYOUT.wallDamageBandHeight),
      plasterMat,
    );
    upper.position.set(side * (HW - 0.002), (CH + LAYOUT.wallDamageBandHeight) / 2, HALL / 2);
    upper.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    upper.receiveShadow = true;
    root.add(upper);
    // cornice
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, HALL), marbleMat(1, 0.1, 0xe8ebe6));
    cornice.position.set(side * (HW - 0.14), LAYOUT.wallDamageBandHeight + 0.15, HALL / 2);
    root.add(cornice);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, HALL), marbleMat(1, 0.1, 0xeceee9));
    top.position.set(side * (HW - 0.2), CH - 0.18, HALL / 2);
    root.add(top);
  }

  // entrance wall, built around a 7.6 x 6.6 m opening for the glazed doors
  const openW = 7.6;
  const openH = 6.6;
  const sideW = (HW * 2 + 1 - openW) / 2;
  for (const sgn of [-1, 1] as const) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(sideW, CH, 0.5), plasterMat);
    pier.position.set(sgn * (openW / 2 + sideW / 2), CH / 2, -0.25);
    root.add(pier);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(openW, CH - openH, 0.5), plasterMat);
  header.position.set(0, openH + (CH - openH) / 2, -0.25);
  root.add(header);
  // The elevator bank wall stands at the door line with an opening per car, so
  // the recessed cars are real space rather than geometry buried in a slab.
  const EZ = LAYOUT.elevatorZ;
  const EW = LAYOUT.elevatorWidth;
  const EH = LAYOUT.elevatorHeight;
  const farMarble = marbleMat(6, 4, 0xe6e9e4);
  const piers: [number, number][] = [
    [-HW - 0.5, LAYOUT.elevatorX[0] - EW / 2 - 0.3],
    [LAYOUT.elevatorX[0] + EW / 2 + 0.3, LAYOUT.elevatorX[1] - EW / 2 - 0.3],
    [LAYOUT.elevatorX[1] + EW / 2 + 0.3, LAYOUT.elevatorX[2] - EW / 2 - 0.3],
    [LAYOUT.elevatorX[2] + EW / 2 + 0.3, HW + 0.5],
  ];
  for (const [x0, x1] of piers) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, EH + 0.4, 0.5), farMarble);
    pier.position.set((x0 + x1) / 2, (EH + 0.4) / 2, EZ + 0.25);
    pier.receiveShadow = true;
    root.add(pier);
  }
  const farHeader = new THREE.Mesh(
    new THREE.BoxGeometry(HW * 2 + 1, CH - EH - 0.4, 0.5),
    farMarble,
  );
  farHeader.position.set(0, EH + 0.4 + (CH - EH - 0.4) / 2, EZ + 0.25);
  farHeader.receiveShadow = true;
  root.add(farHeader);
  // the shaft wall behind the cars
  const shaftBack = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 1, CH, 0.5), plasterMat);
  shaftBack.position.set(0, CH / 2, EZ + 2.1);
  root.add(shaftBack);

  /* ---------------- coffered ceiling -------------------------------------- */
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HALL), plasterMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CH, HALL / 2);
  root.add(ceil);

  const cellX = 2.25;
  const cellZ = 2.4;
  const nx = Math.floor((HW * 2) / cellX);
  const nz = Math.floor(HALL / cellZ);
  const beamMat = marbleMat(1, 1, 0xdadfd8);
  const beamGeoX = new THREE.BoxGeometry(HW * 2, 0.34, 0.24);
  const beamGeoZ = new THREE.BoxGeometry(0.24, 0.34, HALL);
  const beamsX = new THREE.InstancedMesh(beamGeoX, beamMat, nz + 1);
  const beamsZ = new THREE.InstancedMesh(beamGeoZ, beamMat, nx + 1);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i <= nz; i++) {
    m4.makeTranslation(0, CH - 0.17, i * (HALL / nz));
    beamsX.setMatrixAt(i, m4);
  }
  for (let i = 0; i <= nx; i++) {
    m4.makeTranslation(-HW + i * ((HW * 2) / nx), CH - 0.17, HALL / 2);
    beamsZ.setMatrixAt(i, m4);
  }
  beamsX.instanceMatrix.needsUpdate = true;
  beamsZ.instanceMatrix.needsUpdate = true;
  root.add(beamsX, beamsZ);

  // recessed light panels inside every second coffer
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xf4f8f2,
    emissive: 0xd8e4dc,
    emissiveIntensity: 1.35,
    roughness: 0.6,
  });
  const panelGeo = new THREE.PlaneGeometry(cellX * 0.55, cellZ * 0.55);
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, Math.ceil((nx * nz) / 2) + 4);
  let pi = 0;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const s = new THREE.Vector3(1, 1, 1);
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      if ((ix + iz) % 2 !== 0) continue;
      if (pi >= panels.count) break;
      m4.compose(
        new THREE.Vector3(-HW + (ix + 0.5) * ((HW * 2) / nx), CH - 0.04, (iz + 0.5) * (HALL / nz)),
        q,
        s,
      );
      panels.setMatrixAt(pi++, m4);
    }
  }
  panels.count = pi;
  panels.instanceMatrix.needsUpdate = true;
  root.add(panels);

  /* ---------------- clerestory windows ------------------------------------ */
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xe8f2ee,
    emissive: 0xcfe2da,
    emissiveIntensity: 1.05,
    roughness: 0.35,
  });
  const shafts = new THREE.Group();
  const shaftMat = new THREE.MeshBasicMaterial({
    map: tex.dust,
    color: 0xd7e6dd,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1] as const) {
    for (let z = 3.2; z < HALL - 2; z += 5.0) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), winMat);
      w.position.set(side * (HW - 0.06), 8.3, z);
      w.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      root.add(w);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.7, 2.9), darkMetal);
      frame.position.set(side * (HW - 0.09), 8.3, z);
      root.add(frame);
      // a soft shaft of daylight raking down into the hall
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 11.5), shaftMat);
      shaft.position.set(side * (HW - 2.9), 4.6, z);
      shaft.rotation.set(0, side === 1 ? Math.PI / 2 : -Math.PI / 2, side * 0.42);
      shafts.add(shaft);
    }
  }
  root.add(shafts);

  /* ---------------- entrance ---------------------------------------------- */
  const entranceDoors: THREE.Object3D[] = [];
  // an actual frame: two jambs, a head rail and the mullions between the leaves
  for (const x of [-3.7, -1.8, 0, 1.8, 3.7]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.3, 0.3), darkMetal);
    mullion.position.set(x, 2.15, LAYOUT.doorZ);
    root.add(mullion);
  }
  const headRail = new THREE.Mesh(new THREE.BoxGeometry(7.56, 0.26, 0.3), darkMetal);
  headRail.position.set(0, 4.17, LAYOUT.doorZ);
  root.add(headRail);
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(7.56, 0.22, 0.3), darkMetal);
  topRail.position.set(0, 6.5, LAYOUT.doorZ);
  root.add(topRail);
  for (const x of [-2.4, 0, 2.4]) {
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.28), darkMetal);
    tm.position.set(x, 5.35, LAYOUT.doorZ);
    root.add(tm);
  }
  for (let i = 0; i < 4; i++) {
    // the group's origin is the hinge, so the leaf swings properly
    const hingeSide = i < 2 ? 1 : -1;
    const leaf = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.6), glassMat);
    glass.position.set(hingeSide * 0.9, 1.85, 0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.08), darkMetal);
    rail.position.set(hingeSide * 0.9, 1.05, 0.02);
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.7, 0.09), darkMetal);
    stile.position.set(hingeSide * 0.9 + 0.83, 1.85, 0.02);
    const stile2 = stile.clone();
    stile2.position.x = hingeSide * 0.9 - 0.83;
    leaf.add(glass, rail, stile, stile2);
    leaf.position.set(-2.7 + i * 1.8 - hingeSide * 0.9, 0, LAYOUT.doorZ + 0.02);
    leaf.userData.hingeSide = hingeSide;
    root.add(leaf);
    entranceDoors.push(leaf);
  }
  // the world outside: a blown-out daylight card that back-lights the doors
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 16),
    new THREE.MeshBasicMaterial({ color: 0xeaf4ef }),
  );
  outside.position.set(0, 5.0, -4.2);
  root.add(outside);
  // a hint of the street: dark verticals against the blown-out daylight
  for (const x of [-4.6, -2.2, 2.2, 4.6]) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 9, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x7d8a82, roughness: 0.9 }),
    );
    pillar.position.set(x, 4.5, -3.2);
    root.add(pillar);
  }

  const transom = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.2), glassMat);
  transom.position.set(0, 5.4, LAYOUT.doorZ + 0.02);
  root.add(transom);

  /* ---------------- security checkpoint ----------------------------------- */
  const detector = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.24, 2.25, 0.34);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe9ebe6, roughness: 0.55 });
  const pL = new THREE.Mesh(postGeo, postMat);
  pL.position.set(LAYOUT.detectorHalfWidth, 1.12, 0);
  const pR = new THREE.Mesh(postGeo, postMat);
  pR.position.set(-LAYOUT.detectorHalfWidth, 1.12, 0);
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(LAYOUT.detectorHalfWidth * 2 + 0.24, 0.3, 0.34),
    postMat,
  );
  lintel.position.set(0, 2.38, 0);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2200, emissiveIntensity: 0.2 }),
  );
  lamp.position.set(0, 2.2, 0.19);
  lamp.name = 'detector-lamp';
  detector.add(pL, pR, lintel, lamp);
  detector.position.set(0, 0, LAYOUT.detectorZ);
  detector.castShadow = true;
  root.add(detector);

  // guard desk
  const desk = new THREE.Group();
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.0), marbleMat(1, 1, 0xdfe3dd));
  deskTop.position.y = 1.05;
  const deskBody = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.02, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a4145, roughness: 0.6 }));
  deskBody.position.y = 0.51;
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.05), darkMetal);
  monitor.position.set(0.6, 1.3, 0);
  monitor.rotation.y = 0.4;
  desk.add(deskTop, deskBody, monitor);
  desk.position.set(LAYOUT.deskPos.x, 0, LAYOUT.deskPos.z);
  desk.castShadow = true;
  root.add(desk);

  // x-ray belt
  const xray = new THREE.Group();
  const belt = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.86), new THREE.MeshStandardMaterial({ color: 0x4a5155, roughness: 0.5, metalness: 0.4 }));
  belt.position.y = 0.45;
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.72, 0.96), new THREE.MeshStandardMaterial({ color: 0xd6d9d2, roughness: 0.6 }));
  tunnel.position.set(0, 1.26, 0);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0x6b5a33, roughness: 0.8 }));
  tray.position.set(-1.0, 0.93, 0);
  xray.add(belt, tunnel, tray);
  xray.position.set(LAYOUT.xrayPos.x, 0, LAYOUT.xrayPos.z);
  root.add(xray);

  // stanchions and belt barriers guiding to the checkpoint
  const postM = new THREE.MeshStandardMaterial({ color: 0xb6bcb8, roughness: 0.3, metalness: 0.8 });
  for (const x of [-1.9, 1.9]) {
    for (let z = 2.0; z < 6.0; z += 1.9) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 10), postM);
      st.position.set(x, 0.5, z);
      root.add(st);
    }
  }

  /* ---------------- elevator bank ----------------------------------------- */
  const elevatorDoors: THREE.Object3D[] = [];
  for (const x of LAYOUT.elevatorX) {
    // a brushed-metal surround around the opening, not across it
    for (const sgn of [-1, 1] as const) {
      const jamb = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, LAYOUT.elevatorHeight + 0.3, 0.14),
        darkMetal,
      );
      jamb.position.set(
        x + sgn * (LAYOUT.elevatorWidth / 2 + 0.11),
        (LAYOUT.elevatorHeight + 0.3) / 2,
        LAYOUT.elevatorZ - 0.08,
      );
      root.add(jamb);
    }
    const lintelBar = new THREE.Mesh(
      new THREE.BoxGeometry(LAYOUT.elevatorWidth + 0.44, 0.3, 0.14),
      darkMetal,
    );
    lintelBar.position.set(x, LAYOUT.elevatorHeight + 0.15, LAYOUT.elevatorZ - 0.08);
    root.add(lintelBar);
    // recessed car
    const car = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.elevatorWidth, LAYOUT.elevatorHeight), metalMat);
    back.position.set(x, LAYOUT.elevatorHeight / 2, LAYOUT.elevatorZ + 1.82);
    back.rotation.y = Math.PI;
    car.add(back);
    for (const s2 of [-1, 1]) {
      const sideW = new THREE.Mesh(new THREE.PlaneGeometry(1.7, LAYOUT.elevatorHeight), metalMat);
      sideW.position.set(x + s2 * LAYOUT.elevatorWidth * 0.5, LAYOUT.elevatorHeight / 2, LAYOUT.elevatorZ + 0.85);
      sideW.rotation.y = s2 === 1 ? Math.PI / 2 : -Math.PI / 2;
      car.add(sideW);
    }
    const carCeil = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.elevatorWidth, 1.7), new THREE.MeshStandardMaterial({ color: 0xf0f4ee, emissive: 0xbcd0c6, emissiveIntensity: 0.9, roughness: 0.6 }));
    carCeil.rotation.x = Math.PI / 2;
    carCeil.position.set(x, LAYOUT.elevatorHeight - 0.02, LAYOUT.elevatorZ + 0.85);
    car.add(carCeil);
    root.add(car);

    for (const s2 of [-1, 1] as const) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(LAYOUT.elevatorWidth / 2, LAYOUT.elevatorHeight, 0.07),
        metalMat,
      );
      leaf.position.set(x + (s2 * LAYOUT.elevatorWidth) / 4, LAYOUT.elevatorHeight / 2, LAYOUT.elevatorZ - 0.02);
      leaf.userData.closedX = leaf.position.x;
      leaf.userData.side = s2;
      root.add(leaf);
      elevatorDoors.push(leaf);
    }
    const callPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.04), darkMetal);
    callPanel.position.set(x + LAYOUT.elevatorWidth * 0.5 + 0.22, 1.15, LAYOUT.elevatorZ - 0.12);
    root.add(callPanel);
  }

  // a low marble bench and planters to fill the hall out
  for (const side of [-1, 1] as const) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 2.6), marbleMat(1, 1, 0xdfe3dd));
    bench.position.set(side * 7.6, 0.225, 15.0);
    bench.castShadow = true;
    root.add(bench);
  }

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      if (m.material !== glassMat) m.receiveShadow = true;
    }
  });

  return { root, elevatorDoors, entranceDoors, floor, shafts };
}
