/**
 * A8 step 1: structural invariants of the cut list and the slow-motion plan.
 *
 * These are the checks that were missing while this run's inserts were built,
 * and their absence cost real defects: the A7 casing insert declared a
 * slow-motion window that outlived the camera shot rendering it — the shot
 * ended at t=21.0 while the casing it followed did not land until t=21.45 and
 * did not settle until t=21.95, so the insert cut away before the beat it
 * existed to show. Nothing failed. The same class of mistake left the
 * bullet-cam window too short for its own round.
 */
import { describe, it, expect } from 'vitest';
import { shotList } from '../src/render/camera';
import {
  SLOWMO,
  DURATION,
  DETECTOR_ALARM,
  detectorLampAt,
  neoPose,
  CUES,
  VO_LINES,
  SOLDIERS,
  DEATHS,
  KILLERS,
  DEATH_STYLE,
  soldierBursts,
  SHOT_PLAN,
  STANDOFF,
  COMMAND_T,
  BREAK_T,
  DEPLOY_T0,
} from '../src/sim/timeline';
import { World } from '../src/sim/world';
import { ELEVATOR } from '../src/sim/layout';
import { portalCutouts, claddingLook } from '../src/render/cladding';
import * as THREE from 'three';

const shots = shotList();

describe('camera cut list', () => {
  it('every shot has a declarative header', () => {
    expect(shots.length).toBeGreaterThan(10);
    const ids = shots.map((s) => s.id);
    expect(new Set(ids).size, 'shot ids are unique').toBe(ids.length);
    for (const s of shots) expect(s.id, 'shot id is non-empty').not.toBe('');
  });

  it('shots are strictly ordered and start at the top of the scene', () => {
    expect(shots[0].t0).toBe(0);
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i].t0, `shot ${shots[i].id} after ${shots[i - 1].id}`)
        .toBeGreaterThan(shots[i - 1].t0);
    }
    expect(shots[shots.length - 1].t0).toBeLessThan(DURATION);
  });
});

describe('slow-motion plan', () => {
  it('windows are ordered, non-empty and never overlap', () => {
    for (const w of SLOWMO) {
      expect(w.t1, `window at ${w.t0}`).toBeGreaterThan(w.t0);
      expect(w.scale).toBeGreaterThan(0);
      expect(w.scale).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < SLOWMO.length; i++) {
      expect(SLOWMO[i].t0, `window ${i} starts after window ${i - 1} ends`)
        .toBeGreaterThanOrEqual(SLOWMO[i - 1].t1);
    }
  });

  it('each window lies inside the single shot that renders it', () => {
    for (const w of SLOWMO) {
      let idx = -1;
      for (let i = 0; i < shots.length; i++) if (w.t0 >= shots[i].t0) idx = i;
      expect(idx, `no shot covers the window starting at ${w.t0}`).toBeGreaterThanOrEqual(0);
      const shot = shots[idx];
      const end = idx + 1 < shots.length ? shots[idx + 1].t0 : DURATION;
      // A slow-motion window that outlives its shot means the cut happens
      // mid-insert: the audience is pulled off the thing being slowed down.
      expect(w.t1, `window ${w.t0}-${w.t1} outlives shot '${shot.id}' (${shot.t0}-${end})`)
        .toBeLessThanOrEqual(end);
    }
  });
});

describe('detector alarm lamp (B7)', () => {
  const a = DETECTOR_ALARM;

  it('is dark before the checkpoint triggers', () => {
    for (const t of [0, 4, 7.5, a.t0 - 0.01]) expect(detectorLampAt(t)).toBe(0);
  });

  it('pulses once per alarm beep, on the cadence of the asset', () => {
    // measured from public/assets/sfx/beep.mp3: 7 pulses, 148 ms on, 294 ms
    // apart. Lamp and sound share these constants so they cannot drift.
    for (let k = 0; k < a.pulses; k++) {
      const start = a.t0 + k * a.period;
      expect(detectorLampAt(start + 0.005), `pulse ${k} lit`).toBeGreaterThan(0.9);
      expect(detectorLampAt(start + a.on - 0.005), `pulse ${k} still lit`).toBeGreaterThan(0.6);
      expect(detectorLampAt(start + a.on + 0.02), `gap after pulse ${k}`).toBe(0);
    }
  });

  it('the beep train ends, and the ember pulse is gone by the eruption', () => {
    const afterTrain = a.t0 + a.pulses * a.period;
    // no more hard beep-rate pulses once the sound has finished
    let hard = 0;
    for (let t = afterTrain; t < a.emberUntil; t += 0.01) {
      if (detectorLampAt(t) > 0.5) hard++;
    }
    expect(hard).toBe(0);
    expect(detectorLampAt(a.emberUntil)).toBe(0);
    expect(detectorLampAt(a.emberUntil + 2)).toBe(0);
  });
});

