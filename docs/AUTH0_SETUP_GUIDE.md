# Auth0 Setup Guide for CrecheBooks Production

This guide walks you through setting up Auth0 authentication for the CrecheBooks production environment.

## Overview

CrecheBooks uses Auth0 for production authentication with OAuth2/OIDC flow. The application supports:
- Multi-tenant user management
- Role-based access control (SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, VIEWER)
- JWT tokens with HttpOnly cookies
- Refresh token rotation

## Step 1: Create Auth0 Account and Tenant

1. **Go to Auth0**: https://auth0.com/
2. **Sign up** for a free account (if you don't have one)
3. **Create a tenant**:
   - Tenant name: `crechebooks` (or your preferred name)
   - Region: Choose closest to your users (e.g., EU, US)
   - Environment: Production

## Step 2: Create Auth0 Application

1. **Navigate to Applications** → **Applications** in Auth0 dashboard
2. **Click "Create Application"**
3. **Application Settings**:
   - Name: `CrecheBooks Production`
   - Application Type: **Regular Web Application**
   - Technology: Node.js / Next.js
4. **Click "Create"**

## Step 3: Configure Application Settings

In the Application settings page:

### Basic Information

Copy these for later:
- **Domain**: `your-tenant.auth0.com` (or `your-tenant.eu.auth0.com`)
- **Client ID**: `abc123...`
- **Client Secret**: `xyz789...` (click "Show" to reveal)

### Application URIs

Configure these URLs (replace with your actual domains):

**Allowed Callback URLs**:
```
https://app.elleelephant.co.za/api/auth/callback,
https://api.elleelephant.co.za/api/v1/auth/callback
```

**Allowed Logout URLs**:
```
https://app.elleelephant.co.za,
https://app.elleelephant.co.za/login
```

**Allowed Web Origins**:
```
https://app.elleelephant.co.za
```

**Allowed Origins (CORS)**:
```
https://app.elleelephant.co.za,
https://api.elleelephant.co.za
```

### Advanced Settings

1. **Grant Types**: Ensure these are enabled:
   - ✅ Authorization Code
   - ✅ Refresh Token
   - ✅ Implicit (optional, for legacy flows)

2. **Refresh Token Rotation**: Enable
   - Rotation: Enabled
   - Reuse Interval: 0 seconds
   - Absolute Lifetime: 2592000 seconds (30 days)

3. **Click "Save Changes"**

## Step 4: Create Auth0 API (Audience)

This defines your API identifier:

1. **Navigate to Applications** → **APIs**
2. **Click "Create API"**
3. **API Settings**:
   - Name: `CrecheBooks API`
   - Identifier: `https://api.elleelephant.co.za` (use your API domain)
   - Signing Algorithm: **RS256**
4. **Click "Create"**

Copy the **Identifier** - this is your `AUTH0_AUDIENCE`

## Step 5: Configure Railway Environment Variables

### API Service (apps/api)

Add/update these environment variables in Railway:

```bash
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=<your-client-id>
AUTH0_CLIENT_SECRET=<your-client-secret>
AUTH0_AUDIENCE=https://api.elleelephant.co.za

# Authentication Provider
AUTH_PROVIDER=auth0

# Disable Dev Auth
DEV_AUTH_ENABLED=false

# Keep JWT secret for signing tokens
JWT_SECRET=<your-secure-secret-min-32-chars>
JWT_EXPIRATION=28800  # 8 hours in seconds
```

### Web Service (apps/web)

Add/update these environment variables in Railway:

```bash
# Auth0 Configuration
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=<your-client-id>

# Disable Dev Login Form
NEXT_PUBLIC_ENABLE_DEV_LOGIN=false

# API Configuration (should already be set)
NEXT_PUBLIC_API_URL=https://api.elleelephant.co.za
NEXT_PUBLIC_SITE_URL=https://app.elleelephant.co.za
```

## Step 6: Create Super Admin User in Auth0

### Option A: Manual User Creation (Recommended)

1. **Navigate to User Management** → **Users** in Auth0 dashboard
2. **Click "Create User"**
3. **User Details**:
   - Email: `katlego@elleelephant.co.za`
   - Password: Set a secure password (or send password reset email)
   - Connection: Username-Password-Authentication
4. **Click "Create"**
5. **Copy the User ID** (looks like `auth0|123456789`)

### Option B: Database Connection Setup

1. **Navigate to Authentication** → **Database** → **Username-Password-Authentication**
2. **Settings**:
   - Disable Sign Ups: ❌ (allow new signups) or ✅ (restrict to invited users)
   - Require Username: Optional
   - Password Policy: Strong (recommended)

## Step 7: Update Super Admin Auth0 ID in Database

After creating the Auth0 user, update the database record:

```bash
# Connect to Railway PostgreSQL
railway run --service api npx prisma db execute --stdin <<< "
UPDATE users
SET auth0_id = 'auth0|123456789'  -- Replace with actual Auth0 User ID
WHERE email = 'katlego@elleelephant.co.za';
"
```

OR run this script:

```bash
railway run --service api npx tsx scripts/update-super-admin-auth0.ts
```

## Step 8: Test Authentication Flow

### Test Login

1. **Navigate to**: https://app.elleelephant.co.za
2. **Click "Sign In"** - should redirect to Auth0 login page
3. **Log in** with super admin credentials:
   - Email: `katlego@elleelephant.co.za`
   - Password: (the one you set in Auth0)
4. **Should redirect back** to the dashboard

### Test Admin Endpoints

After logging in, test the admin endpoints:

```bash
# Get your JWT token from browser cookies or localStorage
# Then test:

curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.elleelephant.co.za/api/v1/admin/contact-submissions

curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.elleelephant.co.za/api/v1/admin/demo-requests
```

### Test Admin Dashboard

1. **Navigate to**: https://app.elleelephant.co.za/admin
2. **Should see**:
   - Contact form submissions
   - Demo requests
   - Summary statistics

## Step 9: Additional Security Configuration

### Auth0 Rules/Actions (Optional)

Create a custom action to add user metadata:

1. **Navigate to Actions** → **Flows** → **Login**
2. **Click "+"** to add custom action
3. **Add user roles to token**:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://crechebooks.co.za';

  // Add custom claims to token
  if (event.authorization) {
    api.idToken.setCustomClaim(`${namespace}/role`, event.user.app_metadata?.role);
    api.idToken.setCustomClaim(`${namespace}/tenant_id`, event.user.app_metadata?.tenant_id);
  }
};
```

### Rate Limiting

Auth0 automatically provides:
- Brute force protection
- Breached password detection
- Bot detection

### MFA (Multi-Factor Authentication)

Enable MFA for admin users:

1. **Navigate to Security** → **Multi-factor Auth**
2. **Enable** desired factors (SMS, Authenticator App, etc.)
3. **Set policy**: For admin roles only

## Troubleshooting

### Common Issues

**"Auth0 not configured" error**:
- Check all environment variables are set correctly in Railway
- Verify domain doesn't include `https://` prefix
- Redeploy the service after updating env vars

