/**
 * Tests for water simulation.
 */

import {
  initializeWater,
  stepWaterSimulation,
  getWaterMass,
} from '../simulation/water.js';
import { generateTerrain } from '../simulation/terrain.js';

export function testWaterInitialization(): boolean {
  console.log('Testing: Water initialization');

  const water = initializeWater(64, 64);

  if (water.width !== 64 || water.gridHeight !== 64) {
    console.error('  FAIL: Water dimensions are incorrect');
    return false;
  }

  if (water.waterHeight.length !== 64 * 64) {
    console.error('  FAIL: Water height array size is incorrect');
    return false;
  }

  if (water.velocity.length !== 64 * 64 * 2) {
    console.error('  FAIL: Water velocity array size is incorrect');
    return false;
  }

  // Check all water is zero initially
  let totalWater = 0;
  for (let i = 0; i < water.waterHeight.length; i++) {
    totalWater += water.waterHeight[i];
  }

  if (totalWater > 0.001) {
    console.error('  FAIL: Water is not zero initially');
    return false;
  }

  console.log('  PASS: Water initialization correct');
  return true;
}

export function testWaterMassConservation(): boolean {
  console.log('Testing: Approximate water mass conservation');

  const water = initializeWater(64, 64);
  const terrain = generateTerrain(64, 64, 12345, 100);

  // Add some water
  for (let i = 0; i < water.waterHeight.length; i++) {
    water.waterHeight[i] = 0.5;
  }

  const initialMass = getWaterMass(water);

  // Run several simulation steps
  for (let step = 0; step < 20; step++) {
    stepWaterSimulation(water, terrain, {
      rainRate: 0.05,
      flowRate: 0.3,
      evaporationRate: 0.001,
      waterDissipation: 0.99,
    });
  }

  const finalMass = getWaterMass(water);

  // Water should decrease due to evaporation but not dramatically
  const massLoss = initialMass - finalMass;
  const massLossPercent = (massLoss / initialMass) * 100;

  console.log(`  Initial mass: ${initialMass.toFixed(2)}`);
  console.log(`  Final mass: ${finalMass.toFixed(2)}`);
  console.log(`  Loss: ${massLossPercent.toFixed(2)}%`);

  // After 20 steps with low evaporation, should lose less than 10%
  if (massLossPercent > 10) {
    console.error('  FAIL: Water mass loss is too high');
    return false;
  }

  if (finalMass < 0) {
    console.error('  FAIL: Water mass became negative');
    return false;
  }

  console.log('  PASS: Water mass conservation is reasonable');
  return true;
}

export function testWaterFlowsDownhill(): boolean {
  console.log('Testing: Water flows downhill');

  const water = initializeWater(64, 64);
  const terrain = generateTerrain(64, 64, 12345, 100);

  // Create a simple slope: higher on one side, lower on the other
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = y * 64 + x;
      // Override with simple slope
      terrain.heights[idx] = x * 0.5; // Heights increase to the right
    }
  }

  // Add water in the middle
  for (let y = 20; y < 44; y++) {
    for (let x = 20; x < 44; x++) {
      water.waterHeight[y * 64 + x] = 1.0;
    }
  }

  const initialLeftWater = getWaterInRegion(water, 0, 20, 1);
  const initialRightWater = getWaterInRegion(water, 50, 64, 1);

  console.log(`  Initial water on left side: ${initialLeftWater.toFixed(2)}`);
  console.log(`  Initial water on right side: ${initialRightWater.toFixed(2)}`);

  // Run simulation
  for (let step = 0; step < 30; step++) {
    stepWaterSimulation(water, terrain, {
      rainRate: 0.0, // No rainfall
      flowRate: 0.3,
      evaporationRate: 0.0, // No evaporation for this test
      waterDissipation: 1.0, // No dissipation for this test
    });
  }

  const finalLeftWater = getWaterInRegion(water, 0, 20, 1);
  const finalRightWater = getWaterInRegion(water, 50, 64, 1);

  console.log(`  Final water on left side: ${finalLeftWater.toFixed(2)}`);
  console.log(`  Final water on right side: ${finalRightWater.toFixed(2)}`);

  // Water should flow from higher (right) to lower (left) due to pressure
  if (finalLeftWater <= initialLeftWater) {
    console.error('  FAIL: Water did not flow towards low point');
    return false;
  }

  console.log('  PASS: Water flows downhill correctly');
  return true;
}

function getWaterInRegion(
  water: any,
  xStart: number,
  xEnd: number,
  yPadding: number
): number {
  let total = 0;
  for (let y = yPadding; y < 64 - yPadding; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (x >= 0 && x < 64) {
        total += water.waterHeight[y * 64 + x];
      }
    }
  }
  return total;
}

export function testWaterStability(): boolean {
  console.log('Testing: Water simulation stability');

  const water = initializeWater(128, 128);
  const terrain = generateTerrain(128, 128, 12345, 100);

  const masses: number[] = [];

  // Run many steps
  for (let step = 0; step < 100; step++) {
    stepWaterSimulation(water, terrain, {
      rainRate: 0.08,
      flowRate: 0.3,
      evaporationRate: 0.002,
      waterDissipation: 0.99,
    });

    masses.push(getWaterMass(water));
  }

  // Check for NaN or infinite values
  for (const mass of masses) {
    if (!isFinite(mass)) {
      console.error('  FAIL: Water mass became NaN or infinite');
      return false;
    }
  }

  // Check that mass stabilizes (recent values similar)
  const recentMasses = masses.slice(-20);
  const mean = recentMasses.reduce((a, b) => a + b) / recentMasses.length;
  const variance =
    recentMasses.reduce((sum, m) => sum + (m - mean) ** 2, 0) /
    recentMasses.length;
  const stdDev = Math.sqrt(variance);
  const variationPercent = (stdDev / mean) * 100;

  console.log(`  Final water mass: ${recentMasses[recentMasses.length - 1].toFixed(2)}`);
  console.log(`  Recent variation: ${variationPercent.toFixed(2)}%`);

  if (variationPercent > 50) {
    console.error('  FAIL: Water mass variation is too high (unstable)');
    return false;
  }

  console.log('  PASS: Water simulation is stable');
  return true;
}
