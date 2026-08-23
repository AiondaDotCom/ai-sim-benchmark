# Lobby Scene — an autonomous 3D action-scene demo

A fully autonomous, self-running 3D homage to the classic "lobby shootout"
scene: two protagonists in long dark coats storm a marble government-building
lobby defended by uniformed guards and a reinforcement squad. Procedural
everything — TypeScript + Vite + Three.js, no physics engine, no imported
assets, no UI. The camera is choreographed, destruction persists, slow motion
is a true simulation time scale, and the whole ~70-second sequence loops.

**Quick start: `./start.sh`** — then open the printed URL (default
http://localhost:5173). `./start.sh --preview` serves the production build.

> Browsers block autoplaying audio: the visuals start immediately; click once
> (or press any key) to unlock sound. This is a browser policy, not a UI.

## Configuration (URL query parameters only — no UI)

| Param | Default | Meaning |
|---|---|---|
| `seed` | 42 | Procedural variation: debris shapes, casing scatter, sound-variant picks. The choreography itself is fixed and deterministic. |
| `timeScale` | 1 | Global time-scale multiplier (`0.1` = whole demo at 1/10 speed, audio pitched accordingly). |
| `volume` | 0.8 | Master volume 0..1. |
| `camShake` | 1 | Handheld-shake intensity during the battle. |
| `loop` | 1 | `0` disables looping after the final shot. |
| `t` | 0 | Start offset in scene seconds (fast-forwards the simulation on load; used for verification screenshots). |

Example: `http://localhost:5173/?seed=7&timeScale=0.5&volume=1`

## The choreography (≈61 s of scene time, ≈70 s real time due to slow-mo)

| Sim time | Beat |
|---|---|
| 0–8 | Calm entrance: the man pushes through the glass doors and walks the centerline, coat swaying, footsteps echoing; the woman follows. Calm, tense music. |
| 8–11.6 | Metal detector **beep**; the guard steps up; the man opens his coat revealing the strapped arsenal. One frozen beat. |
| 11.6–14 | Eruption: the guard lunges for the radio — the music **drops at exactly 12.0 s** into heavy metal (requirement A1); close-quarters strikes, the woman's flying kick, the alarm. |
| 14–18 | Eight soldiers pour in from the far service doors and take cover behind the columns; the pair advance, firing. |
| 15.06–15.3 | **A5 insert:** extreme slow-mo — a round visibly leaves the muzzle: flash, smoke, glowing tracer head, and the ejected casing in one frame. |
| 18.95–20.25 | **Set piece 1:** the man cartwheels across the open floor firing both pistols — slow-motion window 19.2–20.05 (0.18×) with the camera orbiting while casings hang in the air. |
| 20.55–20.95 | **A5 insert:** low floor-level slow-mo — brass casings ejecting, spinning, bouncing close to camera. |
| 23.2–24.6 | **A5 set piece:** the man steps into the open and leans flat back in extreme slow-mo (23.45–24.15, 0.12×) while a scripted four-round volley streaks past overhead, each round trailing visible air-wake rings; the camera orbits the dodge. |
| 24.9–26.75 | **Set piece 2:** the woman runs up and along the left wall firing mid-run, lands in a crouch, keeps firing — slow-mo 25.35–26.25 (0.2×), tracking camera. |
| 29.9–33.4 | **Set piece 3:** column-cover spins; emptied guns are flung away (they clatter and stay), fresh ones drawn from under the coat — dual slow-mo orbit 31.5–32.3 (0.2×). |
| 33.4–40 | Final advance between the column rows; soldiers answer with sustained bursts that chew the marble; hit soldiers crumple, drop, or slide down the columns they leaned on. Last soldier falls at 39.8. |
| 40–47 | Wind-down: near-silence, settling debris, one final casing spinning to rest, slow pan across the wreckage — chipped columns stripped to substrate, floor covered in fragments and hundreds of casings. |
| 47–61 | The two holster, walk side by side to the elevator; doors open, they step in, doors close. Final wide shot holds on the wrecked lobby; then the demo loops. |

## Architecture

Simulation, choreography, rendering, audio, and bootstrap are strictly
separated. The simulation layer imports neither three.js nor the DOM and runs
headless in the tests.

```
src/
  config.ts            URL-parameter parsing (the only configuration surface)
  main.ts              bootstrap: wires sim ↔ render ↔ audio, rAF loop, looping
  sim/                 ── deterministic, fixed-timestep, pure TypeScript ──
    rng.ts             mulberry32 seeded PRNG (all sim randomness)
    math3.ts           minimal V3 math, ray↔AABB, segment↔capsule
    layout.ts          shared spatial truth: columns, walls, checkpoint, elevator,
                       destructible-surface AABBs
    timeline.ts        THE CHOREOGRAPHY: every actor's pose as a pure function of
                       time; slow-mo windows; cues; the full shot plan; deaths
    world.ts           entities & events: projectiles (visible tracers), impacts,
                       decal/damage map, debris & casing physics, dropped guns
    stepper.ts         fixed-timestep accumulator (240 Hz) with time scaling
    hash.ts            FNV-1a state hash for determinism tests
  audio/
    director.ts        pure event→sound mapping (seeded variant picks, throttles)
    engine.ts          WebAudio backend: buffers, voices, music scheduling,
                       playbackRate = timeScale (slow-mo pitches audio)
  render/
    materials.ts       texture loading, shared materials
    lobby.ts           the set: columns, mirror floor (Reflector), coffered
                       ceiling, checkpoint, elevator bank, animated doors
    characters.ts      procedural FK rigs built from primitives + the full pose
                       library (walk, strike, kick, cartwheel, wall run, cover,
                       discard, falls, …), coat dynamics
    effects.ts         instanced casings/debris, persistent decals & craters,
                       dust, muzzle flashes/smoke, glowing tracer projectiles
                       with pooled ride-along lights, air-wake rings, blood,
                       dropped guns
    camera.ts          the cut list: 17 choreographed shots; orbits advance in
                       REAL time so they sweep at full speed during slow-mo
tests/
  sim.test.ts          determinism, time-scale, hit/audio pairing, friendly fire,
                       destruction persistence, choreography sanity
```

### How the timeline works

`timeline.ts` is the single script of the scene. For every actor it defines a
piecewise pose function `(t) → {pos, yaw, action, phase, speed}`; the sim
samples these at 240 Hz, layers deaths on top (`fall_crumple/drop/slide`), and
executes the *fire plan* — a precomputed, sorted list of every shot in the
scene (filler shots plus scripted kill shots timed to the deaths). Soldier
fire is "scripted miss": rays are offset until they clear both protagonists
(verified by capsule intersection — the friendly-fire test), then the first
surface hit becomes a persistent decal, a debris burst, and (every third hit
in one spot) a **crater** that exposes the substrate texture. The seed varies
only debris/casing kinematics, decal jitter, and sound-variant selection —
never the choreography.

### Slow motion

`stepper.ts` implements time scale correctly: the accumulator converts real
seconds into *simulated* seconds (`acc += realDt × scale`) and always steps
the world at a fixed 1/240 s. Slow motion changes how many steps run per
frame, never the step size, so a 0.1× run advances exactly 1/10 as far per
real second (tested). The choreographed slow-mo windows ease in/out around the
three set pieces; audio follows via `playbackRate = timeScale` on every voice
including the music, which keeps the music's 12.0 s drop locked to sim time.

### Destruction persistence

Defender hits show a brief stylized dark-red impact mist; downed defenders
keep persistent uniform stains and leave a floor stain (A4) — stylized, no
gore, and the camera never dwells on the fallen. The damage map
(`world.decals`), debris, casings, blood stains, and dropped guns only ever
grow; nothing despawns during the sequence (tested: counts are monotone, early
decals still present and unchanged at the end). The final pan shows the
accumulated wreckage: ~350 impact decals, ~1500 debris chips, ~370 casings,
3 discarded guns, 11 bodies.

## Asset pipeline

All textures were generated with the Codex CLI image tool, all SFX with the
ElevenLabs sound-generation API, and the music with Suno (AceDataCloud) — see
**ASSETS.md** for the complete per-file manifest with exact prompts, and
`scripts/gen-*.sh` for the reproduction scripts (API credentials are taken
from environment variables, never stored in the repo). The final music track
is assembled from the Suno material with ffmpeg so that the metal section
lands at exactly 12.0 s. Everything is checked in under `public/assets/`; the
demo performs **no network calls at runtime** beyond loading its own files.

## Tests

```
npm test        # vitest — 9 tests
```

- **Deterministic replay:** same seed ⇒ identical FNV-1a state hash after
  6000 steps (25 s); different seed ⇒ different hash.
- **Time-scale correctness:** 0.1× advances exactly 1/10 as far per real
  second; slow motion changes step *count*, never step size.
- **Hit-event/audio pairing:** all 11 defender-down events map to exactly one
  hit-reaction sound each.
- **No friendly fire:** zero `FRIENDLY_HIT` events across the full scene, for
  several seeds (structural guarantee + capsule check).
- **Destruction persistence:** decal/debris/casing counts monotone
  non-decreasing every step; first decal unchanged at the end; final wreck has
  hundreds of casings, >400 debris, craters, and 3 staying dropped guns.
- **Choreography sanity:** all defenders down by t=40; the pair survives.

## Known limitations

- **Characters are stylized low-poly** (early-2000s game quality, per
  requirement A2): smoothed procedural anatomy — tapered capsule limbs,
  ellipsoid heads with nose/jaw/ears, sunglasses with lenses and temples,
  caps/helmets, articulated two-phalanx hands with thumbs (they grip, open
  for the coat reveal, relax when idle), and a coat of corrugated
  fold-geometry panels. Still procedural code, no rigs imported; the coat
  folds are static geometry animated at the panel level, not simulated cloth.
- **Autoplay:** audio needs one click/keypress (browser policy). Until then
  the demo runs silently.
- **Destruction is decal/debris-based** — craters are layered decals exposing
  substrate texture rather than real mesh booleans; column silhouettes stay
  intact (chips fly, surfaces scar, but geometry is not carved).
- **Reflections:** the floor uses a planar Reflector plus a semi-opaque stone
  overlay; reflections of decals/dust are approximate.
- **Melee is impressionistic:** strikes/kick connect by timing rather than
  contact simulation (film-style stylization).
- **Cross-platform determinism:** the state hash is deterministic on a given
  JS engine; floating-point differences across engines/architectures could in
  principle change low-order bits.
- The dev server (`npm run dev`) serves the unbundled sources; use
  `./start.sh --preview` for the optimized build.
