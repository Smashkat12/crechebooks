<task_spec id="TASK-XERO-010" version="2.0">

<metadata>
  <title>Implement Xero Contact and Payment Sync</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>191</sequence>
  <implements>
    <requirement_ref>REQ-XERO-CONTACT-001</requirement_ref>
    <requirement_ref>REQ-XERO-PAYMENT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-XERO-009</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/integrations/xero/xero-contact.service.ts` (NEW)
  - `apps/api/src/integrations/xero/xero-payment.service.ts` (NEW)
  - `apps/api/src/integrations/xero/dto/xero-contact.dto.ts` (NEW)
  - `apps/api/src/integrations/xero/dto/xero-payment.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/integrations/xero/xero.module.ts`
  - `apps/api/prisma/schema.prisma` (add XeroContactMapping, XeroPaymentMapping)

  **Current Problem:**
  - Parents in CrecheBooks are not linked to Xero Contacts
  - Payments recorded in CrecheBooks are not synced to Xero
  - Invoice payments in Xero are not reflected in CrecheBooks

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Contact Mapping Model
  ```prisma
  model XeroContactMapping {
    id               String   @id @default(uuid())
    tenantId         String   @map("tenant_id")
    parentId         String   @map("parent_id")
    xeroContactId    String   @map("xero_contact_id")
    xeroContactName  String?  @map("xero_contact_name")
    lastSyncedAt     DateTime @map("last_synced_at")
    createdAt        DateTime @default(now()) @map("created_at")
    updatedAt        DateTime @updatedAt @map("updated_at")

    tenant Tenant @relation(fields: [tenantId], references: [id])
    parent Parent @relation(fields: [parentId], references: [id])

    @@unique([tenantId, parentId])
    @@unique([tenantId, xeroContactId])
    @@map("xero_contact_mappings")
  }

  model XeroPaymentMapping {
    id               String   @id @default(uuid())
    tenantId         String   @map("tenant_id")
    paymentId        String   @map("payment_id")
    xeroPaymentId    String   @map("xero_payment_id")
    xeroInvoiceId    String   @map("xero_invoice_id")
    amountCents      Int      @map("amount_cents")
    syncDirection    String   @map("sync_direction")
    lastSyncedAt     DateTime @map("last_synced_at")
    createdAt        DateTime @default(now()) @map("created_at")
    updatedAt        DateTime @updatedAt @map("updated_at")

    tenant  Tenant  @relation(fields: [tenantId], references: [id])
    payment Payment @relation(fields: [paymentId], references: [id])

    @@unique([tenantId, paymentId])
    @@unique([tenantId, xeroPaymentId])
    @@map("xero_payment_mappings")
  }
  ```

  ### 3. Contact Service Pattern
  ```typescript
  @Injectable()
  export class XeroContactService {
    private readonly logger = new Logger(XeroContactService.name);

    constructor(
      private readonly xeroClient: XeroClient,
      private readonly rateLimiter: XeroRateLimiter,
      private readonly prisma: PrismaService,
    ) {}

    /**
     * Find or create Xero contact for a Parent
     */
    async getOrCreateContact(tenantId: string, parentId: string): Promise<string> {
      // Check existing mapping
      const mapping = await this.prisma.xeroContactMapping.findUnique({
        where: { tenantId_parentId: { tenantId, parentId } },
      });
      if (mapping) return mapping.xeroContactId;

      // Find by email in Xero
      const parent = await this.prisma.parent.findUnique({ where: { id: parentId } });
      const xeroContact = await this.findContactByEmail(tenantId, parent.email);
      if (xeroContact) {
        await this.createMapping(tenantId, parentId, xeroContact.ContactID);
        return xeroContact.ContactID;
      }

      // Create new contact in Xero
      const newContact = await this.createXeroContact(tenantId, parent);
      await this.createMapping(tenantId, parentId, newContact.ContactID);
      return newContact.ContactID;
    }
  }
  ```

  ### 4. Payment Service Pattern
  ```typescript
  @Injectable()
  export class XeroPaymentService {
    private readonly logger = new Logger(XeroPaymentService.name);

    /**
     * Sync payment to Xero invoice
     */
    async syncPaymentToXero(
      tenantId: string,
      paymentId: string,
      xeroInvoiceId: string,
    ): Promise<XeroPaymentMapping> {
      await this.rateLimiter.acquireSlot(tenantId);

      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

      const xeroPayment = await this.xeroClient.createPayment({
        Invoice: { InvoiceID: xeroInvoiceId },
        Account: { AccountID: this.getBankAccountId(tenantId) },
        Amount: payment.amountCents / 100,
        Date: payment.paymentDate.toISOString().split('T')[0],
      });

      return this.createMapping(tenantId, paymentId, xeroPayment.PaymentID, xeroInvoiceId, 'PUSH');
    }

    /**
     * Pull payments from Xero for an invoice
     */
    async pullPaymentsFromXero(tenantId: string, xeroInvoiceId: string): Promise<number> {
      const xeroInvoice = await this.xeroClient.getInvoice(xeroInvoiceId);
      const xeroPayments = xeroInvoice.Payments || [];

      let synced = 0;
      for (const payment of xeroPayments) {
        const existing = await this.findMappingByXeroPaymentId(tenantId, payment.PaymentID);
        if (!existing) {
          await this.importXeroPayment(tenantId, payment, xeroInvoiceId);
          synced++;
        }
      }

      return synced;
    }
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements synchronization of Contacts and Payments between CrecheBooks and Xero.

**Contact Sync:**
1. Parent in CrecheBooks -> Contact in Xero
2. Match by email address first
3. Create new contact if no match found
4. Store mapping for future lookups

**Payment Sync:**
1. Payment in CrecheBooks -> Payment in Xero (allocated to invoice)
2. Payment in Xero -> Payment in CrecheBooks
3. Handle partial payments
4. Handle overpayments (credit notes - out of scope)

**South African Context:**
- Bank account codes for FNB, ABSA, Standard Bank, Nedbank
- VAT handling on invoices
</context>

<scope>
  <in_scope>
    - Create XeroContactService for contact sync
    - Create XeroPaymentService for payment sync
    - Add XeroContactMapping model
    - Add XeroPaymentMapping model
    - Map Parent fields to Xero Contact
    - Map Payment to Xero Payment with invoice allocation
    - Find contacts by email before creating
    - Handle payment allocation to correct invoice
    - Rate limit all API calls
  </in_scope>
  <out_of_scope>
    - Contact groups sync
    - Contact notes/history sync
    - Prepayments handling
    - Credit note/overpayment handling
    - Bank reconciliation
    - Multi-currency payments
  </out_of_scope>
</scope>

<xero_api_reference>
## Xero Contact API

### Create Contact
POST /api.xro/2.0/Contacts
```json
{
  "Contacts": [{
    "Name": "John Smith",
    "FirstName": "John",
    "LastName": "Smith",
    "EmailAddress": "john.smith@email.com",
    "Phones": [{
      "PhoneType": "MOBILE",
      "PhoneNumber": "+27821234567"
    }],
    "Addresses": [{
      "AddressType": "STREET",
      "AddressLine1": "123 Main Street",
      "City": "Johannesburg",
      "Region": "Gauteng",
      "PostalCode": "2196",
      "Country": "South Africa"
    }]
  }]
}
```

### Find Contact by Email
GET /api.xro/2.0/Contacts?where=EmailAddress=="{email}"

## Xero Payment API

### Create Payment
POST /api.xro/2.0/Payments
```json
{
  "Payments": [{
    "Invoice": { "InvoiceID": "..." },
    "Account": { "AccountID": "..." },
    "Amount": 3500.00,
    "Date": "2026-01-15",
    "Reference": "PAY-001"
  }]
}
```

### Get Payments for Invoice
GET /api.xro/2.0/Invoices/{InvoiceID}
Response includes Payments array
</xero_api_reference>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Add XeroContactMapping and XeroPaymentMapping models

# 2. Run migration
npx prisma migrate dev --name add_xero_contact_payment_mappings

# 3. Create DTOs
# Create apps/api/src/integrations/xero/dto/xero-contact.dto.ts
# Create apps/api/src/integrations/xero/dto/xero-payment.dto.ts

# 4. Create services
# Create apps/api/src/integrations/xero/xero-contact.service.ts
# Create apps/api/src/integrations/xero/xero-payment.service.ts

# 5. Update module
# Edit apps/api/src/integrations/xero/xero.module.ts

# 6. Create tests
# Create apps/api/tests/integrations/xero/xero-contact.service.spec.ts
# Create apps/api/tests/integrations/xero/xero-payment.service.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Contact matching by email before creating new
    - Payment must be allocated to correct invoice
    - Amount conversion cents <-> Rands
    - Rate limiting on all API calls
    - Mapping records for all synced entities
    - No duplicate syncs
    - SA phone number format support (+27...)
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Create contact in Xero from Parent
    - Test: Find existing contact by email
    - Test: Contact mapping created
    - Test: Push payment to Xero
    - Test: Pull payment from Xero
    - Test: Payment allocated to correct invoice
    - Test: Amount conversion correct
    - Test: Duplicate prevention
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Create duplicate contacts in Xero
  - Skip email lookup before creating contact
  - Store Xero data locally (just mappings)
  - Skip rate limiting
  - Allocate payment to wrong invoice
  - Ignore partial payment scenarios
</anti_patterns>

</task_spec>
