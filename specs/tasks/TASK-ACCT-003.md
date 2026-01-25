<task_spec id="TASK-ACCT-003" version="2.0">

<metadata>
  <title>Opening Balances Wizard Service</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>logic</layer>
  <sequence>403</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ACCT-OB-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ACCT-001</task_ref>
    <task_ref status="ready">TASK-ACCT-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  New CrecheBooks tenants have no way to enter opening balances from a prior system.
  Stub provides dedicated opening balance setup during onboarding.

  **Gap:**
  - No OpeningBalance model in schema
  - No migration wizard for new tenants
  - Balance sheet shows incorrect retained earnings
  - No way to import historical balances

  **Files to Create:**
  - packages/database/prisma/migrations/xxx_add_opening_balances/migration.sql
  - apps/api/src/database/entities/opening-balance.entity.ts
  - apps/api/src/database/repositories/opening-balance.repository.ts
  - apps/api/src/database/services/opening-balance.service.ts
  - apps/api/src/database/dto/opening-balance.dto.ts

  **Files to Modify:**
  - packages/database/prisma/schema.prisma (ADD OpeningBalance model)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Prisma Model
  ```prisma
  // packages/database/prisma/schema.prisma

  model OpeningBalance {
    id              String         @id @default(cuid())
    tenantId        String
    accountId       String         // Links to ChartOfAccount
    asOfDate        DateTime       // Opening balance date (start of financial year)
    debitCents      Int?           // Debit balance in cents
    creditCents     Int?           // Credit balance in cents
    notes           String?

    // Audit fields
    enteredById     String
    enteredAt       DateTime       @default(now())
    updatedAt       DateTime       @updatedAt

    // Verification
    isVerified      Boolean        @default(false)
    verifiedById    String?
    verifiedAt      DateTime?

    tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    account         ChartOfAccount @relation(fields: [accountId], references: [id])
    enteredBy       User           @relation("OpeningBalanceEnteredBy", fields: [enteredById], references: [id])
    verifiedBy      User?          @relation("OpeningBalanceVerifiedBy", fields: [verifiedById], references: [id])

    @@unique([tenantId, accountId, asOfDate])
    @@index([tenantId, asOfDate])
  }

  model OpeningBalanceImport {
    id              String         @id @default(cuid())
    tenantId        String
    asOfDate        DateTime
    status          OpeningBalanceImportStatus @default(DRAFT)
    totalDebits     Int            @default(0)
    totalCredits    Int            @default(0)
    discrepancy     Int            @default(0)  // Should be 0 when balanced

    createdById     String
    createdAt       DateTime       @default(now())
    completedAt     DateTime?

    tenant          Tenant         @relation(fields: [tenantId], references: [id])
    createdBy       User           @relation(fields: [createdById], references: [id])

    @@index([tenantId, status])
  }

  enum OpeningBalanceImportStatus {
    DRAFT
    PENDING_VERIFICATION
    VERIFIED
    COMPLETED
    CANCELLED
  }
  ```

  ### 3. Service Implementation
  ```typescript
  // apps/api/src/database/services/opening-balance.service.ts
  @Injectable()
  export class OpeningBalanceService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly chartOfAccountService: ChartOfAccountService,
      private readonly auditService: AuditLogService,
    ) {}

    async createImport(tenantId: string, asOfDate: Date, userId: string): Promise<OpeningBalanceImport> {
      // Check if import already exists for this date
      const existing = await this.prisma.openingBalanceImport.findFirst({
        where: { tenantId, asOfDate, status: { not: 'CANCELLED' } },
      });

      if (existing) {
        throw new ConflictException(`Opening balance import already exists for ${asOfDate}`);
      }

      return this.prisma.openingBalanceImport.create({
        data: {
          tenantId,
          asOfDate,
          createdById: userId,
        },
      });
    }

    async setAccountBalance(
      tenantId: string,
      importId: string,
      accountId: string,
      debitCents: number | null,
      creditCents: number | null,
      userId: string,
      notes?: string,
    ): Promise<OpeningBalance> {
      const importRecord = await this.prisma.openingBalanceImport.findUnique({
        where: { id: importId },
      });

      if (!importRecord || importRecord.tenantId !== tenantId) {
        throw new NotFoundException('Import not found');
      }

      if (importRecord.status === 'COMPLETED') {
        throw new BadRequestException('Import already completed');
      }

      // Upsert the opening balance
      const balance = await this.prisma.openingBalance.upsert({
        where: {
          tenantId_accountId_asOfDate: {
            tenantId,
            accountId,
            asOfDate: importRecord.asOfDate,
          },
        },
        create: {
          tenantId,
          accountId,
          asOfDate: importRecord.asOfDate,
          debitCents,
          creditCents,
          notes,
          enteredById: userId,
        },
        update: {
          debitCents,
          creditCents,
          notes,
        },
      });

      // Update import totals
      await this.recalculateImportTotals(importId);

      return balance;
    }

    async recalculateImportTotals(importId: string): Promise<void> {
      const importRecord = await this.prisma.openingBalanceImport.findUnique({
        where: { id: importId },
      });

      if (!importRecord) return;

      const balances = await this.prisma.openingBalance.findMany({
        where: {
          tenantId: importRecord.tenantId,
          asOfDate: importRecord.asOfDate,
        },
      });

      const totalDebits = balances.reduce((sum, b) => sum + (b.debitCents || 0), 0);
      const totalCredits = balances.reduce((sum, b) => sum + (b.creditCents || 0), 0);
      const discrepancy = totalDebits - totalCredits;

      await this.prisma.openingBalanceImport.update({
        where: { id: importId },
        data: { totalDebits, totalCredits, discrepancy },
      });
    }

    async verifyImport(importId: string, userId: string): Promise<OpeningBalanceImport> {
      const importRecord = await this.prisma.openingBalanceImport.findUnique({
        where: { id: importId },
      });

      if (!importRecord) {
        throw new NotFoundException('Import not found');
      }

      if (importRecord.discrepancy !== 0) {
        throw new BadRequestException(
          `Cannot verify import with discrepancy of ${importRecord.discrepancy} cents. Debits must equal credits.`
        );
      }

      // Mark all balances as verified
      await this.prisma.openingBalance.updateMany({
        where: {
          tenantId: importRecord.tenantId,
          asOfDate: importRecord.asOfDate,
        },
        data: {
          isVerified: true,
          verifiedById: userId,
          verifiedAt: new Date(),
        },
      });

      return this.prisma.openingBalanceImport.update({
        where: { id: importId },
        data: {
          status: 'VERIFIED',
        },
      });
    }

    async completeImport(importId: string, userId: string): Promise<OpeningBalanceImport> {
      const importRecord = await this.prisma.openingBalanceImport.findUnique({
        where: { id: importId },
      });

      if (!importRecord) {
        throw new NotFoundException('Import not found');
      }

      if (importRecord.status !== 'VERIFIED') {
        throw new BadRequestException('Import must be verified before completion');
      }

      // Create journal entries for opening balances
      await this.createOpeningJournalEntries(importRecord);

      // Audit log
      await this.auditService.log({
        tenantId: importRecord.tenantId,
        userId,
        action: 'OPENING_BALANCE_COMPLETED',
        resourceType: 'OpeningBalanceImport',
        resourceId: importId,
        metadata: {
          asOfDate: importRecord.asOfDate,
          totalDebits: importRecord.totalDebits,
          totalCredits: importRecord.totalCredits,
        },
      });

      return this.prisma.openingBalanceImport.update({
        where: { id: importId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    private async createOpeningJournalEntries(importRecord: OpeningBalanceImport): Promise<void> {
      // Opening balances create a special "opening balance" journal
      // This is recorded as of the asOfDate
      // Implementation depends on journal entry system (TASK-ACCT-004)
    }

    async getOpeningBalanceForAccount(
      tenantId: string,
      accountCode: string,
      asOfDate: Date,
    ): Promise<number> {
      const account = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: accountCode },
      });

      if (!account) return 0;

      const balance = await this.prisma.openingBalance.findFirst({
        where: {
          tenantId,
          accountId: account.id,
          asOfDate: { lte: asOfDate },
          isVerified: true,
        },
        orderBy: { asOfDate: 'desc' },
      });

      if (!balance) return 0;

      // Return net balance (debit - credit for debit-normal accounts)
      const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);
      const netBalance = (balance.debitCents || 0) - (balance.creditCents || 0);

      return isDebitNormal ? netBalance : -netBalance;
    }
  }
  ```

  ### 4. Migration Wizard Steps
  ```typescript
  // Wizard flow documentation
  const migrationWizardSteps = [
    {
      step: 1,
      title: 'Select Migration Date',
      description: 'Choose the date for opening balances (usually start of financial year)',
      action: 'createImport',
    },
    {
      step: 2,
      title: 'Enter Bank Balances',
      description: 'Enter balances for all bank accounts',
      accounts: ['1000', '1200'], // Bank, Petty Cash
    },
    {
      step: 3,
      title: 'Enter Receivables',
      description: 'Enter total outstanding parent balances',
      accounts: ['1100'], // Accounts Receivable
      note: 'Individual parent balances entered separately in billing module',
    },
    {
      step: 4,
      title: 'Enter Payables',
      description: 'Enter any outstanding bills/liabilities',
      accounts: ['2000', '2100', '2200', '2300'], // AP, VAT, PAYE, UIF
    },
    {
      step: 5,
      title: 'Enter Fixed Assets',
      description: 'Enter equipment and accumulated depreciation',
      accounts: ['1500', '1510'], // Fixed Assets, Acc Depreciation
    },
    {
      step: 6,
      title: 'Review & Verify',
      description: 'System calculates retained earnings to balance',
      action: 'verifyImport',
      note: 'Debits must equal credits',
    },
    {
      step: 7,
      title: 'Complete',
      description: 'Lock opening balances and create journal entries',
      action: 'completeImport',
    },
  ];
  ```
