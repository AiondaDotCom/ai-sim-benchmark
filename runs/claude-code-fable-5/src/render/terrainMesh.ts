import * as THREE from 'three';
import { createGridGeometry } from './gridGeometry';
import { hash2 } from '../sim/noise';

/** Static terrain mesh with height-and-slope based vertex colours. */
export function createTerrainMesh(heights: Float32Array, width: number, height: number): THREE.Mesh {
  const geo = createGridGeometry(width, height, false);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < heights.length; i++) {
    pos.setY(i, heights[i]);
  }
  pos.needsUpdate = true;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < min) min = heights[i];
    if (heights[i] > max) max = heights[i];
  }
  const range = Math.max(1e-6, max - min);

  const grassLow = new THREE.Color(0x4a7c3a);
  const grassHigh = new THREE.Color(0x6f8f4a);
  const rock = new THREE.Color(0x77685c);
  const rockDark = new THREE.Color(0x5a4f46);
  const snow = new THREE.Color(0xf2f4f7);
  const tmp = new THREE.Color();

  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const h = heights[i];
      const t = (h - min) / range;

      // Slope from central differences (cell size = 1).
      const xl = heights[y * width + Math.max(0, x - 1)];
      const xr = heights[y * width + Math.min(width - 1, x + 1)];
      const yt = heights[Math.max(0, y - 1) * width + x];
      const yb = heights[Math.min(height - 1, y + 1) * width + x];
      const slope = Math.sqrt(((xr - xl) / 2) ** 2 + ((yb - yt) / 2) ** 2);

      // Deterministic per-vertex jitter breaks up colour banding.
      const jitter = (hash2(x, y, 421) - 0.5) * 0.12;

      tmp.copy(grassLow).lerp(grassHigh, Math.min(1, t * 1.8));
      const rockMix = Math.min(1, Math.max(0, (slope - 0.45) / 0.5));
      tmp.lerp(slope > 0.9 ? rockDark : rock, rockMix);
      const snowMix = Math.min(1, Math.max(0, (t - 0.62 - jitter) / 0.14)) * (1 - Math.min(1, slope / 1.6));
      tmp.lerp(snow, snowMix);

      const shade = 1 + jitter * 0.5;
      col.setXYZ(i, tmp.r * shade, tmp.g * shade, tmp.b * shade);
    }
  }
  col.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  return mesh;
}
