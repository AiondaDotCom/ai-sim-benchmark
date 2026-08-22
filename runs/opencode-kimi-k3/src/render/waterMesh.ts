import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import type { WaterSim } from '../sim/water';

/**
 * Transparent water surface mesh sharing the terrain grid.
 * Vertices sit at terrain + water depth; dry vertices are hidden far below
 * the terrain. Vertex color + alpha encode depth (shallow = light blue,
 * deep = dark blue).
 */

const SHALLOW = new THREE.Color(0x4fa8d8);
const DEEP = new THREE.Color(0x0a3a66);
const HIDDEN_Y = -10000;

export interface WaterMesh {
  mesh: THREE.Mesh;
  update(): void;
}

export function createWaterMesh(
  terrain: Terrain,
  sim: WaterSim,
  cellSize: number,
): WaterMesh {
  const size = terrain.size;
  const n = size * size;
  const half = ((size - 1) / 2) * cellSize;

  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 4); // rgba vertex colors

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      positions[i * 3] = x * cellSize - half;
      positions[i * 3 + 1] = HIDDEN_Y;
      positions[i * 3 + 2] = y * cellSize - half;
    }
  }

  const indices = new Uint32Array((size - 1) * (size - 1) * 6);
  let k = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const a = y * size + x;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Constant up-normals: calm-water look, avoids per-frame normal recompute.
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normals[i * 3 + 1] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    shininess: 90,
    specular: new THREE.Color(0x88bbdd),
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  // Vertex positions change every frame (and hidden vertices sit at y=-10000),
  // so the static bounding volume would be wrong — disable frustum culling.
  mesh.frustumCulled = false;

  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
  const MIN_DEPTH = 0.05;
  const tmp = new THREE.Color();

  return {
    mesh,
    update(): void {
      const pos = posAttr.array as Float32Array;
      const col = colAttr.array as Float32Array;
      const w = sim.depth;
      const h = terrain.heights;
      for (let i = 0; i < n; i++) {
        const d = w[i];
        if (d > MIN_DEPTH) {
          pos[i * 3 + 1] = h[i] + d + 0.03;
          const deepT = Math.min(1, d / 1.0);
          tmp.lerpColors(SHALLOW, DEEP, deepT);
          const alpha = Math.min(0.9, 0.5 + d * 0.8);
          col[i * 4] = tmp.r;
          col[i * 4 + 1] = tmp.g;
          col[i * 4 + 2] = tmp.b;
          col[i * 4 + 3] = alpha;
        } else {
          pos[i * 3 + 1] = HIDDEN_Y;
          col[i * 4 + 3] = 0;
        }
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    },
  };
}
