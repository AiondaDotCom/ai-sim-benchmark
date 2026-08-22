import * as THREE from "three";

/**
 * Fully autonomous camera: a slow, smooth orbit around the island with a
 * gentle vertical drift. No user input.
 */
export class CameraRig {
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly height: number;
  private angle: number;

  constructor(center: THREE.Vector3, radius: number, height: number, startAngle = Math.PI / 6) {
    this.center = center.clone();
    this.radius = radius;
    this.height = height;
    this.angle = startAngle;
  }

  /** Advance the orbit; `dt` in seconds. Roughly one revolution per ~90 s. */
  update(camera: THREE.PerspectiveCamera, dt: number): void {
    this.angle += dt * ((2 * Math.PI) / 90);
    const bob = Math.sin(this.angle * 3) * this.height * 0.12;
    camera.position.set(
      this.center.x + Math.cos(this.angle) * this.radius,
      this.height + bob,
      this.center.z + Math.sin(this.angle) * this.radius,
    );
    camera.lookAt(this.center.x, this.center.y + 4, this.center.z);
  }
}
