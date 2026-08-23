/**
 * B8: two-layer walls and columns.
 *
 * The granite is a real outer layer standing a couple of centimetres proud of
 * a rough substrate behind it. Damage is not painted on: the simulation's
 * per-face cell grid is uploaded as a small data texture and the cladding
 * shader DISCARDS fragments where cells have been stripped, so the substrate
 * shows through an actual recess, with a real lip and a darkened rim.
 *
 * No geometry is created per hit. A hit only flips bytes in the sim grid and
 * bumps a version number; the texture for that one face is re-uploaded.
 */
import * as THREE from 'three';
import { cellSize, type Slab } from '../sim/damage';
import type { Mats } from './materials';

/** How far the cladding stands proud of the substrate, in metres. */
export const CLAD_DEPTH = 0.026;

const SLAB_UV_DECL = `
  attribute vec2 aSlabUv;
  varying vec2 vSlabUv;`;

const SLAB_UV_ASSIGN = `
  vSlabUv = aSlabUv;`;

/**
 * A12: push the surface inward along its normal by the accumulated damage, so
 * craters have real depth and self-shadow under grazing light instead of being
 * a painted disc. The same displacement pulls the edge of a column face back,
 * which is what chews the silhouette at the arris.
 */
const DISPLACE = `
  {
    float dmgV = texture2D(uDamage, uSubRect.xy + aSlabUv * uSubRect.zw).r;
    transformed -= normal * (uDepth * smoothstep(0.12, 1.0, dmgV));
  }`;

interface Panel {
  slab: Slab;
  tex: THREE.DataTexture;
  version: number;
  clad: THREE.Mesh;
  sub: THREE.Mesh;
  /** un-offset centre of the face, for placing the substrate patch */
  subOrigin: THREE.Vector3;
  subRect: THREE.Vector4;
  /** the discarding material, built only once this face is actually hit */
  cutMat: THREE.MeshStandardMaterial | null;
  makeCut: () => THREE.MeshStandardMaterial;
}

/** The cladding: discards where the facing has come off, with a ragged edge. */
function unitMap(t: THREE.Texture | null): THREE.Texture | null {
  if (!t) return null;
  const c = t.clone();
  c.repeat.set(1, 1);
  c.needsUpdate = true;
  return c;
}

function makeCladMat(
  base: THREE.MeshStandardMaterial, tex: THREE.Texture, depth: number,
) {
  const m = base.clone();
  // the face geometry carries the tiling in its uv, so the maps must not
  // apply a second repeat on top
  m.map = unitMap(base.map);
  m.normalMap = unitMap(base.normalMap);
  m.roughnessMap = unitMap(base.roughnessMap);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDamage = { value: tex };
    shader.uniforms.uDepth = { value: depth };
    shader.uniforms.uSubRect = { value: new THREE.Vector4(0, 0, 1, 1) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${SLAB_UV_DECL}
        uniform sampler2D uDamage;
        uniform float uDepth;
        uniform vec4 uSubRect;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${SLAB_UV_ASSIGN}${DISPLACE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDamage;
        varying vec2 vSlabUv;
        float clHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }`)
      .replace('#include <clipping_planes_fragment>', `
        {
          // The cell grid says WHERE the facing is gone; this hash breaks the
          // boundary up below cell size, so the fracture edge is jagged
          // instead of following the grid squares.
          float dmg = texture2D(uDamage, vSlabUv).r;
          float jag = clHash(floor(vSlabUv * 1400.0)) * 0.42 - 0.21;
          if (dmg + jag > 0.5) discard;
        }
        #include <clipping_planes_fragment>`);
  };
  m.customProgramCacheKey = () => 'b8-clad';
  return m;
}

