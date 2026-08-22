# Lobby

A fully autonomous 3D action-scene demo: a stylised homage to the classic
"lobby shootout" — two protagonists in long dark coats walk into a marble
government-building lobby, and about a minute later walk out of a ruin.

Nothing to press, nothing to configure, no UI. It starts on page load, plays
itself, and loops.

TypeScript · Vite · three.js · no physics engine · no imported models, textures,
sounds or music — every asset in this repository was generated during this run
(see [`ASSETS.md`](ASSETS.md)).

## Quick start

```bash
./start.sh              # dev server           → http://localhost:5173/
./start.sh --preview    # production build     → http://localhost:5173/
```

`start.sh` checks that Node.js (≥ 18) and npm are available, runs `npm install`
the first time, and prints the local URL. Or, by hand:

```bash
npm install
npm run dev        # or: npm run build && npm run preview
npm test           # the simulation test suite
```

Click once anywhere after the page loads. The picture runs immediately either
way; browsers simply refuse to start audio before a user gesture, and that first
click is the only interaction the page listens for.

## What you are watching

| story time | beat |
| --- | --- |
| 0 – 6 s | **Entrance.** He pushes through the glazed doors and walks the centreline, coat swinging, footsteps echoing. She follows a few paces behind. |
| 6 – 10 s | **The checkpoint.** He steps through the metal detector — a loud beep. A guard steps up and asks him to remove any metal objects. He opens his coat: a strapped arsenal. |
| 10 – 11 s | **One frozen beat of silence** (time scale 0.34). |
| 11 – 15 s | **Eruption.** The guard lunges for his radio — the music drops on that exact frame. Close-quarters strikes; she comes in with a flying kick in slow motion; the alarm goes. |
| 15 – 33 s | **The shootout.** Four waves of soldiers pour in from the elevator bank and the side doors and take cover behind the columns. Mandatory set pieces, each covered by an orbiting slow-motion camera: the **cartwheel** across the open floor firing a pistol in each hand, the **wall run** along a column face, **spinning around columns** for cover — emptied guns are thrown away, clatter across the marble and stay there, and the compact submachine guns come out from under the coat. Sustained automatic fire chews the marble to pieces. |
| 33 – 38 s | **Wind-down.** The last man drops in slow motion. Near-silence: settling debris, a last casing spinning to rest, dust in the light. The camera pans across the wreckage. |
| 38 – 47.5 s | **Exit.** They holster, walk to the elevator, the doors open, they step in, the doors close. A final wide shot holds on the wrecked lobby, and the demo loops. |

47.5 s of *story* time; roughly 62 s of wall-clock, because the six slow-motion
windows stretch it.

## Architecture

Four layers, cleanly separated. The simulation is the only source of truth; it
has no idea that three.js or WebAudio exist and runs head-less in the tests.

```
src/
  sim/          the world — deterministic, fixed 120 Hz, no DOM, no three.js
    choreography.ts   THE SCRIPT: every path, pose, camera shot, cue and beat
    world.ts          the interpreter: actors, combat, ballistics, events
    clock.ts          fixed-timestep accumulator; slow motion lives here
    anim.ts           the pose library (walk, run, cartwheel, wall run, kick, deaths)
    rig.ts / fk.ts    the humanoid rig and its forward kinematics
    damage.ts         persistent per-slab damage maps + ray casting
    debris.ts         hand-rolled rigid-particle pools (casings, fragments, dust)
    lobby.ts          the set's dimensions and its destructible surfaces
    rng.ts / hash.ts  seeded PRNG and state hashing
  render/       three.js — reads simulation state, never writes it
    stage.ts          scene graph, lighting, doors, alarm, per-frame bridge
    set.ts            the lobby, built procedurally: columns, coffers, checkpoint…
    slabs.ts          the destructible cladding shader
    character.ts      rig → boxes, costume, weapons, the simulated coat
    particles.ts      instanced casings / fragments / tracers, dust and sparks
    camera.ts         the choreographed camera
    postfx.ts         bloom and the desaturated green grade
  audio/        WebAudio — driven purely by simulation events
  bootstrap/    URL-parameter configuration
  main.ts       renderer, fixed-timestep loop, audio unlock
```

### Simulation

* **Fixed timestep, 120 Hz.** `FixedClock.advance(realDelta, timeScale)` scales a
  real frame delta into story time and returns how many `1/120 s` steps to run.
  The renderer draws as fast as it likes; the simulation never changes rate.
* **Slow motion is a property of the simulation**, not of the render loop. The
  time scale comes from `SLOWMO` windows in `choreography.ts` with smooth ramps.
  Audio follows: every voice — gunfire, debris, ambience and the score — has its
  `playbackRate` set to the current time scale, so a slow-motion beat drops the
  pitch of the whole mix together and the score stays locked to story time.
* **Deterministic.** All randomness comes from one seeded `Rng`. `World.hash()`
  folds actor transforms, every joint angle, the coat cloth, live bullets, all
  particle positions and the damage totals into one 32-bit value; the same seed
  produces the same hash after N steps, always.
