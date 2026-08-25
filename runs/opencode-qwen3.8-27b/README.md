# Aqua Peaks

An autonomous 3D water simulation: a procedural **caldera** island where
rainfall, mountain springs, and a carved river send water downhill into a
central lake — rendered as a fully self-running, cinematically-lit demo (real
sun shadows, a glinting lake, falling rain, drifting clouds, and a film grade)
with a slow orbiting camera.

It exists to be **recorded**, not used: there is deliberately **no on-screen
UI and no interaction of any kind**. The screen shows only the 3D scene; the
simulation starts on page load and runs forever on its own.

Built with TypeScript, Vite, and Three.js. No physics engine, no 3D assets —
the terrain and water are pure math over heightfields.

## Quick start

```sh
./start.sh
```

That's it: the script checks for Node.js/npm, installs dependencies if
`node_modules` is missing, starts the dev server, and prints the URL
(`http://localhost:5173`). For the production build:

```sh
./start.sh --preview    # builds if needed, serves at http://localhost:4173
```

## Configuration (URL parameters only)

Because there is no UI, the only way to configure the demo is via query
parameters on the page URL:

| Parameter   | Default | Range   | Effect                                    |
| ----------- | ------- | ------- | ----------------------------------------- |
| `seed`      | `1337`  | `0…2³¹` | A completely different landscape          |
| `rain`      | `1`     | `0…5`   | Rainfall intensity multiplier             |
| `speed`     | `1`     | `0.1…4` | Simulation speed multiplier               |
| `springs`   | `3`     | `0…8`   | Number of mountain springs                |
| `res`       | `128`   | `32…256`| Terrain/water grid resolution (cells/side)|

Example: `http://localhost:5173/?seed=42&speed=2`.

## Architecture

The code is split into three clean layers with one-directional dependencies
(`sim` ← `render` ← `main`); the simulation is pure TypeScript with no DOM or
Three.js dependency, so it runs under Node (Vitest) for testing.

```
index.html            page shell; sky-blue body (no dark flash before first paint)
src/
  main.ts             bootstrap: config → simulation → scene → animation loop
  config.ts           reads URL query parameters, clamps to sane ranges
  sim/                pure simulation — no DOM, no WebGL, fully deterministic
    rng.ts            seeded PRNG (mulberry32) + integer lattice hash
    noise.ts          value noise, fbm, ridged fbm, smoothstep — all seed-pure
    terrain.ts        deterministic caldera: mountain ring, organic central
                      lake basin, a carved river channel, sealed rim wall
    water.ts          the flow solver: downhill heightfield relaxation
    sources.ts        spring placement (highest, well-separated peaks)
    simulation.ts     orchestrates rain, springs, river, evaporation, and flow
  render/             Three.js layer — reads sim state, draws it
    scene.ts          renderer, sky dome, fog, lights, shadows, bloom, grade
    terrain-mesh.ts   static heightfield mesh, elevation/slope colors, shadows
    water-mesh.ts     deep-blue water: per-vertex depth fade + ripple + glint
    rain.ts           cosmetic falling-rain line segments
    clouds.ts         soft orbiting cloud sprites
    grade.ts          final film grade: vignette + grain + contrast/saturation
    camera-rig.ts     slow autonomous orbit + gentle altitude breathing
tests/                Vitest suites for sim correctness (run in Node)
start.sh              one-command launcher (dev, or --preview for production)
```

## Simulation model

Everything runs on a `gridN × gridN` heightfield grid (default 128×128 over a
100 m × 100 m island).

**Terrain** (`terrain.ts`) is a pure function of the seed: a **caldera**. A
ring of mountains (rolling fbm mixed with ridged crests) surrounds a low
central floor; a smooth central bowl dips to a **lake basin** at the heart, its
shoreline modulated by low-frequency noise into an organic, irregular shape
(bays and inlets — never a perfect square or circle); a lowland plateau rises
from the lake rim up to the ring; a square ridge wall seals the map border so
water can never leave the island; and a meandering **river channel** is carved
from the mountain base into the lake, giving the water a defined bed to flow in.

**Water** (`water.ts`) is a depth-per-cell heightfield. Each cell's *surface
height* is `terrain + depth`. Every relaxation tick, each cell gives a share of
its depth to every neighbor with a lower surface, capped at half its current
depth. Three properties fall out of that single rule:

- Water only ever moves to a lower surface, so it **flows downhill**.
- Every transfer moves exactly the amount it deposits, so **mass is conserved**
  (to floating-point rounding) by the flow itself.
- Water with no lower neighbor accumulates, so lakes **collect in depressions**.

`Simulation.step(dt)` (`simulation.ts`) advances the whole system:

1. **Rain** — strong uniform precipitation over every cell, applied per second;
   its equilibrium film reads as a visible wet sheen and raises the lake level.
