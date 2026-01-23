# Prisma Public Form Submissions Migration Summary

## Overview
Added Prisma schema definitions and migrations for public form submissions (Contact Form and Demo Request Form) to support the marketing website.

## Changes Made

### 1. Schema Additions (`apps/api/prisma/schema.prisma`)

#### New Enum: `FormSubmissionStatus`
```prisma
enum FormSubmissionStatus {
  PENDING      // Initial status when form is submitted
  CONTACTED    // Staff has reached out to the submitter
  COMPLETED    // Submission fully processed
  SPAM         // Marked as spam/invalid
}
```

**Note:** Named `FormSubmissionStatus` to avoid conflict with existing `SubmissionStatus` enum used for SARS submissions.

#### New Model: `ContactSubmission`
```prisma
model ContactSubmission {
  id        String                 @id @default(uuid())
  name      String                 @db.VarChar(100)
  email     String                 @db.VarChar(255)
  phone     String?                @db.VarChar(20)
  subject   String?                @db.VarChar(200)
  message   String                 @db.Text
  status    FormSubmissionStatus   @default(PENDING)
  createdAt DateTime               @default(now()) @map("created_at")
  updatedAt DateTime               @updatedAt @map("updated_at")

  @@map("contact_submissions")
  @@index([email])
  @@index([createdAt])
  @@index([status])
}
```

**Fields:**
- `id`: UUID primary key
- `name`: Contact person's name (max 100 chars)
- `email`: Contact email (max 255 chars)
- `phone`: Optional phone number (max 20 chars)
- `subject`: Optional subject line (max 200 chars)
- `message`: Message content (text field)
- `status`: Submission status (defaults to PENDING)
- `createdAt`: Auto-generated timestamp
- `updatedAt`: Auto-updated timestamp

**Indexes:**
- Email (for quick lookup)
- Created date (for chronological queries)
- Status (for filtering by submission status)

#### New Model: `DemoRequest`
```prisma
model DemoRequest {
  id                 String                 @id @default(uuid())
  fullName           String                 @map("full_name") @db.VarChar(100)
  email              String                 @db.VarChar(255)
  phone              String                 @db.VarChar(20)
  crecheName         String                 @map("creche_name") @db.VarChar(200)
  childrenCount      Int                    @map("children_count")
  province           String                 @db.VarChar(50)
  currentSoftware    String?                @map("current_software") @db.VarChar(200)
  challenges         String[]
  preferredTime      String?                @map("preferred_time") @db.VarChar(20)
  marketingConsent   Boolean                @default(false) @map("marketing_consent")
  status             FormSubmissionStatus   @default(PENDING)
  createdAt          DateTime               @default(now()) @map("created_at")
  updatedAt          DateTime               @updatedAt @map("updated_at")

  @@map("demo_requests")
  @@index([email])
  @@index([createdAt])
  @@index([status])
  @@index([province])
}
```

**Fields:**
- `id`: UUID primary key
- `fullName`: Full name of requestor (max 100 chars)
- `email`: Contact email (max 255 chars)
- `phone`: Phone number (max 20 chars, required)
- `crecheName`: Name of crèche (max 200 chars)
- `childrenCount`: Number of children enrolled (integer)
- `province`: South African province (max 50 chars)
- `currentSoftware`: Current software solution (max 200 chars, optional)
- `challenges`: Array of challenge identifiers selected in form
- `preferredTime`: Preferred demo time slot (max 20 chars, optional)
- `marketingConsent`: Whether user consented to marketing (defaults to false)
- `status`: Submission status (defaults to PENDING)
- `createdAt`: Auto-generated timestamp
- `updatedAt`: Auto-updated timestamp

**Indexes:**
- Email (for quick lookup)
- Created date (for chronological queries)
- Status (for filtering by submission status)
- Province (for regional analysis)

#### Updated Model: `Tenant`
Added optional field for trial expiration tracking:
```prisma
trialExpiresAt DateTime? @map("trial_expires_at")
```

This field is placed right after `subscriptionStatus` and allows tracking when a tenant's trial period expires.

### 2. Migration Files

#### Migration 1: `20260123042823_add_public_form_submissions`
**Location:** `apps/api/prisma/migrations/20260123042823_add_public_form_submissions/migration.sql`

**Actions:**
1. Creates `FormSubmissionStatus` enum with values: PENDING, CONTACTED, COMPLETED, SPAM
2. Creates `contact_submissions` table with all fields and indexes
3. Creates `demo_requests` table with all fields and indexes

**SQL Summary:**
- 1 new enum type
- 2 new tables
- 7 indexes total (3 on contact_submissions, 4 on demo_requests)

#### Migration 2: `20260123042900_add_trial_expires_at`
**Location:** `apps/api/prisma/migrations/20260123042900_add_trial_expires_at/migration.sql`

**Actions:**
1. Adds `trial_expires_at` column to `tenants` table (nullable TIMESTAMP)

**SQL:**
```sql
ALTER TABLE "tenants" ADD COLUMN "trial_expires_at" TIMESTAMP(3);
```

## Database Tables Created

### `contact_submissions`
- Primary key: `id` (TEXT/UUID)
- Indexes: `email`, `created_at`, `status`
- Foreign keys: None (public form, no tenant association)

### `demo_requests`
- Primary key: `id` (TEXT/UUID)
- Indexes: `email`, `created_at`, `status`, `province`
- Foreign keys: None (public form, no tenant association)
- Array field: `challenges` (TEXT[])

## Running the Migrations

To apply these migrations to your database:

```bash
cd apps/api
npx prisma migrate deploy
```

Or for development with reset:

```bash
cd apps/api
npx prisma migrate dev
```

## Validation

Schema has been validated successfully:
```bash
npx prisma validate
# ✅ The schema at prisma/schema.prisma is valid 🚀
```

## API Usage Example

After migration, you can use these models in your NestJS services:

```typescript
// Contact form submission
await this.prisma.contactSubmission.create({
  data: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+27123456789',
    subject: 'General Inquiry',
    message: 'I would like more information...',
  },
});

// Demo request submission
await this.prisma.demoRequest.create({
  data: {
    fullName: 'Jane Smith',
    email: 'jane@creche.co.za',
    phone: '+27987654321',
    crecheName: 'Little Stars Daycare',
    childrenCount: 45,
    province: 'Gauteng',
    challenges: ['billing', 'attendance', 'communication'],
    preferredTime: 'morning',
    marketingConsent: true,
  },
});
```

## Next Steps

1. **Apply migrations**: Run `npx prisma migrate deploy` in production
2. **Generate Prisma Client**: Run `npx prisma generate` to update TypeScript types
3. **Create DTOs**: Create validation DTOs for form submissions in the API
4. **Create Controllers**: Implement POST endpoints for form submissions
5. **Create Services**: Implement business logic for handling submissions
6. **Email Notifications**: Set up email notifications for new submissions
7. **Admin Interface**: Create admin UI for managing submissions (view, update status, etc.)

## Related Files

- Schema: `/apps/api/prisma/schema.prisma`
- Migration 1: `/apps/api/prisma/migrations/20260123042823_add_public_form_submissions/migration.sql`
- Migration 2: `/apps/api/prisma/migrations/20260123042900_add_trial_expires_at/migration.sql`
- This summary: `/docs/prisma-public-forms-migration-summary.md`
