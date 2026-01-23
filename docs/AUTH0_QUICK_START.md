# Auth0 Quick Start - CrecheBooks

Quick reference for setting up Auth0 authentication.

## 📋 Prerequisites

- Auth0 account (sign up at https://auth0.com)
- Access to Railway dashboard
- Super admin email: `katlego@elleelephant.co.za`

## 🚀 Quick Setup (30 minutes)

### Step 1: Auth0 Configuration (10 min)

1. **Create Auth0 Application**
   - Type: Regular Web Application
   - Name: CrecheBooks Production

2. **Configure URLs**
   ```
   Callback: https://app.elleelephant.co.za/api/auth/callback
   Logout: https://app.elleelephant.co.za
   Web Origins: https://app.elleelephant.co.za
   CORS: https://app.elleelephant.co.za, https://api.elleelephant.co.za
   ```

3. **Create Auth0 API**
   - Name: CrecheBooks API
   - Identifier: `https://api.elleelephant.co.za`
   - Algorithm: RS256

4. **Copy Credentials**
   - Domain: `your-tenant.auth0.com`
   - Client ID: `abc123...`
   - Client Secret: `xyz789...`
   - API Identifier: `https://api.elleelephant.co.za`

### Step 2: Railway Configuration (5 min)

**API Service Environment Variables:**
```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>
AUTH0_AUDIENCE=https://api.elleelephant.co.za
AUTH_PROVIDER=auth0
DEV_AUTH_ENABLED=false
```

**Web Service Environment Variables:**
```bash
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=<client-id>
NEXT_PUBLIC_ENABLE_DEV_LOGIN=false
```

### Step 3: Create Super Admin User (10 min)

1. **In Auth0 Dashboard:**
   - Navigate to User Management → Users
   - Click "Create User"
   - Email: `katlego@elleelephant.co.za`
   - Set password (or send reset email)
   - **Copy the User ID** (e.g., `auth0|123456789`)

2. **Update Database:**
   ```bash
   SUPER_ADMIN_AUTH0_ID=auth0|123456789 \
   railway run --service api npm run update-super-admin-auth0
   ```

### Step 4: Test (5 min)

1. **Test Login:**
   - Go to https://app.elleelephant.co.za
   - Click "Sign In"
   - Log in with Auth0 credentials

2. **Test Admin Dashboard:**
   - Navigate to https://app.elleelephant.co.za/admin
   - Verify contact submissions and demo requests appear

3. **Test API Endpoints:**
   ```bash
   # Get JWT token from browser cookies, then:
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.elleelephant.co.za/api/v1/admin/contact-submissions
   ```

## ⚠️ Important Notes

- **Never commit** Auth0 credentials to git
- **Disable dev-auth** in production (`DEV_AUTH_ENABLED=false`)
- **Use HTTPS only** for callback URLs
- **Super Admin Role**: Only for platform administration
- **MFA**: Consider enabling for admin accounts

## 🔧 Useful Commands

```bash
# Create super admin (already done via migration script)
railway run --service api npm run create-super-admin

# Update super admin Auth0 ID
SUPER_ADMIN_AUTH0_ID=auth0|123 railway run --service api npm run update-super-admin-auth0

# View Railway logs
railway logs --service api
railway logs --service web

# Check environment variables
railway variables
```

## 🐛 Troubleshooting

**"Invalid callback URL"**
- Check URLs in Auth0 match exactly
- Ensure HTTPS is used
- No trailing slashes

**"Unauthorized" on admin endpoints**
- Verify user has SUPER_ADMIN role in database
- Check auth0_id matches Auth0 User ID
- Ensure JWT token is valid

**Can't log in**
- Verify user exists in Auth0
- Check password
- Look at Auth0 logs (Monitoring → Logs)

## 📚 Full Documentation

For detailed setup instructions, see:
- [AUTH0_SETUP_GUIDE.md](./AUTH0_SETUP_GUIDE.md)

## 🔗 Resources

- Auth0 Dashboard: https://manage.auth0.com
- Auth0 Docs: https://auth0.com/docs
- Railway Dashboard: https://railway.app
