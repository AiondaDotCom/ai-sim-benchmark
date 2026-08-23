#!/bin/bash
# Generates all sound effects via the ElevenLabs sound-generation API.
# Usage: ELEVENLABS_KEY=... ./scripts/gen-sfx.sh
# Key must be provided via env var — never hardcoded.
set -uo pipefail
if [ -z "${ELEVENLABS_KEY:-}" ]; then echo "ELEVENLABS_KEY env var required" >&2; exit 1; fi
OUT="public/assets/sfx"
mkdir -p "$OUT"

gen() { # name duration prompt
  local name="$1" dur="$2" prompt="$3"
  local f="$OUT/$name.mp3"
  if [ -s "$f" ] && file "$f" | grep -qi -e audio -e mpeg; then echo "skip $name (exists)"; return; fi
  curl -s -m 120 -X POST https://api.elevenlabs.io/v1/sound-generation \
    -H "xi-api-key: $ELEVENLABS_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":$(printf '%s' "$prompt" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"duration_seconds\":$dur,\"prompt_influence\":0.4}" \
    --output "$f"
  if file "$f" | grep -qi -e audio -e mpeg; then echo "OK   $name"; else echo "FAIL $name: $(head -c 200 "$f")"; rm -f "$f"; fi
}

gen pistol_0 1.2 "Single loud pistol gunshot, sharp powerful crack with a long echo in a huge marble hall"
gen pistol_1 1.2 "One handgun shot fired indoors, punchy bang with reverberant stone-hall echo tail"
gen pistol_2 1.2 "A single 9mm pistol gunshot, crisp snap and booming echo in a large empty lobby"
gen smg_0 1.6 "Short submachine gun burst of five rapid shots, automatic gunfire echoing in a big marble hall"
gen smg_1 1.6 "Rapid automatic gunfire burst, six rounds from a compact machine gun, indoor stone echo"
gen ricochet_0 1.0 "Bullet ricochet off polished stone, sharp metallic zing whining away"
gen ricochet_1 1.0 "A ricocheting bullet ping with a whistling deflection off marble"
gen marble_0 1.3 "Marble chunk shattering, stone chips cracking and breaking off a pillar, sharp stone debris"
gen marble_1 1.3 "Bullet impact into marble: stone cracking, chips of rock splintering and spraying"
gen marble_2 1.3 "Heavy stone surface bursting, palm-sized marble fragments breaking away with a crunch"
gen casing_0 1.2 "Single small brass shell casing falling onto a marble floor, bright metallic tink and bounce"
gen casing_1 1.2 "A brass bullet casing dropping and bouncing on polished stone with high-pitched metallic clicks"
gen casing_2 1.2 "Tiny metal shell case tinkling and rolling to rest on a hard stone floor"
gen debris_0 1.6 "Small stone debris fragments raining down and scattering across a stone floor"
gen debris_1 1.6 "Handful of rock chips and dust falling, clattering lightly on marble tiles"
gen footstep_0 0.7 "Single hard boot footstep on a polished marble floor with a slight echo"
gen footstep_1 0.7 "One firm leather boot heel step on stone floor, short clean echo"
gen beep 1.0 "Loud electronic metal detector alert beep, two harsh insistent tones"
gen alarm 3.0 "Government building security alarm, urgent repeating electric bell ringing"
gen grunt_m0 0.8 "Short stylized male action-movie pain grunt, quick 'ugh', no gore"
gen grunt_m1 0.8 "A quick male fighter's grunt of impact, punchy 'hah' exhale, stylized"
gen grunt_m2 0.8 "Brief male cry of being hit, stylized action film 'agh', clean"
gen grunt_f0 0.8 "Short stylized female action-movie effort shout, sharp 'hyah', martial arts"
gen gundrop_0 1.1 "An empty metal handgun clattering onto a marble floor and sliding"
gen gundrop_1 1.1 "A heavy pistol dropped on polished stone, metallic clunk and skitter"
gen whoosh_0 0.8 "Fast martial arts whoosh with a sharp punch impact thud"
gen whoosh_1 0.8 "Quick spinning kick air whoosh followed by a solid impact hit"
gen elevator 2.6 "A soft elevator arrival chime ding, then smooth metal doors sliding open"
gen coat 0.9 "Heavy fabric whoosh of a long coat swinging quickly"
gen draw 0.8 "A handgun being drawn quickly from a leather holster with a metallic slide click"

echo done
ls -la "$OUT" | wc -l
