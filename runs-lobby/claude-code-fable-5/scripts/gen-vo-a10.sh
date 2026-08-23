#!/bin/bash
# A10: English voice lines via the ElevenLabs text-to-speech API.
#
# All lines are ORIGINAL generic security/police phrasing. No dialogue from any
# film is used anywhere.
#
# Radio lines get a walkie-talkie treatment in ffmpeg: 300-3000 Hz band-pass,
# light distortion and compression, and a short squelch click at each end.
#
# Usage: ELEVENLABS_KEY=... ./scripts/gen-vo-a10.sh
# The key comes from the environment and is never written into this file.
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/public/assets/vo"
TMP="$DIR/scripts/.vo-tmp"
mkdir -p "$OUT" "$TMP"

# --- voices (from GET /v1/voices), one per role -----------------------------
V_GUARD_MATURE=cjVigY5qzO86Huf0OWal   # Eric  - smooth, trustworthy, middle-aged
V_GUARD_YOUNG=bIHbv24MWmeRgasZH58o    # Will  - relaxed, young
V_DISPATCH=onwK4e9ZLuTAKqWW03F9       # Daniel- steady broadcaster
V_SQUAD=pNInz6obpgDQGcFmaJgB          # Adam  - dominant, firm
V_TROOPER=SOYHLrjzK2X1ezoPC6cr        # Harry - fierce warrior

# one squelch burst, reused at both ends of every radio line
if [ ! -s "$TMP/squelch.wav" ]; then
  ffmpeg -v quiet -y -f lavfi -i "anoisesrc=d=0.055:c=pink:a=0.5" \
    -af "highpass=f=900,lowpass=f=3200,afade=t=in:st=0:d=0.008,afade=t=out:st=0.03:d=0.025,volume=0.5" \
    "$TMP/squelch.wav"
fi

say() { # name voice_id radio text
  local name="$1" voice="$2" radio="$3" text="$4"
  local raw="$TMP/$name.raw.mp3" f="$OUT/$name.mp3"
  if [ -s "$f" ]; then echo "skip $name"; return; fi
  curl -s -m 120 -X POST "https://api.elevenlabs.io/v1/text-to-speech/$voice" \
    -H "xi-api-key: $ELEVENLABS_KEY" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.42, "similarity_boost": 0.8, "style": 0.35}}))' "$text")" \
    --output "$raw"
  if ! file "$raw" | grep -qi -e audio -e mpeg; then
    echo "FAIL $name: $(head -c 200 "$raw")"; rm -f "$raw"; return
  fi
  if [ "$radio" = "radio" ]; then
    # band-limited, compressed and lightly clipped, with squelch either end
    ffmpeg -v quiet -y -i "$raw" \
      -af "highpass=f=300,lowpass=f=3000,acompressor=threshold=-20dB:ratio=8:attack=4:release=90,volume=6dB,alimiter=limit=0.85,highpass=f=320,lowpass=f=2900" \
      "$TMP/$name.body.wav"
    ffmpeg -v quiet -y -i "$TMP/squelch.wav" -i "$TMP/$name.body.wav" -i "$TMP/squelch.wav" \
      -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]" -map "[a]" \
      -codec:a libmp3lame -b:a 128k "$f"
  else
    ffmpeg -v quiet -y -i "$raw" \
      -af "acompressor=threshold=-20dB:ratio=3:attack=8:release=140,alimiter=limit=0.92" \
      -codec:a libmp3lame -b:a 128k "$f"
  fi
  if [ -s "$f" ]; then echo "OK   $name"; else echo "FAIL $name (ffmpeg)"; fi
}

# --- the lines --------------------------------------------------------------
say vo_checkpoint_1 "$V_GUARD_MATURE" plain \
  "Sir, please remove any metal items and step back through."
say vo_checkpoint_2 "$V_GUARD_MATURE" plain \
  "Sir. I need you to step back. Now."
say vo_hands "$V_GUARD_YOUNG" plain \
  "Hands where I can see them!"
say vo_radio_backup "$V_GUARD_MATURE" radio \
  "Control, lobby post. Armed intruders in the main hall, requesting immediate backup."
say vo_go "$V_SQUAD" plain \
  "Go, go, go!"
say vo_takecover "$V_SQUAD" plain \
  "Take cover!"
say vo_leftflank "$V_SQUAD" plain \
  "Moving up, left flank!"
say vo_reloading "$V_TROOPER" plain \
  "Reloading!"
say vo_column "$V_TROOPER" plain \
  "He's behind the column!"
say vo_lobbypost "$V_DISPATCH" radio \
  "Lobby post, report. Lobby post, do you copy?"
echo "ALL DONE"
