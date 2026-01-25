<task_spec id="TASK-ACCT-001" version="2.0">

<metadata>
  <title>Native Chart of Accounts Foundation</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>foundation</layer>
  <sequence>401</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-ACCT-COA-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks relies entirely on Xero integration for chart of accounts management.
  Tenants without Xero have no native account management capability.
  Stub and other accounting software provide native chart of accounts editing.

  **Gap Analysis:**
  - No native ChartOfAccount model in schema
  - XeroAccount model exists but is sync-only from Xero
  - No way to manage accounts for non-Xero users
  - Cannot customize account codes/names locally

  **Files to Create:**
  - packages/database/prisma/migrations/xxx_add_chart_of_accounts/migration.sql
  - apps/api/src/database/entities/chart-of-account.entity.ts
  - apps/api/src/database/repositories/chart-of-account.repository.ts
  - apps/api/src/database/services/chart-of-account.service.ts

  **Files to Modify:**
  - packages/database/prisma/schema.prisma (ADD ChartOfAccount model)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Prisma Model Definition
  ```prisma
  // packages/database/prisma/schema.prisma

  enum AccountType {
    ASSET
    LIABILITY
    EQUITY
    REVENUE
    EXPENSE
  }

  enum AccountSubType {
    CURRENT_ASSET
    FIXED_ASSET
    CURRENT_LIABILITY
    LONG_TERM_LIABILITY
    OWNERS_EQUITY
    RETAINED_EARNINGS
    OPERATING_REVENUE
    OTHER_REVENUE
    COST_OF_SALES
    OPERATING_EXPENSE
    OTHER_EXPENSE
  }

  model ChartOfAccount {
    id              String         @id @default(cuid())
    tenantId        String
    code            String         // e.g., "1000", "4100", "5200"
    name            String         // e.g., "Bank Account", "Tuition Revenue"
    type            AccountType
    subType         AccountSubType?
    parentId        String?        // For hierarchical accounts
    description     String?
    taxRate         VatType?       // Default VAT treatment
    isEducationExempt Boolean      @default(false) // Section 12(h)
    isSystem        Boolean        @default(false) // Protect system accounts
    isActive        Boolean        @default(true)
    xeroAccountId   String?        // Link to Xero if synced

    createdAt       DateTime       @default(now())
    updatedAt       DateTime       @updatedAt

    tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    parent          ChartOfAccount? @relation("AccountHierarchy", fields: [parentId], references: [id])
    children        ChartOfAccount[] @relation("AccountHierarchy")
    xeroAccount     XeroAccount?   @relation(fields: [xeroAccountId], references: [id])

    @@unique([tenantId, code])
    @@index([tenantId, type])
    @@index([tenantId, isActive])
  }
  ```

  ### 3. Service Implementation
  ```typescript
  // apps/api/src/database/services/chart-of-account.service.ts
  @Injectable()
  export class ChartOfAccountService {
    constructor(
      private readonly repository: ChartOfAccountRepository,
      private readonly auditService: AuditLogService,
    ) {}

    async seedDefaultAccounts(tenantId: string): Promise<void> {
      const defaults = this.getDefaultCrecheAccounts();

      for (const account of defaults) {
        await this.repository.create({
          ...account,
          tenantId,
          isSystem: true,
        });
      }
    }

    private getDefaultCrecheAccounts(): Partial<ChartOfAccount>[] {
      return [
        // ASSETS
        { code: '1000', name: 'Bank Account', type: 'ASSET', subType: 'CURRENT_ASSET' },
        { code: '1100', name: 'Accounts Receivable - Parents', type: 'ASSET', subType: 'CURRENT_ASSET' },
        { code: '1200', name: 'Petty Cash', type: 'ASSET', subType: 'CURRENT_ASSET' },
        { code: '1500', name: 'Fixed Assets - Equipment', type: 'ASSET', subType: 'FIXED_ASSET' },
        { code: '1510', name: 'Accumulated Depreciation', type: 'ASSET', subType: 'FIXED_ASSET' },

        // LIABILITIES
        { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
        { code: '2100', name: 'VAT Payable', type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
        { code: '2200', name: 'PAYE Payable', type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
        { code: '2300', name: 'UIF Payable', type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },
        { code: '2400', name: 'Deposits Held - Registration', type: 'LIABILITY', subType: 'CURRENT_LIABILITY' },

        // EQUITY
        { code: '3000', name: "Owner's Equity", type: 'EQUITY', subType: 'OWNERS_EQUITY' },
        { code: '3100', name: 'Retained Earnings', type: 'EQUITY', subType: 'RETAINED_EARNINGS' },

        // REVENUE
        { code: '4000', name: 'Tuition Fees', type: 'REVENUE', subType: 'OPERATING_REVENUE', isEducationExempt: true },
        { code: '4100', name: 'Registration Fees', type: 'REVENUE', subType: 'OPERATING_REVENUE', isEducationExempt: true },
        { code: '4200', name: 'Extra-Mural Income', type: 'REVENUE', subType: 'OTHER_REVENUE' },
        { code: '4300', name: 'Uniform Sales', type: 'REVENUE', subType: 'OTHER_REVENUE' },
        { code: '4400', name: 'Meal Charges', type: 'REVENUE', subType: 'OTHER_REVENUE' },
        { code: '4500', name: 'Transport Fees', type: 'REVENUE', subType: 'OTHER_REVENUE' },
        { code: '4900', name: 'Other Income', type: 'REVENUE', subType: 'OTHER_REVENUE' },

        // EXPENSES
        { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5100', name: 'UIF Contributions (Employer)', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5200', name: 'SDL Levy', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5300', name: 'Rent', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5400', name: 'Utilities', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5500', name: 'Educational Supplies', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5600', name: 'Food & Catering', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5700', name: 'Insurance', type: 'EXPENSE', subType: 'OPERATING_EXPENSE' },
        { code: '5800', name: 'Bank Charges', type: 'EXPENSE', subType: 'OTHER_EXPENSE' },
        { code: '5900', name: 'Depreciation', type: 'EXPENSE', subType: 'OTHER_EXPENSE' },
        { code: '6000', name: 'Professional Fees', type: 'EXPENSE', subType: 'OTHER_EXPENSE' },
        { code: '9999', name: 'Suspense Account', type: 'ASSET', subType: 'CURRENT_ASSET' },
      ];
    }
  }
  ```

  ### 4. Repository Implementation
  ```typescript
  // apps/api/src/database/repositories/chart-of-account.repository.ts
  @Injectable()
  export class ChartOfAccountRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(tenantId: string, includeInactive = false) {
      return this.prisma.chartOfAccount.findMany({
        where: {
          tenantId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: { code: 'asc' },
        include: { parent: true, children: true },
      });
    }

    async findByCode(tenantId: string, code: string) {
      return this.prisma.chartOfAccount.findUnique({
        where: { tenantId_code: { tenantId, code } },
      });
    }

    async findByType(tenantId: string, type: AccountType) {
      return this.prisma.chartOfAccount.findMany({
        where: { tenantId, type, isActive: true },
        orderBy: { code: 'asc' },
      });
    }
  }
  ```
