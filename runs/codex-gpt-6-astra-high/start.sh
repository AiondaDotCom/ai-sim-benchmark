#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js and npm are required. Install Node.js 22.12+ from https://nodejs.org, then run ./start.sh again.' >&2
  exit 1
fi
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit((major===20&&minor>=19)||(major===22&&minor>=12)||major>=24?0:1)'; then
  echo 'Please use Node.js 20.19+, 22.12+, or 24+ (with npm) for Vite.' >&2
  exit 1
fi
if [[ "${1:-}" != '' && "${1:-}" != '--preview' ]]; then
  echo 'Usage: ./start.sh [--preview]' >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then npm install; fi
if [[ "${1:-}" == '--preview' ]]; then
  npm run build
  echo 'Alpine Waters production preview: http://localhost:4173'
  exec npm run preview -- --port 4173 --strictPort
else
  echo 'Alpine Waters: http://localhost:5173'
  exec npm run dev -- --port 5173 --strictPort
fi
