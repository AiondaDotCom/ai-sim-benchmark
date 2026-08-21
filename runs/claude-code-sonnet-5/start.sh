#!/usr/bin/env bash
#
# One-command launcher for the procedural mountain water simulation.
#
# Usage:
#   ./start.sh              # start the Vite dev server (hot reload)
#   ./start.sh --preview    # build for production and serve that build
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="dev"
if [[ "${1:-}" == "--preview" ]]; then
  MODE="preview"
fi

# --- 1. Check for Node.js / npm -------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js was not found on your PATH." >&2
  echo "       Install Node.js (v18 or newer) from https://nodejs.org/ and try again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm was not found on your PATH." >&2
  echo "       npm normally ships with Node.js - try reinstalling Node.js from https://nodejs.org/." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "warning: Node.js v18+ is recommended (found v$(node -p process.version | tr -d v))." >&2
fi

# --- 2. Install dependencies if needed ------------------------------------------
if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)..."
  npm install
fi

# --- 3. Start the app -------------------------------------------------------------
if [[ "$MODE" == "preview" ]]; then
  echo "Building production bundle..."
  npm run build
  echo ""
  echo "Starting production preview server..."
  echo "Open the URL printed below in your browser (no controls needed - it runs itself):"
  npm run preview -- --open
else
  echo "Starting dev server..."
  echo "Open the URL printed below in your browser (no controls needed - it runs itself):"
  npm run dev -- --open
fi
