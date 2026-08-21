#!/bin/bash
set -e

echo "=== AI Water Simulation Benchmark ==="
echo "Working directory: $(pwd)"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed or not in PATH."
  echo "Please install Node.js from https://nodejs.org/"
  echo "Then run this script again."
  exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm is not installed or not in PATH."
  echo "Please ensure Node.js installation includes npm."
  exit 1
fi

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "✅ Node.js: $NODE_VERSION"
echo "✅ npm: $NPM_VERSION"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (this may take a moment)..."
  npm install
  echo "✅ Dependencies installed."
else
  echo "✅ node_modules already present."
fi
echo ""

echo "🚀 Starting the water simulation..."
echo "The demo will open automatically in your browser."
echo "It is fully autonomous — enjoy the flowing water and orbiting camera!"
echo ""
echo "URL: http://localhost:5173"
echo "For production preview: http://localhost:4173"
echo ""

# Start dev server in background if not in preview mode
if [[ "$1" == "--preview" ]] || [[ "$1" == "preview" ]]; then
  echo "Building for production preview..."
  npm run build
  echo "Starting preview server..."
  npm run preview
else
  npm run dev
fi
