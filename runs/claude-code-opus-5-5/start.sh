#!/usr/bin/env bash
# One-command start for the autonomous water simulation demo.
#
#   ./start.sh            start the Vite dev server
#   ./start.sh --preview  build for production and serve the build
#
# Environment: PORT (default 5173 for dev, 4173 for preview), HOST (default localhost)
set -euo pipefail

cd "$(dirname "$0")"

MODE="dev"
for arg in "$@"; do
  case "$arg" in
    --preview|-p) MODE="preview" ;;
    --help|-h)
      sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --preview or --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not on your PATH." >&2
  echo "Install Node.js 20 or newer from https://nodejs.org/ (or via nvm: https://github.com/nvm-sh/nvm)." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not on your PATH." >&2
  echo "npm ships with Node.js - reinstall Node.js from https://nodejs.org/." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Warning: Node.js $(node -v) detected; Node.js 20 or newer is recommended." >&2
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (npm install)..."
  npm install
fi

HOST="${HOST:-localhost}"
if [ "$MODE" = "preview" ]; then
  PORT="${PORT:-4173}"
  echo "Building production bundle..."
  npm run build
  echo ""
  echo "Serving production build at: http://${HOST}:${PORT}/"
  echo "(URL options, e.g. http://${HOST}:${PORT}/?seed=42&rain=1.5&speed=2)"
  echo ""
  exec npx vite preview --host "$HOST" --port "$PORT" --strictPort
else
  PORT="${PORT:-5173}"
  echo ""
  echo "Starting dev server at: http://${HOST}:${PORT}/"
  echo "(URL options, e.g. http://${HOST}:${PORT}/?seed=42&rain=1.5&speed=2)"
  echo ""
  exec npx vite --host "$HOST" --port "$PORT" --strictPort
fi
