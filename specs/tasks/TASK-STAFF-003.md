<task_spec id="TASK-STAFF-003" version="1.0">

<metadata>
  <title>Xero Integration for Payroll Journal Entries</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>173</sequence>
  <implements>
    <requirement_ref>REQ-XERO-010</requirement_ref>
    <requirement_ref>REQ-XERO-011</requirement_ref>
    <requirement_ref>REQ-INT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-MCP-001</task_ref>
    <task_ref status="complete">TASK-SARS-012</task_ref>
    <task_ref status="complete">TASK-SARS-013</task_ref>
    <task_ref status="complete">TASK-XERO-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2026-01-07</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Xero Infrastructure

  **Existing Components:**
  - xero-node package installed
  - XeroToken entity for OAuth tokens
  - XeroSyncService for transaction sync
  - XeroConnectionWidget for connection status
  - OAuth 2.0 flow implemented

  **Existing Payroll Infrastructure:**
  - PayrollWizard component
  - PAYE calculation service (2024/2025 brackets)
  - UIF calculation service
  - EMP201 generation service
  - Staff and Payroll entities

  **Missing Components:**
  - Manual Journals posting for payroll
  - Chart of accounts mapping for payroll
  - Payroll journal entry templates
  - Xero payroll sync service
</project_state>

<context>
  ## Xero API Integration Context

  ### Critical Finding: No Native SA Payroll API
  Xero does NOT have a Payroll API for South Africa. Available only for:
  - Australia (PayrollAU)
  - UK (PayrollUK)
  - New Zealand (PayrollNZ)
  - US (PayrollUS)

  ### Solution: Manual Journals API
  Post payroll to Xero as journal entries using the Manual Journals endpoint.

  ### Xero OAuth 2.0 Requirements:
  - Authorization Code Flow
  - Access tokens expire in 30 minutes
  - Refresh tokens expire after 60 days of non-use
  - Required scopes: `accounting.transactions`, `accounting.settings`

  ### Xero Rate Limits:
  - 60 calls/minute per organization
  - 5,000 calls/day per organization
  - 5 concurrent requests maximum

  ### Standard SA Chart of Accounts for Payroll:
  - 6100: Salaries & Wages Expense
  - 6110: UIF Employer Contribution
  - 6120: Skills Development Levy
  - 2200: PAYE Payable
  - 2210: UIF Payable
  - 2220: Pension Payable
  - 2100: Net Pay Payable (Clearing)
</context>

<scope>
  <in_scope>
    - Create Xero payroll journal service
    - Implement chart of accounts mapping UI
    - Build payroll journal entry templates
    - Add payroll sync status tracking
    - Create Xero account mapping entity
    - Implement journal posting API
    - Add sync error handling and retry
    - Create payroll-to-Xero reconciliation view
  </in_scope>
  <out_of_scope>
    - Xero native payroll API (not available for SA)
    - SimplePay integration (TASK-STAFF-004)
    - Bank feed integration (already exists)
    - Invoice sync (already implemented)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- DATA MODEL ADDITIONS                        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma

