#!/bin/bash
# B25: the squad rush. Heavy combat boots on polished stone in a large echoing
# hall, several variants so repeats are not audible, plus a running stride and
# a hard plant as a man sets into cover, plus gear foley for loaded men.
#
# Also regenerates the protagonists' calm-phase footsteps as hard-soled boots
# on polished stone with real hall echo — the existing pair read soft and dry
# for the space. They are written to boot_walk_* rather than over footstep_*,
# so the originals stay in the repository as a record.
#
# Usage: ELEVENLABS_KEY=... ./scripts/gen-boots-b25.sh
#        ELEVENLABS_KEY=... FORCE=1 FORCE_ONLY="boot_run_0 boot_run_1" ./scripts/gen-boots-b25.sh
#
# boot_run_0 and boot_run_1 were reworded after measurement. Both came back
# with 90.3% and 98.5% of their energy below 120 Hz, centroids at 47 and 46 Hz
# — pure low thuds with no top edge at all, no sole slap and no hall
# reflection, and close to inaudible on small speakers. boot_run_2 (46.8% low,
# centroid 152 Hz), boot_plant and gear_rattle are right and are unchanged.
# The new wording asks for the transient and the high-frequency detail and
# explicitly plays down the low end.
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
    -d "{\"text\":$(printf '%s' "$prompt" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"duration_seconds\":$dur,\"prompt_influence\":0.45}" \
    --output "$f"
  if file "$f" | grep -qi -e audio -e mpeg; then echo "OK   $name"; else echo "FAIL $name: $(head -c 200 "$f")"; rm -f "$f"; fi
}

gen boot_run_0 0.8 "One combat boot striking polished marble, sharp leathery slap with a crisp high transient and grit under the sole, moderate low thump, bright echo in a large stone hall"
gen boot_run_1 0.8 "A single army boot footfall on hard polished stone, bright rubber-and-leather sole slap with a fast sharp attack and clear high-frequency detail, light low end, ringing reflection in a big marble lobby"
gen boot_run_2 0.8 "One heavy combat boot step landing hard on smooth marble, dense leathery impact with grit under the sole and a long tail of hall reverb"
gen boot_plant 1.0 "A heavy combat boot planting hard and skidding briefly to a stop on polished marble, sharp scuff and a solid weighted stop, echoing in a large stone hall"
gen gear_rattle 0.9 "Military webbing and a slung weapon rattling as a loaded soldier runs, nylon straps, buckles and metal clinking softly, close and dry"
gen boot_walk_0 1.0 "A single hard-soled boot step walking on polished marble in a huge empty lobby, crisp heel strike with a long bright echo"
gen boot_walk_1 1.0 "One hard leather-soled shoe footfall on polished stone in a vast hall, sharp heel click and a long reverberant tail"
echo "ALL DONE"