</critical_patterns>

<context>
This task creates the foundation for native chart of accounts management in CrecheBooks.
It enables tenants to manage their own account structure without requiring Xero integration.

**Business Rules:**
1. Each tenant gets default creche-specific accounts on creation
2. System accounts cannot be deleted, only deactivated
3. Account codes must be unique per tenant
4. Accounts can be linked to Xero accounts when integrated
5. Education-exempt accounts are flagged for Section 12(h) VAT treatment

**SA Compliance:**
- Default accounts include VAT, PAYE, UIF, SDL payables
- Revenue accounts mark education-exempt status for Section 12(h)
- Suspense account (9999) for unreconciled transactions
</context>

<scope>
  <in_scope>
    - Prisma schema for ChartOfAccount model
    - Database migration
    - ChartOfAccountRepository with CRUD operations
    - ChartOfAccountService with default account seeding
    - Unit tests for service and repository
    - Integration with existing XeroAccount model
  </in_scope>
  <out_of_scope>
    - API endpoints (TASK-ACCT-031)
    - Frontend UI (TASK-ACCT-041)
    - Xero sync bidirectional (existing XeroAccount handles this)
    - Journal entry creation (TASK-ACCT-002)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate migration
cd packages/database && pnpm prisma migrate dev --name add_chart_of_accounts

# 2. Build must pass
cd apps/api && pnpm run build

# 3. Run unit tests
pnpm test -- --testPathPattern="chart-of-account" --runInBand

# 4. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] ChartOfAccount model added to Prisma schema
  - [ ] AccountType and AccountSubType enums defined
  - [ ] Migration created and applied successfully
  - [ ] ChartOfAccountRepository with findAll, findByCode, findByType, create, update
  - [ ] ChartOfAccountService with seedDefaultAccounts method
  - [ ] 30+ default creche accounts defined
  - [ ] Unit tests for repository (90%+ coverage)
  - [ ] Unit tests for service (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** allow deleting system accounts
  - **NEVER** allow duplicate account codes within tenant
  - **NEVER** modify XeroAccount sync behavior - this is additive
  - **NEVER** hardcode tenant-specific account codes
</anti_patterns>

</task_spec>