/** The substrate: darkened where it sits down inside a hole. */
function makeSubMat(
  base: THREE.MeshStandardMaterial, tex: THREE.Texture, texel: THREE.Vector2,
  rect: THREE.Vector4, depth: number,
) {
  const m = base.clone();
  m.map = unitMap(base.map);
  m.normalMap = unitMap(base.normalMap);
  m.roughnessMap = unitMap(base.roughnessMap);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDamage = { value: tex };
    // in TEXELS, not UV: a face is 1.3 m wide on a column and 6 m on a wall,
    // so a fixed UV offset is sub-cell on one and huge on the other, and the
    // rim shading silently did nothing on the columns
    shader.uniforms.uTexel = { value: texel };
    shader.uniforms.uSubRect = { value: rect };
    shader.uniforms.uDepth = { value: depth };
    shader.uniforms.uBump = { value: 1.35 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${SLAB_UV_DECL}
        uniform sampler2D uDamage;
        uniform float uDepth;
        uniform vec4 uSubRect;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${SLAB_UV_ASSIGN}${DISPLACE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDamage;
        uniform vec2 uTexel;
        uniform vec4 uSubRect;
        uniform float uBump;
        varying vec2 vSlabUv;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // A12: relief from the damage field itself. Vertex displacement
          // moves the surface but leaves its normals flat, so a crater would
          // still shade like a painted disc. This perturbs the normal by the
          // screen-space gradient of the damage height — the same formulation
          // three uses for a bump map, but with no tangents needed — so a
          // cavity actually catches and loses grazing light.
          vec2 bUv = uSubRect.xy + vSlabUv * uSubRect.zw;
          float bh = texture2D(uDamage, bUv).r;
          vec3 bdx = dFdx(-vViewPosition);
          vec3 bdy = dFdy(-vViewPosition);
          vec3 bn = normalize(normal);
          vec3 br1 = cross(bdy, bn);
          vec3 br2 = cross(bn, bdx);
          float bdet = dot(bdx, br1);
          vec3 bgrad = sign(bdet) * (dFdx(bh) * br1 + dFdy(bh) * br2);
          normal = normalize(abs(bdet) * bn - uBump * bgrad);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // How much facing still stands around this point. The lip casts no
          // real shadow at 26 mm, so the contact darkening that sells "the
          // facing broke off here" is added explicitly: strongest right under
          // the rim, fading out toward the middle of a large stripped patch.
          // the patch only covers part of the face, so map into that window
          vec2 sUv = uSubRect.xy + vSlabUv * uSubRect.zw;
          vec2 e = uTexel * 1.7;
          float o = 0.0;
          o += texture2D(uDamage, sUv + vec2( e.x, 0.0)).r;
          o += texture2D(uDamage, sUv + vec2(-e.x, 0.0)).r;
          o += texture2D(uDamage, sUv + vec2(0.0,  e.y)).r;
          o += texture2D(uDamage, sUv + vec2(0.0, -e.y)).r;
          o += texture2D(uDamage, sUv + vec2( e.x * 2.0, 0.0)).r;
          o += texture2D(uDamage, sUv + vec2(-e.x * 2.0, 0.0)).r;
          o += texture2D(uDamage, sUv + vec2(0.0,  e.y * 2.0)).r;
          o += texture2D(uDamage, sUv + vec2(0.0, -e.y * 2.0)).r;
          float rim = 1.0 - clamp(o * 0.125, 0.0, 1.0);
          // sitting 26 mm inside the wall, the whole recess is a little darker
          outgoingLight *= (1.0 - 0.66 * rim) * 0.93;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'b8-sub';
  return m;
}

/**
 * A12: rows are dense up to `denseTo` metres and sparse above it. Fire lands
 * between roughly knee and head height, so tessellating a 7 m face uniformly
 * at crater scale would spend most of its triangles where nothing is ever hit.
 */
function tessellate(uSize: number, vSize: number, cell: number, denseTo: number) {
  const cols = Math.max(1, Math.round(uSize / cell));
  const rows: number[] = [];
  for (let y = 0; y <= Math.min(vSize, denseTo) + 1e-6; y += cell) rows.push(y);
  const coarse = Math.max(cell * 4, 0.5);
  for (let y = rows[rows.length - 1] + coarse; y < vSize; y += coarse) rows.push(y);
  if (rows[rows.length - 1] < vSize - 1e-6) rows.push(vSize);

  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const v = rows[j] / vSize;
      pos.push((u - 0.5) * uSize, (v - 0.5) * vSize, 0);
      uvs.push(u, v);
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      // counter-clockwise seen from +Z, so the face points out like a
      // PlaneGeometry does; the reverse winding culls the whole cladding
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A face plane carrying two UV sets: `uv` tiles the material, `aSlabUv` is
 * 0..1 across the face for the damage lookup.
 */
function facePlane(
  uSize: number, vSize: number, tile: number, flipU: boolean,
  cell = 0, denseTo = 0,
) {
  const geo = cell > 0
    ? tessellate(uSize, vSize, cell, denseTo)
    : new THREE.PlaneGeometry(uSize, vSize);
  const uv = geo.attributes.uv;
  const slab = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    slab[i * 2] = flipU ? 1 - u : u;
    slab[i * 2 + 1] = v;
  }
  geo.setAttribute('aSlabUv', new THREE.BufferAttribute(slab, 2));
  // tile the material afterwards, so the slab UVs stay 0..1
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uSize * tile, uv.getY(i) * vSize * tile);
  }
  uv.needsUpdate = true;
  return geo;
}

export class Cladding {
  readonly group = new THREE.Group();
  private panels: Panel[] = [];
  private plainClad: THREE.MeshStandardMaterial | null = null;

