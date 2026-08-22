import * as THREE from "three";

export const SKY_TOP = new THREE.Color("#4a90d9");
export const SKY_HORIZON = new THREE.Color("#87CEEB");

/**
 * Gradient sky dome + matching fog so the horizon blends seamlessly.
 */
export function createSky(scene: THREE.Scene): { mesh: THREE.Mesh } {
  const geometry = new THREE.SphereGeometry(900, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: SKY_TOP.clone() },
      uHorizon: { value: SKY_HORIZON.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
        gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.55)), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Fog matched to the horizon colour.
  scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), 180, 850);
  return { mesh };
}
