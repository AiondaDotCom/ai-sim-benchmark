/**
 * Fixed-timestep driver with proper time scaling: slow motion scales the
 * amount of simulated time per real second (accumulator), never the step
 * size — so simulation results are identical at any time scale.
 */
import { World, FIXED_DT } from './world';
import { timeScaleAt } from './timeline';

export class FixedStepper {
  private acc = 0;
  /** External (config) scale multiplied with the choreographed scale. */
  constructor(
    public world: World,
    public configScale = 1,
    /** When false, the choreographed slow-mo windows are ignored (tests). */
    public useChoreographedScale = true,
  ) {}

  /** Current effective time scale. */
  scale(): number {
    const choreo = this.useChoreographedScale ? timeScaleAt(this.world.t) : 1;
    return choreo * this.configScale;
  }

  /**
   * Advance by realDt seconds of wall-clock time. Returns number of fixed
   * steps executed.
   */
  advance(realDt: number): number {
    // Clamp huge frame gaps (tab switches) to keep the sim responsive.
    const clamped = Math.min(realDt, 0.25);
    this.acc += clamped * this.scale();
    let steps = 0;
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      this.world.step(FIXED_DT);
      steps++;
      if (steps > 2000) break; // safety valve
    }
    return steps;
  }
}
