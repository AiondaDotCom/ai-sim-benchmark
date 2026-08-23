#!/bin/bash
# A17: the intro music is replaced with a cold industrial build made of struck
# metal. Only the INTRO changes — the heavy-metal action section and the calm
# outro are untouched, and the drop stays exactly where it is at 12.0 s.
#
# Generation only. scripts/build-music-a17.sh does the assembly and prints the
# handover measurements.
#
# Usage: SUNO_TOKEN=... ./scripts/gen-music-a17.sh
# The token comes from the environment and is never written into this file.
set -euo pipefail
if [ -z "${SUNO_TOKEN:-}" ]; then echo "SUNO_TOKEN env var required" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"

PROMPT="Cold industrial instrumental intro built entirely from struck metal. Heavy anvil-like hammer blows on steel, scraped and dragged metal, a deep mechanical rumble underneath, a slow menacing pulse with a lot of space between the hits, each hit ringing out and decaying in a huge empty stone hall. Sparse and patient rather than busy, an atmosphere of something enormous and inevitable moving into place. No melody, no vocals, no drum kit, no guitars. Steady pulse around 130 BPM so it shares a tempo with the heavy industrial metal that follows."

"$DIR/scripts/gen-music.sh" "$DIR/public/assets/music/industrial" "$PROMPT"
echo
echo "Now assemble and verify:"
echo "  ./scripts/build-music-a17.sh industrial_v0   (or _v1, whichever is better)"
