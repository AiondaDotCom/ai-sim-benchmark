/** Fixed-timestep clock.
 *
 *  Slow motion is a property of the *simulation*, never of the render loop: a
 *  real-time delta is multiplied by the current time scale before it is fed into
 *  the accumulator, so at 0.1x the simulation advances exactly one tenth as far
 *  per real second while the renderer keeps drawing at full frame rate.
 */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

/** Guards against a tab-switch producing a thousand catch-up steps. */
const MAX_REAL_DELTA = 0.25;

export class FixedClock {
  readonly dt: number;
  /** Simulation ("story") time in seconds. */
  simTime = 0;
  /** Number of fixed steps executed since construction. */
  steps = 0;
  /** Left-over sim seconds, used to interpolate the render pose. */
  accumulator = 0;

  constructor(dt: number = SIM_DT) {
    this.dt = dt;
  }

  /**
   * Feed one real-time frame delta. Returns how many fixed steps should run.
   * `timeScale` is the current story-time scale (1 = real time, 0.1 = slow-mo).
   */
  advance(realDelta: number, timeScale: number): number {
    const d = Math.min(Math.max(realDelta, 0), MAX_REAL_DELTA);
    this.accumulator += d * timeScale;
    let n = 0;
    while (this.accumulator >= this.dt - 1e-12) {
      this.accumulator -= this.dt;
      n++;
    }
    return n;
  }

  /** Called by the world after each executed fixed step. */
  tick(): void {
    this.simTime += this.dt;
    this.steps++;
  }

  /** 0..1 interpolation factor between the last and the next fixed step. */
  get alpha(): number {
    return this.accumulator / this.dt;
  }
}
