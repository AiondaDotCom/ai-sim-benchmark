#!/usr/bin/env bash
#
# Quick start for the 3D water simulation demo.
#
#   ./start.sh            -> install deps (if needed) + start dev server
#   ./start.sh --preview  -> install deps, build for production, serve the build
#
set -euo pipefail

cd "$(dirname "$0")"

# --- Check prerequisites -----------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js was not found on your PATH."
  echo "Please install Node.js 18 or newer: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm was not found on your PATH."
  echo "Please install Node.js (which bundles npm): https://nodejs.org/"
  exit 1
fi

echo "Using Node.js $(node -v) and npm $(npm -v)"

# --- Install dependencies ----------------------------------------------------
if [ ! -d node_modules ]; then
  echo "node_modules not found — running npm install..."
  npm install
else
  echo "Dependencies already installed (node_modules exists)."
fi

# --- Start -------------------------------------------------------------------
PORT="${PORT:-5173}"

if [ "${1:-}" = "--preview" ]; then
  echo "Building production bundle..."
  npm run build
  echo ""
  echo "Starting production preview server at http://localhost:${PORT}"
  npm run preview -- --port "${PORT}"
else
  echo ""
  echo "Starting dev server at http://localhost:${PORT}"
  npm run dev -- --port "${PORT}"
fi
