#!/bin/bash
# ============================================
# CrecheBooks Railway Deployment Script
# ============================================
# Prerequisites: Railway CLI installed (npm i -g @railway/cli)
# Usage: ./scripts/deploy-railway.sh

set -e

echo "🚀 CrecheBooks Railway Deployment"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Install with: npm i -g @railway/cli${NC}"
    exit 1
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Railway. Running login...${NC}"
    railway login
fi

echo -e "${GREEN}✓ Railway CLI authenticated${NC}"

# Function to display menu
show_menu() {
    echo ""
    echo "Select deployment option:"
    echo "1) Deploy API only"
    echo "2) Deploy Web only"
    echo "3) Deploy both (full stack)"
    echo "4) Create new Railway project"
    echo "5) Link to existing Railway project"
    echo "6) View environment variables template"
    echo "7) Exit"
    echo ""
}

# Function to deploy API
deploy_api() {
    echo -e "${YELLOW}📦 Building and deploying API...${NC}"
    cd apps/api
    railway up --service api
    cd ../..
    echo -e "${GREEN}✓ API deployed successfully${NC}"
}

# Function to deploy Web
deploy_web() {
    echo -e "${YELLOW}📦 Building and deploying Web...${NC}"
    cd apps/web
    railway up --service web
    cd ../..
    echo -e "${GREEN}✓ Web deployed successfully${NC}"
}

# Function to create new project
create_project() {
    echo -e "${YELLOW}🆕 Creating new Railway project...${NC}"
    railway init
    echo ""
    echo -e "${GREEN}✓ Project created!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Next steps:${NC}"
    echo "1. Add PostgreSQL: railway add -p postgres"
    echo "2. Add Redis: railway add -p redis"
    echo "3. Configure environment variables (option 6)"
    echo "4. Deploy services (options 1-3)"
}

# Function to link existing project
link_project() {
    echo -e "${YELLOW}🔗 Linking to existing Railway project...${NC}"
    railway link
    echo -e "${GREEN}✓ Project linked${NC}"
}

# Function to show env template
show_env_template() {
    echo ""
    echo -e "${YELLOW}📋 Required Environment Variables for Railway:${NC}"
    echo "=============================================="
    echo ""
    echo "# Core (REQUIRED)"
    echo "NODE_ENV=production"
    echo "ENCRYPTION_KEY=<generate: openssl rand -base64 32>"
    echo "JWT_SECRET=<generate: openssl rand -base64 32>"
    echo ""
    echo "# Database (auto-set by Railway PostgreSQL plugin)"
    echo "DATABASE_URL=\${{Postgres.DATABASE_URL}}"
    echo ""
    echo "# Redis (auto-set by Railway Redis plugin)"
    echo "REDIS_HOST=\${{Redis.REDIS_HOST}}"
    echo "REDIS_PORT=\${{Redis.REDIS_PORT}}"
    echo "REDIS_PASSWORD=\${{Redis.REDIS_PASSWORD}}"
    echo ""
    echo "# CORS (update with your Railway domains)"
    echo "CORS_ALLOWED_ORIGINS=https://web-production-xxxx.up.railway.app,https://yourdomain.com"
    echo ""
    echo "# API URL for Web app"
    echo "NEXT_PUBLIC_API_URL=https://api-production-xxxx.up.railway.app"
    echo ""
    echo "# Optional integrations (add as needed)"
    echo "# MAILGUN_API_KEY=..."
    echo "# MAILGUN_DOMAIN=..."
    echo "# WHATSAPP_ACCESS_TOKEN=..."
    echo "# XERO_CLIENT_ID=..."
    echo ""
    echo -e "${GREEN}Tip: Use Railway's variable references (\${{ServiceName.VAR}}) for internal services${NC}"
}

# Main loop
while true; do
    show_menu
    read -p "Enter choice [1-7]: " choice

    case $choice in
        1) deploy_api ;;
        2) deploy_web ;;
        3)
            deploy_api
            deploy_web
            ;;
        4) create_project ;;
        5) link_project ;;
        6) show_env_template ;;
        7)
            echo -e "${GREEN}👋 Goodbye!${NC}"
            exit 0
            ;;
        *) echo -e "${RED}Invalid option${NC}" ;;
    esac
done
