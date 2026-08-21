/**
 * Test runner for all simulation tests.
 * Run with: npm test
 */

import * as terrainTests from './terrain.test.js';
import * as waterTests from './water.test.js';

async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Water Simulation Test Suite');
  console.log('='.repeat(60));

  const tests: Array<[string, () => boolean]> = [
    // Terrain tests
    ['Terrain: Deterministic generation', terrainTests.testDeterministicTerrainGeneration],
    ['Terrain: Height bounds', terrainTests.testTerrainHeightBounds],
    ['Terrain: Height interpolation', terrainTests.testHeightInterpolation],
    ['Terrain: Gradient direction', terrainTests.testGradientDirection],

    // Water tests
    ['Water: Initialization', waterTests.testWaterInitialization],
    ['Water: Mass conservation', waterTests.testWaterMassConservation],
    ['Water: Flows downhill', waterTests.testWaterFlowsDownhill],
    ['Water: Stability', waterTests.testWaterStability],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, testFn] of tests) {
    try {
      const result = testFn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`  ERROR in ${name}:`, error);
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
