import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { SKY_GROUND, SKY_HORIZON, SKY_ZENITH, SUN_COLOR } from './palette';

/**
 * A large inverted sphere with a vertical gradient (zenith -> horizon) and a
 * soft sun glow. It ignores fog, does not write depth and is re-centred on the
 * camera every frame, so it always sits behind the scene.
 */
export function createSky(radius: number, sunDirection: Vector3): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    // Not tone mapped: fog is applied after tone mapping in Three's materials,
    // so an untone-mapped sky matches the fog colour exactly at the horizon.
    toneMapped: false,
    uniforms: {
      uZenith: { value: SKY_ZENITH.clone() },
      uHorizon: { value: SKY_HORIZON.clone() },
      uGround: { value: SKY_GROUND.clone() },
      uSunColor: { value: SUN_COLOR.clone() },
      uSunDir: { value: sunDirection.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0
          ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.85, h), 0.7))
          : mix(uHorizon, uGround, smoothstep(0.0, -0.3, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 600.0) * 0.9 + pow(s, 12.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
