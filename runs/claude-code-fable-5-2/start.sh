#!/usr/bin/env bash
# One-command start for the water simulation demo.
#
#   ./start.sh             start the development server
#   ./start.sh --preview   build the production bundle and serve it
#   PORT=8080 ./start.sh   use a different port
set -euo pipefail

cd "$(dirname "$0")"

MODE="dev"
for arg in "$@"; do
  case "$arg" in
    --preview) MODE="preview" ;;
    -h|--help)
      echo "Usage: ./start.sh [--preview]"
      echo "  (no option)  start the Vite development server"
      echo "  --preview    build the production bundle and serve it"
      echo "  PORT=<n>     environment variable to choose the port"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try ./start.sh --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js was not found." >&2
  echo "Install Node.js 20.19 or newer from https://nodejs.org/ (or via nvm / your package manager) and run ./start.sh again." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm was not found (it normally ships with Node.js)." >&2
  echo "Reinstall Node.js from https://nodejs.org/ and run ./start.sh again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js $(node -v) is too old. Please use Node.js 20.19 or newer." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

if [ "$MODE" = "preview" ]; then
  PORT="${PORT:-4173}"
  echo "Building the production bundle..."
  npm run build
  echo
  echo "Water simulation (production build): http://localhost:${PORT}/"
  echo "(If that port is taken, Vite picks the next free one and prints it below.) Stop with Ctrl+C."
  echo
  exec npm run preview -- --port "$PORT"
else
  PORT="${PORT:-5173}"
  echo
  echo "Water simulation (dev server): http://localhost:${PORT}/"
  echo "(If that port is taken, Vite picks the next free one and prints it below.) Stop with Ctrl+C."
  echo
  exec npm run dev -- --port "$PORT"
fi
