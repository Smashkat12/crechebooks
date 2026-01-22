# 🔐 Secrets & Environment Setup Guide

**Repository**: CrecheBooks (Smashkat12/crechebooks)
**Date**: 2026-01-22
**Status**: Ready for Configuration

---

## 📋 Executive Summary

This guide helps you configure all required secrets and environment variables for:
- ✅ GitHub Actions CI/CD workflows
- ✅ Railway deployment
- ✅ Local development
- ✅ Production environment

**Current Status**: ⚠️ **No secrets configured yet**

---

## 🚨 Critical Secrets (REQUIRED)

These secrets are **REQUIRED** for the application to function:

### 1. **RAILWAY_TOKEN** 🚂
**Purpose**: Deploy to Railway from GitHub Actions
**Required For**: Deployment workflow
**Priority**: 🔴 **CRITICAL**

**How to Get**:
1. Log in to [Railway](https://railway.app)
2. Go to Account Settings
3. Click "Tokens" tab
4. Create new token with name "GitHub Actions"
5. Copy the token (starts with `railway_`)

**Set with**:
```bash
gh secret set RAILWAY_TOKEN --repo Smashkat12/crechebooks
# Paste token when prompted
```

---

### 2. **ENCRYPTION_KEY** 🔐
**Purpose**: Encrypt sensitive data (API tokens, credentials, PII)
**Required For**: API application startup
**Priority**: 🔴 **CRITICAL**

**Generate**:
```bash
# Generate 32-byte random key
openssl rand -base64 32
```

**Set with**:
```bash
# For GitHub (deployment)
gh secret set ENCRYPTION_KEY --repo Smashkat12/crechebooks

# For Railway (after login)
railway variables set ENCRYPTION_KEY="<generated-key>"

# For local development
# Add to apps/api/.env
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> apps/api/.env
```

---

### 3. **DATABASE_URL** 🗄️
**Purpose**: PostgreSQL connection string
**Required For**: API application
**Priority**: 🔴 **CRITICAL**

**Format**:
```
postgresql://user:password@host:5432/database?schema=public
```

**Set with**:
```bash
# Railway auto-provides this - no action needed
# For local development:
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crechebooks?schema=public" >> apps/api/.env
```

---

### 4. **JWT_SECRET** 🔑
**Purpose**: Sign and verify JWT tokens for authentication
**Required For**: API authentication system
**Priority**: 🔴 **CRITICAL**

**Generate**:
```bash
openssl rand -base64 32
```

**Set with**:
```bash
# For GitHub
gh secret set JWT_SECRET --repo Smashkat12/crechebooks

# For Railway
railway variables set JWT_SECRET="<generated-secret>"

# For local development
echo "JWT_SECRET=$(openssl rand -base64 32)" >> apps/api/.env
```

---

### 5. **NEXTAUTH_SECRET** 🎫
**Purpose**: NextAuth.js session encryption (Web app)
**Required For**: Web application authentication
**Priority**: 🔴 **CRITICAL**

**Generate**:
```bash
openssl rand -base64 32
```

**Set with**:
```bash
# For Railway (web service)
railway variables set NEXTAUTH_SECRET="<generated-secret>"

# For local development
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> apps/web/.env.local
```

---

## ⚙️ Important Secrets (Recommended)

### 6. **REDIS_HOST** & **REDIS_PORT** 🔴
**Purpose**: CSRF token storage, caching, sessions
**Required For**: Distributed API instances
**Priority**: 🟡 **HIGH**

**Railway Setup**:
```bash
# Add Redis plugin in Railway dashboard
# Railway auto-creates REDIS_HOST and REDIS_PORT variables
```

**Local Development**:
```bash
# Install Redis locally or use Docker
docker run -d -p 6379:6379 redis:alpine

# Add to apps/api/.env
echo "REDIS_HOST=localhost" >> apps/api/.env
echo "REDIS_PORT=6379" >> apps/api/.env
```

---

### 7. **XERO_STATE_KEY** 🧮
**Purpose**: OAuth state encryption for Xero integration
**Required For**: Xero accounting integration
**Priority**: 🟡 **HIGH** (if using Xero)

**Generate**:
```bash
openssl rand -base64 32
```

**Set with**:
```bash
railway variables set XERO_STATE_KEY="<generated-key>"
echo "XERO_STATE_KEY=$(openssl rand -base64 32)" >> apps/api/.env
```

---

### 8. **TOKEN_ENCRYPTION_KEY** 🔐
**Purpose**: Encrypt stored OAuth access tokens
**Required For**: Third-party integrations (Xero, etc.)
**Priority**: 🟡 **HIGH**

**Generate**:
```bash
openssl rand -base64 32
```

**Set with**:
```bash
railway variables set TOKEN_ENCRYPTION_KEY="<generated-key>"
echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> apps/api/.env
```

---

## 📧 Email & Notifications

### 9. **MAILGUN_API_KEY** & **MAILGUN_DOMAIN** 📨
**Purpose**: Send invoices, notifications, reports
**Required For**: Email functionality
**Priority**: 🟡 **MEDIUM**

**How to Get**:
1. Sign up at [Mailgun](https://app.mailgun.com)
2. Verify email and get API key
3. Use sandbox domain for testing

**Set with**:
```bash
railway variables set MAILGUN_API_KEY="<your-api-key>"
railway variables set MAILGUN_DOMAIN="sandbox123.mailgun.org"

# Local
echo "MAILGUN_API_KEY=your-key" >> apps/api/.env
echo "MAILGUN_DOMAIN=sandbox123.mailgun.org" >> apps/api/.env
```

---

## 🔗 Integration Secrets (Optional)

### Xero Accounting
```bash
railway variables set XERO_CLIENT_ID="<client-id>"
railway variables set XERO_CLIENT_SECRET="<client-secret>"
railway variables set XERO_REDIRECT_URI="https://your-api.railway.app/api/v1/xero/callback"
```

### WhatsApp Messaging (Twilio)
```bash
railway variables set TWILIO_ACCOUNT_SID="<account-sid>"
railway variables set TWILIO_AUTH_TOKEN="<auth-token>"
railway variables set TWILIO_WHATSAPP_NUMBER="+14155238886"
```

### SMS (Africa's Talking)
```bash
railway variables set AFRICASTALKING_API_KEY="<api-key>"
railway variables set AFRICASTALKING_USERNAME="sandbox"
```

---

## 🚀 Quick Setup Scripts

### Script 1: Generate All Secrets

**File**: `scripts/generate-secrets.sh`

```bash
#!/bin/bash
# Generate all required cryptographic secrets

echo "🔐 Generating CrecheBooks Secrets..."
echo ""

echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "XERO_STATE_KEY=$(openssl rand -base64 32)"
echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"

echo ""
echo "✅ Secrets generated! Copy these to your .env files and GitHub/Railway"
```

### Script 2: Setup GitHub Secrets

**File**: `scripts/setup-github-secrets.sh`

```bash
#!/bin/bash
# Interactive setup for GitHub secrets

echo "🔐 CrecheBooks GitHub Secrets Setup"
echo "===================================="
echo ""

# RAILWAY_TOKEN
echo "1. RAILWAY_TOKEN"
echo "   Get from: https://railway.app/account/tokens"
read -sp "   Enter Railway token: " RAILWAY_TOKEN
echo ""
gh secret set RAILWAY_TOKEN --body "$RAILWAY_TOKEN" --repo Smashkat12/crechebooks
echo "   ✅ RAILWAY_TOKEN set"
echo ""

# ENCRYPTION_KEY
echo "2. ENCRYPTION_KEY"
ENCRYPTION_KEY=$(openssl rand -base64 32)
gh secret set ENCRYPTION_KEY --body "$ENCRYPTION_KEY" --repo Smashkat12/crechebooks
echo "   ✅ ENCRYPTION_KEY generated and set"
echo ""

# JWT_SECRET
echo "3. JWT_SECRET"
JWT_SECRET=$(openssl rand -base64 32)
gh secret set JWT_SECRET --body "$JWT_SECRET" --repo Smashkat12/crechebooks
echo "   ✅ JWT_SECRET generated and set"
echo ""

echo "🎉 GitHub secrets configured successfully!"
echo ""
echo "⚠️  Remember to also configure these in Railway:"
echo "   - ENCRYPTION_KEY"
echo "   - JWT_SECRET"
echo "   - NEXTAUTH_SECRET"
```

### Script 3: Setup Local Environment

**File**: `scripts/setup-local-env.sh`

```bash
#!/bin/bash
# Setup local development environment

echo "🔧 CrecheBooks Local Environment Setup"
echo "======================================"
echo ""

# API environment
echo "Setting up API environment..."
cd apps/api

if [ ! -f .env ]; then
  cp ../../.env.example .env
  echo "✅ Created apps/api/.env from template"
else
  echo "⚠️  apps/api/.env already exists, skipping"
fi

# Generate secrets
echo ""
echo "Generating secrets for API..."
{
  echo ""
  echo "# Auto-generated secrets ($(date))"
  echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
  echo "JWT_SECRET=$(openssl rand -base64 32)"
  echo "XERO_STATE_KEY=$(openssl rand -base64 32)"
  echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"
} >> .env

echo "✅ Secrets added to apps/api/.env"

# Web environment
echo ""
echo "Setting up Web environment..."
cd ../web

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✅ Created apps/web/.env.local from template"
else
  echo "⚠️  apps/web/.env.local already exists, skipping"
fi

# Generate NextAuth secret
echo ""
echo "Generating secrets for Web..."
{
  echo ""
  echo "# Auto-generated secrets ($(date))"
  echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
} >> .env.local

echo "✅ Secrets added to apps/web/.env.local"

cd ../..

echo ""
echo "🎉 Local environment setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Update DATABASE_URL in apps/api/.env"
echo "   2. Configure any API keys you need (Mailgun, Xero, etc.)"
echo "   3. Run: pnpm install"
echo "   4. Run: pnpm dev"
```

---

## 📋 Setup Checklist

### Phase 1: Local Development

- [ ] Run `scripts/setup-local-env.sh`
- [ ] Start PostgreSQL database
- [ ] Start Redis (optional for development)
- [ ] Update DATABASE_URL in apps/api/.env
- [ ] Test with `pnpm dev`

### Phase 2: GitHub Secrets

- [ ] Get Railway token
- [ ] Run `scripts/setup-github-secrets.sh`
- [ ] Verify: `gh secret list --repo Smashkat12/crechebooks`

### Phase 3: Railway Configuration

- [ ] Log in to Railway: `railway login`
- [ ] Link project: `railway link`
- [ ] Add PostgreSQL plugin
- [ ] Add Redis plugin
- [ ] Set environment variables (see commands below)
- [ ] Test deployment

### Phase 4: Optional Integrations

- [ ] Mailgun (email)
- [ ] Xero (accounting)
- [ ] Twilio (WhatsApp/SMS)
- [ ] Africa's Talking (SMS)

---

## 🚂 Railway Setup Commands

### Link to Project

```bash
# Authenticate
railway login

# Link to your project
railway link

# Or create new project
railway init
```

### Set Required Variables

```bash
# Critical secrets
railway variables set ENCRYPTION_KEY="<generated-key>"
railway variables set JWT_SECRET="<generated-secret>"
railway variables set NEXTAUTH_SECRET="<generated-secret>"

# Database (auto-created by PostgreSQL plugin)
# railway link creates DATABASE_URL automatically

# Redis (auto-created by Redis plugin)
# railway link creates REDIS_HOST and REDIS_PORT automatically

# CORS (for production)
railway variables set CORS_ALLOWED_ORIGINS="https://your-web-app.railway.app"

# Optional: Dev auth (NOT recommended for production)
railway variables set DEV_AUTH_ENABLED="false"
```

### Verify Configuration

```bash
# List all variables
railway variables

# Test deployment
railway up
```

---

## 🔍 Verification Steps

### 1. Verify GitHub Secrets

```bash
# List configured secrets
gh secret list --repo Smashkat12/crechebooks

# Expected output:
# RAILWAY_TOKEN    Updated <date>
# ENCRYPTION_KEY   Updated <date>
# JWT_SECRET       Updated <date>
```

### 2. Verify Railway Variables

```bash
# List all variables
railway variables

# Should see:
# DATABASE_URL (from PostgreSQL plugin)
# REDIS_HOST (from Redis plugin)
# REDIS_PORT (from Redis plugin)
# ENCRYPTION_KEY
# JWT_SECRET
# NEXTAUTH_SECRET
# ... and others
```

### 3. Test CI/CD Pipeline

```bash
# Create test branch
git checkout -b test/ci-verification

# Make small change
echo "# CI Test" >> README.md

# Commit and push
git add README.md
git commit -m "test(ci): verify GitHub Actions workflow"
git push origin test/ci-verification

# Monitor workflow
gh run list
gh run watch
```

### 4. Test Deployment

```bash
# Deploy to Railway
railway up

# Check logs
railway logs

# Test API health
curl https://your-api.railway.app/health
```

---

## 🐛 Troubleshooting

### Issue: "RAILWAY_TOKEN not found"

**Solution**:
```bash
# Verify secret exists
gh secret list --repo Smashkat12/crechebooks

# If missing, set it
gh secret set RAILWAY_TOKEN --repo Smashkat12/crechebooks
```

### Issue: "Application fails to start - ENCRYPTION_KEY required"

**Solution**:
```bash
# Generate and set encryption key
railway variables set ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

### Issue: "DATABASE_URL not found"

**Solution**:
```bash
# Add PostgreSQL plugin in Railway dashboard
# Or manually set:
railway variables set DATABASE_URL="postgresql://..."
```

### Issue: "Redis connection failed"

**Solution**:
```bash
# Add Redis plugin in Railway dashboard
# Verify variables:
railway variables | grep REDIS
```

### Issue: "CORS errors in production"

**Solution**:
```bash
# Set allowed origins
railway variables set CORS_ALLOWED_ORIGINS="https://your-web-app.railway.app,https://www.crechebooks.co.za"
```

---

## 📚 Environment Variables Reference

### Complete List of Environment Variables

See detailed documentation in:
- Main: `.env.example`
- API: `apps/api/.env.example` (if exists)
- Web: `apps/web/.env.example`

### Priority Levels

| Priority | Description | Examples |
|----------|-------------|----------|
| 🔴 **CRITICAL** | App won't start without these | ENCRYPTION_KEY, JWT_SECRET, DATABASE_URL |
| 🟡 **HIGH** | Core features won't work | REDIS_HOST, MAILGUN_API_KEY |
| 🟢 **MEDIUM** | Optional features | XERO_CLIENT_ID, TWILIO_* |
| ⚪ **LOW** | Development only | DEV_AUTH_ENABLED |

---

## 🔐 Security Best Practices

### DO ✅

1. **Rotate secrets regularly** (every 90 days)
2. **Use different secrets for dev/staging/prod**
3. **Never commit secrets to Git**
4. **Use environment-specific `.env` files**
5. **Keep secrets in password manager**
6. **Limit secret access to necessary people**
7. **Audit secret usage periodically**

### DON'T ❌

1. **Never hardcode secrets in source code**
2. **Never commit `.env` files to Git**
3. **Never share secrets via email/chat**
4. **Never use weak secrets (use 32+ random chars)**
5. **Never reuse secrets across environments**
6. **Never store secrets in plain text locally**

---

## 📞 Support & Resources

### Documentation
- [Railway Docs](https://docs.railway.app/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Mailgun Setup](https://documentation.mailgun.com/)

### Internal Docs
- [Environment Variables](./.env.example)
- [Deployment Guide](./docs/github/deploy.md)
- [Security Policy](./.github/SECURITY.md)

### Get Help
- Create GitHub discussion
- Contact development team
- Check Railway community

---

## ✅ Final Checklist

Before going live, ensure:

- [ ] All critical secrets configured (GitHub + Railway)
- [ ] Database migrations completed
- [ ] Redis configured and accessible
- [ ] CORS configured for production domains
- [ ] Email service configured (Mailgun)
- [ ] CI/CD pipeline tested and passing
- [ ] Health endpoints responding
- [ ] Logs accessible and monitoring set up
- [ ] Secrets documented in password manager
- [ ] Team has access to necessary credentials

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-22
**Maintained By**: CrecheBooks Development Team

**Next**: Run `scripts/setup-local-env.sh` to get started!
