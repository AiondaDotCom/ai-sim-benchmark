# Hydro Vista

An autonomous, interactive 3D water simulation over a procedurally generated
mountain landscape. Rain falls, springs bubble out near the summits, water runs
down the terrain gradient, carves its way through eroded valleys, and pools into
lakes — all by itself, with the camera slowly orbiting the massif.

Built for recording showcase clips: **there is no user interface at all.** No
buttons, no sliders, no panels, no click-to-place-water. Open the page and the
whole thing runs on its own. Everything is TypeScript + Vite + Three.js, with no
physics engine and no external 3D assets — the terrain, the water, the sky, the
rain and the colours are all generated in code from a single seed.

## Quick start

```bash
./start.sh
```

That is the whole thing. `start.sh` checks that Node.js and npm are available,
runs `npm install` if `node_modules` is missing, starts the dev server and
prints the URL (http://localhost:5173/).

```bash
./start.sh --preview   # production build, then serve dist/ on :4173
./start.sh --help      # usage and the full list of URL parameters
```

Or, without the script:

```bash
npm install
npm run dev       # dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
npm test          # run the test suite once
```

Requires Node.js 20.19+ (or 22.12+), as Vite 7 does.

## Configuration

Because the screen must stay clean, **nothing is configurable on screen**.
Everything is either a code constant (`src/app/config.ts`) or a URL query
parameter:

| Parameter   | Range      | Default      | Meaning                                        |
| ----------- | ---------- | ------------ | ---------------------------------------------- |
| `seed`      | any text   | `alpenglow`  | Terrain seed — same seed, same mountain, always |
| `size`      | 64…384     | `256`        | Simulation/mesh grid resolution                 |
| `amplitude` | 8…120      | `58`         | Peak elevation of the massif                    |
| `rain`      | 0…5        | `1`          | Rainfall multiplier                             |
| `speed`     | 0.05…6     | `1`          | Simulation speed multiplier                     |
| `springs`   | 0…24       | `6`          | Number of permanent summit springs               |
| `evap`      | 0…6        | `1`          | Evaporation multiplier                          |
| `prewarm`   | 0…300      | `0`          | Seconds of simulation to run before frame one   |
| `camspeed`  | 0…1        | `0.045`      | Camera orbit speed (rad/s); `0` freezes it      |
| `raindrops` | bool       | `1`          | Falling-rain particle layer                     |
| `shadows`   | bool       | `1`          | Shadow mapping                                  |
| `dpr`       | 0.5…3      | `2`          | Cap on `devicePixelRatio`                       |

Examples:

```
?seed=glacier&rain=1.6&speed=0.7      # a different, wetter mountain, in slow motion
?prewarm=120&camspeed=0.02            # start with lakes already full, very slow orbit
?size=320&dpr=1&shadows=0             # more detail, cheaper shading
```

Out-of-range or unparsable values silently fall back to the defaults, so a
malformed URL can never break a recording session.

## Architecture

Three layers, strictly separated. The dependency arrows only ever point
downward — the simulation knows nothing about rendering, and the renderer never
writes to the simulation.

```
src/
  main.ts             bootstrap: create the canvas, build the world, run the loop
  app/                composition + configuration (no Three.js, no DOM)
    config.ts         all tunables, URL-parameter parsing
    world.ts          terrain + simulation + weather, headless-runnable
  sim/                the model (pure TypeScript, no Three.js, no DOM, no Math.random)
    rng.ts            seeded mulberry32 PRNG + string seed hashing
    noise.ts          seeded Perlin noise, fBm and ridged multifractal
    terrain.ts        heightfield generation and erosion
    waterSim.ts       shallow-water ("virtual pipes") solver
  render/             everything Three.js (reads simulation state, never writes)
    scene.ts          renderer setup and the per-frame draw
    sky.ts            gradient sky dome, fog, lighting
    terrainMesh.ts    static terrain mesh with baked vertex colours
    waterMesh.ts      dynamic water surface mesh and its shader
    cameraRig.ts      the autonomous camera
    rain.ts           purely decorative rain particles
tests/                vitest suites for sim, terrain and world
```

`src/sim` and `src/app` are entirely free of Three.js and of the DOM, which is
what lets the tests run the full simulation headlessly in Node.

### Bootstrap

`main.ts` creates nothing but a canvas. It resolves the configuration, builds a
`World`, builds a `SceneRenderer`, and runs a `requestAnimationFrame` loop. The
only event listener in the whole application is `resize`. The canvas is faded in
after the first frame so the sky-blue page background — set in `index.html`, not
by JavaScript — covers the load, and there is never a dark flash.

## The simulation model

### Terrain

A deterministic pipeline turns one seed into a `Float32Array` heightfield:

1. **Domain warp** — the sample coordinates are displaced by a second noise
   field, so ridge lines bend instead of running along the grid axes.
2. **Ridged multifractal** — `(1 − |noise|)²` summed over 7 octaves gives the
   sharp crest lines that read as an alpine range.
3. **fBm base** — a broad landmass shape the ridges are blended over, weighted
   so ridges dominate high up and gentle shapes dominate in the lowlands.
4. **Radial massif mask** — the relief is highest in the middle and falls off to
   outer plains, so runoff has somewhere to drain to.
5. **Thermal (talus) erosion** — slopes steeper than a talus angle shed material
   to their lower neighbours, producing scree slopes and V-shaped valleys.
6. **Hydraulic erosion** — tens of thousands of virtual raindrops run downhill,
   picking up sediment as they accelerate and depositing it where the slope
   flattens. This carves the dendritic valley network that the water simulation
   later concentrates its runoff into; without it, rain spreads out as an
   invisible film instead of forming streams.
7. **Carved basins** — a handful of explicit smooth bowls at mid elevations, so
   every seed has proper lakes within the first minute.
8. **Smoothing + border apron** — removes single-cell pits that would trap water
   forever, and ramps the outermost cells down to a flat apron.

Every step draws from the same seeded PRNG, so the result is bit-for-bit
reproducible: `generateTerrain({ seed: 'x' })` always returns the identical
field, independent of call order, machine or browser.

### Water

A shallow-water solver on the same grid, using the **virtual pipes** model
(Mei, Decaudin & Hu, 2007). Each cell holds a water column depth `d`; each pair
of neighbours is connected by a virtual pipe carrying a volumetric flux `f`:

```
f' = max(0, damping · f + Δt · A · g · Δh / l)
```

where `Δh` is the difference of the **total** heights (terrain + water) of the
two cells. That single detail gives three behaviours for free:

* where the layer is thin, `Δh` is dominated by the terrain, so water runs down
  the local terrain gradient — **streams**;
* once a depression fills, the free surfaces level out, `Δh → 0` and the flow
  stops — **lakes with a flat surface**;
* when a basin is full, the surplus tips over the lowest saddle — **overflow**.

Each step is then:

1. **Inflow** — rainfall (weighted per cell, see below) plus the point sources
   at the summit springs.
2. **Flux update** — the equation above, for all four pipes of every cell.
3. **Flux limiting** — two caps, both of which preserve mass exactly:
   * a *velocity cap* `f ≤ d · l · v_max`, standing in for bed friction. Without
     it a thin film on a steep slope is evacuated completely in a single step
     (one cell per sub-step), which keeps stream beds too shallow to see;
   * a *mass cap*: if the four outgoing fluxes together would move more water
     than the cell holds, all four are scaled by one common factor `K ≤ 1`. This
     keeps the outflow distribution physical and guarantees `d ≥ 0`.
4. **Depth integration** — `d += Δt · (inflow − outflow) / cellArea`, and the
   depth-averaged velocity is derived from the net flux for shading and foam.
5. **Evaporation** — a small constant depth loss, which keeps slopes from
   staying permanently damp between showers.

Whatever leaves cell A through a pipe is added to cell B in the same step, so
mass is conserved by construction. The domain border is **open**: water that
leaves is booked into a `drained` counter. That is deliberate — with a sealed
border, continuous rain would eventually flood the entire map, whereas an open
border means lakes only survive in genuine depressions. The simulation keeps a
full ledger (`added = onTerrain + drained + evaporated`) which the tests assert
on.

Time stepping is sub-stepped internally so no integration step exceeds
`maxTimeStep`, and the frame delta fed in is clamped, so a backgrounded tab
cannot blow the simulation up when it comes back.

### Weather, springs and rainfall distribution

* **Weather** cycles on a ~52 s period: a shower that swells and fades, then a
  dry spell during which streams thin out and lakes calm down. The phase is
  shifted so that `t = 0` lands inside a shower — the demo must be interesting
  from the very first frame.
* **Springs** sit on the highest well-separated summits and never stop, so there
  is always a stream network even between showers. Their rate tapers with rank
  so the main summit dominates.
* **Rainfall** is weighted by elevation (orographic lift: mountains wring more
  water out of clouds than plains do), normalised to mean 1 so the total is
  independent of the terrain.

## Rendering

* **Terrain** — one vertex per simulation cell, so the water mesh can share the
  exact same topology and the two never disagree about where the ground is.
  Colour is baked into vertex colours: height bands (silt → sand → meadow →
  grass → rock → snow) modulated by slope, so steep faces show bare rock and
  snow only settles where it can hold.
* **Water** — the same grid, with the vertex Y set to `terrain + depth` every
  frame and normals from central differences of the free surface. The shader
  fades water in with a Beer–Lambert-style opacity ramp, so a thin film is
  nearly invisible while a lake is opaque — that is what separates a stream from
  the wet sheen around it. Ripple phase is advected against the flow direction,
  so moving water reads as travelling downstream while lakes only shimmer.
  Whitewater appears where the flow is fast *and* the layer is thin.
* **Sky** — a large inward-facing sphere with a soft vertical gradient from a
  deep zenith blue to a pale hazy horizon, plus a sun glow and disc. Scene fog
  uses the same horizon colour so distant terrain melts into the sky.
  Three.js mixes fog in *after* the output colour-space conversion, so the sky
  shader blends to the identically encoded value in output space — otherwise
  tone mapping leaves a hard seam exactly at eye level.
* **Camera** — a self-flying rig: the sum of several slow, mutually prime sine
  waves (orbit angle, breathing radius, rising/falling altitude, drifting
  look-at target) with frame-rate-independent smoothing. It never repeats
  visibly and never jerks.
* **Rain particles** — a purely decorative GPU point layer whose opacity tracks
  the current rain intensity. It carries no simulation state.

The page background, the fog and the renderer clear colour are all sky blue
(`#87ceeb` / `#c4e6f6`); nothing in the scene is ever black.

## Tests

```bash
npm test
```

51 tests in three suites:

* **`tests/terrain.test.ts`** — determinism of the PRNG and of the terrain
  (byte-identical heightfields for the same seed, different landscape for a
  different seed, independence from generation order), noise bounds and
  continuity, relief and massif shape, existence of depressions, peak finding,
  bilinear sampling, gradient correctness on a synthetic ramp.
* **`tests/waterSim.test.ts`** — **mass conservation** (exact in a closed domain,
  on both a synthetic bowl and rough procedural terrain, and a full-ledger
  `added = onTerrain + drained + evaporated` check with rain, springs,
  evaporation and an open border), non-negativity and NaN-freedom under heavy
  rain, exact rainfall accounting; **downhill flow direction** (velocity and
  flux point down the gradient and never up, diagonal gradients, reversal when
  the slope reverses, a water blob whose centroid descends, a sloped domain that
  drains only through its downhill edge, radial symmetry of a spring on flat
  ground); and lake behaviour (water collects at a basin bottom with a flat free
  surface, fills from rainfall, and overflows a saddle once full).
* **`tests/world.test.ts`** — URL configuration parsing and clamping, the weather
  cycle, orographic weighting, spring placement, and end-to-end integration:
  the composed world is fully deterministic, forms both streams and lakes on its
  own, puts its water in local low ground rather than on ridges, keeps deep
  water in flatter places than thin runoff, and keeps its ledger balanced while
  running.

## Performance

At the default 256 × 256 grid, measured on an M-series laptop:

| Stage                              | Cost              |
| ---------------------------------- | ----------------- |
| Terrain generation (one-time)      | ~150 ms           |
| Water simulation                   | ~2.1 ms / frame   |
| Water mesh + normal rebuild        | ~0.4 ms / frame   |

That leaves ample headroom for 60 fps. On weaker hardware, use
`?size=160&dpr=1&shadows=0`.

## Known limitations

**Simulation model**

* This is a *height-field* shallow-water model, not a 3D fluid. Water is a
  single column depth per cell, so it cannot form waterfalls that leave the
  surface, splash, overhang, or flow under anything. Vertical drops are handled
  as very fast surface flow rather than free fall.
* The velocity cap (`maxVelocity`) is a stand-in for bed friction, not a real
  friction model — it is what makes streams thick enough to see, but it means
  flow speed on very steep slopes is capped rather than physically derived.
  There is no Manning roughness, no turbulence, no vorticity.
* The virtual-pipes scheme is only conditionally stable. The flux limiter keeps
  it safe at any step size, but large steps look mushy, so the solver internally
  sub-steps. Very large `?speed=` values therefore cost proportionally more CPU
  rather than skipping ahead.
* No infiltration, groundwater, snow or ice: precipitation lands as liquid water
  and is only removed by draining off the border or by uniform evaporation.
* Evaporation is a constant depth loss, applied equally to a puddle and a lake.
  Real evaporation scales with surface area and temperature.
* No sediment transport *during* the live simulation. Erosion happens once, at
  terrain generation time; the running water does not reshape the terrain.
* The border is open, so water leaving the map simply disappears. There is no
  sea level and no return flow — the water cycle is not closed.
* Water is added to a cell before the flux for that step is computed, so an
  extremely large rain rate combined with a very large `?speed=` can briefly
  show a thin sheet everywhere before it drains.

**Terrain**

* One central massif per seed, by design (the radial mask). It will not produce
  multiple separate mountain ranges, canyons, plateaus, coastlines or islands.
* Hydraulic erosion runs on the CPU at load time. At `?size=384` that noticeably
  delays the first frame (roughly half a second).
* The heightfield is a grid, so overhangs, caves and cliffs steeper than
  vertical are impossible.

**Rendering**

* The water surface has no refraction, no screen-space reflections and no
  caustics; the "reflection" is a Fresnel blend toward a flat sky colour.
* Shallow water at grazing viewing angles is dominated by that Fresnel term and
  can look brighter than it should.
* The water mesh is rebuilt from CPU arrays every frame. That is cheap at the
  default resolution but scales linearly, so very large grids become
  CPU-bound before they become GPU-bound.
* No level of detail and no frustum culling for the terrain: the whole grid is
  drawn every frame.
* Shadow mapping uses a single cascade sized to the terrain, so shadow
  resolution is fixed and contact shadows are soft.
* The rain particle layer is decorative and does not line up with where rain
  actually lands in the simulation.

**Application**

* By design there is no interaction whatsoever — no pause, no reset, no camera
  control. Reload with different query parameters to change anything.
* WebGL2 is required, and no context-loss recovery is implemented: if the
  browser drops the GL context, the page needs a reload.
* The simulation advances with wall-clock time and the frame delta is clamped,
  so a backgrounded tab falls behind rather than fast-forwarding on return.
* Not tuned for phones: the default grid and pixel-ratio cap assume a desktop
  GPU.

## Licence

Written for demonstration purposes. Three.js is MIT licensed.
