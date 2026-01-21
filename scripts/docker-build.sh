#!/bin/bash
# ============================================
# CrecheBooks Docker Build Script
# ============================================
# Builds Docker images locally for testing
# Usage: ./scripts/docker-build.sh [api|web|all]

set -e

echo "🐳 CrecheBooks Docker Build"
echo "==========================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

build_api() {
    echo -e "${YELLOW}📦 Building API image...${NC}"
    docker build -t crechebooks-api:latest -f apps/api/Dockerfile .
    echo -e "${GREEN}✓ API image built: crechebooks-api:latest${NC}"
}

build_web() {
    echo -e "${YELLOW}📦 Building Web image...${NC}"
    docker build -t crechebooks-web:latest -f apps/web/Dockerfile \
        --build-arg NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:3000} .
    echo -e "${GREEN}✓ Web image built: crechebooks-web:latest${NC}"
}

case "${1:-all}" in
    api)
        build_api
        ;;
    web)
        build_web
        ;;
    all)
        build_api
        build_web
        ;;
    *)
        echo "Usage: $0 [api|web|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo "To run locally with docker-compose:"
echo "  docker-compose up -d"
echo ""
echo "To run individual containers:"
echo "  docker run -p 3000:3000 --env-file .env crechebooks-api:latest"
echo "  docker run -p 3001:3000 crechebooks-web:latest"
