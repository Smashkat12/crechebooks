# Public API Quick Reference

## Endpoints

### 1. Contact Form
```bash
POST /api/v1/public/contact
Rate Limit: 5/5min
```

**Request**:
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "+27821234567",
  "subject": "Pricing inquiry",
  "message": "I would like to know about your pricing."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Thank you for contacting us! We will respond within 24 hours.",
  "submissionId": "uuid"
}
```

### 2. Demo Request
```bash
POST /api/v1/public/demo-request
Rate Limit: 5/5min
```

**Request**:
```json
{
  "fullName": "Sarah Johnson",
  "email": "sarah@littlelearners.co.za",
  "phone": "+27821234567",
  "crecheName": "Little Learners Daycare",
  "childrenCount": 45,
  "province": "Gauteng",
  "currentSoftware": "Excel",
  "challenges": ["Manual invoicing", "Payment tracking"],
  "preferredTime": "AFTERNOON",
  "marketingConsent": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Demo request received! Our team will contact you within 24 hours.",
  "requestId": "uuid"
}
```

### 3. Trial Signup
```bash
POST /api/v1/public/signup
Rate Limit: 3/1hour
```

**Request**:
```json
{
  "crecheName": "Little Learners Daycare",
  "adminName": "Sarah Johnson",
  "adminEmail": "sarah@littlelearners.co.za",
  "password": "SecurePass123!",
  "phone": "+27821234567",
  "addressLine1": "123 Main Street",
  "city": "Johannesburg",
  "province": "Gauteng",
  "postalCode": "2000"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Trial activated! Check your email for login instructions.",
  "tenantId": "uuid",
  "userId": "uuid",
  "trialExpiresAt": "2025-02-06T12:00:00.000Z"
}
```

## File Locations

### Controllers
```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/contact/contact.controller.ts
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/demo/demo-request.controller.ts
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/signup/signup.controller.ts
```

### Services
```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/contact/contact.service.ts
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/demo/demo-request.service.ts
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/signup/signup.service.ts
```

### DTOs
```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/contact/dto/contact.dto.ts
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/demo/dto/demo-request.dto.ts
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/signup/dto/signup.dto.ts
```

### Module
```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/api/public/public.module.ts
```

### Database
```
Schema: /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/prisma/schema.prisma
Migration: /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/prisma/migrations/20250123_add_public_api_tables/migration.sql
```

### Tests
```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/tests/api/public-endpoints.test.ts
```

### Documentation
```
Full Docs: /home/smash/Documents/dev-env/Playground/ruv/crechebooks/docs/public-api.md
Summary: /home/smash/Documents/dev-env/Playground/ruv/crechebooks/docs/public-api-implementation-summary.md
```

## Commands

### Development
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate:dev

# Build project
npm run build

# Start dev server
npm run dev

# Run tests
npm run test:e2e -- tests/api/public-endpoints.test.ts
```

### Testing Endpoints
```bash
# Contact Form
curl -X POST http://localhost:3000/api/v1/public/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","subject":"Test","message":"Test message"}'

# Demo Request
curl -X POST http://localhost:3000/api/v1/public/demo-request \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test User","email":"test@example.com","phone":"+27821234567","crecheName":"Test Daycare","childrenCount":30,"province":"Gauteng","marketingConsent":true}'

# Trial Signup
curl -X POST http://localhost:3000/api/v1/public/signup \
  -H "Content-Type: application/json" \
  -d '{"crecheName":"Test Creche","adminName":"Admin","adminEmail":"admin@test.com","password":"SecurePass123!","phone":"+27821234567","addressLine1":"123 Street","city":"Johannesburg","province":"Gauteng","postalCode":"2000"}'
```

## Security Features

✅ Rate limiting (5/5min, 3/1hour)
✅ Input sanitization
✅ Input validation
✅ Password hashing (bcrypt)
✅ CORS support
✅ Error handling
✅ Audit logging

## Database Tables

- `contact_submissions` - Contact form submissions
- `demo_requests` - Demo request submissions
- `tenants` - Organizations (created on signup)
- `users` - User accounts (admin created on signup)
- `user_tenant_roles` - User-tenant role mappings
- `audit_logs` - Audit trail (includes signup records)

## Status Enum

```typescript
enum FormSubmissionStatus {
  PENDING,    // New submission
  CONTACTED,  // Follow-up made
  COMPLETED,  // Process complete
  SPAM        // Marked as spam
}
```

## Error Codes

- **400** - Validation error
- **409** - Duplicate email (signup)
- **429** - Rate limit exceeded
- **500** - Server error

## Validation Rules

### Contact Form
- name: 1-100 chars, required
- email: valid email, required
- phone: max 20 chars, optional
- subject: 1-200 chars, required
- message: 1-2000 chars, required

### Demo Request
- fullName: 1-100 chars, required
- email: valid email, required
- phone: max 20 chars, required
- crecheName: 1-200 chars, required
- childrenCount: 1-1000, required
- province: 1-50 chars, required
- currentSoftware: max 200 chars, optional
- challenges: array (max 10 items), optional
- preferredTime: MORNING|AFTERNOON|EVENING|ANYTIME, optional
- marketingConsent: boolean, required

### Trial Signup
- crecheName: 1-200 chars, required
- adminName: 1-100 chars, required
- adminEmail: valid email, required
- password: 8-128 chars, complexity required
- phone: max 20 chars, required
- addressLine1: 1-200 chars, required
- city: 1-100 chars, required
- province: 1-50 chars, required
- postalCode: max 10 chars, required

## Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character (@$!%*?&#)

## Next Steps

1. Apply database migration
2. Test endpoints locally
3. Integrate with frontend
4. Set up email notifications
5. Configure monitoring/analytics
6. Deploy to staging/production
