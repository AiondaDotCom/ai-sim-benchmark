import { SIM_DT } from '../src/sim/clock.ts';
import { END_TIME } from '../src/sim/choreography.ts';
import { World, type WorldOptions } from '../src/sim/world.ts';

/** Run the world for `seconds` of story time. */
export function run(world: World, seconds: number): World {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) world.step();
  return world;
}

export function runFull(opts: WorldOptions = {}): World {
  const w = new World({ recordEvents: true, ...opts });
  return run(w, END_TIME);
}
