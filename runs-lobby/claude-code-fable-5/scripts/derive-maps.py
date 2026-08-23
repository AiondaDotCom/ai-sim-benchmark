"""Derive normal + roughness maps from an albedo texture.

A9 / A11: the generated textures are albedo-only, so granite, marble, fabric
and metal all read flat under the scene lights. Rather than generating
separate art for every material (expensive and inconsistent with the albedo),
the relief is DERIVED from the albedo itself:

  normal    grayscale -> Sobel gradient -> tangent-space normal, with the
            gradient strength per material set by `strength`
  roughness inverted, contrast-stretched luminance mapped into a per-material
            [lo, hi] window: darker, deeper parts of a weave stay rough while
            raised crowns and polished veins go glossier

These are approximations of real relief, not measurements — documented as
derived in ASSETS.md.

Usage:
  python scripts/derive-maps.py                 # every material in TARGETS
  python scripts/derive-maps.py granite_tile    # one of them
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

TEX = 'public/assets/textures'

# name -> (normal strength, roughness lo, roughness hi, invert roughness?)
# strength is in "height units per luminance unit"; higher = coarser relief.
TARGETS = {
    'granite_tile':   (2.6, 0.45, 0.92, True),
    'floor_green':    (0.9, 0.06, 0.34, True),
    'marble_column':  (1.5, 0.12, 0.55, True),
    'wall_panel':     (2.0, 0.42, 0.88, True),
    'coat_fabric':    (2.2, 0.55, 0.95, True),
    'shirt_white':    (1.8, 0.50, 0.90, True),
    'latex_black':    (1.2, 0.10, 0.40, False),
    'brushed_metal':  (1.1, 0.18, 0.52, True),
    'brass':          (1.0, 0.16, 0.50, True),
    'fabric_blue':    (2.0, 0.52, 0.92, True),
    'a11_coat_twill': (2.4, 0.55, 0.95, True),
    'a11_shirt_weave': (2.0, 0.50, 0.90, True),
    'a11_latex_sheen': (1.3, 0.08, 0.38, False),
    'a11_skin_pores': (0.8, 0.42, 0.72, True),
    'a11_tactical_weave': (2.6, 0.55, 0.95, True),
    'a11_boot_leather': (2.0, 0.35, 0.80, True),
    'b8_substrate':   (3.0, 0.72, 1.00, True),
}


def luminance(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert('RGB'), dtype=np.float64) / 255.0
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def normal_map(lum: np.ndarray, strength: float) -> Image.Image:
    # wrap-around gradients so the derived map tiles exactly like its source
    gx = (np.roll(lum, -1, 1) - np.roll(lum, 1, 1)) * 0.5
    gy = (np.roll(lum, -1, 0) - np.roll(lum, 1, 0)) * 0.5
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(lum)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx * inv, ny * inv, nz * inv], -1) * 0.5 + 0.5
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), 'RGB')


def roughness_map(lum: np.ndarray, lo: float, hi: float, invert: bool) -> Image.Image:
    p1, p99 = np.percentile(lum, 1), np.percentile(lum, 99)
    k = np.clip((lum - p1) / max(1e-6, p99 - p1), 0, 1)
    if invert:
        k = 1.0 - k
    r = lo + (hi - lo) * k
    return Image.fromarray((r * 255).astype(np.uint8), 'L')


def derive(name: str) -> bool:
    strength, lo, hi, invert = TARGETS[name]
    try:
        src = Image.open(f'{TEX}/{name}.png')
    except FileNotFoundError:
        print(f'skip {name} (no albedo)')
        return False
    # a light blur first: the albedo carries pigment noise as well as relief,
    # and un-blurred pixel noise turns into a field of sparkling normals
    lum = luminance(src.filter(ImageFilter.GaussianBlur(0.6)))
    normal_map(lum, strength).save(f'{TEX}/{name}_n.png')
    roughness_map(luminance(src), lo, hi, invert).save(f'{TEX}/{name}_r.png')
    print(f'OK   {name}  ->  {name}_n.png, {name}_r.png  ({src.size[0]}x{src.size[1]})')
    return True


if __name__ == '__main__':
    names = sys.argv[1:] or sorted(TARGETS)
    made = sum(derive(n) for n in names if n in TARGETS)
    print(f'{made} material(s) derived')
