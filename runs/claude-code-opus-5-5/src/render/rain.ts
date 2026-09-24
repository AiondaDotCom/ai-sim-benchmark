import { BufferGeometry, Float32BufferAttribute, LineSegments, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { mulberry32 } from '../sim/random';

/**
 * Falling rain streaks. Positions are static; the fall animation happens in
 * the vertex shader (y wraps around a fixed column height), so the CPU cost
 * per frame is a single uniform update.
 */
export class RainView {
  readonly mesh: LineSegments;
  private readonly material: ShaderMaterial;

  constructor(extent: number, seed: number, count = 7000) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const positions = new Float32Array(count * 6);
    const ends = new Float32Array(count * 2);
    const half = extent / 2;
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * extent * 1.1;
      const z = (rng() - 0.5) * extent * 1.1;
      const y = rng();
      positions.set([x, y, z, x, y, z], i * 6);
      ends[i * 2] = 0;
      ends[i * 2 + 1] = 1;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aEnd', new Float32BufferAttribute(ends, 1));

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uStrength: { value: 0 },
          uHeight: { value: half * 0.9 },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform float uTime;
        uniform float uHeight;
        varying float vEnd;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          float speed = 55.0 + fract(position.x * 12.9898) * 20.0;
          float y = fract(position.y - uTime * speed / uHeight) * uHeight;
          vec3 p = vec3(position.x + y * 0.08, y - aEnd * 2.2, position.z + y * 0.03);
          vEnd = aEnd;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying float vEnd;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(0.92, 0.96, 1.0, uStrength * (0.12 + 0.28 * vEnd));
          #include <fog_fragment>
        }
      `,
    });
    this.mesh = new LineSegments(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  update(time: number, strength: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uStrength.value = Math.min(1, Math.max(0, strength));
    this.mesh.visible = strength > 0.01;
  }
}
