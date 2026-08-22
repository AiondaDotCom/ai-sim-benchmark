import * as THREE from "three";
import type { Terrain } from "../terrain/terrain";

/**
 * Builds the renderable terrain mesh (positions + vertex colours) from
 * the deterministic height field.
 */
export function createTerrainMesh(terrain: Terrain): THREE.Mesh {
  const n = terrain.gridN;
  const geometry = new THREE.PlaneGeometry(terrain.size, terrain.size, n - 1, n - 1);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < n * n; k++) {
    pos.setY(k, terrain.heights[k]);
  }
  pos.needsUpdate = true;

  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal as THREE.BufferAttribute;

  const colors = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  const waterLine = -2.5;

  const deepWater = new THREE.Color("#3a5f43");
  const sand = new THREE.Color("#c2b280");
  const grass = new THREE.Color("#4f7942");
  const forest = new THREE.Color("#2f5233");
  const rock = new THREE.Color("#7d7469");
  const snow = new THREE.Color("#f4f6f8");

  const hMin = terrain.minHeight;
  const hMax = terrain.maxHeight;

  for (let k = 0; k < n * n; k++) {
    const h = terrain.heights[k];
    const slope = 1 - normals.getY(k);

    if (h < waterLine + 1.5) {
      c.copy(deepWater).lerp(sand, smooth((h - hMin) / (waterLine + 1.5 - hMin)));
    } else if (h < waterLine + 5) {
      c.copy(sand).lerp(grass, smooth((h - waterLine - 1.5) / 3.5));
    } else {
      const t = (h - waterLine - 5) / Math.max(hMax - waterLine - 5, 1);
      if (t < 0.45) c.copy(grass).lerp(forest, t / 0.45);
      else if (t < 0.75) c.copy(forest).lerp(rock, (t - 0.45) / 0.3);
      else c.copy(rock).lerp(snow, smooth((t - 0.75) / 0.25));
    }

    // Steep faces become rocky regardless of altitude.
    if (slope > 0.35 && h > waterLine) {
      c.lerp(rock, smooth((slope - 0.35) / 0.3) * 0.85);
    }

    colors[k * 3] = c.r;
    colors[k * 3 + 1] = c.g;
    colors[k * 3 + 2] = c.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
  });

  return new THREE.Mesh(geometry, material);
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
