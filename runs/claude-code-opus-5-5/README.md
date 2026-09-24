# Watershed — autonomous 3D water simulation

A procedural mountain landscape (generated from a deterministic seed) on which
rain falls and springs emerge just below the highest peaks. The water flows
downhill along the terrain gradient, carves visible streams and waterfalls,
collects in depressions and fills them into lakes, and drains off the edge of
the map, all on its own. The camera slowly orbits the valley.

The demo is fully autonomous and has **no UI at all**: no buttons, panels or
mouse interaction, only the 3D scene against a soft sky-blue gradient. It is
meant for recording showcase videos.

Built with TypeScript, Vite and Three.js. No physics engine, no 3D assets:
the terrain, water, sky and rain are all generated in code.

## Quick start: `./start.sh`

```bash
./start.sh              # checks Node/npm, runs npm install if needed, starts the dev server
./start.sh --preview    # builds for production and serves the build
```

The script prints the local URL (dev: `http://localhost:5173/`, preview:
`http://localhost:4173/`). `PORT=8080 ./start.sh` and `HOST=0.0.0.0 ./start.sh`
override the defaults. Node.js 20 or newer is recommended (developed with
Node 22).

Manual equivalent:

```bash
npm install
npm run dev        # development server
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
npm test           # Vitest suite
```

## Configuration (URL query parameters only)

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `seed`    | `1337`  | Terrain seed. Integers are used as-is, any other string is hashed (`?seed=alps`). |
| `rain`    | `1`     | Rain intensity multiplier, 0–10. `0` = no rain, springs only. |
| `speed`   | `1`     | Simulation speed multiplier, 0–10. |
| `springs` | `5`     | Number of springs near the peaks, 0–20. |
| `size`    | `256`   | Simulation grid resolution (64–512). Cost grows with size². |
| `orbit`   | `1`     | Camera orbit speed multiplier (`0` = static camera). |
| `warmup`  | `0`     | Simulated seconds computed before the first frame, so a recording can start with streams and lakes already formed. |

Example: `http://localhost:5173/?seed=7&rain=1.5&speed=2&warmup=120`

Further tuning constants live in code: `src/sim/world.ts` (rain rate,
evaporation, time step, spring rate), `src/main.ts` (simulated seconds per
real second, step budget per frame), and `src/render/*` (colours, lighting,
camera path).

## Architecture

```
src/
  sim/                 pure simulation, no Three.js, no DOM (fully unit-tested)
    random.ts          mulberry32 PRNG, string -> seed hashing
    noise.ts           seeded 2D simplex noise, fBm, ridged multifractal
    terrain.ts         heightfield generation, spring placement, gradients
    water.ts           WaterSimulation: virtual-pipe shallow-water solver + water budget
    world.ts           World: terrain + water + weather (rain schedule, springs), fixed-step advance()
  render/              Three.js only; reads simulation state, never writes it
    sceneView.ts       renderer, scene, lights, fog, composition of the views below
    terrainMesh.ts     lit vertex-coloured terrain (meadow/forest/rock/snow), wet-soil darkening, surrounding plain
    waterMesh.ts       custom water shader: depth colour, Fresnel sky reflection, sun glint, ripples, foam
    sky.ts             gradient sky dome with sun glow (colour-matched to the fog)
    rain.ts            GPU-animated rain streaks
    cameraRig.ts       automatic, time-based orbit camera
    palette.ts         shared colours (sky, fog, sun)
  config.ts            URL query parameter parsing and clamping (no UI)
  main.ts              bootstrap: config -> World -> SceneView -> animation loop
tests/
  terrain.test.ts      determinism of PRNG/noise/terrain, value ranges, basins, springs
  water.test.ts        mass conservation, water budget, non-negativity, downhill flow, pooling
  config.test.ts       URL parameter parsing
```

Data flows one way: `main.ts` advances the `World` by `realDt × 8 × speed`
simulated seconds per frame (fixed 0.05 s steps, at most 14 steps per frame),
then `SceneView.render()` copies the depth and velocity fields into GPU
buffers and draws. The simulation layer can run headless (that is what the
tests do). `window.__waterDemo` is exposed as a read-only handle for automated
inspection or recording scripts. It adds nothing visible.

## Simulation model

### Terrain

`generateTerrain({ size, seed, maxHeight })` builds a `size × size`
heightfield (horizontal cell size 1, heights in the same units):

1. Domain-warped **ridged multifractal** simplex noise for sharp ridges.
2. A low-frequency fBm "mass" field for broad mountain bodies, plus a small
   amount of rolling hills.
3. A soft radial mask (slightly off-centre, seeded) concentrates the massif in
   the middle. The border is lowered and ramps to exactly 0 at the edge, so
   rivers can leave the map and the terrain meets the surrounding plain
   seamlessly.
4. A few **basins** are blended towards a floor below their neighbourhood
   minimum, which guarantees closed depressions that fill into lakes. The
   noise also creates many natural depressions.
5. Normalisation to `[0, maxHeight]`.

Every random choice comes from one mulberry32 stream seeded by `seed`, so the
same seed always gives a bit-identical heightfield.

**Springs** sit at the highest local maxima (at least 40 % of max height,
mutually separated), moved three steepest-descent steps down the flank.

### Water: virtual-pipe shallow-water model

Each cell holds a water depth `d`. Neighbouring cells are connected by four
virtual pipes carrying a volume flux (O'Brien & Hodgins 1995; Mei, Decaudin &
Hu 2007). Per time step `dt`:

1. **Sources**: rain adds `rainRate × rainWeight[i] × dt` to each cell. Rain
   is orographic (higher terrain gets more) and follows a schedule: an initial
   downpour that decays over the first minute, then slowly pulsing showers.
   Springs add a fixed volume per second.
