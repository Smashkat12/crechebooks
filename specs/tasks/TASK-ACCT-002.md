<task_spec id="TASK-ACCT-002" version="2.0">

<metadata>
  <title>General Ledger View Service</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>logic</layer>
  <sequence>402</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ACCT-GL-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ACCT-001</task_ref>
    <task_ref status="COMPLETE">TASK-RECON-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has journal entries stored in CategorizationJournal and PayrollJournal
  but no unified view to see the general ledger. Stub has a dedicated GL view.

  **Existing Resources:**
  - CategorizationJournal - Transaction categorization journals
  - PayrollJournal / PayrollJournalLine - Payroll posting journals
  - CategorizationMetric - Accuracy tracking

  **Gap:**
  - No unified general ledger query service
  - No way to view all journal entries by account
  - No running balance calculation
  - No drill-down to source documents

  **Files to Create:**
  - apps/api/src/database/services/general-ledger.service.ts
  - apps/api/src/database/dto/general-ledger.dto.ts

  **Files to Modify:**
  - None (uses existing journal models)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. General Ledger Service
  ```typescript
  // apps/api/src/database/services/general-ledger.service.ts
  import { Injectable } from '@nestjs/common';
  import { PrismaService } from '../prisma.service';
  import { Decimal } from '@prisma/client/runtime/library';

  export interface JournalEntry {
    id: string;
    date: Date;
    description: string;
    accountCode: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
    sourceType: 'CATEGORIZATION' | 'PAYROLL' | 'MANUAL' | 'INVOICE' | 'PAYMENT';
    sourceId: string;
    reference?: string;
  }

  export interface AccountLedger {
    accountCode: string;
    accountName: string;
    accountType: string;
    openingBalance: number;
    entries: JournalEntry[];
    closingBalance: number;
  }

  export interface GeneralLedgerQuery {
    tenantId: string;
    startDate: Date;
    endDate: Date;
    accountCode?: string;
    accountType?: string;
    sourceType?: string;
  }

  @Injectable()
  export class GeneralLedgerService {
    constructor(private readonly prisma: PrismaService) {}

    async getGeneralLedger(query: GeneralLedgerQuery): Promise<JournalEntry[]> {
      const { tenantId, startDate, endDate, accountCode, sourceType } = query;

      // Combine entries from all journal sources
      const [categorizationJournals, payrollJournals] = await Promise.all([
        this.getCategorizationJournals(tenantId, startDate, endDate, accountCode),
        this.getPayrollJournals(tenantId, startDate, endDate, accountCode),
      ]);

      const allEntries = [...categorizationJournals, ...payrollJournals];

      // Sort by date, then by id for consistency
      allEntries.sort((a, b) => {
        const dateCompare = a.date.getTime() - b.date.getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.id.localeCompare(b.id);
      });

      // Filter by source type if specified
      if (sourceType) {
        return allEntries.filter(e => e.sourceType === sourceType);
      }

      return allEntries;
    }

    async getAccountLedger(
      tenantId: string,
      accountCode: string,
      startDate: Date,
      endDate: Date,
    ): Promise<AccountLedger> {
      const account = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: accountCode },
      });

      if (!account) {
        throw new Error(`Account ${accountCode} not found`);
      }

      // Get opening balance (sum of all entries before startDate)
      const openingBalance = await this.calculateBalanceAsOf(
        tenantId,
        accountCode,
        startDate,
      );

      // Get entries for the period
      const entries = await this.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode,
      });

      // Calculate closing balance
      const periodNet = entries.reduce(
        (sum, e) => sum + (e.debitCents - e.creditCents),
        0,
      );
      const closingBalance = openingBalance + periodNet;

      return {
        accountCode,
        accountName: account.name,
        accountType: account.type,
        openingBalance,
        entries,
        closingBalance,
      };
    }

    private async getCategorizationJournals(
      tenantId: string,
      startDate: Date,
      endDate: Date,
      accountCode?: string,
    ): Promise<JournalEntry[]> {
      const journals = await this.prisma.categorizationJournal.findMany({
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
          ...(accountCode && {
            OR: [
              { debitAccountCode: accountCode },
              { creditAccountCode: accountCode },
            ],
          }),
        },
        include: {
          categorization: {
            include: { transaction: true },
          },
        },
      });

      // Each journal creates two entries (debit and credit)
      const entries: JournalEntry[] = [];

      for (const journal of journals) {
        // Debit entry
        entries.push({
          id: `${journal.id}-DR`,
          date: journal.createdAt,
          description: journal.categorization?.transaction?.description || 'Categorization',
          accountCode: journal.debitAccountCode,
          accountName: journal.debitAccountName || journal.debitAccountCode,
          debitCents: journal.amountCents,
          creditCents: 0,
          sourceType: 'CATEGORIZATION',
          sourceId: journal.categorizationId,
          reference: journal.categorization?.transaction?.reference,
        });

        // Credit entry
        entries.push({
          id: `${journal.id}-CR`,
          date: journal.createdAt,
          description: journal.categorization?.transaction?.description || 'Categorization',
          accountCode: journal.creditAccountCode,
          accountName: journal.creditAccountName || journal.creditAccountCode,
          debitCents: 0,
          creditCents: journal.amountCents,
          sourceType: 'CATEGORIZATION',
          sourceId: journal.categorizationId,
          reference: journal.categorization?.transaction?.reference,
        });
      }

      return entries;
    }

    private async getPayrollJournals(
      tenantId: string,
      startDate: Date,
      endDate: Date,
      accountCode?: string,
    ): Promise<JournalEntry[]> {
      const journals = await this.prisma.payrollJournal.findMany({
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          lines: true,
          payroll: true,
        },
      });

      const entries: JournalEntry[] = [];

      for (const journal of journals) {
        for (const line of journal.lines) {
          if (accountCode && line.accountCode !== accountCode) continue;

          entries.push({
            id: line.id,
            date: journal.createdAt,
            description: `Payroll - ${line.description}`,
            accountCode: line.accountCode,
            accountName: line.accountName || line.accountCode,
            debitCents: line.debitCents || 0,
            creditCents: line.creditCents || 0,
            sourceType: 'PAYROLL',
            sourceId: journal.payrollId,
            reference: journal.payroll?.period,
          });
        }
      }

      return entries;
    }

    private async calculateBalanceAsOf(
      tenantId: string,
      accountCode: string,
      asOfDate: Date,
    ): Promise<number> {
      // Sum all entries before the date
      const entries = await this.getGeneralLedger({
        tenantId,
        startDate: new Date('1970-01-01'),
        endDate: new Date(asOfDate.getTime() - 1), // Day before
        accountCode,
      });

      return entries.reduce(
        (sum, e) => sum + (e.debitCents - e.creditCents),
        0,
      );
    }

    async getTrialBalance(
      tenantId: string,
      asOfDate: Date,
    ): Promise<{ accountCode: string; accountName: string; debitBalance: number; creditBalance: number }[]> {
      const accounts = await this.prisma.chartOfAccount.findMany({
        where: { tenantId, isActive: true },
        orderBy: { code: 'asc' },
      });

      const balances = await Promise.all(
        accounts.map(async (account) => {
          const balance = await this.calculateBalanceAsOf(tenantId, account.code, asOfDate);

          // Debit-normal accounts: Assets, Expenses
          // Credit-normal accounts: Liabilities, Equity, Revenue
          const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);

          return {
            accountCode: account.code,
            accountName: account.name,
            debitBalance: isDebitNormal && balance > 0 ? balance : (isDebitNormal ? 0 : Math.abs(Math.min(balance, 0))),
            creditBalance: !isDebitNormal && balance < 0 ? Math.abs(balance) : (!isDebitNormal ? balance : 0),
          };
        }),
      );

      return balances.filter(b => b.debitBalance !== 0 || b.creditBalance !== 0);
    }
  }
  ```

  ### 3. DTO Definitions
  ```typescript
  // apps/api/src/database/dto/general-ledger.dto.ts
  import { IsString, IsDateString, IsOptional, IsEnum } from 'class-validator';
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

  export class GetGeneralLedgerDto {
    @ApiProperty()
    @IsDateString()
    startDate: string;

    @ApiProperty()
    @IsDateString()
    endDate: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    accountCode?: string;

    @ApiPropertyOptional({ enum: ['CATEGORIZATION', 'PAYROLL', 'MANUAL', 'INVOICE', 'PAYMENT'] })
    @IsOptional()
    @IsString()
    sourceType?: string;
  }

  export class GetAccountLedgerDto {
    @ApiProperty()
    @IsString()
    accountCode: string;

    @ApiProperty()
    @IsDateString()
    startDate: string;

    @ApiProperty()
    @IsDateString()
    endDate: string;
  }
  ```
