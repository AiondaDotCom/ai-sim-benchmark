#!/usr/bin/env bash
#
# One-command start for the lobby-shootout demo.
#
#   ./start.sh             development server (hot reload)
#   ./start.sh --preview   production build, then serve it
#
set -u

cd "$(dirname "$0")"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; RESET=$'\033[0m'

need() {
  if ! command -v "$1" > /dev/null 2>&1; then
    echo "${RED}${BOLD}$1 was not found on your PATH.${RESET}"
    echo
    echo "This demo needs Node.js 18 or newer and the npm that ships with it."
    echo "Install it from  ${BOLD}https://nodejs.org/${RESET}  (or with a version"
    echo "manager: ${DIM}nvm install --lts${RESET} / ${DIM}brew install node${RESET} / ${DIM}winget install OpenJS.NodeJS${RESET})"
    echo "and run ./start.sh again."
    exit 1
  fi
}

need node
need npm

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "${RED}Node.js $(node -v) is too old.${RESET} Vite 5 needs Node 18 or newer."
  echo "Please upgrade Node.js and run ./start.sh again."
  exit 1
fi

echo "${DIM}node $(node -v), npm $(npm -v)${RESET}"

if [ ! -d node_modules ]; then
  echo "${BOLD}Installing dependencies (first run only)…${RESET}"
  npm install || { echo "${RED}npm install failed.${RESET}"; exit 1; }
fi

PORT="${PORT:-5173}"

if [ "${1:-}" = "--preview" ]; then
  echo "${BOLD}Building for production…${RESET}"
  npm run build || { echo "${RED}Build failed.${RESET}"; exit 1; }
  echo
  echo "${GREEN}${BOLD}Serving the production build:${RESET}  http://localhost:${PORT}/"
  echo "${DIM}The demo starts by itself. Click once anywhere to let the browser start the audio.${RESET}"
  exec npx vite preview --port "$PORT" --strictPort
fi

echo
echo "${GREEN}${BOLD}Starting the dev server:${RESET}  http://localhost:${PORT}/"
echo "${DIM}The demo starts by itself. Click once anywhere to let the browser start the audio.${RESET}"
echo "${DIM}Options (URL query parameters only — the demo has no on-screen UI):${RESET}"
echo "${DIM}  ?seed=123  ?volume=0.5  ?timeScale=0.5  ?startAt=20  ?loop=0  ?quality=low${RESET}"
echo
exec npx vite --port "$PORT" --strictPort
