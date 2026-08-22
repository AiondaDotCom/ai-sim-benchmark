#!/usr/bin/env bash
# Generates the raw musical material for the score with Suno (AceDataCloud).
# Two calls: the calm/tense opening material and the driving action material.
# The final 60 s arrangement is assembled from these with ffmpeg (see scripts/build-music.sh).
set -u
cd "$(dirname "$0")/.."
mkdir -p assets/music/raw
TOKEN="${ACEDATACLOUD_API_TOKEN:?set ACEDATACLOUD_API_TOKEN}"  # [token redacted by orchestrator before publication]

gen () {
  local slug="$1"; shift
  local prompt="$1"; shift
  echo "=== generating $slug ==="
  python3 - "$slug" "$prompt" <<'PY'
import json, subprocess, sys, urllib.request, os
slug, prompt = sys.argv[1], sys.argv[2]
body = json.dumps({"action": "generate", "prompt": prompt, "instrumental": True})
out = subprocess.run([
  "curl", "-s", "-m", "600", "-X", "POST", "https://api.acedata.cloud/suno/audios",
  "-H", "Authorization: Bearer " + os.environ["TOKEN"],
  "-H", "Content-Type: application/json", "-d", body], capture_output=True, text=True).stdout
open(f"assets/music/raw/{slug}.response.json", "w").write(out)
try:
    data = json.loads(out)
except Exception:
    print("BAD JSON for", slug, out[:400]); sys.exit(1)
items = data.get("data") or []
if not items:
    print("NO DATA for", slug, out[:400]); sys.exit(1)
for i, it in enumerate(items):
    url = it.get("audio_url")
    if not url: continue
    dest = f"assets/music/raw/{slug}_{i}.mp3"
    urllib.request.urlretrieve(url, dest)
    print("saved", dest, os.path.getsize(dest), "bytes")
PY
}
export TOKEN

gen "calm" "Cinematic action-film score, sterile marble lobby, calm but tense slow build: cold minimal pulsing synth bass on a steady heartbeat, ticking industrial percussion, distant metallic reverb, dark minor key, restrained menace, no drums yet, feels like the seconds before violence. 90s techno-noir sci-fi thriller. Instrumental."

gen "action" "Relentless industrial techno action score for a cinematic slow-motion gunfight: hard driving four-on-the-floor kick, distorted breakbeat, aggressive detuned synth bass stabs, screaming metallic guitar textures, orchestral low brass hits, huge reverb, 135 BPM, dark minor key, unstoppable propulsive momentum, 90s techno-noir sci-fi thriller shootout. Instrumental."

gen "outro" "Cinematic ambient outro after a battle: sparse dark drone, slow decaying piano notes, distant sub bass, settling dust and cold emptiness, minor key, calm resolution, no drums, elegiac and still, 90s techno-noir sci-fi thriller. Instrumental."
echo "=== music generation done ==="
