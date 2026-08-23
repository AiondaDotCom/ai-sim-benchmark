#!/bin/bash
# One-command start for the lobby-scene demo.
#   ./start.sh            start the dev server
#   ./start.sh --preview  build (if needed) and serve the production build
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed (or not on PATH)."
  echo "       Install it from https://nodejs.org (v18+ recommended) and retry."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed (or not on PATH)."
  echo "       It normally ships with Node.js — install Node from https://nodejs.org and retry."
  exit 1
fi

echo "Node $(node --version), npm $(npm --version)"

if [ ! -d node_modules ]; then
  echo "node_modules missing — running npm install ..."
  npm install
fi

if [ "${1:-}" = "--preview" ]; then
  if [ ! -d dist ]; then
    echo "No production build found — running npm run build ..."
    npm run build
  fi
  echo ""
  echo "Serving production build at:  http://localhost:4173/"
  echo "(Ctrl+C to stop)"
  exec npm run preview
else
  echo ""
  echo "Starting dev server at:  http://localhost:5173/"
  echo "(Ctrl+C to stop)"
  exec npm run dev
fi
