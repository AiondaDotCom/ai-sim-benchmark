#!/bin/bash
# B19: a whole tile of cladding letting go, falling and shattering.
#
# Deliberately distinct from the existing marble/debris chip sounds: a slab is
# an order of magnitude heavier, so it wants a deep impact with a short
# shattering tail rather than a sharp crack. Two crash variants so repeats are
# not audible, plus a variant for landing on rubble already on the floor, plus
# the scraping creak of the slab separating from the wall.
#
# Usage: ELEVENLABS_KEY=... ./scripts/gen-slab-b19.sh
#        ELEVENLABS_KEY=... FORCE=1 FORCE_ONLY="slab_crash_1" ./scripts/gen-slab-b19.sh
#
# slab_crash_1 was reworded after measurement. The first take came back with
# 1.2% of its energy below 120 Hz against slab_crash_0's 26.2%, and decayed to
# -20 dB in 0.05 s against 0.64 s — a thin short click rather than a heavy
# slab. Alternating the two read as an inconsistency in weight rather than as
# variation, which defeats the point of having two takes. The new wording asks
# for the low end and the long tail explicitly.
# The key comes from the environment and is never written into this file.
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/public/assets/sfx"
mkdir -p "$OUT"

gen() { # name duration prompt
  local name="$1" dur="$2" prompt="$3"
  local f="$OUT/$name.mp3"
  # FORCE=1 regenerates even when the file is already there. Without it an
  # existing file is kept, which is what makes a re-run cheap; with it, a
  # reworded prompt actually takes effect. FORCE_ONLY="a b" narrows the
  # regeneration to named samples so the rest are not spent again.
  if [ -s "$f" ] && file "$f" | grep -qi -e audio -e mpeg; then
    local forced=0
    if [ "${FORCE:-0}" = "1" ]; then
      if [ -z "${FORCE_ONLY:-}" ]; then forced=1
      else for n in ${FORCE_ONLY}; do [ "$n" = "$name" ] && forced=1; done; fi
    fi
    if [ "$forced" != "1" ]; then echo "skip $name (exists)"; return; fi
    echo "regenerating $name"
  fi
  curl -s -m 120 -X POST https://api.elevenlabs.io/v1/sound-generation \
    -H "xi-api-key: $ELEVENLABS_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":$(printf '%s' "$prompt" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"duration_seconds\":$dur,\"prompt_influence\":0.4}" \
    --output "$f"
  if file "$f" | grep -qi -e audio -e mpeg; then echo "OK   $name"; else echo "FAIL $name: $(head -c 200 "$f")"; rm -f "$f"; fi
}

gen slab_creak 1.4 "A heavy stone slab grinding and scraping as it separates from a wall, short low creak of rock on rock, then it lets go"
gen slab_crash_0 2.6 "A large heavy marble slab falling and smashing onto a polished stone floor in a huge echoing hall, deep booming impact followed by a short shattering tail of breaking stone"
gen slab_crash_1 2.6 "A massive marble slab crashing onto a stone floor in a cavernous hall, very deep low-frequency boom with real weight, followed by a long tail of stone cracking and fragments skittering, heavy and slow"
gen slab_rubble 2.4 "A heavy stone slab landing on a pile of loose rubble and broken masonry, dull muffled crunch and clattering stone fragments in a large hall"
echo "ALL DONE"
