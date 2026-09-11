export interface Terrain {
  size: number;
  width: number;
  spacing: number;
  heights: Float64Array;
  springs: { index: number; rate: number }[];
  channels: [number, number, number][][];
}

/** Stable 32-bit PRNG, independent of rendering and browser state. */
export function random(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }
function noise(x: number, z: number, seed: number): number {
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u;
  const b = hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}

export function channelDistance(x: number, z: number, points: [number, number, number][]): {distance: number; height: number} {
  let distance = Infinity, height = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < distance) { distance = d; height = a[2] + (b[2] - a[2]) * t; }
  }
  return {distance, height};
}

/** Seeded fractal mountain field with two eroded river valleys and a terminal basin. */
export function generateTerrain(seed = 7319, size = 151, width = 112): Terrain {
  if (!Number.isInteger(size) || size < 5 || !Number.isFinite(width) || width <= 0) throw new Error('Invalid terrain dimensions');
  const spacing = width / (size - 1), heights = new Float64Array(size * size);
  const rng = random(seed), shift = (rng() - 0.5) * 5;
  const channels: [number, number, number][][] = [
    [[-17 + shift,-31,19],[-20,-22,14],[-14,-14,10],[-16,-5,7.1],[-8,3,4.8],[-6,12,2.2],[0,23,1.2]],
    [[23 + shift,-24,17],[18,-16,12],[21,-7,8.4],[15,0,6.2],[16,7,4.5],[7,15,2],[0,23,1.2]],
  ];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i * spacing - width / 2, z = j * spacing - width / 2;
    const gauss = (cx: number, cz: number, rx: number, rz: number) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
    let detail = 0, amplitude = 1.9;
    for (let octave = 0; octave < 5; octave++) {
      const scale = 0.055 * 2 ** octave;
      detail += (noise(x * scale, z * scale, seed + octave * 199) - 0.5) * amplitude;
      amplitude *= 0.51;
    }
    let h = 5 + 28 * gauss(-11 + shift,-29,17,18) + 24 * gauss(24,-24,15,20)
      + 17 * gauss(-35,-8,13,22) + 9 * gauss(36,8,14,20) + detail;
    // A broad bowl; the surrounding raised ground retains the lake.
    const lake = Math.sqrt((x / 19) ** 2 + ((z - 24) / 19) ** 2);
    if (lake < 1.3) {
      const bowl = 1.0 + lake * lake * 2.4 + detail * 0.12;
      const mix = smooth(Math.min(1, (1.3 - lake) / 0.35));
      h = h * (1 - mix) + bowl * mix;
    }
    for (const channel of channels) {
      const c = channelDistance(x, z, channel);
      // The central channel is continuous and downhill; its banks feather into the mountain.
      if (c.distance < 5.5) {
        const bed = c.height + c.distance * c.distance * 0.27;
        h = Math.min(h, bed + Math.max(0, c.distance - 2) ** 2 * 0.5);
      }
    }
    heights[j * size + i] = h;
  }
  const springs = channels.map(path => {
    const [x,z] = path[0];
    const cell = (position: number) => Math.max(0, Math.min(size - 1, Math.round((position + width / 2) / spacing)));
    return { index: cell(z) * size + cell(x), rate: 5.5 };
  });
  return {size, width, spacing, heights, springs, channels};
}
