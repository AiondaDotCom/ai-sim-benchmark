import * as THREE from 'three';

/**
 * Fully automatic camera: a slow orbit around the terrain centre with a
 * gentle vertical breathing motion. No user input of any kind.
 */
export class CameraRig {
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly radius: number,
    private readonly baseHeight: number,
    private readonly lookAtHeight: number,
    private readonly orbitPeriod: number,
  ) {}

  /** t = elapsed time in seconds. */
  update(t: number): void {
    const angle = (t / this.orbitPeriod) * Math.PI * 2;
    const bob = Math.sin(t * 0.11) * this.baseHeight * 0.16;
    const radiusWobble = Math.sin(t * 0.07 + 1.3) * this.radius * 0.06;
    const r = this.radius + radiusWobble;

    this.camera.position.set(Math.cos(angle) * r, this.baseHeight + bob, Math.sin(angle) * r);
    this.target.set(0, this.lookAtHeight, 0);
    this.camera.lookAt(this.target);
  }
}
