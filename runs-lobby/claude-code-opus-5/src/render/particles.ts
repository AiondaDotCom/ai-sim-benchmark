/** Instanced rendering for everything the fight leaves lying on the marble:
 *  shell casings, marble and substrate fragments, discarded weapons, plus the
 *  volatile dust, sparks and tracers. */
import * as THREE from 'three';
import type { World } from '../sim/world.ts';
import type { TextureSet } from './textures.ts';

const KIND_COLORS = [
  new THREE.Color(0xe9ebe6), // 0 polished marble veneer
  new THREE.Color(0x8f918c), // 1 rough substrate
  new THREE.Color(0xc9a227), // 2 brass (casings pool)
  new THREE.Color(0x1a1c1f), // 3 discarded weapon
];

export class ParticleViews {
  readonly group = new THREE.Group();
  private readonly casings: THREE.InstancedMesh;
  private readonly debris: THREE.InstancedMesh;
  private readonly tracers: THREE.InstancedMesh;
  private readonly dust: THREE.Points;
  private readonly sparks: THREE.Points;
  private readonly dustPos: Float32Array;
  private readonly dustSize: Float32Array;
  private readonly dustAlpha: Float32Array;
  private readonly sparkPos: Float32Array;
  private readonly sparkSize: Float32Array;
  private readonly sparkAlpha: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private casingsDrawn = 0;
  private debrisDrawn = 0;

  constructor(world: World, tex: TextureSet) {
    const brass = new THREE.MeshStandardMaterial({
      map: tex.brass,
      color: 0xd9ab3c,
      roughness: 0.24,
      metalness: 0.95,
    });
    const stone = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05 });

    this.casings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), brass, world.casings.capacity);
    this.casings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casings.frustumCulled = false;
    this.casings.count = 0;
    this.casings.castShadow = false;

    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, world.debris.capacity);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(world.debris.capacity * 3),
      3,
    );
    this.debris.frustumCulled = false;
    this.debris.count = 0;
    this.debris.castShadow = true;

    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe9b0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.009, 0.009, 1), tracerMat, 400);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;

    const mkPoints = (
      cap: number,
      map: THREE.Texture,
      color: number,
      blending: THREE.Blending,
      base: number,
    ) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(cap * 3);
      const size = new Float32Array(cap);
      const alpha = new Float32Array(cap);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
      geo.setDrawRange(0, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uColor: { value: new THREE.Color(color) },
          uScale: { value: base },
        },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aAlpha;
          varying float vAlpha;
          uniform float uScale;
          void main() {
            vAlpha = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = uScale * aSize * 300.0 / max(-mv.z, 0.1);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            vec4 t = texture2D(uMap, gl_PointCoord);
            float a = max(max(t.r, t.g), t.b) * vAlpha;
            if (a < 0.004) discard;
            gl_FragColor = vec4(uColor * (0.55 + t.r * 0.9), a);
          }`,
        transparent: true,
        depthWrite: false,
        blending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      return { pts, pos, size, alpha };
    };

    const d = mkPoints(world.dust.capacity, tex.dust, 0xcfd8d0, THREE.NormalBlending, 1.0);
    this.dust = d.pts;
    this.dustPos = d.pos;
    this.dustSize = d.size;
    this.dustAlpha = d.alpha;
    const sp = mkPoints(world.dust.capacity, tex.spark, 0xffcf80, THREE.AdditiveBlending, 1.0);
    this.sparks = sp.pts;
    this.sparkPos = sp.pos;
    this.sparkSize = sp.size;
    this.sparkAlpha = sp.alpha;

    this.group.add(this.casings, this.debris, this.tracers, this.dust, this.sparks);
  }

  /** Called when the demo loops. */
  reset(): void {
    this.casingsDrawn = 0;
    this.debrisDrawn = 0;
  }

  update(world: World): void {
    // --- casings: only new instances need a full matrix rebuild -------------
    const c = world.casings;
    for (let i = 0; i < c.count; i++) {
      if (i < this.casingsDrawn && c.resting[i]) continue;
      this.e.set(c.rx[i], c.ry[i], c.rz[i]);
      this.q.setFromEuler(this.e);
      this.v.set(c.px[i], c.py[i], c.pz[i]);
      this.s.set(c.sx[i], c.sy[i], c.sz[i]);
      this.m.compose(this.v, this.q, this.s);
      this.casings.setMatrixAt(i, this.m);
    }
    this.casings.count = c.count;
    this.casings.instanceMatrix.needsUpdate = true;
    this.casingsDrawn = c.count;

    const d = world.debris;
    for (let i = 0; i < d.count; i++) {
      if (i >= this.debrisDrawn) {
        const col = KIND_COLORS[d.kind[i]] ?? KIND_COLORS[1];
        this.debris.setColorAt(i, col);
      } else if (d.resting[i]) continue;
      this.e.set(d.rx[i], d.ry[i], d.rz[i]);
      this.q.setFromEuler(this.e);
      this.v.set(d.px[i], d.py[i], d.pz[i]);
      this.s.set(d.sx[i], d.sy[i], d.sz[i]);
      this.m.compose(this.v, this.q, this.s);
      this.debris.setMatrixAt(i, this.m);
    }
    this.debris.count = d.count;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    this.debrisDrawn = d.count;

    // --- tracers -----------------------------------------------------------
    let n = 0;
    for (const b of world.bullets) {
      if (n >= this.tracers.count + 400) break;
      const len = Math.min(0.85, b.travelled);
      const back = b.travelled - len * 0.5;
      this.v.set(b.x + b.dx * back, b.y + b.dy * back, b.z + b.dz * back);
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(b.dx, b.dy, b.dz));
      this.s.set(1, 1, len);
      this.m.compose(this.v, this.q, this.s);
      this.tracers.setMatrixAt(n++, this.m);
      if (n >= 400) break;
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;

    // --- dust and sparks ---------------------------------------------------
    const p = world.dust;
    let nd = 0;
    let ns = 0;
    for (let i = 0; i < p.count; i++) {
      const life = p.life[i];
      const age = p.age[i];
      if (age >= life) continue;
      const k = age / life;
      if (p.kind[i] === 0) {
        const a = Math.min(1, k * 6) * (1 - k) * 0.5;
        this.dustPos[nd * 3] = p.px[i];
        this.dustPos[nd * 3 + 1] = p.py[i];
        this.dustPos[nd * 3 + 2] = p.pz[i];
        this.dustSize[nd] = p.size[i] * (1 + k * 2.4);
        this.dustAlpha[nd] = a;
        nd++;
      } else {
        this.sparkPos[ns * 3] = p.px[i];
        this.sparkPos[ns * 3 + 1] = p.py[i];
        this.sparkPos[ns * 3 + 2] = p.pz[i];
        this.sparkSize[ns] = p.size[i] * (1 - k * 0.6);
        this.sparkAlpha[ns] = (1 - k) * 1.2;
        ns++;
      }
    }
    this.pushPoints(this.dust, nd);
    this.pushPoints(this.sparks, ns);
  }

  private pushPoints(pts: THREE.Points, n: number): void {
    const g = pts.geometry;
    g.setDrawRange(0, n);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}
