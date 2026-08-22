import * as THREE from 'three';

/**
 * Gradient sky dome + fog. The fog color matches the horizon color so the
 * terrain silhouette blends naturally into the sky.
 */

export const SKY_TOP = new THREE.Color(0x3d7ec2);
export const SKY_HORIZON = new THREE.Color(0xafd4ea);

export function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(900, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: SKY_TOP.clone() },
      horizonColor: { value: SKY_HORIZON.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDir;
      void main() {
        float t = smoothstep(-0.05, 0.45, vDir.y);
        vec3 col = mix(horizonColor, topColor, t);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'sky';
  sky.renderOrder = -1;
  return sky;
}

export function setupLighting(scene: THREE.Scene): void {
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.position.set(140, 180, 80);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x51683f, 0.9);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);
}
