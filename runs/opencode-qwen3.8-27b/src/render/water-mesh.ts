import * as THREE from 'three';
import { type Terrain, cellToWorldX, cellToWorldZ } from '../sim/terrain';
import { smoothstep } from '../sim/noise';

/** How far a fully dry water vertex is sunk below the terrain to avoid z-fighting. */
const DRY_SINK = 0.04;
/**
 * Depth-based opacity instead of a hard on/off threshold. A cell's surface
 * fades in smoothly as the water deepens, so:
 *   - a thin rain film reads as a faint wet sheen (not a binary blue flood),
 *   - thin streams stay visible as faint blue threads down to the lake,
 *   - the deep lake is a clear, near-opaque body of water.
 * This is what lets strong rain show as *rising* water rather than a sheet.
 */
const FADE_MIN = 0.03;
const FADE_MAX = 0.4;
/**
 * Amplitude of the cosmetic surface ripple (world units). Kept small: it only
 * needs to gently perturb the normals so the sun glint shimmers rather than
 * sitting as a flat, hard-edged highlight. A large ripple would facet the
 * coarse grid into a visible checker of bright/dark patches.
 */
const RIPPLE_AMP = 0.13;

/**
 * The animated water surface: the same grid topology as the terrain, where
 * every vertex sits at terrain + depth when wet, or just below the terrain
 * when dry. A per-vertex alpha (driven by depth) controls visibility, and a
 * dry vertex is exactly parallel to (and below) the terrain surface it covers,
 * so hidden water can never z-fight or peek through.
 */
export class WaterSurface {
  readonly mesh: THREE.Mesh;

  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private alphas: Float32Array;
  private terrain: Terrain;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    const { n, height } = terrain;
    const count = n * n;

    this.positions = new Float32Array(count * 3);
    this.alphas = new Float32Array(count);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        this.positions[k * 3] = cellToWorldX(terrain, i);
        this.positions[k * 3 + 1] = height[k] - DRY_SINK;
        this.positions[k * 3 + 2] = cellToWorldZ(terrain, j);
        this.alphas[k] = 0;
      }
    }

    const indices = new Uint32Array(2 * (n - 1) * (n - 1) * 3);
    let ptr = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices[ptr++] = a;
        indices[ptr++] = c;
        indices[ptr++] = d;
        indices[ptr++] = a;
        indices[ptr++] = d;
        indices[ptr++] = b;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.MeshPhysicalMaterial({
      // A deep, saturated blue (not a bright sky-blue) and high opacity, so the
      // lake's diffuse reads unmistakably as water. Kept deep on purpose: a dark
      // base means the sun's specular sits ON the blue as a highlight instead of
      // washing the whole surface to white.
      color: 0x0e55a4,
      transparent: true,
      // The per-vertex alpha (vAlpha) scales this base opacity, so the final
      // coverage of a cell is baseOpacity * fade(depth).
      opacity: 0.95,
      // A dielectric with a SUBTLE specular: the deep blue diffuse dominates,
      // with just a gentle sun sheen on top ("am bisschen", per the brief) — a
      // soft, wide lobe so the highlight reads as a faint gleam ON the blue and
      // stays well under the bloom threshold, never a blown-out white blob.
      roughness: 0.5,
      metalness: 0.0,
      ior: 1.32,
      clearcoat: 0.09,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
      // Never write depth: a faint (low-alpha) cell must not occlude the
      // terrain or sky behind it.
      depthWrite: false
    });
    // Inject the per-vertex alpha into the standard lit material.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          'attribute float alpha;\nvarying float vAlpha;\n#include <common>'
        )
        .replace('#include <begin_vertex>', 'vAlpha = alpha;\n#include <begin_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying float vAlpha;\n#include <common>')
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );'
        );
    };

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'water';
    this.mesh.renderOrder = 1;
    // The lake sits in the caldera, so it receives the wall's shadow (a soft
    // shadow gradient across the water is a key "real sun" cue). It does not
    // cast — a thin, depth-ordered surface would only self-shadow.
    this.mesh.receiveShadow = true;
    this.syncNormals();
    // The surface can move up to the mountain height; a static, generous
    // bounding sphere avoids per-frame recompute of the culling bounds.
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, terrain.maxHeight / 2, 0),
      terrain.size * 0.8 + terrain.maxHeight
    );
  }

  /**
   * Push a new water depth field into the mesh (call once per frame). A small
   * animated ripple is added to the surface so the sun's reflection breaks into
   * moving sparkles (a real "sun glitter" look) instead of a static glassy
   * highlight. The ripple is scaled by the per-vertex alpha, so it fades out at
   * the wet/dry edge and never disturbs hidden (dry) vertices.
   */
  update(depth: Float32Array, time: number): void {
    const { height } = this.terrain;
    const pos = this.positions;
    const alpha = this.alphas;
    for (let k = 0; k < depth.length; k++) {
      const d = depth[k];
      if (d > FADE_MIN) {
        const a = smoothstep(FADE_MIN, FADE_MAX, d);
        alpha[k] = a;
        const x = pos[k * 3];
        const z = pos[k * 3 + 2];
        // Three incommensurate, LOW-frequency swell waves (world units). Low
        // frequencies + a small amplitude perturb the normals just enough to
        // shimmer the glint, without the tight, aliased grid that high
        // frequencies would produce on this coarse mesh.
        const ripple =
          RIPPLE_AMP *
          a *
          (0.5 * Math.sin(x * 0.3 + z * 0.22 + time * 1.1) +
            0.35 * Math.sin(x * 0.55 - z * 0.4 + time * 1.7) +
            0.15 * Math.sin(x * 1.1 + z * 0.8 - time * 2.3));
        pos[k * 3 + 1] = height[k] + d + ripple;
      } else {
        pos[k * 3 + 1] = height[k] - DRY_SINK;
        alpha[k] = 0;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    this.syncNormals();
  }

  private syncNormals(): void {
    this.geometry.computeVertexNormals();
  }
}
