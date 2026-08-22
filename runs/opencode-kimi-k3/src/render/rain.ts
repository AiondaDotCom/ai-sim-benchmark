import * as THREE from 'three';
import { mulberry32 } from '../sim/rng';

/**
 * Decorative rain particle system (purely visual, deterministic pattern).
 * Drops fall inside a box above the terrain and wrap back to the top.
 */

export interface RainSystem {
  points: THREE.Points;
  update(dt: number): void;
}

export function createRain(
  count: number,
  area: number,
  top: number,
  seed: number,
): RainSystem {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * area;
    positions[i * 3 + 1] = rng() * top;
    positions[i * 3 + 2] = (rng() - 0.5) * area;
    speeds[i] = 55 + rng() * 25;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xdff0ff,
    size: 0.35,
    transparent: true,
    opacity: 0.28,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'rain';
  points.frustumCulled = false;

  const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
  return {
    points,
    update(dt: number): void {
      const arr = attr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1] -= speeds[i] * dt;
        if (arr[i * 3 + 1] < -5) arr[i * 3 + 1] = top;
      }
      attr.needsUpdate = true;
    },
  };
}
