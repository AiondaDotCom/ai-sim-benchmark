# Rejected candidates

Kept as provenance for the installed samples, and because they are recoverable
material: a `git checkout` on an uncommitted asset during this run destroyed
the chosen `boot_run_0` take, and it was restored from `boot_run_0_c3.mp3`
here rather than being regenerated.

Measured with `../measure-audio.sh` (low% = share of energy below 120 Hz,
tail = back half against front half in dB):

| candidate | low% | tail | outcome |
|---|---|---|---|
| `boot_run_0_c1` | 5.1% | -20.1 dB | too thin |
| `boot_run_0_c2` | 69.2% | -0.9 dB | too bass-heavy |
| `boot_run_0_c3` | 41.7% | -3.1 dB | **installed** (reference `boot_run_2`: 43.7%) |
| `slab_crash_1_c1` | 75.9% | -27.8 dB | all three failed the same way: |
| `slab_crash_1_c2` | 81.3% | -34.5 dB | bass-dominant with the tail gone, |
| `slab_crash_1_c3` | 93.3% | -29.5 dB | against the reference's 49.0% / -3.1 dB |

The slab variant was ultimately derived rather than generated — see the
`slab_crash_1.mp3` section of `ASSETS.md`.
