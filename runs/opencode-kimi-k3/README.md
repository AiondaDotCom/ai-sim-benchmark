# 3D Water Simulation

An interactive, **fully autonomous** 3D water simulation running in the browser.
A procedural mountain landscape is generated from a deterministic seed; rain
falls and springs emerge near the peaks; water flows downhill along the terrain
gradient, forms streams, and collects into lakes. A slow orbiting camera makes
the demo suitable for recording showcase videos — there is **no UI and no
interaction of any kind**.

Built with **TypeScript + Vite + Three.js**. No physics engine, no external 3D
assets.

## Quick start

```bash
./start.sh
```

This checks for Node.js/npm, runs `npm install` if needed, and starts the dev
server at <http://localhost:5173>.

```bash
./start.sh --preview   # production build + preview server
```

Manual equivalent:

```bash
npm install
npm run dev        # dev server
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # run the test suite (vitest)
```

## Configuration (URL query parameters only)

There is deliberately **no on-screen configuration UI**. All options are URL
query parameters or code constants (`src/config.ts`):

| Parameter      | Default | Meaning                                    |
| -------------- | ------- | ------------------------------------------ |
| `seed`         | `1337`  | terrain seed (same seed => same landscape) |
| `size`         | `160`   | grid resolution (32–512)                   |
| `rain`         | `0.007` | rainfall rate (depth/sec)                  |
| `evaporation`  | `0.0035`| evaporation rate (depth/sec)               |
| `flow`         | `2.4`   | flow speed coefficient                     |
| `springRate`   | `0.5`   | emission per spring (depth/sec)            |
| `speed`        | `1.0`   | simulation speed multiplier (0.1–8)        |
| `camera`       | `0.05`  | camera orbit speed (rad/sec)               |

Example: `http://localhost:5173/?seed=42&rain=0.02&speed=2`

## Architecture

```
src/
  config.ts            configuration parsing (URL params -> AppConfig)
  sim/                 pure simulation core — no rendering, no DOM
    rng.ts             mulberry32 PRNG + deterministic lattice hash
    terrain.ts         procedural terrain (fBm + ridged noise + seeded basins)
    water.ts           shallow-water grid simulation (flow, rain, springs,
                       evaporation, border drainage)
  render/              Three.js presentation layer
    scene.ts           renderer, camera, fog, lights, autonomous orbit
    sky.ts             gradient sky dome (matching fog color)
    terrainMesh.ts     terrain mesh + height/slope colors + wetness darkening
    waterMesh.ts       animated water surface mesh (depth-based color/alpha)
    rain.ts            decorative rain particle system
  main.ts              bootstrap: wires sim + render, fixed-timestep loop
tests/
  terrain.test.ts      terrain determinism / relief / peak detection
  water.test.ts        mass conservation, downhill flow, pooling, determinism
```

The separation is strict: `src/sim/**` never imports Three.js and never touches
the DOM, so it runs unchanged in Node (which is how the tests exercise it).

## Simulation model

Grid-based shallow-water approximation on the terrain heightmap:

- Each grid cell stores a water **depth** `w`; the free surface is
  `terrain + w`.
- Every step, each cell distributes water to its 4 neighbours with a lower
  surface height, proportionally to the surface difference, capped at half the
  difference so surfaces equilibrate instead of oscillating. Flow only moves
  water between cells, so **mass is conserved** (verified by tests).
- **Sources**: uniform rainfall over the whole map plus point **springs**
  placed automatically at detected local maxima (mountain peaks).
- **Sinks**: evaporation and drainage across the open map border (the outer rim
  of the terrain slopes downward so water can leave the world).
- The model is fully **deterministic**: no `Math.random`, fixed iteration
  order, integer-seeded noise. Identical seeds and step counts produce
  bit-identical states.

Rendering: the water surface shares the terrain grid; dry vertices are hidden
far below the terrain. Color and alpha encode depth (light blue → dark blue),
and terrain vertices darken where they are wet.

## Tests

`npm test` (vitest, Node environment) covers:

- **Deterministic terrain generation** — same seed ⇒ identical heightmap,
  different seeds ⇒ different terrain, meaningful relief, deterministic local
  maxima.
- **Approximate conservation of water mass** — with sources/sinks disabled,
  total mass stays constant within 1e-6 over 300 steps.
- **Downhill flow direction** — on a uniform slope, the water's center of mass
  moves towards lower terrain; in a bowl, water collects and stays in the
  depression.
- **Simulation determinism** — identical runs give identical water states.

## Known limitations

- The flow model is a simplified heightfield scheme, not full Navier–Stokes:
  no velocity field, no waves, no splashing, no sediment transport or erosion.
- Stability depends on `flow × dt`; the default timestep (1/30 s) and flow
  coefficient (2.4) are tuned to stay stable. Extreme `flow` values in the URL
  can cause overly fast (though still bounded) redistribution.
- Water that reaches the map border drains out of the world, so long runs
  trend towards a rain/evaporation/drainage equilibrium rather than unlimited
  flooding.
- Terrain is a heightmap: no caves, overhangs, or true 3D hydrology.
- The simulation runs single-threaded on the CPU; grid sizes above ~256² may
  drop frames on slower machines.
- The rain particles are decorative; the actual rainfall into the simulation
  is uniform over the whole map.
