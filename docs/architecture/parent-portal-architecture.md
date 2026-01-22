# Parent Portal Architecture Design

## Executive Summary

This document defines the architecture for a self-service parent portal for CrecheBooks. The portal will allow parents to view invoices, statements, payment history, and manage their communication preferences without requiring staff intervention.

---

## FEATURE: Authentication System

**PURPOSE:** Secure, passwordless authentication for parents using magic links sent via email or WhatsApp.

**EXISTING_API:**
- `apps/api/src/api/auth/auth.controller.ts` - OAuth/JWT-based authentication for staff
- `apps/api/src/api/auth/guards/jwt-auth.guard.ts` - JWT validation
- `apps/api/src/api/auth/guards/roles.guard.ts` - Role-based access control

**NEW_REQUIREMENTS:**
- API changes needed:
  - Extend `UserRole` enum to include `PARENT` role
  - Create `ParentUser` entity linking parent records to authentication
  - Add magic link token generation and validation endpoints
  - Implement separate JWT issuer for parent tokens with restricted scopes

- New endpoints needed:
  - `POST /parent-portal/auth/magic-link` - Request magic link
  - `GET /parent-portal/auth/verify/:token` - Verify magic link token
  - `POST /parent-portal/auth/refresh` - Refresh parent JWT
  - `POST /parent-portal/auth/logout` - Clear parent session

**COMPONENTS:**
- `ParentAuthController`: Handles magic link flow, separate from staff auth
- `ParentAuthService`: Magic link generation, token validation, JWT issuance
- `MagicLinkTokenEntity`: Stores magic link tokens with expiry (15min default)
- `ParentJwtStrategy`: Separate JWT strategy with `PARENT` role enforcement
- `ParentSessionEntity`: Tracks active parent sessions for security audit

**SECURITY:**
- Magic links expire after 15 minutes
- Single-use tokens (invalidated after verification)
- Rate limiting: 3 magic link requests per email per hour
- HttpOnly cookies for JWT storage (same as staff auth)
- Separate JWT signing key for parent tokens
- Tenant isolation enforced at middleware level
- Session tracking for concurrent login detection

**POPIA:**
- Email verification required before first login
- Consent recorded for magic link communications
- Login history accessible to data subject
- Account deletion endpoint for "right to be forgotten"

---

## FEATURE: Parent Dashboard

**PURPOSE:** Single-pane overview of account status showing outstanding balance, recent activity, and enrolled children.

**EXISTING_API:**
- `apps/api/src/api/billing/statement.controller.ts` - `GET /statements/parents/:parentId/account`
- `apps/api/src/database/services/parent-account.service.ts` - Account summary calculation

**NEW_REQUIREMENTS:**
- API changes needed:
  - Expose account summary to parent role (currently OWNER/ADMIN only)
  - Add activity feed combining invoices, payments, and statements

- New endpoints needed:
  - `GET /parent-portal/dashboard` - Aggregated dashboard data
  - `GET /parent-portal/activity` - Paginated activity feed

**COMPONENTS:**
- `ParentDashboardController`: Dashboard-specific endpoints
- `ParentDashboardService`: Aggregates data from multiple services
- `DashboardSummaryDto`: Account balance, children count, recent activity
- `ActivityFeedDto`: Unified feed of invoices, payments, statements

**SECURITY:**
- Parent can only see their own data (enforced via JWT parent_id claim)
- No access to other parents' information
- Cached data refreshed every 5 minutes
- Sensitive financial totals shown but not account numbers

**POPIA:**
- Only display data directly related to the authenticated parent
- No cross-referencing with other parent accounts
- Activity log for data access auditing

---

## FEATURE: Invoice Management

**PURPOSE:** Parents can view their invoices, download PDFs, and see payment status for each invoice.

**EXISTING_API:**
- `apps/api/src/api/billing/invoice.controller.ts`:
  - `GET /invoices` - List with filtering (staff only currently)
  - `GET /invoices/:id` - Invoice detail with line items
  - `GET /invoices/:id/pdf` - Download PDF

**NEW_REQUIREMENTS:**
- API changes needed:
  - Add `PARENT` role to invoice read endpoints
  - Filter results by authenticated parent's ID automatically
  - Remove staff-only fields (internal notes, Xero references)

