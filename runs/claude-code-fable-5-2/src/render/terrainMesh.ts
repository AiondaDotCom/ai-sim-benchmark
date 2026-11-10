import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Builds the static, vertex-coloured terrain mesh from the height field. */
export function createTerrainMesh(terrain: Terrain): THREE.Mesh {
  const { size, cellSize, heights, maxHeight } = terrain;
  const half = (size - 1) / 2;
  const count = size * size;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const seabed = new THREE.Color(0x8a8f72);
  const sand = new THREE.Color(0xd9c58e);
  const grass = new THREE.Color(0x6f9c45);
  const forest = new THREE.Color(0x3f6f38);
  const alpine = new THREE.Color(0x8b8f5c);
  const rock = new THREE.Color(0x8d857a);
  const darkRock = new THREE.Color(0x6e675f);
  const snow = new THREE.Color(0xf6f9fc);
  const c = new THREE.Color();

  const h = (x: number, y: number) =>
    heights[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const height = heights[i];
      positions[i * 3] = (x - half) * cellSize;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = (y - half) * cellSize;

      const dx = (h(x + 1, y) - h(x - 1, y)) / (2 * cellSize);
      const dz = (h(x, y + 1) - h(x, y - 1)) / (2 * cellSize);
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      normals[i * 3] = -dx * inv;
      normals[i * 3 + 1] = inv;
      normals[i * 3 + 2] = -dz * inv;

      const slope = Math.sqrt(dx * dx + dz * dz);
      const jitter = hash2(x, y);
      const t = height / maxHeight + (jitter - 0.5) * 0.05;

      // Altitude bands.
      c.copy(seabed).lerp(sand, smooth(-3.5, 0.3, height));
      c.lerp(grass, smooth(0.012, 0.05, t));
      c.lerp(forest, smooth(0.1, 0.3, t) * 0.85);
      c.lerp(alpine, smooth(0.36, 0.52, t));
      c.lerp(rock, smooth(0.5, 0.66, t));
      // Steep faces show bare rock, except on the beach.
      c.lerp(darkRock, smooth(0.6, 1.3, slope) * smooth(0.02, 0.08, t) * 0.8);
      // Snow settles on high ground that is not too steep.
      c.lerp(snow, smooth(0.6, 0.74, t - slope * 0.05));
      // Subtle per-vertex variation so large areas do not look flat.
      const shade = 0.93 + 0.14 * jitter;
      colors[i * 3] = c.r * shade;
      colors[i * 3 + 1] = c.g * shade;
      colors[i * 3 + 2] = c.b * shade;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(createGridIndex(size));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Triangle indices for a size x size vertex grid. */
export function createGridIndex(size: number): THREE.BufferAttribute {
  const quads = (size - 1) * (size - 1);
  const index = new Uint32Array(quads * 6);
  let k = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const a = y * size + x;
      const b = a + 1;
      const d = a + size;
      const e = d + 1;
      index[k++] = a;
      index[k++] = d;
      index[k++] = b;
      index[k++] = b;
      index[k++] = d;
      index[k++] = e;
    }
  }
  return new THREE.BufferAttribute(index, 1);
}
