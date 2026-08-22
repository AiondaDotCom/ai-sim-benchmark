#!/usr/bin/env bash
# Quick start for the interactive 3D water simulation demo.
#   ./start.sh            -> dev server
#   ./start.sh --preview  -> production build + preview server
set -u

MODE="dev"
if [ "${1:-}" = "--preview" ]; then
  MODE="preview"
fi

PORT="${PORT:-5173}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed."
  echo "Please install Node.js (v18 or newer) from https://nodejs.org"
  echo "or via your package manager, e.g.: brew install node"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not available."
  echo "npm ships with Node.js - please reinstall Node.js from https://nodejs.org"
  exit 1
fi

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install || { echo "Error: npm install failed."; exit 1; }
fi

if [ "$MODE" = "preview" ]; then
  echo "Building production bundle..."
  npm run build || { echo "Error: build failed."; exit 1; }
  echo ""
  echo "Starting preview server at: http://localhost:${PORT}/"
  npx vite preview --port "$PORT" --strictPort
else
  echo ""
  echo "Starting dev server at: http://localhost:${PORT}/"
  npx vite --port "$PORT" --strictPort
fi
