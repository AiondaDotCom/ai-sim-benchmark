import * as THREE from "three";
import type { Terrain } from "../terrain/terrain";
import type { WaterSimulation } from "../water/simulation";

/**
 * Animated water surface. One vertex per terrain grid cell; the vertex Y is
 * terrain height + water depth (dry vertices are hidden slightly below the
 * terrain surface). A custom shader adds ripples, depth-based colouring and
 * a fresnel/sun highlight.
 */
export class WaterMesh {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly baseY: Float32Array;
  private readonly time = { value: 0 };

  constructor(terrain: Terrain) {
    const n = terrain.gridN;
    this.geometry = new THREE.PlaneGeometry(terrain.size, terrain.size, n - 1, n - 1);
    this.geometry.rotateX(-Math.PI / 2);

    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    this.baseY = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) {
      this.baseY[k] = terrain.heights[k];
      pos.setY(k, terrain.heights[k] - 0.05); // dry: tucked under terrain
    }

    // Per-vertex depth attribute for depth-based shading.
    const depths = new Float32Array(n * n);
    this.geometry.setAttribute("aDepth", new THREE.BufferAttribute(depths, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: this.time,
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.35).normalize() },
        uShallow: { value: new THREE.Color("#4fb3d9") },
        uDeep: { value: new THREE.Color("#12557e") },
        uSky: { value: new THREE.Color("#87CEEB") },
      },
      vertexShader: /* glsl */ `
        attribute float aDepth;
        uniform float uTime;
        varying float vDepth;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          vDepth = aDepth;
          vec3 p = position;
          if (aDepth > 0.001) {
            float w = sin(p.x * 0.9 + uTime * 2.0) * cos(p.z * 0.8 - uTime * 1.6)
                    + 0.5 * sin(p.x * 2.3 - uTime * 3.1 + p.z * 1.7);
            p.y += 0.045 * min(aDepth * 8.0, 1.5) * w;
          }
          vNormal = normalMatrix * normal;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uSky;
        uniform vec3 uSunDir;
        varying float vDepth;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
          float t = clamp(vDepth * 12.0, 0.0, 1.0);
          vec3 base = mix(uShallow, uDeep, t);

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.0);
          vec3 color = mix(base, uSky, fresnel * 0.55);

          // Sun sparkle.
          vec3 halfV = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(normalize(vNormal), halfV), 0.0), 90.0);
          color += vec3(1.0) * spec * 0.9;

          float alpha = mix(0.55, 0.92, t) + fresnel * 0.25;
          gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.97));
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 1;
  }

  /** Push current simulation depths into the geometry.
   *  The rendered surface is smoothed over a 3x3 neighbourhood and its
   *  height offset above terrain is capped, which avoids spike artefacts
   *  where a wet cell borders dry ones on steep slopes. */
  update(sim: WaterSimulation, elapsed: number): void {
    this.time.value = elapsed;
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const depthAttr = this.geometry.attributes.aDepth as THREE.BufferAttribute;

    const n = sim.gridN;
    const d = sim.depth;

    // Max rendered offset above terrain (world units). Keeps ponded/lake
    // surfaces visually flat instead of growing unbounded with depth.
    const MAX_OFFSET = 0.6;
    const DEPTH_TO_OFFSET = 6; // offset = min(depth * k, MAX_OFFSET)

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= n) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= n) continue;
            sum += d[jj * n + ii];
            count++;
          }
        }
        const avg = sum / count;
        depthAttr.setX(k, avg);
        if (avg > 0.004) {
          pos.setY(k, this.baseY[k] + Math.min(avg * DEPTH_TO_OFFSET, MAX_OFFSET));
        } else {
          pos.setY(k, this.baseY[k] - 0.06);
        }
      }
    }
    pos.needsUpdate = true;
    depthAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
