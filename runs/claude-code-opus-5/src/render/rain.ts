/**
 * Purely visual rain: short falling streaks rendered as GPU points.
 *
 * It carries no simulation state — the actual rainfall is applied by
 * `WaterSimulation`. This only tells the viewer *why* water is appearing, and
 * its opacity tracks the current rain intensity so bursts read on camera.
 */

import * as THREE from 'three';
import { createRng } from '../sim/rng';

const RAIN_VERTEX = /* glsl */ `
attribute float aSpeed;
attribute float aOffset;
uniform float uTime;
uniform float uTop;
uniform float uBottom;
uniform float uPointSize;
varying float vFade;

void main() {
  vec3 p = position;
  float span = uTop - uBottom;
  // Wrap each drop into [uBottom, uTop] independently of frame timing.
  float fall = mod(aOffset + uTime * aSpeed, span);
  p.y = uTop - fall;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uPointSize * (300.0 / max(-mvPosition.z, 1.0));
  // Fade drops in at the top and out near the ground.
  vFade = smoothstep(0.0, 0.12, fall / span) * (1.0 - smoothstep(0.86, 1.0, fall / span));
}
`;

const RAIN_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  // Squash horizontally to make a streak rather than a dot.
  float d = length(vec2(uv.x * 7.0, uv.y));
  float a = (1.0 - smoothstep(0.18, 0.5, d)) * vFade * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export class RainField {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(seed: string | number, worldSize: number, top: number, bottom: number, count = 3200) {
    const rng = createRng(`${seed}::rain`);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const offsets = new Float32Array(count);
    const span = top - bottom;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() - 0.5) * worldSize * 1.15;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (rng() - 0.5) * worldSize * 1.15;
      speeds[i] = 34 + rng() * 26;
      offsets[i] = rng() * span;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, (top + bottom) * 0.5, 0),
      worldSize * 1.5,
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: top },
        uBottom: { value: bottom },
        uColor: { value: new THREE.Color('#cfeaff') },
        uOpacity: { value: 0.0 },
        uPointSize: { value: 2.0 },
      },
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'rain';
  }

  /** @param intensity 0..1, normally the rain rate divided by its maximum. */
  update(elapsed: number, intensity: number): void {
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uOpacity.value = Math.max(0, Math.min(1, intensity)) * 0.26;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