</critical_patterns>

<context>
This task creates a unified general ledger view by aggregating journal entries from
multiple sources (CategorizationJournal, PayrollJournal, and future manual journals).

**Key Features:**
1. Query all journal entries across sources
2. Filter by date range, account, source type
3. Calculate running balances per account
4. Generate trial balance report
5. Support drill-down to source documents

**Accounting Principles:**
- Debit-normal accounts: Assets, Expenses (increase with debits)
- Credit-normal accounts: Liabilities, Equity, Revenue (increase with credits)
- Every transaction has equal debits and credits
</context>

<scope>
  <in_scope>
    - GeneralLedgerService with unified journal query
    - Account ledger with running balance
    - Trial balance generation
    - DTOs for API integration
    - Unit tests for service methods
  </in_scope>
  <out_of_scope>
    - Manual journal entry creation (TASK-ACCT-003)
    - API endpoints (TASK-ACCT-032)
    - Frontend UI (TASK-ACCT-042)
    - Invoice/Payment automatic journal creation
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Build must pass
cd apps/api && pnpm run build

# 2. Run unit tests
pnpm test -- --testPathPattern="general-ledger" --runInBand

# 3. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] GeneralLedgerService implemented with getGeneralLedger method
  - [ ] getAccountLedger method with opening/closing balance
  - [ ] getTrialBalance method implemented
  - [ ] Integration with CategorizationJournal
  - [ ] Integration with PayrollJournal
  - [ ] DTOs defined for API layer
  - [ ] Unit tests for all service methods (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** modify existing journal models - this is read-only aggregation
  - **NEVER** create duplicate entries when combining sources
  - **NEVER** calculate balances without considering account normal balance
  - **NEVER** return unfiltered results without tenant isolation
</anti_patterns>

</task_spec>
