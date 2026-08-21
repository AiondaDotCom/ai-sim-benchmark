# Alpine Waterways

An autonomous, real-time 3D mountain watershed. A deterministic landscape rises from a seed, rain and high-altitude springs begin immediately, and water follows the terrain into branching streams and lakes while the camera performs a slow cinematic orbit. The page contains no controls or overlays, making it ready for unattended showcase recording.

## Quick start

```sh
./start.sh
```

The script checks for Node.js and npm, installs dependencies when needed, and serves the demo at `http://localhost:5173`. Node.js 20 or newer is recommended.

To build and serve the optimized production bundle:

```sh
./start.sh --preview
```

Direct npm commands are also available:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

## Configuration

Configuration is intentionally URL-only so recordings never expose UI. Supported query parameters are:

| Parameter | Default | Range | Meaning |
| --- | --- | --- | --- |
| `seed` | `alpine-dawn-42` | text, first 80 characters | Deterministic terrain, trees, rain, and camera layout |
| `rain` | `1` | 0–4 | Rainfall intensity; springs remain active at zero |
| `speed` | `2.4` | 0.2–8 | Simulation-time multiplier |

Example: `http://localhost:5173/?seed=glacier-pass&rain=1.6&speed=3`

## Architecture

- `src/simulation/terrain.ts` builds a repeatable height field from seeded fractal value noise, ridged noise, broad Gaussian peaks, edge falloff, and small basin cuts. It also locates separated high-altitude peaks for spring placement.
- `src/simulation/water.ts` is a renderer-independent conservative surface-water solver. It tracks water depth per grid cell, computes four-neighbor hydraulic-head gradients, caps combined outgoing flux by available water, and commits transfers simultaneously. Rain is height-weighted and springs inject water near selected summits.
- `src/rendering/WorldRenderer.ts` turns the height and water grids into Three.js meshes. Terrain uses elevation/slope coloring; a transparent animated shader presents moving shallow water and deeper lakes. Procedural trees, visible rain, lighting, fog, and an in-canvas gradient sky texture complete the scene. The camera orbits without input.
- `src/app.ts` owns the fixed-substep simulation loop and connects model state to rendering. `src/main.ts` is the minimal browser bootstrap.

### Simulation model

For each step, the solver first adds rainfall and springs. A cell's hydraulic head is its terrain elevation plus water depth. Potential outflow is proportional to the positive head difference to each cardinal neighbor. If combined potential outflow exceeds the cell's depth, every outgoing transfer is reduced proportionally. Transfers are then applied from a shared delta buffer, which avoids iteration-order bias and conserves mass in the closed grid. Depressions retain water until their surface rises enough to spill over a neighboring saddle.

The app pre-simulates a short period on load so streams are already visible in the opening frame; rainfall, springs, water motion, and camera travel then continue indefinitely.

## Tests

The Vitest suite checks that identical seeds reproduce identical terrain, different seeds materially change it, a closed simulation approximately conserves water over hundreds of steps, source additions are accounted for, and isolated water moves toward lower hydraulic head.

## Known limitations

- This is a height-field shallow-surface approximation, not full Navier–Stokes fluid dynamics. It cannot model overhangs, breaking waves, subsurface flow, or three-dimensional turbulence.
- Flow uses four cardinal neighbors, so very small streams can show grid-aligned tendencies. Terrain detail and smooth shading reduce the visual effect.
- Boundaries are closed to preserve water and form lakes. On extremely long runs, low edge basins can continue accumulating water because there is no ocean outlet or evaporation.
- Terrain resolution is fixed at 97×97 to balance visual detail with continuous browser simulation. Very high simulation speeds can become CPU-bound on low-power devices.
- Transparency is a single water surface mesh; intersecting transparent geometry may exhibit ordinary rasterization sorting artifacts from some camera angles.
