# Water Simulation

A fully autonomous 3D water simulation: a procedural mountain island is generated from a seed, springs
rise below the summits, a rain storm wanders over the land, and the water runs downhill, gathers into
streams, fills depressions into lakes, spills over their rims and finally reaches the sea — while the
camera slowly orbits the scene.

There is no user interface and nothing to click. The page shows only the 3D scene, which makes it
suitable for recording showcase videos.

Built with TypeScript, Vite and Three.js. No physics engine and no external 3D assets, textures or
models: terrain, water, sky, cloud and rain are all generated in code.

## Quick start: ./start.sh

```bash
./start.sh             # install dependencies if needed, start the dev server, print the URL
./start.sh --preview   # build the production bundle and serve it
PORT=8080 ./start.sh   # choose another port
```

The script checks that Node.js (20.19 or newer) and npm are available and tells you what to install if
they are not. Then open the printed URL (default `http://localhost:5173/`, or `http://localhost:4173/`
with `--preview`).

Manual commands, if you prefer:

```bash
npm install
npm run dev        # development server
npm test           # automated tests (Vitest)
npm run build      # type check + production build into dist/
npm run preview    # serve the production build
```

## Configuration (URL parameters only)

| Parameter | Default | Range | Meaning |
|-----------|---------|-------|---------|
| `seed`    | `7`     | any integer or text | Terrain and weather seed. Same seed, same world. |
| `rain`    | `1`     | 0 – 5 | Rain intensity multiplier (`0` = no rain, no cloud). |
| `springs` | `1`     | 0 – 5 | Spring discharge multiplier (`0` = no springs). |
| `speed`   | `1`     | 0 – 4 | Simulation speed multiplier (`0` freezes the water; the camera keeps moving). |
| `grid`    | `256`   | 96 – 384 | Grid points per side. Higher is finer and slower. |
| `warmup`  | `0`     | 0 – 3600 | Simulated seconds computed before the first frame, e.g. `300` to open on full lakes. |

Example: `http://localhost:5173/?seed=42&rain=1.5&speed=2`

Everything else (camera path, colours, friction, evaporation, storm path) is a named constant in the
source.

## Architecture

Simulation, rendering and bootstrap are strictly separated. `src/sim` has no dependency on Three.js or
the DOM and runs unchanged in Node (that is how the tests exercise it); `src/render` only reads from the
simulation; `src/main.ts` wires the two together.

```
index.html              page shell: sky-blue background, one container, no controls
start.sh                one-command start
src/
  main.ts               bootstrap: parse config, create Simulation + SceneRenderer, run the frame loop
  config.ts             URL query parameters -> validated AppConfig (pure function)
  sim/                  --- headless simulation, no rendering code ---
    rng.ts              seeded PRNG (mulberry32) and seed hashing
    noise.ts            seeded 2D gradient noise, fBm, ridged multifractal
    terrain.ts          deterministic island height field + carved lake basins
    water.ts            shallow-water flow solver with exact mass book-keeping
    sources.ts          spring placement and the wandering rain storm
    simulation.ts       the world: terrain + water + sources, fixed-step `step()`
  render/               --- Three.js only, reads from the simulation ---
    sceneRenderer.ts    scene, lights, shadows, fog, renderer, resize handling
    terrainMesh.ts      vertex-coloured terrain mesh (sand, grass, forest, rock, snow)
    waterMesh.ts        dynamic water surface + shader (depth colour, fresnel, ripples, foam), open sea
    sky.ts              gradient sky dome with sun glow
    weather.ts          storm cloud and rain streaks
    cameraPath.ts       pure function time -> camera pose (slow orbit)
    palette.ts          shared sky / fog colours and the sun direction
tests/                  Vitest suites (see below)
```

Frame loop (`main.ts`): wall-clock time is accumulated, the simulation is advanced in fixed steps until
it has caught up (8 simulated seconds per real second at `speed=1`, at most 12 steps per frame), then
the renderer copies depths and velocities into GPU buffers and draws.

## Simulation model

### Terrain

`generateTerrain({ seed })` builds a 256 × 256 height field covering 256 × 256 world units:

1. Domain-warped fBm gives the broad shape; ridged multifractal noise adds crests and valleys; a little
   high-frequency noise adds small natural hollows.
2. A noisy radial mask lowers the land into the sea towards the border, so the result is an island whose
   edge is always open water at a fixed depth.
3. Three **basins** are carved into the gentlest mid-altitude areas. Each basin floor is placed below the
   lowest point of the surrounding disc, which makes it a guaranteed closed depression: it has to fill
   up before it can overflow.

Only seeded arithmetic is used (no `Math.random`), so a seed always yields the same landscape.

### Water

`WaterSim` solves a simplified form of the shallow-water equations on the grid with a staggered
"virtual pipe" scheme. Each cell stores a water depth `d` over a fixed bed height `b`. Every pair of
neighbouring cells shares a face carrying a signed discharge `q`. Per step:

1. **Acceleration by the surface slope.** `q += dt · g · h_f · (H_i − H_j) / Δx` with the water surface
   `H = b + d` and the flow depth `h_f = max(H_i, H_j) − max(b_i, b_j)` (the water that can actually
   pass over the higher bed). Because the driving term is the slope of the water *surface*, thin water
   on a hillside follows the terrain gradient, while water in a hollow levels out into a flat lake and
   overflows at the lowest point of its rim.
