/**
 * Configuration and constants for the water simulation.
 * All values can be overridden via URL query parameters.
 */

export interface Config {
  // Terrain generation
  terrainSeed: number;
  terrainSize: number;
  terrainResolution: number;
  terrainScale: number;
  mountainHeight: number;

  // Water simulation
  rainRate: number;
  waterDissipation: number;
  flowRate: number;
  evaporationRate: number;

  // Rendering
  cameraOrbitRadius: number;
  cameraOrbitSpeed: number;
  cameraHeight: number;

  // Simulation
  simulationStepsPerFrame: number;
  timeScale: number;
}

const DEFAULT_CONFIG: Config = {
  terrainSeed: 12345,
  terrainSize: 256,
  terrainResolution: 128,
  terrainScale: 1.0,
  mountainHeight: 150,

  rainRate: 0.01, // CRITICAL FIX: much lower rainfall to avoid flooding
  waterDissipation: 0.98,
  flowRate: 0.3,
  evaporationRate: 0.02, // CRITICAL FIX: 10x higher evaporation to balance rainfall

  cameraOrbitRadius: 350,
  cameraOrbitSpeed: 0.0003,
  cameraHeight: 250, // CRITICAL: Must be above terrain top (157 units) to avoid clipping

  simulationStepsPerFrame: 4,
  timeScale: 1.0,
};

function getUrlParams(): Partial<Config> {
  const params: Partial<Config> = {};
  const searchParams = new URLSearchParams(window.location.search);

  searchParams.forEach((value, key) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      (params as any)[key] = numValue;
    }
  });

  return params;
}

export function getConfig(): Config {
  return {
    ...DEFAULT_CONFIG,
    ...getUrlParams(),
  };
}
