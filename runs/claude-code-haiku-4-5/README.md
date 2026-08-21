# Water Simulation Benchmark

A fully autonomous 3D water simulation featuring procedurally generated terrain, realistic water flow, and interactive visualization. Perfect for recording showcase videos with zero user interaction required.

## Features

- **Procedural Terrain Generation**: Creates diverse, realistic mountain landscapes from a deterministic seed using fractional Brownian motion (FBM) noise
- **Physically-Inspired Water Flow**: Water flows downhill following terrain gradients, accumulates in depressions, and forms visible streams and lakes
- **Fully Autonomous**: No UI controls, no user interaction needed — simulation starts automatically on page load
- **Beautiful Rendering**: Sky blue gradient background with matching fog, dynamic shadows, and smooth water visualization
- **Automatic Camera Movement**: Gentle orbiting camera motion makes the scene ideal for video recording
- **URL-Configurable**: Adjust simulation parameters via query strings without modifying code
- **Comprehensive Tests**: Automated tests verify terrain generation, water conservation, and downhill flow

## Quick Start

```bash
./start.sh
```

The script will:
- Check for Node.js and npm
- Install dependencies if needed
- Start the dev server on http://localhost:5173
- Print helpful configuration information

For production preview:
```bash
./start.sh --preview
```

## Architecture

### Project Structure

```
src/
├── main.ts                 # Bootstrap and animation loop
├── config.ts              # Configuration and URL parameter parsing
├── simulation/
│   ├── terrain.ts        # Procedural terrain generation with Perlin-like noise
│   ├── water.ts          # Water flow simulation
│   └── simulator.ts      # Main simulation orchestrator
├── renderer/
│   └── renderer.ts       # Three.js visualization
└── tests/
    ├── terrain.test.ts   # Terrain generation tests
    ├── water.test.ts     # Water physics tests
    └── runner.test.ts    # Test runner
```

### Simulation Model

#### Terrain Generation

The terrain is generated using **Fractional Brownian Motion (FBM)** with a deterministic seeded random number generator:

1. **Seeded Random Number Generator**: Using a linear congruential generator, ensures identical terrain from the same seed
2. **Value Noise**: Creates smooth interpolated noise by seeding grid corners
3. **Smoothstep Interpolation**: Uses smoothstep function for perceptually smooth height transitions
4. **Multiple Octaves**: 6 octaves of noise at different frequencies create interesting multi-scale features

Parameters:
- Lacunarity: 2.0 (each octave twice as frequent)
- Persistence: 0.5 (each octave half the amplitude)
- Scale: 0.01 (feature size in world units)

The result is normalized and scaled by `mountainHeight` to create diverse terrain.

#### Water Simulation

Water flow uses a **simplified shallow water model**:

1. **Height Map**: Tracks water column height at each grid cell
2. **Velocity Field**: Stores [vx, vy] velocity components for momentum
3. **Gradient-Based Pressure**: Water pressure accelerates flow in downhill direction
4. **Velocity Update**: Combines terrain gradient and water surface pressure gradient
5. **Transport**: Advects water along velocity field with interpolation
6. **Diffusion**: Spreads water to smooth local pressure variations
7. **Evaporation**: Gradually removes water over time

Flow Algorithm:
```
For each step:
  1. Apply rainfall at high elevations
  2. Calculate water surface gradients (terrain + water height)
  3. Update velocities toward gradient direction with momentum
  4. Transport water along velocity vectors
  5. Diffuse water between neighbors (smoothing)
  6. Apply evaporation
```

Water mass is conserved except for rainfall and evaporation.

#### Rendering

Three.js visualization with:

