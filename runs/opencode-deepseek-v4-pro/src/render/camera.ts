import * as THREE from 'three';

/**
 * Autonomous camera that slowly orbits the terrain centre. No user input is
 * involved; the orbit speed and a gentle vertical bob are deterministic.
 */
export class AutoOrbit {
  private theta = 0;
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly height: number;

  constructor(center: THREE.Vector3, radius: number, height: number) {
    this.center = center;
    this.radius = radius;
    this.height = height;
  }

  apply(camera: THREE.PerspectiveCamera): void {
    const x = this.center.x + Math.cos(this.theta) * this.radius;
    const z = this.center.z + Math.sin(this.theta) * this.radius;
    const bob = Math.sin(this.theta * 0.7) * this.radius * 0.06;
    camera.position.set(x, this.height + bob, z);
    camera.lookAt(this.center);
  }

  update(dt: number, speed: number): void {
    this.theta += dt * speed * 0.08;
  }
}