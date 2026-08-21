# Mountain Water Simulation

An interactive-free, fully autonomous 3D water simulation over a procedurally
generated mountain landscape, built with **TypeScript**, **Vite** and
**Three.js** — no physics engine, no external 3D assets.

![Water simulation demo](docs/demo.gif)

*20-second capture of the autonomous demo (rain + mountain springs, orbiting camera). A higher-quality MP4 is available at [docs/demo.mp4](docs/demo.mp4).*

On page load, rainfall and mountain springs start automatically. Water flows
downhill along the local terrain gradient, carves visible streams down the
slopes and collects into lakes in the depressions, while the camera performs a
slow automatic orbit around the scene. There is **no on-screen UI of any
kind** — the app is designed for recording showcase videos.

## Running

Quick start: `./start.sh`

The script checks that Node.js and npm are installed, runs `npm install` on
first use, starts the dev server and prints the local URL. Use
`./start.sh --preview` to build and serve the production bundle instead.

Manual commands:

```bash
npm install
npm run dev       # development server (http://localhost:5173)
npm test          # run the automated test suite (vitest)
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

## Configuration (URL query parameters only)

There are deliberately no on-screen controls. All configuration happens via
URL query parameters (defaults in `src/config.ts`):

| Parameter    | Default | Meaning                                          |
| ------------ | ------- | ------------------------------------------------ |
| `seed`       | `1337`  | Terrain seed (any integer) — deterministic       |
| `grid`       | `192`   | Simulation grid resolution (32–512)              |
| `rain`       | `0.012` | Uniform rainfall, depth units per second         |
| `springs`    | `6`     | Number of springs placed near mountain peaks     |
| `springRate` | `14`    | Water volume per spring per second               |
| `speed`      | `1`     | Simulation speed multiplier (0.1–8)              |
| `evap`       | `0.012` | Fraction of water depth evaporating per second   |
| `orbit`      | `75`    | Camera orbit period in seconds                   |

Example: `http://localhost:5173/?seed=42&rain=0.03&speed=2`

## Architecture

The code is split into three cleanly separated layers. The simulation layer
has **zero dependencies on Three.js or the DOM** (the test suite runs it in
plain Node):

```
src/
├── main.ts               # bootstrap: wires config → simulation → rendering
├── config.ts             # URL-query-parameter configuration (no UI)
├── sim/                  # pure simulation (no three.js, no DOM)
│   ├── noise.ts          # seeded 2D value noise, fBm, ridged multifractal
│   ├── terrain.ts        # deterministic heightfield + spring placement
│   └── water.ts          # shallow-water "virtual pipes" solver
└── render/               # three.js presentation layer
    ├── scene.ts          # renderer, camera, lights, fog, resize handling
    ├── gridGeometry.ts   # shared grid geometry (grid index ↔ vertex mapping)
    ├── terrainMesh.ts    # static terrain mesh, height/slope vertex colours
    ├── waterMesh.ts      # dynamic water surface (depth → height/colour/alpha)
    └── cameraRig.ts      # automatic slow orbit + vertical breathing motion
tests/
├── terrain.test.ts       # determinism, relief, spring placement
└── water.test.ts         # mass conservation, downhill flow, stability
```

### Terrain model

The terrain is a row-major `Float32Array` heightfield generated purely from an
integer seed (`src/sim/terrain.ts`):

- **Seeded value noise** with an integer lattice hash (`Math.imul`-based, no
  `Math.random()`), so the same seed produces bit-identical terrain on every
  run and platform.
- **Ridged multifractal** octaves form sharp mountain ridges; gentle **fBm**
  adds rolling base relief; a light **domain warp** removes grid artefacts.
- A raised **rim** towards the map border forms a surrounding mountain range
  (and keeps water inside the closed domain), while a shallow **central
  basin** gives lakes a natural place to form.
- **Springs** are placed deterministically at local maxima in the top part of
  the height range, greedily selected highest-first with a minimum mutual
  distance.

### Water model

