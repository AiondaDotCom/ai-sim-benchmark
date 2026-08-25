import { fbm2, ridgedFbm2, smoothstep } from './noise';

/** A procedural heightfield: `n x n` cells of terrain height in world units. */
export interface Terrain {
  /** Cells per side. */
  n: number;
  /** World units per cell (the grid is `size x size`). */
  cellSize: number;
  /** World extent of the terrain, in units (n * cellSize). */
  size: number;
  /** Terrain surface elevation per cell, row-major (j * n + i). */
  height: Float32Array;
  /** Maximum elevation in the field, useful for normalization. */
  maxHeight: number;
}

export interface TerrainOptions {
  seed: number;
  /** Cells per side. Default 128. */
  n?: number;
  /** World units per side. Default 100. */
  size?: number;
  /** Maximum mountain height in world units. Default 18. */
  mountainHeight?: number;
}

const DEFAULTS = {
  n: 128,
  size: 100,
  // Kept moderate (not a skyscraper wall): tall enough for a dramatic caldera
  // ring, but low enough that a medium aerial camera can see over the near side
  // into the lake and the streams — a very tall wall would hide the water.
  mountainHeight: 18
};

/**
 * River channel geometry. A single, meandering trough is carved from the ring
 * down into the lake so a clear, continuous stream flows down the mountain and
 * feeds the lake (the "deutlich viel Wasser" the scene is built around). The
 * constants are exported so the simulation can place a strong spring at the
 * channel's top (`channelSource`) to supply that stream.
 */
export const RIVER_THETA0 = -0.85; // base azimuth of the channel (world angle)
export const RIVER_MEANDER = 0.35; // angular meander amplitude (radians)
export const RIVER_WAVE = 3.0; // meander frequency along the inward radius
// The channel runs from here (the mountain base / lower wall) into the lake.
// Stopping at the "knee" of the flow profile — not all the way to the summit —
// is deliberate: the flow is steep and drains fast near the top, so a channel
// that high would run dry at its head. Ending it where the flow is deep keeps
// the whole river a solid, opaque blue ribbon.
export const RIVER_R0 = 0.5; // outer radius of the channel, on the ring
export const RIVER_DIP = 4.0; // max depth of the carved bed (world units)

/** Azimuth of the channel centerline at a given normalized radius. */
export function riverCenterTheta(r: number): number {
  return RIVER_THETA0 + RIVER_MEANDER * Math.sin(r * RIVER_WAVE);
}

/**
 * The cell at the top of the river channel — the river spring sits here so the
 * stream has a strong, continuous source high on the ring.
 */
export function channelSource(terrain: Terrain): number {
  const { n } = terrain;
  const theta = riverCenterTheta(RIVER_R0);
  const nx = RIVER_R0 * Math.cos(theta);
  const ny = RIVER_R0 * Math.sin(theta);
  const i = Math.min(n - 1, Math.max(0, Math.round(((nx + 1) / 2) * n - 0.5)));
  const j = Math.min(n - 1, Math.max(0, Math.round(((ny + 1) / 2) * n - 0.5)));
  return j * n + i;
}

/**
 * Generate a deterministic caldera landscape: a ring of mountains surrounds a
 * low central floor, so all water flows inward and collects in one central
 * lake.
 *
 * Composition (all terms are pure functions of the seed):
 *  - a ring of mountains (rolling fbm mixed with ridged crests) whose relief
 *    rises from a low center, with a base elevation so the ring is a
 *    consistent caldera wall,
 *  - a SMOOTH central floor that dips to a basin at the very center (the lake)
 *    and rises to the ring. Smooth on purpose: a wide, gently-undulating plain
 *    lets the water spread into a shallow sheet, whereas a smooth bowl funnels
 *    it into one distinct lake,
 *  - subtle undulation in the far interior for a hint of floor texture,
 *  - a square ridge wall at the very border so no water can leave the island.
 */