2. **Flux update**: each outgoing pipe is accelerated by the surface height
   difference, `f ← max(0, damping·f + dt·g·A·(H_i − H_j)/l)` with
   `H = terrain + depth`. Water therefore accelerates down the gradient of the
   water surface, which on thinly wetted slopes is the **terrain gradient**.
3. **Outflow limiting**: if a cell would lose more than it holds, all its
   outflows are scaled by `K = d·l² / (Σf·dt)`, so depths never go negative.
4. **Depth update**: `d += dt·(Σ inflow − Σ outflow)/l²`. Every flux leaves
   exactly one cell and enters exactly one other, so transport **conserves
   volume exactly** (up to floating-point rounding, stored in `Float64Array`).
   The depth-averaged velocity is derived from the net flux for rendering
   (foam) and tests.
5. **Evaporation** removes a small constant depth per second from wet cells,
   so lakes reach an equilibrium size instead of growing forever.

**Lakes** emerge naturally. In a depression no neighbouring surface is lower,
so outflows decay until the water surface reaches the spill point. Then the
lake overflows and a stream continues downhill. With `boundary: 'open'` (used
by the demo) water crossing the map edge leaves the domain. `'closed'` makes
the border a wall (used by the conservation tests).

A running **budget** (`rained`, `sprung`, `evaporated`, `drained`) is kept, so
`volume(t) = volume(0) + rained + sprung − evaporated − drained` can be
checked at any time. The time step is additionally clamped by a CFL-style
bound `dt ≤ 0.5·l / √(g·A·d_max/l²)`.

### Rendering

- **Water surface** vertices sit at `terrain + depth` (plus a tiny lift
  against z-fighting). Dry vertices sink below the terrain so wet/dry edges
  taper. Visual depth also counts discharge (`depth × speed`), so fast thin
  sheet flow on steep slopes still reads as a stream or waterfall. The shader
  blends turquoise shallows to deep blue by depth, adds Fresnel sky reflection,
  a sun glint, animated ripples and white foam on fast water. Normals come
  from the water surface each frame.
- **Terrain** colours come from height, slope and seeded jitter. Cells that
  carry or recently carried water are darkened (wet soil that dries slowly).
- **Sky**: a gradient dome (zenith `#3f8fd8` to horizon `#a3d8ef`). The fog
  uses exactly the horizon colour, and the sky is not tone-mapped (Three
  applies fog after tone mapping), so distant terrain melts into the horizon.
  The page `body` background is sky blue (`#87ceeb` plus gradient), so there
  is no dark flash before the first WebGL frame.
- **Camera**: a slow orbit (one revolution every ~150 s) with gently varying
  radius and height. It is a pure function of time.

## Tests

`npm test` runs 23 Vitest tests:

- **Deterministic terrain**: identical seeds give bit-identical heightfields
  and basins; different seeds differ. PRNG and noise are reproducible and
  bounded. Heights are normalised. The interior is much higher than the
  border. Basin centres are local minima. Springs are deterministic and sit
  above the 75th height percentile.
- **Mass conservation**: closed domain with random initial water, 2000 steps,
  relative volume drift < 1e-9. Open domain with rain, springs, evaporation
  and drainage: volume matches the budget to < 1e-6. A full `World` run
  matches its budget too. A tall single column never produces negative depth.
- **Downhill flow**: on an inclined plane the water's centre of mass moves
  downhill (tested along +x and −y). Every wet cell's velocity points downhill. On
  generated terrain, more than 95 % of sheet-flow velocities point against the
  terrain gradient. Water in a bowl pools at the bottom with a flat surface
  (a lake). Water from a spring near a peak ends up far below the spring.
- **Configuration**: defaults, clamping, garbage values, string seeds.

## Known limitations

- **CPU simulation on the main thread.** One step at 256² costs about 1.3 ms
  in Chrome on an Apple-silicon Mac, so the default of 8 simulated seconds per
  real second runs at 60 fps. Very large grids (`size=512`) or high `speed`
  values hit the 14-steps-per-frame cap. The simulation then runs slower than
  requested (by design, to avoid a frame-time spiral), and the frame rate can
  drop on slower machines. A Web Worker or GPU (GPGPU) solver would remove this.
- **Shallow-water approximation.** The pipe model has no momentum advection,
  turbulence or vertical flow. Waterfalls are thin sheets of fast water on
  steep cells, not free-falling particles. Damping (0.995 per step) calms
  oscillations but slightly slows waves.
- **No erosion or sediment transport.** Rivers do not carve the terrain. The
  heightfield is static.
- **Grid-aligned artefacts.** Streams are at least one cell wide (≈ 1/256 of
  the map), and wet/dry edges can show a slight staircase on very flat ground.
- **Shallow water is hidden.** Water thinner than 0.025 units (unless it flows
  fast) is not drawn. The terrain only looks darker and wet there.
- **Uniform evaporation.** Evaporation is a constant depth per second on every
  wet cell, with no infiltration into the ground or temperature dependence.
- **Rain is visual plus uniform-per-cell.** The streaks are decoration. The
  simulated rain is a smooth field (orographically weighted), not individual
  drops.
- **Simulation speed depends on frame rate.** Real time is converted into
  simulated time, but steps are capped per frame, so recordings on a slow
  machine show slower water than on a fast one. `?warmup=` helps to start a
  recording at a consistent state.
- **The demo needs WebGL.** Without WebGL support nothing is drawn. Because
  there is deliberately no UI, no error message is shown either (the error
  appears only in the console).
- **Large JS bundle.** Three.js is bundled whole (~555 kB, ~140 kB gzip).
