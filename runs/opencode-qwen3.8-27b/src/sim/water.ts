/**
 * Heightfield water solver.
 *
 * Each cell stores a water depth on top of the terrain. A cell's "surface
 * height" is terrain + depth. During a relaxation tick, every cell gives a
 * fraction of its depth to each neighbor whose surface is lower; the amount
 * transferred is a share of the surface-height difference (the steeper the
 * drop, the faster water moves) capped at half the donor's current depth so a
 * cell can never go negative and the scheme stays unconditionally stable.
 *
 * Properties:
 *  - water only ever moves to a lower surface => it flows downhill,
 *  - every transfer subtracts exactly what it adds elsewhere => total water
 *    mass is conserved (to floating-point rounding),
 *  - water with no lower neighbor accumulates => lakes fill in depressions.
 */

const DIR_I = [1, -1, 0, 0];
const DIR_J = [0, 0, 1, -1];

/**
 * Run one relaxation tick over the whole grid, in place.
 *
 * @param height  terrain elevation per cell (read-only)
 * @param depth   water depth per cell (updated in place)
 * @param n       cells per side
 * @param coeff   relaxation stiffness
 * @param reverse when true, iterate cells in the opposite order; alternating
 *                the direction each tick removes the left-to-right bias of
 *                in-place updates
 */
export function flowTick(
  height: Float32Array,
  depth: Float32Array,
  n: number,
  coeff = 0.35,
  reverse = false
): void {
  for (let s = 0; s < n; s++) {
    const j = reverse ? s : n - 1 - s;
    for (let t = 0; t < n; t++) {
      const i = reverse ? t : n - 1 - t;
      const p = j * n + i;
      let w = depth[p];
      if (w <= 0) continue;

      let surface = height[p] + w;
      for (let d = 0; d < 4; d++) {
        const ni = i + DIR_I[d];
        const nj = j + DIR_J[d];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const q = nj * n + ni;
        const drop = surface - (height[q] + depth[q]);
        if (drop <= 0) continue;

        const transfer = Math.min(w * 0.5, coeff * drop);
        if (transfer <= 0) continue;

        w -= transfer;
        depth[q] += transfer;
        surface = height[p] + w;
      }
      depth[p] = w;
    }
  }
}

/** Total water in the field as a sum of cell depths (mass / cell area). */
export function totalDepth(depth: Float32Array): number {
  let sum = 0;
  for (let k = 0; k < depth.length; k++) sum += depth[k];
  return sum;
}
