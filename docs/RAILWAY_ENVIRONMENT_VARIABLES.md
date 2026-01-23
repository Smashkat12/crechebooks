# Railway Environment Variables

This document lists all environment variables that need to be configured in Railway for the CrecheBooks application.

## Backend API Service (`apps/api`)

### Required Variables

#### Database
```
DATABASE_URL=postgresql://user:password@host:port/database
```
*Note: This is automatically provided by Railway when you link a PostgreSQL database.*

#### JWT Configuration
```
JWT_SECRET=<generate-a-secure-random-string>
JWT_EXPIRES_IN=7d
```

#### Email Configuration (SMTP)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-app-password
SMTP_FROM=hello@crechebooks.co.za
SUPPORT_EMAIL=hello@crechebooks.co.za
```

**Gmail Setup:**
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Use the generated password for `SMTP_PASS`

**Alternative SMTP Providers:**
- **SendGrid**: SMTP_HOST=smtp.sendgrid.net, SMTP_PORT=587
- **Mailgun**: SMTP_HOST=smtp.mailgun.org, SMTP_PORT=587
- **AWS SES**: SMTP_HOST=email-smtp.region.amazonaws.com, SMTP_PORT=587

#### Application URLs
```
FRONTEND_URL=https://crechebooks.co.za
```

#### Application Settings
```
NODE_ENV=production
PORT=3001
```

### Optional Variables

#### Xero Integration (if needed)
```
XERO_CLIENT_ID=your-xero-client-id
XERO_CLIENT_SECRET=your-xero-client-secret
XERO_REDIRECT_URI=https://api.elleelephant.co.za/xero/callback
```

## Frontend Web Service (`apps/web`)

### Required Variables

```
NEXT_PUBLIC_API_URL=https://api.elleelephant.co.za
NEXT_PUBLIC_SITE_URL=https://crechebooks.co.za
```

## How to Set Environment Variables in Railway

### Via Railway Dashboard

1. Go to your Railway project
2. Select the service (backend or frontend)
3. Click on the "Variables" tab
4. Click "New Variable"
5. Enter the variable name and value
6. Click "Add"
7. Repeat for all variables

### Via Railway CLI

```bash
# For backend service
railway variables set JWT_SECRET="your-secret-here" --service=backend
railway variables set SMTP_HOST="smtp.gmail.com" --service=backend
railway variables set SMTP_PORT="587" --service=backend
railway variables set SMTP_USER="your-email@example.com" --service=backend
railway variables set SMTP_PASS="your-app-password" --service=backend
railway variables set SMTP_FROM="hello@crechebooks.co.za" --service=backend
railway variables set SUPPORT_EMAIL="hello@crechebooks.co.za" --service=backend
railway variables set FRONTEND_URL="https://crechebooks.co.za" --service=backend

# For frontend service
railway variables set NEXT_PUBLIC_API_URL="https://api.elleelephant.co.za" --service=frontend
railway variables set NEXT_PUBLIC_SITE_URL="https://crechebooks.co.za" --service=frontend
```

## Security Best Practices

1. **JWT_SECRET**: Generate using a cryptographically secure random string:
   ```bash
   openssl rand -base64 32
   ```

2. **SMTP_PASS**: Use app-specific passwords, never your main account password

3. **Environment Separation**: Use different values for staging and production environments

4. **Rotation**: Regularly rotate sensitive credentials (JWT_SECRET, SMTP_PASS)

5. **Access Control**: Limit who has access to environment variables in Railway

## Verification

After setting up environment variables:

1. **Backend Health Check**:
   ```bash
   curl https://api.elleelephant.co.za/health
   ```

2. **Email Service Test**: Create a test contact form submission and verify email is received

3. **Frontend Connection**: Verify the frontend can communicate with the backend API

## Troubleshooting

### Email Not Sending

1. Check SMTP credentials are correct
2. Verify SMTP port (587 for TLS, 465 for SSL)
3. Check Railway logs for email errors:
   ```bash
   railway logs --service=backend
   ```
4. Test SMTP connection manually using nodemailer debugging

### JWT Authentication Issues

1. Ensure JWT_SECRET is set and is the same across all backend instances
2. Check JWT_EXPIRES_IN format (e.g., "7d", "24h")
3. Verify frontend is sending the token in the Authorization header

### Database Connection Issues

1. Verify DATABASE_URL format matches Railway's PostgreSQL connection string
2. Check database is running and accessible
3. Review connection pooling settings if needed

## Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway Environment Variables Guide](https://docs.railway.app/develop/variables)
- [Nodemailer SMTP Documentation](https://nodemailer.com/smtp/)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
