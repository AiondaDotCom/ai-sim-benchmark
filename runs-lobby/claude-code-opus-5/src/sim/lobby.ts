/** The set. A single source of truth for the architecture, shared by the
 *  simulation (collision, cover, destructible surfaces) and the renderer. */
import { v3, type Vec3 } from './vec.ts';

export const LAYOUT = {
  /** Hall extends along +Z: z=0 is the entrance, z=HALL_LENGTH the elevator bank. */
  hallLength: 48,
  halfWidth: 9,
  ceilingHeight: 11,

  /** Two rows of massive square columns. */
  columnHalf: 0.6,
  columnRowX: 4.6,
  columnZ: [11, 20.5, 30, 39.5] as const,
  /** Height of the destructible (shootable) band on columns and walls. */
  damageBandHeight: 5.5,
  wallDamageBandHeight: 6.0,

  /** Security checkpoint. */
  detectorZ: 6.2,
  detectorHalfWidth: 0.62,
  deskPos: v3(2.9, 0, 6.6),
  xrayPos: v3(-3.0, 0, 6.4),

  /** Entrance doors / elevator bank. */
  doorZ: 0.15,
  elevatorZ: 47.6,
  elevatorX: [-3.2, 0, 3.2] as const,
  elevatorWidth: 2.0,
  elevatorHeight: 2.6,
} as const;

export interface ColumnDef {
  index: number;
  side: -1 | 1;
  center: Vec3;
}

export function columns(): ColumnDef[] {
  const out: ColumnDef[] = [];
  let i = 0;
  for (const side of [-1, 1] as const) {
    for (const z of LAYOUT.columnZ) {
      out.push({ index: i++, side, center: v3(side * LAYOUT.columnRowX, 0, z) });
    }
  }
  return out;
}

export type SurfaceKind = 'column' | 'wall';

/** A flat, destructible slab of cladding.  (u,v) are surface-local metres with
 *  the origin at the lower "left" corner as seen from outside. */
export interface SurfaceDef {
  id: number;
  kind: SurfaceKind;
  /** Owning column index (columns only), or wall side. */
  owner: number;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
  uSize: number;
  vSize: number;
  /** Damage-map resolution. */
  tw: number;
  th: number;
}

const TEXELS_PER_M = 20;

function mkSurface(
  id: number,
  kind: SurfaceKind,
  owner: number,
  origin: Vec3,
  u: Vec3,
  v: Vec3,
  n: Vec3,
  uSize: number,
  vSize: number,
): SurfaceDef {
  return {
    id,
    kind,
    owner,
    origin,
    u,
    v,
    n,
    uSize,
    vSize,
    tw: Math.max(8, Math.round(uSize * TEXELS_PER_M)),
    th: Math.max(8, Math.round(vSize * TEXELS_PER_M)),
  };
}

/**
 * All destructible surfaces: the four faces of every column plus the marble
 * wall panels along both side walls and the far wall.
 */
export function buildSurfaceDefs(): SurfaceDef[] {
  const defs: SurfaceDef[] = [];
  const h = LAYOUT.columnHalf;
  const band = LAYOUT.damageBandHeight;
  const up = v3(0, 1, 0);

  for (const col of columns()) {
    const c = col.center;
    // faces in order: -Z, +X, +Z, -X  (outward normals)
    const faces: Array<{ n: Vec3; u: Vec3; o: Vec3 }> = [
      { n: v3(0, 0, -1), u: v3(-1, 0, 0), o: v3(c.x + h, 0, c.z - h) },
      { n: v3(1, 0, 0), u: v3(0, 0, -1), o: v3(c.x + h, 0, c.z + h) },
      { n: v3(0, 0, 1), u: v3(1, 0, 0), o: v3(c.x - h, 0, c.z + h) },
      { n: v3(-1, 0, 0), u: v3(0, 0, 1), o: v3(c.x - h, 0, c.z - h) },
    ];
    for (const f of faces) {
      defs.push(mkSurface(defs.length, 'column', col.index, f.o, f.u, up, f.n, h * 2, band));
    }
  }

  // Side walls, split into panels so that damage textures stay small.
  const panelW = 5.75;
  const wallBand = LAYOUT.wallDamageBandHeight;
  const nPanels = Math.round(LAYOUT.hallLength / panelW);
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < nPanels; i++) {
      const z0 = i * (LAYOUT.hallLength / nPanels);
      const w = LAYOUT.hallLength / nPanels;
      const x = side * LAYOUT.halfWidth;
      // inward-facing normal
      const n = v3(-side, 0, 0);
      // (u, v, n) must stay right-handed, otherwise the slab mesh is mirrored
      const u = side === 1 ? v3(0, 0, 1) : v3(0, 0, -1);
      const o = side === 1 ? v3(x, 0, z0) : v3(x, 0, z0 + w);
      defs.push(mkSurface(defs.length, 'wall', side, o, u, up, n, w, wallBand));
    }
  }
  return defs;
}

/** Axis-aligned solid boxes that block bullets and line of sight. */
export interface Blocker {
  min: Vec3;
  max: Vec3;
}

export function blockers(): Blocker[] {
  const h = LAYOUT.columnHalf;
  const out: Blocker[] = [];
  for (const c of columns()) {
    out.push({
      min: v3(c.center.x - h, 0, c.center.z - h),
      max: v3(c.center.x + h, LAYOUT.ceilingHeight, c.center.z + h),
    });
  }
  // guard desk
  out.push({
    min: v3(LAYOUT.deskPos.x - 1.3, 0, LAYOUT.deskPos.z - 0.5),
    max: v3(LAYOUT.deskPos.x + 1.3, 1.1, LAYOUT.deskPos.z + 0.5),
  });
  // x-ray belt
  out.push({
    min: v3(LAYOUT.xrayPos.x - 1.5, 0, LAYOUT.xrayPos.z - 0.45),
    max: v3(LAYOUT.xrayPos.x + 1.5, 0.95, LAYOUT.xrayPos.z + 0.45),
  });
  return out;
}
