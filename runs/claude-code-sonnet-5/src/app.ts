import * as THREE from 'three';
import type { DemoConfig } from './config';
import { generateTerrain } from './sim/terrain';
import { WaterSimulation } from './sim/water';
import { createSceneEnvironment } from './render/scene';
import { buildTerrainMesh } from './render/terrainMesh';
import { buildWaterMesh } from './render/waterMesh';
import { createRainParticles } from './render/rainParticles';
import { computeTerrainBounds, updateOrbitCamera } from './render/cameraPath';

/** Upper bound on a single frame's delta-time, so a backgrounded/stalled tab can't destabilise the sim. */
const MAX_FRAME_DT = 1 / 20;

/**
 * Wires together the simulation and rendering layers into a fully autonomous
 * running demo. This is the only module that knows about both sides - the
 * simulation package and the render package otherwise never import each
 * other's internals directly (waterMesh reads plain data out of the sim
 * objects it's handed, it does not reach back into WaterSimulation logic).
 */
export function startApp(container: HTMLElement, config: DemoConfig): () => void {
  const terrain = generateTerrain({
    seed: config.seed,
    resolution: config.gridResolution,
    worldSize: config.worldSize,
    maxHeight: config.maxHeight,
  });

  const water = new WaterSimulation(terrain, {
    rainRate: config.baseRainRate * Math.max(0, config.rainMultiplier),
    springRate: config.springRate,
    springIndices: terrain.peakIndices,
    flowRate: config.flowRate,
    evaporationRate: config.evaporationRate,
  });

  const env = createSceneEnvironment(container);
  const terrainMesh = buildTerrainMesh(terrain);
  const waterMeshHandle = buildWaterMesh(terrain);
  const rain = createRainParticles(terrain);

  env.scene.add(terrainMesh);
  env.scene.add(waterMeshHandle.mesh);
  env.scene.add(rain.points);

  const cameraBounds = computeTerrainBounds(config.worldSize, config.maxHeight);
  const timer = new THREE.Timer();
  timer.connect(document); // avoids huge deltas after the tab was backgrounded

  let disposed = false;

  function frame(): void {
    if (disposed) return;
    requestAnimationFrame(frame);

    timer.update();
    const dt = Math.min(timer.getDelta(), MAX_FRAME_DT);
    const elapsed = timer.getElapsed();

    water.tick(dt * config.simSpeed);

    waterMeshHandle.update(water, terrain, elapsed, env.camera.position);
    if (config.rainMultiplier > 0) rain.update(dt);

    updateOrbitCamera(env.camera, elapsed, {
      bounds: cameraBounds,
      widthTarget: config.cameraWidthTarget,
      widthBreath: config.cameraWidthBreath,
      elevationDeg: config.cameraElevationDeg,
      elevationBreathDeg: config.cameraElevationBreathDeg,
      orbitSpeed: config.orbitSpeed,
    });

    env.renderer.render(env.scene, env.camera);
  }

  requestAnimationFrame(frame);

  return function stop(): void {
    disposed = true;
    timer.disconnect();
    env.dispose();
  };
}
