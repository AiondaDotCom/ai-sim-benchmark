import * as THREE from 'three';
import { SKY_HORIZON, SKY_MID, SKY_ZENITH, SUN_DIRECTION } from './palette';

/** A large inverted sphere with a soft vertical gradient and a sun glow. */
export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uMid: { value: new THREE.Color(SKY_MID) },
      uZenith: { value: new THREE.Color(SKY_ZENITH) },
      uSun: { value: new THREE.Vector3(...SUN_DIRECTION) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon;
      uniform vec3 uMid;
      uniform vec3 uZenith;
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float t = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, t));
        col = mix(col, uZenith, smoothstep(0.18, 0.85, t));
        float s = max(dot(dir, uSun), 0.0);
        col += vec3(1.0, 0.95, 0.82) * (pow(s, 900.0) * 1.5 + pow(s, 24.0) * 0.16);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
