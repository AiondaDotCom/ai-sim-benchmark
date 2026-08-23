"""B4: build the checkpoint metal-detector alarm.

ElevenLabs reliably produces the right timbre for a walk-through detector
(a flat ~1.1 kHz electronic tone) but never a clean, regular cadence: the
generated takes merge or drop beeps. So one clean generated beep is taken
from the best candidate and laid out on an exact grid — the sound is the
generated asset, the rhythm is deterministic.

Usage: python scripts/build-beep-b4.py <candidate.mp3> <start_s> <end_s> <out.mp3>
"""
import subprocess, sys, numpy as np

src, t0, t1, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
SR = 44100
RATE = 3.4          # beeps per second (brief asks for 3-4)
TOTAL = 2.06        # seconds (brief asks for 1.5-2.5)

raw = subprocess.run(
    ['ffmpeg', '-v', 'quiet', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
    capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)

beep = x[int(t0 * SR):int(t1 * SR)].copy()
# 4 ms raised-cosine edges so the grid has no clicks
e = int(SR * 0.004)
ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, e))
beep[:e] *= ramp
beep[-e:] *= ramp[::-1]

track = np.zeros(int(TOTAL * SR))
period = int(SR / RATE)
n = 0
while n * period + len(beep) < len(track):
    track[n * period:n * period + len(beep)] += beep
    n += 1
peak = np.abs(track).max()
if peak > 0:
    track *= 0.89 / peak

p = subprocess.Popen(
    ['ffmpeg', '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1',
     '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '128k', out],
    stdin=subprocess.PIPE)
p.communicate(track.astype(np.float32).tobytes())
print(f'{out}: {n} beeps at {RATE}/s over {TOTAL}s from {src} [{t0}-{t1}]')
