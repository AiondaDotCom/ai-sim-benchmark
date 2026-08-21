import * as THREE from 'three';

/**
 * Build an indexed grid geometry whose vertex k = gridY * width + gridX maps
 * to world position (gridX - (width-1)/2, 0, gridY - (height-1)/2).
 *
 * Terrain and water meshes share this mapping, so writing heights by grid
 * index keeps them perfectly aligned. Cell size is 1 world unit.
 */
export function createGridGeometry(width: number, height: number, withAlphaColor: boolean): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const n = width * height;

  const positions = new Float32Array(n * 3);
  const halfX = (width - 1) / 2;
  const halfY = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      positions[i * 3 + 0] = x - halfX;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = y - halfY;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const comps = withAlphaColor ? 4 : 3;
  const colors = new Float32Array(n * comps);
  colors.fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, comps));

  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let k = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}
