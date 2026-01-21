# CrecheBooks Deployment Guide

## Domain: elleelephant.co.za

This guide covers deploying CrecheBooks to Railway with custom domain configuration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     elleelephant.co.za                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   app.elleelephant.co.za  ──→  Railway Web Service          │
│   api.elleelephant.co.za  ──→  Railway API Service          │
│                                                              │
│   ┌──────────────┐    ┌──────────────┐                      │
│   │   Next.js    │───▶│   NestJS     │                      │
│   │   Frontend   │    │   Backend    │                      │
│   └──────────────┘    └──────┬───────┘                      │
│                              │                               │
│                    ┌─────────┴─────────┐                    │
│                    │                   │                    │
│              ┌─────▼─────┐      ┌──────▼─────┐              │
│              │ PostgreSQL │      │   Redis    │              │
│              └───────────┘      └────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Railway Project Setup

### 1.1 Create Railway Project
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init
```

### 1.2 Add Database Plugins
In Railway Dashboard (https://railway.app):
1. Open your project
2. Click **"+ New"** → **"Database"** → **"PostgreSQL"**
3. Click **"+ New"** → **"Database"** → **"Redis"**

### 1.3 Create Services
Create two services from the monorepo:

**API Service:**
1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. Set **Root Directory**: `apps/api`
4. Railway will detect the Dockerfile

**Web Service:**
1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. Set **Root Directory**: `apps/web`
4. Railway will detect the Dockerfile

---

## Step 2: Environment Variables

### 2.1 API Service Variables

In Railway Dashboard → API Service → Variables:

```bash
# Core
NODE_ENV=production
PORT=3000

# Security (generate these!)
ENCRYPTION_KEY=<run: openssl rand -base64 32>
JWT_SECRET=<run: openssl rand -base64 32>
JWT_EXPIRATION=86400

# Database (use Railway variable references)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (use Railway variable references)
REDIS_HOST=${{Redis.REDIS_HOST}}
REDIS_PORT=${{Redis.REDIS_PORT}}
REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}

# CORS - Your custom domain
CORS_ALLOWED_ORIGINS=https://app.elleelephant.co.za,https://elleelephant.co.za,https://www.elleelephant.co.za

# Add other integrations as needed (Mailgun, WhatsApp, etc.)
```

### 2.2 Web Service Variables

In Railway Dashboard → Web Service → Variables:

```bash
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.elleelephant.co.za
```

---

## Step 3: Custom Domain Configuration

### 3.1 Add Domains in Railway

**For API Service:**
1. Go to API Service → Settings → Domains
2. Click **"+ Custom Domain"**
3. Enter: `api.elleelephant.co.za`
4. Railway will show you a CNAME target (e.g., `api-production-xxxx.up.railway.app`)

**For Web Service:**
1. Go to Web Service → Settings → Domains
2. Click **"+ Custom Domain"**
3. Enter: `app.elleelephant.co.za`
4. Railway will show you a CNAME target (e.g., `web-production-xxxx.up.railway.app`)

### 3.2 Configure DNS at Afrihost

Log into your Afrihost control panel and add these DNS records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | api | `<railway-api-target>.up.railway.app` | 3600 |
| CNAME | app | `<railway-web-target>.up.railway.app` | 3600 |

**Optional - Redirect root domain to app:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 3600 |
| CNAME | www | `app.elleelephant.co.za` | 3600 |

> **Note:** The A record IP (76.76.21.21) is Railway's redirect service. It will redirect `elleelephant.co.za` to your app subdomain.

### 3.3 SSL Certificates

Railway automatically provisions SSL certificates via Let's Encrypt once DNS is configured. This usually takes 5-15 minutes after DNS propagation.

---

## Step 4: Deploy

### Option A: Automatic (GitHub Integration)
If connected to GitHub, Railway auto-deploys on push to main branch.

### Option B: Manual CLI
```bash
# Deploy API
cd apps/api
railway up --service api

# Deploy Web
cd ../web
railway up --service web
```

### Option C: Interactive Script
```bash
pnpm deploy
```

---

## Step 5: Verify Deployment

### 5.1 Check Health Endpoints
```bash
# API Health
curl https://api.elleelephant.co.za/health

# API Readiness (includes DB & Redis)
curl https://api.elleelephant.co.za/health/ready
```

### 5.2 Check Web App
Open https://app.elleelephant.co.za in your browser.

### 5.3 Check DNS Propagation
```bash
# Check DNS records
dig api.elleelephant.co.za
dig app.elleelephant.co.za

# Or use online tool
# https://dnschecker.org
```

---

## Troubleshooting

### DNS Not Resolving
- DNS propagation can take up to 48 hours (usually 15 min - 2 hours)
- Verify records in Afrihost control panel
- Use `dig` or dnschecker.org to verify

### SSL Certificate Not Working
- Ensure DNS is pointing to Railway
- Wait 15 minutes after DNS configuration
- Check Railway dashboard for certificate status

### CORS Errors
- Verify `CORS_ALLOWED_ORIGINS` includes your domain with `https://`
- No trailing slashes in origins
- Restart API service after changing variables

### Database Connection Errors
- Ensure `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` syntax
- Check PostgreSQL service is running in Railway

### Redis Connection Errors
- Ensure Redis variables use Railway references
- Check Redis service is running

---

## Estimated Monthly Costs

| Service | Estimated Cost |
|---------|----------------|
| API (NestJS) | $5-10 |
| Web (Next.js) | $5-10 |
| PostgreSQL | $5-7 |
| Redis | $0-5 |
| **Total** | **$15-32/month** |

*Costs are usage-based. Actual costs depend on traffic and database size.*

---

## Quick Reference

| URL | Purpose |
|-----|---------|
| https://app.elleelephant.co.za | Web Application |
| https://api.elleelephant.co.za | API Endpoint |
| https://api.elleelephant.co.za/health | Health Check |
| https://api.elleelephant.co.za/api/docs | API Documentation (Swagger) |

---

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Afrihost Support: https://afrihost.com/support
