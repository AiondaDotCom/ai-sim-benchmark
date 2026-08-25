import * as THREE from 'three';

/**
 * A lightweight, cosmetic rain effect: a field of short falling streaks over
 * the island. It does not feed the simulation — it simply makes the ambient
 * rainfall (which the simulation applies to every cell) visible in the
 * animation. Purely a function of elapsed time; no interactivity, no assets.
 */
export class RainEffect {
  readonly object: THREE.LineSegments;

  private count: number;
  private xs: Float32Array;
  private zs: Float32Array;
  private ys: Float32Array;
  private speeds: Float32Array;
  private positions: Float32Array;
  private material: THREE.LineBasicMaterial;
  private halfWidth: number;
  private top: number;
  private bottom: number;
  private streak: number;
  private wind: number;

  constructor(opts: { count?: number; halfWidth?: number; top?: number; bottom?: number; streak?: number; wind?: number } = {}) {
    this.count = opts.count ?? 1100;
    this.halfWidth = opts.halfWidth ?? 52;
    this.top = opts.top ?? 55;
    this.bottom = opts.bottom ?? -2;
    this.streak = opts.streak ?? 1.5;
    this.wind = opts.wind ?? 1.5;

    this.xs = new Float32Array(this.count);
    this.zs = new Float32Array(this.count);
    this.ys = new Float32Array(this.count);
    this.speeds = new Float32Array(this.count);
    this.positions = new Float32Array(this.count * 6);
    for (let k = 0; k < this.count; k++) this.reset(k, true);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // A static, generous bound so the moving drops are never frustum-culled.
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, (this.top + this.bottom) / 2, 0),
      this.halfWidth * 2 + this.top
    );

    this.material = new THREE.LineBasicMaterial({
      color: 0xcfe8f5,
      transparent: true,
      opacity: 0.18,
      fog: true
    });

    this.object = new THREE.LineSegments(geometry, this.material);
    this.object.name = 'rain';
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
    this.writePositions();
  }

  /** Scale the visual intensity with the rainfall; 0 hides the rain entirely. */
  setIntensity(rain: number): void {
    this.material.opacity = Math.min(0.6, 0.18 * rain);
  }

  private reset(k: number, scatterY: boolean): void {
    this.xs[k] = (Math.random() * 2 - 1) * this.halfWidth;
    this.zs[k] = (Math.random() * 2 - 1) * this.halfWidth;
    this.ys[k] = scatterY ? this.bottom + Math.random() * (this.top - this.bottom) : this.top;
    this.speeds[k] = 30 + Math.random() * 15;
  }

  private writePositions(): void {
    for (let k = 0; k < this.count; k++) {
      const i = k * 6;
      this.positions[i] = this.xs[k];
      this.positions[i + 1] = this.ys[k];
      this.positions[i + 2] = this.zs[k];
      this.positions[i + 3] = this.xs[k] - this.wind * 0.06;
      this.positions[i + 4] = this.ys[k] - this.streak;
      this.positions[i + 5] = this.zs[k];
    }
  }

  /** Advance the rain by `dt` seconds. */
  update(dt: number): void {
    for (let k = 0; k < this.count; k++) {
      this.ys[k] -= this.speeds[k] * dt;
      this.xs[k] += this.wind * dt;
      if (this.ys[k] - this.streak < this.bottom) this.reset(k, false);
    }
    this.writePositions();
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
