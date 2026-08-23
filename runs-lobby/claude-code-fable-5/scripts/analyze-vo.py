"""A10: objective check on the generated voice lines.

Verifies each line's duration, peak/RMS level, and — for the radio lines —
that the band-pass actually took: energy below 300 Hz and above 3 kHz should
be a small fraction of the total.
"""
import subprocess, sys, os
import numpy as np

VO = 'public/assets/vo'
RADIO = {'vo_radio_backup', 'vo_lobbypost'}


def load(path, sr=32000):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64), sr


def band_energy(x, sr, lo, hi):
    sp = np.abs(np.fft.rfft(x * np.hanning(len(x))))**2
    fr = np.fft.rfftfreq(len(x), 1 / sr)
    m = (fr >= lo) & (fr < hi)
    return sp[m].sum() / max(sp.sum(), 1e-12)


print(f'{"line":<20} {"dur":>6} {"peak":>7} {"rms":>7}  {"<300Hz":>7} {"300-3k":>7} {">3kHz":>7}  radio')
bad = []
for f in sorted(os.listdir(VO)):
    if not f.endswith('.mp3'):
        continue
    name = f[:-4]
    x, sr = load(f'{VO}/{f}')
    if len(x) == 0:
        bad.append(f'{name}: empty'); continue
    dur = len(x) / sr
    peak, rms = np.abs(x).max(), np.sqrt((x**2).mean())
    lo = band_energy(x, sr, 0, 300)
    mid = band_energy(x, sr, 300, 3000)
    hi = band_energy(x, sr, 3000, sr / 2)
    is_radio = name in RADIO
    print(f'{name:<20} {dur:6.2f} {peak:7.3f} {rms:7.4f}  {lo:7.1%} {mid:7.1%} {hi:7.1%}  {"yes" if is_radio else "-"}')
    if dur < 0.4 or dur > 8: bad.append(f'{name}: implausible duration {dur:.2f}s')
    if peak < 0.1: bad.append(f'{name}: silent (peak {peak:.3f})')
    if peak > 0.999: bad.append(f'{name}: clipped')
    if is_radio and mid < 0.85: bad.append(f'{name}: radio band-pass weak (mid {mid:.1%})')
    if not is_radio and mid > 0.97: bad.append(f'{name}: plain line looks band-limited')
print()
print('PROBLEMS:' if bad else 'all lines pass')
for b in bad:
    print(' -', b)
sys.exit(1 if bad else 0)