**"Invalid callback URL" error**:
- Verify callback URLs in Auth0 match exactly
- Check for trailing slashes
- Ensure both http/https protocols are correct

**"Unauthorized" on admin endpoints**:
- Check JWT token is valid
- Verify user has SUPER_ADMIN role in database
- Check auth0_id matches Auth0 User ID

**User can't log in**:
- Verify user exists in Auth0
- Check password is correct
- Ensure database record has correct auth0_id

### Logs and Debugging

**Auth0 Logs**:
- Navigate to **Monitoring** → **Logs** in Auth0 dashboard
- Check for authentication attempts and errors

**Railway API Logs**:
```bash
railway logs --service api | grep -i "auth\|jwt"
```

**Railway Web Logs**:
```bash
railway logs --service web | grep -i "auth\|login"
```

## Security Checklist

- [ ] Auth0 tenant created in production environment
- [ ] Client Secret is securely stored (never commit to git)
- [ ] Callback URLs are HTTPS only
- [ ] CORS is configured correctly
- [ ] Dev auth is disabled in production (`DEV_AUTH_ENABLED=false`)
- [ ] Super admin user created with strong password
- [ ] MFA enabled for admin accounts (optional but recommended)
- [ ] Auth0 logs are monitored regularly

## Next Steps

1. **Create additional users** in Auth0 as needed
2. **Set up email templates** in Auth0 (welcome, password reset, etc.)
3. **Configure social connections** (Google, Microsoft) if desired
4. **Set up monitoring** and alerts for failed login attempts
5. **Document login flow** for your team

## Resources

- Auth0 Documentation: https://auth0.com/docs
- Auth0 React SDK: https://auth0.com/docs/libraries/auth0-react
- Auth0 Management API: https://auth0.com/docs/api/management/v2
- CrecheBooks Auth Service: `/apps/api/src/api/auth/auth.service.ts`
