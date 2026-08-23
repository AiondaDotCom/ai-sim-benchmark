#!/bin/bash
# Generate SEVERAL candidates for a sound, measure them, and keep the best.
#
# The sound-generation tool is inconsistent run to run: the same prompt gives a
# usable take one time and an unusable one the next, so a single take is a coin
# flip. Two rounds of rewording proved that — asking for low-frequency weight
# produced 97.7% sub-120 Hz energy with no tail at all, and asking for a bright
# sole slap produced a 93.3% sub-bass thud anyway. This generates N candidates,
# measures each, and picks by data.
#
# Measurement is ffmpeg-only on purpose. The earlier analysis script needs
# numpy and a decoded WAV, which is why it could not be run on the machine that
# holds the API key. Everything here uses ffmpeg, ffprobe, awk and sed, all of
# which are already required by the other generation scripts.
#
#   low%   share of energy below 120 Hz. The thing that was wrong in both
#          directions: a sample at 90%+ is inaudible on a phone speaker, and
#          one at 1% has no weight at all.
#   tail   how much sound is still present in the back half of the file, in dB
#          relative to the front. Near 0 means it rings on; -30 means it dies
#          at once. A slab crash needs a tail; a footstep does not.
#
# Each candidate is scored against a REFERENCE sample that is already correct,
# measured in the same run, so the numbers do not depend on the method.
#
# Usage: ELEVENLABS_KEY=... [CANDIDATES=3] ./scripts/gen-best-take.sh
#        OUT_DIR=/tmp/x TAKES_DIR=/tmp/x ... for a dry run that touches nothing
#        ELEVENLABS_KEY=... ONLY="hit_body_0 hit_body_1" ./scripts/gen-best-take.sh
#          (ONLY is a space-separated list; several names are fine)
#
# Candidates are kept in scripts/.takes/ so a different one can be installed by
# hand if the numbers and the ear disagree.
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
# OUT_DIR lets a dry run write somewhere harmless. Twice now a behavioural
# test of this script has overwritten real generated audio in place, and the
# only reason it was recoverable was that the files happened to be committed.
OUT="${OUT_DIR:-$DIR/public/assets/sfx}"
TAKES="${TAKES_DIR:-$DIR/scripts/.takes}"
N="${CANDIDATES:-3}"
mkdir -p "$OUT" "$TAKES"

meanvol() { ffmpeg -hide_banner -nostats "$@" -af volumedetect -f null - 2>&1 \
  | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1; }

low_pct() { # share of energy below 120 Hz
  local f="$1" full low
  full=$(ffmpeg -hide_banner -nostats -i "$f" -af volumedetect -f null - 2>&1 \
    | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1)
  low=$(ffmpeg -hide_banner -nostats -i "$f" -af lowpass=f=120,volumedetect -f null - 2>&1 \
    | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1)
  LC_ALL=C awk -v a="$full" -v b="$low" \
    'BEGIN{ if (a=="" || b=="") { print "0"; exit } printf "%.1f", 100 * (10 ^ ((b - a) / 10)) }'
}

tail_db() { # back half against front half; near 0 rings on, very negative dies at once
  local f="$1" d mid head_v tail_v
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")
  mid=$(LC_ALL=C awk -v d="$d" 'BEGIN{printf "%.3f", d*0.45}')
  head_v=$(meanvol -i "$f" -t "$mid")
  tail_v=$(meanvol -ss "$mid" -i "$f")
  LC_ALL=C awk -v a="$head_v" -v b="$tail_v" \
    'BEGIN{ if (a=="" || b=="") { print "-99"; exit } printf "%.1f", b-a }'
}

