#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20 or newer from https://nodejs.org/ and try again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found. Reinstall Node.js with npm included and try again." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ "${1:-}" = "--preview" ]; then
  echo "Building the production app..."
  npm run build
  echo "Alpine Waterways is starting at http://localhost:4173"
  exec npm run preview -- --host 0.0.0.0
fi

if [ "$#" -gt 0 ]; then
  echo "Usage: ./start.sh [--preview]" >&2
  exit 2
fi

echo "Alpine Waterways is starting at http://localhost:5173"
exec npm run dev -- --host 0.0.0.0
