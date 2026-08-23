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
import { ELEVATOR } from '../sim/layout';
import type { Mats } from './materials';

/** How far the cladding stands proud of the substrate, in metres. */
export const CLAD_DEPTH = 0.026;

/**
 * Amplitude of the core's own lumpy relief, in metres. Signed: it both raises
 * and lowers the surface inside a wound. Kept strictly below the smallest
 * cavity depth (see CORE_DEPTH) so the raised half can never reach back out
 * through the cladding — B17.
 */
export const LUMP_AMP = 0.026;

/** Cavity depth per surface class, in metres, before the 1.35 shader scale. */
export const CORE_DEPTH = { column: 0.1, wall: 0.05 };

/**
 * B17 invariant: where the exposed core patch sits on a face, in face-local
 * metres.
 *
 * Kept as a pure function of the slab so the invariant can be asserted in a
 * test without a WebGL context — damage may only ever cut INTO the set, so the
 * patch must stay inside the face's own boundary. It is held CLAD_DEPTH clear
 * of each edge because every face's core plane is recessed by exactly that
 * much: two perpendicular patches that each ran to their full face width
 * crossed past one another at a chewed arris and grew a pale flange standing
 * outside the column's outline.
 */
export function fitPatch(s: {
  minI: number; maxI: number; minJ: number; maxJ: number;
  w: number; h: number; uSize: number; vSize: number;
}, cell: number, margin = 3): { u0: number; u1: number; v0: number; v1: number } {
  const i0 = Math.max(0, s.minI - margin);
  const i1 = Math.min(s.w - 1, s.maxI + margin);
  const j0 = Math.max(0, s.minJ - margin);
  const j1 = Math.min(s.h - 1, s.maxJ + margin);
  return {
    u0: Math.max(CLAD_DEPTH, i0 * cell),
    u1: Math.min(s.uSize - CLAD_DEPTH, (i1 + 1) * cell),
    v0: Math.max(CLAD_DEPTH, j0 * cell),
    v1: Math.min(s.vSize - CLAD_DEPTH, (j1 + 1) * cell),
  };
}

/** Compact value noise, shared by the vertex and fragment stages. */
const NOISE_GLSL = `
  float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 s = f * f * (3.0 - 2.0 * f);
    float a = dHash(i), b = dHash(i + vec2(1.0, 0.0));
    float c = dHash(i + vec2(0.0, 1.0)), d = dHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
  }
  float dFbm(vec2 p) {
    return dNoise(p) * 0.55 + dNoise(p * 2.3 + 17.0) * 0.28 + dNoise(p * 5.1 + 41.0) * 0.17;
  }`;

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
/** Cladding: plain inward displacement (currently depth 0, kept for clarity). */
const DISPLACE = `
  {
    float dmgV = texture2D(uDamage, uSubRect.xy + aSlabUv * uSubRect.zw).r;
    transformed -= normal * (uDepth * smoothstep(0.12, 1.0, dmgV));
  }`;

/**
 * Substrate: cavity depth PLUS its own coarse lumpiness. B13 supplement — the
 * exposed core is broken masonry, not a plane, so it gets protruding and
 * recessed pockets and the inside of a wound has real structure and shadow.
 */
const DISPLACE_CORE = `
  {
    float dmgV = texture2D(uDamage, uSubRect.xy + aSlabUv * uSubRect.zw).r;
    float deep = smoothstep(0.12, 1.0, dmgV);
    float lump = (dFbm(aSlabUv * uLumpScale) - 0.5) * 2.0;
    // B17 invariant: damage REMOVES material, so the core may only ever move
    // away from the viewer along the face normal. The lump term is signed, so
    // without this clamp a large enough uLump relative to uDepth would push
    // the core out in front of the cladding plane and the column would get
    // thicker where it was shot. max() makes an outward bulge impossible by
    // construction rather than by a lucky choice of constants.
    transformed -= normal * max(uDepth * deep + lump * uLump * deep, 0.0);
  }`;

/**
 * B12: openings that must never be clad. The elevator wall carries three
 * portals; without cutting them out of BOTH damage layers the cabs (and the
 * pair standing in one) sit behind solid granite.
 */
function cutoutGlsl(rects: [number, number, number, number][]): string {
  if (!rects.length) return '';
  const tests = rects.map(
    (r) => `if (cUv.x > ${r[0].toFixed(5)} && cUv.x < ${r[2].toFixed(5)}`
      + ` && cUv.y > ${r[1].toFixed(5)} && cUv.y < ${r[3].toFixed(5)}) discard;`,
  ).join('\n          ');
  return `
        {
          vec2 cUv = uSubRect.xy + vSlabUv * uSubRect.zw;
          ${tests}
        }`;
}

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

