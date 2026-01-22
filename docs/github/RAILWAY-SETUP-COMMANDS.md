# 🚂 Railway Setup Commands - Quick Reference

**Status**: ✅ GitHub Secrets Configured | ⏳ Railway Pending
**Date**: 2026-01-22

---

## ✅ GitHub Secrets - COMPLETE

Your GitHub repository now has these secrets configured:

```
ENCRYPTION_KEY     ✅ Set on 2026-01-22
JWT_SECRET         ✅ Set on 2026-01-22
RAILWAY_TOKEN      ✅ Set on 2026-01-22
```

These secrets enable:
- ✅ Automated deployment to Railway
- ✅ Secure encryption of sensitive data
- ✅ JWT authentication

---

## 🚂 Railway Setup - Next Steps

### Step 1: Authenticate with Railway

```bash
# Login to Railway (opens browser)
railway login

# Verify authentication
railway whoami
```

**Expected output**: Your Railway account email

---

### Step 2: Link to Your Railway Project

**Option A: Link to existing project**
```bash
# List your projects
railway projects

# Link to existing project
railway link

# Or link by ID
railway link <project-id>
```

**Option B: Create new project**
```bash
# Create and link new project
railway init

# Name it: crechebooks
```

---

### Step 3: Add Required Plugins

**Add PostgreSQL Database:**
```bash
# Add PostgreSQL plugin
railway add

# Select: PostgreSQL
# This auto-creates DATABASE_URL variable
```

**Add Redis (Recommended):**
```bash
# Add Redis plugin
railway add

# Select: Redis
# This auto-creates REDIS_HOST and REDIS_PORT variables
```

---

### Step 4: Set Environment Variables

**Copy and run these commands:**

```bash
# Set encryption keys (CRITICAL - use the generated values)
railway variables set ENCRYPTION_KEY="yYtqyvjkVK/KAd2NJPasX3CF+cDXZGvI41GPCPbkuGg="
railway variables set JWT_SECRET="RKEbQ0j95IyXoJkoyWVuGtcoyB/Z6MA/qlNNglFePBs="
railway variables set NEXTAUTH_SECRET="w+l72nV/3m10kudWWPN2M2TVdjFy5b+5KZGOg98R+7o="
railway variables set XERO_STATE_KEY="DPlKI2mGGcxBPb8D7sRRL3Ml2d1rvRTyNj2e/ii0/4o="
railway variables set TOKEN_ENCRYPTION_KEY="iajtjiGjWStKtOa4OdWVdovfGkS9boT5AHMmJr91icM="

# Set CORS for production (update with your actual domain)
railway variables set CORS_ALLOWED_ORIGINS="https://your-web-app.railway.app"

# Set Node environment
railway variables set NODE_ENV="production"

# Disable dev auth in production
railway variables set DEV_AUTH_ENABLED="false"
```

---

### Step 5: Verify Configuration

```bash
# List all environment variables
railway variables

# Expected variables:
# ✅ DATABASE_URL (from PostgreSQL plugin)
# ✅ REDIS_HOST (from Redis plugin)
# ✅ REDIS_PORT (from Redis plugin)
# ✅ ENCRYPTION_KEY
# ✅ JWT_SECRET
# ✅ NEXTAUTH_SECRET
# ✅ XERO_STATE_KEY
# ✅ TOKEN_ENCRYPTION_KEY
# ✅ CORS_ALLOWED_ORIGINS
# ✅ NODE_ENV
```

---

### Step 6: Deploy to Railway

**Option A: Deploy from CLI**
```bash
# Deploy current code
railway up

# Monitor deployment
railway logs
```

**Option B: Deploy from GitHub (Recommended)**
```bash
# Push to main branch
git checkout main
git merge dev
git push origin main

# GitHub Actions will automatically deploy to Railway
# Monitor: gh run watch
```

---

### Step 7: Run Database Migrations

```bash
# After successful deployment, run migrations
railway run --service api pnpm prisma:migrate

# Or use Prisma push for initial setup
railway run --service api pnpm prisma:push
```

---

## 🔍 Verify Deployment

### Check Application Health

```bash
# Get your Railway URL
railway domain

# Test API health endpoint
curl https://your-api.railway.app/health

# Expected response:
# {"status":"ok","timestamp":"..."}
```

### Check Logs

```bash
# View real-time logs
railway logs --service api

# View web logs
railway logs --service web
```

---

## 📋 Quick Command Reference

| Task | Command |
|------|---------|
| Login to Railway | `railway login` |
| List projects | `railway projects` |
| Link project | `railway link` |
| Add plugin | `railway add` |
| Set variable | `railway variables set KEY="value"` |
| List variables | `railway variables` |
| Deploy | `railway up` |
| View logs | `railway logs` |
| Get domain | `railway domain` |
| Run command | `railway run <command>` |

---

## 🎯 Complete Setup Checklist

### GitHub (✅ Complete)
- [x] RAILWAY_TOKEN configured
- [x] ENCRYPTION_KEY configured
- [x] JWT_SECRET configured

### Railway (⏳ Pending)
- [ ] Authenticate with Railway CLI
- [ ] Link to project
- [ ] Add PostgreSQL plugin
- [ ] Add Redis plugin (recommended)
- [ ] Set all environment variables
- [ ] Deploy application
- [ ] Run database migrations
- [ ] Verify health endpoints
- [ ] Test API functionality

---

## 🚨 Troubleshooting

### Issue: "railway: command not found"

**Install Railway CLI:**
```bash
# macOS/Linux
curl -fsSL https://railway.app/install.sh | sh

# Or with npm
npm install -g @railway/cli

# Verify installation
railway --version
```

### Issue: "No project linked"

**Solution:**
```bash
# Link to existing project
railway link

# Or create new one
railway init
```

### Issue: "Deployment fails - missing DATABASE_URL"

**Solution:**
```bash
# Add PostgreSQL plugin
railway add
# Select: PostgreSQL

# Verify
railway variables | grep DATABASE_URL
```

### Issue: "CORS errors in production"

**Solution:**
```bash
# Update CORS origins with your actual domains
railway variables set CORS_ALLOWED_ORIGINS="https://your-web-app.railway.app,https://api.railway.app"
```

---

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [PostgreSQL Plugin](https://docs.railway.app/databases/postgresql)
- [Redis Plugin](https://docs.railway.app/databases/redis)

---

## 🎉 What's Next?

Once Railway is configured:

1. **Push to GitHub** - Automatic deployment via GitHub Actions
2. **Test CI/CD** - Create a test PR to verify workflows
3. **Monitor Logs** - Use `railway logs` to monitor application
4. **Set up Domain** - Configure custom domain in Railway dashboard
5. **Enable Monitoring** - Set up error tracking (Sentry, etc.)

---

**Status**: Ready for Railway configuration
**Next Step**: Run `railway login` to begin

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-22
