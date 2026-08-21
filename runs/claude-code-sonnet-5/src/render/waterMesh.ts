import * as THREE from 'three';
import type { TerrainData } from '../sim/terrain';
import type { WaterSimulation } from '../sim/water';

/** Depth (world units) below which a cell is treated as visually dry (alpha 0). */
const MIN_VISIBLE_DEPTH = 0.015;
/** Depth at which water is considered "deep" and renders fully opaque/dark. */
const DEEP_DEPTH = 0.9;

export interface WaterMeshHandle {
  mesh: THREE.Mesh;
  /** Reads the current simulation depth grid and pushes it into the GPU geometry. */
  update(water: WaterSimulation, terrain: TerrainData, elapsedTime: number, cameraPosition: THREE.Vector3): void;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aDepth;
  varying float vDepth;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  uniform float uTime;

  void main() {
    vDepth = aDepth;
    // Small animated ripple, amplitude grows slightly with depth so lakes shimmer more than thin sheets.
    vec3 displaced = position;
    float ripple = sin(position.x * 0.35 + uTime * 1.6) * cos(position.z * 0.35 + uTime * 1.3);
    displaced.y += ripple * 0.05 * clamp(aDepth * 3.0, 0.0, 1.0);

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vDepth;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  uniform float uMinVisible;
  uniform float uDeepDepth;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uLightDir;
  uniform vec3 uCameraPosition;

  void main() {
    if (vDepth <= uMinVisible) {
      discard;
    }
    float t = clamp((vDepth - uMinVisible) / (uDeepDepth - uMinVisible), 0.0, 1.0);
    // Even a barely-visible trickle gets a solid minimum opacity - from an aerial framing
    // distance a faint near-transparent stream reads as "no water at all", so any cell
    // that clears the visibility threshold must still pop clearly against the terrain.
    float alpha = mix(0.6, 0.96, smoothstep(0.0, 1.0, t));

    vec3 normal = normalize(vNormal);
    float diffuse = max(dot(normal, uLightDir), 0.0);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

    vec3 base = mix(uShallowColor, uDeepColor, t);
    vec3 lit = base * (0.7 + 0.4 * diffuse) + fresnel * 0.5;

    gl_FragColor = vec4(lit, clamp(alpha, 0.0, 0.98));
  }
`;

/** Builds the dynamic water-surface mesh sharing the terrain's grid topology. */
export function buildWaterMesh(terrain: TerrainData): WaterMeshHandle {
  const { resolution } = terrain;
  const geometry = new THREE.PlaneGeometry(terrain.worldSize, terrain.worldSize, resolution - 1, resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(resolution * resolution), 1));

  const lightDir = new THREE.Vector3(120, 180, 80).normalize();

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uMinVisible: { value: MIN_VISIBLE_DEPTH },
      uDeepDepth: { value: DEEP_DEPTH },
      // More saturated than a "realistic" muddy mountain stream would be, deliberately -
      // from the full aerial framing distance a subtle color reads as invisible, and this
      // needs to pop clearly against terrain greens/browns/greys in a wide shot.
      uShallowColor: { value: new THREE.Color('#4be3f5') },
      uDeepColor: { value: new THREE.Color('#062a52') },
      uLightDir: { value: lightDir },
      uCameraPosition: { value: new THREE.Vector3() },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const depthAttr = geometry.attributes.aDepth as THREE.BufferAttribute;

  function update(
    water: WaterSimulation,
    terrainData: TerrainData,
    elapsedTime: number,
    cameraPosition: THREE.Vector3,
  ): void {
    const res = terrainData.resolution;
    for (let i = 0; i < res * res; i++) {
      const depth = water.depth[i];
      positions.setY(i, terrainData.heights[i] + Math.max(depth, 0));
      depthAttr.setX(i, depth);
    }
    positions.needsUpdate = true;
    depthAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    material.uniforms.uTime.value = elapsedTime;
    (material.uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  }

  return { mesh, update };
}
