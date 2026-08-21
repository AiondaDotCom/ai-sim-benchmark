# AI Water Simulation Benchmark

An interactive yet fully **autonomous** 3D water simulation built with TypeScript, Vite, and Three.js. Procedural mountains are generated from a deterministic seed. Water flows downhill according to terrain gradients, accumulates in depressions forming visible streams and lakes. Rainfall and mountain springs run continuously. The camera slowly orbits for cinematic video recording.

Perfect for social media showcase videos — **no UI controls, no interaction required**. Everything starts automatically on page load.

## Features

- **Deterministic procedural terrain**: Mountains generated with layered simplex-like noise from a fixed seed (configurable via `?seed=123`).
- **Realistic water physics**: Grid-based simulation. Water moves downhill based on local height + water level gradient, pools in valleys, forms streams and lakes.
- **Autonomous demo**: Springs emerge near peaks + constant light rainfall. No buttons, sliders, or clicks.
- **Automatic camera**: Smooth orbital movement with gentle height variation for dynamic video footage.
- **Attractive visuals**: Sky-blue gradient background (`#87CEEB`), matching fog, Phong lighting, semi-transparent blue water with specular highlights. Body background matches to prevent flash.
- **Configurable via URL**: `?seed=123&rain=0.005&speed=1.5`
- **Tests**: Deterministic terrain, approximate water mass conservation, downhill flow correctness.
- **Production ready**: Optimized Vite build.

## Quick Start

```bash
./start.sh
```

This script:
- Checks for Node.js and npm
- Runs `npm install` if `node_modules` is missing
- Starts the dev server (or `--preview` for production build)
- Prints the local URL

Open the printed URL in your browser. The simulation begins immediately.

For production preview:
```bash
./start.sh --preview
```

## Architecture

**Separation of concerns** (as requested):

- **`src/main.ts`**: Bootstrap only — creates full-screen canvas, instantiates `WaterSimulation`, starts it. No logic.
- **`src/simulation.ts`**: Core class containing:
  - **Terrain generation** (`generateTerrain`): 64x64 heightmap using deterministic noise. Mountains biased toward center.
  - **Water simulation** (`simulateStep`): 2D grid of water heights/velocities. Each step:
    1. Adds rainfall everywhere + probabilistic springs on high terrain.
    2. For each cell with water, finds steepest downhill neighbor by (terrain + water) height.
    3. Flows significant volume if gradient > threshold.
    4. Evaporates excess in flat areas.
    5. Updates water surface mesh vertices for real-time visualization.
  - **Rendering**: Three.js `PlaneGeometry` for terrain (Phong material, green/brown). Separate water plane updated per frame with vertex displacement. Hemisphere + directional lighting. Fog and sky color for natural horizon.
  - **Camera**: Automatic smooth orbit (`updateCamera`) using sine waves for position and look-at.

**Simulation model**: Simple Eulerian grid fluid with explicit downhill routing (no full Navier-Stokes or prebuilt physics engine). Approximate mass conservation (minor evaporation for stability). Water visual is a displaced plane over terrain.

**Tests** (`src/tests/simulation.test.ts`):
- Deterministic terrain (same seed → identical heightmap).
- Mass conservation (initial water mostly preserved after many steps).
- Downhill flow (water added to peak moves toward valleys).

## Known Limitations

- Simulation is grid-based (64x64) for performance; not sub-cell accurate.
- Simplified physics: no momentum carry-over between steps, basic evaporation, no surface tension or wave propagation.
- No erosion or sediment transport.
- Water rendering is vertex-displaced plane (not true volumetric or particle-based).
- Large JS bundle (~520kB gzipped) due to Three.js (can be optimized with tree-shaking if needed).
- Tests use heavy mocking of Three.js due to WebGL/jsdom incompatibility.
- Browser performance best on desktop; mobile may be slower.

The simulation is tuned for visual appeal in videos rather than scientific accuracy.

## Tech Stack

- Three.js r168 (via npm)
- TypeScript
- Vite 5
- Vitest + jsdom for tests

## Production Build

```bash
npm run build
```

The build succeeds cleanly (one chunk-size warning is expected due to Three.js).

**Test Results**: 3 passed, 0 failed.

**Final Production Build**: Successful (`dist/` generated with index.html + assets).

Enjoy the flowing water!

---
Built for the AI Water Sim Benchmark task.