describe('animation shaping (A9)', () => {
  const speedAt = (t: number) => {
    const h = 1 / 240;
    const a = neoPose(t - h).pos;
    const b = neoPose(t + h).pos;
    return Math.hypot(b[0] - a[0], b[2] - a[2]) / (2 * h);
  };

  it('walk legs ease in and out instead of starting and stopping dead', () => {
    // the entrance walk: t=0.8 -> 6.4, from z=17.4 to z=10.9
    const t0 = 0.8;
    const t1 = 6.4;
    const mid = speedAt((t0 + t1) / 2);
    expect(mid).toBeGreaterThan(0.5);
    // an eased leg leaves and arrives at near-zero speed; a linear one would
    // be at full speed within one frame of each end
    expect(speedAt(t0 + 0.02)).toBeLessThan(mid * 0.25);
    expect(speedAt(t1 - 0.02)).toBeLessThan(mid * 0.25);
  });

  it('the beat times and waypoints are unchanged by the shaping', () => {
    // easing changes how he gets there, never where or when
    expect(neoPose(0.8).pos[2]).toBeCloseTo(17.4, 3);
    expect(neoPose(6.4).pos[2]).toBeCloseTo(10.9, 3);
    expect(neoPose(8.3).pos[2]).toBeCloseTo(9.55, 3);
    expect(neoPose(0.5).action).toBe('idle');
    expect(neoPose(19.5).action).toBe('cartwheel');
    expect(neoPose(23.9).action).toBe('dodge');
  });

  it('the cartwheel anticipates before it commits and overshoots after', () => {
    // phase is fed to the pose as a rotation, so a sub-zero phase early is a
    // real counter-rotation and a phase past 1 late is a real overshoot
    const early = neoPose(18.95 + 0.05).phase;
    const late = neoPose(20.25 - 0.05).phase;
    expect(early).toBeLessThan(0);
    expect(late).toBeGreaterThan(1);
  });
});

describe('cue list ordering', () => {
  it('CUES is sorted by time', () => {
    // the cue loop in World.step walks this with a monotonic index; an
    // out-of-order entry silently drops every cue after it
    for (let i = 1; i < CUES.length; i++) {
      expect(CUES[i].t, `cue ${i} (${CUES[i].type}) after ${CUES[i - 1].type}`)
        .toBeGreaterThanOrEqual(CUES[i - 1].t);
    }
  });
});

describe('voice lines (A10)', () => {
  it('every line has an asset name and lands inside its beat window', () => {
    expect(VO_LINES.length).toBeGreaterThan(5);
    for (const v of VO_LINES) {
      expect(v.line).toMatch(/^vo_[a-z0-9_]+$/);
      expect(v.t, `${v.line} starts after its beat opens`).toBeGreaterThanOrEqual(v.beat[0]);
      expect(v.t, `${v.line} starts before its beat closes`).toBeLessThan(v.beat[1]);
    }
  });

  it('each line is actually cued in the timeline at its stated time', () => {
    for (const v of VO_LINES) {
      const cue = CUES.find((c) => c.type === 'VO' && c.line === v.line);
      expect(cue, `${v.line} has a cue`).toBeDefined();
      expect(cue!.t).toBeCloseTo(v.t, 4);
    }
  });

  it('lines do not stack on top of each other', () => {
    const sorted = [...VO_LINES].sort((a, b) => a.t - b.t);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].t - sorted[i - 1].t,
        `${sorted[i - 1].line} -> ${sorted[i].line}`).toBeGreaterThan(0.8);
    }
  });
});

describe('elevator portals stay open (B12)', () => {
  it('the elevator wall has one cutout per portal, matching the door geometry', () => {
    const world = new World(42);
    const slab = world.slabs.find((s) => s.id.startsWith('wallBack'));
    expect(slab, 'the elevator wall is a damage slab').toBeDefined();
    const cuts = portalCutouts(slab!);
    expect(cuts.length, 'one opening per elevator door').toBe(ELEVATOR.doors.length);
    for (let i = 0; i < cuts.length; i++) {
      const [u0, v0, u1, v1] = cuts[i];
      // a real opening, inside the face, the width and height of the portal
      expect(u1).toBeGreaterThan(u0);
      expect(u0).toBeGreaterThan(0);
      expect(u1).toBeLessThan(1);
      expect(v0).toBe(0);
      expect((u1 - u0) * slab!.uSize).toBeCloseTo(ELEVATOR.doorW, 5);
      expect((v1 - v0) * slab!.vSize).toBeCloseTo(ELEVATOR.doorH, 5);
      // centred on its door
      const cx = ((u0 + u1) / 2) * slab!.uSize + slab!.origin[0];
      expect(cx).toBeCloseTo(ELEVATOR.doors[i], 5);
    }
  });

  it('every other face is fully clad', () => {
    const world = new World(42);
    for (const s of world.slabs) {
      if (s.id.startsWith('wallBack')) continue;
      expect(portalCutouts(s).length, `${s.id} has no openings`).toBe(0);
    }
  });
});

