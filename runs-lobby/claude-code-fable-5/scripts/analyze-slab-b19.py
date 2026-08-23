"""B19: are the two slab-crash variants actually different takes?

The two files came back the same length and the same byte size, which is what
prompted the check: the whole point of two variants is that a repeat is not
audible, and two near-identical takes would not serve that. This compares them
the way a listen would — envelope, spectral balance and correlation — rather
than by checksum, which only proves the bytes differ.
"""
import sys, wave, numpy as np

def load(p):
    with wave.open(p, 'rb') as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        return a.astype(np.float64) / 32768.0, w.getframerate()

def envelope(x, sr, hop=256):
    n = len(x) // hop
    return np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2) + 1e-12) for i in range(n)])

def spectrum(x, sr):
    w = np.hanning(len(x))
    S = np.abs(np.fft.rfft(x * w))
    f = np.fft.rfftfreq(len(x), 1/sr)
    return f, S

def band_energy(f, S, lo, hi):
    m = (f >= lo) & (f < hi)
    return float(np.sum(S[m]**2))

def describe(name, x, sr):
    f, S = spectrum(x, sr)
    tot = band_energy(f, S, 20, sr/2) + 1e-12
    bands = [(20,120),(120,400),(400,1500),(1500,5000),(5000,11000)]
    frac = [band_energy(f,S,lo,hi)/tot for lo,hi in bands]
    env = envelope(x, sr)
    peak_at = int(np.argmax(env)) * 256 / sr
    # decay: time from peak to -20 dB
    pk = env.max()
    tail = np.where(env[np.argmax(env):] < pk * 0.1)[0]
    dec = (tail[0] * 256 / sr) if len(tail) else float('nan')
    centroid = float(np.sum(f * S**2) / (np.sum(S**2) + 1e-12))
    print(f"{name:16s} peak@{peak_at:5.2f}s  -20dB in {dec:5.2f}s  centroid {centroid:7.1f} Hz")
    print(f"{'':16s} bands 20-120 {frac[0]*100:5.1f}%  120-400 {frac[1]*100:5.1f}%  "
          f"400-1.5k {frac[2]*100:5.1f}%  1.5-5k {frac[3]*100:5.1f}%  5-11k {frac[4]*100:5.1f}%")
    return env, np.array(frac)

files = sys.argv[1:]
data = {}
for p in files:
    name = p.split('/')[-1].replace('.wav','')
    x, sr = load(p)
    data[name] = describe(name, x, sr) + (x, sr)

if 'slab_crash_0' in data and 'slab_crash_1' in data:
    e0, f0, x0, sr = data['slab_crash_0']
    e1, f1, x1, _ = data['slab_crash_1']
    n = min(len(x0), len(x1))
    # normalised cross-correlation of the raw waveforms
    a, b = x0[:n], x1[:n]
    r = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
    m = min(len(e0), len(e1))
    re = float(np.corrcoef(e0[:m], e1[:m])[0,1])
    print()
    print(f"waveform correlation   {r:+.3f}   (1.0 = the same take)")
    print(f"envelope correlation   {re:+.3f}   (shape of the hit over time)")
    print(f"max band difference    {np.max(np.abs(f0-f1))*100:.1f} percentage points")

# --- onset delay -----------------------------------------------------------
# A sample with leading silence fires LATE relative to the event that triggered
# it. For an impact that has to land on the frame the slab touches the floor,
# that is a sync error, not a stylistic choice.
print()
print("onset (time to 10% of peak level):")
for name, (env, frac, x, sr) in data.items():
    pk = env.max()
    idx = np.where(env > pk * 0.1)[0]
    onset = (idx[0] * 256 / sr) if len(idx) else float('nan')
    print(f"  {name:16s} {onset*1000:6.1f} ms")