# best <sample> <ref-sample> <duration> <tail-weight> <prompt>
best() {
  local name="$1" ref="$2" dur="$3" tw="$4" prompt="$5"
  # ONLY is a WORD LIST, not a single name. Comparing the whole variable
  # against each name meant ONLY="a b c" matched nothing and skipped
  # everything while printing "skip ... / ALL DONE" — a switch that silently
  # does nothing and reports success, which is the same failure shape as the
  # skip-if-exists trap one layer down.
  if [ -n "${ONLY:-}" ]; then
    local wanted=0 n
    for n in ${ONLY}; do [ "$n" = "$name" ] && wanted=1; done
    if [ "$wanted" != "1" ]; then echo "skip $name (not in ONLY)"; return; fi
  fi
  local reff="$OUT/$ref.mp3"
  if [ ! -s "$reff" ]; then echo "FAIL $name: reference $ref missing" >&2; return; fi
  local rlow rtail
  rlow=$(low_pct "$reff"); rtail=$(tail_db "$reff")
  echo
  echo "=== $name   (reference $ref: low ${rlow}%, tail ${rtail} dB)"

  local bestFile="" bestScore="" i
  for i in $(seq 1 "$N"); do
    local c="$TAKES/${name}_c${i}.mp3"
    curl -s -m 120 -X POST https://api.elevenlabs.io/v1/sound-generation \
      -H "xi-api-key: $ELEVENLABS_KEY" -H "Content-Type: application/json" \
      -d "{\"text\":$(printf '%s' "$prompt" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"duration_seconds\":$dur,\"prompt_influence\":0.45}" \
      --output "$c"
    if ! file "$c" | grep -qi -e audio -e mpeg; then
      echo "  candidate $i: FAILED ($(head -c 120 "$c"))"; rm -f "$c"; continue
    fi
    local l t s
    l=$(low_pct "$c"); t=$(tail_db "$c")
    s=$(LC_ALL=C awk -v l="$l" -v t="$t" -v rl="$rlow" -v rt="$rtail" -v tw="$tw" \
      'BEGIN{ dl=(l>rl?l-rl:rl-l); dt=(t>rt?t-rt:rt-t); printf "%.2f", dl/10 + tw*dt/5 }')
    printf "  candidate %d: low %5s%%  tail %6s dB   score %s\n" "$i" "$l" "$t" "$s"
    if [ -z "$bestScore" ] || LC_ALL=C awk -v a="$s" -v b="$bestScore" 'BEGIN{exit !(a<b)}'; then
      bestScore="$s"; bestFile="$c"
    fi
  done

  if [ -z "$bestFile" ]; then echo "  no usable candidate for $name"; return; fi
  cp "$bestFile" "$OUT/$name.mp3"
  echo "  -> installed $(basename "$bestFile") as $name.mp3 (score $bestScore; lower is closer to $ref)"
}

# --- the two samples that are still wrong ----------------------------------
# slab_crash_1, third wording. Two attempts that named the object failed the
# same way: every phrasing containing slab / crash / impact anchored the model
# on the boom and dropped the debris entirely (1.2% low, then 97.7%, then
# 75.9-93.3% across three candidates, all with the tail gone). This one stops
# describing an impact at all and asks for the AFTERMATH as its own event —
# there is no slab, no crash, no impact and no boom anywhere in it, on the
# theory that if the model never hears the word it may stop synthesising one.
best slab_crash_1 slab_crash_0 2.6 1.0 \
  "Loose stone fragments and broken rubble scattering, tumbling and rattling to a stop across a hard floor in a large empty hall, dry bright pieces of rock clattering and rolling, sparse and detailed, fading into a long reverberant decay"

# boot_run_0: two wordings asked for a sole slap and got a sub-bass thud
# anyway (90.3% then 93.3%). This one describes the sound as thin and bright
# and names the bass as something to avoid rather than to moderate.
best boot_run_0 boot_run_2 0.8 0.0 \
  "A hard boot sole slapping down on polished marble, thin bright leather snap with sharp treble detail and grit under the sole, quick ringing echo in a large stone hall, crisp and trebly, almost no bass"

# --- B28: the blow landing -------------------------------------------------
# Three takes rather than one variant each, because the same prompt gives a
# usable take one time and an unusable one the next. Scored against boot_plant,
# which is the closest thing already in the set to what these want to be: a
# hard dry close impact with almost no tail. A body blow that rings on reads as
# a door slamming somewhere else in the building.
best hit_body_0 boot_plant 0.7 0.6 \
  "A hard punch landing on a torso, dull heavy thud with a leathery slap on top, close and dry, thick and percussive, no music, no reverb"
best hit_body_1 boot_plant 0.7 0.6 \
  "A heavy body blow connecting, deep muffled impact into a padded chest with a sharp leather crack over it, tight and close, dry room, no tail"
best hit_body_2 boot_plant 0.7 0.6 \
  "A boot striking a body hard, blunt low thump with a slapping crack of cloth and leather, dry and immediate, close-miked, no reverb"

echo
echo "ALL DONE — candidates kept in scripts/.takes/ if you want a different one"