`src/sim/water.ts` implements the classic **virtual pipes** shallow-water
scheme (O'Brien & Hodgins 1995; Mei et al. 2007) on the same grid:

1. **Sources** — uniform rainfall and point springs add depth.
2. **Flux update** — each cell keeps four outflow fluxes (L/R/T/B). A flux is
   accelerated by the hydrostatic head, i.e. the difference of the *water
   surface* (terrain + depth) to the neighbour, clamped to ≥ 0 and slightly
   damped. This is exactly "flow downhill along the local gradient", with
   inertia.
3. **Outflow limiter** — if a cell would export more water in one step than it
   holds, all four fluxes are scaled down proportionally. This makes the
   scheme mass-conserving and prevents negative depths.
4. **Depth integration** — `depth += dt · (inflow − outflow)`.
5. **Evaporation** — optional exponential decay, so rainfall and drainage
   reach a visually pleasing equilibrium instead of flooding the map.

Boundaries are closed (no flux across the map edge). All water added or
removed is tracked (`totalRained`, `totalSpringInflow`, `totalEvaporated`), so
the mass balance can be checked exactly — which the tests do.

The main loop advances the solver with a fixed timestep (1/90 s) through a
wall-clock accumulator, so simulation behaviour is independent of display
refresh rate; `speed` scales the accumulator.

### Rendering

- Terrain: one static indexed mesh; vertex colours blend grass → rock → snow
  by elevation and slope, with deterministic per-vertex jitter against
  banding; Lambert shading.
- Water: a second mesh sharing the same grid mapping. Every frame, wet
  vertices are lifted to `terrain + depth` and coloured by depth (shallow
  cyan → deep blue) with flow-dependent brightening ("foam") on fast streams;
  dry vertices are sunk below the terrain with alpha 0. Phong shading with
  specular highlights, `depthWrite` off so shorelines blend cleanly.
- Camera: slow orbit with gentle height/radius oscillation — smooth for video.

## Tests

`npm test` runs 11 tests (Vitest, Node environment, simulation layer only):

- **Deterministic terrain** — same seed ⇒ bit-identical heightfield;
  different seeds ⇒ different terrain; finite heights with real relief;
  deterministic spring placement near peaks.
- **Mass conservation** — an initial deposit in a closed domain is conserved
  over 1000 steps (< 0.1 % drift); with rain/springs/evaporation active, the
  water on the map matches the tracked source/sink balance to < 0.1 %;
  no NaNs or negative depths after 2000 steps of heavy rain.
- **Downhill flow** — on an inclined plane the water's centre of mass moves
  substantially downhill; water poured on the rim of a bowl collects at the
  bowl's centre; rain on a slope accumulates on the low side.

## Known limitations

- **CPU solver** — the simulation runs in JavaScript on the CPU. The default
  192×192 grid is fast; grids ≫ 256² will start to cost frame time (a GPU
  compute/shader implementation would scale much further).
- **Shallow-water approximation** — the virtual-pipes model has no vertical
  velocity component: no splashes, spray, breaking waves or true waterfalls
  (water on cliffs renders as a thin sheet following the surface).
- **Closed domain** — water cannot leave the map; the border rim is part of
  the terrain design. There are no rivers exiting to an ocean.
- **No erosion** — the terrain is static; streams do not carve channels over
  time.
- **Uniform rain** — rainfall has no spatial weather pattern or visible rain
  particles; water simply appears on the surface.
- **Evaporation is a stabiliser** — it is tuned so lakes reach equilibrium
  instead of flooding; it is not a physical evaporation model (no temperature,
  no humidity).
- **Numerical, not exact** — mass is conserved to float32 round-off
  (verified < 0.1 % over 1000 steps), and very steep cliffs can show brief
  flux oscillations, damped by the flux-damping factor.
- **Determinism scope** — terrain generation is bit-deterministic. The
  simulation itself is deterministic per step; however, the *rendered*
  trajectory depends on wall-clock frame timing (fixed timestep, but the
  number of steps per rendered frame varies with the display).
