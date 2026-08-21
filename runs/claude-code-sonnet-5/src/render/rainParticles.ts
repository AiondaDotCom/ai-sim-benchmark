import * as THREE from 'three';
import type { TerrainData } from '../sim/terrain';

export interface RainParticlesHandle {
  points: THREE.Points;
  update(dt: number): void;
}

/**
 * A lightweight falling-rain particle system, purely decorative - it has no
 * effect on the water simulation itself (rain input to the sim is a uniform
 * depth added directly to the grid, see sim/water.ts). This just gives the
 * autonomous demo a visible reason water is appearing.
 */
export function createRainParticles(terrain: TerrainData, count = 1400): RainParticlesHandle {
  const half = terrain.worldSize * 0.5;
  const top = terrain.maxHeight + 60;
  const bottom = -5;

  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * half;
    positions[i * 3 + 1] = bottom + Math.random() * (top - bottom);
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * half;
    speeds[i] = 28 + Math.random() * 18;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xdcefff,
    size: 0.35,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'rain';
  points.frustumCulled = false;

  const posAttr = geometry.attributes.position as THREE.BufferAttribute;

  function update(dt: number): void {
    for (let i = 0; i < count; i++) {
      let y = posAttr.getY(i) - speeds[i] * dt;
      if (y < bottom) {
        y = top;
        posAttr.setX(i, (Math.random() * 2 - 1) * half);
        posAttr.setZ(i, (Math.random() * 2 - 1) * half);
      }
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;
  }

  return { points, update };
}