- New endpoints needed:
  - `GET /parent-portal/invoices` - Parent-filtered invoice list
  - `GET /parent-portal/invoices/:id` - Invoice detail (parent-scoped)
  - `GET /parent-portal/invoices/:id/pdf` - PDF download (parent-scoped)

**COMPONENTS:**
- `ParentInvoiceController`: Parent-scoped invoice endpoints
- `ParentInvoiceService`: Wraps existing service with parent filtering
- `ParentInvoiceResponseDto`: Sanitized response without internal fields
- `InvoiceLineResponseDto`: Detailed line items for transparency

**SECURITY:**
- Invoice access restricted to invoice's parentId matching JWT claim
- No access to other parents' invoices even with valid IDs
- PDF generation rate-limited (5 per minute per parent)
- Audit log for each invoice view/download

**POPIA:**
- Invoices contain child names (permitted under billing purpose)
- No PII of other families exposed
- PDF downloads logged for audit trail
- Data minimization: only billing-relevant fields exposed

---

## FEATURE: Statement Management

**PURPOSE:** Parents can view account statements, download PDFs, and select custom date ranges.

**EXISTING_API:**
- `apps/api/src/api/billing/statement.controller.ts`:
  - `GET /statements` - List with filtering
  - `GET /statements/:id` - Statement detail with lines
  - `GET /statements/:id/pdf` - Download PDF
  - `GET /statements/parents/:parentId` - Statements for specific parent
  - `GET /statements/parents/:parentId/account` - Account summary

**NEW_REQUIREMENTS:**
- API changes needed:
  - Add `PARENT` role to statement read endpoints
  - Auto-filter by authenticated parent ID
  - Remove internal status fields (DRAFT statements)

- New endpoints needed:
  - `GET /parent-portal/statements` - Parent-filtered statement list
  - `GET /parent-portal/statements/:id` - Statement detail (parent-scoped)
  - `GET /parent-portal/statements/:id/pdf` - PDF download (parent-scoped)
  - `POST /parent-portal/statements/generate` - Request on-demand statement

**COMPONENTS:**
- `ParentStatementController`: Parent-scoped statement endpoints
- `ParentStatementService`: Wraps existing service with parent filtering
- `ParentStatementRequestDto`: Custom date range for on-demand generation
- `StatementLineDetailDto`: Transaction-by-transaction breakdown

**SECURITY:**
- Only FINAL/DELIVERED statements visible (not DRAFT)
- Parent can only view statements with matching parentId
- On-demand statement generation rate-limited (3 per day)
- Statement history retention per tenant policy

**POPIA:**
- Statements contain financial transaction history (legitimate business use)
- Opening balance and running totals limited to parent's own account
- Statement download logged for audit
- Right to request statement corrections

---

## FEATURE: Payment History

**PURPOSE:** Parents can view their payment history, download receipts, and see which invoices payments were applied to.

**EXISTING_API:**
- `apps/api/src/api/payment/payment.controller.ts`:
  - `GET /payments` - List with filtering (staff only)
  - `GET /payments/:paymentId/receipt` - Download receipt PDF
  - `POST /payments/:paymentId/receipt` - Generate receipt

**NEW_REQUIREMENTS:**
- API changes needed:
  - Add payment filtering by parent ID via invoice relationship
  - Expose payment list to PARENT role with parent filtering

- New endpoints needed:
  - `GET /parent-portal/payments` - Parent-filtered payment list
  - `GET /parent-portal/payments/:id` - Payment detail (parent-scoped)
  - `GET /parent-portal/payments/:id/receipt` - Receipt download (parent-scoped)

**COMPONENTS:**
- `ParentPaymentController`: Parent-scoped payment endpoints
- `ParentPaymentService`: Filter payments via invoice->parent relationship
- `PaymentHistoryDto`: Payment with linked invoice details
- `PaymentReceiptDto`: Receipt metadata and download link

**SECURITY:**
- Payment access via invoice->parent chain verification
- Receipt PDF contains payment reference (not bank details)
- Rate-limited receipt generation (5 per minute)
- No exposure of bank transaction details

**POPIA:**
- Payment reference numbers shown (not full bank account)
- Date, amount, and invoice allocation visible
- Download history logged
- No third-party payment provider details exposed

---

## FEATURE: Children Information

