# Architecture review: should this have been a minimal engine on top of Three.js?

**Requirement A8.** The concern raised by the operator: the demo *looks* as if
everything is hardcoded in TypeScript. Should the set, entities, materials,
choreography and camera cut list instead live in declarative map/scene data
(JSON) that a small engine layer loads?

This document is written to answer that honestly, not to defend what exists.
It is grounded in what this run actually cost: **sixteen** change requests
(A2, B1, A3, A4, A5, A6, B2, B3, B4, B5, B6, A7, B7, A11, A9, A10) landed
against this codebase, and the useful question is not "is data-driven nicer in
the abstract" but "which of those sixteen would have been cheaper, and by how
much".

*Revision note: this review was first written after the twelfth request and has
been re-derived after B7, A11, A9 and A10 landed. Those four did not overturn
the recommendation, but they sharpened one part of it considerably — see §3.*

---

## 1. Inventory: what is already data, and what is genuinely hardcoded

The codebase is 5,476 lines of TypeScript across 20 modules, plus 475 lines of
tests. The premise that "everything is hardcoded" is **half right**, and the
half that is wrong matters for the recommendation.

### Already declarative (tables of values, no behaviour)

These are already pure data. They live in `.ts` files as typed literals rather
than in `.json` files, which is a *serialisation* choice, not an architectural
one:

