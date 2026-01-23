# Create Custom API in Auth0 - Quick Guide

## Why You Need This

Your Railway environment variable `AUTH0_AUDIENCE` is set to `https://api.elleelephant.co.za`, but you need to create a matching API in Auth0 for this to work.

## Steps (2 minutes)

### 1. Go to Auth0 Dashboard
https://manage.auth0.com

### 2. Navigate to APIs
- Click **Applications** in left sidebar
- Click **APIs**

### 3. Create New API
Click the **"Create API"** button

### 4. Fill in Details
```
Name: CrecheBooks API
Identifier: https://api.elleelephant.co.za
Signing Algorithm: RS256 (default)
```

⚠️ **Important**: The Identifier MUST be exactly `https://api.elleelephant.co.za` (matches your AUTH0_AUDIENCE)

### 5. Click "Create"

That's it! The API is now created.

## What This Does

- Defines your API as an audience for JWT tokens
- Tokens issued by Auth0 will include `"aud": "https://api.elleelephant.co.za"`
- Your backend validates this audience matches your API

## Verification

After creating the API, your Auth0 configuration should look like:

**Environment Variables** (Railway):
```bash
AUTH0_DOMAIN=elleelephant.eu.auth0.com
AUTH0_CLIENT_ID=8ymxMlVjAzGDTs2noZwPuKvvNUW1rJgC
AUTH0_CLIENT_SECRET=<secret>
AUTH0_AUDIENCE=https://api.elleelephant.co.za  ✅ Matches API Identifier
```

**Auth0 Dashboard**:
- Application: CrecheBooks Production ✅
- API: CrecheBooks API with identifier `https://api.elleelephant.co.za` ✅

## Next Steps

After creating the API:
1. Wait for Railway deployment to complete (~2-3 minutes)
2. Test login at https://app.elleelephant.co.za
3. Verify admin dashboard shows data

## Common Mistakes

❌ Using Auth0 Management API audience: `https://elleelephant.eu.auth0.com/api/v2/`
✅ Using custom API audience: `https://api.elleelephant.co.za`

❌ Identifier doesn't match AUTH0_AUDIENCE env var
✅ Identifier exactly matches: `https://api.elleelephant.co.za`
