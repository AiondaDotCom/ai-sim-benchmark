import * as THREE from 'three';
import { mulberry32 } from '../sim/rng';
import type { Simulation } from '../sim/simulation';

const DROP_COUNT = 2200;
const CLOUD_HEIGHT = 102;
const FALL_SPEED = 95;
const STREAK = 3.2;

/** Visualises the storm: a drifting cloud bank and falling rain streaks. */
export class WeatherView {
  readonly object = new THREE.Group();
  private readonly sim: Simulation;
  private readonly cloud = new THREE.Group();
  private readonly cloudMaterial: THREE.MeshLambertMaterial;
  private readonly rain: THREE.LineSegments;
  private readonly rainMaterial: THREE.LineBasicMaterial;
  private readonly positions: Float32Array;
  /** Per drop: offset x, offset z (in sigmas), current height, speed factor. */
  private readonly drops: Float32Array;
  private readonly white = new THREE.Color(0xffffff);
  private readonly grey = new THREE.Color(0xb4bec9);

  constructor(sim: Simulation) {
    this.sim = sim;
    const rng = mulberry32(sim.terrain.seed ^ 0x2545f491);
    const gauss = () => {
      // Sum of uniforms: cheap, bounded approximation of a normal distribution.
      return (rng() + rng() + rng() + rng() - 2) * 1.2;
    };

    this.cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb0c2, emissiveIntensity: 0.55, fog: true });
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let n = 0; n < 34; n++) {
      const mesh = new THREE.Mesh(puff, this.cloudMaterial);
      const r = 7 + rng() * 9;
      mesh.position.set(gauss() * 26, gauss() * 2.2, gauss() * 20);
      mesh.scale.set(r * 1.4, r * 0.55, r * 1.25);
      mesh.castShadow = true;
      this.cloud.add(mesh);
    }
    this.cloud.position.y = CLOUD_HEIGHT;
    this.object.add(this.cloud);

    this.drops = new Float32Array(DROP_COUNT * 4);
    this.positions = new Float32Array(DROP_COUNT * 6);
    for (let n = 0; n < DROP_COUNT; n++) {
      this.drops[n * 4] = gauss();
      this.drops[n * 4 + 1] = gauss();
      this.drops[n * 4 + 2] = rng() * CLOUD_HEIGHT;
      this.drops[n * 4 + 3] = 0.75 + rng() * 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(this.positions, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xe6f3ff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      fog: true,
    });
    this.rain = new THREE.LineSegments(geometry, this.rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 3;
    this.object.add(this.rain);
  }

  update(deltaSeconds: number): void {
    const { storm, time, rainMultiplier } = this.sim;
    const [cx, cz] = storm.position(time);
    const strength = Math.min(1, storm.intensity(time) * Math.min(1.5, rainMultiplier));

    this.cloud.visible = rainMultiplier > 0;
    this.cloud.position.x = cx;
    this.cloud.position.z = cz;
    const swell = 0.72 + 0.28 * strength;
    this.cloud.scale.set(swell, swell, swell);
    this.cloudMaterial.color.copy(this.white).lerp(this.grey, strength * 0.8);

    const active = Math.round(DROP_COUNT * strength);
    const spread = storm.sigma * 0.8;
    const fall = FALL_SPEED * deltaSeconds;
    const p = this.positions;
    const d = this.drops;
    for (let n = 0; n < active; n++) {
      let h = d[n * 4 + 2] - fall * d[n * 4 + 3];
      if (h < 0) h += CLOUD_HEIGHT - 4;
      d[n * 4 + 2] = h;
      const x = cx + d[n * 4] * spread + (CLOUD_HEIGHT - h) * 0.05;
      const z = cz + d[n * 4 + 1] * spread;
      p[n * 6] = x;
      p[n * 6 + 1] = h + STREAK;
      p[n * 6 + 2] = z;
      p[n * 6 + 3] = x + 0.16;
      p[n * 6 + 4] = h;
      p[n * 6 + 5] = z;
    }
    this.rain.geometry.setDrawRange(0, active * 2);
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rainMaterial.opacity = 0.18 + 0.3 * strength;
  }
}
