import * as THREE from 'three';

export interface CameraFrameBounds {
  /** Point the camera always looks at (typically the terrain bounding box's centre). */
  target: THREE.Vector3;
  /** World-space offsets (corner - target) of every point that must stay in frame. */
  offsets: THREE.Vector3[];
}

export interface CameraPathOptions {
  bounds: CameraFrameBounds;
  /** Target fraction (0-1) of the frame's WIDTH the terrain's silhouette should span. */
  widthTarget: number;
  /** How much widthTarget breathes over time, as a fraction of itself (e.g. 0.08 = +-8%). */
  widthBreath: number;
  /** Base camera elevation angle above the horizon, in degrees. */
  elevationDeg: number;
  /** How many degrees the elevation angle breathes over time. */
  elevationBreathDeg: number;
  orbitSpeed: number;
}

/** Builds the 8 world-space corner offsets of the terrain's bounding box, relative to its centre. */
export function computeTerrainBounds(worldSize: number, maxHeight: number): CameraFrameBounds {
  const half = worldSize / 2;
  const target = new THREE.Vector3(0, maxHeight * 0.5, 0);
  const offsets: THREE.Vector3[] = [];
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      for (const y of [0, maxHeight]) {
        offsets.push(new THREE.Vector3(x - target.x, y - target.y, z - target.z));
      }
    }
  }
  return { target, offsets };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
/**
 * Hard ceiling on any single corner's NDC coordinate magnitude - guarantees nothing ever
 * clips out of frame, regardless of orbit angle or aspect ratio. This is a SAFETY bound,
 * not the visual target: because a low, oblique viewing angle projects a flat square's
 * corners asymmetrically (near corners spread wider than far ones even though the object
 * is geometrically centred on the look-at point), simply aiming for "worst corner reaches
 * X" produces a very different, aspect/angle-dependent VISUAL width than aiming directly
 * for the actual on-screen left-to-right span - see widthTarget below, which is what
 * "fills roughly N% of the frame width" actually means. This constant only prevents the
 * width target from ever pushing the camera close enough to clip the mountain peaks or
 * ground corners out of frame vertically.
 */
const CLIP_SAFETY_MAX_NDC = 0.92;
const BISECTION_ITERATIONS = 22;
const BISECTION_MIN_DISTANCE = 10;
const BISECTION_MAX_DISTANCE = 6000;

interface Basis {
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  tanH: number;
  tanV: number;
}

function computeBasis(dir: THREE.Vector3, aspect: number, vHalfFov: number): Basis {
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const hHalfFov = Math.atan(Math.tan(vHalfFov) * aspect);
  return { forward, right, up, tanH: Math.tan(hHalfFov), tanV: Math.tan(vHalfFov) };
}

/** Horizontal NDC span (right edge minus left edge, full range 2) and the worst single corner's NDC magnitude, at distance D. */
function measureAt(offsets: THREE.Vector3[], basis: Basis, distance: number): { widthSpan: number; maxAbs: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxAbs = 0;
  for (const offset of offsets) {
    const rightComp = offset.dot(basis.right);
    const upComp = offset.dot(basis.up);
    const forwardComp = offset.dot(basis.forward);
    const depth = distance + forwardComp;
    const ndcX = rightComp / (depth * basis.tanH);
    const ndcY = upComp / (depth * basis.tanV);
    minX = Math.min(minX, ndcX);
    maxX = Math.max(maxX, ndcX);
    maxAbs = Math.max(maxAbs, Math.abs(ndcX), Math.abs(ndcY));
  }
  return { widthSpan: maxX - minX, maxAbs };
}

/** Finds the largest D for which `metric(D) > target` still holds (metric is monotonically decreasing in D). */
function bisectForTarget(metric: (distance: number) => number, target: number): number {
  let lo = BISECTION_MIN_DISTANCE;
  let hi = BISECTION_MAX_DISTANCE;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (metric(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Computes the camera distance (along `dir`, from `bounds.target`) that makes the
 * terrain's bounding box span exactly `widthTarget` of the frame's width - or, if that
 * would push the camera close enough to clip any corner out of frame (which happens at
 * oblique angles on wide/ultra-wide aspect ratios), backs off just far enough to stay
 * safely inside frame instead. Re-derived from the live projection geometry every frame,
 * so it is exact for the camera's current aspect ratio, elevation and orbit angle - see
 * debug/verify_framing.mjs for a numerical sweep confirming this across aspect ratios
 * from ultra-wide landscape to tall portrait.
 */
function requiredDistance(
  dir: THREE.Vector3,
  offsets: THREE.Vector3[],
  aspect: number,
  vHalfFov: number,
  widthTarget: number,
): number {
  const basis = computeBasis(dir, aspect, vHalfFov);
  const distanceForWidth = bisectForTarget((d) => measureAt(offsets, basis, d).widthSpan / 2, widthTarget);
  const distanceForSafety = bisectForTarget((d) => measureAt(offsets, basis, d).maxAbs, CLIP_SAFETY_MAX_NDC);
  return Math.max(distanceForWidth, distanceForSafety);
}

/**
 * Fully autonomous, slow orbiting camera path - no user input of any kind. The terrain's
 * entire bounding box (all four ground corners and the tallest peaks) stays framed at a
 * consistent width throughout the whole orbit, for any aspect ratio, with a hard
 * guarantee against ever clipping a corner out of frame. A gentle breathing of the width
 * target and elevation angle keeps long recordings from feeling like a perfectly
 * repeating loop.
 */
export function updateOrbitCamera(camera: THREE.PerspectiveCamera, elapsed: number, opts: CameraPathOptions): void {
  const { bounds, widthTarget, widthBreath, elevationDeg, elevationBreathDeg, orbitSpeed } = opts;

  const angularSpeed = 0.045 * orbitSpeed; // radians / second - a full orbit takes a few minutes
  const azimuth = elapsed * angularSpeed;

  const elevation = THREE.MathUtils.degToRad(
    elevationDeg + elevationBreathDeg * Math.sin(elapsed * 0.08 * orbitSpeed + 1.3),
  );
  const width = widthTarget * (1 + widthBreath * Math.sin(elapsed * 0.05 * orbitSpeed));

  const dir = new THREE.Vector3(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth),
  );

  const vHalfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const distance = requiredDistance(dir, bounds.offsets, camera.aspect, vHalfFov, width);

  camera.position.copy(bounds.target).addScaledVector(dir, distance);
  camera.lookAt(bounds.target);
}
