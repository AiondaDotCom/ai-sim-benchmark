/**
 * Numerically verifies the camera auto-framing model in src/render/cameraPath.ts by
 * re-implementing (deliberately independently of the app code, so this can't just
 * mirror a shared bug) the same width-span + anti-clip-safety distance formula, then
 * sweeping every aspect ratio / elevation / width-breath / azimuth combination the real
 * orbit can produce and reporting:
 *   - the terrain's actual on-screen WIDTH span (what "fills 60-80% of frame" means)
 *   - the actual on-screen HEIGHT span
 *   - the worst single corner's NDC magnitude (must never exceed 1.0, or something clips)
 *
 * Run with: node debug/verify_framing.mjs
 */
import * as THREE from 'three';

const worldSize = 220;
const maxHeight = 38;
const half = worldSize / 2;
const VFOV_DEG = 50;
const WIDTH_TARGET = 0.72;
const WIDTH_BREATH = 0.08;
const ELEVATION_DEG = 28;
const ELEVATION_BREATH_DEG = 6;
const CLIP_SAFETY_MAX_NDC = 0.92;

const target = new THREE.Vector3(0, maxHeight * 0.5, 0);
const corners = [];
for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [0, maxHeight]) corners.push(new THREE.Vector3(x, y, z));
const offsets = corners.map((c) => c.clone().sub(target));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function computeBasis(dir, aspect, vHalfFov) {
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const hHalfFov = Math.atan(Math.tan(vHalfFov) * aspect);
  return { forward, right, up, tanH: Math.tan(hHalfFov), tanV: Math.tan(vHalfFov) };
}

function measureAt(basis, distance) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxAbs = 0;
  for (const off of offsets) {
    const r = off.dot(basis.right), u = off.dot(basis.up), f = off.dot(basis.forward);
    const depth = distance + f;
    const ndcX = r / (depth * basis.tanH);
    const ndcY = u / (depth * basis.tanV);
    minX = Math.min(minX, ndcX); maxX = Math.max(maxX, ndcX);
    minY = Math.min(minY, ndcY); maxY = Math.max(maxY, ndcY);
    maxAbs = Math.max(maxAbs, Math.abs(ndcX), Math.abs(ndcY));
  }
  return { widthSpan: maxX - minX, heightSpan: maxY - minY, maxAbs };
}

function bisectForTarget(metric, target) {
  let lo = 10, hi = 6000;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (metric(mid) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function requiredDistance(dir, aspect, vHalfFov, widthTarget) {
  const basis = computeBasis(dir, aspect, vHalfFov);
  const dWidth = bisectForTarget((d) => measureAt(basis, d).widthSpan / 2, widthTarget);
  const dSafety = bisectForTarget((d) => measureAt(basis, d).maxAbs, CLIP_SAFETY_MAX_NDC);
  return { distance: Math.max(dWidth, dSafety), basis };
}

const vHalfFov = THREE.MathUtils.degToRad(VFOV_DEG) / 2;
let anyClip = false;
let anyTooNarrow = false;
let globalMaxDistance = 0;

console.log(`widthTarget=${WIDTH_TARGET} +-${(WIDTH_BREATH * 100).toFixed(0)}%, elevation=${ELEVATION_DEG} +-${ELEVATION_BREATH_DEG}deg, clipSafety=${CLIP_SAFETY_MAX_NDC}`);
for (const [label, aspect] of [
  ['ultrawide 21:9', 21 / 9],
  ['landscape 16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['square 1:1', 1],
  ['4:5', 4 / 5],
  ['portrait 9:16', 9 / 16],
  ['tall portrait 9:19.5', 9 / 19.5],
]) {
  let minW = Infinity, maxW = -Infinity, minH = Infinity, maxH = -Infinity, worstClip = 0;
  for (let i = 0; i <= 24; i++) {
    const az = (i / 24) * Math.PI * 2;
    for (const elevOffset of [-ELEVATION_BREATH_DEG, 0, ELEVATION_BREATH_DEG]) {
      for (const widthOffset of [-WIDTH_BREATH, 0, WIDTH_BREATH]) {
        const elevation = THREE.MathUtils.degToRad(ELEVATION_DEG + elevOffset);
        const width = WIDTH_TARGET * (1 + widthOffset);
        const dir = new THREE.Vector3(
          Math.cos(elevation) * Math.cos(az),
          Math.sin(elevation),
          Math.cos(elevation) * Math.sin(az),
        );
        const { distance, basis } = requiredDistance(dir, aspect, vHalfFov, width);
        globalMaxDistance = Math.max(globalMaxDistance, distance);
        const { widthSpan, heightSpan, maxAbs } = measureAt(basis, distance);
        minW = Math.min(minW, widthSpan / 2);
        maxW = Math.max(maxW, widthSpan / 2);
        minH = Math.min(minH, heightSpan / 2);
        maxH = Math.max(maxH, heightSpan / 2);
        worstClip = Math.max(worstClip, maxAbs);
      }
    }
  }
  if (worstClip > 1.0001) anyClip = true;
  if (minW < 0.35) anyTooNarrow = true; // sanity floor, not a hard product requirement
  console.log(
    `${label.padEnd(22)} aspect=${aspect.toFixed(2)}  width ${(minW * 100).toFixed(0)}-${(maxW * 100).toFixed(0)}%  height ${(minH * 100).toFixed(0)}-${(maxH * 100).toFixed(0)}%  worstCornerNDC=${worstClip.toFixed(2)}  ${worstClip > 1.0001 ? 'CLIP!' : 'ok'}`,
  );
}

console.log(`\nWorst-case camera distance across the whole sweep: ${globalMaxDistance.toFixed(1)} units`);
console.log('(scene.ts sky dome / fog / camera-far-plane must comfortably exceed this.)');
const pass = !anyClip;
console.log(
  pass
    ? '\nPASS: no corner ever clips out of frame, and width tracks the target (backing off only when clipping would otherwise occur, e.g. wide aspects at oblique angles).'
    : '\nFAIL: at least one corner clipped out of frame - see CLIP! rows above.',
);
process.exit(pass ? 0 : 1);
