import { PerspectiveCamera, Vector3 } from 'three';

/**
 * Slow, smooth, fully automatic camera: an orbit around the terrain whose
 * radius and height "breathe" gently. Everything is a smooth function of time
 * (no randomness, no input), so recordings are reproducible.
 */
export class CameraRig {
  private readonly target = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly extent: number,
    private readonly maxHeight: number,
    private readonly speed: number,
  ) {}

  update(time: number): void {
    const e = this.extent;
    // One full orbit every ~150 s at speed 1.
    const angle = 0.6 + time * ((Math.PI * 2) / 150) * this.speed;
    const breathe = Math.sin(time * 0.045 * Math.max(this.speed, 0.2));
    const radius = e * (0.9 + 0.08 * breathe);
    const height = this.maxHeight * 1.2 + e * 0.07 * Math.sin(time * 0.031 * Math.max(this.speed, 0.2) + 1.2);
    this.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    this.target.set(Math.cos(angle + 0.9) * e * 0.04, this.maxHeight * 0.3, Math.sin(angle + 0.9) * e * 0.04);
    this.camera.lookAt(this.target);
  }
}
