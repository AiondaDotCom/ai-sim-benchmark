import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * A final "game look" grade applied to the finished (sRGB, tone-mapped) image:
 * a punchy contrast/saturation lift, an animated film grain, and a soft
 * vignette that pulls the eye to the center. All procedural — no assets.
 */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.04 },
    uContrast: { value: 1.12 },
    uSaturation: { value: 1.16 },
    uResolution: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uContrast;
    uniform float uSaturation;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;

      // Color grade: a contrast lift and a saturation boost so the scene pops.
      c = (c - 0.5) * uContrast + 0.5;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(lum), c, uSaturation);
      c = clamp(c, 0.0, 1.0);

      // Vignette: darken the corners to focus the frame.
      vec2 p = vUv - 0.5;
      float vig = smoothstep(0.92, 0.32, length(p) * 1.35);
      c *= mix(1.0, vig, uVignette);

      // Animated film grain (screen-resolution, time-offset). Real film grain
      // lives almost entirely in the shadows, so we weight it by luminance:
      // strong where the scene is dark, faint in bright areas. Without this the
      // uniform noise reads as digital dirt over flat, bright regions like the
      // sky instead of as a subtle filmic texture.
      float g = rand(vUv * uResolution + vec2(uTime * 61.7, uTime * 43.3)) - 0.5;
      float gWeight = mix(1.0, 0.22, smoothstep(0.2, 0.85, lum));
      c += g * uGrain * gWeight;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
    }
  `
} as const;

export function createGradePass(): ShaderPass {
  return new ShaderPass(GRADE_SHADER);
}
