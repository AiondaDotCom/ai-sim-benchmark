import * as THREE from 'three';

/**
 * Slow, smooth autonomous camera: a gentle orbit around the island with a
 * slow breathing of radius and altitude, always aimed at the scene center.
 * Driven purely by elapsed real time — the demo needs no input at all.
 */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  // Aim a little above the lake so the whole caldera — the ring's peaks and the
  // water collecting in the center — stays in frame.
  private readonly target = new THREE.Vector3(0, 7, 0);

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** @param t elapsed real seconds since page load */
  update(t: number): void {
    const angle = t * 0.055; // one full orbit in ~115 s
    const radius = 90 + 6 * Math.sin(t * 0.043);
    // A steep aerial 3/4 angle (~43°): high enough to look straight over the
    // near caldera wall into the lake and the streams draining into it (a low
    // grazing angle hides the whole interior behind the wall), while still
    // oblique enough that the peaks read as 3D relief, not a flat map.
    const altitude = 88 + 5 * Math.sin(t * 0.031 + 1.7);

    this.camera.position.set(
      Math.cos(angle) * radius,
      altitude,
      Math.sin(angle) * radius
    );
    this.camera.lookAt(this.target);
  }
}
