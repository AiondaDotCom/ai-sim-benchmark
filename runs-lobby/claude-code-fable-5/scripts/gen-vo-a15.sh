#!/bin/bash
# A15: the squad leader's single shouted command at the top of the held
# standoff. One word, on the existing squad-leader voice, shouted and hard.
#
# For the record: a single generic police/military command word is standard
# vocabulary, not distinctive dialogue — the copyright guardrails on this run
# are about the latter.
#
# Usage: ELEVENLABS_KEY=... ./scripts/gen-vo-a15.sh
# The key comes from the environment and is never written into this file.
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/public/assets/vo"
mkdir -p "$OUT"

V_SQUAD=pNInz6obpgDQGcFmaJgB   # Adam — dominant, firm (the squad leader, as A10)

say() { # name voice text
  local name="$1" voice="$2" text="$3"
  local raw="$DIR/scripts/.vo-tmp/$name.raw.mp3" f="$OUT/$name.mp3"
  mkdir -p "$DIR/scripts/.vo-tmp"
  if [ -s "$f" ]; then echo "skip $name"; return; fi
  curl -s -m 120 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$voice" \
    -H "xi-api-key: $ELEVENLABS_KEY" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.3, "similarity_boost": 0.8, "style": 0.75}}))' "$text")" \
    --output "$raw"
  if ! file "$raw" | grep -qi -e audio -e mpeg; then
    echo "FAIL $name: $(head -c 200 "$raw")"; rm -f "$raw"; return
  fi
  # shouted and hard, with the hall on it: a little drive, then a big room
  ffmpeg -v quiet -y -i "$raw" \
    -af "acompressor=threshold=-22dB:ratio=6:attack=3:release=90,volume=5dB,alimiter=limit=0.93,aecho=0.8:0.85:120|260:0.35|0.2" \
    -codec:a libmp3lame -b:a 128k "$f"
  if [ -s "$f" ]; then echo "OK   $name"; else echo "FAIL $name (ffmpeg)"; fi
}

say vo_freeze "$V_SQUAD" "Freeze!"
echo "ALL DONE"