describe('cladding material identity (B14)', () => {
  it('the intact and the cutting granite materials are visually identical', () => {
    // A face switches material the first time it is hit. If the two differ in
    // anything that affects how granite looks, a face that has taken a single
    // bullet changes appearance wholesale and the seam lands on a face
    // boundary — i.e. a rectangle of mismatched texture.
    const base = new THREE.MeshStandardMaterial({
      map: new THREE.Texture(), normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(), roughness: 0.34, metalness: 0.04,
      color: 0xe8ece6, envMapIntensity: 0.6,
    });
    base.normalScale.set(0.85, 0.85);
    const plain = base.clone();
    const cut = plain.clone(); // exactly how Cladding derives the cutting one
    expect(claddingLook(cut)).toEqual(claddingLook(plain));
  });
});

/**
 * A15: the squad deploys, one command lands, a beat of stillness holds, and
 * the pair break it. Fitted INTO the existing window rather than inserted —
 * the music is one track played against simulation time, so adding seconds
 * anywhere would slide the drop.
 */
describe('deployment beat (A15)', () => {
  it('the squad is large enough to fill the frame, and all of it goes down in the same window', () => {
    expect(SOLDIERS.length).toBe(16);
    for (const s of SOLDIERS) {
      expect(DEATHS[s.id], `${s.id} has a death`).toBeGreaterThan(0);
      expect(KILLERS[s.id], `${s.id} has a killer`).toBeTruthy();
      expect(DEATH_STYLE[s.id], `${s.id} has a death style`).toBeTruthy();
    }
    // the wind-down is untouched: the last man still goes down at 39.8
    const last = Math.max(...SOLDIERS.map((s) => DEATHS[s.id]));
    expect(last).toBe(39.8);
    // and everyone is in cover before the command
    for (const s of SOLDIERS) expect(s.enterT + 2.1).toBeLessThan(COMMAND_T + 0.1);
  });

  it('nobody fires during the held standoff', () => {
    const [t0, t1] = STANDOFF;
    for (const s of SOLDIERS) {
      for (const b of soldierBursts(s)) {
        expect(b < t0 || b > t1, `${s.id} burst at ${b} is inside the standoff`).toBe(true);
      }
    }
    for (const p of SHOT_PLAN) {
      expect(p.t < t0 || p.t > t1, `${p.shooter} shot at ${p.t} is inside the standoff`).toBe(true);
    }
  });

  it('the protagonists hold fire through the deployment too', () => {
    // the beat only works if the hall is quiet while the squad sets up
    const early = SHOT_PLAN.filter((p) => p.t >= DEPLOY_T0 && p.t < BREAK_T);
    expect(early).toHaveLength(0);
  });

  it('the command fires once, at the top of the standoff, ducking the music', () => {
    const cmd = CUES.filter((c) => c.type === 'VO' && c.line === 'vo_freeze');
    expect(cmd).toHaveLength(1);
    expect(cmd[0].t).toBe(COMMAND_T);
    expect(COMMAND_T).toBeLessThan(STANDOFF[0]);
    const line = VO_LINES.find((v) => v.line === 'vo_freeze')!;
    expect(line.duck).toBeGreaterThan(0.4);
    // and nothing else is spoken over the held beat
    const during = VO_LINES.filter((v) => v.t > STANDOFF[0] && v.t < STANDOFF[1]);
    expect(during).toHaveLength(0);
  });

  it('every downstream beat is where it was', () => {
    // these are the anchors the brief said not to move
    expect(DEATHS.s0).toBe(20.3);
    expect(DEATHS.s7).toBe(39.8);
    const at = (type: string) => CUES.filter((c) => c.type === type).map((c) => c.t);
    expect(at('HOLSTER')).toEqual([46.6]);
    expect(at('ELEVATOR')).toEqual([51.5]);
    expect(at('TILE_GAG')).toEqual([55.4]);
  });
});

/**
 * B21: the bullet-cam has to be able to SHOW its subject.
 *
 * The defect was not in the path code — the camera did attach to the round.
 * It was that the ride lasted 38 ms of simulation and the slow-motion window
 * ended before the round landed, so a frame a fraction later was already on
 * the wide cut. These assert the window actually covers the flight.
 */
describe('bullet-cam (B21)', () => {
  it('the slow-motion window opens before the round and runs past the impact', () => {
    const kill = SHOT_PLAN.find((p) => p.kill === 's7')!;
    expect(kill).toBeTruthy();
    // the round is fired at the kill time and crosses its flight at 90 m/s;
    // the window has to start before it exists (so the muzzle exit is seen)
    // and still be running when it lands
    const win = SLOWMO.filter((w) => w.t1 > kill.t - 0.2 && w.t0 < kill.t + 0.3);
    expect(win.length).toBeGreaterThanOrEqual(1);
    const opens = Math.min(...win.map((w) => w.t0));
    const closes = Math.max(...win.map((w) => w.t1));
    expect(opens).toBeLessThan(kill.t);
    // 4.4 m at 90 m/s is 49 ms of flight; the old window closed at 39.762,
    // which is before the impact at 39.749 plus any reaction at all
    expect(closes).toBeGreaterThan(kill.t + 0.049 + 0.15);
  });

  it('the last man gets his own reaction, distinct from the other three', () => {
    expect(DEATH_STYLE.s7).toBe('knockback');
    const others = Object.entries(DEATH_STYLE).filter(([id]) => id !== 's7');
    for (const [, style] of others) expect(style).not.toBe('knockback');
  });
});
