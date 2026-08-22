#!/usr/bin/env bash
# Assembles the single continuous score from the three Suno-generated stems.
# The cut into the action stem is snapped to a detected onset/beat so that the
# drop lands exactly on the guard's lunge for his radio (story t = 11.0 s).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/beat_cut.py
