#!/usr/bin/env bash
#
# Hydro Vista — one-command launcher.
#
#   ./start.sh              start the Vite dev server (hot reload)
#   ./start.sh --preview    build for production and serve dist/
#   ./start.sh --help       show this help
#
# Any additional arguments are forwarded to the underlying npm script, e.g.
#   ./start.sh -- --port 8080
#
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
if [ ! -t 1 ]; then RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; RESET=""; fi

info()  { printf '%s\n' "${CYAN}==>${RESET} $*"; }
ok()    { printf '%s\n' "${GREEN}==>${RESET} $*"; }
warn()  { printf '%s\n' "${YELLOW}==>${RESET} $*" >&2; }
fail()  { printf '%s\n' "${RED}Error:${RESET} $*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Hydro Vista — autonomous 3D water simulation

Usage:
  ./start.sh              Start the development server (default, hot reload)
  ./start.sh --preview    Build for production, then serve the built files
  ./start.sh --help       Show this message

The demo runs entirely on its own — there is nothing to click. Configuration is
done through URL query parameters, for example:

  http://localhost:5173/?seed=glacier&rain=1.5&speed=0.8

  seed=<text>     terrain seed (any string or number)
  size=<64..384>  simulation grid resolution
  rain=<0..5>     rainfall multiplier
  speed=<0.05..6> simulation speed multiplier
  springs=<0..24> number of summit springs
  evap=<0..6>     evaporation multiplier
  prewarm=<0..300> seconds of simulation to run before the first frame
  camspeed=<0..1> camera orbit speed in rad/s
  shadows=0       disable shadow mapping (faster on weak GPUs)
  dpr=<0.5..3>    cap the device pixel ratio
USAGE
}

MODE="dev"
EXTRA_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --preview|-p) MODE="preview"; shift ;;
    --dev|-d)     MODE="dev"; shift ;;
    --help|-h)    usage; exit 0 ;;
    --)           shift; EXTRA_ARGS+=("$@"); break ;;
    *)            EXTRA_ARGS+=("$1"); shift ;;
  esac
done

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- prerequisites ----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js was not found on your PATH.

  Hydro Vista needs Node.js 20.19+ (or 22.12+) and npm.
  Install it from https://nodejs.org/ — or with a version manager:

    nvm install --lts        (https://github.com/nvm-sh/nvm)
    brew install node        (macOS, Homebrew)
    sudo apt install nodejs npm   (Debian/Ubuntu)

  Then run ./start.sh again."
fi

if ! command -v npm >/dev/null 2>&1; then
  fail "npm was not found on your PATH.

  npm ships with Node.js. Reinstall Node.js from https://nodejs.org/
  (or install the 'npm' package from your distribution) and try again."
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  warn "Node.js $NODE_VERSION detected. Vite 7 expects Node.js 20.19+ or 22.12+."
  warn "The demo may fail to build. Consider upgrading Node.js."
fi
info "Node.js $NODE_VERSION, npm $(npm --version)"

# --- dependencies -----------------------------------------------------------
if [ ! -d node_modules ]; then
  info "node_modules is missing — running npm install (this happens once)…"
  npm install || fail "npm install failed. Check the output above."
  ok "Dependencies installed."
else
  info "Dependencies already installed."
fi

# --- run --------------------------------------------------------------------
printf '\n'
if [ "$MODE" = "preview" ]; then
  info "Building for production…"
  npm run build || fail "The production build failed. Check the output above."
  ok "Build complete (dist/)."
  printf '\n'
  ok "${BOLD}Open http://localhost:4173/${RESET}"
  info "Press Ctrl+C to stop."
  printf '\n'
  exec npm run preview -- --host --port 4173 "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
else
  ok "${BOLD}Open http://localhost:5173/${RESET}"
  info "The demo starts by itself — there is nothing to click."
  info "Press Ctrl+C to stop."
  printf '\n'
  exec npm run dev -- --host --port 5173 "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
fi