```prisma
enum XeroAccountType {
  SALARY_EXPENSE
  UIF_EMPLOYER_EXPENSE
  SDL_EXPENSE
  PENSION_EXPENSE
  PAYE_PAYABLE
  UIF_PAYABLE
  SDL_PAYABLE
  PENSION_PAYABLE
  NET_PAY_CLEARING
  BONUS_EXPENSE
  OVERTIME_EXPENSE
  OTHER_DEDUCTION
}

enum PayrollJournalStatus {
  PENDING
  POSTED
  FAILED
  CANCELLED
}

model XeroAccountMapping {
  id                String           @id @default(uuid())
  tenantId          String           @map("tenant_id")
  accountType       XeroAccountType  @map("account_type")
  xeroAccountId     String           @map("xero_account_id") @db.VarChar(50)
  xeroAccountCode   String           @map("xero_account_code") @db.VarChar(20)
  xeroAccountName   String           @map("xero_account_name") @db.VarChar(200)
  isActive          Boolean          @default(true) @map("is_active")
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  tenant            Tenant           @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, accountType])
  @@index([tenantId])
  @@map("xero_account_mappings")
}

model PayrollJournal {
  id                  String               @id @default(uuid())
  tenantId            String               @map("tenant_id")
  payrollId           String               @map("payroll_id")
  xeroJournalId       String?              @map("xero_journal_id") @db.VarChar(50)
  journalNumber       String?              @map("journal_number") @db.VarChar(50)
  payPeriodStart      DateTime             @map("pay_period_start") @db.Date
  payPeriodEnd        DateTime             @map("pay_period_end") @db.Date
  status              PayrollJournalStatus @default(PENDING)
  totalDebitCents     Int                  @map("total_debit_cents")
  totalCreditCents    Int                  @map("total_credit_cents")
  narration           String               @db.VarChar(500)
  postedAt            DateTime?            @map("posted_at")
  errorMessage        String?              @map("error_message")
  retryCount          Int                  @default(0) @map("retry_count")
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")

  tenant              Tenant               @relation(fields: [tenantId], references: [id])
  payroll             Payroll              @relation(fields: [payrollId], references: [id])
  journalLines        PayrollJournalLine[]

  @@unique([tenantId, payrollId])
  @@index([tenantId, status])
  @@map("payroll_journals")
}

model PayrollJournalLine {
  id                String         @id @default(uuid())
  journalId         String         @map("journal_id")
  accountType       XeroAccountType @map("account_type")
  xeroAccountCode   String         @map("xero_account_code") @db.VarChar(20)
  description       String         @db.VarChar(255)
  debitCents        Int            @default(0) @map("debit_cents")
  creditCents       Int            @default(0) @map("credit_cents")
  sortOrder         Int            @default(0) @map("sort_order")

  journal           PayrollJournal @relation(fields: [journalId], references: [id], onDelete: Cascade)

  @@index([journalId])
  @@map("payroll_journal_lines")
}
```

## Update Tenant model - ADD relations:
```prisma
model Tenant {
  // ... existing fields ...

  xeroAccountMappings  XeroAccountMapping[]
  payrollJournals      PayrollJournal[]

  @@map("tenants")
}

## Update Payroll model - ADD relation:
model Payroll {
  // ... existing fields ...

  payrollJournal       PayrollJournal?

  @@map("payroll")
}
```
</prisma_schema_additions>

<!-- ============================================ -->
<!-- SERVICE IMPLEMENTATION                       -->
<!-- ============================================ -->

<service_files>
## src/database/services/xero-payroll-journal.service.ts

```typescript
/**
 * Xero Payroll Journal Service
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * Posts payroll to Xero as manual journal entries since
 * Xero does not have a native Payroll API for South Africa.
 */

import { XeroClient, ManualJournal, ManualJournalLine } from 'xero-node';

@Injectable()
export class XeroPayrollJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xeroClient: XeroClient,
    private readonly xeroTokenService: XeroTokenService,
  ) {}

  /**
   * Create payroll journal entry for posting to Xero
   * Does NOT post - just creates the record
   */
  async createPayrollJournal(
    payrollId: string,
  ): Promise<PayrollJournal>

  /**
   * Generate journal lines from payroll data
   * Maps payroll components to Xero accounts
   */
  async generateJournalLines(
    tenantId: string,
    payroll: Payroll,
  ): Promise<PayrollJournalLineInput[]>

  /**
   * Post journal entry to Xero
   * Uses Manual Journals API endpoint
   */
  async postToXero(journalId: string): Promise<PayrollJournal>

  /**
   * Build Xero ManualJournal object from our data
   */
  buildXeroJournal(
    journal: PayrollJournal,
    lines: PayrollJournalLine[],
    mappings: XeroAccountMapping[],
  ): ManualJournal

  /**
   * Get posting status for payroll
   */
  async getJournalStatus(payrollId: string): Promise<PayrollJournal | null>

  /**
   * Retry failed journal posting
   */
  async retryPosting(journalId: string): Promise<PayrollJournal>

  /**
   * Cancel pending journal (before posting)
   */
  async cancelJournal(journalId: string): Promise<void>

  /**
   * Get unposted journals for tenant
   */
  async getPendingJournals(tenantId: string): Promise<PayrollJournal[]>

  /**
   * Bulk post multiple payroll journals
   */
  async bulkPostToXero(journalIds: string[]): Promise<BulkPostResult>
}
```

