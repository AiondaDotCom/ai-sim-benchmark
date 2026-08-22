#!/usr/bin/env bash
# Generates every sound effect with the ElevenLabs sound-generation API.
# Idempotent: an existing, valid, non-empty mp3 is never regenerated (credit budget).
set -u
cd "$(dirname "$0")/.."
mkdir -p assets/sfx
KEY="${ELEVENLABS_API_KEY:?set ELEVENLABS_API_KEY}"  # [key redacted by orchestrator before publication]

sfx () {
  local name="$1"; local dur="$2"; local infl="$3"; local text="$4"
  local out="assets/sfx/${name}.mp3"
  if [ -s "$out" ] && file "$out" | grep -qi 'audio'; then echo "skip $name"; return; fi
  python3 - "$name" "$dur" "$infl" "$text" <<'PY'
import json, subprocess, sys, os
name, dur, infl, text = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
body = json.dumps({"text": text, "duration_seconds": dur, "prompt_influence": infl})
out = f"assets/sfx/{name}.mp3"
subprocess.run(["curl","-s","-m","120","-X","POST","https://api.elevenlabs.io/v1/sound-generation",
  "-H","xi-api-key: "+os.environ["KEY"],"-H","Content-Type: application/json",
  "-d",body,"--output",out])
sz = os.path.getsize(out) if os.path.exists(out) else 0
print(f"{name}: {sz} bytes")
if sz < 2000:
    print("  !! suspicious, content:", open(out,'rb').read()[:300])
PY
  sleep 1
}
export KEY

