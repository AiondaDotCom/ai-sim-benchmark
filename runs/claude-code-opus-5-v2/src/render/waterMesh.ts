/**
 * Water surface mesh.
 *
 * Shares the simulation grid topology exactly (one vertex per cell), so every
 * frame the vertex Y is simply `terrain + depth`. Dry cells collapse onto the
 * ground and are faded out in the shader, which is what makes thin streams and
 * lake shorelines appear without any mesh rebuilding.
 *
 * Per-vertex the mesh carries:
 *   - position.y  water surface elevation
 *   - normal      surface normal from central differences of that elevation
 *   - aDepth      water column depth  -> colour ramp + opacity
 *   - aFlow       depth-averaged velocity -> ripple advection + foam
 */

import * as THREE from 'three';
import { Terrain } from '../sim/terrain';
import { WaterSimulation } from '../sim/waterSim';
import { buildGridIndex } from './terrainMesh';

const WATER_VERTEX = /* glsl */ `
attribute float aDepth;
attribute vec2 aFlow;

varying float vDepth;
varying vec2 vFlow;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_vertex>

void main() {
  vDepth = aDepth;
  vFlow = aFlow;

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const WATER_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
uniform vec3 uSkyColor;
uniform float uTime;
uniform float uMaxAlpha;
uniform float uDryThreshold;
uniform float uDeepScale;

varying float vDepth;
varying vec2 vFlow;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

void main() {
  float speed = length(vFlow);

  // How "present" the water is at this vertex. Everything else is gated on it
  // so that dry ground never picks up highlights or foam.
  float wet = smoothstep(uDryThreshold * 0.4, uDryThreshold * 4.0, vDepth);
  if (wet <= 0.002) discard;

  // --- ripples -------------------------------------------------------------
  // Wave phase is advected against the flow direction, so moving water reads
  // as travelling downstream while lakes only shimmer in place.
  vec2 p = vWorldPos.xz - vFlow * uTime * 0.55;
  float t = uTime;
  float a1 = p.x * 1.73 + p.y * 1.11 - t * 2.10;
  float a2 = p.x * -1.19 + p.y * 2.31 + t * 1.63;
  float a3 = (p.x + p.y) * 3.37 - t * 3.10;

  float rippleAmp = 0.035 + min(speed, 3.0) * 0.055;
  vec2 slope;
  slope.x = 1.73 * cos(a1) - 1.19 * cos(a2) + 3.37 * cos(a3) * 0.5;
  slope.y = 1.11 * cos(a1) + 2.31 * cos(a2) + 3.37 * cos(a3) * 0.5;

  vec3 n = normalize(vNormalW + vec3(slope.x, 0.0, slope.y) * rippleAmp * 0.12);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  if (dot(n, viewDir) < 0.0) n = -n;

  // --- colour --------------------------------------------------------------
  float depthMix = 1.0 - exp(-vDepth * uDeepScale);
  vec3 base = mix(uShallowColor, uDeepColor, depthMix);

  float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 4.0);
  vec3 color = mix(base, uSkyColor, fres * 0.72);

  vec3 sunDir = normalize(uSunDirection);
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(n, halfVec), 0.0), 260.0);
  color += vec3(1.0, 0.97, 0.90) * spec * 1.5 * wet;

  float diff = max(dot(n, sunDir), 0.0);
  color *= 0.72 + 0.38 * diff;

  // --- foam ----------------------------------------------------------------
  // White water only where the flow is genuinely fast AND the layer is thin,
  // i.e. in rapids and over cascades — not along every shoreline.
  float turbulence = smoothstep(2.0, 5.2, speed);
  float shallow = 1.0 - smoothstep(0.06, 0.26, vDepth);
  float foam = clamp(turbulence * shallow, 0.0, 0.5) * wet;
  color = mix(color, uFoamColor, foam);

  // --- opacity -------------------------------------------------------------
  // Beer-Lambert-ish: a thin film is nearly invisible, a lake is opaque. This
  // is what separates a stream from the wet sheen on the slope around it.
  float body = 1.0 - exp(-vDepth * 10.0);
  float alpha = wet * body * uMaxAlpha;
  alpha = mix(alpha, min(1.0, alpha + 0.22), fres * wet);
  alpha = max(alpha, foam * 0.8);
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha < 0.02) discard;

  gl_FragColor = vec4(color, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface WaterMeshOptions {
  sunDirection: THREE.Vector3;
  skyColor: THREE.Color;
  /** Depth below which a cell counts as dry. */
  dryThreshold?: number;
  /** Peak opacity of deep water. */
  maxAlpha?: number;
}

export class WaterMesh {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly depths: Float32Array;
  private readonly flows: Float32Array;
  private readonly size: number;
  private readonly cellSize: number;
  private readonly surface: Float32Array;

  constructor(terrain: Terrain, options: WaterMeshOptions) {
    const n = terrain.size;
    this.size = n;
    this.cellSize = terrain.cellSize;
    const cell = terrain.cellSize;
    const half = terrain.worldSize / 2;
    const count = n * n;

    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    this.depths = new Float32Array(count);
    this.flows = new Float32Array(count * 2);
    this.surface = new Float32Array(count);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        this.positions[i * 3] = (c + 0.5) * cell - half;
        this.positions[i * 3 + 1] = terrain.heights[i];
        this.positions[i * 3 + 2] = (r + 0.5) * cell - half;
        this.normals[i * 3 + 1] = 1;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('aDepth', new THREE.BufferAttribute(this.depths, 1));
    this.geometry.setAttribute('aFlow', new THREE.BufferAttribute(this.flows, 2));
    this.geometry.setIndex(buildGridIndex(n));
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, (terrain.minHeight + terrain.maxHeight) * 0.5, 0),
      terrain.worldSize,
    );

    this.material = new THREE.ShaderMaterial({
      // `fog: true` makes three inject the fog #defines, but for a custom
      // ShaderMaterial we must supply the matching uniforms ourselves.
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uSunDirection: { value: options.sunDirection.clone() },
        uShallowColor: { value: new THREE.Color('#7fd3e0') },
        uDeepColor: { value: new THREE.Color('#0b3a70') },
        uFoamColor: { value: new THREE.Color('#f2fbff') },
        uSkyColor: { value: options.skyColor.clone() },
        uTime: { value: 0 },
        uMaxAlpha: { value: options.maxAlpha ?? 0.9 },
        uDryThreshold: { value: options.dryThreshold ?? 0.02 },
        uDeepScale: { value: 1.9 },
      },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'water';
  }

  /** Pull the current simulation state into the GPU buffers. */
  update(sim: WaterSimulation, elapsed: number): void {
    const n = this.size;
    const inv2c = 1 / (2 * this.cellSize);
    const depth = sim.depth;
    const terrain = sim.terrain;
    const surface = this.surface;

    for (let i = 0; i < surface.length; i++) surface[i] = terrain[i] + depth[i];

    const pos = this.positions;
    const nor = this.normals;
    const dep = this.depths;
    const flo = this.flows;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const d = depth[i];
        pos[i * 3 + 1] = surface[i];
        dep[i] = d;
        flo[i * 2] = sim.velocityX[i];
        flo[i * 2 + 1] = sim.velocityY[i];

        // Central differences of the free surface -> surface normal.
        const left = c > 0 ? surface[i - 1] : surface[i];
        const right = c < n - 1 ? surface[i + 1] : surface[i];
        const up = r > 0 ? surface[i - n] : surface[i];
        const down = r < n - 1 ? surface[i + n] : surface[i];

        const nx = (left - right) * inv2c;
        const nz = (up - down) * inv2c;
        const len = Math.sqrt(nx * nx + 1 + nz * nz);
        nor[i * 3] = nx / len;
        nor[i * 3 + 1] = 1 / len;
        nor[i * 3 + 2] = nz / len;
      }
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('normal').needsUpdate = true;
    this.geometry.getAttribute('aDepth').needsUpdate = true;
    this.geometry.getAttribute('aFlow').needsUpdate = true;
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
