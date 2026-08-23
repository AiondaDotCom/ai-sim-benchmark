#!/bin/bash
# B19 fallback: derive the second slab-crash variant from the first.
#
# WHY THIS EXISTS. Three rounds of generation failed the same way. Every
# phrasing that named the object — slab, crash, impact, boom — anchored the
# model on the low end and dropped the debris entirely:
#
#   attempt 1   1.2% of energy below 120 Hz    no weight at all
#   attempt 2  97.7%                           all boom, tail gone (-33.4 dB)
#   attempt 3  75.9-93.3% across 3 candidates  same failure, less extreme
#
# against slab_crash_0's 49.0% and -3.1 dB. The purpose of a second variant is
# only that a repeat not be audible, and a take that differs in WEIGHT does not
# serve that — it reads as an inconsistency rather than as variation.
#
# So the variant is derived from the correct take by deterministic processing,
# and said so plainly in ASSETS.md. This follows the precedent already set on
# this run by the B4 detector beep, whose cadence was unobtainable from
# generation and which ships as a deterministic edit of generated material,
# recorded as such.
#
# The source is generated audio; the edit is deterministic and reproducible by
# re-running this script. Nothing here is hand-authored.
#
# Usage: ./scripts/derive-slab-variant.sh          (no API key needed)
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/public/assets/sfx"
SRC="$OUT/slab_crash_0.mp3"
DST="$OUT/slab_crash_1.mp3"
[ -s "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

# A different take of the same event, not the same take played differently:
#   asetrate + aresample   pitch down 7%, which moves every resonance in the
#                          stone rather than just filtering it
#   two atempo stages      net length change, so it is not the same duration
#   highshelf / lowshelf   tilt the balance toward the fragment detail and away
#                          from the boom, keeping it in the same weight class
#   aecho                  a slightly different room reflection, so the tail
#                          decays on its own pattern
ffmpeg -hide_banner -v error -y -i "$SRC" \
  -af "asetrate=44100*0.93,aresample=44100,atempo=1.0753,atempo=0.965,highshelf=f=2500:g=2.5,lowshelf=f=90:g=-1.5,aecho=0.9:0.75:47:0.18" \
  -codec:a libmp3lame -b:a 128k "$DST"

if [ -s "$DST" ]; then
  echo "derived $(basename "$DST") from $(basename "$SRC")"
  echo "verify with: ./scripts/measure-audio.sh $SRC $DST"
else
  echo "FAILED to derive $DST" >&2; exit 1
fi
