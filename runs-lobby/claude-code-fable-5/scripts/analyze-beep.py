"""Objective judge for metal-detector beep candidates (B4).
Good = regular pulse train, ~3-4 beeps/s, single stable narrow peak 1-2 kHz."""
import subprocess, sys, numpy as np

def analyze(f):
    raw = subprocess.run(['ffmpeg','-v','quiet','-i',f,'-ac','1','-ar','22050','-f','f32le','-'],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64); sr = 22050
    w = int(sr*0.008); env = np.sqrt(np.convolve(x**2, np.ones(w)/w, 'same'))
    on = (env > env.max()*0.35).astype(int)
    duty = float((env > env.max()*0.35).mean())
    on = np.concatenate([[0], on, [0]])
    d = np.diff(on)
    starts = np.where(d == 1)[0]; ends = np.where(d == -1)[0]
    keep = [(s, e) for s, e in zip(starts, ends) if (e-s)/sr > 0.02]
    print(f'--- {f}  dur {len(x)/sr:.2f}s  pulses {len(keep)}')
    print(f'  duty {duty*100:.0f}%' + ('  <- continuous tone, not pulsed' if duty > 0.75 else ''))
    if len(keep) < 2:
        print('  REJECT: not a pulse train'); return
    st = np.array([s for s, _ in keep]); gaps = np.diff(st)/sr
    rate = 1/gaps.mean()
    print(f'  rate {rate:.2f} beeps/s   gap {gaps.mean()*1000:.0f}±{gaps.std()*1000:.0f} ms')
    print('  widths ms:', [round((e-s)/sr*1000) for s, e in keep])
    peaks = []; conc = []
    for s, e in keep[:8]:
        seg = x[s:e]
        if len(seg) < 256: continue
        seg = seg*np.hanning(len(seg))
        sp = np.abs(np.fft.rfft(seg)); fr = np.fft.rfftfreq(len(seg), 1/sr)
        m = fr > 300
        spm = sp[m]; frm = fr[m]
        pk = frm[spm.argmax()]
        # octave-safe: prefer a strong sub-harmonic (true fundamental)
        for div in (3, 2):
            f0 = pk/div
            if f0 < 350: continue
            band = spm[(frm > f0*0.93) & (frm < f0*1.07)]
            if len(band) and band.max() > 0.30*spm.max():
                pk = frm[(frm > f0*0.93) & (frm < f0*1.07)][band.argmax()]
                break
        peaks.append(pk)
        near = spm[(fr[m] > pk*0.85) & (fr[m] < pk*1.15)].sum()/sp[m].sum()
        conc.append(near)
    print(f'  peaks Hz: {[round(p) for p in peaks]}')
    print(f'  spread {max(peaks)-min(peaks):.0f} Hz   harmonicity {100*np.mean(conc):.0f}%')
    ok = (1.4 < len(x)/sr < 2.7) and (2.5 <= rate <= 4.6) and gaps.std() < 0.045 \
         and 900 < np.median(peaks) < 2200 and (max(peaks)-min(peaks)) < 220 and np.mean(conc) > 0.15
    print('  VERDICT:', 'PASS' if ok else 'fail')

for f in sys.argv[1:]:
    analyze(f)