* **The seed changes texture, not choreography.** Debris shapes and velocities,
  particle detail, weapon spread and which sound variant plays are seeded; where
  everyone walks, what they do and when is fixed.

### Timeline and choreography

`src/sim/choreography.ts` is a data file, and `world.ts` is its interpreter.

* **`PathKey[]` per actor** — world-space keys with per-segment easing. Facing
  follows the direction of travel unless a key names an explicit yaw.
* **`PoseKey[]` per actor** — which clip plays from when. Clips are pure
  functions of a normalised phase (`poseWalk`, `poseCartwheel`, `poseWallRun`,
  `poseFlyingKick`, `poseStrike`, `poseDeath`, …) and are cross-faded on entry.
  Moves that tip the body over (cartwheel, wall run, knock-downs) also return
  root pitch/roll and a matching height correction, because the rig's root sits
  at the feet.
* **`AimKey[]`** — an upper-body aim overlay blended over whatever the legs are
  doing, with recoil.
* **`KILL_ORDERS`** — a priority target list rather than scripted deaths. A
  protagonist takes the shot as soon as the line is clear *and* the round will
  actually land; if the friendly-fire guard steers it off target, or a body is in
  the way, the order stays pending and he fires again. A man pinned too long
  breaks cover. Deaths are therefore emergent from real ballistics while the
  pacing stays authored.
* **`CAMERA`** — a cut list. Shots are `fixed` / `dolly` / `orbit` / `follow`,
  cut hard on their boundaries, with FOV ramps and hand-held shake that scales
  with how much lead is in the air. Actor-relative targets follow the *chest
  joint*, not the root, so a cartwheeling or falling body stays framed. Each
  slow-motion window is covered by an orbit.
* **`MUSIC_CUES`** — the score's sections are pinned to the same beat constants
  the action uses, so the drop cannot drift away from the guard's lunge.

### Destruction

* Every column face and wall panel is a **destructible slab** with two 8-bit
  maps at 20 texels/metre: how much polished veneer has been blown off, and how
  deep the substrate underneath has been chewed out. Both are strictly
  monotonic — damage is only ever added.
* An impact applies a wide shallow spall plus a smaller, offset, deeper core,
  and a per-texel hash breaks the edge up so the veneer shears away in ragged
  chips rather than clean circles.
* The slab shader blends the marble map into the substrate map along that edge,
  keeps a bright rim where the skin has just sheared off, darkens and roughens
  the crater, perturbs the normal from the crater gradient, and displaces the
  vertices inwards so the damage shows in the silhouette too.
* Physical debris is spawned alongside: palm-sized veneer chips, substrate grit,
  whole slabs when a patch first strips through, plus brass casings and every
  discarded weapon. They bounce (audibly) and **stay on the floor forever** —
  nothing despawns, so the final wide shot is a genuinely wrecked room.
  A full run leaves ≈ 800 casings and ≈ 3 350 fragments lying in the marble
  dust, from ≈ 1 280 recorded impacts.
* Only dust and sparks fade, because they are smoke and light, not debris.

### Rendering

Procedural geometry throughout — no imported models. Two rows of four 1.2 m
marble columns, a coffered ceiling with recessed light panels, clerestory
windows with raking light shafts, the glazed entrance back-lit by blown-out
daylight, a checkpoint (metal-detector frame, guard desk, X-ray belt,
stanchions) and a three-car elevator bank. The floor is a real planar reflector
with a custom shader that mixes the generated dark-stone map with the mirrored
scene through a Fresnel term.

Characters are the same rig for everyone: a box per bone, dressed by role —
long wool coat, glossy black outfit, light-blue uniform shirts with peaked caps
and ties, dark combat gear with helmets and vests. The man's coat is a verlet
cloth simulated in the world (18 × 5 nodes) hanging off the pelvis through the
full root transform, so it swings with every turn and whirls through the
cartwheel.

Post: bloom on the muzzle flashes and sparks, then a grade that desaturates,
pushes the whole image green, lifts the shadows, adds a soft vignette and a
little grain.

### Audio

All 43 effects are decoded up front and played as one-shot buffer sources with
distance attenuation and stereo panning relative to the camera. Categories carry
several variants each; the simulation picks one with its seeded RNG and passes it
along in the event, so the audio layer never makes a decision of its own.
Every guard-down event carries exactly one hit-reaction cue. The alarm is a
looping voice; the score is one continuous track whose position is resynced to
story time whenever it drifts more than 0.28 s.

## Configuration

URL query parameters only — there are no on-screen controls anywhere.

| parameter | default | meaning |
| --- | --- | --- |
| `seed` | `20250822` | procedural variation: debris, particles, sound variants |
| `volume` | `0.85` | master volume, 0–1 |
| `timeScale` | `1` | global multiplier on top of the choreographed slow motion |
| `startAt` | `0` | skip to a story second (fast-forwards the simulation) |
| `fixedTimeScale` | — | pin the time scale to a constant (capture / debugging) |
| `loop` | `1` | `0` stops on the final frame |
| `quality` | `high` | `low` disables shadows and antialiasing |
| `maxPixelRatio` | `2` | device-pixel-ratio cap |
| `paused` | `0` | `1` renders one frame and holds |

