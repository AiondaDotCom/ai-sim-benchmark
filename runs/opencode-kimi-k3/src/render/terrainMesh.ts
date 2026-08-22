import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import type { WaterSim } from '../sim/water';

/**
 * Static terrain mesh with height/slope based coloring.
 * Colors are recomputed per frame to darken cells that are wet or submerged.
 */

const SAND = new THREE.Color(0xc9b586);
const GRASS = new THREE.Color(0x4d7a34);
const FOREST = new THREE.Color(0x2f5d2a);
const ROCK = new THREE.Color(0x6f6258);
const SNOW = new THREE.Color(0xf2f5f8);

function baseColor(h01: number, slope: number, out: THREE.Color): void {
  if (h01 < 0.18) {
    out.lerpColors(SAND, GRASS, h01 / 0.18);
  } else if (h01 < 0.45) {
    out.lerpColors(GRASS, FOREST, (h01 - 0.18) / 0.27);
  } else if (h01 < 0.62) {
    out.lerpColors(FOREST, ROCK, (h01 - 0.45) / 0.17);
  } else if (h01 < 0.8) {
    out.lerpColors(ROCK, SNOW, (h01 - 0.62) / 0.18);
  } else {
    out.copy(SNOW);
  }
  // Steep slopes become rocky regardless of height.
  const rockiness = Math.min(1, Math.max(0, (slope - 0.55) / 0.35));
  if (rockiness > 0 && h01 < 0.8) out.lerp(ROCK, rockiness * 0.7);
}

export interface TerrainMesh {
  mesh: THREE.Mesh;
  /** Recompute wetness darkening from the current water state. */
  updateWetness(sim: WaterSim): void;
}

export function createTerrainMesh(
  terrain: Terrain,
  cellSize: number,
): TerrainMesh {
  const size = terrain.size;
  const n = size * size;
  const half = ((size - 1) / 2) * cellSize;

  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const base = new Float32Array(n * 3);
  const slopes = new Float32Array(n);

  let hMax = 0;
  for (let i = 0; i < n; i++) if (terrain.heights[i] > hMax) hMax = terrain.heights[i];
  const invMax = 1 / (hMax || 1);

  const tmp = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = terrain.heights[i];
      positions[i * 3] = x * cellSize - half;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = y * cellSize - half;

      // Approximate slope from central differences.
      const hx1 = terrain.heights[y * size + Math.max(0, x - 1)];
      const hx2 = terrain.heights[y * size + Math.min(size - 1, x + 1)];
      const hy1 = terrain.heights[Math.max(0, y - 1) * size + x];
      const hy2 = terrain.heights[Math.min(size - 1, y + 1) * size + x];
      const gx = (hx2 - hx1) / (2 * cellSize);
      const gy = (hy2 - hy1) / (2 * cellSize);
      const slope = Math.sqrt(gx * gx + gy * gy);
      slopes[i] = slope;

      baseColor(h * invMax, slope, tmp);
      base[i * 3] = tmp.r;
      base[i * 3 + 1] = tmp.g;
      base[i * 3 + 2] = tmp.b;
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
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
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';

  const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;

  return {
    mesh,
    updateWetness(sim: WaterSim): void {
      const w = sim.depth;
      const arr = colorAttr.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const wet = Math.min(1, w[i] * 6);
        const f = 1 - 0.45 * wet;
        arr[i * 3] = base[i * 3] * f;
        arr[i * 3 + 1] = base[i * 3 + 1] * f;
        arr[i * 3 + 2] = base[i * 3 + 2] * f;
      }
      colorAttr.needsUpdate = true;
    },
  };
}