2. **Friction**, semi-implicit: a small linear drag (damps lake sloshing) plus a quadratic, Manning-like
   bed friction `∝ |q|·q / h_f²`, which slows thin films more than deep channels.
3. **Positivity limiter.** If the faces of a cell would remove more water than it holds in this step,
   all its outgoing discharges are scaled down. Depth never becomes negative.
4. **Transport.** Each face moves `q · dt / Δx` of depth from its donor to its receiver. Whatever leaves
   one cell enters its neighbour, so volume is conserved to floating point precision.
5. **Losses.** A small uniform evaporation / infiltration rate, and sink cells (the sea and the outer
   border) that swallow whatever reaches them — rivers end at the coast.

Every source and sink is book-kept in `WaterSim.stats` (`added`, `evaporated`, `drained`), so
`added − evaporated − drained − stored` can be checked at any time (`massBalanceError()`); in practice
it stays around 1e-11 of the volume added.

The time step is 0.04 simulated seconds and is reduced automatically if deep water or a finer grid
would violate the CFL condition.

### Where the water comes from

- **Springs** (`sources.ts`): just below the highest, well separated summits, plus one on the slope
  above each basin, chosen so that its path of steepest descent leads into that basin.
- **Rain**: a storm with a gaussian footprint follows a smooth closed path over the island and swells
  and fades; a light drizzle falls on all land. The cloud and the rain streaks are drawn where the
  simulated rain falls.

Both start on their own at page load and are pure functions of the seed and simulated time, so a run is
reproducible.

### Rendering

The water surface is a grid mesh updated every frame from the simulation (`bed + depth`). Dry vertices
next to water continue the neighbouring water level underneath the terrain, which gives lakes a level
shoreline. A custom shader colours the water by depth (turquoise shallows to deep blue), adds sky
reflection, a sun glint, ripples that drift with the current, and white foam where the flow is fast.
The sea inside the grid is part of the same mesh, and a ring of open sea continues to the horizon,
where linear fog in the sky's horizon colour blends it into a gradient sky (around `#87CEEB`). The
terrain casts and receives shadows.

## Tests

`npm test` runs 25 tests in four files:

- `tests/terrain.test.ts` — deterministic terrain generation: bit-identical output for the same seed, a
  pinned fingerprint, different seeds differ, finite heights, sea all along the border, every basin is a
  closed depression, springs are placed deterministically.
- `tests/water.test.ts` — conservation of water mass (closed basin: volume constant to 1e-10; with
  rain, evaporation and sinks: the books balance to 1e-10), a lake at rest stays at rest, **downhill
  flow direction** (water on an inclined plane moves down in all four orientations and never sideways;
  on an irregular hill more than 97 % of the flow-weighted velocity opposes the bed gradient; potential
  energy only decreases), and collection in depressions (a hollow on a hillside fills to a level lake
  and then spills).
- `tests/simulation.test.ts` — the whole autonomous world: identical runs for identical seeds, water
  appears by itself, streams form, rivers reach the sea, all basins hold lakes, mass balance after
  8000 steps, stability on a fine grid.
- `tests/config.test.ts` — URL parameter parsing and clamping, the PRNG, and the camera path (smooth,
  outside the island, above the summits).

## Known limitations

- **Simplified physics.** The solver is a height-field pipe model, not a full shallow-water solver:
  momentum is not advected (no hydraulic jumps, no inertia carrying water around bends or over small
  bumps), and there is no 3D behaviour — no breaking waves, splashes, free-falling waterfalls or
  undercut banks. Water on cliffs slides down the surface.
- **Friction and the time scale are tuned for looks**, not calibrated against real rivers. The demo runs
  at 8 simulated seconds per second, so lakes fill in about half a minute.
- **Grid resolution limits detail.** With 256 × 256 cells a stream is at least one cell (one world unit)
  wide, and on smooth slopes water spreads into broad sheets rather than narrow channels, because the
  terrain has no eroded river beds. There is no erosion or sediment transport; the terrain never changes.
- **Lakes are partly designed.** Three basins are carved deliberately so that every seed shows lakes;
  additional natural hollows depend on the seed. Each island has the same overall layout (one island,
  sea at the border).
- **The sea is a sink, not simulated water.** Its level is fixed, it has no tides or swell, and water
  that reaches it simply leaves the simulation.
- **Evaporation is uniform** and stands in for infiltration too; there is no groundwater. Springs have a
  constant discharge independent of rainfall.
- **Thin films are hidden.** Water shallower than about 0.01 world units is not drawn, so
  rain-wetted slopes look dry until the runoff concentrates.
- **Rendering is stylised.** No refraction, no real reflections of the terrain in the water, no
  caustics; the cloud is a cluster of simple shaded spheres; foam is a shader effect driven by flow
  speed, not simulated. Water edges can look slightly angular at grid scale.
- **Performance.** The simulation runs on the CPU on the main thread (about 1.2 ms per step at 256 ×
  256 on a current laptop, 3–4 steps per frame). On slow devices the simulation is allowed to fall
  behind real time rather than stall the page; `?grid=128` makes it much lighter. WebGL 2 is required.
- **Determinism** holds for the simulation in simulated time on a given JavaScript engine. What is on
  screen at a given wall-clock moment also depends on the frame rate, and the storm path uses
  `Math.sin`/`Math.exp`, whose last bits may differ between engines.
- **No interaction by design**: no controls, no pause, no free camera. `window.__waterSim` exposes the
  simulation object for automated measurements; it has no visible effect.
- Only tested in Chrome (desktop, landscape and portrait viewports).
