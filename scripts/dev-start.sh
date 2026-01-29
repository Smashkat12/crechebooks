#!/usr/bin/env bash
set -euo pipefail

# ============================================
# CrecheBooks Dev Environment Startup
# ============================================
# Starts Docker infrastructure + local dev servers
# Usage: ./scripts/dev-start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# --- Prerequisites check ---
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo "ERROR: docker is not installed. Install Docker Desktop or Docker Engine."
  exit 1
fi

if ! command -v pnpm &> /dev/null; then
  echo "ERROR: pnpm is not installed. Run: npm install -g pnpm"
  exit 1
fi

NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js >= 20 required. Current: $(node -v 2>/dev/null || echo 'not found')"
  exit 1
fi

echo "Prerequisites OK: docker, pnpm, node $(node -v)"

# --- Start dev infrastructure ---
echo ""
echo "Starting dev infrastructure (PostgreSQL 16 + Redis 7)..."
docker compose -f docker-compose.dev.yml up -d

echo "Waiting for services to be healthy..."
timeout 60 bash -c 'until docker compose -f docker-compose.dev.yml ps --format json 2>/dev/null | grep -q healthy; do sleep 2; done' 2>/dev/null || {
  echo "Services started (health check may still be pending)."
}

# --- Install dependencies ---
echo ""
echo "Installing dependencies..."
pnpm install

# --- Generate Prisma client ---
echo ""
echo "Generating Prisma client..."
pnpm prisma:generate

# --- Run database migrations ---
echo ""
echo "Running database migrations..."
pnpm prisma:migrate

# --- Start dev servers ---
echo ""
echo "Starting dev servers..."
echo "  API:  http://localhost:3000"
echo "  Web:  http://localhost:3001"
echo ""
pnpm dev
