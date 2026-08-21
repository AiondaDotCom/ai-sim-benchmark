# Procedural Mountain Water Simulation

A fully autonomous, no-UI 3D demo: a procedurally generated mountain
landscape where rain and mountain springs feed water that flows downhill
along the local terrain gradient, carves visible streams, and pools into
lakes in the basins. Built for recording social-media showcase clips - load
the page and it runs itself, with a slow cinematic camera orbit, no buttons,
no sliders, no click-to-interact.

## Quick start

```
./start.sh
```

That's it. The script checks for Node.js/npm, runs `npm install` if
`node_modules` is missing, starts the Vite dev server, and prints the local
URL to open (it also tries to open your browser automatically).

To run the optimized production build instead:

```
./start.sh --preview
```

## Manual setup

```bash
npm install
npm run dev       # dev server with hot reload
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build
npm run test      # run the automated test suite (Vitest)
```

## Configuration (no on-screen UI, by design)

The brief calls for zero visible controls - the only way to configure a run
is via URL query parameters (for sharing specific variations) or by editing
the constants in `src/config.ts`:

| Query param | Meaning                                   | Default     |
|-------------|--------------------------------------------|-------------|
| `seed`      | Terrain/spring seed (any string or number) | `summit-42` |
| `rain`      | Rain-rate multiplier (`0` disables rain)   | `1`         |
| `speed`     | Simulation time multiplier                 | `1`         |
| `orbit`     | Camera orbit speed multiplier              | `1`         |

Example: `http://localhost:5173/?seed=glacier-7&rain=1.6&speed=1.5`

Grid resolution, world size, max elevation, flow rate, evaporation rate and
camera framing are code constants in `src/config.ts` (`DEFAULTS`).

## Architecture

The code is split into three layers that don't leak into each other:

```
src/
  sim/               Pure simulation - no Three.js, no DOM, fully unit-testable
    prng.ts            Deterministic seeded PRNG (xmur3 hash + mulberry32)
    noise.ts           Seeded fractal value noise (fBm)
    terrain.ts         Procedural heightmap generation from a seed
    water.ts           Grid-based shallow-water flow simulation
  render/            Three.js only - reads plain data out of sim objects,
                     never mutates simulation state or imports its internals
    scene.ts           Renderer/camera/lights/fog setup
    sky.ts             Gradient sky dome (shader) + fog/background colours
    terrainMesh.ts     Static terrain mesh (heights -> geometry + vertex colors)
    waterMesh.ts       Dynamic water-surface mesh, rebuilt from sim depth each frame
    rainParticles.ts   Purely decorative falling-rain particles
    cameraPath.ts      Autonomous slow orbit camera motion
  config.ts          URL-param / constant configuration (no UI)
  app.ts             Wiring: owns the render loop, the only module that
                     imports from both sim/ and render/
  main.ts            Bootstrap only - finds the mount element, starts app.ts
  style.css          Fullscreen, chrome-free canvas host (sky-blue background)
```

`main.ts` never attaches an event listener for user control - by design,
this is a "load and watch" demo, not an interactive app.

### Simulation model

**Terrain** (`sim/terrain.ts`): a deterministic heightmap is built on a
square grid from a seed by combining:
1. Fractal value noise (`sim/noise.ts`, 6 octaves) for natural high-frequency
   detail, blended with a "ridged" noise pass so ridgelines read clearly
   enough for water to commit to visible flow paths.
2. A handful of seed-derived Gaussian bumps that guarantee a few
   unmistakable summits (used as spring sites), rather than a uniformly
   bumpy field.
3. A radial falloff towards the map edge so the terrain forms a basin/island
   with an obvious low rim, giving water somewhere to collect instead of an
   infinite plateau.

Every value ultimately derives from `mulberry32(hashSeed(seed))` - the same
seed always reproduces an identical heightmap and identical spring
placement (verified in `terrain.test.ts`).

**Water** (`sim/water.ts`): a grid-based, explicit shallow-water relaxation
scheme (sometimes called a "virtual pipes" model), not a rigid-body physics
engine and not a full Navier–Stokes solver:

- Each cell stores a scalar water *depth* on top of the fixed terrain
  height.
- Every step, each cell compares its **total height** (terrain + water) to
  its four axis-neighbours. Water flows from higher total height to lower,
  with the outflow split across downhill neighbours in proportion to the
  height difference, and capped so a cell never sends out more water than
  it currently holds and never overshoots past equilibrium.
