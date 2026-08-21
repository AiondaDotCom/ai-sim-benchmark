import * as THREE from 'three';

/** Sky-blue palette used consistently for fog, clear-color and the gradient sky dome. */
export const SKY_TOP_COLOR = new THREE.Color('#4FA8E0');
export const SKY_HORIZON_COLOR = new THREE.Color('#BEE6F5');
export const FOG_COLOR = new THREE.Color('#9FD3EE');

/**
 * Builds a large inverted sphere with a vertical gradient shader so the sky
 * reads as a soft, attractive blue gradient rather than a flat colour or -
 * critically for a recording demo - never black.
 */
export function createSkyDome(radius = 900): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: SKY_TOP_COLOR },
      horizonColor: { value: SKY_HORIZON_COLOR },
      offset: { value: 15 },
      exponent: { value: 0.6 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = clamp(pow(max(h, 0.0), exponent), 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-dome';
  return mesh;
}
