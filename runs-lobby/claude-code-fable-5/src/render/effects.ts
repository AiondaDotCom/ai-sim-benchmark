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
const MAX_DEBRIS = 4000;
const MAX_DUST = 4000;

interface DustP {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  born: number; life: number;
}

export class Effects {
  group = new THREE.Group();
  private casingMesh: THREE.InstancedMesh;
  private debrisMeshes: THREE.InstancedMesh[];
  private decalGroup = new THREE.Group();
  private decalCount = 0;
  private gunMeshes: THREE.Group[] = [];
  private dust: DustP[] = [];
  private dustGeo: THREE.BufferGeometry;
  private dustPts: THREE.Points;
  private dustPos: Float32Array;
  private flashPool: THREE.Sprite[] = [];
  private flashLight: THREE.PointLight;
  private tracerMesh: THREE.InstancedMesh;
  private headMesh!: THREE.InstancedMesh;
  private tracerLights: THREE.PointLight[] = [];
  private ringPool: { mesh: THREE.Mesh; born: number }[] = [];
  private wakeSpawnDist = new Map<object, number>();
  private rng: Rng;
  private dummy = new THREE.Object3D();
  // A4: brief stylized blood mist + persistent floor stains
  private blood: DustP[] = [];
  private bloodGeo: THREE.BufferGeometry;
  private bloodPos: Float32Array;
  private bloodPts: THREE.Points;
  private stainCount = 0;
  private stainGroup = new THREE.Group();

  constructor(private mats: Mats, seed: number) {
    this.rng = mulberry32(seed ^ 0x51ed270b);

    const casingGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.036, 6);
    this.casingMesh = new THREE.InstancedMesh(casingGeo, mats.brass, MAX_CASINGS);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    this.group.add(this.casingMesh);

    // three debris kinds: marble chip (white), substrate chunk, dark fleck
    const chipGeo = new THREE.DodecahedronGeometry(0.5, 0);
    // pale chips so destruction reads light-on-dark against the granite
    const debrisMats = [
      new THREE.MeshStandardMaterial({ map: mats.textures.substrate, color: 0xe2dfd4, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: mats.textures.substrate, color: 0xcbc8bc, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0xb3b6ab, roughness: 0.9 }),
    ];
    this.debrisMeshes = debrisMats.map((m) => {
      const im = new THREE.InstancedMesh(chipGeo, m, Math.ceil(MAX_DEBRIS / 3));
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });

    this.group.add(this.decalGroup);

    // dust points
    this.dustPos = new Float32Array(MAX_DUST * 3);
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      map: mats.textures.dust,
      color: 0xeef2e6,
      size: 0.26,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dustPts = new THREE.Points(this.dustGeo, dustMat);
    this.dustPts.frustumCulled = false;
    this.group.add(this.dustPts);

