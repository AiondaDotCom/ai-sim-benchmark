/**
 * Autonomous camera.
 *
 * There are no controls of any kind — the camera flies itself so a screen
 * recording is usable straight out of the browser. The motion is the sum of a
 * few slow, mutually prime sine waves, which never repeats visibly and never
 * jerks: a steady orbit, a breathing radius, a rising/falling altitude and a
 * gently drifting look-at target.
 */

import * as THREE from 'three';

export interface CameraRigOptions {
  /** Radians per second of orbit. */
  orbitSpeed?: number;
  /** Mean orbit radius in world units. */
  radius?: number;
  /** Peak-to-mean variation of the orbit radius. */
  radiusVariation?: number;
  /** Mean camera altitude above the terrain base. */
  height?: number;
  /** Peak-to-mean variation of the altitude. */
  heightVariation?: number;
  /** Y coordinate the camera aims at. */
  targetHeight?: number;
  /** Starting orbit angle in radians. */
  startAngle?: number;
}

const DEFAULTS: Required<CameraRigOptions> = {
  orbitSpeed: 0.045,
  radius: 165,
  radiusVariation: 26,
  height: 78,
  heightVariation: 22,
  targetHeight: 16,
  startAngle: 0.6,
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly opts: Required<CameraRigOptions>;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private initialised = false;

  constructor(aspect: number, options: CameraRigOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.camera = new THREE.PerspectiveCamera(
      48,
      aspect,
      0.5,
      Math.max(4000, this.opts.radius * 24),
    );
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param elapsed simulated/wall time in seconds
   * @param dt      frame delta, used only for the exponential smoothing
   */
  update(elapsed: number, dt: number): void {
    const o = this.opts;
    const angle = o.startAngle + elapsed * o.orbitSpeed;

    const radius = o.radius + Math.sin(elapsed * 0.037) * o.radiusVariation;
    const height =
      o.height +
      Math.sin(elapsed * 0.053 + 1.7) * o.heightVariation +
      Math.sin(elapsed * 0.017) * o.heightVariation * 0.35;

    this.desired.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);

    // The look-at point wanders slightly so the framing keeps changing.
    this.target.set(
      Math.sin(elapsed * 0.023) * 16,
      o.targetHeight + Math.sin(elapsed * 0.031 + 0.9) * 6,
      Math.cos(elapsed * 0.019 + 2.1) * 16,
    );

    if (!this.initialised) {
      this.camera.position.copy(this.desired);
      this.smoothedTarget.copy(this.target);
      this.initialised = true;
    } else {
      // Critically-damped-ish smoothing, frame-rate independent.
      const k = 1 - Math.exp(-dt * 2.2);
      this.camera.position.lerp(this.desired, k);
      this.smoothedTarget.lerp(this.target, k);
    }

    this.camera.lookAt(this.smoothedTarget);
  }
}
