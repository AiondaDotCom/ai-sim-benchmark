/**
 * Shared spatial layout of the lobby. Single source of truth for both the
 * simulation (raycasts, destructible surfaces, choreography waypoints) and
 * the renderer (geometry placement).
 *
 * Coordinate system: +Y up, hall runs along Z. Entrance doors at z=+18,
 * elevator bank at z=-18. Floor at y=0, coffered ceiling at y=7.
 */

export const HALL = {
  halfWidth: 8, // inner wall faces at x = +-8
  halfLength: 18, // entrance z=+18, elevator wall z=-18
  height: 7,
};

export const COLUMN = { size: 1.3, height: 7 };

/**
 * Footprint of a column at floor level. The visible plinth is wider than the
 * shaft, and it is the plinth a body can stand in, so this is the width the
 * clearance uses. Kept next to COLUMN so the two cannot drift apart —
 * `tests/space.test.ts` checks it against the mesh the renderer actually
 * builds.
 */
export const COLUMN_BASE = COLUMN.size + 0.24;

/**
 * Benches along the side walls. They were set dressing built entirely inside
 * the renderer, so the sim did not know they existed and characters could
 * stand in them — they are 0.45 m tall, which is knee height on a standing man
 * and the whole of a fallen one. Declared here so the clearance and the mesh
 * come from one place; `tests/space.test.ts` fails if they drift apart.
 */
export const BENCH = { w: 0.6, h: 0.45, d: 2.6, inset: 0.75, rows: [5, -7] };

/** Column centers: two parallel rows of 4 massive square columns. */
export const COLUMNS: { x: number; z: number }[] = [
  { x: -3.5, z: 8 },
  { x: -3.5, z: 2 },
  { x: -3.5, z: -4 },
  { x: -3.5, z: -10 },
  { x: 3.5, z: 8 },
  { x: 3.5, z: 2 },
  { x: 3.5, z: -4 },
  { x: 3.5, z: -10 },
];

export const CHECKPOINT = {
  detector: { x: 0, z: 10.5, width: 1.1, height: 2.3, depth: 0.5 },
  desk: { x: 2.55, z: 10.6, w: 2.4, h: 0.95, d: 1.1 },
};

export const ELEVATOR = {
  wallZ: -18,
  doors: [-3.2, 0, 3.2], // x centers of the three elevator doors
  // tall portals per the film reference: taller than wide
  doorW: 1.1,
  doorH: 2.4,
};

export interface Surface {
  id: string;
  kind: 'column' | 'wall' | 'desk';
  /** AABB */
  min: [number, number, number];
  max: [number, number, number];
}

/** Destructible surfaces (columns + wall panels) plus blocking props. */
export function buildSurfaces(): Surface[] {
  const s: Surface[] = [];
  const h = COLUMN.size / 2;
  COLUMNS.forEach((c, i) => {
    s.push({
      id: `col${i}`,
      kind: 'column',
      min: [c.x - h, 0, c.z - h],
      max: [c.x + h, COLUMN.height, c.z + h],
    });
  });
  // Side wall panels: split each side wall into 6 z-segments for local damage.
  const segs = 6;
  const segLen = (HALL.halfLength * 2) / segs;
  for (let i = 0; i < segs; i++) {
    const z0 = -HALL.halfLength + i * segLen;
    s.push({
      id: `wallL${i}`,
      kind: 'wall',
      min: [-HALL.halfWidth - 0.4, 0, z0],
      max: [-HALL.halfWidth, HALL.height, z0 + segLen],
    });
    s.push({
      id: `wallR${i}`,
      kind: 'wall',
      min: [HALL.halfWidth, 0, z0],
      max: [HALL.halfWidth + 0.4, HALL.height, z0 + segLen],
    });
  }
  // Back wall (elevator side) and front wall count as walls too.
  s.push({ id: 'wallBack', kind: 'wall', min: [-8, 0, -18.4], max: [8, 7, -18] });
  s.push({ id: 'wallFront', kind: 'wall', min: [-8, 0, 18], max: [8, 7, 18.4] });
  const d = CHECKPOINT.desk;
  s.push({
    id: 'desk',
    kind: 'desk',
    min: [d.x - d.w / 2, 0, d.z - d.d / 2],
    max: [d.x + d.w / 2, d.h, d.z + d.d / 2],
  });
  return s;
}