    // A4 blood mist points (dark desaturated red, reads against the teal)
    this.bloodPos = new Float32Array(600 * 3);
    this.bloodGeo = new THREE.BufferGeometry();
    this.bloodGeo.setAttribute('position', new THREE.BufferAttribute(this.bloodPos, 3));
    const bloodMat = new THREE.PointsMaterial({
      map: mats.textures.dust,
      color: 0x6e1a15,
      size: 0.22,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.bloodPts = new THREE.Points(this.bloodGeo, bloodMat);
    this.bloodPts.frustumCulled = false;
    this.group.add(this.bloodPts);
    this.group.add(this.stainGroup);

    // muzzle flashes
    const flashMat = new THREE.SpriteMaterial({
      map: mats.textures.dust,
      color: 0xffe9a8,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(flashMat.clone());
      s.scale.setScalar(0.42);
      s.visible = false;
      this.group.add(s);
      this.flashPool.push(s);
    }
    this.flashLight = new THREE.PointLight(0xffcc77, 0, 7);
    this.group.add(this.flashLight);

    // tracers: additive light trail + hot glowing head (A5)
    const tracerGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffdf9a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, 64);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    this.group.add(this.tracerMesh);
    const headGeo = new THREE.SphereGeometry(0.028, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3cf });
    this.headMesh = new THREE.InstancedMesh(headGeo, headMat, 64);
    this.headMesh.count = 0;
    this.headMesh.frustumCulled = false;
    this.group.add(this.headMesh);
    // pooled lights that ride the projectiles nearest the camera
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 4.5, 2);
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
    this.decalGroup.clear();
    this.decalCount = 0;
    for (const g of this.gunMeshes) this.group.remove(g);
    this.gunMeshes = [];
    this.dust = [];
    this.blood = [];
    this.stainGroup.clear();
    this.stainCount = 0;
    this.tracerMesh.count = 0;
    this.headMesh.count = 0;
    this.wakeSpawnDist = new Map();
    for (const r of this.ringPool) r.mesh.visible = false;
    for (const l of this.tracerLights) l.intensity = 0;
  }

  /** React to freshly drained events (muzzle flash, dust bursts). */
  onEvents(events: SimEvent[], flashScale = 1) {
    for (const e of events) {
      if (e.type === 'SHOT') {
        const s = this.flashPool.find((f) => !f.visible);
        if (s) {
          s.position.set(e.pos[0] + e.dir[0] * 0.25, e.pos[1] + e.dir[1] * 0.25, e.pos[2] + e.dir[2] * 0.25);
          s.visible = true;
          // sim-time lifetime: the flash hangs through slow motion
          s.userData.untilSim = e.t + 0.05;
          s.scale.setScalar(e.weapon === 'smg' ? 0.34 : 0.46);
        }
        this.flashLight.position.set(e.pos[0], e.pos[1], e.pos[2]);
        this.flashLight.intensity = 14;
        // muzzle smoke: a few slow pale wisps drifting off the barrel (A5)
        for (let i = 0; i < 3; i++) {
          if (this.dust.length >= MAX_DUST) this.dust.shift();
          this.dust.push({
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
      if (e.type === 'BLOOD') {
        // brief dark-red mist, film-style: disperses within a second
        for (let i = 0; i < 16; i++) {
          if (this.blood.length >= 600) this.blood.shift();
          this.blood.push({
            x: e.pos[0] + rand(this.rng, -0.12, 0.12),
            y: e.pos[1] + rand(this.rng, -0.15, 0.15),
            z: e.pos[2] + rand(this.rng, -0.12, 0.12),
            vx: rand(this.rng, -1.1, 1.1),
            vy: rand(this.rng, -0.4, 0.9),
            vz: rand(this.rng, -1.1, 1.1),
            born: e.t,
            life: rand(this.rng, 0.35, 0.8),
          });
        }
      }
      if (e.type === 'IMPACT_MARBLE') {
        // large soft clouds of pale dust that hang and drift
        const n = 13;
        for (let i = 0; i < n; i++) {
          if (this.dust.length >= MAX_DUST) this.dust.shift();
          this.dust.push({
            x: e.pos[0] + e.normal[0] * 0.05,
            y: e.pos[1] + e.normal[1] * 0.05,
            z: e.pos[2] + e.normal[2] * 0.05,
            vx: e.normal[0] * rand(this.rng, 0.25, 1.2) + rand(this.rng, -0.5, 0.5),
            vy: e.normal[1] * rand(this.rng, 0.2, 0.7) + rand(this.rng, 0.05, 0.55),
            vz: e.normal[2] * rand(this.rng, 0.25, 1.2) + rand(this.rng, -0.5, 0.5),
            born: e.t,
            life: rand(this.rng, 2.2, 5.5),
          });
        }
      }
    }
  }

  /** Sync persistent visuals with the world; simT drives dust motion. */
  update(world: World, simDt: number, camPos?: THREE.Vector3) {
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

    // debris (split by kind across the three instanced meshes)
    const counts = [0, 0, 0];
    for (const d of world.debris) {
      const k = d.kind % 3;
      const mesh = this.debrisMeshes[k];
      if (counts[k] >= (mesh.instanceMatrix.count ?? 0)) continue;
      this.dummy.position.set(d.pos[0], d.pos[1], d.pos[2]);
      this.dummy.rotation.set(d.angle[0], d.angle[1], d.angle[2]);
      this.dummy.scale.setScalar(d.size);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(counts[k]++, this.dummy.matrix);
    }
    this.debrisMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });

    // decals: append the new ones
    while (this.decalCount < world.decals.length) {
      this.addDecal(world.decals[this.decalCount]);
      this.decalCount++;
    }

    // dropped guns
    while (this.gunMeshes.length < world.droppedGuns.length) {
      const g = new THREE.Group();
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.24), this.mats.gunmetal);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.05), this.mats.black);
      grip.position.set(0, -0.04, 0.06);
      grip.rotation.x = 0.3;
      g.add(slide, grip);
      this.group.add(g);
      this.gunMeshes.push(g);
    }
    world.droppedGuns.forEach((gun, i) => {
      const mesh = this.gunMeshes[i];
      mesh.position.set(gun.pos[0], gun.pos[1] + 0.02, gun.pos[2]);
      mesh.rotation.set(gun.resting ? Math.PI / 2 : 0, gun.yaw, 0);
    });

    // tracers from live projectiles: trail + glowing head + local light (A5)
    let tc = 0;
    const heads: { x: number; y: number; z: number; d2: number }[] = [];
    for (const p of world.projectiles) {
      if (p.done || tc >= 64) continue;
      const dist = (world.t - p.born) * p.speed;
      const head = Math.min(dist, p.hitDist);
      const tail = Math.max(0, head - 1.6);
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
      // hot head
      this.dummy.position.set(hx, hy, hz);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(p.wake ? 1.5 : 1);
      this.dummy.updateMatrix();
      this.headMesh.setMatrixAt(tc, this.dummy.matrix);
      if (camPos) {
        const dx = hx - camPos.x, dy = hy - camPos.y, dz = hz - camPos.z;
        heads.push({ x: hx, y: hy, z: hz, d2: dx * dx + dy * dy + dz * dz });
      }
      // spawn air-wake rings behind a dodge near-miss round
      if (p.wake) {
        let last = this.wakeSpawnDist.get(p) ?? 0;
        while (last + 0.55 < head) {
          last += 0.55;
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
          slot.mesh.scale.setScalar(1);
        }
        this.wakeSpawnDist.set(p, last);
      }
      tc++;
    }
    this.tracerMesh.count = tc;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.count = tc;
    this.headMesh.instanceMatrix.needsUpdate = true;
    // ride the 4 nearest heads with real lights
    heads.sort((a, b) => a.d2 - b.d2);
    this.tracerLights.forEach((l, i) => {
      if (i < heads.length) {
        l.position.set(heads[i].x, heads[i].y, heads[i].z);
        l.intensity = 2.6;
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
      r.mesh.scale.setScalar(1 + Math.min(age * 4.2, 3.6));
      mat.opacity = 0.4 * Math.max(0, 1 - age / 1.1);
    }

    // A4: persistent floor stains under downed defenders (never removed)
    while (this.stainCount < world.bloodStains.length) {
      const s = world.bloodStains[this.stainCount++];
      const mat = new THREE.MeshStandardMaterial({
        map: this.mats.textures.blood,
        alphaMap: this.mats.textures.bloodAlpha,
        transparent: true,
        opacity: 0.95,
        color: 0xa53a2e,
        roughness: 0.3,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.size, s.size), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = s.rot;
      m.position.set(s.pos[0], s.pos[1], s.pos[2]);
      this.stainGroup.add(m);
    }

    // blood mist drift (sim time → hangs in slow-mo, settles fast)
    let bi = 0;
    for (const p of this.blood) {
      const age = world.t - p.born;
      if (age > p.life || age < 0) continue;
      p.x += p.vx * simDt;
      p.y += p.vy * simDt;
      p.z += p.vz * simDt;
      p.vy -= 2.2 * simDt;
      p.vx *= 1 - 1.8 * simDt;
      p.vz *= 1 - 1.8 * simDt;
      this.bloodPos[bi * 3] = p.x;
      this.bloodPos[bi * 3 + 1] = p.y;
      this.bloodPos[bi * 3 + 2] = p.z;
      bi++;
    }
    this.bloodGeo.setDrawRange(0, bi);
    this.bloodGeo.attributes.position.needsUpdate = true;

    // dust drift (moves in sim time → hangs during slow-mo)
    let di = 0;
    for (const p of this.dust) {
      const age = world.t - p.born;
      if (age > p.life || age < 0) continue;
      p.x += p.vx * simDt;
      p.y += p.vy * simDt;
      p.z += p.vz * simDt;
      p.vy -= 0.25 * simDt;
      p.vx *= 1 - 0.4 * simDt;
      p.vz *= 1 - 0.4 * simDt;
      this.dustPos[di * 3] = p.x;
      this.dustPos[di * 3 + 1] = p.y;
      this.dustPos[di * 3 + 2] = p.z;
      di++;
    }
    this.dustGeo.setDrawRange(0, di);
    this.dustGeo.attributes.position.needsUpdate = true;

    // fade flashes (sim-time)
    for (const f of this.flashPool) {
      if (f.visible && world.t > (f.userData.untilSim ?? 0)) f.visible = false;
    }
    this.flashLight.intensity *= 0.72;
  }

  private addDecal(d: { pos: number[]; normal: number[]; size: number; kind: string; rot: number }) {
    const mk = (mat: THREE.Material, size: number, offset: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.position.set(
        d.pos[0] + d.normal[0] * offset,
        d.pos[1] + d.normal[1] * offset,
        d.pos[2] + d.normal[2] * offset,
      );
      m.lookAt(
        d.pos[0] + d.normal[0] * 2,
        d.pos[1] + d.normal[1] * 2,
        d.pos[2] + d.normal[2] * 2,
      );
      m.rotateZ(d.rot);
      this.decalGroup.add(m);
      return m;
    };
    if (d.kind === 'crater') {
      // blown-out veneer: substrate patch + additive crack ring
      const sub = new THREE.MeshStandardMaterial({
        map: this.mats.textures.substrate,
        alphaMap: this.mats.textures.radialAlpha,
        transparent: true,
        roughness: 1,
        color: 0xd8d5c9,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        depthWrite: false,
      });
      mk(sub, d.size, 0.012);
      const crack = new THREE.MeshBasicMaterial({
        map: this.mats.textures.crack,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      mk(crack, d.size * 1.12, 0.016);
    } else {
      const hole = new THREE.MeshStandardMaterial({
        map: this.mats.textures.bulletHole,
        alphaMap: this.mats.textures.radialAlpha,
        transparent: true,
        opacity: 0.95,
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        depthWrite: false,
      });
      mk(hole, d.size, 0.01);
    }
  }
}
