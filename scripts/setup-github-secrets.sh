#!/bin/bash
# Interactive setup for GitHub secrets
# Usage: ./scripts/setup-github-secrets.sh

set -e

REPO="Smashkat12/crechebooks"

echo "🔐 CrecheBooks GitHub Secrets Setup"
echo "===================================="
echo ""
echo "This script will configure GitHub secrets for:"
echo "  - Repository: $REPO"
echo "  - Workflows: CI/CD, Deployment"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# 1. RAILWAY_TOKEN
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. RAILWAY_TOKEN (Required for deployment)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "How to get:"
echo "  1. Go to: https://railway.app/account/tokens"
echo "  2. Click 'Create Token'"
echo "  3. Name it: 'GitHub Actions'"
echo "  4. Copy the token (starts with 'railway_')"
echo ""
read -sp "Enter RAILWAY_TOKEN (or press Enter to skip): " RAILWAY_TOKEN
echo ""

if [ -n "$RAILWAY_TOKEN" ]; then
    gh secret set RAILWAY_TOKEN --body "$RAILWAY_TOKEN" --repo "$REPO"
    echo "✅ RAILWAY_TOKEN set"
else
    echo "⏭️  Skipped RAILWAY_TOKEN"
fi
echo ""

# 2. ENCRYPTION_KEY
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. ENCRYPTION_KEY (Auto-generated)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Generate ENCRYPTION_KEY automatically? (Y/n): " confirm
confirm=${confirm:-Y}

if [[ $confirm =~ ^[Yy]$ ]]; then
    ENCRYPTION_KEY=$(openssl rand -base64 32)
    gh secret set ENCRYPTION_KEY --body "$ENCRYPTION_KEY" --repo "$REPO"
    echo "✅ ENCRYPTION_KEY generated and set"
    echo "📋 Value: $ENCRYPTION_KEY"
    echo "⚠️  Save this in your password manager!"
else
    echo "⏭️  Skipped ENCRYPTION_KEY"
fi
echo ""

# 3. JWT_SECRET
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. JWT_SECRET (Auto-generated)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Generate JWT_SECRET automatically? (Y/n): " confirm
confirm=${confirm:-Y}

if [[ $confirm =~ ^[Yy]$ ]]; then
    JWT_SECRET=$(openssl rand -base64 32)
    gh secret set JWT_SECRET --body "$JWT_SECRET" --repo "$REPO"
    echo "✅ JWT_SECRET generated and set"
    echo "📋 Value: $JWT_SECRET"
    echo "⚠️  Save this in your password manager!"
else
    echo "⏭️  Skipped JWT_SECRET"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Setup Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Configured GitHub secrets:"
gh secret list --repo "$REPO"
echo ""

echo "🎉 GitHub secrets setup complete!"
echo ""
echo "📝 Important Next Steps:"
echo ""
echo "1. Configure these same secrets in Railway:"
echo "   railway variables set ENCRYPTION_KEY=\"<value>\""
echo "   railway variables set JWT_SECRET=\"<value>\""
echo ""
echo "2. Add additional secrets in Railway:"
echo "   - NEXTAUTH_SECRET (for web app)"
echo "   - DATABASE_URL (auto-created by PostgreSQL plugin)"
echo "   - REDIS_HOST & REDIS_PORT (auto-created by Redis plugin)"
echo ""
echo "3. Test the CI/CD pipeline:"
echo "   - Create a test PR"
echo "   - Monitor: gh run list"
echo ""
echo "📚 Full guide: docs/github/SECRETS-SETUP-GUIDE.md"
echo ""
