import * as THREE from 'three';
import { createGridGeometry } from './gridGeometry';
import type { WaterSim } from '../sim/water';

/** Water depth below which a cell renders as dry. */
const DRY_THRESHOLD = 0.015;

/**
 * Dynamic water surface mesh. Each frame, vertices are lifted to
 * terrain + depth where wet, and sunk below the terrain (alpha 0) where dry.
 * Colour and opacity are depth- and flow-dependent, so shallow fast streams
 * read as bright ribbons while deep lakes read as dark blue.
 */
export class WaterMesh {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly shallow = new THREE.Color(0x5fb8d4);
  private readonly deep = new THREE.Color(0x0b3a66);
  private readonly foam = new THREE.Color(0xcfeef5);
  private readonly tmp = new THREE.Color();

  constructor(private readonly sim: WaterSim) {
    this.geo = createGridGeometry(sim.width, sim.height, true);
    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      transparent: true,
      shininess: 160,
      specular: new THREE.Color(0x99bbee),
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.renderOrder = 1;
  }

  update(): void {
    const { sim, geo, tmp } = this;
    const { width: w, height: h, depth: d, terrain: H } = sim;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const depth = d[i];
        if (depth > DRY_THRESHOLD) {
          pos.setY(i, H[i] + depth + 0.03);
          const deepMix = Math.min(1, depth / 3.5);
          tmp.copy(this.shallow).lerp(this.deep, deepMix);
          const flow = sim.flowSpeedAt(x, y);
          const foamMix = Math.min(0.55, flow * 0.12) * (1 - deepMix);
          tmp.lerp(this.foam, foamMix);
          const alpha = Math.min(0.9, 0.35 + depth * 0.55 + foamMix * 0.3);
          col.setXYZW(i, tmp.r, tmp.g, tmp.b, alpha);
        } else {
          // Dry: hide the vertex below the terrain surface.
          pos.setY(i, H[i] - 0.5);
          col.setXYZW(i, 0, 0, 0, 0);
        }
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
  }
}
