#!/usr/bin/env bash
#
# Start the mountain water simulation demo.
#
# Usage:
#   ./start.sh            # development server (hot reload)
#   ./start.sh --preview  # build production bundle and serve it
#
# Checks for Node.js / npm, installs dependencies on first run, then starts the
# app and prints the local URL.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="dev"
for arg in "$@"; do
  case "$arg" in
    --preview|-p) MODE="preview" ;;
    --dev|-d) MODE="dev" ;;
    --help|-h)
      echo "Usage: ./start.sh [--dev|--preview]"
      exit 0
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on your PATH." >&2
  echo "Install it from https://nodejs.org/ (v18 or newer recommended)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not on your PATH." >&2
  echo "npm is bundled with Node.js — see https://nodejs.org/." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Warning: Node.js v18+ is recommended (found v$NODE_MAJOR)." >&2
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ "$MODE" = "preview" ]; then
  echo "Building production bundle..."
  npm run build
  echo ""
  echo "Starting production preview server..."
  npm run preview -- --host --port 4173 &
  SERVER_PID=$!
  URL="http://localhost:4173"
else
  npm run dev -- --host --port 5173 &
  SERVER_PID=$!
  URL="http://localhost:5173"
fi

trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

echo ""
echo "========================================================"
echo "  Mountain Water Simulation"
echo "  Open: $URL"
echo "  (Ctrl+C to stop)"
echo "========================================================"

wait "$SERVER_PID"