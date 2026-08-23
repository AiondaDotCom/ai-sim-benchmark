#!/bin/bash
# Generates background-music source tracks via the Suno (AceDataCloud) API.
# Usage: SUNO_TOKEN=... ./scripts/gen-music.sh <outbase> "<prompt>"
# Token must be provided via env var SUNO_TOKEN — never hardcoded.
set -euo pipefail
if [ -z "${SUNO_TOKEN:-}" ]; then echo "SUNO_TOKEN env var required" >&2; exit 1; fi
OUTBASE="$1"
PROMPT="$2"
RESP=$(curl -s -m 600 -X POST https://api.acedata.cloud/suno/audios \
  -H "Authorization: Bearer $SUNO_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"generate\",\"prompt\":$(printf '%s' "$PROMPT" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),\"instrumental\":true}")
echo "$RESP" > "${OUTBASE}.response.json"
URLS=$(echo "$RESP" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("\n".join(a["audio_url"] for a in d.get("data",[])))')
i=0
for u in $URLS; do
  curl -s -m 300 -L "$u" --output "${OUTBASE}_v${i}.mp3"
  i=$((i+1))
done
ls -la "${OUTBASE}"*
