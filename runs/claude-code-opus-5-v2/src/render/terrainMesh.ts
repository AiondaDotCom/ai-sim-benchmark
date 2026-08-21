/**
 * Builds the static terrain mesh from a `Terrain` heightfield.
 *
 * The mesh grid is 1:1 with the simulation grid: one vertex per cell, placed at
 * the cell centre. That means the water surface mesh can share the exact same
 * topology and the two never disagree about where the ground is.
 *
 * Colour is baked into vertex colours (height bands modulated by slope), which
 * avoids needing any external texture asset.
 */

import * as THREE from 'three';
import { Terrain } from '../sim/terrain';
import { clamp, smoothstep, Noise2D } from '../sim/noise';

export interface TerrainMeshResult {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Average vertex colour of the outermost ring of the heightfield. */
  borderColor: THREE.Color;
  /** World-space Y of the lowest terrain sample. */
  minHeight: number;
  maxHeight: number;
}

const ROCK = new THREE.Color('#6f6a66');
const ROCK_DARK = new THREE.Color('#4c4844');
const SNOW = new THREE.Color('#f4f7fb');
const GRASS_HIGH = new THREE.Color('#5f7d4a');
const GRASS = new THREE.Color('#6f9350');
const MEADOW = new THREE.Color('#87a95c');
const SAND = new THREE.Color('#b9a878');
const SILT = new THREE.Color('#7d7452');

export function createTerrainMesh(terrain: Terrain): TerrainMeshResult {
  const n = terrain.size;
  const cell = terrain.cellSize;
  const half = terrain.worldSize / 2;
  const vertexCount = n * n;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  const range = Math.max(1e-6, terrain.maxHeight - terrain.minHeight);
  const tint = new Noise2D(`${terrain.options.seed}::tint`);
  const color = new THREE.Color();
  const tmp = new THREE.Color();

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const h = terrain.heights[i];

      positions[i * 3] = (c + 0.5) * cell - half;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = (r + 0.5) * cell - half;

      uvs[i * 2] = c / (n - 1);
      uvs[i * 2 + 1] = r / (n - 1);

      // Slope in height-units per cell -> steepness in [0, 1].
      const g = terrain.gradientAt(c, r);
      const slope = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
      const steep = smoothstep(0.35, 1.35, slope);

      const t = clamp((h - terrain.minHeight) / range, 0, 1);
      const variation = tint.fbm(c * 0.06, r * 0.06, 3) * 0.5 + 0.5;

      // Height bands: silt/sand -> meadow -> grass -> rock -> snow.
      if (t < 0.1) {
        color.copy(SILT).lerp(SAND, smoothstep(0.0, 0.1, t));
      } else if (t < 0.24) {
        color.copy(SAND).lerp(MEADOW, smoothstep(0.1, 0.24, t));
      } else if (t < 0.45) {
        color.copy(MEADOW).lerp(GRASS, smoothstep(0.24, 0.45, t));
      } else if (t < 0.62) {
        color.copy(GRASS).lerp(GRASS_HIGH, smoothstep(0.45, 0.62, t));
      } else if (t < 0.72) {
        color.copy(GRASS_HIGH).lerp(ROCK, smoothstep(0.62, 0.72, t));
      } else {
        // Snow only settles where the face is not too steep to hold it.
        const snowLine = smoothstep(0.72, 0.86, t) * (1 - steep * 0.55);
        color.copy(ROCK).lerp(SNOW, clamp(snowLine, 0, 1));
      }

      // Exposed rock on steep faces at any altitude.
      tmp.copy(ROCK).lerp(ROCK_DARK, variation * 0.6);
      color.lerp(tmp, steep * 0.7 * (1 - smoothstep(0.80, 0.94, t)));

      // Subtle per-patch variation so large areas do not read as flat paint.
      const v = 0.9 + variation * 0.2;
      colors[i * 3] = color.r * v;
      colors[i * 3 + 1] = color.g * v;
      colors[i * 3 + 2] = color.b * v;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(buildGridIndex(n));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  return {
    mesh,
    geometry,
    material,
    borderColor: averageBorderColor(colors, n),
    minHeight: terrain.minHeight,
    maxHeight: terrain.maxHeight,
  };
}

/**
 * Mean vertex colour of the outer ring. The surrounding ground plane is painted
 * with it so the edge of the heightfield does not read as a cut-out plate.
 */
function averageBorderColor(colors: Float32Array, n: number): THREE.Color {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  // A band rather than a single ring: the very outermost row sits at the global
  // minimum height and is therefore darker than the apron the viewer sees.
  const band = Math.max(2, Math.round(n * 0.025));
  for (let row = 0; row < n; row++) {
    for (let c = 0; c < n; c++) {
      const d = Math.min(row, c, n - 1 - row, n - 1 - c);
      if (d >= band) continue;
      const i = row * n + c;
      r += colors[i * 3];
      g += colors[i * 3 + 1];
      b += colors[i * 3 + 2];
      count++;
    }
  }
  return new THREE.Color(r / count, g / count, b / count);
}

/** Triangle indices for an n x n vertex grid. */
export function buildGridIndex(n: number): THREE.BufferAttribute {
  const quads = (n - 1) * (n - 1);
  const array =
    n * n > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
  let p = 0;
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const a = r * n + c;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      array[p++] = a;
      array[p++] = d;
      array[p++] = b;
      array[p++] = b;
      array[p++] = d;
      array[p++] = e;
    }
  }
  return new THREE.BufferAttribute(array, 1);
}

/**
 * A large, very slightly sunken plane under the terrain so the horizon does not
 * show empty space beyond the heightfield border.
 */
export function createGroundPlane(terrain: Terrain, color: THREE.Color): THREE.Mesh {
  const size = terrain.worldSize * 30;
  const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: color.clone(),
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = terrain.minHeight - 0.03;
  mesh.receiveShadow = false;
  mesh.name = 'ground';
  return mesh;
}
