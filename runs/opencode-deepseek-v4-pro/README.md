# Mountain Water Simulation

An **autonomous 3D demo** of water flowing over a procedurally generated mountain
landscape. A deterministic seed builds a terrain; rain and mountain-peak springs
feed water that flows downhill along the local gradient, gathers into streams,
and pools into lakes. There is **no user interaction and no visible UI** — the
scene is driven entirely by an automatic camera orbit, so it can be recorded as
showcase footage.

Built with **TypeScript**, **Vite**, and **Three.js**. No physics engine and no
external 3D assets.

## Quick start

```bash
./start.sh            # dev server
./start.sh --preview  # production build + preview server
```

The script checks for Node.js/npm, installs dependencies on first run, and prints
the local URL (http://localhost:5173 for dev, http://localhost:4173 for preview).

You can also run the steps manually:

```bash
npm install
npm run dev        # development server
npm run build      # type-check + production build (outputs to dist/)
npm run preview    # serve the production build
npm test           # run the test suite
```

## Configuration

Configuration lives in `src/config.ts` (code constants) and can be overridden via
URL query parameters — there are no on-screen controls:

| Parameter  | Default | Meaning                                        |
|------------|---------|------------------------------------------------|
| `seed`     | 1337    | Terrain seed (deterministic)                   |
| `size`     | 256     | Grid resolution (cells per axis)               |
| `rain`     | 0.001   | Rainfall per cell per second                   |
| `springs`  | 0.008   | Peak spring water per source cell per second   |
| `evap`     | 0.004   | Evaporation fraction per second                 |
| `drain`    | 6.0     | Sea-level edge drainage (fraction per second)   |
| `speed`    | 1.0     | Simulation time multiplier                      |
| `cam`      | 1.0     | Camera orbit speed multiplier                   |

Example: `http://localhost:5173/?seed=42&size=300&speed=2&cam=0.5`

## Architecture

The code is split cleanly into **simulation**, **rendering**, and **bootstrap**:

```
src/
  config.ts          # URL/constant configuration (bootstrap)
  main.ts            # glue: wires simulation + rendering, runs the loop
  index.css          # sky-blue page/canvas styling
  sim/
    prng.ts          # seeded PRNG + value noise + fBm
    terrain.ts       # deterministic procedural terrain (height field)
    water.ts         # grid shallow-water simulation (flow, rain, springs)
  render/
    scene.ts         # Three.js scene, terrain/water/sky materials, lights
    camera.ts        # automatic orbit camera
test/
  terrain.test.ts    # determinism + range + island property
  water.test.ts      # mass conservation + downhill flow
```

- **Simulation** (`src/sim`) is pure TypeScript with no Three.js or DOM
  dependencies, which is what makes it directly unit-testable.
- **Rendering** (`src/render`) builds the Three.js scene and consumes the
  simulation state each frame (the water surface mesh is updated from the depth
  field every frame).
- **Bootstrap** (`src/config.ts`, `src/main.ts`, `index.html`) reads config,
  instantiates the simulation and renderer, and runs the animation loop.

## Simulation model

- **Terrain** is fractional Brownian motion (summed value-noise octaves from a
  seeded hash) combined at two scales (broad ridges/valleys plus fine detail),
  reshaped by a radial island falloff: the centre is mountainous, the edges are
  near sea level. A given `seed` + `size` always yields the same terrain.
- **Water** is a grid of water columns. Each cell has a depth `d`; its *surface*
  is `terrain + d`. On every step, water flows across each cell edge whenever the
  source surface is higher than the neighbour's — so water follows the terrain
  gradient downhill and *levels out* (flat surface → no net flow → a lake).
- Flow is a symmetric, edge-by-edge "virtual pipes" relaxation, so **mass is
  conserved exactly by construction** within the grid (what leaves one cell
  enters the next).
- Inputs are uniform **rain** plus **springs** at local summits (peak cells);
  **evaporation** and sea-level **edge drainage** (water leaving the coastal
  border cells) balance the inflow so the island stays mostly dry with persistent
  streams and stable lakes instead of flooding.
- The flow relaxation is iterated several times per frame and the sweep direction
  alternates to reduce directional bias.

## Rendering

- Terrain colour is derived from height + slope (green valleys → rock → snow).
- Water is a translucent, lit surface whose vertex alpha depends on depth (thin
  sheets/streams are pale, lakes are deep blue), with a specular sun glint.
- The sky is a gradient dome (horizon → zenith); `THREE.Fog` uses the horizon
  colour so land fades naturally into the sky. The page body is sky blue
  (`#87CEEB`) so there is no dark flash before the canvas paints.

## Known limitations

- **Water leaves only via the sea-level border.** Drainage is a linear removal at
  the coastal rim rather than a modelled ocean; there is no rendered sea beyond
  the map, so the island edge just fades to sky.
- **No erosion dynamics** — rain/springs transport water but never erode or
  re-shape the terrain, and evaporation is a simple linear term (no sediment,
  humidity, or temperature model).
- The water surface is a height field; it cannot model overhangs, splashing,
  foam, or detailed ripples. Flow is a first-order shallow approximation, not a
  full Navier–Stokes solver.
- Flow is computed with a fixed number of relaxation iterations per frame, so
  very large `speed` values can make flow appear laggy or "sloshy" rather than
  simply faster.
- The flow sweep is direction-ordered (with alternating passes), which can leave
  a slight directional bias on very high-slope, high-speed configurations.
- Terrain edges are artificial (the island falloff), so there is no "ocean"
  beyond the map — just sky at the horizon.

## Tests

`npm test` runs Vitest. The suite covers:

1. **Deterministic terrain** — same seed → identical heights; different seeds →
   different landscapes; heights in `[0, 1]`; centre higher than the edge.
2. **Approximate conservation of mass** — total water volume is preserved across
   many steps when rain/springs/evaporation are disabled (exact to floating-point
   precision).
3. **Downhill flow direction** — a drop placed on a synthetic slope drains toward
   lower terrain.