## src/database/services/xero-account-mapping.service.ts

```typescript
/**
 * Xero Account Mapping Service
 * Maps CrecheBooks payroll components to Xero chart of accounts
 */

@Injectable()
export class XeroAccountMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xeroClient: XeroClient,
    private readonly xeroTokenService: XeroTokenService,
  ) {}

  /**
   * Get all account mappings for tenant
   */
  async getMappings(tenantId: string): Promise<XeroAccountMapping[]>

  /**
   * Create or update account mapping
   */
  async upsertMapping(
    tenantId: string,
    accountType: XeroAccountType,
    xeroAccountId: string,
    xeroAccountCode: string,
    xeroAccountName: string,
  ): Promise<XeroAccountMapping>

  /**
   * Fetch available accounts from Xero
   * Filters to relevant account types (expense, liability)
   */
  async fetchXeroAccounts(tenantId: string): Promise<XeroAccount[]>

  /**
   * Get suggested mappings based on account names
   * Matches common SA payroll account names
   */
  suggestMappings(xeroAccounts: XeroAccount[]): SuggestedMapping[]

  /**
   * Validate all required mappings exist
   */
  async validateMappings(tenantId: string): Promise<ValidationResult>

  /**
   * Get mapping for specific account type
   */
  async getMapping(
    tenantId: string,
    accountType: XeroAccountType,
  ): Promise<XeroAccountMapping | null>
}
```
</service_files>

<!-- ============================================ -->
<!-- API ENDPOINTS                                -->
<!-- ============================================ -->

<api_endpoints>
## src/api/xero/payroll-journal.controller.ts

```typescript
@Controller('xero/payroll-journals')
@UseGuards(JwtAuthGuard, TenantGuard)
export class XeroPayrollJournalController {
  constructor(
    private readonly journalService: XeroPayrollJournalService,
  ) {}

  @Post(':payrollId')
  async createJournal(@Param('payrollId') payrollId: string)

  @Get(':payrollId')
  async getJournalStatus(@Param('payrollId') payrollId: string)

  @Post(':journalId/post')
  async postToXero(@Param('journalId') journalId: string)

  @Post(':journalId/retry')
  async retryPosting(@Param('journalId') journalId: string)

  @Delete(':journalId')
  async cancelJournal(@Param('journalId') journalId: string)

  @Get()
  async getPendingJournals(@CurrentTenant() tenantId: string)

  @Post('bulk-post')
  async bulkPostToXero(@Body() dto: BulkPostDto)
}

@Controller('xero/account-mappings')
@UseGuards(JwtAuthGuard, TenantGuard)
export class XeroAccountMappingController {
  constructor(
    private readonly mappingService: XeroAccountMappingService,
  ) {}

  @Get()
  async getMappings(@CurrentTenant() tenantId: string)

  @Post()
  async upsertMapping(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpsertMappingDto,
  )

  @Get('xero-accounts')
  async fetchXeroAccounts(@CurrentTenant() tenantId: string)

  @Get('suggestions')
  async getSuggestions(@CurrentTenant() tenantId: string)

  @Get('validate')
  async validateMappings(@CurrentTenant() tenantId: string)
}
```
</api_endpoints>

<!-- ============================================ -->
<!-- UI COMPONENTS                                -->
<!-- ============================================ -->

<ui_components>
## apps/web/src/components/xero/AccountMappingForm.tsx

Form component for mapping CrecheBooks accounts to Xero:
- Dropdown for each payroll component type
- Fetches Xero accounts on mount
- Shows suggested mappings
- Validates required mappings

## apps/web/src/components/xero/PayrollJournalPreview.tsx

Preview component showing:
- Journal entry date and narration
- Debit/credit line items
- Account codes and descriptions
- Total debits = total credits validation
- Post to Xero button

## apps/web/src/components/xero/PayrollSyncStatus.tsx

Status component showing:
- Last sync date/time
- Pending journals count
- Failed journals with retry option
- Sync error messages

