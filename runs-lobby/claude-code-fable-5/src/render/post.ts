/**
 * A9: post-processing stack.
 *
 * The scene used to be graded with a CSS `filter` on the canvas, which cannot
 * do anything selective and cannot see HDR. The pipeline is now:
 *
 *   RenderPass (HDR, half-float)
 *     -> SSAO                    contact shadows in the coffers, column bases,
 *                                wainscot seams and under fallen figures
 *     -> UnrealBloom             threshold above 1.0, so ONLY emissives bloom
 *                                (muzzle flashes, tracer heads and haloes, the
 *                                detector alarm, cab and ceiling fixtures) and
 *                                the hall itself is never washed out
 *     -> motion blur             directional, scaled by the choreographed time
 *                                scale: full at speed, gone in the extreme
 *                                slow-motion windows. This is what makes
 *                                bullet-time read as bullet-time.
 *     -> grade                   ACES tone map + the dark teal-green grade
 *                                (moved out of CSS) + vignette + film grain
 *
 * Tone mapping happens in the grade pass, not the renderer, so bloom sees real
 * HDR values instead of values already crushed into [0,1].
 *
 * `?quality=low` drops SSAO and motion blur; bloom and the grade stay, since
 * they carry the look.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

/** Directional blur along a screen-space velocity vector. */
const MotionShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    velocity: { value: new THREE.Vector2() },
    strength: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 velocity;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec2 v = velocity * strength;
      if (dot(v, v) < 1e-9) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 sum = vec4(0.0);
      float wsum = 0.0;
      // 9 taps trailing behind the motion, weighted toward the current frame
      for (int i = 0; i < 9; i++) {
        float t = float(i) / 8.0;
        float w = 1.0 - 0.55 * t;
        sum += texture2D(tDiffuse, vUv - v * t) * w;
        wsum += w;
      }
      gl_FragColor = sum / wsum;
    }
  `,
};

/** ACES tone map + teal grade + vignette + grain, and sRGB encode. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    exposure: { value: 0.95 },
    // exactly the values of the CSS filter this pass replaces:
    // saturate(0.85) contrast(1.28) brightness(0.86)
    saturation: { value: 0.85 },
    contrast: { value: 1.28 },
    brightness: { value: 0.86 },
    tealLift: { value: new THREE.Color(0.008, 0.019, 0.015) },
    vignette: { value: 0.3 },
    grain: { value: 0.022 },
    aspect: { value: 1.777 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float exposure, saturation, contrast, brightness, vignette, grain, aspect, time;
    uniform vec3 tealLift;
    varying vec2 vUv;

    // Narkowicz's ACES fit — the same curve the renderer used to apply
    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec3 encodeSRGB(vec3 c) {
      c = max(c, 0.0);
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
      return mix(hi, lo, step(c, vec3(0.0031308)));
    }

    void main() {
      vec3 c = aces(texture2D(tDiffuse, vUv).rgb * exposure);
      // The grade runs in DISPLAY space, where the CSS filter it replaces used
      // to run. Applying contrast around a 0.5 pivot to linear values instead
      // crushes the whole hall to black.
      c = encodeSRGB(c);

      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c *= brightness;
      // the signature grade: cool green lift held in the shadows only
      c += tealLift * (1.0 - smoothstep(0.0, 0.45, l));

      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.55, 1.05, length(d));

      c += (hash(vUv * 1024.0 + fract(time) * 71.3) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  private motion!: ShaderPass;
  private grade!: ShaderPass;
  private ssao: SSAOPass | null = null;
  private bloom: UnrealBloomPass;
  private prevVP = new THREE.Matrix4();
  private probe = new THREE.Vector3();
  private cur = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private vp = new THREE.Matrix4();
  private clock = 0;
  private first = true;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private lowQuality: boolean,
  ) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // half-float so bloom can threshold on real HDR values
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: lowQuality ? 0 : 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    if (!lowQuality) {
      // half-resolution AO: contact shadows, not a frame-rate sink
      const ssao = new SSAOPass(scene, camera, Math.round(w / 2), Math.round(h / 2));
      ssao.kernelRadius = 0.28;
      ssao.minDistance = 0.0008;
      ssao.maxDistance = 0.09;
      this.ssao = ssao;
      this.composer.addPass(ssao);
    }

    // B11: the threshold has to clear the brightest thing that is NOT meant to
    // bloom. That turned out to be the entrance daylight mirrored in the
    // polished floor: the Reflector re-renders those emissive planes, and
    // looking down the hall the mirrored band covers a large area of frame, so
    // at a lower threshold it bloomed into one white mass over the middle of
    // the image. Tracer heads, muzzle flashes and the alarm lamp are all
    // driven well above this and still bloom.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.round(w / 2), Math.round(h / 2)),
      0.45, // strength
      0.5, // radius
      2.1, // threshold, see the note above
    );
    // B11: bound how much any one pixel can feed the bloom. Threshold alone
    // controls WHAT blooms, not HOW HARD; a large area of very bright pixels
    // (here the lit elevator cab and its light pool at the end of the hall)
    // therefore bloomed into a single white mass over the middle of frame.
    // Clamping the high-pass output caps each pixel's contribution, so a big
    // bright area still glows but can no longer wash the image out, while
    // small intense things — tracer heads, muzzle flashes — are unaffected in
    // appearance because their bloom is carried by spread, not magnitude.
    {
      const hp = (this.bloom as unknown as {
        materialHighPassFilter: THREE.ShaderMaterial;
      }).materialHighPassFilter;
      hp.uniforms.bloomClamp = { value: 1.8 };
      hp.fragmentShader = `uniform float bloomClamp;\n${hp.fragmentShader.replace(
        'gl_FragColor = mix( outputColor, texel, alpha );',
        'gl_FragColor = mix( outputColor, vec4( min( texel.rgb, vec3( bloomClamp ) ), texel.a ), alpha );',
      )}`;
      hp.needsUpdate = true;
    }
    this.composer.addPass(this.bloom);

    // ?hot=1 — dev-only diagnostic: renders the pre-grade HDR luminance as
    // greyscale scaled by 1/8, so an over-bright element can be located and
    // its magnitude read off directly. This is what identified the B11
    // blow-out after three wrong guesses at the source; it stays in the repo
    // because "which surface is over 2.0 in HDR" is otherwise unanswerable.
    if (new URLSearchParams(location.search).get('hot') === '1') {
      const dbg = new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader:
          'varying vec2 vUv; void main(){ vUv=uv;'
          + ' gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader:
          'uniform sampler2D tDiffuse; varying vec2 vUv;'
          + ' void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;'
          + ' float v=dot(c,vec3(0.299,0.587,0.114));'
          + ' gl_FragColor=vec4(vec3(v/8.0),1.0); }',
      });
      dbg.renderToScreen = true;
      this.composer.addPass(dbg);
      return;
    }
    this.motion = new ShaderPass(MotionShader);
    this.motion.enabled = !lowQuality;
    this.composer.addPass(this.motion);

    this.grade = new ShaderPass(GradeShader);
    this.grade.renderToScreen = true;
    this.composer.addPass(this.grade);
    if (this.grade) this.grade.uniforms.aspect.value = w / h;
  }

  /**
   * Camera motion blur, approximated by one screen-space velocity for the
   * whole frame: a reference point ahead of the lens is projected with this
   * frame's and the previous frame's view-projection, and the difference is
   * the blur direction. Cheap, needs no velocity buffer, and is exactly the
   * whip-pan smear the fast cuts want.
   *
   * `timeScale` is the choreographed scale, so the blur falls away inside the
   * slow-motion windows and disappears entirely in the extreme inserts.
   */
  update(realDt: number, timeScale: number) {
    this.clock += realDt;
    if (this.grade) this.grade.uniforms.time.value = this.clock;

    if (!this.motion || !this.motion.enabled) return;
    this.camera.updateMatrixWorld();
    this.vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    // a point 9 m down the lens axis stands in for the scene's median depth
    this.probe.set(0, 0, -9).applyMatrix4(this.camera.matrixWorld);
    this.cur.copy(this.probe).applyMatrix4(this.vp);
    this.prev.copy(this.probe).applyMatrix4(this.prevVP);
    this.prevVP.copy(this.vp);
    if (this.first) { this.first = false; this.motion.uniforms.strength.value = 0; return; }

    const vx = (this.cur.x - this.prev.x) * 0.5;
    const vy = (this.cur.y - this.prev.y) * 0.5;
    (this.motion.uniforms.velocity.value as THREE.Vector2).set(vx, vy);
    // full blur at speed, none below a fifth speed
    const s = THREE.MathUtils.smoothstep(timeScale, 0.16, 0.6);
    this.motion.uniforms.strength.value = s * 0.55;
  }

  render() {
    this.composer.render();
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.round(w / 2), Math.round(h / 2));
    this.ssao?.setSize(Math.round(w / 2), Math.round(h / 2));
    if (this.grade) this.grade.uniforms.aspect.value = w / h;
    void this.renderer;
  }
}
