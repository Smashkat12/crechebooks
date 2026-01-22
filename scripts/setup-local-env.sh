#!/bin/bash
# Setup local development environment with secrets
# Usage: ./scripts/setup-local-env.sh

set -e

PROJECT_ROOT=$(pwd)

echo "🔧 CrecheBooks Local Environment Setup"
echo "======================================"
echo ""
echo "Project: $(basename "$PROJECT_ROOT")"
echo ""

# API Environment Setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. API Environment (apps/api/.env)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd apps/api

if [ -f .env ]; then
    echo "⚠️  apps/api/.env already exists"
    read -p "Overwrite with new secrets? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "⏭️  Keeping existing apps/api/.env"
        echo ""
    else
        rm .env
        cp ../../.env.example .env
        echo "✅ Reset apps/api/.env from template"
    fi
else
    cp ../../.env.example .env
    echo "✅ Created apps/api/.env from template"
fi

# Generate and append secrets
echo ""
echo "Generating cryptographic secrets..."

{
    echo ""
    echo "# ============================================"
    echo "# Auto-generated secrets ($(date '+%Y-%m-%d %H:%M:%S'))"
    echo "# SECURITY: Never commit these to Git!"
    echo "# ============================================"
    echo ""
    echo "# Encryption for sensitive data (PII, tokens, credentials)"
    echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
    echo ""
    echo "# JWT authentication"
    echo "JWT_SECRET=$(openssl rand -base64 32)"
    echo ""
    echo "# Xero OAuth state encryption"
    echo "XERO_STATE_KEY=$(openssl rand -base64 32)"
    echo ""
    echo "# OAuth token storage encryption"
    echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"
    echo ""
    echo "# WhatsApp webhook verification (custom token)"
    echo "WHATSAPP_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 32)"
} >> .env

echo "✅ Secrets added to apps/api/.env"
echo ""

# Web Environment Setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Web Environment (apps/web/.env.local)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd ../web

if [ -f .env.local ]; then
    echo "⚠️  apps/web/.env.local already exists"
    read -p "Overwrite with new secrets? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "⏭️  Keeping existing apps/web/.env.local"
        echo ""
    else
        rm .env.local
        cp .env.example .env.local
        echo "✅ Reset apps/web/.env.local from template"
    fi
else
    cp .env.example .env.local
    echo "✅ Created apps/web/.env.local from template"
fi

# Generate NextAuth secret
echo ""
echo "Generating web app secrets..."

{
    echo ""
    echo "# ============================================"
    echo "# Auto-generated secrets ($(date '+%Y-%m-%d %H:%M:%S'))"
    echo "# SECURITY: Never commit these to Git!"
    echo "# ============================================"
    echo ""
    echo "# NextAuth session encryption"
    echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
} >> .env.local

echo "✅ Secrets added to apps/web/.env.local"
echo ""

cd "$PROJECT_ROOT"

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Local Environment Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Created/Updated:"
echo "   - apps/api/.env (with auto-generated secrets)"
echo "   - apps/web/.env.local (with auto-generated secrets)"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Review and update these files:"
echo "   - apps/api/.env"
echo "     • DATABASE_URL (PostgreSQL connection)"
echo "     • REDIS_HOST & REDIS_PORT (if using Redis)"
echo "     • API keys (Mailgun, Xero, etc.)"
echo ""
echo "   - apps/web/.env.local"
echo "     • NEXT_PUBLIC_API_URL (defaults to http://localhost:3000)"
echo "     • NEXTAUTH_URL (defaults to http://localhost:3001)"
echo ""
echo "2. Start required services:"
echo "   # PostgreSQL (Docker)"
echo "   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine"
echo ""
echo "   # Redis (Docker - optional for development)"
echo "   docker run -d -p 6379:6379 redis:alpine"
echo ""
echo "3. Install dependencies:"
echo "   pnpm install"
echo ""
echo "4. Generate Prisma client:"
echo "   pnpm --filter @crechebooks/api prisma:generate"
echo ""
echo "5. Run database migrations:"
echo "   pnpm --filter @crechebooks/api prisma:migrate"
echo ""
echo "6. Start development servers:"
echo "   pnpm dev"
echo ""
echo "🔐 Security Reminder:"
echo "   - NEVER commit .env or .env.local files to Git"
echo "   - These files are already in .gitignore"
echo "   - Store secrets in a password manager"
echo ""
echo "📚 Full documentation:"
echo "   docs/github/SECRETS-SETUP-GUIDE.md"
echo ""
