import { createRng } from './prng';

/**
 * Seeded 2D value noise with fractal (fBm) summation.
 *
 * We deliberately avoid pulling in an external noise library (e.g. simplex-
 * noise) - the task calls for a self-contained, from-scratch simulation, and
 * value noise is more than enough to build convincing mountain silhouettes
 * when combined with several octaves and a domain warp.
 */

/** A smooth 2D value-noise field built from a fixed pseudo-random gradient/value grid. */
export class ValueNoise2D {
  private readonly size: number;
  private readonly values: Float32Array;

  constructor(seed: string | number, gridSize = 256) {
    this.size = gridSize;
    this.values = new Float32Array(gridSize * gridSize);
    const rng = createRng(seed);
    for (let i = 0; i < this.values.length; i++) {
      this.values[i] = rng() * 2 - 1;
    }
  }

  private sample(xi: number, yi: number): number {
    const s = this.size;
    const x = ((xi % s) + s) % s;
    const y = ((yi % s) + s) % s;
    return this.values[y * s + x];
  }

  private static fade(t: number): number {
    // Quintic smoothstep - continuous first and second derivatives.
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** Samples smoothly-interpolated noise at continuous coordinates (x, y). */
  noise2D(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = ValueNoise2D.fade(x - x0);
    const ty = ValueNoise2D.fade(y - y0);

    const v00 = this.sample(x0, y0);
    const v10 = this.sample(x0 + 1, y0);
    const v01 = this.sample(x0, y0 + 1);
    const v11 = this.sample(x0 + 1, y0 + 1);

    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  }

  /** Fractal Brownian motion: sums several octaves of noise for natural-looking detail. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let maxAmplitude = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / maxAmplitude;
  }
}
