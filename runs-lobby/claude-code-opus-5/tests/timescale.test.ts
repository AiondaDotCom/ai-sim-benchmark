import { describe, expect, it } from 'vitest';
import { FixedClock, SIM_DT, SIM_HZ } from '../src/sim/clock.ts';
import { SLOWMO, timeScaleAt } from '../src/sim/choreography.ts';
import { World } from '../src/sim/world.ts';

describe('time scale', () => {
  it('advances exactly 1/10 as far per real second at 0.1x', () => {
    const full = new FixedClock();
    const slow = new FixedClock();
    let fullSteps = 0;
    let slowSteps = 0;
    // one real second, fed as 60 render frames
    for (let i = 0; i < 60; i++) {
      fullSteps += full.advance(1 / 60, 1.0);
      slowSteps += slow.advance(1 / 60, 0.1);
    }
    expect(fullSteps).toBe(SIM_HZ);
    expect(slowSteps).toBe(SIM_HZ / 10);
    expect(slowSteps * 10).toBe(fullSteps);
  });

  it('is independent of the render frame rate', () => {
    for (const fps of [24, 30, 60, 144]) {
      const c = new FixedClock();
      let steps = 0;
      for (let i = 0; i < fps; i++) steps += c.advance(1 / fps, 0.25);
      expect(steps).toBe(30); // 0.25 s of story time at 120 Hz
    }
  });

  it('moves the simulation exactly one tenth as far in story time', () => {
    const fast = new World({ seed: 3, forceTimeScale: 1 });
    const slow = new World({ seed: 3, forceTimeScale: 0.1 });
    const clockFast = new FixedClock();
    const clockSlow = new FixedClock();
    for (let i = 0; i < 120; i++) {
      for (let n = clockFast.advance(1 / 60, fast.timeScale); n > 0; n--) fast.step();
      for (let n = clockSlow.advance(1 / 60, slow.timeScale); n > 0; n--) slow.step();
    }
    expect(fast.time).toBeCloseTo(2.0, 6);
    expect(slow.time).toBeCloseTo(0.2, 6);
    expect(slow.steps * 10).toBe(fast.steps);
  });

  it('never slows the fixed timestep itself', () => {
    const w = new World({ seed: 1, forceTimeScale: 0.05 });
    const before = w.time;
    w.step();
    expect(w.time - before).toBeCloseTo(SIM_DT, 12);
  });

  it('ramps smoothly in and out of every slow-motion window', () => {
    for (const win of SLOWMO) {
      expect(timeScaleAt(win.t0 - win.ramp - 0.01)).toBeCloseTo(1, 6);
      expect(timeScaleAt((win.t0 + win.t1) / 2)).toBeCloseTo(win.scale, 6);
      expect(timeScaleAt(win.t1 + win.ramp + 0.01)).toBeCloseTo(1, 6);
      // continuous: no jump larger than a few percent between adjacent samples
      let prev = timeScaleAt(win.t0 - win.ramp - 0.2);
      for (let t = win.t0 - win.ramp - 0.2; t < win.t1 + win.ramp + 0.2; t += 1 / 120) {
        const s = timeScaleAt(t);
        expect(Math.abs(s - prev)).toBeLessThan(0.07);
        prev = s;
      }
    }
  });
});
