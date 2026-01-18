<task_spec id="TASK-XERO-009" version="2.0">

<metadata>
  <title>Implement Bidirectional Invoice Sync with Xero</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>190</sequence>
  <implements>
    <requirement_ref>REQ-XERO-INVOICE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-XERO-001</task_ref>
    <task_ref status="pending">TASK-XERO-008</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/integrations/xero/xero-invoice.service.ts` (NEW)
  - `apps/api/src/integrations/xero/dto/xero-invoice.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/integrations/xero/xero.module.ts`
  - `apps/api/prisma/schema.prisma` (add XeroInvoiceMapping model)

  **Current Problem:**
  Invoices created in CrecheBooks are not synced to Xero. Invoices created in Xero are not visible in CrecheBooks. This creates double-entry work and reconciliation issues.

  **Required Solution:**
  1. Push CrecheBooks invoices to Xero
  2. Pull Xero invoices to CrecheBooks
  3. Handle updates bidirectionally
  4. Conflict resolution strategy

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Invoice Mapping Model
  ```prisma
  model XeroInvoiceMapping {
    id                String   @id @default(uuid())
    tenantId          String   @map("tenant_id")
    invoiceId         String   @map("invoice_id")
    xeroInvoiceId     String   @map("xero_invoice_id")
    xeroInvoiceNumber String?  @map("xero_invoice_number")
    lastSyncedAt      DateTime @map("last_synced_at")
    syncDirection     String   @map("sync_direction") // PUSH, PULL, BIDIRECTIONAL
    syncStatus        String   @default("SYNCED") @map("sync_status")
    createdAt         DateTime @default(now()) @map("created_at")
    updatedAt         DateTime @updatedAt @map("updated_at")

    tenant  Tenant  @relation(fields: [tenantId], references: [id])
    invoice Invoice @relation(fields: [invoiceId], references: [id])

    @@unique([tenantId, invoiceId])
    @@unique([tenantId, xeroInvoiceId])
    @@index([tenantId, syncStatus])
    @@map("xero_invoice_mappings")
  }
  ```

  ### 3. Service Pattern
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class XeroInvoiceService {
    private readonly logger = new Logger(XeroInvoiceService.name);

    constructor(
      private readonly xeroClient: XeroClient,
      private readonly rateLimiter: XeroRateLimiter,
      private readonly prisma: PrismaService,
    ) {}

    /**
     * Push CrecheBooks invoice to Xero
     */
    async pushInvoice(tenantId: string, invoiceId: string): Promise<XeroInvoiceMapping> {
      await this.rateLimiter.acquireSlot(tenantId);

      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { lines: true, parent: true },
      });

      const xeroInvoice = this.mapToXeroInvoice(invoice);
      const response = await this.xeroClient.createInvoice(xeroInvoice);

      return this.createMapping(tenantId, invoiceId, response.InvoiceID, 'PUSH');
    }

    /**
     * Pull Xero invoices to CrecheBooks
     */
    async pullInvoices(tenantId: string, since?: Date): Promise<number> {
      await this.rateLimiter.acquireSlot(tenantId);

      const xeroInvoices = await this.xeroClient.getInvoices({
        modifiedSince: since,
        status: 'AUTHORISED,PAID',
      });

      let imported = 0;
      for (const xeroInvoice of xeroInvoices) {
        const existing = await this.findMappingByXeroId(tenantId, xeroInvoice.InvoiceID);
        if (!existing) {
          await this.importXeroInvoice(tenantId, xeroInvoice);
          imported++;
        }
      }

      return imported;
    }
  }
  ```

  ### 4. Xero Invoice Payload
  ```typescript
  interface XeroInvoice {
    Type: 'ACCREC'; // Accounts Receivable
    Contact: {
      ContactID?: string;
      Name: string;
      EmailAddress?: string;
    };
    Date: string; // YYYY-MM-DD
    DueDate: string;
    Reference?: string;
    LineAmountTypes: 'Exclusive' | 'Inclusive' | 'NoTax';
    LineItems: Array<{
      Description: string;
      Quantity: number;
      UnitAmount: number;
      AccountCode: string;
      TaxType?: string;
    }>;
    Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED';
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
This task implements bidirectional invoice synchronization between CrecheBooks and Xero. Invoices created in either system should be visible in both.

**Sync Direction:**
1. **PUSH** - CrecheBooks -> Xero (user creates invoice in CrecheBooks)
2. **PULL** - Xero -> CrecheBooks (user creates invoice in Xero)
3. **BIDIRECTIONAL** - Updates sync both ways

**Conflict Resolution:**
- Last-write-wins based on updatedAt timestamp
- Manual resolution flag for conflicts > 5 minutes apart

**Mapping Requirements:**
- Invoice ID <-> Xero Invoice ID
- Parent <-> Xero Contact
- Invoice Lines <-> Line Items
- Amount in cents <-> Amount in Rands (conversion)
</context>

<scope>
  <in_scope>
    - Create XeroInvoiceService with push/pull methods
    - Add XeroInvoiceMapping model to Prisma schema
    - Map CrecheBooks Invoice to Xero Invoice format
    - Map Xero Invoice to CrecheBooks Invoice format
    - Handle invoice status sync (DRAFT, SENT, PAID)
    - Handle line item sync with account codes
    - Handle contact/parent matching
    - Rate limit all API calls
    - Create comprehensive tests
  </in_scope>
  <out_of_scope>
    - Real-time webhooks (use polling for now)
    - Credit notes sync
    - Invoice attachments sync
    - Multi-currency invoices
    - Partial payments tracking
  </out_of_scope>
</scope>

<xero_invoice_api>
## Xero Invoice API Reference

### Create Invoice
POST /api.xro/2.0/Invoices
```json
{
  "Invoices": [{
    "Type": "ACCREC",
    "Contact": { "ContactID": "..." },
    "Date": "2026-01-15",
    "DueDate": "2026-02-15",
    "Reference": "INV-001",
    "LineAmountTypes": "Exclusive",
    "LineItems": [
      {
        "Description": "Tuition Fee - January 2026",
        "Quantity": 1,
        "UnitAmount": 3500.00,
        "AccountCode": "200"
      }
    ],
    "Status": "AUTHORISED"
  }]
}
```

### Get Invoices
GET /api.xro/2.0/Invoices
Query params: ModifiedAfter, Status, page, ContactIDs

### Update Invoice
POST /api.xro/2.0/Invoices/{InvoiceID}
</xero_invoice_api>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Add XeroInvoiceMapping model

# 2. Run migration
npx prisma migrate dev --name add_xero_invoice_mapping

# 3. Create DTO
# Create apps/api/src/integrations/xero/dto/xero-invoice.dto.ts

# 4. Create service
# Create apps/api/src/integrations/xero/xero-invoice.service.ts

# 5. Update module
# Edit apps/api/src/integrations/xero/xero.module.ts

# 6. Create tests
# Create apps/api/tests/integrations/xero/xero-invoice.service.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values converted correctly (cents <-> Rands)
    - Rate limiting enforced on all API calls
    - Mapping records created for all synced invoices
    - Duplicate sync prevention via mapping lookup
    - Invoice status mapped correctly
    - Line items synced with correct account codes
    - Contact/Parent matching by email or name
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Push invoice to Xero
    - Test: Pull invoices from Xero
    - Test: Duplicate prevention
    - Test: Status mapping (DRAFT/SENT/PAID)
    - Test: Line item mapping
    - Test: Contact matching
    - Test: Amount conversion (cents <-> Rands)
    - Test: Error handling for Xero API errors
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Skip rate limiting on any API call
  - Store Xero invoice data locally (just mapping)
  - Create duplicate mappings
  - Ignore invoice status differences
  - Hardcode account codes (use configurable mapping)
  - Skip contact matching step
</anti_patterns>

</task_spec>
