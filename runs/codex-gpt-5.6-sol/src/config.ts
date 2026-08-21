export interface DemoConfig {
  seed: string;
  rainIntensity: number;
  simulationSpeed: number;
  gridSize: number;
  worldSize: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function finiteQueryNumber(params: URLSearchParams, key: string, fallback: number): number {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : fallback;
}

export function readConfig(search: string): DemoConfig {
  const params = new URLSearchParams(search);

  return {
    seed: params.get('seed')?.slice(0, 80) || 'alpine-dawn-42',
    rainIntensity: clamp(finiteQueryNumber(params, 'rain', 1), 0, 4),
    simulationSpeed: clamp(finiteQueryNumber(params, 'speed', 2.4), 0.2, 8),
    gridSize: 97,
    worldSize: 120,
  };
}