**PURPOSE:** Parents can view basic information about their enrolled children and current enrollment status.

**EXISTING_API:**
- `apps/api/src/api/parents/parent.controller.ts`:
  - `GET /parents/:id/children` - List children for parent (staff only)
- `apps/api/src/api/billing/enrollment.controller.ts`:
  - `GET /enrollments` - List enrollments with filters (staff only)

**NEW_REQUIREMENTS:**
- API changes needed:
  - Expose children list to authenticated parent
  - Include current enrollment status and fee tier name

- New endpoints needed:
  - `GET /parent-portal/children` - List parent's children
  - `GET /parent-portal/children/:id` - Child detail with enrollment
  - `GET /parent-portal/children/:id/invoices` - Invoices for specific child

**COMPONENTS:**
- `ParentChildrenController`: Parent-scoped children endpoints
- `ParentChildrenService`: Child and enrollment data for parent
- `ChildSummaryDto`: Name, age, enrollment status, fee tier
- `EnrollmentSummaryDto`: Start date, status, fee tier name

**SECURITY:**
- Children access restricted to parent's own children
- No access to other children even within same tenant
- Medical notes and emergency contacts read-only
- Enrollment status visible but not editable

**POPIA:**
- Child names and basic info visible to parent (data subject rights)
- Medical notes viewable but update requires staff
- No cross-family data exposure
- Parent can request data export for their children

---

## FEATURE: Profile & Preferences

**PURPOSE:** Parents can view and update their contact information and communication preferences.

**EXISTING_API:**
- `apps/api/src/api/parents/parent.controller.ts`:
  - `GET /parents/:id` - Get parent details (staff only)
  - `PUT /parents/:id` - Update parent (staff only)
- Parent entity includes `preferredContact`, `whatsappOptIn` fields

**NEW_REQUIREMENTS:**
- API changes needed:
  - Expose parent profile to authenticated parent (read)
  - Allow parent to update contact preferences only

- New endpoints needed:
  - `GET /parent-portal/profile` - Get authenticated parent's profile
  - `PATCH /parent-portal/profile` - Update allowed fields only
  - `POST /parent-portal/profile/whatsapp-optin` - POPIA-compliant WhatsApp opt-in
  - `DELETE /parent-portal/profile/whatsapp-optin` - Withdraw WhatsApp consent

**COMPONENTS:**
- `ParentProfileController`: Profile management endpoints
- `ParentProfileService`: Profile read/update with field restrictions
- `ProfileUpdateDto`: Only editable fields (email, phone, preferences)
- `WhatsAppConsentDto`: POPIA-compliant consent recording

**SECURITY:**
- Profile updates limited to contact preferences
- Cannot modify: name, ID number, address (requires staff)
- Email change requires verification flow
- Phone number validation for WhatsApp opt-in

**POPIA:**
- WhatsApp opt-in requires explicit consent capture
- Consent timestamp and IP address recorded
- Opt-out available at any time without restriction
- Preference history maintained for compliance audit
- Clear disclosure of what communications will be sent

---

## FEATURE: Communication Preferences & WhatsApp Opt-In

**PURPOSE:** POPIA-compliant management of communication preferences including WhatsApp messaging opt-in/opt-out.

**EXISTING_API:**
- `apps/api/src/integrations/whatsapp/` - WhatsApp integration services
- `Parent.whatsappOptIn` field in parent entity
- `Parent.preferredContact` field (EMAIL, WHATSAPP, BOTH)

**NEW_REQUIREMENTS:**
- API changes needed:
  - Create consent audit trail table
  - Track opt-in/opt-out history with timestamps

- New endpoints needed:
  - `GET /parent-portal/preferences/communication` - Current preferences
  - `PATCH /parent-portal/preferences/communication` - Update preferences
  - `POST /parent-portal/preferences/whatsapp/consent` - Record WhatsApp consent
  - `DELETE /parent-portal/preferences/whatsapp/consent` - Withdraw consent
  - `GET /parent-portal/preferences/consent-history` - View consent audit trail

**COMPONENTS:**
- `CommunicationPreferencesController`: Preference management
- `ConsentAuditEntity`: Audit trail for all consent actions
- `ConsentRecordDto`: Consent action with timestamp, IP, user agent
- `PreferenceUpdateService`: Handles preference changes with audit