/**
 * B14: `base` is ALREADY the plain cladding material, maps and all. Cloning it
 * means the cutting variant differs from the intact one only in its shader —
 * never in anything that affects how the granite looks.
 */
function makeCladMat(
  base: THREE.MeshStandardMaterial, tex: THREE.Texture, depth: number,
  cutouts: [number, number, number, number][] = [],
  texel: THREE.Vector2 = new THREE.Vector2(0.01, 0.01),
) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDamage = { value: tex };
    shader.uniforms.uDepth = { value: depth };
    shader.uniforms.uSubRect = { value: new THREE.Vector4(0, 0, 1, 1) };
    shader.uniforms.uCTexel = { value: texel };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${SLAB_UV_DECL}
        uniform sampler2D uDamage;
        uniform float uDepth;
        uniform vec4 uSubRect;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${SLAB_UV_ASSIGN}${DISPLACE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${NOISE_GLSL}
        uniform sampler2D uDamage;
        uniform vec2 uCTexel;
        uniform vec4 uSubRect;
        varying vec2 vSlabUv;
        float clHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // thin cracks radiating out of the wound into surviving facing
          float near = 0.0;
          near = max(near, texture2D(uDamage, vSlabUv + vec2( uCTexel.x * 3.0, 0.0)).r);
          near = max(near, texture2D(uDamage, vSlabUv + vec2(-uCTexel.x * 3.0, 0.0)).r);
          near = max(near, texture2D(uDamage, vSlabUv + vec2(0.0,  uCTexel.y * 3.0)).r);
          near = max(near, texture2D(uDamage, vSlabUv + vec2(0.0, -uCTexel.y * 3.0)).r);
          float ridged = 1.0 - abs(dFbm(vSlabUv * 190.0) * 2.0 - 1.0);
          float crack = smoothstep(0.90, 1.0, ridged) * smoothstep(0.12, 0.55, near);
          outgoingLight *= 1.0 - 0.7 * crack;
        }
        #include <opaque_fragment>`)
      .replace('#include <clipping_planes_fragment>', `${cutoutGlsl(cutouts)}
        {
          // B14/B15: the hash used to be applied at FULL strength everywhere,
          // so an area hit once (damage 0.63) came out as a ~70/30 stipple of
          // granite and substrate rather than clean facing or clean core. At
          // distance that mixture read as a rectangle of mismatched, finer
          // grain, and the granite pixels that survived inside a wound kept
          // drawing the tile seam — including its specular highlight — straight
          // through the exposed core.
          // Since B13 removes whole fracture plates, the shape already comes
          // from the plate outline; the hash is now only needed to soften the
          // 3 cm cell steps, so it is confined to a narrow band at the
          // boundary and everything else resolves cleanly one way or the other.
          float dmg = texture2D(uDamage, vSlabUv).r;
          float band = 1.0 - smoothstep(0.06, 0.22, abs(dmg - 0.5));
          float jag = (clHash(floor(vSlabUv * 1400.0)) - 0.5) * 0.30 * band;
          if (dmg + jag > 0.5) discard;
          // B13 supplement: secondary flakes along the broken edge — small
          // nicks of facing that came away just outside the main wound.
          if (dmg > 0.24 && clHash(floor(vSlabUv * 620.0) + 3.7) > 0.82) discard;
        }
        #include <clipping_planes_fragment>`);
  };
  m.customProgramCacheKey = () => `b8-clad${cutouts.length}`;
  return m;
}