</critical_patterns>

<context>
This task enables new tenants to migrate from another system by entering opening balances.
It provides a structured wizard to ensure all account balances are correctly captured.

**Business Rules:**
1. Opening balances must balance (total debits = total credits)
2. Retained earnings is calculated as the balancing figure
3. Opening balances can only be entered once per financial year start
4. Changes require verification before completion
5. Completed imports are locked and cannot be modified

**Accounting Principles:**
- Opening balances represent the starting point for financial records
- Assets and Expenses are debit-normal (positive balances)
- Liabilities, Equity, and Revenue are credit-normal (positive balances)
- The accounting equation must hold: Assets = Liabilities + Equity
</context>

<scope>
  <in_scope>
    - OpeningBalance and OpeningBalanceImport models
    - Database migrations
    - OpeningBalanceService with wizard support
    - Balance verification (debits = credits)
    - Integration with GeneralLedgerService for balance queries
    - Unit tests for service methods
  </in_scope>
  <out_of_scope>
    - API endpoints (TASK-ACCT-033)
    - Frontend wizard UI (TASK-ACCT-043)
    - CSV/Excel import (future enhancement)
    - Parent-level balance migration (uses billing module)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate migration
cd packages/database && pnpm prisma migrate dev --name add_opening_balances

# 2. Build must pass
cd apps/api && pnpm run build

# 3. Run unit tests
pnpm test -- --testPathPattern="opening-balance" --runInBand

# 4. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] OpeningBalance model added to Prisma schema
  - [ ] OpeningBalanceImport model for wizard state
  - [ ] Migration created and applied
  - [ ] OpeningBalanceService with createImport, setAccountBalance, verifyImport, completeImport
  - [ ] Balance verification (discrepancy calculation)
  - [ ] Integration with ChartOfAccountService
  - [ ] Unit tests for all service methods (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** allow completion without verification
  - **NEVER** allow modification of completed imports
  - **NEVER** skip discrepancy check (debits must equal credits)
  - **NEVER** create opening balances without tenant isolation
</anti_patterns>

</task_spec>
