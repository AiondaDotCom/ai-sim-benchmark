/**
 * Visual state driven by the simulation: bullet decals + craters (persist),
 * instanced shell casings and marble debris (persist), dropped guns,
 * dust particles, muzzle flashes and slow tracers.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/events';
import type { Mats } from './materials';
import { mulberry32, rand, Rng } from '../sim/rng';

const MAX_CASINGS = 900;
/**
 * B18: per-size-class instance ceilings. Grit dominates the count, so it gets
 * the largest pool and the cheapest geometry. Measured over a full run:
 * 4952 grit, 1838 chips, 1197 flakes, with nothing dropped.
 */
const DEBRIS_CAP = [7200, 3000, 2200];
const DEBRIS_TINT: [number, number, number][] = [
  [0.886, 0.874, 0.831],
  [0.796, 0.784, 0.737],
  [0.702, 0.714, 0.671],
];

/**
 * B13 supplement: the particulate storm.
 *
 * A single point cloud at one size cannot read as masonry being chewed up —
 * everything moves at the same speed and fades on the same clock, so a burst
 * looks like a puff of smoke rather than a wall coming apart. The storm is
 * therefore split across three physical scales that behave differently:
 *
 *   grit    heavy, fast, thrown clear of the wall, gone in under a second
 *   dust    the mid-scale cloud that hangs in the air for a few seconds
 *   billow  slow pale volume that rolls off the impact and barely falls
 *
 * Each scale has its own capped ring buffer, so sustained fire raises the
 * density without ever growing the pool. Motion runs on the simulation clock,
 * so the storm hangs in place during slow-motion beats.
 */
const DUST_KINDS = [
  // size, colour, opacity, cap, drag /s, gravity m/s2
  { size: 0.05, color: 0xdfe4d6, opacity: 0.5, max: 4200, drag: 1.7, grav: 3.2 },
  { size: 0.24, color: 0xeef2e6, opacity: 0.26, max: 3000, drag: 0.55, grav: 0.5 },
  // the billow is deliberately faint: at 0.13 each sprite read as a discrete
  // disc when it drifted near the lens, so density comes from overlap instead
  { size: 1.05, color: 0xd7ddce, opacity: 0.06, max: 1400, drag: 0.3, grav: 0.05 },
] as const;

/**
 * The lingering haze. Sustained fire keeps adding slow, very soft, very large
 * puffs; each one grows and fades over ~14 s, so the layer builds while the
 * shooting lasts and settles by itself into the wind-down without any global
 * state to reset. The pool is fixed, so the cost is bounded no matter how long
 * the firefight runs — density comes from overlap, not from more sprites.
 */
const MAX_DECALS = 1600;
const MAX_FACING_PER_SLAB = 160;
const MAX_HAZE = 26;
const HAZE_LIFE = 24;

interface DustP {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  born: number; life: number;
}

export class Effects {
  group = new THREE.Group();
  private casingMesh: THREE.InstancedMesh;
  private debrisMeshes: THREE.InstancedMesh[];
  /** B20: one facing-mark mesh per slab, so each binds its own damage grid. */
  private facing = new Map<string, {
    mesh: THREE.InstancedMesh; seed: THREE.InstancedBufferAttribute;
    uv: THREE.InstancedBufferAttribute; ext: THREE.InstancedBufferAttribute; n: number;
  }>();
  private damageTex: ((id: string) => THREE.Texture | null) | null = null;
  private decalMesh!: THREE.InstancedMesh;
  private decalSeed!: THREE.InstancedBufferAttribute;
  private decalCount = 0;
  private gunMeshes: THREE.Group[] = [];
  private dust: DustP[][] = DUST_KINDS.map(() => []);
  private dustGeo: THREE.BufferGeometry[] = [];
  private dustPos: Float32Array[] = [];
  private haze: THREE.Sprite[] = [];
  private flashPool: THREE.Sprite[] = [];
  private flashCones: THREE.Mesh[] = [];
  /** B18: the short bright spall flash at the point a round lands. */
  private spallPool: THREE.Sprite[] = [];
  /** B19: whole tiles of cladding, falling. */
  private slabPool: THREE.Mesh[] = [];
  private flashLight: THREE.PointLight;
  private tracerMesh: THREE.InstancedMesh;
  private headMesh!: THREE.InstancedMesh;
  private haloPool: THREE.Sprite[] = [];
  private tracerLights: THREE.PointLight[] = [];
  private yAxis = new THREE.Vector3(0, 1, 0);
  private dirV = new THREE.Vector3();
  private alignQ = new THREE.Quaternion();
  private ringPool: { mesh: THREE.Mesh; born: number }[] = [];
  private wakeSpawnDist = new Map<object, number>();
  private rng: Rng;
  private dummy = new THREE.Object3D();

  constructor(private mats: Mats, seed: number) {
    this.rng = mulberry32(seed ^ 0x51ed270b);

    const casingGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.036, 6);
    this.casingMesh = new THREE.InstancedMesh(casingGeo, mats.brass, MAX_CASINGS);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    this.group.add(this.casingMesh);

