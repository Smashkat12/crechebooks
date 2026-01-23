# Public API Module

## Overview

The Public API module provides unauthenticated endpoints for public-facing functionality including contact forms, demo requests, and trial signups.

## Features

- **No Authentication Required**: All endpoints are public and use `@Public()` decorator
- **Rate Limited**: Protection against abuse with configurable rate limits
- **Input Validation**: Comprehensive validation using class-validator
- **Input Sanitization**: Automatic sanitization to prevent XSS attacks
- **Audit Logging**: All submissions are logged for tracking
- **Error Handling**: Proper HTTP status codes and error messages

## Endpoints

### 1. Contact Form

**Endpoint**: `POST /api/v1/public/contact`

**Rate Limit**: 5 requests per 5 minutes

**Purpose**: Submit general inquiries and contact requests

**Request Body**:
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "+27821234567",
  "subject": "Question about pricing",
  "message": "I would like to know more about your enterprise pricing options."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Thank you for contacting us! We will respond within 24 hours.",
  "submissionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Validation Rules**:
- `name`: Required, max 100 characters
- `email`: Required, valid email format, max 255 characters
- `phone`: Optional, max 20 characters
- `subject`: Required, max 200 characters
- `message`: Required, max 2000 characters

### 2. Demo Request

**Endpoint**: `POST /api/v1/public/demo-request`

**Rate Limit**: 5 requests per 5 minutes

**Purpose**: Request a product demonstration

**Request Body**:
```json
{
  "fullName": "Sarah Johnson",
  "email": "sarah@littlelearners.co.za",
  "phone": "+27821234567",
  "crecheName": "Little Learners Daycare",
  "childrenCount": 45,
  "province": "Gauteng",
  "currentSoftware": "Excel spreadsheets",
  "challenges": [
    "Manual invoicing",
    "Tracking payments",
    "SARS compliance"
  ],
  "preferredTime": "AFTERNOON",
  "marketingConsent": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Demo request received! Our team will contact you within 24 hours.",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Validation Rules**:
- `fullName`: Required, max 100 characters
- `email`: Required, valid email format, max 255 characters
- `phone`: Required, max 20 characters
- `crecheName`: Required, max 200 characters
- `childrenCount`: Required, integer between 1-1000
- `province`: Required, max 50 characters
- `currentSoftware`: Optional, max 200 characters
- `challenges`: Optional, array of strings (max 10 items, 200 chars each)
- `preferredTime`: Optional, enum (MORNING, AFTERNOON, EVENING, ANYTIME)
- `marketingConsent`: Required, boolean

### 3. Trial Signup

**Endpoint**: `POST /api/v1/public/signup`

**Rate Limit**: 3 requests per 1 hour

**Purpose**: Create a new trial account with tenant and admin user

**Request Body**:
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
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "660e8400-e29b-41d4-a716-446655440001",
  "trialExpiresAt": "2025-02-06T12:00:00.000Z"
}
```

