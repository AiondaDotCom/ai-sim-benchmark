/**
 * Water flow simulation using shallow water equations.
 */

import { TerrainData, getHeightAt, getGradientAt } from './terrain.js';

export interface WaterSimulationState {
  waterHeight: Float32Array; // Water height at each cell
  velocity: Float32Array; // Velocity components [vx, vy] per cell
  width: number;
  gridHeight: number;
}

/**
 * Initialize water simulation with zero water everywhere.
 */
export function initializeWater(
  width: number,
  height: number
): WaterSimulationState {
  return {
    waterHeight: new Float32Array(width * height),
    velocity: new Float32Array(width * height * 2),
    width,
    gridHeight: height,
  };
}

function getWaterHeightAt(
  water: WaterSimulationState,
  x: number,
  y: number
): number {
  x = Math.max(0, Math.min(water.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(water.gridHeight - 1, Math.round(y)));
  return water.waterHeight[y * water.width + x];
}

function setWaterHeightAt(
  water: WaterSimulationState,
  x: number,
  y: number,
  value: number
): void {
  x = Math.max(0, Math.min(water.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(water.gridHeight - 1, Math.round(y)));
  water.waterHeight[y * water.width + x] = Math.max(0, value);
}

function getVelocityAt(
  water: WaterSimulationState,
  x: number,
  y: number
): [number, number] {
  x = Math.max(0, Math.min(water.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(water.gridHeight - 1, Math.round(y)));
  const idx = y * water.width + x;
  return [water.velocity[idx * 2], water.velocity[idx * 2 + 1]];
}

function setVelocityAt(
  water: WaterSimulationState,
  x: number,
  y: number,
  vx: number,
  vy: number
): void {
  x = Math.max(0, Math.min(water.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(water.gridHeight - 1, Math.round(y)));
  const idx = y * water.width + x;
  water.velocity[idx * 2] = vx;
  water.velocity[idx * 2 + 1] = vy;
}

/**
 * Apply rainfall to terrain - water accumulates at peak points.
 */
export function applyRainfall(
  water: WaterSimulationState,
  terrain: TerrainData,
  rainRate: number
): void {
  // CRITICAL FIX: Only rain on high elevations, not everywhere
  const threshold = terrain.minHeight + (terrain.maxHeight - terrain.minHeight) * 0.5;

  for (let y = 0; y < water.gridHeight; y++) {
    for (let x = 0; x < water.width; x++) {
      const idx = y * water.width + x;
      const height = terrain.heights[idx];

      // Only add rain to cells above median elevation
      if (height > threshold) {
        const elevation = (height - threshold) / (terrain.maxHeight - threshold);
        water.waterHeight[idx] += rainRate * elevation;
      }
    }
  }
}

/**
 * Apply evaporation and dissipation.
 */
export function applyEvaporation(
  water: WaterSimulationState,
  evaporationRate: number
): void {
  for (let i = 0; i < water.waterHeight.length; i++) {
    water.waterHeight[i] *= (1.0 - evaporationRate);
  }
}

/**
 * Update water velocities based on terrain gradient and water surface pressure.
 */
export function updateVelocities(
  water: WaterSimulationState,
  terrain: TerrainData,
  flowRate: number
): void {
  const tempVelocity = new Float32Array(water.velocity.length);

  for (let y = 1; y < water.gridHeight - 1; y++) {
    for (let x = 1; x < water.width - 1; x++) {
      const idx = y * water.width + x;

      // Get terrain gradient (downhill direction)
      const [gradX, gradY] = getGradientAt(terrain, x, y, 1.0);

      // Get current water height and velocity
      const waterH = water.waterHeight[idx];
      const [vx, vy] = getVelocityAt(water, x, y);

      // Water surface elevation = terrain height + water height
      const surfaceElev = getHeightAt(terrain, x, y) + waterH;

      // Check neighbors' surface elevations
      let pressureGradX = 0;
      let pressureGradY = 0;
      let count = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;

          const neighborWaterH = getWaterHeightAt(water, nx, ny);
          const neighborTerrainH = getHeightAt(terrain, nx, ny);
          const neighborSurfaceElev = neighborTerrainH + neighborWaterH;

          pressureGradX += (surfaceElev - neighborSurfaceElev) * (dx ? 1 : 0);
          pressureGradY += (surfaceElev - neighborSurfaceElev) * (dy ? 1 : 0);
          count += 1;
        }
      }

      // Average the pressure gradients
      pressureGradX /= count;
      pressureGradY /= count;

      // Combine terrain gradient and pressure gradient
      const terrainInfluence = 0.6;
      const totalGradX = gradX * terrainInfluence + pressureGradX * (1 - terrainInfluence);
      const totalGradY = gradY * terrainInfluence + pressureGradY * (1 - terrainInfluence);

      // Update velocity towards gradient direction
      const newVx = vx * 0.95 + totalGradX * flowRate;
      const newVy = vy * 0.95 + totalGradY * flowRate;

      // Cap velocity
      const speed = Math.sqrt(newVx * newVx + newVy * newVy);
      const maxSpeed = waterH > 0.1 ? 5.0 : 1.0;
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        tempVelocity[idx * 2] = newVx * scale;
        tempVelocity[idx * 2 + 1] = newVy * scale;
      } else {
        tempVelocity[idx * 2] = newVx;
        tempVelocity[idx * 2 + 1] = newVy;
      }
    }
  }

  // Copy back
  water.velocity.set(tempVelocity);
}

/**
 * Transport water based on velocities.
 */
export function transportWater(
  water: WaterSimulationState,
  terrain: TerrainData,
  dissipation: number
): void {
  const tempHeight = new Float32Array(water.waterHeight);

  for (let y = 1; y < water.gridHeight - 1; y++) {
    for (let x = 1; x < water.width - 1; x++) {
      const idx = y * water.width + x;
      const h = water.waterHeight[idx];

      if (h < 0.01) continue;

      const [vx, vy] = getVelocityAt(water, x, y);

      // Move water in velocity direction
      const moveX = x - vx;
      const moveY = y - vy;

      // Bilinear interpolation of source water
      const xi = Math.floor(moveX);
      const yi = Math.floor(moveY);
      const xf = moveX - xi;
      const yf = moveY - yi;

      if (xi >= 0 && xi < water.width - 1 && yi >= 0 && yi < water.gridHeight - 1) {
        const h00 = getWaterHeightAt(water, xi, yi);
        const h10 = getWaterHeightAt(water, xi + 1, yi);
        const h01 = getWaterHeightAt(water, xi, yi + 1);
        const h11 = getWaterHeightAt(water, xi + 1, yi + 1);

        const hx0 = h00 + (h10 - h00) * xf;
        const hx1 = h01 + (h11 - h01) * xf;
        const sourceH = hx0 + (hx1 - hx0) * yf;

        tempHeight[idx] = sourceH * dissipation;
      }
    }
  }

  water.waterHeight.set(tempHeight);
}

/**
 * Redistribute water to flatten local pressure (simple diffusion).
 */
export function diffuseWater(water: WaterSimulationState): void {
  const tempHeight = new Float32Array(water.waterHeight);

  for (let y = 1; y < water.gridHeight - 1; y++) {
    for (let x = 1; x < water.width - 1; x++) {
      const idx = y * water.width + x;
      const h = water.waterHeight[idx];

      // Average with neighbors
      let sum = h;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighborIdx = (y + dy) * water.width + (x + dx);
          sum += water.waterHeight[neighborIdx];
        }
      }

      tempHeight[idx] = sum / 9.0;
    }
  }

  water.waterHeight.set(tempHeight);
}

/**
 * Full simulation step.
 */
export function stepWaterSimulation(
  water: WaterSimulationState,
  terrain: TerrainData,
  params: {
    rainRate: number;
    flowRate: number;
    evaporationRate: number;
    waterDissipation: number;
  }
): void {
  applyRainfall(water, terrain, params.rainRate);
  updateVelocities(water, terrain, params.flowRate);
  transportWater(water, terrain, params.waterDissipation);
  diffuseWater(water);
  applyEvaporation(water, params.evaporationRate);
}

/**
 * Calculate total water mass in the simulation.
 */
export function getWaterMass(water: WaterSimulationState): number {
  let total = 0;
  for (let i = 0; i < water.waterHeight.length; i++) {
    total += water.waterHeight[i];
  }
  return total;
}