2. **Springs** — strong, persistent emitters placed on the highest, well
   separated peaks; they carve distinct streams that drain into the lake.
3. **River** — a single strong source at the top of the carved channel keeps a
   clear, wide stream flowing down the mountain into the lake at all times.
4. **Evaporation** — a depth-proportional loss (the basin's only outflow, since
   the rim seals the map). It is negligible in a thin stream but meaningful in
   a deep lake, so the sealed basin settles at a **stable equilibrium lake
   level** instead of rising forever.
5. **Flow** — the relaxation above, run as a fixed number of `tickDt`-length
   ticks per step so behavior is frame-rate independent.

The tuned defaults reach a steady state (prominent lake, flowing streams, dry
clean mountains) after roughly two minutes of simulation time.

## Rendering

- **Sky**: a gradient dome shader (soft blue zenith → `#87ceeb` horizon) with
  matching scene fog, so the horizon blends seamlessly; the page body is the
  same sky blue so there is no dark flash before the canvas paints.
- **Lighting**: a warm directional **sun** — animated each frame to mirror the
  camera about the look-target, so the lake always shows a central glint — that
  casts a soft **shadow map** (PCF) fitted to the island, giving real mountain
  shadows into the caldera and lake. A cool hemisphere fill + ambient keep the
  shaded floor detailed; a cool rim light crisps the peaks. ACES tone mapping.
- **Terrain**: one static mesh with per-vertex colors (meadow → forest → rock →
  snow by elevation, with slope-aware snowline and subtle noise tinting),
  flat-shaded, and casting/receiving the sun's shadow.
- **Water**: a second mesh on the same grid topology. Wet cells sit at
  `terrain + depth`; dry or too-thin cells are sunk just below the terrain (so
  hidden water can never z-fight). A deep blue material with a **per-vertex
  depth fade** (smooth, not a hard threshold) makes a thin rain film a faint
  sheen, streams clear threads, and the lake a solid body; a subtle clearcoat
  plus an animated ripple give a gentle sun glint, and the lake receives the
  wall's shadow.
- **Effects**: falling **rain** (line segments scaled to the rainfall), soft
  drifting **clouds**, and a final film **grade** (vignette + luminance-weighted
  grain + a contrast/saturation lift) applied after an `EffectComposer` bloom
  pass that lets the brightest sources glow.
- **Camera**: a slow orbit (full revolution in ~115 s) at a steep aerial ¾
  angle, with a gentle breathing of radius and altitude, always aimed at the
  scene — no input, always moving.

## Running it yourself

```sh
npm install          # install dependencies
npm run dev          # dev server → http://localhost:5173
npm run build        # type-check (tsc) + production bundle → dist/
npm run preview      # serve the production build → http://localhost:4173
npm test             # run the Vitest suite (terrain, water, simulation)
npm run typecheck    # TypeScript strict check
```

### Tests

The suite (`tests/`) covers the three correctness pillars:

- **Deterministic terrain** — same seed ⇒ bit-identical heightfield; different
  seeds differ; finite, non-negative, real relief; sealed border wall.
- **Approximate mass conservation** — the flow solver conserves total water to
  < 1e-4 relative over hundreds of ticks on real terrain; sources add exactly
  their configured mass when outflow is disabled.
- **Downhill flow** — water on a slope migrates downhill, never raises a
  surface above its previous maximum, and levels out in a depression.
- Plus: full-pipeline determinism, spring behavior, evaporation dynamics,
  long-run stability (no NaNs, no negative depths), and dt edge cases.

## Known limitations

- **Coarse water**: a 128² grid gives blocky stream edges and faceted lake
  surfaces; raise `?res` (at a CPU cost) for finer detail.
- **Stylized, not physical**: the flow is a local relaxation, not a Navier–
  Stokes solve — there is no momentum, turbulence, or surface tension. Water
  “ooblecs” slightly on very steep drops (the ½-depth cap trades fidelity for
  unconditional stability).
- **Sealed island**: the rim wall means the only outflow is evaporation. With
  very heavy `?rain` settings the lowlands can become a broad sheet; defaults
  are tuned for the happy path.
- **One lake, by design**: the caldera funnels all water to the single central
  basin; the carved river and the mountain springs feed it, and evaporation
  keeps it at a stable level.
- **Fixed camera**: the orbit is fixed by design (no user control); there is
  no way to re-aim it other than the clock.
- **No refraction/wind**: water is a translucent displaced surface with analytic
  normals; it shows a sun glint, a gentle ripple, and receives the wall's shadow,
  but does not refract the scene behind it or ripple from wind.
- **Performance**: the sim updates the whole grid every tick and the water mesh
  recomputes normals per frame — comfortable at 128² on modern hardware, but
  `?res=256` will cost a lot of CPU.