  constructor(mats: Mats, slabs: Slab[]) {
    for (const slab of slabs) {
      const tex = new THREE.DataTexture(
        slab.cells as unknown as Uint8Array<ArrayBuffer>,
        slab.w, slab.h, THREE.RedFormat, THREE.UnsignedByteType,
      );
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;

      const dir = slab.sign;
      // plane local +X vs the slab's u axis
      const flipU = slab.axis === 0 ? dir > 0 : dir < 0;
      const rotY = slab.axis === 0
        ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (dir > 0 ? 0 : Math.PI);

      const cx = slab.origin[0] + (slab.uAxis === 0 ? slab.uSize / 2 : 0);
      const cy = slab.origin[1] + slab.vSize / 2;
      const cz = slab.origin[2] + (slab.uAxis === 2 ? slab.uSize / 2 : 0);

      // cladding sits ON the original surface plane, so the silhouette of the
      // set is unchanged; the substrate is inset behind it
      // Until a face is actually hit it uses a plain shared material: a
      // discard in the shader disables early-Z for the whole wall, and paying
      // that on every intact surface cost ~6 fps for nothing.
      if (!this.plainClad) {
        this.plainClad = mats.marble.clone();
        this.plainClad.map = unitMap(mats.marble.map);
        this.plainClad.normalMap = unitMap(mats.marble.normalMap);
        this.plainClad.roughnessMap = unitMap(mats.marble.roughnessMap);
      }
      // A12: only what actually gets shot is tessellated. Column faces are
      // 1.3 m wide and their corners form the silhouette, so they get crater
      // scale (6 cm) up to 3.2 m; wall segments are 6 m wide with no
      // silhouette of their own and get a coarser band.
      const isCol = slab.id.startsWith('col');
      const cell = isCol ? 0.06 : 0.14;
      const denseTo = isCol ? 3.2 : 2.6;
      // deep enough that a spalled corner visibly notches the silhouette
      const depth = isCol ? 0.1 : 0.05;
      // A12: the cladding stays a plain quad. Where it is damaged it is
      // discarded, so the visible profile at a chewed arris is the SUBSTRATE
      // behind it — tessellating the facing as well bought nothing and cost
      // 3.4 fps of median in geometry and vertex texture fetches.
      const clad = new THREE.Mesh(
        facePlane(slab.uSize, slab.vSize, 0.62, flipU),
        this.plainClad,
      );
      clad.rotation.y = rotY;
      clad.position.set(cx, cy, cz);
      if (slab.axis === 0) clad.position.x += dir * 0.002;
      else clad.position.z += dir * 0.002;
      this.group.add(clad);

      const subRect = new THREE.Vector4(0, 0, 1, 1);
      // the substrate is a patch sized to the damaged area, not a second
      // full-size wall drawn behind every intact one
      const sub = new THREE.Mesh(
        facePlane(1, 1, 0.9, flipU, cell / Math.max(slab.uSize, 0.001), denseTo),
        makeSubMat(
          mats.substrate, tex, new THREE.Vector2(1 / slab.w, 1 / slab.h),
          subRect, depth * 1.35,
        ),
      );
      sub.visible = false;
      sub.rotation.y = rotY;
      sub.position.set(cx, cy, cz);
      if (slab.axis === 0) sub.position.x -= dir * CLAD_DEPTH;
      else sub.position.z -= dir * CLAD_DEPTH;
      this.group.add(sub);

      this.panels.push({
        slab, tex, version: 0, clad, sub, cutMat: null,
        subOrigin: sub.position.clone(), subRect,
        makeCut: () => makeCladMat(mats.marble, tex, 0),
      });
    }
  }

  /** Re-upload and re-fit only the faces whose cladding changed. */
  update() {
    for (const p of this.panels) {
      if (p.slab.version === p.version) continue;
      p.version = p.slab.version;
      p.tex.needsUpdate = true;

      const s = p.slab;
      if (!p.cutMat) {
        // first damage on this face: from here it has to cut
        p.cutMat = p.makeCut();
        p.clad.material = p.cutMat;
      }
      // fit the substrate patch to the damaged bounds, with a small margin so
      // the rim shading has somewhere to fall off
      const m = 3;
      const i0 = Math.max(0, s.minI - m);
      const i1 = Math.min(s.w - 1, s.maxI + m);
      const j0 = Math.max(0, s.minJ - m);
      const j1 = Math.min(s.h - 1, s.maxJ + m);
      const wCells = i1 - i0 + 1;
      const hCells = j1 - j0 + 1;
      p.sub.visible = true;
      p.sub.scale.set(wCells * cellSize, hCells * cellSize, 1);
      p.subRect.set(i0 / s.w, j0 / s.h, wCells / s.w, hCells / s.h);
      // offset from the face centre, in the plane's local axes
      const du = ((i0 + i1 + 1) * 0.5 * cellSize) - s.uSize / 2;
      const dv = ((j0 + j1 + 1) * 0.5 * cellSize) - s.vSize / 2;
      p.sub.position.copy(p.subOrigin);
      const right = new THREE.Vector3(1, 0, 0).applyEuler(p.sub.rotation);
      p.sub.position.addScaledVector(right, du);
      p.sub.position.y += dv;
    }
  }
}