    // B18: one instanced mesh per SIZE CLASS rather than per colour, because
    // the classes want different geometry. Grit carries most of the count and
    // gets the cheapest shape (4 triangles against the flake's 20 and the
    // chip's 36), which is what lets a single impact throw ~25 solid pieces
    // without the triangle budget noticing. Colour variety moves to a
    // per-instance attribute so the three tints survive the regrouping.
    const clsGeo = [
      new THREE.TetrahedronGeometry(0.62, 0),
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.IcosahedronGeometry(0.52, 0),
    ];
    // pale chips so destruction reads light-on-dark against the granite
    this.debrisMeshes = clsGeo.map((geo, i) => {
      // only the flake class carries the substrate map; passing `map:
      // undefined` explicitly makes three warn about a parameter with an
      // undefined value, so the key is omitted rather than set to nothing
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: i === 0 ? 0.95 : 0.8,
        ...(i === 2 ? { map: mats.textures.substrate } : {}),
      });
      const im = new THREE.InstancedMesh(geo, mat, DEBRIS_CAP[i]);
      im.count = 0;
      im.frustumCulled = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(DEBRIS_CAP[i] * 3), 3,
      );
      this.group.add(im);
      return im;
    });

    // One instanced draw for every bullet mark. Each mark used to be its own
    // Mesh with its own PlaneGeometry and its own MeshStandardMaterial, so a
    // long firefight added hundreds of draw calls and hundreds of material
    // allocations; the per-mark shape variation now rides in as an instanced
    // attribute instead of a uniform written per draw.
    {
      const geo = new THREE.PlaneGeometry(1, 1);
      this.decalSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1);
      geo.setAttribute('aSeed', this.decalSeed);
      this.decalMesh = new THREE.InstancedMesh(geo, Effects.makePockMat(), MAX_DECALS);
      this.decalMesh.count = 0;
      this.decalMesh.frustumCulled = false;
      this.group.add(this.decalMesh);
    }

    // particulate storm: one point cloud per physical scale
    for (const k of DUST_KINDS) {
      const pos = new Float32Array(k.max * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        map: mats.textures.dust,
        color: k.color,
        size: k.size,
        transparent: true,
        opacity: k.opacity,
        depthWrite: false,
        sizeAttenuation: true,
      }));
      pts.frustumCulled = false;
      this.dustPos.push(pos);
      this.dustGeo.push(geo);
      this.group.add(pts);
    }

    // haze pool: parked and invisible until fire starts adding to it
    for (let i = 0; i < MAX_HAZE; i++) {
      const hm = new THREE.SpriteMaterial({
        map: mats.textures.dust,
        color: 0xd2d8ca,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      // The dust sprite is a clean radial gradient, so a puff of it is a
      // perfect disc — at close range the layer read as a handful of soft
      // bubbles rather than haze. Each puff gets its own seed and an fbm mask
      // that eats irregularly into its silhouette, so overlapping puffs merge
      // into one continuous veil instead of staying countable.
      const seed = i * 3.77;
      hm.onBeforeCompile = (shader) => {
        shader.uniforms.uHazeSeed = { value: seed };
        // see makeFlashMat: the sprite shader has no generic vUv
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
          varying vec2 vSprUv;`)
          .replace('#include <uv_vertex>', `#include <uv_vertex>
          vSprUv = uv;`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
          varying vec2 vSprUv;
          uniform float uHazeSeed;
          float hzHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float hzNoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hzHash(i), hzHash(i + vec2(1.0, 0.0)), f.x),
                       mix(hzHash(i + vec2(0.0, 1.0)), hzHash(i + vec2(1.0)), f.x), f.y);
          }`)
          .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
          {
            vec2 hp = vSprUv - 0.5;
            float hf = hzNoise(hp * 5.5 + uHazeSeed) * 0.62
                     + hzNoise(hp * 13.0 - uHazeSeed) * 0.38;
            // B23: the fbm mask on its own does NOT reach zero at the edge of
            // the UV square, so the sprite's rectangular quad boundary could
            // draw as a hard straight line. Everything is multiplied by a
            // radial term that is exactly 0 at the border, so the quad edge
            // can never be visible whatever the noise does.
            float hzEdge = 1.0 - smoothstep(0.34, 0.5, length(hp));
            diffuseColor.a *= smoothstep(0.18, 0.72, hf * 1.35) * hzEdge;
          }`);
      };
      hm.customProgramCacheKey = () => `haze${i}`;
      const sp = new THREE.Sprite(hm);
      sp.visible = false;
      sp.frustumCulled = false;
      this.haze.push(sp);
      this.group.add(sp);
    }

    // B22: muzzle flashes.
    //
    // These used to be the plain radial dust gradient tinted warm — a soft
    // round white blob that read as a lens smudge rather than an ignition.
    // Now the star is generated in the shader: a hot core falling off to a
    // warmer edge, with irregular radial spikes, rotated by a seeded amount
    // per shot so consecutive flashes differ. The forward cone is a separate
    // mesh aligned to the barrel, which a screen-aligned sprite cannot be.
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(Effects.makeFlashMat());
      s.scale.setScalar(0.3);
      s.visible = false;
      this.group.add(s);
      this.flashPool.push(s);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.19, 7, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffd489, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      cone.visible = false;
      this.group.add(cone);
      this.flashCones.push(cone);
    }
    // B18: a brief bright spall flash at the contact point, so the eye is
    // drawn to where the round actually landed. Its own pool, much shorter
    // and cooler than a muzzle flash — this is stone giving way, not ignition.
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mats.textures.dust,
        color: 0xdfe6ee,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      sp.visible = false;
      this.group.add(sp);
      this.spallPool.push(sp);
    }

    // B19: a falling tile carries the granite face on its front and the rough
    // core on its back, so it reads as a real slab rather than a big chip.
    // BoxGeometry group order is +x, -x, +y, -y, +z, -z.
    {
      const edge = new THREE.MeshStandardMaterial({
        map: mats.textures.substrate, color: 0xb9bbb1, roughness: 0.95,
      });
      const back = new THREE.MeshStandardMaterial({
        map: mats.textures.substrate, color: 0xc6c8be, roughness: 1,
      });
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          [edge, edge, edge, edge, mats.marble, back],
        );
        m.visible = false;
        m.castShadow = false;
        this.group.add(m);
        this.slabPool.push(m);
      }
    }

    this.flashLight = new THREE.PointLight(0xffcc77, 0, 7);
    this.group.add(this.flashLight);

    // tracers: additive light trail + hot glowing head (A5)
    // B5: round, tapered trail that fades to nothing at the tail. Additive
    // blending turns the baked vertex-colour ramp into an opacity ramp, so
    // the streak reads as glowing air rather than a flat white plank.
    const tracerGeo = new THREE.CylinderGeometry(0.014, 0.003, 1, 8, 1, true);
    tracerGeo.rotateX(Math.PI / 2);
    {
      const pos = tracerGeo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const k = Math.max(0, Math.min(1, pos.getZ(i) + 0.5)); // 0 tail .. 1 head
        const f = k * k;
        col[i * 3] = f; col[i * 3 + 1] = f * 0.88; col[i * 3 + 2] = f * 0.6;
      }
      tracerGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffdf9a, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, 64);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    this.group.add(this.tracerMesh);
    // A7: modeled bullet — ogive-nosed copper projectile (lathe profile),
    // spinning around its flight axis; B5 glow comes from emissive + halo
    const profile: THREE.Vector2[] = [];
    profile.push(new THREE.Vector2(0.0001, -0.02));
    profile.push(new THREE.Vector2(0.0088, -0.02));
    profile.push(new THREE.Vector2(0.0088, 0.004));
    profile.push(new THREE.Vector2(0.0078, 0.012));
    profile.push(new THREE.Vector2(0.0052, 0.02));
    profile.push(new THREE.Vector2(0.0001, 0.026));
    const headGeo = new THREE.LatheGeometry(profile, 12);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xc98f4e, metalness: 0.85, roughness: 0.3,
      // hot core: white-yellow and well above 1 so the head itself glows (B5)
      emissive: 0xffdb8a, emissiveIntensity: 2.8,
    });
    this.headMesh = new THREE.InstancedMesh(headGeo, headMat, 64);
    this.headMesh.count = 0;
    this.headMesh.frustumCulled = false;
    this.group.add(this.headMesh);
    // B5: additive halo billboards riding each projectile head
    const haloMat = new THREE.SpriteMaterial({
      map: mats.textures.dust,
      color: 0xffe2a0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });
    for (let i = 0; i < 64; i++) {
      const s = new THREE.Sprite(haloMat.clone());
      s.visible = false;
      this.group.add(s);
      this.haloPool.push(s);
    }
    // pooled lights that ride the projectiles nearest the camera
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 3.2, 2);
      this.group.add(l);
      this.tracerLights.push(l);
    }
    // A5 air-wake rings for the dodge near-misses
    const ringGeo = new THREE.TorusGeometry(0.13, 0.014, 6, 20);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa8dcc9, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(ringGeo, ringMat.clone());
      m.visible = false;
      this.group.add(m);
      this.ringPool.push({ mesh: m, born: -1 });
    }
  }

  reset() {
    this.casingMesh.count = 0;
    for (const m of this.debrisMeshes) m.count = 0;
    this.decalMesh.count = 0;
    this.decalCount = 0;
    for (const f of this.facing.values()) { f.mesh.count = 0; f.n = 0; }
    for (const g of this.gunMeshes) { g.userData.settled = false; this.group.remove(g); }
    this.gunMeshes = [];
    this.dust = DUST_KINDS.map(() => []);
    for (const sp of this.haze) { sp.visible = false; sp.userData.born = -1e9; }
    this.tracerMesh.count = 0;
    this.headMesh.count = 0;
    this.wakeSpawnDist = new Map();
    for (const r of this.ringPool) r.mesh.visible = false;
    for (const c of this.flashCones) c.visible = false;
    for (const sp of this.spallPool) sp.visible = false;
    for (const m of this.slabPool) m.visible = false;
    for (const l of this.tracerLights) l.intensity = 0;
  }

  /** React to freshly drained events (muzzle flash, dust bursts). */
  onEvents(
    events: SimEvent[],
    flashScale = 1,
    muzzleAt?: (shooter: string, dir: number[]) => THREE.Vector3 | null,
  ) {
    for (const e of events) {
      if (e.type === 'SHOT') {
        const si = this.flashPool.findIndex((f) => !f.visible);
        const s = si >= 0 ? this.flashPool[si] : undefined;
        if (s) {
          // B5: sit the flash on the rendered barrel tip when we can resolve
          // it; the sim's muzzle point is only a body-relative estimate.
          const tip = muzzleAt?.(e.shooter, e.dir) ?? null;
          if (tip) s.position.copy(tip);
          else s.position.set(e.pos[0] + e.dir[0] * 0.06, e.pos[1] + e.dir[1] * 0.06, e.pos[2] + e.dir[2] * 0.06);
          s.visible = true;
          // short sim-time lifetime with fade-out: no lingering detached
          // glow blob between muzzle and bullet (B5)
          s.userData.untilSim = e.t + 0.028;
          s.userData.baseScale = e.weapon === 'smg' ? 0.22 : 0.28;
          s.scale.setScalar(s.userData.baseScale);
          // B22: a seeded roll per shot, so consecutive flashes differ
          (s.material as THREE.SpriteMaterial).rotation = this.rng() * Math.PI * 2;

          // the forward cone, aligned to the barrel — a screen-aligned sprite
          // cannot show the direction the gases actually leave in
          const cone = this.flashCones[si];
          if (cone) {
            cone.visible = true;
            cone.position.copy(s.position);
            this.dirV.set(e.dir[0], e.dir[1], e.dir[2]).normalize();
            // the cone's own axis is +Y, so point that along the barrel and
            // push it forward by half its length to sit at the muzzle
            cone.quaternion.setFromUnitVectors(this.yAxis, this.dirV);
            cone.position.addScaledVector(this.dirV, 0.09);
            cone.userData.untilSim = s.userData.untilSim;
            cone.userData.baseScale = s.userData.baseScale / 0.28;
          }
        }
        this.flashLight.position.copy(s ? s.position : new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]));
        this.flashLight.intensity = 14;
        // muzzle smoke: a few slow pale wisps drifting off the barrel (A5)
        for (let i = 0; i < 3; i++) {
          this.pushDust(1, {
            x: e.pos[0] + e.dir[0] * 0.3,
            y: e.pos[1] + e.dir[1] * 0.3,
            z: e.pos[2] + e.dir[2] * 0.3,
            vx: e.dir[0] * rand(this.rng, 0.4, 1.0) + rand(this.rng, -0.25, 0.25),
            vy: rand(this.rng, 0.15, 0.5),
            vz: e.dir[2] * rand(this.rng, 0.4, 1.0) + rand(this.rng, -0.25, 0.25),
            born: e.t,
            life: rand(this.rng, 0.5, 1.3),
          });
        }
      }
      if (e.type === 'IMPACT_MARBLE') {
        // B13 supplement: every round that bites stone throws a full storm,
        // not one puff — heavy grit blown clear, the mid cloud that hangs,
        // and a slow billow rolling off the face.
        const [nx, ny, nz] = e.normal;
        const spray = (k: number, n: number, spd: [number, number], up: number, life: [number, number]) => {
          for (let i = 0; i < n; i++) {
            const v = rand(this.rng, spd[0], spd[1]);
            this.pushDust(k, {
              x: e.pos[0] + nx * 0.05,
              y: e.pos[1] + ny * 0.05,
              z: e.pos[2] + nz * 0.05,
              vx: nx * v + rand(this.rng, -v, v) * 0.55,
              vy: ny * v + rand(this.rng, 0, up),
              vz: nz * v + rand(this.rng, -v, v) * 0.55,
              born: e.t,
              life: rand(this.rng, life[0], life[1]),
            });
          }
        };
        const sp = this.spallPool.find((f) => !f.visible);
        if (sp) {
          sp.visible = true;
          sp.position.set(e.pos[0] + nx * 0.02, e.pos[1] + ny * 0.02, e.pos[2] + nz * 0.02);
          sp.userData.untilSim = e.t + 0.05;
          sp.scale.setScalar(rand(this.rng, 0.16, 0.3));
        }
        spray(0, 24, [2.4, 7.0], 1.1, [0.3, 1.0]);
        spray(1, 11, [0.25, 1.4], 0.6, [2.2, 5.5]);
        spray(2, 9, [0.12, 0.55], 0.35, [4.0, 9.0]);
        this.addHaze(e.pos, e.normal, e.t);
      }
    }
  }

  /** Push into one scale's ring buffer, dropping the oldest when full. */
  private pushDust(kind: number, p: DustP) {
    const a = this.dust[kind];
    if (a.length >= DUST_KINDS[kind].max) a.shift();
    a.push(p);
  }

  /**
   * Add one puff to the lingering haze. Reuses the oldest slot so the pool
   * size is the hard ceiling on cost; sustained fire simply keeps refreshing
   * the layer, and once the shooting stops every puff runs out its own fade.
   */
  private addHaze(pos: number[], normal: number[], t: number) {
    if (this.rng() > 0.5) return;
    let slot = this.haze[0];
    for (const sp of this.haze) {
      if (!sp.visible) { slot = sp; break; }
      if ((sp.userData.born ?? -1e9) < (slot.userData.born ?? -1e9)) slot = sp;
    }
    slot.visible = true;
    slot.userData.born = t;
    slot.userData.drift = [
      normal[0] * rand(this.rng, 0.1, 0.4) + rand(this.rng, -0.12, 0.12),
      rand(this.rng, 0.03, 0.14),
      normal[2] * rand(this.rng, 0.1, 0.4) + rand(this.rng, -0.12, 0.12),
    ];
    slot.position.set(
      pos[0] + normal[0] * 0.35 + rand(this.rng, -0.4, 0.4),
      pos[1] + rand(this.rng, -0.3, 0.5),
      pos[2] + normal[2] * 0.35 + rand(this.rng, -0.4, 0.4),
    );
    // Per-puff opacity has to be read as a STACK, not on its own. The pool
    // overlaps heavily at the impact zone, and normal blending compounds:
    // 26 puffs at 0.07 each cover 1 - 0.93^26 = 0.85 of the frame in near
    // white, which is what the first tuning did — it washed the hall out
    // completely. At these values a full stack settles around 0.3, which
    // hazes the frame without lifting it off the floor.
    slot.userData.peak = rand(this.rng, 0.008, 0.018);
  }

  /** Sync persistent visuals with the world; simT drives dust motion. */
  update(world: World, simDt: number, camPos?: THREE.Vector3, timeScale = 1) {
    // casings
    const n = Math.min(world.casings.length, MAX_CASINGS);
    for (let i = 0; i < n; i++) {
      const c = world.casings[i];
      this.dummy.position.set(c.pos[0], c.pos[1], c.pos[2]);
      this.dummy.rotation.set(c.angle[0], c.angle[1], c.angle[2]);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.casingMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.casingMesh.count = n;
    this.casingMesh.instanceMatrix.needsUpdate = true;

    // debris, split by SIZE CLASS across the three instanced meshes (B18)
    const counts = [0, 0, 0];
    for (const d of world.debris) {
      const k = d.cls;
      const mesh = this.debrisMeshes[k];
      if (counts[k] >= DEBRIS_CAP[k]) continue;
      this.dummy.position.set(d.pos[0], d.pos[1], d.pos[2]);
      this.dummy.rotation.set(d.angle[0], d.angle[1], d.angle[2]);
      this.dummy.scale.setScalar(d.size);
      this.dummy.updateMatrix();
      const i = counts[k]++;
      mesh.setMatrixAt(i, this.dummy.matrix);
      const tint = DEBRIS_TINT[d.kind % 3];
      mesh.instanceColor!.setXYZ(i, tint[0], tint[1], tint[2]);
    }
    this.debrisMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    });

    // B19: falling tiles. Only the airborne ones are drawn — once a slab
    // lands it is replaced by the angular pieces it broke into, which persist
    // in the debris pool like everything else.
    {
      let n = 0;
      for (const t of world.tileSlabs) {
        if (t.landed || n >= this.slabPool.length) continue;
        const m = this.slabPool[n++];
        m.visible = true;
        m.position.set(t.pos[0], t.pos[1], t.pos[2]);
        m.rotation.set(t.angle[0], t.angle[1], t.angle[2]);
        m.scale.set(t.size, t.size, t.thickness);
      }
      for (let i = n; i < this.slabPool.length; i++) this.slabPool[i].visible = false;
    }

    // decals: append the new ones
    while (this.decalCount < world.decals.length) {
      const d = world.decals[this.decalCount];
      // B16/B20: a mark on surviving stone is a spall crater clipped against
      // the damage grid; one on exposed core is a pock that simply stays.
      const slab = d.layer === 'facing' ? world.slabs.find((sl) => sl.id === d.slab) : undefined;
      if (!slab || !this.addFacingDecal(d, slab)) this.addDecal(d);
      this.decalCount++;
    }

    // dropped guns
    // B10: the dropped weapon matches the type that was carried, and carries
    // enough shape to catch a specular highlight — a single small dark box on
    // a near-black marble floor was invisible at wide-shot distance, which is
    // why the guns looked like they vanished.
    while (this.gunMeshes.length < world.droppedGuns.length) {
      const i = this.gunMeshes.length;
      const kind = world.droppedGuns[i].kind;
      const g = new THREE.Group();
      const steel = this.mats.gunmetal;
      const dark = this.mats.black;
      if (kind === 'smg') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.34), steel);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.012, -0.23);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.055), dark);
        mag.position.set(0, -0.1, 0.06);
        mag.rotation.x = -0.12;
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.15), dark);
        stock.position.set(0, 0.012, 0.23);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.042), dark);
        grip.position.set(0, -0.062, 0.13);
        grip.rotation.x = -0.22;
        g.add(body, barrel, mag, stock, grip);
      } else {
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.22), steel);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.055, 8), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.008, -0.13);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.11, 0.05), dark);
        grip.position.set(0, -0.05, 0.065);
        grip.rotation.x = -0.24;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.04), steel);
        mag.position.set(0, -0.104, 0.078);
        g.add(slide, barrel, grip, mag);
      }
      this.group.add(g);
      this.gunMeshes.push(g);
    }
    world.droppedGuns.forEach((gun, i) => {
      const mesh = this.gunMeshes[i];
      // a gun that has come to rest never moves again, so stop re-transforming
      // it — with 23 weapons on the floor by the end that adds up (B10)
      if (gun.resting && mesh.userData.settled) return;
      mesh.position.set(gun.pos[0], gun.pos[1] + 0.02, gun.pos[2]);
      // resting guns lie flat on their side (B6)
      mesh.rotation.set(0, gun.yaw, gun.resting ? Math.PI / 2 : 0);
      if (gun.resting) mesh.userData.settled = true;
    });

    // tracers from live projectiles: trail + glowing head + local light (A5)
    // A7: at speed the head is a hot streak; in slow motion the emissive
    // drops away so the copper jacket of the modeled bullet is what reads.
    // Knee at 0.12: the ordinary slow-motion windows keep the full tracer
    // glow; only the extreme inserts (muzzle exit 0.05x, bullet-cam 0.022x)
    // pull it back far enough for the modeled projectile to read.
    const slowPull = Math.min(1, timeScale / 0.12);
    // B21: squared rather than linear. At the bullet-cam's scale the linear
    // ramp still left the round at ~0.9 emissive, and 0.13 m from the lens
    // that saturates to a pale cream shape with no brass in it — the report
    // asked for a readable modeled brass round, and a blown-out one is not
    // that. Squaring drops it to ~0.18 in the insert while leaving the
    // at-speed tracer glow untouched.
    (this.headMesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.05 + 2.75 * slowPull * slowPull;
    // the streak pulls back with the glow, so a slow-motion insert shows the
    // projectile rather than a bright bar next to the lens
    (this.tracerMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.7 * slowPull;
    const trailLen = 1.6 * (0.16 + 0.84 * slowPull);
    let tc = 0;
    const heads: { x: number; y: number; z: number; d2: number }[] = [];
    for (const p of world.projectiles) {
      if (p.done || tc >= 64) continue;
      const dist = (world.t - p.born) * p.speed;
      const head = Math.min(dist, p.hitDist);
      const tail = Math.max(0, head - trailLen);
      if (head <= 0.01) continue;
      const hx = p.from[0] + p.dir[0] * head;
      const hy = p.from[1] + p.dir[1] * head;
      const hz = p.from[2] + p.dir[2] * head;
      const mid = (head + tail) / 2;
      const lenT = head - tail;
      this.dummy.position.set(
        p.from[0] + p.dir[0] * mid,
        p.from[1] + p.dir[1] * mid,
        p.from[2] + p.dir[2] * mid,
      );
      this.dummy.lookAt(hx, hy, hz);
      this.dummy.scale.set(1, 1, lenT);
      this.dummy.updateMatrix();
      this.tracerMesh.setMatrixAt(tc, this.dummy.matrix);
      // modeled bullet at the head: nose along the velocity, spinning
      // around the flight axis (A7)
      this.dirV.set(p.dir[0], p.dir[1], p.dir[2]);
      this.alignQ.setFromUnitVectors(this.yAxis, this.dirV);
      this.dummy.position.set(hx, hy, hz);
      this.dummy.quaternion.copy(this.alignQ);
      this.dummy.rotateY((world.t - p.born) * 230 + tc * 1.7);
      this.dummy.scale.setScalar(p.wake ? 1.4 : 1);
      this.dummy.updateMatrix();
      this.headMesh.setMatrixAt(tc, this.dummy.matrix);
      // B5 halo: additive billboard glued to the head; in slow motion the
      // halo pulls back so the modeled bullet reads (A7)
      // A7: at speed the halo is the tracer; in slow motion it collapses to a
      // small hot point so the modeled copper projectile is what reads.
      const halo = this.haloPool[tc];
      halo.visible = true;
      halo.position.set(hx, hy, hz);
      const hs = (p.wake ? 0.3 : 0.22) * (0.12 + 0.88 * slowPull);
      // slight stretch along the flight axis reads as motion blur
      halo.scale.set(hs * (1 + 0.5 * slowPull), hs, hs);
      (halo.material as THREE.SpriteMaterial).opacity = 0.18 + 0.67 * slowPull;
      if (camPos) {
        const dx = hx - camPos.x, dy = hy - camPos.y, dz = hz - camPos.z;
        heads.push({ x: hx, y: hy, z: hz, d2: dx * dx + dy * dy + dz * dz });
      }
      // spawn air-wake rings behind a dodge near-miss round
      if (p.wake) {
        // A7/B21: the bullet-cam now rides 0.13 m off its round rather than
        // the 0.3 m this was tuned for, so the ripple is sized up a little to
        // stay readable AROUND the projectile — the report's complaint was
        // that the rings read as a scatter of small circles unrelated to any
        // bullet, and at this distance they have to be visibly its wake. They
        // are spawned along the round's own flight axis and oriented
        // perpendicular to it, so they trail it by construction. The dodge
        // near-misses are seen from across the hall and keep the big rings.
        const ringK = p.cam ? 0.22 : 1;
        const step = p.cam ? 0.16 : 0.55;
        let last = this.wakeSpawnDist.get(p) ?? 0;
        while (last + step < head) {
          last += step;
          const slot = this.ringPool.find((r) => !r.mesh.visible);
          if (!slot) break;
          slot.born = world.t;
          slot.mesh.visible = true;
          slot.mesh.position.set(
            p.from[0] + p.dir[0] * last,
            p.from[1] + p.dir[1] * last,
            p.from[2] + p.dir[2] * last,
          );
          slot.mesh.lookAt(
            p.from[0] + p.dir[0] * (last + 1),
            p.from[1] + p.dir[1] * (last + 1),
            p.from[2] + p.dir[2] * (last + 1),
          );
          slot.mesh.userData.k = ringK;
          slot.mesh.scale.setScalar(ringK);
        }
        this.wakeSpawnDist.set(p, last);
      }
      tc++;
    }
    this.tracerMesh.count = tc;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.count = tc;
    this.headMesh.instanceMatrix.needsUpdate = true;
    for (let i = tc; i < this.haloPool.length; i++) this.haloPool[i].visible = false;
    // ride the 4 nearest heads with real lights — exactly at the head, and
    // tuned so only surfaces brighten (the halo sprite is the visible glow)
    heads.sort((a, b) => a.d2 - b.d2);
    this.tracerLights.forEach((l, i) => {
      if (i < heads.length) {
        l.position.set(heads[i].x, heads[i].y, heads[i].z);
        l.intensity = 1.9;
      } else {
        l.intensity = 0;
      }
    });
    // age the wake rings (sim time: they hang and expand through slow-mo)
    for (const r of this.ringPool) {
      if (!r.mesh.visible) continue;
      const age = world.t - r.born;
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      if (age > 1.1 || age < 0) {
        r.mesh.visible = false;
        mat.opacity = 0.5;
        continue;
      }
      const k = (r.mesh.userData.k as number) ?? 1;
      r.mesh.scale.setScalar(k * (1 + Math.min(age * 4.2, 3.6)));
      mat.opacity = 0.4 * Math.max(0, 1 - age / 1.1);
    }

    // Particulate storm (moves in sim time → hangs during slow-mo). Each
    // scale carries its own drag and gravity, which is what separates them
    // visually: grit arcs out and drops, the mid cloud slows and hangs, the
    // billow barely moves at all.
    for (let k = 0; k < DUST_KINDS.length; k++) {
      const kind = DUST_KINDS[k];
      const buf = this.dustPos[k];
      let di = 0;
      for (const p of this.dust[k]) {
        const age = world.t - p.born;
        if (age > p.life || age < 0) continue;
        p.x += p.vx * simDt;
        p.y += p.vy * simDt;
        p.z += p.vz * simDt;
        p.vy -= kind.grav * simDt;
        const d = 1 - kind.drag * simDt;
        p.vx *= d;
        p.vz *= d;
        buf[di * 3] = p.x;
        buf[di * 3 + 1] = p.y;
        buf[di * 3 + 2] = p.z;
        di++;
      }
      this.dustGeo[k].setDrawRange(0, di);
      this.dustGeo[k].attributes.position.needsUpdate = true;
    }

    // Haze: each puff grows and fades on its own clock, so the layer thickens
    // while fire is sustained and settles out on its own afterwards.
    for (const sp of this.haze) {
      if (!sp.visible) continue;
      const age = world.t - (sp.userData.born ?? 0);
      if (age < 0 || age > HAZE_LIFE) { sp.visible = false; continue; }
      const k = age / HAZE_LIFE;
      const dr = sp.userData.drift as number[];
      sp.position.x += dr[0] * simDt;
      sp.position.y += dr[1] * simDt;
      sp.position.z += dr[2] * simDt;
      // The puffs have to occupy hall VOLUME, not just the impact point: at a
      // 1.5-4 m radius the layer was real but covered too little of a wide
      // frame to read as haze at all. Overlap is what makes it visible, so the
      // puffs grow large and stay individually near-transparent.
      sp.scale.setScalar(2.5 + 6.5 * k);
      // Quick bloom-in, long settle-out. The exponent is what makes the layer
      // LINGER rather than vanish the moment fire stops: squared, the haze was
      // effectively gone two seconds into the wind-down.
      const env = Math.min(1, k / 0.09) * Math.pow(1 - k, 1.25);
      // B23: a puff that drifts up to the lens engulfs it. Measured: a 3.87 m
      // sprite at 1.0 m from the camera spans 336% of the frame width, and a
      // screen-aligned quad clipped by the near plane draws a hard straight
      // edge across everything behind it at every depth — which is exactly the
      // "sheet of frosted glass" artifact. Puffs fade out as they close in, so
      // one can never cover the lens no matter where the camera goes.
      let near = 1;
      if (camPos) {
        const d = sp.position.distanceTo(camPos);
        near = THREE.MathUtils.smoothstep(d - sp.scale.x * 0.5, 0.3, 2.2);
      }
      // `visible` stays purely lifetime-driven: clearing it here would retire
      // the puff for good (the loop skips invisible slots) and hand its slot
      // back to addHaze, so a puff would vanish permanently just because the
      // camera passed near it once.
      (sp.material as THREE.SpriteMaterial).opacity = (sp.userData.peak ?? 0.07) * env * near;
    }
    // headless-verification aid (no UI): how thick the haze layer currently
    // is. `stack` is the coverage a viewer sees where every live puff overlaps
    // — the number that actually governs whether the frame reads as hazed.
    let live = 0;
    let clear = 1;
    for (const sp of this.haze) {
      if (!sp.visible) continue;
      live++;
      clear *= 1 - (sp.material as THREE.SpriteMaterial).opacity;
    }
    (window as unknown as { __haze: { live: number; stack: number } }).__haze =
      { live, stack: +(1 - clear).toFixed(4) };

    // fade + shrink flashes (sim-time)
    for (const f of this.flashPool) {
      if (!f.visible) continue;
      const rem = (f.userData.untilSim ?? 0) - world.t;
      if (rem <= 0) {
        f.visible = false;
        continue;
      }
      const k = Math.min(1, rem / 0.028);
      f.scale.setScalar((f.userData.baseScale ?? 0.28) * (0.35 + 0.65 * k));
      // B23, same class as the haze: an additive quad right on the lens fills
      // the frame with white. Measured before the fix at 254% of frame width
      // from 0.14 m away. Flashes fade out as the camera closes on them.
      let near = 1;
      if (camPos) {
        near = THREE.MathUtils.smoothstep(f.position.distanceTo(camPos), 0.12, 0.5);
      }
      (f.material as THREE.SpriteMaterial).opacity = k * near;
    }
    for (const c of this.flashCones) {
      if (!c.visible) continue;
      const rem = (c.userData.untilSim ?? 0) - world.t;
      if (rem <= 0) { c.visible = false; continue; }
      const k = Math.min(1, rem / 0.028);
      c.scale.set(1, 0.5 + 0.5 * k, 1).multiplyScalar(c.userData.baseScale ?? 1);
      let near = 1;
      if (camPos) {
        near = THREE.MathUtils.smoothstep(c.position.distanceTo(camPos), 0.12, 0.5);
      }
      (c.material as THREE.MeshBasicMaterial).opacity = 0.75 * k * near;
    }
    for (const sp of this.spallPool) {
      if (!sp.visible) continue;
      const rem = (sp.userData.untilSim ?? 0) - world.t;
      if (rem <= 0) { sp.visible = false; continue; }
      const k = Math.min(1, rem / 0.05);
      let near = 1;
      if (camPos) near = THREE.MathUtils.smoothstep(sp.position.distanceTo(camPos), 0.12, 0.5);
      (sp.material as THREE.SpriteMaterial).opacity = 0.9 * k * k * near;
    }
    this.flashLight.intensity *= 0.72;
  }

  /**
   * B13 supplement: a bullet mark is a POCK, not a sticker.
   *
   * The old decal was a ~22 cm quad carrying a painted bullet-hole albedo
   * behind a smooth radial alpha ramp. Two things went wrong with that. The
   * radial ramp held ~0.85 alpha out to 60% of the radius, so the texture's
   * dark body covered a large disc at near-full opacity and the outline was a
   * perfect circle — it read as a sticker laid on the wall. And the painted
   * starburst is near-white, so every mark carried a bright cartoon star.
   *
   * Since B8 the cladding chunk is genuinely removed at the hit, so these
   * marks now almost always sit on exposed substrate. What belongs there is a
   * small pit in broken masonry: an irregular outline, a dark interior that
   * deepens toward the centre, a pale chipped rim where the aggregate broke,
   * and a few hairline cracks radiating past the rim. All of that is generated
   * in the shader from the same noise the cladding uses, so there is no
   * texture to mismatch and the outline is never a circle.
   *
   * One geometry and one material are shared by every mark; the per-mark
   * variation rides in on a uniform written in onBeforeRender, so hundreds of
   * marks stay a single program with no per-decal allocation.
   */
  private pockGeo = new THREE.PlaneGeometry(1, 1);
  private pockMat = Effects.makePockMat();

  private static makePockMat(): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      roughness: 1,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    // no map, so ask three for UVs explicitly
    m.defines = { ...(m.defines ?? {}), USE_UV: '' };
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
        attribute float aSeed;
        varying float vSeed;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSeed = aSeed;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        varying float vSeed;
        #define uSeed vSeed
        float pkHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float pkNoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(pkHash(i), pkHash(i + vec2(1.0, 0.0)), f.x),
                     mix(pkHash(i + vec2(0.0, 1.0)), pkHash(i + vec2(1.0)), f.x), f.y);
        }
        float pkFbm(vec2 p){
          return 0.55 * pkNoise(p) + 0.30 * pkNoise(p * 2.1) + 0.15 * pkNoise(p * 4.3);
        }`)
        .replace('#include <map_fragment>', `
        vec2 pkP = vUv - 0.5;
        float pkR = length(pkP) * 2.0;
        float pkA = atan(pkP.y, pkP.x);
        // irregular boundary: the rim wanders with angle, so no two marks
        // share a silhouette and none of them is round
        vec2 pkRing = vec2(cos(pkA), sin(pkA)) * 2.6 + uSeed;
        float pkEdge = 0.50 + 0.34 * pkFbm(pkRing);
        float pkFill = 1.0 - smoothstep(pkEdge * 0.80, pkEdge, pkR);
        // hairline cracks running out past the rim
        float pkSpoke = pow(abs(sin(pkA * 4.0 + pkFbm(pkRing * 0.7) * 9.0)), 42.0);
        float pkCrack = pkSpoke * smoothstep(pkEdge * 0.7, pkEdge * 0.9, pkR)
                      * (1.0 - smoothstep(pkEdge * 0.95, pkEdge * 2.1, pkR));
        float pkAlpha = max(pkFill, pkCrack * 0.9);
        if (pkAlpha < 0.03) discard;
        // Interior: a pit, so it is DARKER than the wall everywhere. The first
        // pass here lifted the mark above the surrounding stone — a bright
        // chipped rim over most of the disc plus pale crack spokes — and the
        // marks read as white lint rather than holes. The rim is now a thin
        // band at a fraction of the old strength, and the cracks are set to an
        // absolute dark rather than mixed toward one.
        float pkPit = 1.0 - smoothstep(0.0, pkEdge * 0.78, pkR);
        float pkGrain = pkFbm(pkP * 34.0 + uSeed * 3.0);
        vec3 pkCol = mix(vec3(0.115, 0.113, 0.104), vec3(0.014, 0.014, 0.013), pkPit);
        pkCol *= 0.78 + 0.44 * pkGrain;
        // a thin catch of light on the broken lip, only right at the boundary
        float pkRim = smoothstep(pkEdge * 0.86, pkEdge * 0.94, pkR)
                    * (1.0 - smoothstep(pkEdge * 0.94, pkEdge, pkR));
        pkCol += vec3(0.30, 0.295, 0.27) * pkRim * (0.35 + 0.65 * pkGrain);
        pkCol = mix(pkCol, vec3(0.020, 0.020, 0.019), pkCrack);
        diffuseColor.rgb = pkCol;
        diffuseColor.a *= pkAlpha;`);
    };
    m.customProgramCacheKey = () => 'pockB13';
    return m;
  }

  /** B22: the shaped ignition star. */
  private static makeFlashMat(): THREE.SpriteMaterial {
    const m = new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    m.onBeforeCompile = (shader) => {
      // three's sprite shader declares PER-MAP varyings (vMapUv, vAlphaMapUv)
      // rather than a generic vUv, so a patch that reaches for vUv does not
      // compile at all — and a material with no map has no uv varying of any
      // kind. Declaring our own is version-independent and works with or
      // without a texture.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
        varying vec2 vSprUv;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
        vSprUv = uv;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        varying vec2 vSprUv;
        float flHash(float a){ return fract(sin(a * 78.233) * 43758.5453); }`)
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        {
          vec2 fp = vSprUv - 0.5;
          float fr = length(fp) * 2.0;
          float fa = atan(fp.y, fp.x);
          // irregular spikes: a few sharp ones over a soft base, so no two
          // directions match and the star never reads as a clean asterisk
          float sp = 0.0;
          sp += pow(max(0.0, sin(fa * 3.0 + 0.7)), 24.0) * 0.85;
          sp += pow(max(0.0, sin(fa * 5.0 + 2.1)), 30.0) * 0.55;
          sp += pow(max(0.0, sin(fa * 8.0 + 4.3)), 40.0) * 0.35;
          float core = 1.0 - smoothstep(0.0, 0.30, fr);
          float star = sp * (1.0 - smoothstep(0.06, 1.0, fr));
          float a = clamp(core + star * 0.9, 0.0, 1.0);
          if (a < 0.02) discard;
          // hot white centre falling off to a warm edge
          vec3 hot = vec3(1.0, 0.97, 0.88);
          vec3 warm = vec3(1.0, 0.62, 0.22);
          diffuseColor.rgb *= mix(warm, hot, core);
          diffuseColor.a *= a;
        }`);
    };
    m.customProgramCacheKey = () => 'flashB22';
    return m;
  }

  /** Give the mark shaders access to the live damage grids (B20). */
  bindCladding(c: { damageTexFor(id: string): THREE.Texture | null }) {
    this.damageTex = (id) => c.damageTexFor(id);
    // any facing meshes built before the binding existed are stale
    for (const f of this.facing.values()) this.group.remove(f.mesh);
    this.facing.clear();
  }

  /**
   * B16: a round that lands on surviving polished stone.
   *
   * Distinct from the core pock by design: a pale spall ring where the
   * polished surface has flaked away, a small dark recessed pit at the centre,
   * and fine cracks running a short way into the intact facing. The pit is
   * deliberately NOT pure black — it is a shadowed recess, so it keeps a little
   * ambient and sits in the scene's grade rather than punching a hole in it.
   *
   * B20: the mark describes the FACING, so it is clipped against the same
   * damage grid the cladding reads. A mark that is half inside a later wound
   * shows only the half still sitting on stone; one whose stone is entirely
   * gone disappears. One mesh per slab, so each can bind its own grid.
   */
  private static makeSpallMat(damage: THREE.Texture): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    m.defines = { ...(m.defines ?? {}), USE_UV: '' };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDamage = { value: damage };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
        attribute float aSeed;
        attribute vec2 aSlabUv;
        attribute vec2 aSlabExt;
        varying float vSeed;
        varying vec2 vSlabUv;
        varying vec2 vSlabExt;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSeed = aSeed; vSlabUv = aSlabUv; vSlabExt = aSlabExt;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        uniform sampler2D uDamage;
        varying float vSeed;
        varying vec2 vSlabUv;
        varying vec2 vSlabExt;
        float spHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float spNoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(spHash(i), spHash(i + vec2(1.0, 0.0)), f.x),
                     mix(spHash(i + vec2(0.0, 1.0)), spHash(i + vec2(1.0)), f.x), f.y);
        }
        float spFbm(vec2 p){ return 0.6 * spNoise(p) + 0.4 * spNoise(p * 2.3); }`)
        .replace('#include <map_fragment>', `
        // B20: clip against the live damage grid — no part of a facing mark
        // may survive where the facing itself is gone
        vec2 spSlab = vSlabUv + (vUv - 0.5) * vSlabExt;
        if (texture2D(uDamage, spSlab).r > 0.5) discard;

        vec2 spP = vUv - 0.5;
        float spR = length(spP) * 2.0;
        float spA = atan(spP.y, spP.x);
        vec2 spRing = vec2(cos(spA), sin(spA)) * 2.2 + vSeed;
        float spEdge = 0.56 + 0.30 * spFbm(spRing);
        // soft falloff, never a hard circular cutoff
        float spFill = 1.0 - smoothstep(spEdge * 0.55, spEdge, spR);
        // fine cracks running a short way into the intact stone
        float spSpoke = pow(abs(sin(spA * 5.0 + spFbm(spRing * 0.6) * 8.0)), 46.0);
        float spCrack = spSpoke * smoothstep(spEdge * 0.5, spEdge * 0.8, spR)
                      * (1.0 - smoothstep(spEdge * 0.9, spEdge * 1.8, spR));
        float spAlpha = max(spFill, spCrack * 0.55);
        if (spAlpha < 0.03) discard;

        float spGrain = spFbm(spP * 30.0 + vSeed * 2.0);
        // Pale spall: the polished skin has flaked off, exposing duller stone
        // underneath. Toned down from the first pass, which was bright enough
        // that the crack spokes read as a white starburst — the exact tell the
        // retired painted decal was rejected for.
        vec3 spCol = vec3(0.40, 0.40, 0.375) * (0.70 + 0.5 * spGrain);
        // the pit: recessed and shadowed, but still lit — not a black hole
        float spPit = 1.0 - smoothstep(0.0, spEdge * 0.30, spR);
        spCol = mix(spCol, vec3(0.075, 0.075, 0.07), spPit * 0.92);
        // cracks go fully dark well before their alpha peaks, so they read as
        // fissures rather than as bright rays
        spCol = mix(spCol, vec3(0.05, 0.05, 0.045), sqrt(spCrack));
        diffuseColor.rgb = spCol;
        diffuseColor.a *= spAlpha;`);
    };
    m.customProgramCacheKey = () => 'spallB16';
    return m;
  }

  /**
   * A facing mark is placed from the SLAB's own basis rather than with
   * lookAt + rotateZ, so the quad's local X maps exactly to the face's u axis
   * and its local Y to v. That exactness is what lets the fragment shader turn
   * its own uv straight into a damage-grid lookup and clip the mark against
   * the wound — with an arbitrary roll the mapping would be wrong and the mark
   * would clip against the wrong cells. Per-mark variety rides in on the seed
   * instead of on the quad's rotation.
   */
  private addFacingDecal(
    d: { pos: number[]; size: number; rot: number; slab: string; su: number; sv: number },
    slab: { axis: 0 | 1 | 2; sign: 1 | -1; uAxis: 0 | 1 | 2; w: number; h: number },
  ): boolean {
    const tex = this.damageTex?.(d.slab) ?? null;
    if (!tex) return false;
    let f = this.facing.get(d.slab);
    if (!f) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const seed = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FACING_PER_SLAB), 1);
      const uv = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FACING_PER_SLAB * 2), 2);
      const ext = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FACING_PER_SLAB * 2), 2);
      geo.setAttribute('aSeed', seed);
      geo.setAttribute('aSlabUv', uv);
      geo.setAttribute('aSlabExt', ext);
      const mesh = new THREE.InstancedMesh(geo, Effects.makeSpallMat(tex), MAX_FACING_PER_SLAB);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `spall:${d.slab}`;
      this.group.add(mesh);
      f = { mesh, seed, uv, ext, n: 0 };
      this.facing.set(d.slab, f);
    }
    if (f.n >= MAX_FACING_PER_SLAB) return true;
    const i = f.n;

    // exact face basis: local X -> u, local Y -> world up, local Z -> normal
    const n = new THREE.Vector3();
    n.setComponent(slab.axis, slab.sign);
    const u = new THREE.Vector3();
    u.setComponent(slab.uAxis, 1);
    const v = new THREE.Vector3(0, 1, 0);
    const basis = new THREE.Matrix4().makeBasis(u, v, n);
    const o = this.dummy;
    o.quaternion.setFromRotationMatrix(basis);
    o.position.set(
      d.pos[0] + n.x * 0.004,
      d.pos[1] + n.y * 0.004,
      d.pos[2] + n.z * 0.004,
    );
    o.scale.setScalar(d.size);
    o.updateMatrix();
    f.mesh.setMatrixAt(i, o.matrix);
    f.seed.setX(i, (d.rot * 5.13 + d.pos[1] * 9.7) % 10);
    f.uv.setXY(i, d.su, d.sv);
    // the quad's extent expressed in slab-uv, so the shader can map its own
    // uv into the damage grid
    f.ext.setXY(i, d.size / (slab.w * 0.03), d.size / (slab.h * 0.03));
    f.n = i + 1;
    f.mesh.count = f.n;
    f.mesh.instanceMatrix.needsUpdate = true;
    f.seed.needsUpdate = true;
    f.uv.needsUpdate = true;
    f.ext.needsUpdate = true;
    return true;
  }

  private addDecal(d: { pos: number[]; normal: number[]; size: number; kind: string; rot: number }) {
    const i = this.decalCount;
    if (i >= MAX_DECALS) return;
    const o = this.dummy;
    const off = 0.006;
    o.position.set(
      d.pos[0] + d.normal[0] * off,
      d.pos[1] + d.normal[1] * off,
      d.pos[2] + d.normal[2] * off,
    );
    o.lookAt(
      d.pos[0] + d.normal[0] * 2,
      d.pos[1] + d.normal[1] * 2,
      d.pos[2] + d.normal[2] * 2,
    );
    o.rotateZ(d.rot);
    o.scale.setScalar(d.size);
    o.updateMatrix();
    this.decalMesh.setMatrixAt(i, o.matrix);
    this.decalSeed.setX(i, (d.rot * 7.31 + d.pos[0] * 3.7 + d.pos[1] * 11.3) % 10);
    this.decalMesh.count = i + 1;
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalSeed.needsUpdate = true;
  }

}