export function generateTerrain(options: TerrainOptions): Terrain {
  const { seed } = options;
  const n = options.n ?? DEFAULTS.n;
  const size = options.size ?? DEFAULTS.size;
  const mountainHeight = options.mountainHeight ?? DEFAULTS.mountainHeight;
  const cellSize = size / n;

  // Independent noise seed for the interior floor so its (subtle) relief is
  // decorrelated from the mountains.
  const floorSeedA = (seed ^ 0x85ebca6b) | 0;
  // Independent noise seed for the lake shoreline so its (organic) edge is
  // decorrelated from the mountains and the floor texture.
  const lakeSeed = (seed ^ 0x51ab3d) | 0;

  const height = new Float32Array(n * n);

  let maxHeight = 0;
  for (let j = 0; j < n; j++) {
    const ny = ((j + 0.5) / n) * 2 - 1;
    for (let i = 0; i < n; i++) {
      const nx = ((i + 0.5) / n) * 2 - 1;
      const m = Math.max(Math.abs(nx), Math.abs(ny));

      // Caldera: a ring of mountains surrounds a low central floor. The wall
      // mask is 0 at the center and 1 in the ring, so the peaks ring the edge
      // and every stream flows INWARD, toward the central lake — which is what
      // makes the water collect in one distinct lake instead of flooding the
      // border (the failure mode of a central-mountain layout).
      const wall = smoothstep(0.34, 0.7, m);
      const rolling = fbm2(nx * 2.2, ny * 2.2, seed, 5);
      const crests = ridgedFbm2(nx * 1.6, ny * 1.6, (seed ^ 0x9e3779b9) | 0, 4);
      const mountain = Math.pow(0.55 * rolling + 0.45 * crests, 1.15);

      // The interior is two levels so the water is contained in a distinct
      // lake and the surrounding floor stays dry:
      //   1. a central lake basin — a smooth bowl, lowest at the center, rising
      //      to a rim. This is where all the water collects (the lake). It is
      //      deliberately smooth and bounded so the water pools in ONE lake
      //      instead of spreading into a shallow sheet. The bowl is measured in
      //      EUCLIDEAN distance with a noise-modulated shoreline radius, so the
      //      lake is a natural irregular shape (bays and inlets) — never a
      //      perfect square (the square `m` metric) or a perfect circle.
      //   2. a lowland plateau around the lake — dry land that rises from the
      //      lake rim up to the ring base, keeping the lake contained below the
      //      caldera wall's divide so it never spills over onto the outer slope.
      // The interior is measured in Euclidean distance (round, never the square
      // `m`), then scaled by low-frequency noise into a WAVY radius. Scaling the
      // radius (rather than just the lake rim) makes EVERY contour wavy — the
      // lake bed, the rim, the lowland, and crucially the flat water surface —
      // so the lake's visible shoreline is a natural irregular shape (bays and
      // inlets), not a perfect square or circle. The wobble only shifts contours
      // radially; heights are unchanged, so the water stays contained below the
      // caldera divide regardless of the wavy shape.
      const r = Math.sqrt(nx * nx + ny * ny);
      const shoreN = fbm2(nx * 2.0 + 4.2, ny * 2.0 - 2.8, lakeSeed, 4); // 0..1
      const rW = r * (0.82 + 0.36 * shoreN); // wavy radius, about ±18%
      const lakeBowl = 1 - smoothstep(0.0, 0.5, rW); // 1 at center, 0 at the (wavy) rim
      const lakeFloor = 1.0; // the lake bed
      const lakeRimH = 5.0; // the rim of the lake basin
      const lowland = smoothstep(0.5, 0.7, rW); // 0 at the (wavy) rim, 1 at the (wavy) ring base
      const ringBase = 8.0; // the ring base height (the lowland's high edge)
      let v =
        lakeFloor +
        (1 - lakeBowl) * (lakeRimH - lakeFloor) + // lake bowl: 1 at center, 5 outside the (wavy) rim
        lowland * (ringBase - lakeRimH); // lowland: 5 at the rim, 8 at the (wavy) ring base

      // The caldera wall: a ring of mountains around the lowland. A base
      // elevation keeps it a consistent wall whose lowest divide stays well
      // above the lake, so the lake is contained and never spills onto the
      // outer slope; the relief adds snow-capped peaks on top.
      v += wall * (4.0 + mountain * mountainHeight);

      // Subtle undulation in the lowland (for floor texture), zero in the lake
      // and at the ring, so the lowland has character without new water pools.
      const und = (fbm2(nx * 2.6 + 7.31, ny * 2.6 - 4.17, floorSeedA, 4) - 0.5) * 1.0;
      v += und * lowland * (1 - wall);

      // Border ridge wall (square, so every edge including corners is sealed).
      const rim =
        smoothstep(0.87, 0.97, m) *
        (7 + 3 * fbm2(nx * 3.1 + 11.7, ny * 3.1 + 5.3, (seed ^ 0xcafebabe) | 0, 3));
      v += rim;

      // River channel: a meandering trough from the ring into the lake. The
      // cross-section is a gaussian valley floor (a real riverbed, not a line),
      // wide up the mountain and narrowing toward the lake; the envelope fades it
      // in just outside the lake center (so it merges with the basin, never
      // punching a hole in the lake floor) and out at the ring. Carving a real
      // bed is what keeps the stream a defined river instead of a sheet.
      const dphi = Math.atan2(
        Math.sin(Math.atan2(ny, nx) - riverCenterTheta(r)),
        Math.cos(Math.atan2(ny, nx) - riverCenterTheta(r))
      );
      const lat = Math.abs(dphi) * r; // lateral offset from the centerline
      // A BROAD riverbed (several cells wide), wide up the mountain and
      // narrowing toward the lake. Broad + deep enough water = a bold, dominant
      // blue ribbon — the "deutlich viel Wasser" — that stands out clearly
      // against the floor from an aerial view (a thin trickle gets lost).
      const halfW = 0.04 + 0.05 * (r / RIVER_R0); // channel half-width (normalized)
      const riverEnv =
        smoothstep(0.06, 0.18, r) * (1 - smoothstep(RIVER_R0 - 0.1, RIVER_R0, r));
      v -= RIVER_DIP * Math.exp(-(lat * lat) / (2 * halfW * halfW)) * riverEnv;

      const h = Math.max(0, v);
      height[j * n + i] = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  return { n, cellSize, size, height, maxHeight };
}

/** World-space X coordinate of cell column `i`. Grid is centered on the origin. */
export function cellToWorldX(terrain: Terrain, i: number): number {
  return (i + 0.5 - terrain.n / 2) * terrain.cellSize;
}

/** World-space Z coordinate of cell row `j`. */
export function cellToWorldZ(terrain: Terrain, j: number): number {
  return (j + 0.5 - terrain.n / 2) * terrain.cellSize;
}