- **Directional Sun Light**: Casts shadows on terrain and water
- **Hemisphere Ambient Light**: Soft sky-to-ground lighting
- **Dynamic Meshes**: Terrain and water surfaces rebuild each frame (or every 2 frames for water)
- **Sky Blue Ambient**: Background fog and scene color match sky blue (#87CEEB)
- **Standard Materials**: Physically-based rendering with metalness and roughness

### Configuration

Configuration can be set via URL query parameters or in `src/config.ts`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| terrainSeed | 12345 | Random seed for terrain generation |
| terrainSize | 256 | Terrain resolution in pixels |
| terrainResolution | 128 | Simulation grid resolution |
| mountainHeight | 100 | Maximum terrain elevation |
| rainRate | 0.08 | Rainfall intensity (0-1) |
| waterDissipation | 0.99 | Water transport loss per step |
| flowRate | 0.3 | Water velocity acceleration |
| evaporationRate | 0.002 | Water evaporation per step |
| cameraOrbitRadius | 200 | Camera orbit distance |
| cameraOrbitSpeed | 0.0003 | Camera orbit angular velocity |
| cameraHeight | 80 | Camera height above terrain |
| simulationStepsPerFrame | 4 | Simulation updates per render frame |

**Example URLs:**
```
http://localhost:5173?terrainSeed=99999&rainRate=0.15&mountainHeight=150
http://localhost:5173?flowRate=0.5&evaporationRate=0.001
```

## Running Tests

Run the automated test suite:

```bash
npm test
```

Tests verify:

1. **Terrain Determinism**: Same seed produces identical terrain
2. **Height Bounds**: Terrain heights stay within expected range [0, mountainHeight]
3. **Interpolation**: Height values interpolate smoothly between grid points
4. **Gradient Direction**: Gradients point in expected directions
5. **Water Initialization**: Water structures initialize correctly
6. **Mass Conservation**: Water mass approximately conserved with evaporation
7. **Downhill Flow**: Water flows toward terrain depressions
8. **Stability**: Simulation runs 100 steps without NaN or crashes

## Building for Production

```bash
npm run build
```

Outputs optimized bundle to `dist/` directory. Use `npm run preview` to test.

## Performance

- **Resolution**: Runs smoothly at 128×128 terrain resolution
- **Frame Rate**: Targets 60 FPS with simulation update every 2 frames
- **Memory**: ~10MB for terrain + water state + visualization
- **Browser Support**: Modern browsers with WebGL support (Chrome, Firefox, Safari, Edge)

## Known Limitations

1. **Simulation Scale**: Grid is discrete (128×128 default), so very small features (< 2 world units) are not resolved
2. **Shallow Water Assumption**: Does not model deep water physics, waterfalls, or erosion
3. **Diffusion Only**: Water spreading is diffusive (local averaging) rather than pressure-based redistribution
4. **No Water Dynamics**: Water doesn't splash, swirl, or interact with terrain modification
5. **Fixed Terrain**: Terrain is static; no erosion or terrain deformation from water
6. **Drainage Accumulation**: Depressions can overflow rather than properly route water downstream
7. **Velocity Smoothing**: Velocity damping (95% retention) reduces dramatic flow patterns
8. **FBM Limitations**: Procedural terrain can have unrealistic features; Perlin-like noise is not true Perlin
9. **Camera Fixed Orbit**: No interactive camera control; follows pre-determined orbit path
10. **Dissipation Effects**: Water transport dissipation (99%) causes some water loss not from evaporation

## Customization

### Changing Terrain Features

Modify in `src/config.ts`:
- `terrainSeed`: Change the random seed
- `mountainHeight`: Increase for taller mountains
- `terrainScale`: In `terrain.ts`, adjust the `scale` variable for larger/smaller features

### Adjusting Water Behavior

In `src/config.ts`:
- `rainRate`: More rainfall = more water accumulation
- `flowRate`: Higher = water flows faster
- `evaporationRate`: Higher = water disappears faster
- `waterDissipation`: Lower = less water loss during transport

### Camera Motion

In `src/config.ts`:
- `cameraOrbitRadius`: Distance from center
- `cameraOrbitSpeed`: How fast to orbit
- `cameraHeight`: Height above terrain

Modify `src/renderer/renderer.ts` `updateCamera()` method for different camera paths (e.g., spiral, figure-8).

## Technologies

- **TypeScript**: Type-safe JavaScript
- **Vite**: Lightning-fast build tool and dev server
- **Three.js**: WebGL 3D graphics library
- **Node.js Test Runner**: Built-in testing without external frameworks

## Development

### Install Dependencies
```bash
npm install
```

### Dev Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

## License

Free to use and modify for any purpose.

## Video Recording Tips

1. **Clean Output**: No UI elements interfere with video
2. **Smooth Motion**: Automatic camera orbit provides smooth footage
3. **Adjustable Parameters**: Change URL to vary scenes without restarting
4. **Configurable Timing**: Adjust `rainRate` and `simulationStepsPerFrame` for time scaling
5. **Reproducible**: Save seed values to recreate exact scenes
6. **Resolution**: Set browser to desired resolution before recording (e.g., 1920×1080)

Record using OBS Studio, ScreenFlow, or similar tools.

## Troubleshooting

**Canvas is blank?**
- Check browser console for errors
- Ensure WebGL is enabled
- Try a different browser

**Simulation is too fast/slow?**
- Use `simulationStepsPerFrame` and `timeScale` in config
- Example: `?timeScale=0.5&simulationStepsPerFrame=2`

**Water not flowing?**
- Increase `rainRate` parameter
- Check `flowRate` and `terrainScale` settings
- Verify terrain has height variation (check seed)

**Low performance?**
- Reduce `terrainResolution` in config (smaller grid)
- Disable shadow maps in renderer
- Close other browser tabs

## Contributing

This is a single-purpose simulation for recording water flow videos. To improve:
1. Fork the repository
2. Make improvements to simulation physics or rendering
3. Add tests for new features
4. Submit a pull request with performance metrics

---

**Created**: August 2026  
**Author**: AI Water Simulation Team
