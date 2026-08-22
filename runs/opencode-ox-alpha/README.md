# Procedural Water Simulation

An interactive **3D water simulation** built with TypeScript, Vite and Three.js.
A procedural mountain landscape is generated from a deterministic seed; rainfall
and mountain springs feed a shallow-water style cell automaton, so water flows
downhill along the terrain gradient, carves visible streams and collects into
lakes — fully autonomously, with no UI and no user input. Designed for
recording showcase videos.

![mode](https://img.shields.io/badge/mode-autonomous%20demo-blue)

## Quick start

```bash
./start.sh
```

Then open the printed URL (default `http://localhost:5173/`).

Production build + preview:

```bash
./start.sh --preview   # builds dist/ and serves it
```

`start.sh` checks that Node.js/npm are available, runs `npm install` when
`node_modules` is missing, and starts either the dev server or the production
preview server.

## Configuration (URL query parameters only — no on-screen UI)

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `seed`    | `1337`  | Deterministic terrain seed. Same seed ⇒ same landscape, same springs. |
| `rain`    | `0.02`  | Rain intensity (water depth per second per cell). |
| `speed`   | `1`     | Simulation speed multiplier (`0.1`–`8`). |
| `grid`    | `193`   | Terrain grid resolution per side (`33`–`385`). |
| `size`    | `200`   | World size in units (`50`–`500`). |

Example: `http://localhost:5173/?seed=42&rain=0.05&speed=2`

On load, rain starts falling immediately and springs emerge near the highest
peaks, so streams form and lakes fill without any interaction. The camera
orbits the island slowly and smoothly (~90 s per revolution).

## Architecture

```
src/
├── config.ts               # URL query param parsing + defaults (no UI)
├── main.ts                 # Bootstrap: renderer/scene/lights + fixed-step loop
├── terrain/
│   ├── noise.ts            # Deterministic mulberry32 PRNG, value noise, fBm
│   └── terrain.ts          # Terrain height field from seed (domain-warped fBm,
│                           #   ridged component, radial island falloff, smoothing)
├── water/
│   └── simulation.ts       # WaterSimulation: depth field, downhill transport,
│                           #   rain/spring sources, evaporation + border sinks,
│                           #   deterministic spring placement on peaks
└── render/
    ├── terrainMesh.ts      # Terrain mesh + vertex colours by altitude/slope
    ├── waterMesh.ts        # Animated water surface shader (ripples, depth
    │                       #   colouring, fresnel, sun sparkle)
    ├── sky.ts              # Gradient sky dome (#87CEEB horizon) + matching fog
    └── cameraRig.ts        # Autonomous slow orbit camera
tests/
├── terrain.test.ts         # Terrain determinism, plausibility, sampling
└── water.test.ts           # Mass conservation, downhill flow, spring validity
```

Separation of concerns: `terrain/` and `water/` are pure logic (no Three.js),
so they are unit-testable headlessly. `render/` contains all Three.js code.
`main.ts` only wires things together and drives the fixed-timestep loop.

## Simulation model

The world is an `N x N` height field. Each cell stores a water **depth**.
Each fixed step (`dt = 1/30 s`):

1. **Sources** — uniform rain plus per-spring inflow at cells placed on
   prominent local maxima near summits.
2. **Downhill transport** — each cell looks at its 8 neighbours and sends a
   fraction of its depth towards the neighbour with the steepest *surface*
   drop (terrain height + water depth). The amount scales with how dominant
   that drop is among all downhill drops, and is clamped so surfaces never
   invert. Result: flow accelerates in channels, spreads on flats, pools in
   depressions.
3. **Sinks** — every wet cell loses a constant `absorptionRate` of depth per
   second (soil infiltration/evaporation). Because `absorptionRate >
   rainRate`, isolated rain films cannot accumulate: cells receiving only
   their own rainfall stay dry. Cells receiving converging runoff or spring
   inflow outpace the loss locally, which sustains visible streams on the
   flanks and lakes in depressions. The outermost ring additionally drains a
   proportional fraction of its depth per step (free outflow at the map edge).

Together these sinks balance the sources: the simulation reaches a steady
state in which roughly 5–10% of cells are wet (verified headlessly over
120 simulated seconds), instead of flooding indefinitely. Total mass changes
only through explicitly declared sources/sinks, which the test suite verifies
numerically.

Rendering: the terrain sits as an island inside a large surrounding sea plane
at y = −4 that fades into the fog at the horizon and hides the finite map
edge. The terrain itself uses vertex colours by altitude and slope
(sand/grass/forest/rock/snow). Water is a second mesh whose vertex Y follows
terrain + depth each frame — smoothed over a 3×3 neighbourhood and capped at
a small offset to avoid spike artefacts — shaded by a custom GLSL shader
(depth-based colour gradient, ripples, fresnel reflection of the sky colour,
sun sparkle).

## Tests

```bash
npm test
```

Covers:

- **Terrain determinism** — identical seeds produce identical height fields;
  different seeds differ; PRNG/noise reproducibility; `heightAt` consistency.
- **Water mass conservation** — pure redistribution conserves mass to ~1e-3
  over hundreds of steps; sources inject exactly the analytic amount; sinks
  are the only mass loss.
- **Downhill flow direction** — water placed on the global maximum only moves
  to strictly lower cells; recipients never rise above the donor surface;
  after long runs low regions hold far more water than peaks (lakes);
  springs sit on local maxima with downhill neighbours; full determinism of
  the simulation state.

## Known limitations

- The flow model is a simplified single-direction cell automaton, not a full
  shallow-water (Saint-Venant) solver: no momentum, pressure wave propagation
  or erosion.
- Mass conservation holds to float32 precision (~1e-3 relative); tiny drift
  can accumulate over very long runs. With default settings the system is an
  open system (rain in, absorption + border outflow out) and reaches a steady
  state at roughly 5–10% wet cells rather than conserving total mass.
- Water rendering uses a smoothed, height-capped surface for visual stability;
  the rendered lake surface therefore does not exactly equal terrain + depth.
- No LOD/culling: default grid is 193² (~37 k vertices per mesh), which is
  fine on modern GPUs but not tuned for mobile.
- Springs/rain parameters are heuristics chosen for visual appeal; extremely
  high `rain` values (well above the default) will gradually widen streams
  and flood flats before absorption re-balances.
- The camera path is a fixed circular orbit; there is no cinematic editing.
- WebGL is required; there is no software-rendering fallback.
