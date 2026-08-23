#!/bin/bash
# B27: the squad leader's command, SHOUTED.
#
# The first take reads as someone saying the word at conversational level. Two
# things are wrong with that and this script addresses the delivery; the mix is
# handled in code (the cue now sits well above every other line and ducks the
# effects bed under itself).
#
# The generator is inconsistent run to run, so this makes three candidates and
# scores them rather than hoping one lands. A shout separates from a spoken
# word on measurable grounds:
#
#   peak      a shout is loud — near the ceiling rather than mid-scale
#   crest     peak against RMS. A barked order is compressed and dense, so a
#             LOW crest factor; a conversational read is peaky and sparse.
#   centroid  raised voice pushes energy up: strain, edge and consonant snap
#             all sit above a relaxed read.
#
# Voice settings do the rest: stability is dropped so the delivery is not
# flattened toward neutral, and style is pushed up.
#
# Usage: ELEVENLABS_KEY=... [CANDIDATES=3] ./scripts/gen-vo-b27.sh
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/public/assets/vo"
TAKES="$DIR/scripts/.takes"
TMP="$DIR/scripts/.vo-tmp"
N="${CANDIDATES:-3}"
mkdir -p "$OUT" "$TAKES" "$TMP"

V_SQUAD=pNInz6obpgDQGcFmaJgB   # Adam — the squad-leader voice, as A10/A15

stat_db() { # file field(mean_volume|max_volume)
  ffmpeg -hide_banner -nostats -i "$1" -af volumedetect -f null - 2>&1 \
    | sed -n "s/.*$2: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p" | head -1; }
centroid_hz() { # rough: energy above 1.5 kHz as a share, which tracks strain
  local f="$1" a b
  a=$(stat_db "$f" mean_volume)
  b=$(ffmpeg -hide_banner -nostats -i "$f" -af highpass=f=1500,volumedetect -f null - 2>&1 \
      | sed -n 's/.*mean_volume: *\(-\{0,1\}[0-9.]*\) dB.*/\1/p' | head -1)
  LC_ALL=C awk -v a="$a" -v b="$b" 'BEGIN{ if(a==""||b==""){print "0";exit} printf "%.1f", 100*(10^((b-a)/10))}'
}

echo "candidate   peak dB   rms dB   crest   >1.5kHz   score"
bestFile=""; bestScore=""
for i in $(seq 1 "$N"); do
  c="$TAKES/vo_freeze_c${i}.mp3"
  raw="$TMP/vo_freeze_c${i}.raw.mp3"
  curl -s -m 120 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$V_SQUAD" \
    -H "xi-api-key: $ELEVENLABS_KEY" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.12, "similarity_boost": 0.75, "style": 0.95, "use_speaker_boost": True}}))' "FREEZE!")" \
    --output "$raw"
  if ! file "$raw" | grep -qi -e audio -e mpeg; then echo "  candidate $i FAILED: $(head -c 120 "$raw")"; continue; fi
  # shouted in a stone hall: drive it, then a short bright slapback
  ffmpeg -v quiet -y -i "$raw" \
    -af "acompressor=threshold=-24dB:ratio=8:attack=2:release=70,volume=7dB,alimiter=limit=0.96,aecho=0.85:0.7:55|105:0.32|0.16" \
    -codec:a libmp3lame -b:a 128k "$c"
  pk=$(stat_db "$c" max_volume); rms=$(stat_db "$c" mean_volume); hi=$(centroid_hz "$c")
  crest=$(LC_ALL=C awk -v p="$pk" -v r="$rms" 'BEGIN{printf "%.1f", p-r}')
  # want: peak near 0, low crest (dense/compressed), plenty of energy up top
  sc=$(LC_ALL=C awk -v p="$pk" -v cr="$crest" -v hi="$hi" \
    'BEGIN{ printf "%.2f", (0-p)/2 + (cr-8)/3 + (25-hi)/8 }')
  printf "  c%-9d %7s %8s %7s %8s%%   %s\n" "$i" "$pk" "$rms" "$crest" "$hi" "$sc"
  if [ -z "$bestScore" ] || LC_ALL=C awk -v a="$sc" -v b="$bestScore" 'BEGIN{exit !(a<b)}'; then
    bestScore="$sc"; bestFile="$c"
  fi
done

if [ -z "$bestFile" ]; then echo "no usable candidate" >&2; exit 1; fi

# Peak-normalise the chosen take to -1 dBFS before installing it.
#
# Without this the delivery and the LEVEL are coupled to the same lucky draw:
# the second round came back genuinely more shouted — crest 15.3 -> 12.5 dB and
# high-frequency share 26.3% -> 46.8%, which is the strain of a raised voice —
# and yet 2 dB QUIETER than the take it replaced, at -13.6 dBFS peak. A command
# that has to dominate its moment cannot be left at whatever level the
# generator happened to return. Normalising here means the cue gain in the mix
# controls balance rather than compensating for take-to-take variation.
pk=$(stat_db "$bestFile" max_volume)
gain=$(LC_ALL=C awk -v p="$pk" 'BEGIN{printf "%.2f", -1 - p}')
ffmpeg -v quiet -y -i "$bestFile" -af "volume=${gain}dB" -codec:a libmp3lame -b:a 128k "$OUT/vo_freeze.mp3"
echo "   normalised by ${gain} dB (was ${pk} dBFS peak)"
echo "-> installed $(basename "$bestFile") as vo_freeze.mp3 (score $bestScore; lower is more shouted)"
echo "candidates kept in scripts/.takes/"
