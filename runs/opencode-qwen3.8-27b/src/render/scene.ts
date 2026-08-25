import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import { buildTerrainMesh } from './terrain-mesh';
import { WaterSurface } from './water-mesh';
import { RainEffect } from './rain';
import { CloudLayer } from './clouds';
import { createGradePass } from './grade';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Sky palette: soft blue gradient, horizon matched to the fog color. */
const SKY_ZENITH = new THREE.Color('#3d7fc4');
const SKY_HORIZON = new THREE.Color('#87ceeb');

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float t = smoothstep(-0.06, 0.42, vDir.y);
  vec3 color = mix(uHorizon, uZenith, t);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * A soft radial glow texture, generated at runtime (no external asset). Used
 * for the sun disc; additive-blended and boosted by the bloom pass so the sun
 * reads as a bright, haloed light source.
 */
function makeGlowTexture(size: number, stops: Array<[number, string]>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Owns everything WebGL: renderer, scene, fog, sky dome, lights, the sun, the
 * bloom pass, and the terrain / water / rain. It is the single bridge between
 * the pure simulation and the screen; it never mutates the simulation.
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private water: WaterSurface | null = null;
  private rain: RainEffect | null = null;
  private clouds: CloudLayer | null = null;
  private sun: THREE.DirectionalLight;
  private sunSprite: THREE.Sprite;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ReturnType<typeof createGradePass>;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Real sun = cast shadows. PCF keeps the shadow edges natural rather than
    // aliased, matching the soft light of a hazy day.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), 120, 330);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.5,
      1500
    );

    // Gradient sky dome (unaffected by fog, so its horizon color is the seam
    // the fog blends into).
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: SKY_ZENITH },
          uHorizon: { value: SKY_HORIZON }
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
      })
    );
    this.scene.add(sky);

    // Warm key light (the sun) — animated each frame in updateSun(). It casts a
    // shadow map fitted to the island (the orthographic frustum moves with the
    // light, so it always covers the terrain from whatever side the sun is on).
    this.sun = new THREE.DirectionalLight(0xffe6b0, 3.0);
    this.sun.position.set(70, 95, -35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -80;
    sc.right = 80;
    sc.top = 80;
    sc.bottom = -80;
    sc.near = 10;
    sc.far = 400;
    sc.updateProjectionMatrix();
    // normalBias pushes the depth test off the surface to kill acne on the
    // steep, flat-shaded slopes; a small bias avoids peter-panning.
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Cool fill from the sky + a warm ground bounce, and a base ambient. Kept a
    // little strong so the wall's shadow (a key "real sun" cue) still leaves
    // detail in the shaded caldera floor and the river — not a flat black void.
    const hemi = new THREE.HemisphereLight(0xbfe0f2, 0x8a7a5c, 1.05);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.38);
    this.scene.add(ambient);

    // Cool rim / back light for a crisp, cinematic edge on the peaks.
    const rim = new THREE.DirectionalLight(0x9fc4e8, 0.7);
    rim.position.set(-60, 40, 70);
    this.scene.add(rim);

    // The visible sun: a glowing disc far out in the light's direction.
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(
          128,
          [
            [0, 'rgba(255,250,235,1)'],
            [0.18, 'rgba(255,240,205,0.95)'],
            [0.5, 'rgba(255,214,150,0.35)'],
            [1, 'rgba(255,200,120,0)']
          ]
        ),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        transparent: true
      })
    );
    this.sunSprite.scale.set(150, 150, 1);
    this.scene.add(this.sunSprite);

    // Bloom: bright sources (the sun, water glints, snow caps) bleed into a
    // soft glow. Kept modest so the scene reads, not blows out.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42, // strength
      0.5, // radius
      // High threshold: only the brightest sources (the sun disc and the water
      // glint) bloom — not the lit terrain, which would blow out to white.
      0.9
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Final grade (vignette + grain + contrast/saturation) on the finished image.
    this.grade = createGradePass();
    this.composer.addPass(this.grade);

    // Soft clouds drifting high above the island.
    this.clouds = new CloudLayer();
    this.scene.add(this.clouds.group);

    window.addEventListener('resize', () => this.resize());
  }

  addTerrain(terrain: Terrain): void {
    this.scene.add(buildTerrainMesh(terrain));
  }

  addWater(terrain: Terrain): void {
    this.water = new WaterSurface(terrain);
    this.scene.add(this.water.mesh);
  }

  addRain(): void {
    this.rain = new RainEffect();
    this.scene.add(this.rain.object);
  }

  /** Scale the visible rain with the configured rainfall (0 hides it). */
  setRainIntensity(rain: number): void {
    this.rain?.setIntensity(rain);
  }

  /** Push the current water depths (and time, for the ripple) into the mesh. */
  updateWater(depth: Float32Array, time: number): void {
    this.water?.update(depth, time);
  }

  /** Advance the cosmetic rain by `dt` seconds. */
  updateRain(dt: number): void {
    if (dt > 0) this.rain?.update(dt);
  }

  /**
   * Place the sun as the MIRROR of the camera about the vertical axis through
   * the look-target. The camera is in front of the lake looking down at it; the
   * mirrored sun sits on the far side at the same elevation, so the lake always
   * reflects the sun as a bright central glint (the classic "sun sparkle") and
   * the near slopes are front-lit. A subtle bob keeps the glint shimmering
   * rather than perfectly static.
   */
  updateSun(t: number): void {
    const target = new THREE.Vector3(0, 7, 0);
    const toCam = new THREE.Vector3().copy(this.camera.position).sub(target);
    const dir = new THREE.Vector3(-toCam.x, Math.max(toCam.y, 1), -toCam.z);
    dir.y += Math.sin(t * 0.4) * 0.05; // a gentle shimmer
    dir.normalize();
    this.sun.position.copy(target).addScaledVector(dir, 140);
    this.sun.target.position.copy(target);
    this.sunSprite.position.copy(target).addScaledVector(dir, 560);
    // A strong key light for the terrain, kept just under the point where the
    // water's glint would bloom out to a white blob — so the sun reads as a
    // gleaming highlight on the blue water, not a blowout.
    this.sun.intensity = 1.5 + 0.5 * dir.y;
  }

  /** Advance the drifting clouds by `dt` seconds. */
  updateClouds(dt: number): void {
    if (dt > 0) this.clouds?.update(dt);
  }

  /** Advance the animated film grain. */
  updateGrade(time: number): void {
    (this.grade.uniforms.uTime as { value: number }).value = time;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    (this.grade.uniforms.uResolution as { value: THREE.Vector2 }).value.set(w, h);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.rain?.dispose();
    this.clouds?.dispose();
    this.sunSprite.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
