#!/bin/bash
# B4: regenerate the checkpoint metal-detector alarm (walk-through gate beeper).
# Usage: ELEVENLABS_KEY=... ./scripts/gen-beep-b4.sh
# Key comes from the environment — never hardcoded in this file.
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
OUT="${1:-scripts/beep-candidates}"
mkdir -p "$OUT"

gen() { # name duration influence prompt
  local name="$1" dur="$2" inf="$3" prompt="$4" f
  f="$OUT/$name.mp3"
  curl -s -m 120 -X POST https://api.elevenlabs.io/v1/sound-generation \
    -H "xi-api-key: $ELEVENLABS_KEY" -H "Content-Type: application/json" \
    -d "{\"text\":$(printf '%s' "$prompt" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"duration_seconds\":$dur,\"prompt_influence\":$inf}" \
    --output "$f"
  if file "$f" | grep -qi -e audio -e mpeg; then echo "OK   $name"; else echo "FAIL $name: $(head -c 200 "$f")"; rm -f "$f"; fi
}

gen cand_a 2.0 0.5 "Airport walk-through metal detector alarm: a plain electronic beeper repeating one short clean beep at a constant 1200 hertz, three and a half beeps per second, perfectly steady rhythm, dry close-up, no reverb, no melody, no music, every beep identical"
gen cand_e 2.0 0.55 "A cheap electronic buzzer beeping: beep. beep. beep. beep. beep. beep. seven short flat beeps evenly spaced over two seconds, one single low-ish tone about 1100 hertz, thin plain synthetic square wave, completely dry, no room, no echo, no music, no variation between beeps"
gen cand_f 2.0 0.45 "Security metal detector archway alarm going off: an insistent repeating electronic tone, short beeps at a steady three per second, single fixed pitch around 1300 hertz, plain and flat, like a microwave timer, dry and close, no reverb, no melody"
gen cand_g 2.0 0.6 "Digital alarm clock beeping steadily: identical short pips repeating about three and a half times a second for two seconds, one constant pitch near 1000 hertz, plain electronic tone, no music, no chord, no reverb, no fade"
gen cand_b 2.0 0.5 "Security checkpoint metal detector gate alarm beeping: sharp clean high pitched electronic pips, four per second, one single constant pitch near 1500 hertz, plain digital tone, no melody, no pitch sweep, no echo"
gen cand_c 2.0 0.6 "Monotone digital alarm beeper: short square wave pips at a constant 1000 hertz repeating steadily three times per second, machine like, dry, no reverb, no melody"
gen cand_d 2.0 0.4 "Walk through security gate detector alarm, insistent repeating electronic beep beep beep beep at a steady rate of about three and a half per second, one fixed high pitch, clean synthetic tone, close and dry"
