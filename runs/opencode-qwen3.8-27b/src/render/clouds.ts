import * as THREE from 'three';

/** A soft, puffy cloud billboard texture, generated at runtime (no asset). */
function makeCloudTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(245,248,252,0.5)');
  g.addColorStop(1, 'rgba(240,245,250,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A layer of soft clouds slowly orbiting the island high in the sky, giving the
 * scene living weather. Purely cosmetic; each cloud is a billboard that circles
 * the origin (no popping, no interactivity).
 */
export class CloudLayer {
  readonly group: THREE.Group;

  private sprites: THREE.Sprite[] = [];
  private angles: number[] = [];
  private radii: number[] = [];
  private speeds: number[] = [];

  constructor(count = 16, innerR = 260, outerR = 520, yMin = 130, yMax = 280) {
    this.group = new THREE.Group();
    const tex = makeCloudTexture();
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity: 0.3 + Math.random() * 0.35,
          depthWrite: false,
          fog: false
        })
      );
      const scale = 70 + Math.random() * 130;
      s.scale.set(scale, scale * (0.35 + Math.random() * 0.4), 1);
      this.group.add(s);
      this.sprites.push(s);
      this.angles.push(Math.random() * Math.PI * 2);
      this.radii.push(innerR + Math.random() * (outerR - innerR));
      this.speeds.push((0.01 + Math.random() * 0.02) * (Math.random() < 0.5 ? -1 : 1));
      s.position.y = yMin + Math.random() * (yMax - yMin);
    }
  }

  /** Orbit the clouds slowly (radial motion, so they never pop or leave). */
  update(dt: number): void {
    for (let i = 0; i < this.sprites.length; i++) {
      this.angles[i] += this.speeds[i] * dt;
      const r = this.radii[i];
      this.sprites[i].position.x = Math.cos(this.angles[i]) * r;
      this.sprites[i].position.z = Math.sin(this.angles[i]) * r;
    }
  }

  dispose(): void {
    for (const s of this.sprites) s.material.dispose();
  }
}