/**
 * B28: solid volumes a thrown or falling body has to settle AGAINST rather
 * than inside.
 *
 * A guard knocked back at the checkpoint ended up embedded in the desk — his
 * torso through the desktop, at rest, standing in it. Knock-back and death
 * poses were resolved against nothing at all: the pose puts the body wherever
 * the choreography left it, and two of the three guards die on positions that
 * are inside the desk footprint by construction (g0 dies lunging for the desk
 * radio at 1.7, 10.1; g2 at 2.3, 10.15).
 *
 * These are footprints in the XZ plane only. A body is not a point, so the
 * push-out carries a radius; the result is that a body thrown into the desk
 * comes to rest against its edge, which with the existing crumple and slide
 * poses reads as slumping on it.
 *
 * The detector is deliberately its two UPRIGHTS rather than its footprint —
 * the opening has to stay walkable, since the whole checkpoint beat is someone
 * stepping through it.
 */
interface Blocker { min: [number, number]; max: [number, number] }

export function bodyBlockers(): Blocker[] {
  const d = CHECKPOINT.desk;
  const det = CHECKPOINT.detector;
  const out: Blocker[] = [
    // guard desk, and the lip that overhangs it
    { min: [d.x - d.w / 2 - 0.08, d.z - d.d / 2 - 0.08], max: [d.x + d.w / 2 + 0.08, d.z + d.d / 2 + 0.08] },
    // X-ray belt and its housing beside the desk
    { min: [d.x - 0.5, d.z + 0.7], max: [d.x + 1.1, d.z + 1.4] },
    { min: [d.x + 0.75, d.z + 0.7], max: [d.x + 1.25, d.z + 1.4] },
  ];
  // detector uprights only, so the opening stays walkable
  for (const sx of [-1, 1]) {
    const cx = det.x + sx * det.width / 2;
    out.push({ min: [cx - 0.1, det.z - det.depth / 2], max: [cx + 0.1, det.z + det.depth / 2] });
  }
  // Column bases — the PLINTH, not the shaft. The plinth is COLUMN.size + 0.24
  // across and 0.22 m tall (see lobby.ts), so reserving only the shaft left a
  // 0.12 m lip that a body could stand in: the bullet-cam target's shins were
  // inside the base of his own column, which is exactly the height the camera
  // sits at during that beat.
  const h = COLUMN_BASE / 2;
  for (const c of COLUMNS) out.push({ min: [c.x - h, c.z - h], max: [c.x + h, c.z + h] });
  // wall benches
  for (const side of [-1, 1]) {
    const bx = side * (HALL.halfWidth - BENCH.inset);
    for (const bz of BENCH.rows) {
      out.push({
        min: [bx - BENCH.w / 2, bz - BENCH.d / 2],
        max: [bx + BENCH.w / 2, bz + BENCH.d / 2],
      });
    }
  }
  return out;
}

const BLOCKERS = bodyBlockers();

/**
 * The horizontal half-width the sim reserves for a body: its centre is kept at
 * least this far from any set geometry. It is the BODY CORE — hips, torso,
 * head, legs — and deliberately not the arms, because a man braced on a column
 * reaches past its face with his hands and his weapon, and that is what taking
 * cover looks like. `tests/space.test.ts` measures the core against it.
 */
export const BODY_R = 0.26;

/**
 * How much room a body needs in a given action, measured from the rig.
 *
 * A standing, covering, aiming or firing trunk fits inside BODY_R with room to
 * spare (0.25 m at worst). A run does not: the pose pitches the chest forward
 * over the lead foot and the trunk reaches 0.40 m along the direction of
 * travel, which is exactly the direction of the column being run at. A strike
 * lunges 0.30 m the same way.
 *
 * Reserving the run's radius for every pose would be the easy fix and the
 * wrong one — it would hold a man in cover 0.4 m off the column he is supposed
 * to have his back against, which is the defect B29 just finished removing.
 * So the reserve follows the pose. `tests/space.test.ts` measures the trunk in
 * every action against the radius claimed here.
 */
export function bodyRadiusFor(action: string): number {
  if (action === 'run') return 0.40;
  if (action === 'strike' || action === 'kick') return 0.30;
  return BODY_R;
}

/**
 * Push a resting body out of any solid it is inside, by the shortest route.
 * `r` is the body's own half-width, so it settles against the face rather than
 * with its centre on it.
 */
