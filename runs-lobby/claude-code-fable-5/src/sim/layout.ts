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
  doorW: 1.9,
  doorH: 2.7,
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
