# Alpine Waters

An autonomous 3D mountain watershed made with TypeScript, Vite, and Three.js. Two mountain springs feed visibly flowing turquoise streams and a growing lake beneath a gently moving camera. Seeded terrain, forests, snow, lighting, and the water surface are all generated in code. There are no external 3D assets, physics engines, visible controls, overlays, or required interactions.

## Quick start: ./start.sh

Requires Node.js **20.19+, 22.12+, or 24+**, with npm. Node.js 22 LTS is recommended.

```sh
./start.sh
```

The executable script checks prerequisites, installs dependencies when `node_modules` is absent, and serves the scene at **http://localhost:5173**. Open that URL; springs and camera movement start automatically. No mouse or keyboard input is necessary. The HTML background is sky blue before WebGL initializes.

For a production build and local preview:

```sh
./start.sh --preview
```

This builds the application and serves **http://localhost:4173**. Both modes use a strict port: a busy port produces an error instead of silently changing the printed URL. Stop either server with Ctrl+C. For remote hosting, upload the `dist/` directory produced by `npm run build` to a static host.

Other commands:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

## Recording and configuration

The scene intentionally fills the window with only 3D content. Landscape and portrait browser sizes are supported. The camera makes a slow, smooth arc across the front of the watershed, maintaining a view of both stream valleys and the lake. Allow a few seconds for the initial water advance to settle before recording.

Optional URL parameters are the only runtime configuration:

| Parameter | Default | Range | Meaning |
| --- | --- | --- | --- |
| `seed` | `7319` | 0–4294967295 | Integer seed for terrain detail, source displacement, and vegetation |
| `speed` | `3` | 0.1–12 | Simulated seconds per real second after the opening pre-roll |
| `rain` | `0` | 0–0.003 | Uniform rainfall depth in terrain units per simulated second |

Example: `http://localhost:5173/?seed=42&speed=3&rain=0.0001`. Invalid/non-finite values fall back to defaults and out-of-range numbers are clamped. Springs are always enabled in the demo; default rain is zero because the two visible mountain springs provide all necessary water. Rain affects hydrology without decorative raindrop particles.

## Architecture

- `src/simulation/terrain.ts`: pure deterministic PRNG, layered value noise, mountain elevation field, carved stream valleys, lake depression, and source locations. No DOM or Three.js dependency.
- `src/simulation/water.ts`: rendering-independent water depth field, conservative neighbor exchanges, source/rain accounting, and signed edge flux diagnostics.
- `src/rendering/scene.ts`: terrain and cutaway meshes, seeded instanced fir trees, elevation/slope coloring, procedural snow, water shader, daylight/shadows, gradient sky, matching fog, responsive camera, and disposal.
- `src/main.ts`: URL configuration, initialization, bounded hydrological pre-roll, fixed-step animation scheduling, and hot-reload cleanup. It creates no UI controls.
- `tests/simulation.test.ts`: numerical and determinism tests; no WebGL required.

## Simulation model

The default domain is a 151 × 151 uniform grid spanning 112 terrain units. Each cell stores bed elevation `b` and water depth `d`; its hydraulic head is `b + d`. Every horizontal/vertical neighbor pair has one signed exchange. The exchange is proportional to the difference in hydraulic head and the wet depth above the higher of the two bed elevations. Thus dry higher terrain cannot attract water, while connected lakes can level even over uneven ground.

For each step, the solver computes all proposed transfers, sums outgoing demand per donor, then scales that donor's transfers so they use at most 80% of its available water. Exchanges are applied simultaneously, with equal positive and negative depth changes. An additional per-edge diffusivity cap of 0.2 stays below the four-neighbor explicit diffusion stability limit, preventing deep-water checkerboard oscillation. This maintains nonnegative depths and conserves volume up to floating-point rounding. The cell area converts water depth to physical volume. No volume is removed at the closed domain boundary.

The two sources each inject 5.5 cubic terrain units per simulated second. Optional rain adds depth uniformly. `addedVolume` records both source contributions. The opening advances this same solver by 60 simulated seconds in short animation-frame batches; it does not paint synthetic rivers or place a separate fake lake. The continuing simulation uses fixed 0.05-second steps, independent of display refresh rate. Long frame delays are clamped to avoid catch-up freezes.

The water mesh follows actual simulated water-surface elevations. Interpolated depth controls shoreline visibility and turquoise shading. Animated surface normals, sun highlights, and slope-sensitive white ribbons suggest movement; those small ripples are a visual treatment rather than additional fluid physics.

## Verification

`npm test` covers ten cases: exact repeatability, seed variation, finite mountain relief/source validity, closed-domain mass conservation, rain/source accounting with non-unit cell area, downhill direction, depression retention and leveling, deep-water disturbance damping, a stationary lake over uneven bed, and invalid time-step rejection.

The production command runs TypeScript's strict type check before bundling. The live scene was also checked in a browser for working WebGL rendering, visible streams/lake, automatic camera movement, no controls, and a sky-colored background.

## Known limitations

- This is a stylized heightfield surface-flow approximation, not full 3D Navier–Stokes or a momentum-preserving shallow-water solver. It does not model turbulence, pressure jets, breaking waves, suspended droplets, erosion, infiltration, sediment, or groundwater.
- The terrain contains deliberately carved channels and a basin. The seed changes mountain detail/source displacement/vegetation, while the overall watershed composition stays recognizable. Custom small domain widths clip source positions to the grid.
- Closed boundaries and continuous sources mean the lake keeps rising and eventually floods surrounding ground in sufficiently long recordings. There is no drain, evaporation, or automatic reset. Reloading starts a new deterministic run.
- Grid resolution limits narrow channels and produces occasional faceted shorelines/rapids. Water transparency, reflection, and foam are shader approximations; trees and terrain are not refracted through the water, and water does not receive terrain shadows.
- Rain is numerical input only. The default demo uses springs instead of visible rain particles.
- CPU simulation and WebGL rendering target modern desktop browsers. High pixel counts, software rendering, or maximum simulation speed can reduce frame rate. Timing slows under sustained frame overload. WebGL2 is required; there is no alternate non-WebGL renderer.
- Camera movement is autonomous with no manual navigation. Procedural geometry and simulated time are deterministic, but wall-clock frame timing and GPU rasterization can vary across machines.