- Flux is accumulated into a scratch buffer and applied all at once per
  step, so cell-processing order never double-counts water - this is what
  keeps the scheme numerically mass-conserving (see the conservation
  tests).
- Two independent, continuous water sources drive the "autonomous" look
  required by the brief: a uniform rain sheet added every frame, and a
  handful of springs placed at detected terrain peaks that continuously
  emit water. Either can be scaled/disabled via the `rain` URL parameter;
  springs are always on so the demo never looks static even with rain off.
- A small evaporation term (configurable, default keeps roughly a lake's
  worth of water in the basins) prevents the whole map from flooding solid
  during a long recording; it's applied as a separate, explicitly
  non-conservative step so the core flow logic can be tested for mass
  conservation in isolation (evaporation disabled).

Streams and lakes are an emergent property of this local rule, not
scripted: water visibly threads down the steepest available paths from each
spring/rain cell and pools wherever it reaches a local basin the outflow
can't escape.

### Rendering

- `terrainMesh.ts` builds one static `PlaneGeometry` from the heightmap with
  per-vertex colours (sand → grass → rock → snow by elevation).
- `waterMesh.ts` builds a second geometry sharing the same grid topology;
  every frame it pushes the current depth grid into vertex Y positions and a
  custom `aDepth` attribute, and a small GLSL shader shades/animates the
  surface and fades dry cells out via `discard` (so puddles below a visible
  threshold don't render at all).
- `sky.ts` renders a large inverted sphere with a vertical-gradient shader
  (never a flat/black background) whose colours match the scene fog, so the
  horizon blends smoothly; `style.css`/`index.html` also set the page
  background to the same sky blue so there's no dark flash before the
  canvas paints.
- `cameraPath.ts` drives a slow autonomous orbit (combined azimuth rotation
  + gentle radius/height breathing) - no `OrbitControls`, no pointer
  listeners.

## Tests

`npm run test` runs the Vitest suite (`src/sim/__tests__/`):

- **`terrain.test.ts`** - deterministic terrain generation: identical seeds
  produce byte-identical heightmaps (string and numeric seeds), different
  seeds produce substantially different terrain, elevations stay within the
  configured bounds, and detected "peaks" are genuine local maxima.
- **`water-conservation.test.ts`** - approximate conservation of water mass:
  with rain/springs/evaporation disabled, total volume is stable to within
  0.1% relative error over hundreds of flow steps; a dry grid never
  fabricates water; enabling only rain increases total volume by
  approximately the analytically expected amount.
- **`water-flow-direction.test.ts`** - downhill flow direction: water on a
  slope always flows towards the lower neighbour and never towards the
  higher one (for shallow charges); a deep-enough flood is shown to
  correctly top a small ridge (flow follows *total* height, which is the
  physically intended behaviour, not a bug); and a conical hill drains
  radially outward/downhill from its summit.

Current status: **12/12 tests passing**, TypeScript type-checks with no
errors, and `npm run build` completes successfully.

## Known limitations

- **2.5D shallow-water approximation, not a full fluid solver.** There is no
  momentum/velocity field, no advection, and no overhangs/caves - each cell
  only exchanges volume with its 4 axis-neighbours based on the current
  height difference. This is intentionally simple (no physics engine, per
  the brief) and is fast enough to run the whole grid every frame in plain
  JS, but it will not reproduce phenomena like waves, splashing, or fast
  turbulent rapids.
- **Grid resolution is fixed at load time** (`config.gridResolution`,
  default 128×128) and is not adaptive - very thin/fast streams can look a
  little blocky at the default resolution; raising it improves fidelity at
  a roughly quadratic performance cost.
- **Evaporation is a simplification**, not a real evapotranspiration model -
  it's a flat percentage per second, tuned so long recordings reach a
  visually stable lake level rather than flooding indefinitely.
- **No erosion/sediment transport.** The terrain height field is static;
  flowing water does not reshape the landscape over time.
- **Water self-collision/edge leakage**: the simulation grid has closed
  (non-wrapping) borders - water reaching the map edge simply cannot flow
  further and will pool there rather than draining "off the world."
- **Performance scales with grid resolution and viewport size**; on very
  low-end integrated GPUs the default resolution/shadow map size may need
  lowering (`gridResolution`, `sun.shadow.mapSize` in `render/scene.ts`) for
  a smooth 60fps recording.
- **No automated visual/screenshot regression tests** - the test suite
  covers the simulation core (deterministic generation, mass conservation,
  flow direction) but not pixel-level rendering output.
