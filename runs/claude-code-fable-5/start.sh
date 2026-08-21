#!/usr/bin/env bash
#
# One-command launcher for the Mountain Water Simulation.
#
# Usage:
#   ./start.sh            # dev server (default)
#   ./start.sh --preview  # production build + preview server
#
set -euo pipefail

cd "$(dirname "$0")"

# --- Check prerequisites -----------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed (command 'node' not found)." >&2
  echo "Please install Node.js 18 or newer, e.g. from https://nodejs.org/" >&2
  echo "or via your package manager (brew install node / apt install nodejs npm)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed (command 'npm' not found)." >&2
  echo "npm normally ships with Node.js — please install Node.js 18 or newer" >&2
  echo "from https://nodejs.org/ and try again." >&2
  exit 1
fi

echo "Using node $(node --version), npm $(npm --version)"

# --- Install dependencies on first run ---------------------------------------
if [ ! -d node_modules ]; then
  echo "node_modules missing — running 'npm install' (first run only)..."
  npm install
fi

# --- Start the app -----------------------------------------------------------
if [ "${1:-}" = "--preview" ]; then
  echo "Building production bundle..."
  npm run build
  echo
  echo "Starting preview server — open the URL printed below (default: http://localhost:4173/)"
  echo "The demo runs fully automatically; stop with Ctrl+C."
  exec npm run preview
else
  echo
  echo "Starting dev server — open the URL printed below (default: http://localhost:5173/)"
  echo "The demo runs fully automatically; stop with Ctrl+C."
  exec npm run dev
fi
