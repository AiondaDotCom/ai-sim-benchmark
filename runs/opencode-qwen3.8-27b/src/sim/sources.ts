import type { Terrain } from './terrain';

/**
 * Find `count` spring locations: the highest cells on the mountain ring
 * (a radial band between the lowland and the outer edge), greedily separated
 * so springs sit on distinct peaks. Restricting to the ring keeps the springs'
 * outflow draining into the central lake. Deterministic for a given terrain
 * (both height and ordering are fixed by the terrain's seed, ties break on
 * cell index).
 */
export function findSprings(terrain: Terrain, count: number): number[] {
  const { n, height } = terrain;
  const springs: number[] = [];
  if (count <= 0) return springs;

  const minDist = Math.max(8, n / 6);
  const minDistSq = minDist * minDist;

  // Rank cells by height, highest first, with a deterministic tie-break.
  const order: number[] = [];
  for (let k = 0; k < n * n; k++) order.push(k);
  order.sort((a, b) => height[b] - height[a] || a - b);

  for (const cell of order) {
    if (springs.length >= count) break;
    const i = cell % n;
    const j = (cell / n) | 0;
    // Only place springs on the mountain ring — not on the lowland floor or the
    // outer edge rim — so their water drains down the ring into the central
    // lake instead of sheeting across the outer slope.
    const nx = ((i + 0.5) / n) * 2 - 1;
    const ny = ((j + 0.5) / n) * 2 - 1;
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    if (m < 0.45 || m > 0.85) continue;
    let farEnough = true;
    for (const s of springs) {
      const dx = i - (s % n);
      const dy = j - ((s / n) | 0);
      if (dx * dx + dy * dy < minDistSq) {
        farEnough = false;
        break;
      }
    }
    if (farEnough) springs.push(cell);
  }
  return springs;
}