export function settleClearOfSet(x: number, z: number, r = BODY_R): [number, number] {
  let px = x;
  let pz = z;
  // two passes: pushing out of one blocker can put a body into a neighbour
  for (let pass = 0; pass < 2; pass++) {
    for (const b of BLOCKERS) {
      const minX = b.min[0] - r, maxX = b.max[0] + r;
      const minZ = b.min[1] - r, maxZ = b.max[1] + r;
      if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;
      // inside: leave by whichever face is nearest
      const dxl = px - minX, dxr = maxX - px;
      const dzl = pz - minZ, dzr = maxZ - pz;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) px = minX;
      else if (m === dxr) px = maxX;
      else if (m === dzl) pz = minZ;
      else pz = maxZ;
    }
  }
  // Pairwise pushing cannot solve every case. The desk and the X-ray belt
  // stand 0.07 m apart, so once each box is inflated by the body radius their
  // free-space boundaries overlap and there is a corridor that belongs to
  // both: the desk pushes a body back, the belt pushes it forward, and after
  // two passes it is exactly where it started, still inside both. That is a
  // gap no body fits through, and the only correct answer is to leave it
  // entirely. So when the point is still solid, take the nearest genuinely
  // free position instead of the nearest free FACE.
  if (!isClearOfSet(px, pz, r)) {
    for (let ring = 1; ring <= 40; ring++) {
      const rad = ring * 0.05;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const cx = x + Math.cos(a) * rad;
        const cz = z + Math.sin(a) * rad;
        if (isClearOfSet(cx, cz, r)) return [cx, cz];
      }
    }
  }
  return [px, pz];
}

/** True when a body of half-width `r` centred here touches no set geometry. */
export function isClearOfSet(x: number, z: number, r = BODY_R): boolean {
  for (const b of BLOCKERS) {
    if (x > b.min[0] - r && x < b.max[0] + r && z > b.min[1] - r && z < b.max[1] + r) return false;
  }
  return true;
}


/**
 * B29: the nearest vertical surface a body could come to rest against.
 *
 * The `slide` death describes a man sliding down a column and ending seated
 * against it. Applied to a body with nothing behind it, it renders as sitting
 * bolt upright in open floor — which is what every one of them was doing:
 * measured, all five slide-style defenders ended 0.41 to 2.15 m from the
 * nearest surface. Their cover positions sit diagonally off the column corner
 * by design, so they were never in contact in the first place.
 *
 * Returns the contact point and the outward normal of the face, so the body
 * can be placed against it AND turned so its back is to it. Null if nothing is
 * within `maxDist`, in which case the pose has to change instead.
 */
export function nearestSurfaceContact(
  x: number, z: number, maxDist: number, r = 0.26,
): { x: number; z: number; nx: number; nz: number } | null {
  let best: { x: number; z: number; nx: number; nz: number } | null = null;
  let bestD = maxDist;
  for (const b of BLOCKERS) {
    // closest point on the footprint, and which face it belongs to
    const cx = Math.min(Math.max(x, b.min[0]), b.max[0]);
    const cz = Math.min(Math.max(z, b.min[1]), b.max[1]);
    const d = Math.hypot(x - cx, z - cz);
    if (d >= bestD) continue;
    // outward normal: the axis the point is furthest outside on
    const ox = x < b.min[0] ? -1 : x > b.max[0] ? 1 : 0;
    const oz = z < b.min[1] ? -1 : z > b.max[1] ? 1 : 0;
    let nx = ox;
    let nz = oz;
    if (ox !== 0 && oz !== 0) {
      // Diagonally off a corner. Take the face it is LEAST far outside of —
      // that is the one it can be slid onto with the smallest move. Choosing
      // the other way round leaves the body parked off the arris, still
      // touching nothing, which is what a first pass here did.
      const dx = Math.abs(x - (ox > 0 ? b.max[0] : b.min[0]));
      const dz = Math.abs(z - (oz > 0 ? b.max[1] : b.min[1]));
      if (dx < dz) { nz = 0; } else { nx = 0; }
    }
    if (nx === 0 && nz === 0) continue;
    bestD = d;
    // The contact point must also lie WITHIN the face's own extent on the
    // other axis, or the body rests beside the column rather than against it.
    best = {
      x: nx === 0
        ? Math.min(Math.max(x, b.min[0] + r), b.max[0] - r)
        : (nx > 0 ? b.max[0] : b.min[0]) + nx * r,
      z: nz === 0
        ? Math.min(Math.max(z, b.min[1] + r), b.max[1] - r)
        : (nz > 0 ? b.max[1] : b.min[1]) + nz * r,
      nx, nz,
    };
  }
  return best;
}
