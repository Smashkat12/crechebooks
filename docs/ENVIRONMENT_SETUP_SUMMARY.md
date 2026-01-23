# Environment Variables Setup - Summary

## Files Created

### 1. Frontend Environment Configuration
**File:** `apps/web/.env.example`

Added production environment variables:
```env
NEXT_PUBLIC_API_URL=https://api.elleelephant.co.za
NEXT_PUBLIC_SITE_URL=https://crechebooks.co.za
```

### 2. Backend Environment Configuration
**File:** `apps/api/.env.example`

Complete configuration including:
- Database connection
- JWT authentication
- **SMTP email configuration** (new)
- Support email addresses (new)
- Frontend URL for links (new)
- Xero integration (optional)

### 3. Email Service Implementation
**Files:**
- `apps/api/src/common/email/email.service.ts`
- `apps/api/src/common/email/email.module.ts`

**Email Service Features:**
- ✉️ `sendContactNotification()` - Notifies support team of contact form submissions
- 📧 `sendDemoRequestNotification()` - Alerts support team of demo requests
- 👋 `sendWelcomeEmail()` - Sends new user welcome email with trial details
- 🔑 `sendPasswordResetEmail()` - Sends password reset link
- 📮 Uses nodemailer with SMTP support
- 🎨 Professional HTML email templates
- 🔒 Secure SMTP authentication
- ⚠️ Graceful degradation when email is not configured

### 4. Railway Deployment Guide
**File:** `docs/RAILWAY_ENVIRONMENT_VARIABLES.md`

Comprehensive guide covering:
- Complete list of required environment variables
- SMTP provider setup instructions (Gmail, SendGrid, Mailgun, AWS SES)
- Security best practices
- Railway CLI commands for setting variables
- Troubleshooting common issues
- Verification steps

## Integration Status

### ✅ Completed
1. EmailModule integrated into AppModule
2. nodemailer dependency already installed
3. TypeScript types properly defined
4. Error handling with logging
5. Professional HTML email templates
6. Support for multiple SMTP providers

## Next Steps for Deployment

### 1. Configure SMTP in Railway

**For Gmail (Recommended for Testing):**
```bash
railway variables set SMTP_HOST="smtp.gmail.com" --service=backend
railway variables set SMTP_PORT="587" --service=backend
railway variables set SMTP_USER="your-email@gmail.com" --service=backend
railway variables set SMTP_PASS="your-app-password" --service=backend
railway variables set SMTP_FROM="hello@crechebooks.co.za" --service=backend
railway variables set SUPPORT_EMAIL="hello@crechebooks.co.za" --service=backend
railway variables set FRONTEND_URL="https://crechebooks.co.za" --service=backend
```

**To get Gmail App Password:**
1. Enable 2-factor authentication on Gmail
2. Go to https://myaccount.google.com/apppasswords
3. Generate a new app password for "Mail"
4. Use the generated 16-character password

**For Production (SendGrid Recommended):**
```bash
railway variables set SMTP_HOST="smtp.sendgrid.net" --service=backend
railway variables set SMTP_PORT="587" --service=backend
railway variables set SMTP_USER="apikey" --service=backend
railway variables set SMTP_PASS="your-sendgrid-api-key" --service=backend
```

### 2. Update Frontend Environment

```bash
railway variables set NEXT_PUBLIC_API_URL="https://api.elleelephant.co.za" --service=frontend
railway variables set NEXT_PUBLIC_SITE_URL="https://crechebooks.co.za" --service=frontend
```

### 3. Test Email Functionality

After deploying:

1. **Test Contact Form:**
   - Visit https://crechebooks.co.za/contact
   - Submit a test contact form
   - Verify email received at SUPPORT_EMAIL

2. **Test Demo Request:**
   - Visit https://crechebooks.co.za/demo
   - Submit a test demo request
   - Verify email received at SUPPORT_EMAIL

3. **Test User Registration:**
   - Create a test account
   - Verify welcome email received
   - Check trial period details in email

## Email Service Usage

### In Controllers/Services

```typescript
import { EmailService } from '../common/email/email.service';

@Injectable()
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  async register(dto: RegisterDto) {
    // ... create user and tenant ...

    // Send welcome email
    await this.emailService.sendWelcomeEmail(
      user,
      tenant,
      trialExpiresAt
    );
  }

  async requestPasswordReset(email: string) {
    // ... generate reset token ...

    // Send reset email
    await this.emailService.sendPasswordResetEmail(
      email,
      resetToken
    );
  }
}
```

### In Public Website Controllers

```typescript
@Controller('contact')
export class ContactController {
  constructor(private readonly emailService: EmailService) {}

  @Post()
  async submitContact(@Body() dto: ContactDto) {
    await this.emailService.sendContactNotification({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      message: dto.message,
      submittedAt: new Date(),
    });

    return { success: true };
  }
}
```

## Email Templates

All email templates are professionally designed with:
- Responsive HTML layout
- Brand colors (CrecheBooks blue: #0EA5E9)
- Clear call-to-action buttons
- Security notices where appropriate
- Professional footer with links
- South African date formatting

## Environment Variable Reference

### Required for Email Functionality
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (587 for TLS, 465 for SSL)
- `SMTP_USER` - SMTP authentication username
- `SMTP_PASS` - SMTP authentication password
- `SMTP_FROM` - Sender email address
- `SUPPORT_EMAIL` - Email address to receive notifications
- `FRONTEND_URL` - Frontend URL for email links

### Optional but Recommended
- `JWT_SECRET` - Should be regenerated for production
- `XERO_*` - Only if Xero integration is needed

## Security Considerations

1. **SMTP Credentials:**
   - Never commit to version control
   - Use app-specific passwords, not main account passwords
   - Rotate credentials regularly

2. **Email Content:**
   - User data is properly escaped in HTML templates
   - No sensitive information in subject lines
   - Reset tokens expire after 1 hour

3. **Rate Limiting:**
   - Email sending is protected by global throttling
   - Prevents abuse of contact forms
   - Monitors for suspicious patterns

## Troubleshooting

### Emails Not Sending

1. Check Railway logs:
   ```bash
   railway logs --service=backend | grep -i email
   ```

2. Common issues:
   - Incorrect SMTP credentials
   - Wrong port number (587 for TLS, 465 for SSL)
   - Firewall blocking SMTP port
   - Gmail blocking "less secure apps" (use App Password)

3. Test SMTP connection:
   ```bash
   # In Railway shell or locally
   node -e "
   const nodemailer = require('nodemailer');
   const transporter = nodemailer.createTransport({
     host: 'smtp.gmail.com',
     port: 587,
     auth: { user: 'your-email', pass: 'your-app-password' }
   });
   transporter.verify().then(console.log).catch(console.error);
   "
   ```

### Graceful Degradation

The EmailService is designed to fail gracefully:
- If SMTP is not configured, warnings are logged but app continues
- Email sending failures are logged but don't crash the application
- Contact forms still save data even if email fails

## Monitoring

Monitor email delivery:
1. Check Railway logs for email sending confirmation
2. Monitor bounce rates in SMTP provider dashboard
3. Track contact form submissions in database
4. Set up alerts for email sending failures

## Documentation Links

- [Nodemailer Documentation](https://nodemailer.com/smtp/)
- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [SendGrid SMTP Setup](https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api)
- [Railway Environment Variables](https://docs.railway.app/develop/variables)
