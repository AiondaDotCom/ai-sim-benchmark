import { describe, expect, it } from 'vitest';
import { WaterSimulation } from '../src/simulation/water';

function terrain(width: number, height: number, heights: number[]) {
  return { width, height, heights: new Float64Array(heights) };
}

describe('water simulation', () => {
  it('approximately conserves mass in a closed system over many steps', () => {
    const width = 13;
    const height = 11;
    const heights = Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const z = Math.floor(index / width);
      return Math.sin(x * 0.73) * 1.8 + Math.cos(z * 0.51) * 1.2 + (x - 6) ** 2 * 0.025;
    });
    const simulation = new WaterSimulation(terrain(width, height, heights));
    for (let index = 0; index < simulation.water.length; index += 1) {
      simulation.water[index] = ((index * 37) % 19) / 17;
    }
    const initialMass = simulation.totalWater;

    for (let step = 0; step < 500; step += 1) simulation.step(0.025);

    expect(simulation.totalWater).toBeCloseTo(initialMass, 10);
    expect(Math.min(...simulation.water)).toBeGreaterThanOrEqual(0);
  });

  it('accounts exactly for rainfall and spring source additions', () => {
    const simulation = new WaterSimulation(terrain(4, 4, new Array(16).fill(0)));
    const result = simulation.step(0.2, {
      rainfallRate: 0.03,
      sources: [{ index: 5, radius: 1, rate: 0.7 }],
    });

    const expectedAddition = 16 * 0.03 * 0.2 + 0.7 * 0.2;
    expect(result.added).toBeCloseTo(expectedAddition, 12);
    expect(result.after - result.before).toBeCloseTo(expectedAddition, 12);
  });

  it('moves water toward lower hydraulic head', () => {
    const simulation = new WaterSimulation(terrain(3, 3, [
      3, 2, 1,
      3, 2, 1,
      3, 2, 1,
    ]));
    const center = 4;
    simulation.water[center] = 0.4;

    simulation.step(0.05);

    expect(simulation.water[5]).toBeGreaterThan(0);
    expect(simulation.water[3]).toBe(0);
    expect(simulation.velocityX[center]).toBeGreaterThan(0);
    expect(simulation.velocityZ[center]).toBeCloseTo(0, 12);
  });
});