## apps/web/src/app/(dashboard)/settings/xero/payroll/page.tsx

Settings page for:
- Account mappings configuration
- Default narration template
- Auto-post on approval toggle
- Sync history view
</ui_components>

<!-- ============================================ -->
<!-- JOURNAL ENTRY TEMPLATE                       -->
<!-- ============================================ -->

<journal_template>
## Standard Payroll Journal Entry

```
Date: [Pay Period End Date]
Narration: Payroll for [Month Year] - [Pay Run Description]

DEBIT:
  6100 Salaries & Wages       R 50,000.00
  6110 UIF Employer             R    500.00
  6120 SDL (if applicable)      R    500.00
  6130 Pension Employer         R  2,000.00
                              ─────────────
  Total Debits                R 53,000.00

CREDIT:
  2200 PAYE Payable             R 12,000.00
  2210 UIF Payable              R  1,000.00  (employee + employer)
  2220 SDL Payable              R    500.00
  2230 Pension Payable          R  3,500.00  (employee + employer)
  2100 Net Pay Clearing         R 36,000.00
                              ─────────────
  Total Credits               R 53,000.00
```

## Xero API Request Format

```typescript
const manualJournal: ManualJournal = {
  narration: 'Payroll for January 2026',
  date: '2026-01-31',
  status: 'DRAFT', // or 'POSTED'
  journalLines: [
    {
      lineAmount: 50000.00,
      accountCode: '6100',
      description: 'Salaries & Wages - January 2026',
    },
    {
      lineAmount: 500.00,
      accountCode: '6110',
      description: 'UIF Employer Contribution',
    },
    {
      lineAmount: -12000.00, // Negative for credit
      accountCode: '2200',
      description: 'PAYE Payable',
    },
    // ... more lines
  ],
};
```
</journal_template>

<!-- ============================================ -->
<!-- VERIFICATION                                 -->
<!-- ============================================ -->

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
npx prisma migrate dev --name add_xero_payroll_journal

# 2. Generate Prisma client
npx prisma generate

# 3. Create entity files
# - src/database/entities/xero-account-mapping.entity.ts
# - src/database/entities/payroll-journal.entity.ts

# 4. Create DTO files
# - src/database/dto/xero-account-mapping.dto.ts
# - src/database/dto/payroll-journal.dto.ts

# 5. Create repository files
# - src/database/repositories/xero-account-mapping.repository.ts
# - src/database/repositories/payroll-journal.repository.ts

# 6. Create service files
# - src/database/services/xero-payroll-journal.service.ts
# - src/database/services/xero-account-mapping.service.ts

# 7. Create controller files
# - src/api/xero/payroll-journal.controller.ts
# - src/api/xero/account-mapping.controller.ts

# 8. Create UI components
# - apps/web/src/components/xero/AccountMappingForm.tsx
# - apps/web/src/components/xero/PayrollJournalPreview.tsx
# - apps/web/src/components/xero/PayrollSyncStatus.tsx
# - apps/web/src/app/(dashboard)/settings/xero/payroll/page.tsx

# 9. Update API hooks
# - apps/web/src/hooks/use-xero-payroll.ts

# 10. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All required account mappings must exist before posting
    - Journal debits must equal credits (balanced entry)
    - Use Xero Manual Journals API (not Payroll API)
    - Handle OAuth token refresh automatically
    - Respect Xero rate limits (60/min, 5000/day)
    - Store all amounts in cents, convert to Rands for Xero
    - Implement retry with exponential backoff on 429/500
    - Journal cannot be cancelled after posting to Xero
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - Account mapping form saves correctly
    - Journal preview shows balanced entry
    - Post to Xero succeeds with valid tokens
    - Failed posts can be retried
    - Xero journal appears in Xero UI
    - Rate limiting handled gracefully
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use Xero Payroll API (not available for SA)
  - Post unbalanced journal entries
  - Ignore rate limit headers
  - Store OAuth tokens in plain text
  - Post to Xero without user confirmation
  - Retry immediately on 429 errors
  - Delete posted journals (void in Xero instead)
</anti_patterns>

</task_spec>
