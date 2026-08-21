import * as THREE from 'three';
import type { TerrainData } from '../sim/terrain';
import { gridToWorldX, gridToWorldZ } from '../sim/terrain';

const SAND = new THREE.Color('#d9c58a');
const GRASS = new THREE.Color('#5c8a3a');
const ROCK = new THREE.Color('#7a7264');
const SNOW = new THREE.Color('#f5f7fa');

/** Builds a static Three.js mesh for the terrain height-field, coloured by elevation/slope. */
export function buildTerrainMesh(terrain: TerrainData): THREE.Mesh {
  const { resolution, maxHeight } = terrain;
  const geometry = new THREE.PlaneGeometry(
    terrain.worldSize,
    terrain.worldSize,
    resolution - 1,
    resolution - 1,
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();

  for (let gy = 0; gy < resolution; gy++) {
    for (let gx = 0; gx < resolution; gx++) {
      const idx = gy * resolution + gx;
      const h = terrain.heights[idx];
      positions.setY(idx, h);

      const t = THREE.MathUtils.clamp(h / maxHeight, 0, 1);
      if (t < 0.05) {
        color.copy(SAND);
      } else if (t < 0.45) {
        color.copy(GRASS).lerp(ROCK, (t - 0.05) / 0.4);
      } else if (t < 0.8) {
        color.copy(ROCK);
      } else {
        color.copy(ROCK).lerp(SNOW, (t - 0.8) / 0.2);
      }
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** World-space X/Z helpers re-exported for convenience where a mesh consumer needs them. */
export { gridToWorldX, gridToWorldZ };
