import {
  BufferAttribute,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import type { WaterSimulation } from '../sim/water';
import { SKY_HORIZON, SKY_ZENITH, SUN_COLOR } from './palette';

/** Water thinner than this is not drawn (the terrain just looks wet). */
const MIN_VISIBLE_DEPTH = 0.025;
/** How strongly discharge (depth * speed) contributes to visual depth. */
const DISCHARGE_VISIBILITY = 0.8;
/** Slight lift that keeps thin streams from z-fighting with the terrain. */
const SURFACE_LIFT = 0.06;

/**
 * Renders the water depth field as a transparent surface that sits on top of
 * the terrain. Colour depends on depth (turquoise shallows, deep blue lakes),
 * fast flow turns white (foam), and the surface reflects the sky with a
 * Fresnel term plus a sun highlight. Small animated ripples are added in the
 * fragment shader.
 */
export class WaterView {
  readonly mesh: Mesh;
  private readonly positions: BufferAttribute;
  private readonly normals: BufferAttribute;
  private readonly depthAttr: BufferAttribute;
  private readonly speedAttr: BufferAttribute;
  private readonly material: ShaderMaterial;
  private readonly size: number;
  private readonly surface: Float32Array;

  constructor(size: number, terrainHeights: Float32Array, sunDirection: Vector3) {
    this.size = size;
    const extent = size - 1;
    const geometry = new PlaneGeometry(extent, extent, size - 1, size - 1);
    geometry.rotateX(-Math.PI / 2);
    this.positions = geometry.getAttribute('position') as BufferAttribute;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = y * size + x;
        this.positions.setXYZ(v, x - extent / 2, terrainHeights[v] - 1, y - extent / 2);
      }
    }
    this.normals = geometry.getAttribute('normal') as BufferAttribute;
    this.depthAttr = new Float32BufferAttribute(new Float32Array(size * size), 1);
    this.speedAttr = new Float32BufferAttribute(new Float32Array(size * size), 1);
    geometry.setAttribute('aDepth', this.depthAttr);
    geometry.setAttribute('aSpeed', this.speedAttr);
    this.surface = new Float32Array(size * size);

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSunDir: { value: sunDirection.clone().normalize() },
          uSunColor: { value: SUN_COLOR.clone() },
          uSky: { value: SKY_ZENITH.clone() },
          uHorizon: { value: SKY_HORIZON.clone() },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aDepth;
        attribute float aSpeed;
        varying float vDepth;
        varying float vSpeed;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vDepth = aDepth;
          vSpeed = aSpeed;
          vec4 mvPosition = viewMatrix * worldPos;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSky;
        uniform vec3 uHorizon;
        varying float vDepth;
        varying float vSpeed;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        #include <common>
        #include <fog_pars_fragment>

        vec2 ripple(vec2 p, float t) {
          vec2 g = vec2(0.0);
          g += vec2(cos(p.x * 0.9 + t * 1.7), cos(p.y * 1.1 - t * 1.3)) * 0.5;
          g += vec2(cos(p.x * 2.3 - p.y * 1.7 + t * 2.9), cos(p.y * 2.1 + p.x * 1.3 - t * 2.3)) * 0.25;
          g += vec2(cos(p.x * 5.1 + p.y * 3.7 - t * 4.1), cos(p.y * 4.7 - p.x * 3.1 + t * 3.7)) * 0.12;
          return g;
        }

        void main() {
          if (vDepth < ${MIN_VISIBLE_DEPTH.toFixed(4)} * 0.5) discard;
          vec3 N = normalize(vNormalW);
          vec2 r = ripple(vWorldPos.xz, uTime) * (0.05 + 0.05 * clamp(vSpeed * 0.3, 0.0, 1.0));
          N = normalize(N + vec3(r.x, 0.0, r.y));

          vec3 V = normalize(cameraPosition - vWorldPos);
          float ndv = max(dot(N, V), 0.0);
          float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

          float depthT = 1.0 - exp(-vDepth * 0.55);
          vec3 shallow = vec3(0.12, 0.52, 0.62);
          vec3 deep = vec3(0.02, 0.16, 0.34);
          vec3 body = mix(shallow, deep, depthT);
          // Diffuse sky light on the water body.
          body *= 0.75 + 0.35 * max(dot(N, normalize(uSunDir)), 0.0);

          vec3 R = reflect(-V, N);
          vec3 skyRefl = mix(uHorizon, uSky, clamp(R.y, 0.0, 1.0));
          vec3 col = mix(body, skyRefl, clamp(fresnel * 0.6, 0.0, 1.0));

          vec3 H = normalize(normalize(uSunDir) + V);
          float spec = pow(max(dot(N, H), 0.0), 180.0);
          col += uSunColor * spec * 1.6;

          // White water where flow is fast and shallow-ish (rapids).
          vec2 fp = vWorldPos.xz * 0.35;
          float churn = 0.6 + 0.4 * sin(fp.x * 2.3 + sin(fp.y * 1.7 + uTime * 1.3) * 1.5 - uTime * 2.0)
                              * sin(fp.y * 2.1 + sin(fp.x * 1.9 - uTime * 1.1) * 1.5 + uTime * 1.7);
          float foam = smoothstep(5.0, 12.0, vSpeed) * churn;
          col = mix(col, vec3(0.9, 0.95, 0.98), clamp(foam, 0.0, 1.0) * 0.35);

          float edge = smoothstep(${MIN_VISIBLE_DEPTH.toFixed(4)}, ${MIN_VISIBLE_DEPTH.toFixed(4)} * 6.0, vDepth);
          float alpha = edge * mix(0.62, 0.93, depthT);
          alpha = max(alpha, edge * foam * 0.8);
          alpha = clamp(alpha + fresnel * 0.2 * edge, 0.0, 1.0);

          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  /** Copies the simulation state into the GPU buffers. */
  update(sim: WaterSimulation, time: number): void {
    const n = this.size;
    const b = sim.terrain;
    const d = sim.depth;
    const vx = sim.velocityX;
    const vy = sim.velocityY;
    const pos = this.positions.array as Float32Array;
    const nor = this.normals.array as Float32Array;
    const depthArr = this.depthAttr.array as Float32Array;
    const speedArr = this.speedAttr.array as Float32Array;
    const surf = this.surface;

    for (let i = 0; i < n * n; i++) surf[i] = b[i] + d[i];

    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const speed = Math.hypot(vx[i], vy[i]);
        // Visual depth: fast, very thin sheet flow on steep slopes still reads
        // as a stream, so discharge (depth * speed) also counts.
        const di = Math.max(d[i], Math.min(d[i] * speed * DISCHARGE_VISIBILITY, 0.3));
        depthArr[i] = di;
        speedArr[i] = speed;
        // Dry vertices sink below the terrain so the wet/dry edge tapers off.
        pos[i * 3 + 1] = di > MIN_VISIBLE_DEPTH ? surf[i] + SURFACE_LIFT : b[i] - 0.4;

        const xl = x > 0 ? i - 1 : i;
        const xr = x < n - 1 ? i + 1 : i;
        const yd = y > 0 ? i - n : i;
        const yu = y < n - 1 ? i + n : i;
        const gx = (surf[xr] - surf[xl]) / (xr - xl || 1);
        const gz = (surf[yu] - surf[yd]) / ((yu - yd) / n || 1);
        const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        nor[i * 3] = -gx * inv;
        nor[i * 3 + 1] = inv;
        nor[i * 3 + 2] = -gz * inv;
      }
    }
    this.positions.needsUpdate = true;
    this.normals.needsUpdate = true;
    this.depthAttr.needsUpdate = true;
    this.speedAttr.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }
}