| Where | What | Size |
|---|---|---|
| `sim/layout.ts` | `HALL`, `COLUMN`, `COLUMNS` (8 column centres), `CHECKPOINT`, `ELEVATOR` (wall z, 3 door x-positions, portal size) | ~45 lines |
| `sim/timeline.ts` | `DEATHS` (11 entries), `DEATH_STYLE`, `KILLERS`, `SOLDIERS` (8 defs: spawn door, cover point, column index, lean side, entry time), `CUES` (18 beats), `SLOWMO` (7 windows) | ~90 lines |
| `render/materials.ts` | the material table and its texture bindings | ~90 lines |
| `audio/director.ts` | the event→sound mapping (one `case` per event type, each a small record) | ~60 lines |
| `sim/timeline.ts` | `DETECTOR_ALARM` (B7 alarm pulse train), `VO_LINES` (A10: every spoken line with its beat window, voice role and duck amount) | ~30 lines |
| `render/camera.ts` | the `id`/`subject` header on each of the 23 shots (added as this review's step 1) | ~46 lines |
| `scripts/derive-maps.py` | the per-material normal-strength / roughness-window table | ~20 lines |
| `ASSETS.md` | the generation prompt for every texture, sound, voice line and music cue | — |

That is roughly **380 lines of genuine, editable data** with a clean
sim/render separation already in place. `layout.ts` is explicitly the single
source of truth shared by the raycaster and the renderer.

Worth noting which of the four newest requests landed *easily*: **A10** (ten
voice lines) and **B7**'s timing were both close to pure table edits, because
the cue list, the line table and the alarm pulse train are already data. That
is evidence for the existing split, not against it.

### Genuinely procedural (behaviour, not values)

| Where | What | Size |
|---|---|---|
| `render/characters.ts` | 18 pose functions (`poseWalk`, `poseCartwheel`, `poseWallrun`, `poseDodge`, …) plus the rig builders that construct every limb, hand, coat panel and weapon from primitives | 1,156 lines |
| `render/lobby.ts` | the set: columns, coffered ceiling, elevator bank, checkpoint, reception desk — all built with Three.js calls | 272 lines |
| `render/effects.ts` | casings, debris, decals, tracers, wake rings, muzzle flashes, dust | 525 lines |
| `sim/world.ts` | ballistics, raycasts, casing/debris integration, scripted-miss search | 657 lines |
| `render/camera.ts` | 23 shots; **all 23** compute `eye`/`look` from live simulation state | 337 lines |

### The important finding about the camera

The cut list is the one place I expected to be trivially data-driven, and it
is not. Every one of the 23 shots references live state — the actors'
positions, a specific casing's position, the bullet-cam's projectile. Only the
`t0` of each shot is a constant. A shot is not `{"eye": [x,y,z]}`; it is
"ride abeam of the projectile carrying the `cam` flag, 0.4 m out on the
horizontal perpendicular, looking 0.12 m ahead of it, and hand over to a wide
angle 0.75 m before impact".

That cannot be expressed in static JSON. It needs either an expression
language or a vocabulary of parameterised shot *types*. This distinction is the
crux of the whole review.

---

## 2. What the data-driven version would actually look like

### `data/lobby.scene.json`

```jsonc
{
  "hall": { "halfWidth": 8, "halfLength": 18, "height": 7 },
  "materials": {
    "granite":  { "map": "granite_tile.png", "roughness": 0.55, "metalness": 0.1 },
    "floor":    { "map": "floor_green.png",  "roughness": 0.18, "envMapIntensity": 1.4 }
  },
  "prefabs": {
    "column": {
      "parts": [
        { "geo": "box",  "size": [1.3, 7, 1.3],    "mat": "granite" },
        { "geo": "box",  "size": [1.7, 0.22, 1.7], "at": [0, 0.11, 0], "mat": "plinth" }
      ],
      "surface": { "kind": "column", "destructible": true }
    },
    "elevatorPortal": { "parts": [ /* leaf, architrave, lamp, call panel … */ ] }
  },
  "instances": [
    { "prefab": "column", "at": [-3.5, 0, 8] },
    { "prefab": "column", "at": [-3.5, 0, 2] },
    { "prefab": "elevatorPortal", "at": [-3.2, 0, -18] }
  ]
}
```

### `data/characters.json`

```jsonc
{
  "rigs": {
    "humanoid": {
      "joints": ["hips", "torso", "head", "armL", "foreL", "armR", "foreR", "..."],
      "limb":   { "upper": 0.30, "fore": 0.28, "thigh": 0.45, "shin": 0.44 }
    }
  },
  "kinds": {
    "neo":     { "rig": "humanoid", "body": "coat", "mats": { "body": "coat", "legs": "trouser" },
                 "attach": [ { "slot": "handR", "item": "pistol" }, { "slot": "handL", "item": "pistol" } ] },
    "soldier": { "rig": "humanoid", "body": "tactical", "attach": [ { "slot": "handR", "item": "smg" } ] }
  },
  "items": {
    "pistol": { "barrelAxis": [0, 0, -1], "gripAxis": [0, -1, 0], "muzzle": [0, 0, -0.25] }
  }
}
```

Note that the *item* block is real value: the barrel/grip/muzzle axes are
exactly the facts that B5 and B6 turned on, and they are currently implicit in
mesh-construction code and re-derived by hand.

### `data/timeline.json`

```jsonc
{
  "duration": 60,
  "actors": { "s0": { "door": [-6.8, -17.3], "cover": [-2.45, -4.75], "enterT": 14.0, "leanSign": 1 } },
  "deaths": [ { "id": "s7", "t": 39.8, "style": "crumple", "killer": "trin" } ],
  "cues":   [ { "t": 8.0, "type": "BEEP" }, { "t": 14.7, "type": "DRAW", "actor": "neo" } ],
  "slowmo": [ { "t0": 39.69, "t1": 39.762, "scale": 0.022, "note": "bullet-cam" } ],
  "shots":  [
    { "t0": 39.64, "type": "bulletRide",
      "params": { "flag": "cam", "abeam": 0.4, "back": 0.1, "lead": 0.12, "handoff": 0.75 } },
    { "t0": 40.2,  "type": "dolly", "params": { "from": [0.3, 2.5, -6], "to": [2, 2.2, -9], "look": "wreckage" } }
  ]
}
```

`shots[].type` is the key: the engine ships a **vocabulary** of shot kinds
(`static`, `dolly`, `orbit`, `followActor`, `followProp`, `bulletRide`) and the
JSON only parameterises them. This is the only formulation that works, and it
is strictly more machinery than the closures it replaces — the closures *are*
the vocabulary, just unnamed.

### Loader / engine layer

```
data/*.json ──▶ schema validation (zod) ──▶ typed scene description
                                              │
                        ┌─────────────────────┼─────────────────────┐
                   SceneBuilder            SimBuilder          Director
                (prefabs → Three)     (surfaces → raycaster)  (shots → camera)
```

Roughly **600–900 new lines** of loader, prefab interpreter, shot-type library
and schema, replacing perhaps 250–350 lines of current literal declarations.
The procedural 2,600 lines (poses, effects, ballistics) are untouched by this —
they are behaviour, and no schema absorbs them.

### Determinism and the test suite

This is where the design has a hard constraint, and it is manageable:

- The simulation must stay a pure function of `(seed, t)`. JSON loaded through
  a **static** `import scene from './lobby.scene.json'` is resolved by Vite at
  build time, so there is no async and no ordering hazard — determinism is
  preserved exactly.
- Loading over `fetch` at runtime would be the wrong choice: the `World`
  constructor is synchronous, and `hashWorld` comparisons across two runs would
  depend on load order. Keep it a static import.
- The current tests keep working unchanged, because they assert *relationships*
  (same seed ⇒ same hash, mass conservation, no friendly fire, one clink per
  visible bounce, barrel aligned with the round fired) rather than literal
  coordinates. That is a genuine strength of the existing suite and it is
  what makes the migration tractable at all.
- Two tests would be **added**: a schema-validation test per data file, and a
  referential-integrity test (every `prefab` referenced exists, every `killer`
  is a real actor, every `colIndex` is in range). Those are new safety that
  the current TypeScript literals get for free from the type checker — which
  is the first real cost of moving to JSON.

---

## 3. Trade-off analysis, judged against what this run actually asked for

I classified all twelve change requests by the layer they had to touch.

| Request | What it actually changed | Would data files have made it cheaper? |
|---|---|---|
| A2 upgraded character models | procedural rig geometry (`characters.ts`) | **No** |
| B1 film-look pass | lighting + material params + some geometry | **Partly** — the material block is data |
| A3 granite retexture | texture assets + material table + a few surrounds | **Partly** — biggest single win |
| A4 stylized blood | new sim state, render, hash, tests | **No** |
| A5 ballistics VFX | `effects.ts`, camera shots, sim projectiles | **No** |
| A6 revoke blood | deleting the above | **No** |
| B2 elevator-bank rebuild | procedural geometry in `lobby.ts` | **Only with a prefab system** — see below |
| B3 wall-run restaging | pose function + sim aiming + camera | **No** |
| B4 detector sound | one asset + one table row | Already data |
| B5 tracer glow | `effects.ts` + sim muzzle geometry | **No** |
| B6 weapons backwards | rig construction + pose/aim maths | **No** |
| A7 ballistics package | effects, camera, sim, audio, events | **No** |

**Two of twelve** would have been meaningfully cheaper (A3, and B2 only if a
prefab interpreter already existed). Nine were procedural or behavioural work
that no JSON schema addresses. That is the honest empirical answer, and it
argues against a full refactor for a demo of this shape.

### The counter-argument I take seriously

The above understates the case for data, because it measures *structure* and
the real cost was *tuning*.

Almost every request, procedural or not, ended in a long loop of adjusting
**numbers**: camera offsets, slow-motion scales, halo sizes, emissive
intensities, muzzle offsets. Delivering B5/A7 took roughly ten
`edit → npm run build → navigate → screenshot → judge` cycles purely to tune
constants like "camera 0.4 m abeam" and "halo pulls back below 0.12× time
scale". Each cycle is ~30–60 s of wall clock plus the reasoning to judge the
frame.

The three requests since then made this the dominant cost, not a side effect:

- **B7** took four rounds, every one of them a number: lamp size, emissive
  drive, light intensity, and finally the discovery that the lens had to be
  unlit at all.
- **A9**'s post stack took roughly eight rounds tuning bloom threshold,
  exposure, contrast, brightness, vignette and grain — and two of those rounds
  were spent recovering from a grade that was mathematically wrong rather than
  merely mistuned.
- **A11** was six rounds per character on proportions.

Every one of those constants is data in all but storage. **The win available
here is hot-reload of tuning constants, not a JSON scene graph** — and it is a
much bigger win than the first draft of this review credited.

Those constants are already data in every meaningful sense — they are just
embedded in code, so changing one forces a rebuild. **The win available here
is hot-reload of tuning constants, not a JSON scene graph.** A `tuning.json`
with Vite HMR, or URL-parameter overrides for a named set of constants, would
have cut that loop far more than a declarative scene format would have.

### Costs of the full refactor, stated plainly

- **Type safety lost.** Today a typo in `SOLDIERS` fails `tsc`. In JSON it
  fails at runtime, or at a schema test you must remember to write. For a
  codebase whose correctness story rests on determinism, that is a real
  regression that has to be bought back with schema work.

  A10 supplied a live example of exactly the failure mode, and it is worth
  recording because it cuts both ways. `World.step` walks `CUES` with a
  monotonic index, so the list has to be sorted by time. Inserting ten voice
  cues in source order silently stopped **every later cue** — the coat reveal,
  both draws, all three gun drops, the holster and the elevator. The types were
  all correct; the *ordering invariant* was not expressible in the type system.
  A schema layer with a sortedness check would have caught it; so would the
  test that now exists. The lesson is not "data files are dangerous", it is
  that the invariants a data layer needs are exactly the ones TypeScript does
  not give you for free, and that budgeting for them is part of the migration
  cost.
- **Debuggability worsens.** A wrong camera today is a breakpoint in a closure
  with the actor state in scope. A wrong camera in a data-driven engine is a
  parameter in JSON interpreted by a shot-type implementation two layers away.
  Given that the failure mode in this run was repeatedly "the frame is wrong
  and I must work out why", indirection is a genuine cost.
- **Expressiveness ceiling.** Every new set piece needs a new shot type, a new
  prefab feature, or an escape hatch back into code. Escape hatches then
  accumulate until the data layer describes only the boring parts.
- **Performance.** Neutral. Everything is resolved at load; the 60 fps budget
  is dominated by draw calls and the 240 Hz sim, neither of which changes.
- **Risk.** Rewriting the shared `layout.ts` touches the raycaster, meaning
  every trajectory, every scripted miss and every decal position is in the
  blast radius. The test suite would catch gross breakage but not "the scene
  now looks subtly wrong", which is precisely the class of defect that has
  dominated this run's review cycles.

### Where the argument flips

For a **reusable production** codebase — several levels, several scenes, a
team including non-programmers, content authored after the engine ships — the
verdict reverses completely. Then the 600–900 lines of engine amortise across
N scenes and the JSON is authored by people who should not be editing
TypeScript. This project is one fixed 61-second scene with one author. The
amortisation denominator is 1.

---

## 4. Migration plan (if it were to be done)

Ordered so each step ends with tests green and the render pixel-identical.

| # | Step | Effort | Risk |
|---|---|---|---|
| 0 | *(done, in B7)* `?freeze=1` — hold one reproducible frame. Prerequisite for any before/after verification, and for turning a screenshot diff into an exact test rather than a statistical one | 1 h | none |
| 1 | *(done)* Shot metadata + timeline consistency tests: give each camera shot a declarative `id`/`subject` header, assert shots are ordered and every slow-motion window lies inside the shot that renders it | 1–2 h | none — metadata only |
| 2 | `data/timeline.json` for `DEATHS`/`DEATH_STYLE`/`KILLERS`/`SOLDIERS`/`CUES`/`SLOWMO`, static-imported, with a schema + referential-integrity test | 3–5 h | low — pure tables, hash test proves equivalence |
| 3 | `data/tuning.json` + Vite HMR for the visual constants (camera offsets, glow knees, halo sizes, grade and bloom parameters, rig proportions), overridable per URL param | 4–6 h | low, and **by a distance the highest practical payoff** |
| 4 | `data/lobby.scene.json` for `HALL`/`COLUMNS`/`CHECKPOINT`/`ELEVATOR`, still consumed by the existing builders | 4–6 h | medium — shared with the raycaster |
| 5 | Prefab interpreter: `parts` → Three.js, port columns, then the elevator bank | 2–3 d | medium-high — where B2-class work would get cheaper |
| 6 | Shot-type vocabulary; port the 23 closures onto 6 named types | 2–3 d | high — all 23 shots must be re-verified by eye |
| 7 | `data/characters.json` for rig proportions, materials and item mount axes | 3–4 d | high — 18 pose functions read the rig directly |

Total for the full programme: roughly **8–12 working days**, against a demo
that took a fraction of that to build. Steps 1–4 are about 1.5 days and carry
most of the practical benefit; steps 5–7 are where the cost explodes and the
benefit depends entirely on there being a second scene, which there is not.

---

## 5. Recommendation

**Partial — do steps 0–3, stop there. Do not refactor to a JSON-driven engine.**
(Steps 0 and 1 are already done; step 3 is the one that matters most.)

Reasoning:

1. The claim "everything is hardcoded" does not survive inspection. The
   sim/render split is already clean, and ~285 lines of the project are already
   declarative tables. Moving those from typed TypeScript literals into JSON is
   a serialisation change that buys new failure modes (runtime schema errors)
   and no new capability.
2. Measured against the twelve change requests this run actually received, a
   scene-data layer would have helped two. Nine were procedural. Optimising the
   architecture for the minority case is the wrong trade.
3. The real bottleneck this run was the **tuning loop**, not the structure —
   and the four requests since the first draft made that far more clear-cut.
   B7, A9 and A11 spent most of their wall-clock cycling numbers through
   `edit → build → seek → screenshot → judge`. That is fixed by hot-reloadable
   constants (step 3), which is cheap, and is entirely orthogonal to whether a
   scene graph is declarative. If only one thing on this list is ever built, it
   should be that one.
4. The camera — the layer most often touched, by A5, A7, B2 and B3 — is the
   layer *least* expressible as static data, because every shot reads live
   simulation state. Making it data-driven means inventing a shot-type
   vocabulary: more machinery, and the same expressiveness the closures already
   have.
5. For a one-shot demo with one author and a hard requirement that the
   simulation stay bit-deterministic, indirection between the code and the
   frame is a cost paid on every review cycle, and this run has been dominated
   by review cycles.

If this codebase were to become a reusable engine with multiple scenes, I would
reverse this and do the full programme, starting at step 5 — but that is a
different project with a different brief.

### What I implemented

**Step 1**, because it is the one step that is clearly worthwhile, carries no
risk, and is grounded in defects that actually happened in this run. **Step 0**
followed later, out of necessity rather than plan — see the postscript.

Each camera shot now carries a declarative header (`id`, and `subject` where
one exists) separated from its motion closure, and `tests/timeline.test.ts`
asserts the structural invariants that were silently violated during this run:

- camera shots are strictly ordered in time;
- slow-motion windows are ordered and never overlap;
- **every slow-motion window lies inside the single camera shot that renders
  it.**

That last check is not hypothetical. Before this batch, the A7 casing insert
declared a slow-motion window that outlived its own camera shot: the shot ended
at t=21.0 while the casing it was supposed to follow did not land until t=21.45
and did not come to rest until t=21.95. The insert cut away before the beat it
existed to show, and nothing failed. The same class of error shortened the
bullet-cam. The test now makes that a build failure instead of something a
reviewer has to catch by eye.

No rendering code changed. The diff touches only the `Shot` interface, the
`id`/`subject` literals on each shot object, and a new `shotList()` accessor
that nothing but the test calls; every `update()` closure and every `t0` is
untouched.

**On verifying "pixel-identical":** the demo has no pause. `timeScale` is
clamped to a minimum of 0.02, so the simulation always creeps forward and most
shots additionally move with wall-clock time (`realT`, camera shake). Two
screenshots of the *same build* at the muzzle-exit insert differ in 73% of
pixels purely from that drift, so a naive before/after pixel diff cannot
demonstrate anything — which is worth recording, because it means "verify with
a screenshot diff" is not a check this project can currently support.

What I did instead: took the one frame that is nearly reproducible — the final
wide (shot 17), whose camera is constant after a 6 s ramp — with `camShake=0`,
and measured a noise floor from two captures of the same build. Result:

| comparison | differing pixels | mean abs delta |
|---|---|---|
| same build, twice (noise floor) | 0.189 % | 0.021 |
| **pre-change vs post-change** | **0.037 %** | **0.0024** |

The change is an order of magnitude *below* the run-to-run noise, i.e. visually
inert. A cheap follow-up worth having (and a good argument for step 3 of the
migration plan) would be a `?freeze=1` parameter that renders a fixed sim time
with no wall-clock terms, which would make screenshot diffing an exact test
rather than a statistical one.


---

## Postscript: what the last four requests changed about this review

Nothing in the recommendation, and two things in the reasoning.

**The tuning-loop argument got much stronger.** In the first draft it was a
caveat appended to a mostly-negative verdict. After B7, A9 and A11 it is the
main finding: the structure of this codebase was almost never the thing
slowing the work down, and the numbers embedded in that structure almost
always were. Step 3 of the migration plan has moved from "worth doing" to
"the only step whose absence I actually felt on every request".

**Step 0 turned out to be a prerequisite, not a nicety.** The first draft
noted, as an aside, that the project cannot support screenshot diffing because
the demo never pauses. B7 then made that concrete: with a 50 % duty cycle on
the alarm lamp I could not reliably capture a lit frame at all, because the
simulation drifts between navigating and capturing. `?freeze=1` was built to
finish B7, and it is now what makes A11's and A9's before/after comparisons
exact. A verification affordance that looked like a footnote was in fact
blocking work.

One thing the last four requests did **not** do is move the verdict. A11 was
the closest call — six rounds of character geometry is exactly the kind of work
a `characters.json` is sold on — but splitting it honestly showed that the half
that hurt (structural rebuilds: one wrapped skirt instead of three planes, one
displaced sphere instead of five stuck-on face parts) is precisely the half no
schema can express, and the half data would have helped (proportions) is
already covered by step 3 at a fraction of the cost.
