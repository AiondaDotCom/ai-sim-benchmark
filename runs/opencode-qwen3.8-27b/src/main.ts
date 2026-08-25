import { loadConfig } from './config';
import { Simulation, DEFAULT_SIM } from './sim/simulation';
import { SceneManager } from './render/scene';
import { CameraRig } from './render/camera-rig';

/**
 * Bootstrap: wire configuration -> simulation -> rendering -> animation loop.
 * This file is the only place the three layers meet. Nothing here makes
 * decisions about physics or visuals; it just pumps time through them.
 *
 * The simulation starts on load with no interaction: rain and springs run
 * from t=0 and the camera orbits on its own.
 */
function main(): void {
  const config = loadConfig();

  const sim = new Simulation({
    seed: config.seed,
    gridN: config.gridN,
    rainRate: DEFAULT_SIM.rainRate * config.rain,
    springRate: DEFAULT_SIM.springRate,
    numSprings: config.springs
  });

  const manager = new SceneManager();
  manager.addTerrain(sim.terrain);
  manager.addWater(sim.terrain);
  manager.addRain();
  manager.setRainIntensity(config.rain);
  const rig = new CameraRig(manager.camera);

  let last = performance.now();
  let wallTime = 0;

  const frame = (now: number): void => {
    // Clamp long frames (tab was backgrounded) so the sim can't explode.
    const dtReal = Math.min((now - last) / 1000, 0.1);
    last = now;
    wallTime += dtReal;

    sim.step(dtReal * config.speed);
    manager.updateWater(sim.depth, wallTime);
    manager.updateRain(dtReal * config.speed);
    manager.updateClouds(dtReal * config.speed);
    manager.updateGrade(wallTime);
    rig.update(wallTime); // camera first, so the sun can mirror it…
    manager.updateSun(wallTime); // …and the lake reflects the sun.
    manager.render();

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