# --- gunfire -----------------------------------------------------------------
sfx pistol_a 1.0 0.5 "Single dry gunshot from a 9mm handgun fired inside a huge empty marble hall, sharp crack with a long hard slapback echo, no music"
sfx pistol_b 1.0 0.5 "Single handgun gunshot, punchy low crack, fired in a cavernous stone lobby, metallic tail and reverb, no music"
sfx pistol_c 1.0 0.5 "One loud pistol shot, bright snappy transient, big marble room reverb decay, cinematic action movie gunshot, no music"
sfx smg_a 1.6 0.5 "Short rapid submachine gun burst, six rounds, dry mechanical rattle, huge marble hall echo, cinematic, no music"
sfx smg_b 1.6 0.5 "Automatic submachine gun burst of about eight rounds, fast bolt clatter, hard concrete reverb, no music"
sfx smg_c 1.9 0.5 "Sustained machine pistol burst, twelve rapid rounds, aggressive, echoing government building lobby, no music"
# --- impacts -----------------------------------------------------------------
sfx ricochet_a 0.9 0.5 "Bullet ricochet whine off polished stone, sharp zing with high whistling tail, no music"
sfx ricochet_b 0.9 0.5 "Ricochet off marble, metallic pitched whizz spinning away, cinematic, no music"
sfx ricochet_c 0.9 0.5 "Bullet deflection ping off hard stone with descending whistle, no music"
sfx marble_chip_a 1.2 0.5 "Bullet hits polished marble column, sharp crack and a burst of stone chips and dust spraying, no music"
sfx marble_chip_b 1.2 0.5 "Impact into stone wall, dry crack, small marble fragments spitting out and rattling on the floor, no music"
sfx marble_chip_c 1.2 0.5 "Bullet smacking into a stone pillar, gritty crunch with dust puff and tiny falling shards, no music"
sfx marble_shatter_a 2.0 0.45 "Large slab of polished marble veneer shattering off a column and crashing onto a stone floor, heavy stone breaking, no music"
sfx marble_shatter_b 2.0 0.45 "Big chunks of stone cladding breaking apart and smashing down on hard tile, rubble collapse, no music"
sfx debris_fall_a 1.6 0.45 "Loose stone rubble and gravel tumbling and settling onto a hard polished floor, no music"
sfx debris_fall_b 1.6 0.45 "Small stone fragments and grit skittering across a marble floor and coming to rest, no music"
# --- casings -----------------------------------------------------------------
sfx casing_a 0.9 0.6 "A single brass shell casing bouncing on a polished marble floor, bright metallic tink tink ting, close up, no music"
sfx casing_b 0.9 0.6 "Empty bullet casing hitting hard stone and spinning to rest, high bright metallic ringing, no music"
sfx casing_c 0.9 0.6 "Brass cartridge dropping and rattling on tile, delicate metallic bounces, no music"
sfx casing_d 1.4 0.6 "A shower of many brass shell casings raining onto a marble floor, bright metallic clicks and rolls, no music"
sfx casing_spin 1.8 0.5 "A single brass shell casing spinning to rest on a stone floor, fine metallic wobble slowing to silence, close up, no music"
# --- movement ----------------------------------------------------------------
sfx step_a 0.8 0.5 "Single hard leather boot footstep on a polished marble floor in a huge empty hall, sharp click with long echo, no music"
sfx step_b 0.8 0.5 "One heavy boot step on stone tile, echoing in a vast empty lobby, no music"
sfx step_c 0.8 0.5 "Footstep of a heeled boot on marble, crisp tap with cathedral reverb, no music"
sfx coat_swish_a 1.0 0.4 "Heavy long leather coat swinging and snapping through the air, fabric whoosh, no music"
sfx coat_swish_b 1.0 0.4 "Long trench coat flaring open with a sharp fabric whip, no music"
# --- weapon handling ---------------------------------------------------------
sfx gundrop_a 1.3 0.5 "An empty handgun dropped and clattering across a hard marble floor, metal and polymer skittering, no music"
sfx gundrop_b 1.3 0.5 "Pistol discarded, hitting stone tile and sliding away with a metallic scrape, no music"
sfx draw_a 0.8 0.5 "Fast handgun draw from a leather holster with a crisp metallic slide rack, no music"
sfx draw_b 0.8 0.5 "Weapon being pulled from under a coat, fabric rustle and gun metal click, no music"
# --- melee / reactions -------------------------------------------------------
sfx punch_a 0.8 0.5 "Cinematic martial arts punch impact on a body, deep thud with a whip crack, movie foley, no music"
sfx punch_b 0.8 0.5 "Hard fight impact hit, blunt body thump with a snap, action movie style, no music"
sfx kick_a 0.9 0.5 "Powerful flying kick connecting with a body, heavy whoosh then blunt impact, action movie foley, no music"
sfx hit_a 0.9 0.45 "Short male grunt of being knocked down, sharp exhale, action movie stunt reaction, no music"
sfx hit_b 0.9 0.45 "Brief male cry of surprise as he is knocked backwards, clipped shout, no music"
sfx hit_c 0.9 0.45 "Short pained male grunt and gasp, stunt fall reaction, no music"
sfx hit_d 1.1 0.45 "Male body dropping heavily onto a hard floor with a muffled grunt and gear rattle, no music"
# --- set / ambience ----------------------------------------------------------
sfx detector_beep 1.2 0.6 "Walk-through airport metal detector alarm beeping loudly, harsh electronic tone, three quick beeps, no music"
sfx alarm_loop 4.0 0.5 "Building security alarm klaxon looping, harsh two-tone electronic wail echoing in a large hall, no music"
sfx door_push 1.2 0.45 "Heavy glass and metal lobby door being pushed open, hinge groan and a soft air rush, no music"
sfx elev_ding 1.4 0.5 "Elevator arrival chime, single bright bell ding in a marble lobby with echo, no music"
sfx elev_doors 2.6 0.45 "Metal elevator doors sliding open then closing with a soft mechanical hum and a final thud, no music"
sfx hall_tone 8.0 0.35 "Room tone of a vast empty marble government building lobby, faint air conditioning hum, distant hollow reverberant emptiness, no music"
echo "=== sfx generation done ==="
ls -la assets/sfx | tail -50
