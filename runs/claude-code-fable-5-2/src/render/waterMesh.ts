import * as THREE from 'three';
import type { Simulation } from '../sim/simulation';
import { SEA_FLOOR_DEPTH } from '../sim/terrain';
import { SKY_HORIZON, SKY_ZENITH, SUN_DIRECTION } from './palette';
import { createGridIndex } from './terrainMesh';

const vertexShader = /* glsl */ `
  attribute float aDepth;
  attribute vec2 aVel;
  varying float vDepth;
  varying vec2 vVel;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_vertex>
  void main() {
    vDepth = aDepth;
    vVel = aVel;
    vNormal = normal;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  varying float vDepth;
  varying vec2 vVel;
  varying vec3 vWorld;
  varying vec3 vNormal;
  #include <fog_pars_fragment>

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    if (vDepth < 0.012) discard;

    float speed = length(vVel);
    vec2 flow = vVel * uTime;
    vec2 p = vWorld.xz;

    // Ripples: drift with the wind on still water, get dragged along by currents.
    vec2 q1 = p * 0.55 - flow * 0.35 + vec2(uTime * 0.35, uTime * 0.22);
    vec2 q2 = p * 1.3 - flow * 0.6 - vec2(uTime * 0.28, -uTime * 0.4);
    float e = 0.35;
    float n0 = vnoise(q1) + 0.5 * vnoise(q2);
    float nx = vnoise(q1 + vec2(e, 0.0)) + 0.5 * vnoise(q2 + vec2(e, 0.0));
    float nz = vnoise(q1 + vec2(0.0, e)) + 0.5 * vnoise(q2 + vec2(0.0, e));
    // Fade the ripples with distance so the far sea does not shimmer (aliasing).
    float fade = clamp(240.0 / length(cameraPosition - vWorld), 0.12, 1.0);
    float rippleStrength = (0.16 + 0.25 * smoothstep(0.3, 3.0, speed)) * fade;
    vec3 n = normalize(vNormal + rippleStrength * vec3(n0 - nx, 0.0, n0 - nz));

    vec3 view = normalize(cameraPosition - vWorld);
    float ndv = max(dot(n, view), 0.0);
    float fresnel = 0.04 + 0.72 * pow(1.0 - ndv, 4.0);
    vec3 refl = reflect(-view, n);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.8, refl.y));
    float spec = pow(max(dot(refl, uSun), 0.0), 180.0) * 1.6;

    float depthT = 1.0 - exp(-vDepth * 0.9);
    vec3 body = mix(uShallow, uDeep, depthT);
    float diffuse = 0.62 + 0.38 * max(dot(n, uSun), 0.0);
    vec3 col = mix(body * diffuse, sky, fresnel) + vec3(1.0, 0.96, 0.86) * spec;

    // White water where the current is fast.
    float foamNoise = vnoise(p * 1.7 - flow * 0.8) * 0.65 + vnoise(p * 4.1 - flow * 1.3) * 0.35;
    float foam = smoothstep(1.3, 3.2, speed) * smoothstep(0.32, 0.7, foamNoise);
    col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.85);

    float alpha = smoothstep(0.012, 0.11, vDepth) * mix(0.62, 0.96, depthT);
    alpha = max(alpha, foam * 0.85 * smoothstep(0.012, 0.05, vDepth));

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(...SUN_DIRECTION) },
        uShallow: { value: new THREE.Color(0x36a9cc) },
        uDeep: { value: new THREE.Color(0x0f4f86) },
        uSkyHorizon: { value: new THREE.Color(SKY_HORIZON) },
        uSkyZenith: { value: new THREE.Color(SKY_ZENITH) },
      },
    ]),
  });
}

/**
 * Renders the simulated water surface (streams, lakes and the coastal sea
 * inside the grid) plus a static ring of open sea reaching to the horizon.
 */
export class WaterView {
  readonly object = new THREE.Group();
  private readonly sim: Simulation;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly depths: Float32Array;
  private readonly velocities: Float32Array;
  private readonly surface: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  constructor(sim: Simulation) {
    this.sim = sim;
    const { size, cellSize } = sim.terrain;
    const half = (size - 1) / 2;
    const count = size * size;
    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    this.depths = new Float32Array(count);
    this.velocities = new Float32Array(count * 2);
    this.surface = new Float32Array(count);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        this.positions[i * 3] = (x - half) * cellSize;
        this.positions[i * 3 + 2] = (y - half) * cellSize;
        this.normals[i * 3 + 1] = 1;
      }
    }

    const dynamic = (array: Float32Array, itemSize: number) => {
      const attribute = new THREE.BufferAttribute(array, itemSize);
      attribute.setUsage(THREE.DynamicDrawUsage);
      return attribute;
    };
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', dynamic(this.positions, 3));
    this.geometry.setAttribute('normal', dynamic(this.normals, 3));
    this.geometry.setAttribute('aDepth', dynamic(this.depths, 1));
    this.geometry.setAttribute('aVel', dynamic(this.velocities, 2));
    this.geometry.setIndex(createGridIndex(size));

    this.material = createWaterMaterial();
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.object.add(mesh);

    const sea = new THREE.Mesh(createOuterSeaGeometry(half * cellSize, 6000, sim.terrain.seaLevel), this.material);
    sea.frustumCulled = false;
    sea.renderOrder = 1;
    this.object.add(sea);

    this.update(0);
  }

  /** Copies the current simulation state into the GPU buffers. */
  update(seconds: number): void {
    const { terrain, water } = this.sim;
    const { size, cellSize, heights, seaLevel } = terrain;
    const depth = water.depth;
    const surface = this.surface;
    const pos = this.positions;
    const WET = 0.004;
    const DRY = -1e9;

    water.updateVelocities();

    // Pass 1: surface height of every wet cell.
    for (let i = 0; i < surface.length; i++) {
      const b = heights[i];
      if (b <= seaLevel) {
        surface[i] = seaLevel;
        this.depths[i] = seaLevel - b + depth[i];
      } else if (depth[i] > WET) {
        surface[i] = b + depth[i];
        this.depths[i] = depth[i];
      } else {
        surface[i] = DRY;
        this.depths[i] = 0;
      }
      this.velocities[i * 2] = water.velX[i];
      this.velocities[i * 2 + 1] = water.velY[i];
    }

    // Pass 2: vertex heights. Dry vertices next to water continue the water
    // surface underneath the terrain, which gives lakes a clean, level shoreline.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        let h = surface[i];
        if (h === DRY) {
          let sum = 0;
          let n = 0;
          if (x > 0 && surface[i - 1] !== DRY) { sum += surface[i - 1]; n++; }
          if (x < size - 1 && surface[i + 1] !== DRY) { sum += surface[i + 1]; n++; }
          if (y > 0 && surface[i - size] !== DRY) { sum += surface[i - size]; n++; }
          if (y < size - 1 && surface[i + size] !== DRY) { sum += surface[i + size]; n++; }
          const below = heights[i] - 0.06;
          h = n > 0 ? Math.min(below, sum / n) : below;
        }
        pos[i * 3 + 1] = h;
      }
    }

    // Pass 3: normals from the displayed surface (softened; ripples come from the shader).
    const nrm = this.normals;
    const k = 0.5 / (2 * cellSize);
    for (let y = 0; y < size; y++) {
      const ym = y > 0 ? -size : 0;
      const yp = y < size - 1 ? size : 0;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (this.depths[i] === 0) continue;
        const dx = (pos[(i + (x < size - 1 ? 1 : 0)) * 3 + 1] - pos[(i - (x > 0 ? 1 : 0)) * 3 + 1]) * k;
        const dz = (pos[(i + yp) * 3 + 1] - pos[(i + ym) * 3 + 1]) * k;
        const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
        nrm[i * 3] = -dx * inv;
        nrm[i * 3 + 1] = inv;
        nrm[i * 3 + 2] = -dz * inv;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.aDepth.needsUpdate = true;
    this.geometry.attributes.aVel.needsUpdate = true;
    this.material.uniforms.uTime.value = seconds;
  }
}

/** Eight quads surrounding the simulated square, at sea level. */
function createOuterSeaGeometry(inner: number, outer: number, level: number): THREE.BufferGeometry {
  const xs = [-outer, -inner, inner, outer];
  const positions: number[] = [];
  const normals: number[] = [];
  const depths: number[] = [];
  const velocities: number[] = [];
  const index: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      positions.push(xs[i], level, xs[j]);
      normals.push(0, 1, 0);
      depths.push(SEA_FLOOR_DEPTH);
      velocities.push(0, 0);
    }
  }
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue;
      const a = j * 4 + i;
      index.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute('aVel', new THREE.Float32BufferAttribute(velocities, 2));
  geometry.setIndex(index);
  return geometry;
}