/** The substrate: darkened where it sits down inside a hole. */
function makeSubMat(
  base: THREE.MeshStandardMaterial, tex: THREE.Texture, texel: THREE.Vector2,
  rect: THREE.Vector4, depth: number,
  cutouts: [number, number, number, number][] = [],
) {
  const m = base.clone();
  m.map = unitMap(base.map);
  // B13: no normal map. With most of a worked column's facing now gone the
  // substrate covers a large part of frame, and its grain normals are
  // redundant with the damage-gradient bump that shades the cavity anyway —
  // dropping them removes a fetch and the tangent frame per fragment.
  m.normalMap = null;
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
    shader.uniforms.uLump = { value: LUMP_AMP };
    shader.uniforms.uLumpScale = { value: 26.0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${SLAB_UV_DECL}${NOISE_GLSL}
        uniform sampler2D uDamage;
        uniform float uDepth;
        uniform float uLump;
        uniform float uLumpScale;
        uniform vec4 uSubRect;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${SLAB_UV_ASSIGN}${DISPLACE_CORE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${NOISE_GLSL}
        uniform sampler2D uDamage;
        uniform float uLumpScale;
        uniform vec2 uTexel;
        uniform vec4 uSubRect;
        uniform float uBump;
        varying vec2 vSlabUv;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${cutoutGlsl(cutouts)}
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
          // the cavity's own relief shades alongside the wound's depth
          float lumpH = dFbm(vSlabUv * uLumpScale);
          float hTotal = bh * 1.0 + lumpH * 0.55;
          vec3 bgrad = sign(bdet) * (dFdx(hTotal) * br1 + dFdy(hTotal) * br2);
          normal = normalize(abs(bdet) * bn - uBump * bgrad);
          diffuseColor.rgb *= 0.78 + 0.34 * lumpH;
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
  m.customProgramCacheKey = () => `b8-sub${cutouts.length}`;
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

/**
 * B12: the portal openings of a slab, in its 0..1 face space. Empty for every
 * face except the elevator wall. Exported so the invariant that the openings
 * exist, and match the elevator geometry, is testable without a GL context.
 */
export function portalCutouts(slab: Slab): [number, number, number, number][] {
  if (!slab.id.startsWith('wallBack')) return [];
  const hw = ELEVATOR.doorW / 2;
  return ELEVATOR.doors.map((dx) => [
    (dx - hw - slab.origin[0]) / slab.uSize,
    0,
    (dx + hw - slab.origin[0]) / slab.uSize,
    ELEVATOR.doorH / slab.vSize,
  ] as [number, number, number, number]);
}

/**
 * B14: the texture-affecting parameters of a cladding material, so a test can
 * assert the intact and the cutting variant are identical.
 */
export function claddingLook(m: THREE.MeshStandardMaterial): Record<string, number> {
  const t = m.map;
  const n = m.normalMap;
  return {
    repeatX: t ? t.repeat.x : -1, repeatY: t ? t.repeat.y : -1,
    offsetX: t ? t.offset.x : -1, offsetY: t ? t.offset.y : -1,
    hasNormal: n ? 1 : 0,
    normalX: m.normalScale.x, normalY: m.normalScale.y,
    roughness: m.roughness, metalness: m.metalness,
    env: m.envMapIntensity, color: m.color.getHex(),
    hasRough: m.roughnessMap ? 1 : 0,
  };
}

export class Cladding {
  readonly group = new THREE.Group();
  private panels: Panel[] = [];
  /** the intact and cutting cladding materials, for the B14 identity check */
  readonly looks: { plain: THREE.MeshStandardMaterial; cut: THREE.MeshStandardMaterial | null } = { plain: null as unknown as THREE.MeshStandardMaterial, cut: null };
  private plainClad: THREE.MeshStandardMaterial;

  /**
   * The live damage grid for a face, as a texture.
   *
   * B20: a spall crater in polished stone is only valid while that stone is
   * still there, so the decal shader has to be able to read the same grid the
   * cladding reads and clip against it. Exposed here rather than duplicated,
   * so a mark can never disagree with the wall it sits on.
   */
  damageTexFor(slabId: string): THREE.Texture | null {
    return this.panels.find((p) => p.slab.id === slabId)?.tex ?? null;
  }

  constructor(mats: Mats, slabs: Slab[]) {
    // Until a face is actually hit it uses a plain shared material: a discard
    // in the shader disables early-Z for the whole wall, and paying that on
    // every intact surface cost ~6 fps for nothing.
    // B14: the cutting material is cloned FROM this one rather than built
    // alongside it, so the two cannot drift apart in repeat, offset, normal
    // strength, roughness or envMap intensity. A face that had taken a single
    // bullet would otherwise change appearance wholesale, and the seam would
    // land exactly on a face boundary — a rectangle.
    this.plainClad = mats.marble.clone();
    this.plainClad.map = unitMap(mats.marble.map);
    this.plainClad.normalMap = unitMap(mats.marble.normalMap);
    this.plainClad.roughnessMap = unitMap(mats.marble.roughnessMap);
    this.looks.plain = this.plainClad;

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
      // A12: only what actually gets shot is tessellated. Column faces are
      // 1.3 m wide and their corners form the silhouette, so they get crater
      // scale (6 cm) up to 3.2 m; wall segments are 6 m wide with no
      // silhouette of their own and get a coarser band.
      // B12: the elevator wall's three portals are holes in both layers
      const cutouts = portalCutouts(slab);
      const texel = new THREE.Vector2(1 / slab.w, 1 / slab.h);
      const isCol = slab.id.startsWith('col');
      const cell = isCol ? 0.06 : 0.14;
      const denseTo = isCol ? 3.2 : 2.6;
      // deep enough that a spalled corner visibly notches the silhouette
      const depth = isCol ? 0.1 : 0.05;
      // A12: the cladding stays a plain quad. Where it is damaged it is
      // discarded, so the visible profile at a chewed arris is the SUBSTRATE
      // behind it — tessellating the facing as well bought nothing and cost
      // 3.4 fps of median in geometry and vertex texture fetches.
      // A face with openings needs its own cutting material from the start —
      // the shared plain one has no cutout, so the portals would stay covered
      // until the wall happened to take damage (B12).
      const clad = new THREE.Mesh(
        facePlane(slab.uSize, slab.vSize, 0.62, flipU),
        cutouts.length
          ? makeCladMat(this.plainClad, tex, 0, cutouts, texel)
          : this.plainClad,
      );
      clad.name = `clad:${slab.id}`;
      clad.rotation.y = rotY;
      clad.position.set(cx, cy, cz);
      if (slab.axis === 0) clad.position.x += dir * 0.002;
      else clad.position.z += dir * 0.002;
      this.group.add(clad);

      const subRect = new THREE.Vector4(0, 0, 1, 1);
      // the substrate is a patch sized to the damaged area, not a second
      // full-size wall drawn behind every intact one
      const sub = new THREE.Mesh(
        facePlane(1, 1, 1, flipU, cell / Math.max(slab.uSize, 0.001), denseTo),
        makeSubMat(
          mats.substrate, tex, texel,
          subRect, depth * 1.35, cutouts,
        ),
      );
      sub.name = `sub:${slab.id}`;
      sub.visible = false;
      sub.rotation.y = rotY;
      sub.position.set(cx, cy, cz);
      if (slab.axis === 0) sub.position.x -= dir * CLAD_DEPTH;
      else sub.position.z -= dir * CLAD_DEPTH;
      this.group.add(sub);

      this.panels.push({
        slab, tex, version: 0, clad, sub, cutMat: null,
        subOrigin: sub.position.clone(), subRect,
        makeCut: () => makeCladMat(this.plainClad, tex, 0, cutouts, texel),
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
        if (!this.looks.cut) this.looks.cut = p.cutMat;
        p.clad.material = p.cutMat;
      }
      // fit the substrate patch to the damaged bounds, with a small margin so
      // the rim shading has somewhere to fall off
      p.sub.visible = true;
      // B17: work in metres and hold the patch CLAD_DEPTH clear of the face's
      // own edges. Each face's substrate plane sits CLAD_DEPTH behind its own
      // cladding, so two perpendicular patches that each ran to their full
      // face width crossed past one another at a chewed arris — every corner
      // grew a pale flange standing outside the column's outline. Insetting by
      // exactly the recess depth makes the two planes meet in the corner
      // instead of overshooting it.
      const gridU = s.w * cellSize;
      const gridV = s.h * cellSize;
      const { u0, u1, v0, v1 } = fitPatch(s, cellSize);
      const wW = Math.max(cellSize, u1 - u0);
      const hW = Math.max(cellSize, v1 - v0);
      p.sub.scale.set(wW, hW, 1);
      // B14: the patch geometry is a unit plane scaled to the damaged bbox, so
      // its uv is 0..1 whatever the patch's world size is. Without driving the
      // repeat from that size the substrate showed its texture at a different
      // frequency on every patch — a rectangle of mismatched grain with a hard
      // seam, which is exactly the artifact reported.
      const sm = p.sub.material as THREE.MeshStandardMaterial;
      for (const t of [sm.map, sm.roughnessMap]) {
        if (t) { t.repeat.set(wW * 0.9, hW * 0.9); t.needsUpdate = true; }
      }
      // the damage texture's uv spans the CELL GRID, so the patch's window
      // into it is expressed against the grid extent, not the face extent
      p.subRect.set(u0 / gridU, v0 / gridV, wW / gridU, hW / gridV);
      // offset from the face centre, in the plane's local axes
      const du = (u0 + u1) * 0.5 - s.uSize / 2;
      const dv = (v0 + v1) * 0.5 - s.vSize / 2;
      p.sub.position.copy(p.subOrigin);
      const right = new THREE.Vector3(1, 0, 0).applyEuler(p.sub.rotation);
      p.sub.position.addScaledVector(right, du);
      p.sub.position.y += dv;
    }
  }
}
