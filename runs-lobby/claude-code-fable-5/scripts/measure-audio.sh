#!/bin/bash
# Measure sound-effect files the way the audio work on this run was judged.
# ffmpeg-only on purpose: the numpy-based analyze-slab-b19.py cannot run on a
# machine with only the system python, which is where the API key lives.
#
#   low%   share of energy below 120 Hz. Above ~90% a cue is effectively
#          silent on a phone speaker; near 1% it has no weight.
#   tail   back half of the file against the front, in dB. Near 0 rings on,
#          -30 dies at once.
#
# Usage: ./scripts/measure-audio.sh public/assets/sfx/*.mp3
set -uo pipefail
meanvol() { ffmpeg -hide_banner -nostats "$@" -af volumedetect -f null - 2>&1 \
  | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1; }
low_pct() { local f="$1" a b
  a=$(ffmpeg -hide_banner -nostats -i "$f" -af volumedetect -f null - 2>&1 \
    | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1)
  b=$(ffmpeg -hide_banner -nostats -i "$f" -af lowpass=f=120,volumedetect -f null - 2>&1 \
    | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1)
  LC_ALL=C awk -v a="$a" -v b="$b" 'BEGIN{ if(a==""||b==""){print "n/a";exit} printf "%.1f", 100*(10^((b-a)/10))}'; }
tail_db() { local f="$1" d m h t
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")
  m=$(LC_ALL=C awk -v d="$d" 'BEGIN{printf "%.3f", d*0.45}')
  h=$(meanvol -i "$f" -t "$m"); t=$(meanvol -ss "$m" -i "$f")
  LC_ALL=C awk -v a="$h" -v b="$t" 'BEGIN{ if(a==""||b==""){print "n/a";exit} printf "%.1f", b-a}'; }
printf "%-24s %8s %10s %8s\n" "file" "low%" "tail dB" "dur s"
for f in "$@"; do
  printf "%-24s %7s%% %10s %8s\n" "$(basename "$f")" "$(low_pct "$f")" "$(tail_db "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")"
done
