/** The signature look: a cool institutional daylight image pushed into a
 *  desaturated green grade, with bloom on the muzzle flashes and a soft vignette. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTint: { value: new THREE.Color(0.90, 1.0, 0.905) },
    uStrength: { value: 1.0 },
    uTime: { value: 0 },
    uVignette: { value: 0.52 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;
    uniform float uStrength;
    uniform float uTime;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // desaturate, then push the whole image green — the scene's signature grade
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, vec3(l), 0.20 * uStrength);
      c *= mix(vec3(1.0), uTint, uStrength);
      // lift the shadows into green, roll the highlights slightly cyan
      c += vec3(0.004, 0.030, 0.010) * uStrength * (1.0 - smoothstep(0.0, 0.45, l));
      c = mix(c, c * vec3(0.97, 1.02, 1.0), smoothstep(0.55, 1.0, l) * uStrength);
      // gentle filmic contrast
      c = clamp((c - 0.46) * 1.05 + 0.47, 0.0, 1.4);

      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * uVignette;
      c *= clamp(vig, 0.0, 1.0);

      // very fine grain so the marble dust does not band
      float g = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (g - 0.5) * 0.014;

      gl_FragColor = vec4(c, 1.0);
    }`,
};

export interface Post {
  composer: EffectComposer;
  grade: ShaderPass;
  bloom: UnrealBloomPass;
  setSize(w: number, h: number): void;
}

export function buildPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.28,
    0.72,
    0.95,
  );
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer,
    grade,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
  };
}
