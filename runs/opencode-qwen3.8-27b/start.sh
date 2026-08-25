#!/usr/bin/env bash
#
# One-command launcher for the Aqua Peaks water simulation.
#
#   ./start.sh            start the dev server (hot reload)
#   ./start.sh --preview  build for production, then serve the built app
#
# The script checks for Node.js and npm, installs dependencies if needed,
# and prints the local URL to open in a browser.
set -euo pipefail

cd "$(dirname "$0")"

# --- Check for Node.js and npm -------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js was not found on your PATH." >&2
  echo "This project requires Node.js 18 or newer." >&2
  echo "Install it from https://nodejs.org or via your package manager" >&2
  echo "(e.g. 'brew install node', 'apt install nodejs npm', or nvm)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm was not found on your PATH." >&2
  echo "npm ships with Node.js — reinstall Node.js from https://nodejs.org." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "warning: Node.js $(node -p 'process.versions.node') is older than 18;" >&2
  echo "the dev server may not start. Please upgrade to Node.js 18+." >&2
fi

echo "Using Node.js $(node -p 'process.versions.node') and npm $(npm -v)."

# --- Install dependencies if needed --------------------------------------
if [ ! -d node_modules ]; then
  echo "node_modules not found — running 'npm install' (this can take a minute)…"
  npm install
fi

# --- Choose dev or preview mode -------------------------------------------
MODE="dev"
if [ "${1:-}" = "--preview" ]; then
  MODE="preview"
fi

if [ "$MODE" = "preview" ]; then
  if [ ! -d dist ]; then
    echo "No production build found — running 'npm run build' first…"
    npm run build
  fi
  echo ""
  echo "Starting the production build. Open:"
  echo "  http://localhost:4173"
  echo "(Ctrl+C to stop)"
  echo ""
  exec npm run preview
else
  echo ""
  echo "Starting the dev server. Open:"
  echo "  http://localhost:5173"
  echo ""
  echo "Useful URL parameters (no on-screen UI exists by design):"
  echo "  ?seed=42      a different landscape"
  echo "  ?rain=2       heavier rainfall"
  echo "  ?speed=2      faster simulation"
  echo "  ?springs=5    more mountain springs"
  echo "  ?res=192      higher-resolution terrain/water grid"
  echo ""
  echo "(Ctrl+C to stop)"
  echo ""
  exec npm run dev
fi
