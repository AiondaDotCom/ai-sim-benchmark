#!/bin/bash
# A17: assemble music.mp3 = new industrial intro + the UNCHANGED tail.
#
# Only the first 12 seconds are rebuilt. Everything from the drop onward comes
# from tail_from12s.mp3, which was cut once from the previous music.mp3 at
# exactly 12.0 s and is reused verbatim — so the heavy-metal section and the
# calm outro cannot drift, and the drop cannot move. Re-running this is
# idempotent: it never re-encodes the tail again.
#
# Usage: ./scripts/build-music-a17.sh <source-basename> [start-offset-seconds]
#        ./scripts/build-music-a17.sh industrial_v0 6
# No token needed.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
M="$DIR/public/assets/music"
SRC="$M/${1:?source basename required, e.g. industrial_v0}.mp3"
OFF="${2:-0}"
TAIL="$M/tail_from12s.mp3"
[ -s "$SRC" ] || { echo "missing $SRC — run gen-music-a17.sh first" >&2; exit 1; }
[ -s "$TAIL" ] || { echo "missing $TAIL" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The intro has to sit at the level the old one did, or the drop changes size
# and the checkpoint dialogue stops cutting through. -20.9 dB is what the
# previous calm intro measured across 0-12 s.
TARGET=-20.9

mean_db() { ffmpeg -hide_banner -nostats "$@" -af volumedetect -f null - 2>&1 \
  | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1; }

raw=$(mean_db -ss "$OFF" -t 12 -i "$SRC")
gain=$(LC_ALL=C awk -v a="$raw" -v t="$TARGET" 'BEGIN{printf "%.2f", t-a}')
echo "intro source ${1} @${OFF}s: ${raw} dB -> ${gain} dB to reach ${TARGET} dB"

# One filtered pass rather than encode-then-concat.
#
# Concatenating two MP3s with -c copy joins on a frame boundary and gains a
# whole frame, which put the drop 24 ms late and made the file 61.824 s instead
# of 61.800. Small, but the drop is the one thing that must not move, and there
# is no reason to accept a known offset. Filtering straight from the source
# into the concat also means the intro is only ever encoded once.
#
# Fade in over 1.5 s so it does not start abruptly; NO fade at the end, because
# the drop has to read as a jump rather than a crossfade.
ffmpeg -v error -y -ss "$OFF" -t 12 -i "$SRC" -i "$TAIL" -filter_complex \
  "[0:a]volume=${gain}dB,afade=t=in:st=0:d=1.5,aformat=sample_rates=48000:channel_layouts=stereo[a0];\
   [1:a]aformat=sample_rates=48000:channel_layouts=stereo[a1];\
   [a0][a1]concat=n=2:v=0:a=1[out]" \
  -map "[out]" -c:a libmp3lame -b:a 192k "$M/music.mp3"

echo
echo "--- handover check ---"
dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$M/music.mp3")
echo "total duration        ${dur} s (was 61.8)"
pre=$(mean_db -ss 9 -t 3 -i "$M/music.mp3")
post=$(mean_db -ss 12 -t 3 -i "$M/music.mp3")
echo "3 s before the drop   ${pre} dB"
echo "3 s after the drop    ${post} dB"
echo "drop                  $(LC_ALL=C awk -v a="$pre" -v b="$post" 'BEGIN{printf "%+.1f", b-a}') dB   (was +9.1)"
# a jump, not a crossfade: the 200 ms either side of 12.0 should differ sharply
a=$(mean_db -ss 11.8 -t 0.2 -i "$M/music.mp3")
b=$(mean_db -ss 12.0 -t 0.2 -i "$M/music.mp3")
echo "200 ms either side    ${a} dB -> ${b} dB  (jump $(LC_ALL=C awk -v a="$a" -v b="$b" 'BEGIN{printf "%+.1f", b-a}') dB)"
echo
echo "--- does the intro mask the checkpoint? ---"
echo "beep at 8.0s, dialogue at 8.25 and 10.5s; the music is ducked under VO"
for w in "7.5:1.5" "10.2:1.5"; do
  s=${w%%:*}; d=${w##*:}
  echo "  music ${s}-$(LC_ALL=C awk -v s="$s" -v d="$d" 'BEGIN{printf "%.1f", s+d}')s: $(mean_db -ss "$s" -t "$d" -i "$M/music.mp3") dB"
done