Example: `http://localhost:5173/?seed=7&startAt=29&timeScale=0.5`

## Tests

```bash
npm test
```

The suite runs the whole 47.5 s sequence head-less, several times:

* **Deterministic replay** — identical seed ⇒ identical state hash after N steps,
  step by step and after the full run, including the event log; a different seed
  changes the detail but not the choreography.
* **Time-scale correctness** — at 0.1× the simulation advances exactly one tenth
  as far per real second (12 steps instead of 120), independently of the render
  frame rate, and the fixed timestep itself is never slowed. The slow-motion
  ramps are checked for continuity.
* **Hit-event / audio pairing** — every man down triggers exactly one
  hit-reaction sound, immediately, one-to-one, and never one without the other.
* **No friendly fire** — the protagonists' rounds never strike each other, and
  in fact nothing ever strikes them, across several seeds. The check is on real
  ray/capsule resolution, not on an exemption: protagonist capsules are tested
  like everyone else's.
* **Destruction persistence** — the damage map never reverts (checked texel by
  texel), the debris and casing counts grow monotonically, the veneer really is
  stripped to the substrate somewhere, and everything has come to rest at the end.
* **Choreography integrity** — all 21 defenders are down before the wind-down
  beat, the first three go down in close quarters, both protagonists end up in
  the elevator, cues fire in order, no defender ever stands inside a column, and
  every destructible slab is built on a right-handed basis.

## Asset pipeline

See [`ASSETS.md`](ASSETS.md) for the full manifest — every file with the exact
prompt and the tool that produced it.

1. **Textures** — 16 maps from OpenAI image generation via the Codex CLI
   (`scripts/gen-textures.sh`): marble, dark stone floor, rough substrate,
   plaster, brushed metal, brass, coat wool, latex, uniform poplin, combat
   nylon, glass, plus bullet-hole, crack, dust and spark decals.
2. **Sound** — 43 effects from the ElevenLabs sound-generation API
   (`scripts/gen-sfx.sh`), several variants per category.
3. **Music** — three instrumental stems from Suno via AceDataCloud
   (`scripts/gen-music.sh`), assembled into one continuous score by
   `scripts/beat_cut.py`, which detects the action stem's tempo and snaps the cut
   to an onset so the drop lands exactly on the beat the action needs it.
4. **Post-processing** — `scripts/optimize-assets.sh` resizes and re-encodes for
   the web. Raw tool output is kept in `assets-source/`.
5. **Manifest** — `scripts/build-assets-manifest.py` regenerates `ASSETS.md`
   from the generator scripts, so the recorded prompts cannot drift.

The finished demo is fully offline: `assets/` is Vite's `publicDir`, everything
ships into `dist/`, and there is not a single network request at runtime.

## Known limitations

* **The arsenal is two weapons deep.** Handguns and one compact submachine gun
  per hand, swapped at scripted moments. The straps under the coat are modelled
  but are set dressing, not individually drawable weapons.
* **Stylised, not photoreal.** Characters are box-built at a deliberately blocky,
  low-poly level of detail. Faces, hands and cloth are suggestions, not anatomy.
* **Wall-clock length.** The choreography is 47.5 story seconds, but slow motion
  stretches playback to roughly 62 s — a little over the 45–60 s target.
* **Deaths are canned, not ragdolled.** Four hand-authored knock-down styles
  (crumple, backfall, slide, spin) chosen per character; there is no rigid-body
  solver for bodies. Feet can clip the floor at the end of a fall.
* **Destruction is surface-deep.** Slabs are damage maps with vertex
  displacement, not fractured meshes: the veneer strips, craters deepen and
  fragments fly, but a column can never be shot through or toppled.
* **Debris is capped.** The pools hold 9 000 casings and 11 000 fragments. A
  normal run uses about a tenth of that, so nothing is ever dropped — but at
  capacity new spawns are refused rather than old ones removed, which keeps the
  "nothing despawns" guarantee.
* **Dust fades.** It is smoke; every solid artefact persists.
* **Collision is coarse.** Characters are vertical capsules; the set is
  axis-aligned boxes. Bodies can overlap when several fall in the same spot.
* **The camera is on rails.** It is authored, not solved — it does not
  dynamically avoid obstructions, so a shot can graze a column edge.
* **No level of detail or culling strategy** beyond frustum culling and
  instancing. It holds 120 fps on a modern laptop GPU at 1280×720; a low-end
  integrated GPU will want `?quality=low&maxPixelRatio=1`.
* **The reflector doubles the scene draw** each frame; it is the single biggest
  render cost.
* **Audio needs one click.** Browsers block autoplay. The picture never waits
  for it, and if the click comes late the score seeks to the current story time.
* **The music's dramaturgy is assembled, not composed in one take.** Three
  generated stems are cut together; the transition into the outro is a 1.1 s
  crossfade rather than a written transition.