**Validation Rules**:
- `crecheName`: Required, max 200 characters
- `adminName`: Required, max 100 characters
- `adminEmail`: Required, valid email format, max 255 characters
- `password`: Required, 8-128 characters, must contain:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character (@$!%*?&#)
- `phone`: Required, max 20 characters
- `addressLine1`: Required, max 200 characters
- `city`: Required, max 100 characters
- `province`: Required, max 50 characters
- `postalCode`: Required, max 10 characters

**Trial Details**:
- Duration: 14 days
- Subscription Status: TRIAL
- Auto-creates: Tenant, Admin User, UserTenantRole
- Password: Hashed with bcrypt (10 rounds)

## Database Schema

### ContactSubmission Table

```sql
CREATE TABLE "contact_submissions" (
    "id" TEXT PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "subject" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions"("email");
CREATE INDEX "contact_submissions_status_idx" ON "contact_submissions"("status");
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions"("created_at");
```

### DemoRequest Table

```sql
CREATE TABLE "demo_requests" (
    "id" TEXT PRIMARY KEY,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "creche_name" VARCHAR(200) NOT NULL,
    "children_count" INTEGER NOT NULL,
    "province" VARCHAR(50) NOT NULL,
    "current_software" VARCHAR(200),
    "challenges" TEXT[],
    "preferred_time" VARCHAR(20),
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "demo_requests_email_idx" ON "demo_requests"("email");
CREATE INDEX "demo_requests_status_idx" ON "demo_requests"("status");
CREATE INDEX "demo_requests_created_at_idx" ON "demo_requests"("created_at");
CREATE INDEX "demo_requests_province_idx" ON "demo_requests"("province");
```

### SubmissionStatus Enum

```sql
CREATE TYPE "SubmissionStatus" AS ENUM (
    'PENDING',
    'CONTACTED',
    'CONVERTED',
    'COMPLETED',
    'SPAM'
);
```

## Security Features

### 1. Rate Limiting

All endpoints have rate limiting to prevent abuse:
- Contact: 5 requests per 5 minutes
- Demo Request: 5 requests per 5 minutes
- Signup: 3 requests per 1 hour

Rate limits are enforced using the `@RateLimit` decorator with Redis-backed storage in production.

### 2. Input Sanitization

All string inputs are automatically sanitized to prevent XSS attacks:
- HTML tags are stripped or escaped
- SQL injection patterns are neutralized
- Email addresses are validated and normalized
- Phone numbers are sanitized

### 3. Validation

Comprehensive validation using class-validator:
- Type validation
- Length constraints
- Format validation (email, phone)
- Enum validation
- Range validation (childrenCount: 1-1000)

### 4. Password Security

Trial signup passwords are:
- Hashed using bcrypt with 10 rounds
- Never stored in plain text
- Must meet complexity requirements
- Validated on both client and server

### 5. CORS & CSP

Public endpoints support CORS for frontend access while maintaining CSP headers for security.

## Error Responses

### 400 Bad Request
Invalid input data or validation failure.

```json
{
  "statusCode": 400,
  "message": [
    "email must be a valid email",
    "password must contain at least one uppercase letter"
  ],
  "error": "Bad Request"
}
```

### 409 Conflict
Duplicate email on signup.

```json
{
  "statusCode": 409,
  "message": "A tenant with this email already exists. Please use a different email or contact support.",
  "error": "Conflict"
}
```

### 429 Too Many Requests
Rate limit exceeded.

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "Too Many Requests"
}
```

### 500 Internal Server Error
Server error during processing.

```json
{
  "statusCode": 500,
  "message": "Failed to submit contact form. Please try again later.",
  "error": "Internal Server Error"
}
```

## Integration

### Frontend Integration

```typescript
// Contact Form Submission
const submitContact = async (data: ContactFormData) => {
  const response = await fetch('/api/v1/public/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
};

// Demo Request
const requestDemo = async (data: DemoRequestData) => {
  const response = await fetch('/api/v1/public/demo-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return response.json();
};

// Trial Signup
const signup = async (data: SignupData) => {
  const response = await fetch('/api/v1/public/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error('Email already exists');
    }
    throw new Error('Signup failed');
  }

  return response.json();
};
```

## Testing

Run the test suite:

```bash
npm run test:e2e -- tests/api/public-endpoints.test.ts
```

Test coverage includes:
- Successful submissions
- Validation errors
- Input sanitization
- Rate limiting
- Duplicate prevention
- Password strength requirements
- Database integrity

## Monitoring & Analytics

### Metrics to Track

1. **Submission Volume**
   - Contact form submissions per day
   - Demo requests per day
   - Trial signups per day

2. **Conversion Rates**
   - Contact → Demo conversion
   - Demo → Trial conversion
   - Trial → Paid conversion

3. **Response Times**
   - API endpoint latency
   - Database query performance

4. **Error Rates**
   - Validation failures
   - Rate limit hits
   - Server errors

### Logging

All submissions are logged with:
- Submission ID
- Email address
- IP address (via request headers)
- User agent
- Timestamp
- Status

## Admin Management

### Viewing Submissions

```sql
-- Recent contact submissions
SELECT * FROM contact_submissions
ORDER BY created_at DESC
LIMIT 50;

-- Pending demo requests
SELECT * FROM demo_requests
WHERE status = 'PENDING'
ORDER BY created_at DESC;

-- Recent trial signups
SELECT t.name, t.email, u.name as admin_name, t.created_at
FROM tenants t
JOIN users u ON u.tenant_id = t.id
WHERE t.subscription_status = 'TRIAL'
ORDER BY t.created_at DESC;
```

### Status Updates

```sql
-- Mark contact as contacted
UPDATE contact_submissions
SET status = 'CONTACTED', updated_at = NOW()
WHERE id = 'submission-id';

-- Mark demo request as converted
UPDATE demo_requests
SET status = 'CONVERTED', updated_at = NOW()
WHERE id = 'request-id';
```

## Future Enhancements

1. **Email Notifications**
   - Send confirmation emails to users
   - Notify admin team of new submissions
   - Automated follow-up emails

2. **CRM Integration**
   - Sync submissions to CRM system
   - Track lead progression
   - Marketing automation

3. **Analytics Dashboard**
   - Real-time submission tracking
   - Conversion funnel visualization
   - Geographic distribution

4. **A/B Testing**
   - Test different form variations
   - Optimize conversion rates
   - Personalized messaging

5. **Webhook Support**
   - Notify external systems of submissions
   - Real-time integrations
   - Custom workflows

## Support

For issues or questions:
- GitHub Issues: https://github.com/crechebooks/issues
- Email: support@crechebooks.com
- Documentation: https://docs.crechebooks.com
