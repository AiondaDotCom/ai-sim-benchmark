import type { DemoConfig } from './config';
import { WorldRenderer } from './rendering/WorldRenderer';
import { generateTerrain } from './simulation/terrain';
import { createRainMask, createSpringSources, WaterSimulation } from './simulation/water';

export class WaterDemo {
  private readonly simulation: WaterSimulation;
  private readonly renderer: WorldRenderer;
  private readonly rainMask: Float64Array;
  private readonly springs: ReturnType<typeof createSpringSources>;
  private readonly config: DemoConfig;
  private previousTime = 0;
  private elapsed = 0;

  constructor(container: HTMLElement, config: DemoConfig) {
    this.config = config;
    const terrain = generateTerrain(config.seed, config.gridSize, config.worldSize);
    this.simulation = new WaterSimulation(terrain);
    this.rainMask = createRainMask(terrain);
    this.springs = createSpringSources(terrain.peaks, terrain.width);
    this.renderer = new WorldRenderer(container, terrain, config.seed, config.rainIntensity);

    // Begin the film with established rivulets while leaving plenty of visible evolution.
    for (let step = 0; step < 620; step += 1) {
      this.simulation.step(0.045, {
        rainfallRate: 0.0009 * config.rainIntensity,
        rainMask: this.rainMask,
        sources: this.springs,
      });
    }
  }

  start(): void {
    requestAnimationFrame(this.animate);
  }

  private readonly animate = (timeMs: number): void => {
    const now = timeMs / 1000;
    const frameDt = this.previousTime === 0 ? 1 / 60 : Math.min(0.05, now - this.previousTime);
    this.previousTime = now;
    this.elapsed += frameDt;

    let simulationDt = frameDt * this.config.simulationSpeed;
    const maxStep = 0.045;
    while (simulationDt > 0) {
      const dt = Math.min(maxStep, simulationDt);
      const rainPulse = 0.8 + Math.sin(this.elapsed * 0.14) * 0.2;
      this.simulation.step(dt, {
        rainfallRate: 0.0009 * this.config.rainIntensity * rainPulse,
        rainMask: this.rainMask,
        sources: this.springs,
      });
      simulationDt -= dt;
    }

    this.renderer.update(this.simulation, this.elapsed, frameDt);
    requestAnimationFrame(this.animate);
  };
}
