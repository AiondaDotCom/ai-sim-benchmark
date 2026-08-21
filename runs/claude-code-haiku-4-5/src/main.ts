/**
 * Bootstrap the water simulation application.
 * IMPORTANT: No user interaction UI - starts automatically on page load.
 */

import { getConfig } from './config.js';
import { initializeSimulation, stepSimulation } from './simulation/simulator.js';
import { WaterSimulationRenderer } from './renderer/renderer.js';

async function main(): Promise<void> {
  const config = getConfig();

  // Initialize simulation
  const simulationState = initializeSimulation(config);

  // Initialize renderer
  const width = window.innerWidth;
  const height = window.innerHeight;
  const renderer = new WaterSimulationRenderer(width, height);

  // Create initial visualization
  renderer.updateTerrainVisualization(simulationState);
  renderer.updateWaterVisualization(simulationState);

  // Expose state for debugging
  (window as any).debugState = simulationState;
  (window as any).debugConfig = config;

  let lastUpdateTime = Date.now();
  let frameCount = 0;
  let debugLogCount = 0;

  function animate(): void {
    requestAnimationFrame(animate);

    // Update simulation
    stepSimulation(simulationState, config);

    // Update visualizations periodically (every 2 frames) to reduce load
    frameCount++;
    if (frameCount % 2 === 0) {
      renderer.updateWaterVisualization(simulationState);
    }

    // DEBUG: Log stats every ~30 frames (~0.5 sec)
    if (frameCount % 30 === 0) {
      debugLogCount++;
      if (debugLogCount === 1 || debugLogCount % 5 === 0) {
        // Compute water statistics
        let waterCount = 0, waterSum = 0, waterMax = 0;
        for (let i = 0; i < simulationState.water.waterHeight.length; i++) {
          const wh = simulationState.water.waterHeight[i];
          if (wh > 0.001) {
            waterCount++;
            waterSum += wh;
            waterMax = Math.max(waterMax, wh);
          }
        }
        const totalCells = simulationState.water.waterHeight.length;
        const wetPercent = (waterCount / totalCells) * 100;
        console.log(
          `[SIM ${debugLogCount * 0.5}s] Terrain relief: ${simulationState.terrain.maxHeight - simulationState.terrain.minHeight
          } | ` +
          `Water: ${waterCount}/${totalCells} cells wet (${wetPercent.toFixed(1)}%) | ` +
          `Max height: ${waterMax.toFixed(4)}, Avg wet: ${(waterSum / Math.max(1, waterCount)).toFixed(4)}`
        );
      }
    }

    // Update camera with orbit and actual terrain bounds
    const now = Date.now();
    const elapsed = now - lastUpdateTime;
    lastUpdateTime = now;
    renderer.updateCamera(
      config,
      simulationState.time,
      simulationState.terrain.maxHeight * 3.5 // Account for height scaling
    );

    // Render
    renderer.render();
  }

  animate();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main().catch(console.error);
}
