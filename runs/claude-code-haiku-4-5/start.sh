#!/bin/bash
set -e

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}Error: npm is not installed${NC}"
    echo "Please install npm from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)

echo -e "${BLUE}Node.js version: $NODE_VERSION${NC}"
echo -e "${BLUE}npm version: $NPM_VERSION${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}Dependencies installed${NC}"
    echo ""
fi

# Get the directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check for --preview flag for production build preview
if [ "$1" = "--preview" ]; then
    echo -e "${BLUE}Building production bundle...${NC}"
    npm run build
    echo -e "${GREEN}Build complete${NC}"
    echo ""

    echo -e "${BLUE}Starting preview server...${NC}"
    npm run preview &
    PREVIEW_PID=$!

    # Wait a moment for the server to start
    sleep 2

    echo -e "${GREEN}Preview server running at http://localhost:4173${NC}"
    wait $PREVIEW_PID
else
    echo -e "${BLUE}Starting development server...${NC}"
    echo ""
    echo -e "${GREEN}Water Simulation is running!${NC}"
    echo -e "${GREEN}Open http://localhost:5173 in your browser${NC}"
    echo ""
    echo -e "${YELLOW}Configuration via URL parameters:${NC}"
    echo "  - terrainSeed: Random seed for terrain (default: 12345)"
    echo "  - rainRate: Rain intensity (default: 0.08)"
    echo "  - mountainHeight: Maximum terrain height (default: 100)"
    echo ""
    echo -e "${YELLOW}Example: http://localhost:5173?terrainSeed=99999&rainRate=0.15${NC}"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    npm run dev
fi
