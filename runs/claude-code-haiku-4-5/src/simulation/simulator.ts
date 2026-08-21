/**
 * Main simulation orchestrator.
 */

import { Config } from '../config.js';
import {
  TerrainData,
  generateTerrain,
  getHeightAt,
  getGradientAt,
} from './terrain.js';
import {
  WaterSimulationState,
  initializeWater,
  stepWaterSimulation,
  getWaterMass,
} from './water.js';

export interface SimulationState {
  terrain: TerrainData;
  water: WaterSimulationState;
  time: number;
  waterMassHistory: number[];
}

export function initializeSimulation(config: Config): SimulationState {
  const terrain = generateTerrain(
    config.terrainResolution,
    config.terrainResolution,
    config.terrainSeed,
    config.mountainHeight
  );

  const water = initializeWater(
    config.terrainResolution,
    config.terrainResolution
  );

  return {
    terrain,
    water,
    time: 0,
    waterMassHistory: [],
  };
}

export function stepSimulation(
  state: SimulationState,
  config: Config
): void {
  const steps = config.simulationStepsPerFrame;

  for (let i = 0; i < steps; i++) {
    stepWaterSimulation(state.water, state.terrain, {
      rainRate: config.rainRate,
      flowRate: config.flowRate,
      evaporationRate: config.evaporationRate,
      waterDissipation: config.waterDissipation,
    });

    state.time += config.timeScale;
  }

  // Track water mass for conservation checks
  const mass = getWaterMass(state.water);
  state.waterMassHistory.push(mass);
  if (state.waterMassHistory.length > 300) {
    state.waterMassHistory.shift();
  }
}

/**
 * Get terrain height at world coordinates.
 */
export function getTerrainHeightAt(
  state: SimulationState,
  x: number,
  y: number
): number {
  // Convert world coordinates to terrain grid
  const gridX = ((x / state.terrain.width) + 0.5) * state.terrain.width;
  const gridY = ((y / state.terrain.height) + 0.5) * state.terrain.height;
  return getHeightAt(state.terrain, gridX, gridY);
}

/**
 * Get water height at world coordinates.
 */
export function getWaterHeightAt(
  state: SimulationState,
  x: number,
  y: number
): number {
  const gridX = ((x / state.terrain.width) + 0.5) * state.terrain.width;
  const gridY = ((y / state.terrain.height) + 0.5) * state.terrain.height;
  const xi = Math.max(0, Math.min(state.terrain.width - 1, Math.round(gridX)));
  const yi = Math.max(0, Math.min(state.terrain.height - 1, Math.round(gridY)));
  return state.water.waterHeight[yi * state.terrain.width + xi];
}

/**
 * Get downhill gradient at a point (for testing).
 */
export function getGradientAtPoint(
  state: SimulationState,
  x: number,
  y: number
): [number, number] {
  const gridX = ((x / state.terrain.width) + 0.5) * state.terrain.width;
  const gridY = ((y / state.terrain.height) + 0.5) * state.terrain.height;
  return getGradientAt(state.terrain, gridX, gridY);
}

/**
 * Get average water mass over last N frames.
 */
export function getAverageWaterMass(state: SimulationState): number {
  if (state.waterMassHistory.length === 0) return 0;
  const sum = state.waterMassHistory.reduce((a, b) => a + b, 0);
  return sum / state.waterMassHistory.length;
}

/**
 * Get water mass standard deviation (should be low for stable simulation).
 */
export function getWaterMassStability(state: SimulationState): number {
  if (state.waterMassHistory.length < 2) return 0;
  const mean = getAverageWaterMass(state);
  const variance =
    state.waterMassHistory.reduce((sum, mass) => {
      return sum + (mass - mean) ** 2;
    }, 0) / state.waterMassHistory.length;
  return Math.sqrt(variance);
}
