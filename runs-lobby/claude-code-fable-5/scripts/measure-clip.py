"""B11: measure how much of a frame is blown out.

Reports the share of pixels that are effectively clipped, and the largest
connected bright region, because a diffuse sprinkle of hot pixels reads very
differently from one white mass sitting in the middle of frame.
"""
import sys
import numpy as np
from PIL import Image


def measure(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    h, w, _ = im.shape
    tot = h * w
    lum = 0.2126 * im[..., 0] + 0.7152 * im[..., 1] + 0.0722 * im[..., 2]
    clipped = (im.min(2) >= 250).sum() / tot
    hot = lum >= 235
    # largest connected hot blob, 4-connected, via a cheap flood over rows
    lbl = np.zeros((h, w), np.int32)
    nxt = 1
    sizes = {}
    eq = {}

    def find(a):
        while eq.get(a, a) != a:
            a = eq[a]
        return a

    for y in range(h):
        row = hot[y]
        prev = lbl[y - 1] if y else None
        cur = lbl[y]
        left = 0
        for x in np.flatnonzero(row):
            up = prev[x] if prev is not None else 0
            l = left if x > 0 and row[x - 1] else 0
            if up and l:
                a, b = find(up), find(l)
                cur[x] = a
                if a != b:
                    eq[b] = a
            elif up or l:
                cur[x] = up or l
            else:
                cur[x] = nxt
                nxt += 1
            left = cur[x]
    for y in range(h):
        for x in np.flatnonzero(lbl[y]):
            r = find(lbl[y, x])
            sizes[r] = sizes.get(r, 0) + 1
    biggest = max(sizes.values()) / tot if sizes else 0.0
    return clipped, hot.sum() / tot, biggest


print(f'{"frame":<28} {"clipped":>8} {"hot":>8} {"largest blob":>13}')
for p in sys.argv[1:]:
    c, hpct, b = measure(p)
    flag = '  <-- FAIL' if b > 0.03 else ''
    print(f'{p.split("/")[-1]:<28} {c:8.2%} {hpct:8.2%} {b:13.2%}{flag}')
