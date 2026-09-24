import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { Terrain } from '../sim/terrain';

const MEADOW = new Color('#6f9a45');
const FOREST = new Color('#3f6b30');
const ROCK = new Color('#8a7f72');
const DARK_ROCK = new Color('#5f5850');
const SNOW = new Color('#f4f7fb');
const SAND = new Color('#9aa565');
const WET = new Color('#3b3a2a');
/** Colour of the plain around the map; the terrain border fades into it. */
const PLAIN = new Color('#8a9e58');

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Renders the heightfield as a lit, vertex-coloured mesh (meadow, forest,
 * rock and snow chosen by height and slope). Cells that carry water are
 * darkened to look like wet soil.
 */
export class TerrainView {
  readonly mesh: Mesh;
  readonly plain: Mesh;
  private readonly geometry: BufferGeometry;
  private readonly baseColors: Float32Array;
  private readonly colors: Float32Array;
  private readonly wetness: Float32Array;
  private readonly size: number;

  constructor(terrain: Terrain) {
    const n = terrain.size;
    this.size = n;
    const extent = n - 1;
    const geometry = new PlaneGeometry(extent, extent, n - 1, n - 1);
    geometry.rotateX(-Math.PI / 2);
    // PlaneGeometry rows run from -z to +z after rotation, matching grid y.
    const pos = geometry.getAttribute('position') as BufferAttribute;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = y * n + x;
        pos.setXYZ(v, x - extent / 2, terrain.heights[v], y - extent / 2);
      }
    }
    geometry.computeVertexNormals();
    this.geometry = geometry;

    const normals = geometry.getAttribute('normal') as BufferAttribute;
    this.baseColors = new Float32Array(n * n * 3);
    const c = new Color();
    const tmp = new Color();
    for (let v = 0; v < n * n; v++) {
      const h = terrain.heights[v] / terrain.maxHeight;
      const slope = 1 - normals.getY(v); // 0 = flat, ~1 = vertical
      const jitter = hash2(v % n, Math.floor(v / n), terrain.seed) * 0.08 - 0.04;

      c.copy(SAND).lerp(MEADOW, smoothstep(0.0, 0.06, h));
      c.lerp(FOREST, smoothstep(0.12, 0.3, h + jitter) * (1 - smoothstep(0.5, 0.62, h)));
      c.lerp(tmp.copy(ROCK).lerp(DARK_ROCK, hash2(v, 7, terrain.seed)), smoothstep(0.45, 0.62, h + jitter));
      c.lerp(DARK_ROCK, smoothstep(0.18, 0.4, slope) * 0.85);
      const snow = smoothstep(0.68, 0.8, h + jitter * 1.5) * (1 - smoothstep(0.25, 0.45, slope));
      c.lerp(SNOW, snow);
      c.offsetHSL(0, 0, jitter * 0.5);
      const gx = v % n;
      const gy = Math.floor(v / n);
      const edge = Math.min(gx, gy, n - 1 - gx, n - 1 - gy) / n;
      c.lerp(PLAIN, 1 - smoothstep(0.0, 0.07, edge));

      this.baseColors[v * 3] = c.r;
      this.baseColors[v * 3 + 1] = c.g;
      this.baseColors[v * 3 + 2] = c.b;
    }
    this.colors = this.baseColors.slice();
    this.wetness = new Float32Array(n * n);
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));

    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;

    this.plain = this.createPlain(terrain);
  }

  /**
   * Darkens terrain colours where water is or recently was present. Wetness
   * rises quickly and dries slowly for a natural "wet soil" trail.
   */
  updateWetness(depth: Float64Array, dtSeconds: number): void {
    const n2 = this.size * this.size;
    const w = this.wetness;
    const dry = Math.min(1, dtSeconds * 0.08);
    for (let v = 0; v < n2; v++) {
      const target = Math.min(1, depth[v] * 25);
      w[v] = target > w[v] ? target : w[v] + (target - w[v]) * dry;
      const k = w[v] * 0.55;
      const i = v * 3;
      this.colors[i] = this.baseColors[i] + (WET.r - this.baseColors[i]) * k;
      this.colors[i + 1] = this.baseColors[i + 1] + (WET.g - this.baseColors[i + 1]) * k;
      this.colors[i + 2] = this.baseColors[i + 2] + (WET.b - this.baseColors[i + 2]) * k;
    }
    const attr = this.geometry.getAttribute('color') as BufferAttribute;
    attr.needsUpdate = true;
  }

  /**
   * A wide plain around the map, flush with the (zero-height) terrain border,
   * so the landscape continues until it dissolves into the fog.
   */
  private createPlain(terrain: Terrain): Mesh {
    const n = terrain.size;
    const positions: number[] = [];
    // Surrounding plain, slightly below the lowest terrain, reaching the fog.
    const far = n * 16;
    const g = -0.08;
    positions.push(-far, g, -far, -far, g, far, far, g, far, -far, g, -far, far, g, far, far, g, -far);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({
      color: PLAIN,
      roughness: 1,
    });
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}
