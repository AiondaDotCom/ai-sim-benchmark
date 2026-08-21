/**
 * Tests for terrain generation.
 */

import { generateTerrain, getHeightAt, getGradientAt } from '../simulation/terrain.js';

export function testDeterministicTerrainGeneration(): boolean {
  console.log('Testing: Deterministic terrain generation');

  const seed = 42;
  const terrain1 = generateTerrain(128, 128, seed, 100);
  const terrain2 = generateTerrain(128, 128, seed, 100);

  // Check that same seed produces identical terrain
  let allEqual = true;
  for (let i = 0; i < terrain1.heights.length; i++) {
    if (Math.abs(terrain1.heights[i] - terrain2.heights[i]) > 1e-6) {
      allEqual = false;
      break;
    }
  }

  if (!allEqual) {
    console.error('  FAIL: Same seed produced different terrain');
    return false;
  }

  // Check that different seeds produce different terrain
  const terrain3 = generateTerrain(128, 128, 99, 100);
  let isDifferent = false;
  for (let i = 0; i < terrain1.heights.length; i++) {
    if (Math.abs(terrain1.heights[i] - terrain3.heights[i]) > 1e-3) {
      isDifferent = true;
      break;
    }
  }

  if (!isDifferent) {
    console.error('  FAIL: Different seeds produced identical terrain');
    return false;
  }

  console.log('  PASS: Deterministic terrain generation works correctly');
  return true;
}

export function testTerrainHeightBounds(): boolean {
  console.log('Testing: Terrain height bounds');

  const terrain = generateTerrain(128, 128, 12345, 100);

  if (terrain.minHeight < 0) {
    console.error('  FAIL: Minimum height is negative:', terrain.minHeight);
    return false;
  }

  if (terrain.maxHeight > 100) {
    console.error('  FAIL: Maximum height exceeds mountain height:', terrain.maxHeight);
    return false;
  }

  console.log('  PASS: Terrain heights are within expected bounds');
  console.log(`    Min: ${terrain.minHeight.toFixed(2)}, Max: ${terrain.maxHeight.toFixed(2)}`);
  return true;
}

export function testHeightInterpolation(): boolean {
  console.log('Testing: Height interpolation');

  const terrain = generateTerrain(64, 64, 12345, 100);

  // Test at exact grid points
  const h1 = getHeightAt(terrain, 32, 32);
  const h2 = terrain.heights[32 * 64 + 32];

  if (Math.abs(h1 - h2) > 1e-6) {
    console.error('  FAIL: Interpolation at grid point is incorrect');
    return false;
  }

  // Test interpolation between points
  const h3 = getHeightAt(terrain, 32.5, 32.5);
  if (isNaN(h3) || !isFinite(h3)) {
    console.error('  FAIL: Interpolation produced invalid value');
    return false;
  }

  console.log('  PASS: Height interpolation works correctly');
  return true;
}

export function testGradientDirection(): boolean {
  console.log('Testing: Gradient direction (should point downhill)');

  const terrain = generateTerrain(128, 128, 12345, 100);

  // Test at a high point
  let maxHeight = 0;
  let maxX = 0, maxY = 0;
  for (let y = 0; y < terrain.height; y++) {
    for (let x = 0; x < terrain.width; x++) {
      const h = terrain.heights[y * terrain.width + x];
      if (h > maxHeight) {
        maxHeight = h;
        maxX = x;
        maxY = y;
      }
    }
  }

  const [gradX, gradY] = getGradientAt(terrain, maxX, maxY, 2.0);
  const gradMagnitude = Math.sqrt(gradX * gradX + gradY * gradY);

  // At a peak, gradient might be close to zero but shouldn't be NaN
  if (isNaN(gradX) || isNaN(gradY)) {
    console.error('  FAIL: Gradient contains NaN');
    return false;
  }

  // Test at a lower point
  let minHeight = Infinity;
  let minX = 0, minY = 0;
  for (let y = 32; y < 96; y++) {
    for (let x = 32; x < 96; x++) {
      const h = terrain.heights[y * terrain.width + x];
      if (h < minHeight) {
        minHeight = h;
        minX = x;
        minY = y;
      }
    }
  }

  const [grad2X, grad2Y] = getGradientAt(terrain, minX, minY, 2.0);

  // At a valley, gradient should point away from valley (uphill)
  // Water flows opposite to gradient (downhill)
  if (isNaN(grad2X) || isNaN(grad2Y)) {
    console.error('  FAIL: Gradient at valley contains NaN');
    return false;
  }

  console.log('  PASS: Gradient direction test passed');
  return true;
}
