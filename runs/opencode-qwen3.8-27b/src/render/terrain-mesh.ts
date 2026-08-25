import * as THREE from 'three';
import { type Terrain, cellToWorldX, cellToWorldZ } from '../sim/terrain';
import { fbm2, smoothstep } from '../sim/noise';

/**
 * Build the static terrain mesh: an indexed n x n grid displaced by the
 * heightfield, shaded with per-vertex colors derived from elevation, slope,
 * and a touch of noise for texture.
 */
export function buildTerrainMesh(terrain: Terrain): THREE.Mesh {
  const { n, height } = terrain;
  const count = n * n;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

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

  const maxH = Math.max(1, terrain.maxHeight);
  const cs = terrain.cellSize;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      positions[k * 3] = cellToWorldX(terrain, i);
      positions[k * 3 + 1] = height[k];
      positions[k * 3 + 2] = cellToWorldZ(terrain, j);

      // Slope from central differences.
      const hl = height[j * n + Math.max(0, i - 1)];
      const hr = height[j * n + Math.min(n - 1, i + 1)];
      const hd = height[Math.max(0, j - 1) * n + i];
      const hu = height[Math.min(n - 1, j + 1) * n + i];
      const slope = Math.sqrt(((hr - hl) / (2 * cs)) ** 2 + ((hu - hd) / (2 * cs)) ** 2) / 1.41;

      const e = height[k] / maxH;

      let r: number, g: number, b: number;
      // Elevation bands: lowland -> meadow -> forest -> rock -> snow.
      const meadow = new THREE.Color(0x6d8f4e);
      const forest = new THREE.Color(0x47693a);
      const rock = new THREE.Color(0x8a8578);
      const scree = new THREE.Color(0x6f6a61);
      const snow = new THREE.Color(0xf4f7fa);
      const low = new THREE.Color(0x8c8a5f);

      if (e < 0.08) {
        [r, g, b] = low.toArray();
      } else if (e < 0.22) {
        const t = smoothstep(0.08, 0.22, e);
        const c = meadow.clone().lerp(forest, t);
        [r, g, b] = c.toArray();
      } else if (e < 0.55) {
        const t = smoothstep(0.22, 0.55, e);
        const c = forest.clone().lerp(rock, t);
        [r, g, b] = c.toArray();
      } else if (e < 0.78) {
        const t = smoothstep(0.55, 0.78, e);
        const c = rock.clone().lerp(scree, t);
        [r, g, b] = c.toArray();
      } else {
        // Steep high ground sheds its snow.
        const snowLine = 0.74 + 0.10 * Math.min(1, slope * 2.2);
        const t = smoothstep(snowLine, snowLine + 0.07, e);
        const c = scree.clone().lerp(snow, t);
        [r, g, b] = c.toArray();
      }

      // Subtle per-vertex tint noise so flat areas don't look painted.
      const tint = 1 + (fbm2(i * 0.09, j * 0.09, 0x5eed, 3) - 0.5) * 0.12;
      colors[k * 3] = Math.min(1, r * tint);
      colors[k * 3 + 1] = Math.min(1, g * tint);
      colors[k * 3 + 2] = Math.min(1, b * tint);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  // The terrain both casts (peaks throw shadows into the caldera and lake) and
  // receives (shaded slopes, the river valley) the sun's shadow map.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