**SECURITY:**
- Consent changes require re-authentication
- Audit trail immutable (append-only)
- IP address and timestamp recorded for legal compliance
- Rate-limiting on preference changes (prevent abuse)

**POPIA:**
- Explicit consent required for WhatsApp (separate from email)
- Consent text must be clear and unambiguous
- Easy withdrawal mechanism (no dark patterns)
- Consent version tracked (if terms change)
- Data portability: consent history exportable
- Retention: consent records kept for 5 years (legal requirement)

---

## FEATURE: In-App Notifications

**PURPOSE:** Notification center showing invoice deliveries, payment confirmations, and creche communications.

**EXISTING_API:**
- `apps/api/src/communications/` - Broadcast messaging system
- `apps/api/src/integrations/whatsapp/entities/whatsapp-message.entity.ts` - Message tracking
- Invoice/Statement delivery status tracking

**NEW_REQUIREMENTS:**
- API changes needed:
  - Create parent notification entity
  - Link notifications to invoice/statement delivery events

- New endpoints needed:
  - `GET /parent-portal/notifications` - List notifications
  - `PATCH /parent-portal/notifications/:id/read` - Mark as read
  - `POST /parent-portal/notifications/mark-all-read` - Bulk mark read
  - `GET /parent-portal/notifications/unread-count` - Badge count

**COMPONENTS:**
- `ParentNotificationController`: Notification management
- `ParentNotificationEntity`: Stores notification records
- `NotificationService`: Creates notifications from events
- `NotificationListDto`: Paginated notification list
- `UnreadCountDto`: Badge count for UI

**SECURITY:**
- Notifications isolated by parent ID
- No sensitive data in notification preview
- Bulk operations limited (prevent DoS)
- Notification retention: 90 days

**POPIA:**
- Notifications reference documents but don't contain full content
- Parent can delete their notification history
- No tracking of notification opens (privacy-first)

---

## Technical Architecture Overview

### API Structure

```
apps/api/src/api/parent-portal/
  +-- auth/
  |   +-- parent-auth.controller.ts
  |   +-- parent-auth.service.ts
  |   +-- magic-link.service.ts
  |   +-- dto/
  |   +-- guards/
  +-- dashboard/
  |   +-- parent-dashboard.controller.ts
  |   +-- parent-dashboard.service.ts
  +-- invoices/
  |   +-- parent-invoice.controller.ts
  |   +-- parent-invoice.service.ts
  +-- statements/
  |   +-- parent-statement.controller.ts
  |   +-- parent-statement.service.ts
  +-- payments/
  |   +-- parent-payment.controller.ts
  |   +-- parent-payment.service.ts
  +-- children/
  |   +-- parent-children.controller.ts
  |   +-- parent-children.service.ts
  +-- profile/
  |   +-- parent-profile.controller.ts
  |   +-- parent-profile.service.ts
  +-- notifications/
  |   +-- parent-notification.controller.ts
  |   +-- parent-notification.service.ts
  +-- parent-portal.module.ts
```

### New Database Entities

```prisma
model ParentUser {
  id            String    @id @default(uuid())
  parentId      String    @unique
  parent        Parent    @relation(fields: [parentId], references: [id])
  email         String
  emailVerified Boolean   @default(false)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  magicLinks    MagicLinkToken[]
  sessions      ParentSession[]
  notifications ParentNotification[]
}

model MagicLinkToken {
  id           String     @id @default(uuid())
  parentUserId String
  parentUser   ParentUser @relation(fields: [parentUserId], references: [id])
  token        String     @unique
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime   @default(now())

  @@index([token])
  @@index([expiresAt])
}

model ParentSession {
  id           String     @id @default(uuid())
  parentUserId String
  parentUser   ParentUser @relation(fields: [parentUserId], references: [id])
  ipAddress    String?
  userAgent    String?
  expiresAt    DateTime
  revokedAt    DateTime?
  createdAt    DateTime   @default(now())
}

model ConsentAudit {
  id           String    @id @default(uuid())
  tenantId     String
  parentId     String
  parent       Parent    @relation(fields: [parentId], references: [id])
  consentType  String    // WHATSAPP_OPT_IN, WHATSAPP_OPT_OUT, EMAIL_MARKETING, etc.
  consentGiven Boolean
  ipAddress    String?
  userAgent    String?
  consentText  String    // The exact text shown to user
  version      String    // Consent form version
  createdAt    DateTime  @default(now())

  @@index([parentId])
  @@index([tenantId])
  @@index([consentType])
}

model ParentNotification {
  id           String     @id @default(uuid())
  tenantId     String
  parentUserId String
  parentUser   ParentUser @relation(fields: [parentUserId], references: [id])
  type         String     // INVOICE_SENT, PAYMENT_RECEIVED, STATEMENT_READY, etc.
  title        String
  body         String
  referenceId  String?    // Link to invoice/payment/statement ID
  referenceType String?   // INVOICE, PAYMENT, STATEMENT
  isRead       Boolean    @default(false)
  readAt       DateTime?
  createdAt    DateTime   @default(now())

  @@index([parentUserId])
  @@index([isRead])
  @@index([createdAt])
}
```

### JWT Token Structure (Parent)

```json
{
  "sub": "parent-user-uuid",
  "parentId": "parent-uuid",
  "tenantId": "tenant-uuid",
  "role": "PARENT",
  "email": "parent@example.com",
  "iat": 1234567890,
  "exp": 1234571490,
  "iss": "crechebooks-parent-portal"
}
```

### Mobile-First Design Requirements

1. **Responsive Breakpoints:**
   - Mobile: 320px - 767px (primary target)
   - Tablet: 768px - 1023px
   - Desktop: 1024px+

2. **Performance Targets:**
   - First Contentful Paint: < 1.5s
   - Time to Interactive: < 3s
   - Lighthouse Performance: > 90

3. **Offline Capabilities:**
   - Cache dashboard summary
   - Queue notification reads
   - Progressive Web App (PWA) support

4. **Touch-Friendly:**
   - Minimum touch target: 44x44px
   - Swipe gestures for lists
   - Pull-to-refresh on all list views

### Security Summary

| Feature | Authentication | Authorization | Rate Limiting | Audit |
|---------|---------------|---------------|---------------|-------|
| Dashboard | JWT | Parent only | 60/min | No |
| Invoices | JWT | Parent's invoices | 30/min | Yes |
| Statements | JWT | Parent's statements | 30/min | Yes |
| Payments | JWT | Parent's payments | 30/min | Yes |
| Children | JWT | Parent's children | 60/min | No |
| Profile | JWT | Own profile | 10/min | Yes |
| Notifications | JWT | Own notifications | 60/min | No |
| PDF Download | JWT | Own documents | 5/min | Yes |

### POPIA Compliance Summary

| Requirement | Implementation |
|-------------|----------------|
| Lawful processing | Consent for marketing; contract basis for billing |
| Purpose limitation | Data shown only for billing/childcare purposes |
| Data minimization | Only relevant fields exposed in API |
| Accuracy | Parent can update contact info |
| Storage limitation | Notification retention 90 days; consent 5 years |
| Security | JWT auth, HTTPS, HttpOnly cookies |
| Accountability | Audit trails for sensitive operations |
| Data subject rights | Profile view, download, deletion endpoints |
| Consent management | Explicit opt-in with version tracking |
| Cross-border transfer | N/A (SA-hosted infrastructure) |

---

## Implementation Phases

### Phase 1: Authentication & Dashboard (2 weeks)
- Magic link authentication
- Parent user provisioning
- Basic dashboard with balance

### Phase 2: Invoices & Statements (2 weeks)
- Invoice list and detail views
- Statement list and detail views
- PDF download functionality

### Phase 3: Payments & Children (1 week)
- Payment history
- Receipt downloads
- Children overview

### Phase 4: Profile & Preferences (1 week)
- Profile management
- Communication preferences
- POPIA-compliant consent flows

### Phase 5: Notifications & Polish (1 week)
- Notification system
- PWA capabilities
- Performance optimization

---

## Dependencies

- Existing invoice, statement, payment services
- WhatsApp integration for magic links
- Email service (SES) for magic links
- PDF generation services
- Redis for magic link token storage (optional, can use DB)

---

## Open Questions

1. Should parents be able to request historical statements beyond current year?
2. Should we implement push notifications (Firebase) or email-only?
3. What happens when a parent has children at multiple creches (multi-tenant)?
4. Should we add payment initiation (link to Ozow/PayFast)?
