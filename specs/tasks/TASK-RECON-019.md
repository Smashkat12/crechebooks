<task_spec id="TASK-RECON-019" version="2.0">

<metadata>
  <title>Bank Statement to Xero Transaction Reconciliation</title>
  <status>DONE</status>
  <layer>logic</layer>
  <sequence>183</sequence>
  <implements>
    <requirement_ref>REQ-RECON-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-RECON-011</task_ref>
    <task_ref status="complete">TASK-TRANS-015</task_ref>
    <task_ref status="complete">TASK-XERO-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-10</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Reconciliation State

  **Existing Reconciliation Services (src/database/services/):**
  - `reconciliation.service.ts` - Balance reconciliation (opening + credits - debits = calculated)
  - `discrepancy.service.ts` - Detect discrepancies between calculated and stated balance
  - `financial-report.service.ts` - Income statement, trial balance generation

  **Existing LLMWhisperer Parser (src/database/parsers/):**
  - `llmwhisperer-parser.ts` - PDF text extraction and transaction parsing
  - Extracts: date, description, amount, isCredit
  - DOES NOT extract: opening_balance, closing_balance

  **Existing Xero Integration (src/integrations/xero/):**
  - `xero-sync.service.ts` - Sync transactions with Xero
  - `bank-feed.service.ts` - Bank feed management
  - 1,504 transactions imported from Xero (Jul 2023 - Jan 2026)

  **Database State:**
  - 1,504 transactions in database
  - Bank account: `968a13db-b90e-4a99-b51b-adde7673957a`
  - 0 transactions reconciled (none matched to bank statements yet)

  **Bank Statements Available:**
  - 28 PDF statements (Aug 2023 - Nov 2025)
  - Account: 63061274808 (FNB Business)
  - Location: `/home/smash/Documents/dev-env/Playground/ruv/crechebooks/bank-statements/`

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. LLMWhisperer Integration Pattern
  ALWAYS use the existing LLMWhisperer parser infrastructure:
  ```typescript
  import { LLMWhispererParser } from '../../database/parsers/llmwhisperer-parser';

  // In constructor
  constructor(private readonly llmParser: LLMWhispererParser) {}

  // For text extraction (parser handles polling)
  const text = await this.llmParser.extractText(pdfBuffer);
  ```

  ### 3. Service Pattern (src/database/services/*.service.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class BankStatementReconciliationService {
    private readonly logger = new Logger(BankStatementReconciliationService.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly llmParser: LLMWhispererParser,
      private readonly xeroSync: XeroSyncService,
    ) {}
  }
  ```

  ### 4. Amount Handling
  - ALL amounts stored as CENTS (integers)
  - Use Decimal.js for calculations
  - Convert: `Math.round(rands * 100)` for storage
  - Display: `cents / 100` for output

  ### 5. Error Handling Pattern
  ```typescript
  try {
    // operation
  } catch (error) {
    this.logger.error(`Context: ${error instanceof Error ? error.message : String(error)}`);
    throw new BusinessException('User-friendly message', 'ERROR_CODE', { context });
  }
  ```

  ### 6. Test Pattern
  ```typescript
  import 'dotenv/config';  // FIRST LINE - Required!
  import { Test, TestingModule } from '@nestjs/testing';

  // CRITICAL: Add new tables to cleanup in FK order
  beforeEach(async () => {
    await prisma.bankStatementMatch.deleteMany({});  // NEW tables first
    // ... existing cleanup ...
  });
  ```

  ### 7. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag - prevents parallel DB conflicts
  ```
</critical_patterns>

<context>
This task implements comprehensive bank statement to Xero transaction reconciliation.

**The Problem:**
- Transactions are imported from Xero into CrecheBooks
- Bank statements exist as PDFs
- Need to verify each Xero transaction matches bank statement
- Need to verify bank balances match statement balances
- Currently NO transaction-level matching exists

**The Solution:**
1. Parse bank statement PDFs to extract transactions AND balances
2. For each statement period:
   a. Extract opening/closing balances from PDF
   b. Extract all transactions from PDF
   c. Fetch Xero transactions for same period
   d. Match transactions (date, amount, fuzzy description)
   e. Identify discrepancies
   f. Record reconciliation status

**Business Logic:**
- Transaction match tolerance: ±1 day for date, exact amount
- Description matching: Fuzzy match (Levenshtein distance ≤ 5)
- Balance tolerance: ≤ R1.00 (100 cents) for reconciled status
- Reconciliation is immutable once RECONCILED
</context>

<scope>
  <in_scope>
    - Add BankStatementMatch model to prisma/schema.prisma
    - Add BankStatementMatchStatus enum
    - Run migration: npx prisma migrate dev --name create_bank_statement_match
    - Create src/database/entities/bank-statement-match.entity.ts
    - Create src/database/dto/bank-statement-reconciliation.dto.ts
    - Extend LLMWhisperer parser to extract opening/closing balances
    - Create src/database/services/bank-statement-reconciliation.service.ts
    - Create src/database/repositories/bank-statement-match.repository.ts
    - Add bank statement reconciliation endpoints to reconciliation.controller.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/database/services/bank-statement-reconciliation.service.spec.ts (15+ tests)
    - Create tests/database/repositories/bank-statement-match.repository.spec.ts (10+ tests)
  </in_scope>
  <out_of_scope>
    - Auto-categorization of unmatched transactions (separate task)
    - UI components for reconciliation (separate task)
    - Multi-bank support beyond FNB (future enhancement)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- BANK STATEMENT FORMAT REFERENCE              -->
<!-- ============================================ -->

<bank_statement_format>
## FNB Bank Statement PDF Format (LLMWhisperer Output)

### Statement Header (contains balances)
```
Statement Period: 01 Aug 2023 to 31 Aug 2023
Account Number: 63061274808
Account Holder: [Business Name]

Opening Balance: 45,678.90 Cr
Closing Balance: 52,345.67 Cr
```

### Transaction Lines
```
Date       Description                    Debit        Credit       Balance
01 Aug     Transfer from XYZ              -            5,000.00Cr   50,678.90Cr
02 Aug     Payment to ABC                 2,500.00     -            48,178.90Cr
...
```

### Balance Patterns to Extract
- Opening Balance: `Opening Balance:?\s*([\d,]+\.\d{2})\s*(Cr|Dr)?`
- Closing Balance: `Closing Balance:?\s*([\d,]+\.\d{2})\s*(Cr|Dr)?`
- Statement Period: `Statement Period:?\s*(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})`
</bank_statement_format>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER Reconciliation model)

```prisma
// TASK-RECON-019: Bank Statement Transaction Matching
enum BankStatementMatchStatus {
  MATCHED          // Transaction exists in both bank and Xero
  IN_BANK_ONLY     // Transaction in bank statement, not in Xero
  IN_XERO_ONLY     // Transaction in Xero, not in bank statement
  AMOUNT_MISMATCH  // Same transaction, different amounts
  DATE_MISMATCH    // Same transaction, dates differ > 1 day
}

model BankStatementMatch {
  id                    String                   @id @default(uuid())
  tenantId              String                   @map("tenant_id")
  reconciliationId      String                   @map("reconciliation_id")

  // Bank statement side
  bankDate              DateTime                 @map("bank_date") @db.Date
  bankDescription       String                   @map("bank_description")
  bankAmountCents       Int                      @map("bank_amount_cents")
  bankIsCredit          Boolean                  @map("bank_is_credit")

  // Xero/CrecheBooks side (nullable if no match)
  transactionId         String?                  @map("transaction_id")
  xeroDate              DateTime?                @map("xero_date") @db.Date
  xeroDescription       String?                  @map("xero_description")
  xeroAmountCents       Int?                     @map("xero_amount_cents")
  xeroIsCredit          Boolean?                 @map("xero_is_credit")

  // Match result
  status                BankStatementMatchStatus
  matchConfidence       Decimal?                 @map("match_confidence") @db.Decimal(5, 2)
  discrepancyReason     String?                  @map("discrepancy_reason")

  createdAt             DateTime                 @default(now()) @map("created_at")
  updatedAt             DateTime                 @updatedAt @map("updated_at")

  tenant         Tenant          @relation(fields: [tenantId], references: [id])
  reconciliation Reconciliation  @relation(fields: [reconciliationId], references: [id], onDelete: Cascade)
  transaction    Transaction?    @relation(fields: [transactionId], references: [id])

  @@index([tenantId])
  @@index([reconciliationId])
  @@index([transactionId])
  @@index([tenantId, status])
  @@map("bank_statement_matches")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  bankStatementMatches    BankStatementMatch[]   // ADD THIS
}
```

## Update Reconciliation model - ADD this relation:
```prisma
model Reconciliation {
  // ... existing relations ...
  bankStatementMatches    BankStatementMatch[]   // ADD THIS
}
```

## Update Transaction model - ADD this relation:
```prisma
model Transaction {
  // ... existing relations ...
  bankStatementMatches    BankStatementMatch[]   // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/bank-statement-match.entity.ts
```typescript
/**
 * Bank Statement Match Entity Types
 * TASK-RECON-019: Bank Statement to Xero Reconciliation
 */

export enum BankStatementMatchStatus {
  MATCHED = 'MATCHED',
  IN_BANK_ONLY = 'IN_BANK_ONLY',
  IN_XERO_ONLY = 'IN_XERO_ONLY',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DATE_MISMATCH = 'DATE_MISMATCH',
}

export interface IBankStatementMatch {
  id: string;
  tenantId: string;
  reconciliationId: string;

  // Bank statement side
  bankDate: Date;
  bankDescription: string;
  bankAmountCents: number;
  bankIsCredit: boolean;

  // Xero/CrecheBooks side (nullable if no match)
  transactionId: string | null;
  xeroDate: Date | null;
  xeroDescription: string | null;
  xeroAmountCents: number | null;
  xeroIsCredit: boolean | null;

  // Match result
  status: BankStatementMatchStatus;
  matchConfidence: number | null;
  discrepancyReason: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// Parsed bank statement data
export interface ParsedBankStatement {
  statementPeriod: {
    start: Date;
    end: Date;
  };
  accountNumber: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  transactions: ParsedBankTransaction[];
}

export interface ParsedBankTransaction {
  date: Date;
  description: string;
  amountCents: number;
  isCredit: boolean;
  balanceCents?: number;
}

// Reconciliation summary
export interface BankStatementReconciliationResult {
  reconciliationId: string;
  statementPeriod: { start: Date; end: Date };
  openingBalanceCents: number;
  closingBalanceCents: number;
  calculatedBalanceCents: number;
  discrepancyCents: number;
  matchSummary: {
    matched: number;
    inBankOnly: number;
    inXeroOnly: number;
    amountMismatch: number;
    dateMismatch: number;
    total: number;
  };
  status: 'RECONCILED' | 'DISCREPANCY';
}
```
</entity_files>

<dto_files>
## src/database/dto/bank-statement-reconciliation.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsDate,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BankStatementMatchStatus } from '../entities/bank-statement-match.entity';

export class ReconcileBankStatementDto {
  @ApiProperty({ description: 'Bank account identifier' })
  @IsString()
  bank_account!: string;

  @ApiPropertyOptional({ description: 'Period start date (auto-detected from PDF if not provided)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  period_start?: Date;

  @ApiPropertyOptional({ description: 'Period end date (auto-detected from PDF if not provided)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  period_end?: Date;
}

export class BankStatementMatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  bank_date!: string;

  @ApiProperty()
  bank_description!: string;

  @ApiProperty()
  bank_amount!: number;

  @ApiProperty()
  bank_is_credit!: boolean;

  @ApiPropertyOptional()
  transaction_id?: string | null;

  @ApiPropertyOptional()
  xero_date?: string | null;

  @ApiPropertyOptional()
  xero_description?: string | null;

  @ApiPropertyOptional()
  xero_amount?: number | null;

  @ApiPropertyOptional()
  xero_is_credit?: boolean | null;

  @ApiProperty({ enum: BankStatementMatchStatus })
  status!: BankStatementMatchStatus;

  @ApiPropertyOptional()
  match_confidence?: number | null;

  @ApiPropertyOptional()
  discrepancy_reason?: string | null;
}

export class BankStatementReconciliationResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  data!: {
    reconciliation_id: string;
    period_start: string;
    period_end: string;
    opening_balance: number;
    closing_balance: number;
    calculated_balance: number;
    discrepancy: number;
    match_summary: {
      matched: number;
      in_bank_only: number;
      in_xero_only: number;
      amount_mismatch: number;
      date_mismatch: number;
      total: number;
    };
    status: 'RECONCILED' | 'DISCREPANCY';
    matches: BankStatementMatchResponseDto[];
  };
}

export class BankStatementMatchFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reconciliation_id?: string;

  @ApiPropertyOptional({ enum: BankStatementMatchStatus })
  @IsOptional()
  @IsEnum(BankStatementMatchStatus)
  status?: BankStatementMatchStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
```
</dto_files>

<llmwhisperer_extension>
## Extend src/database/parsers/llmwhisperer-parser.ts

Add this method to the LLMWhispererParser class:

```typescript
/**
 * Extract bank statement with balances and transactions
 * TASK-RECON-019: Enhanced extraction for reconciliation
 */
async parseWithBalances(buffer: Buffer): Promise<ParsedBankStatement> {
  const text = await this.extractText(buffer);

  // Extract statement period
  const periodMatch = text.match(
    /Statement\s+Period:?\s*(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i
  );
  if (!periodMatch) {
    throw new ValidationException('Could not extract statement period from PDF', [{
      field: 'statementPeriod',
      message: 'Statement period not found in PDF',
      value: text.substring(0, 500),
    }]);
  }

  const periodStart = this.parseStatementDate(periodMatch[1]);
  const periodEnd = this.parseStatementDate(periodMatch[2]);

  // Extract account number
  const accountMatch = text.match(/Account\s+(?:Number|No):?\s*(\d+)/i);
  const accountNumber = accountMatch ? accountMatch[1] : 'unknown';

  // Extract opening balance
  const openingMatch = text.match(
    /Opening\s+Balance:?\s*([\d,]+\.\d{2})\s*(Cr|Dr)?/i
  );
  if (!openingMatch) {
    throw new ValidationException('Could not extract opening balance from PDF', [{
      field: 'openingBalance',
      message: 'Opening balance not found in PDF',
      value: text.substring(0, 500),
    }]);
  }
  const openingBalanceCents = this.parseBalanceAmount(openingMatch[1], openingMatch[2]);

  // Extract closing balance
  const closingMatch = text.match(
    /Closing\s+Balance:?\s*([\d,]+\.\d{2})\s*(Cr|Dr)?/i
  );
  if (!closingMatch) {
    throw new ValidationException('Could not extract closing balance from PDF', [{
      field: 'closingBalance',
      message: 'Closing balance not found in PDF',
      value: text.substring(0, 500),
    }]);
  }
  const closingBalanceCents = this.parseBalanceAmount(closingMatch[1], closingMatch[2]);

  // Extract transactions using existing method
  const transactions = this.parseExtractedText(text);

  return {
    statementPeriod: {
      start: periodStart,
      end: periodEnd,
    },
    accountNumber,
    openingBalanceCents,
    closingBalanceCents,
    transactions: transactions.map(t => ({
      date: t.date,
      description: t.description,
      amountCents: t.amountCents,
      isCredit: t.isCredit,
    })),
  };
}

/**
 * Parse statement date from "01 Aug 2023" format
 */
private parseStatementDate(dateStr: string): Date {
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const parts = dateStr.trim().split(/\s+/);
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  const day = parseInt(parts[0], 10);
  const month = months[parts[1].toLowerCase().substring(0, 3)];
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || month === undefined || isNaN(year)) {
    throw new Error(`Invalid date components: ${dateStr}`);
  }

  return new Date(year, month, day);
}

/**
 * Parse balance amount with Cr/Dr suffix
 * Returns positive for credit balance, negative for debit balance
 */
private parseBalanceAmount(amountStr: string, suffix?: string): number {
  const amount = parseFloat(amountStr.replace(/,/g, ''));
  const cents = Math.round(amount * 100);

  // Dr suffix means debit (negative balance)
  if (suffix?.toLowerCase() === 'dr') {
    return -cents;
  }
  return cents;
}
```

## Add import at top of file:
```typescript
import {
  ParsedBankStatement,
  ParsedBankTransaction,
} from '../entities/bank-statement-match.entity';
```
</llmwhisperer_extension>

<service_file>
## src/database/services/bank-statement-reconciliation.service.ts

```typescript
/**
 * Bank Statement Reconciliation Service
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 *
 * Matches bank statement transactions with Xero/CrecheBooks transactions
 * and performs balance reconciliation.
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { LLMWhispererParser } from '../parsers/llmwhisperer-parser';
import { BankStatementMatchRepository } from '../repositories/bank-statement-match.repository';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import {
  BankStatementMatchStatus,
  ParsedBankStatement,
  ParsedBankTransaction,
  BankStatementReconciliationResult,
} from '../entities/bank-statement-match.entity';
import { ReconciliationStatus } from '@prisma/client';
import { BusinessException, ValidationException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

// Match thresholds
const DATE_TOLERANCE_DAYS = 1;
const DESCRIPTION_MATCH_THRESHOLD = 0.7; // 70% similarity

@Injectable()
export class BankStatementReconciliationService {
  private readonly logger = new Logger(BankStatementReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmParser: LLMWhispererParser,
    private readonly matchRepo: BankStatementMatchRepository,
    private readonly reconRepo: ReconciliationRepository,
  ) {}

  /**
   * Reconcile bank statement PDF with Xero transactions
   */
  async reconcileStatement(
    tenantId: string,
    bankAccount: string,
    pdfBuffer: Buffer,
    userId: string,
  ): Promise<BankStatementReconciliationResult> {
    this.logger.log(`Starting bank statement reconciliation for tenant ${tenantId}`);

    // 1. Parse bank statement PDF
    const statement = await this.llmParser.parseWithBalances(pdfBuffer);
    this.logger.log(
      `Parsed statement: ${statement.accountNumber}, ${statement.statementPeriod.start.toISOString()} to ${statement.statementPeriod.end.toISOString()}, ${statement.transactions.length} transactions`,
    );

    // 2. Get Xero transactions for the same period
    const xeroTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount,
        date: {
          gte: statement.statementPeriod.start,
          lte: statement.statementPeriod.end,
        },
        isDeleted: false,
      },
      orderBy: { date: 'asc' },
    });
    this.logger.log(`Found ${xeroTransactions.length} Xero transactions for period`);

    // 3. Create or update reconciliation record
    const reconciliation = await this.prisma.$transaction(async (tx) => {
      // Check for existing reconciliation
      const existing = await this.reconRepo.findByTenantAndAccount(
        tenantId,
        bankAccount,
        statement.statementPeriod.start,
      );

      if (existing?.status === ReconciliationStatus.RECONCILED) {
        throw new BusinessException(
          'Period already reconciled',
          'PERIOD_ALREADY_RECONCILED',
          { reconciliationId: existing.id },
        );
      }

      // Calculate balance
      const calculatedBalanceCents = this.calculateBalance(
        statement.openingBalanceCents,
        statement.transactions,
      );

      const discrepancyCents = statement.closingBalanceCents - calculatedBalanceCents;

      // Create/update reconciliation
      if (existing) {
        return await tx.reconciliation.update({
          where: { id: existing.id },
          data: {
            openingBalanceCents: statement.openingBalanceCents,
            closingBalanceCents: statement.closingBalanceCents,
            calculatedBalanceCents,
            discrepancyCents,
            status: ReconciliationStatus.IN_PROGRESS,
          },
        });
      } else {
        return await tx.reconciliation.create({
          data: {
            tenantId,
            bankAccount,
            periodStart: statement.statementPeriod.start,
            periodEnd: statement.statementPeriod.end,
            openingBalanceCents: statement.openingBalanceCents,
            closingBalanceCents: statement.closingBalanceCents,
            calculatedBalanceCents,
            discrepancyCents,
            status: ReconciliationStatus.IN_PROGRESS,
          },
        });
      }
    });

    // 4. Clear existing matches for this reconciliation
    await this.matchRepo.deleteByReconciliationId(reconciliation.id);

    // 5. Match transactions
    const matches = await this.matchTransactions(
      tenantId,
      reconciliation.id,
      statement.transactions,
      xeroTransactions,
    );

    // 6. Calculate match summary
    const matchSummary = this.calculateMatchSummary(matches);

    // 7. Determine final status
    const balanceDiscrepancy = Math.abs(
      statement.closingBalanceCents - this.calculateBalance(
        statement.openingBalanceCents,
        statement.transactions,
      ),
    );

    const allMatched = matchSummary.inBankOnly === 0 &&
                       matchSummary.inXeroOnly === 0 &&
                       matchSummary.amountMismatch === 0;

    const status = allMatched && balanceDiscrepancy <= 100
      ? 'RECONCILED'
      : 'DISCREPANCY';

    // 8. Update reconciliation status
    await this.prisma.reconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status: status === 'RECONCILED'
          ? ReconciliationStatus.RECONCILED
          : ReconciliationStatus.DISCREPANCY,
        reconciledBy: status === 'RECONCILED' ? userId : null,
        reconciledAt: status === 'RECONCILED' ? new Date() : null,
      },
    });

    // 9. If reconciled, mark matched transactions
    if (status === 'RECONCILED') {
      const matchedTxIds = matches
        .filter(m => m.status === BankStatementMatchStatus.MATCHED && m.transactionId)
        .map(m => m.transactionId!);

      if (matchedTxIds.length > 0) {
        await this.prisma.transaction.updateMany({
          where: { id: { in: matchedTxIds } },
          data: {
            isReconciled: true,
            reconciledAt: new Date(),
          },
        });
      }
    }

    this.logger.log(
      `Reconciliation ${reconciliation.id}: status=${status}, matched=${matchSummary.matched}/${matchSummary.total}`,
    );

    return {
      reconciliationId: reconciliation.id,
      statementPeriod: statement.statementPeriod,
      openingBalanceCents: statement.openingBalanceCents,
      closingBalanceCents: statement.closingBalanceCents,
      calculatedBalanceCents: this.calculateBalance(
        statement.openingBalanceCents,
        statement.transactions,
      ),
      discrepancyCents: balanceDiscrepancy,
      matchSummary,
      status,
    };
  }

  /**
   * Match bank transactions with Xero transactions
   */
  private async matchTransactions(
    tenantId: string,
    reconciliationId: string,
    bankTransactions: ParsedBankTransaction[],
    xeroTransactions: Array<{
      id: string;
      date: Date;
      description: string;
      amountCents: number;
      isCredit: boolean;
    }>,
  ): Promise<Array<{
    status: BankStatementMatchStatus;
    transactionId: string | null;
    matchConfidence: number | null;
    discrepancyReason: string | null;
  }>> {
    const matches: Array<{
      status: BankStatementMatchStatus;
      transactionId: string | null;
      matchConfidence: number | null;
      discrepancyReason: string | null;
    }> = [];

    const usedXeroIds = new Set<string>();

    // First pass: Match bank transactions to Xero
    for (const bankTx of bankTransactions) {
      let bestMatch: {
        xeroTx: typeof xeroTransactions[0];
        confidence: number;
        status: BankStatementMatchStatus;
        reason: string | null;
      } | null = null;

      for (const xeroTx of xeroTransactions) {
        if (usedXeroIds.has(xeroTx.id)) continue;

        const matchResult = this.evaluateMatch(bankTx, xeroTx);
        if (matchResult.confidence > (bestMatch?.confidence ?? 0)) {
          bestMatch = {
            xeroTx,
            confidence: matchResult.confidence,
            status: matchResult.status,
            reason: matchResult.reason,
          };
        }
      }

      // Create match record
      if (bestMatch && bestMatch.confidence >= DESCRIPTION_MATCH_THRESHOLD) {
        usedXeroIds.add(bestMatch.xeroTx.id);

        await this.matchRepo.create({
          tenantId,
          reconciliationId,
          bankDate: bankTx.date,
          bankDescription: bankTx.description,
          bankAmountCents: bankTx.amountCents,
          bankIsCredit: bankTx.isCredit,
          transactionId: bestMatch.xeroTx.id,
          xeroDate: bestMatch.xeroTx.date,
          xeroDescription: bestMatch.xeroTx.description,
          xeroAmountCents: bestMatch.xeroTx.amountCents,
          xeroIsCredit: bestMatch.xeroTx.isCredit,
          status: bestMatch.status,
          matchConfidence: bestMatch.confidence,
          discrepancyReason: bestMatch.reason,
        });

        matches.push({
          status: bestMatch.status,
          transactionId: bestMatch.xeroTx.id,
          matchConfidence: bestMatch.confidence,
          discrepancyReason: bestMatch.reason,
        });
      } else {
        // No match - bank only
        await this.matchRepo.create({
          tenantId,
          reconciliationId,
          bankDate: bankTx.date,
          bankDescription: bankTx.description,
          bankAmountCents: bankTx.amountCents,
          bankIsCredit: bankTx.isCredit,
          transactionId: null,
          xeroDate: null,
          xeroDescription: null,
          xeroAmountCents: null,
          xeroIsCredit: null,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          matchConfidence: null,
          discrepancyReason: 'No matching Xero transaction found',
        });

        matches.push({
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          transactionId: null,
          matchConfidence: null,
          discrepancyReason: 'No matching Xero transaction found',
        });
      }
    }

    // Second pass: Record unmatched Xero transactions
    for (const xeroTx of xeroTransactions) {
      if (usedXeroIds.has(xeroTx.id)) continue;

      await this.matchRepo.create({
        tenantId,
        reconciliationId,
        bankDate: xeroTx.date, // Use Xero date as reference
        bankDescription: '',
        bankAmountCents: 0,
        bankIsCredit: false,
        transactionId: xeroTx.id,
        xeroDate: xeroTx.date,
        xeroDescription: xeroTx.description,
        xeroAmountCents: xeroTx.amountCents,
        xeroIsCredit: xeroTx.isCredit,
        status: BankStatementMatchStatus.IN_XERO_ONLY,
        matchConfidence: null,
        discrepancyReason: 'Transaction in Xero but not in bank statement',
      });

      matches.push({
        status: BankStatementMatchStatus.IN_XERO_ONLY,
        transactionId: xeroTx.id,
        matchConfidence: null,
        discrepancyReason: 'Transaction in Xero but not in bank statement',
      });
    }

    return matches;
  }

  /**
   * Evaluate match between bank and Xero transaction
   */
  private evaluateMatch(
    bankTx: ParsedBankTransaction,
    xeroTx: { date: Date; description: string; amountCents: number; isCredit: boolean },
  ): {
    confidence: number;
    status: BankStatementMatchStatus;
    reason: string | null;
  } {
    // Check amount match
    const amountMatches = bankTx.amountCents === xeroTx.amountCents &&
                          bankTx.isCredit === xeroTx.isCredit;

    // Check date match (within tolerance)
    const daysDiff = Math.abs(
      (bankTx.date.getTime() - xeroTx.date.getTime()) / (1000 * 60 * 60 * 24),
    );
    const dateMatches = daysDiff <= DATE_TOLERANCE_DAYS;

    // Calculate description similarity
    const descSimilarity = this.calculateSimilarity(
      bankTx.description.toLowerCase(),
      xeroTx.description.toLowerCase(),
    );

    // Determine status and confidence
    if (amountMatches && dateMatches && descSimilarity >= DESCRIPTION_MATCH_THRESHOLD) {
      return {
        confidence: descSimilarity,
        status: BankStatementMatchStatus.MATCHED,
        reason: null,
      };
    }

    if (!amountMatches && dateMatches && descSimilarity >= DESCRIPTION_MATCH_THRESHOLD) {
      return {
        confidence: descSimilarity * 0.8,
        status: BankStatementMatchStatus.AMOUNT_MISMATCH,
        reason: `Amount differs: bank ${bankTx.amountCents}c vs Xero ${xeroTx.amountCents}c`,
      };
    }

    if (amountMatches && !dateMatches && descSimilarity >= DESCRIPTION_MATCH_THRESHOLD) {
      return {
        confidence: descSimilarity * 0.9,
        status: BankStatementMatchStatus.DATE_MISMATCH,
        reason: `Date differs by ${daysDiff.toFixed(0)} days`,
      };
    }

    // No match
    return {
      confidence: descSimilarity * 0.5,
      status: BankStatementMatchStatus.IN_BANK_ONLY,
      reason: null,
    };
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLen;
  }

  /**
   * Calculate balance from opening + transactions
   */
  private calculateBalance(
    openingBalanceCents: number,
    transactions: ParsedBankTransaction[],
  ): number {
    let balance = new Decimal(openingBalanceCents);

    for (const tx of transactions) {
      if (tx.isCredit) {
        balance = balance.plus(tx.amountCents);
      } else {
        balance = balance.minus(tx.amountCents);
      }
    }

    return balance.round().toNumber();
  }

  /**
   * Calculate match summary statistics
   */
  private calculateMatchSummary(
    matches: Array<{ status: BankStatementMatchStatus }>,
  ): {
    matched: number;
    inBankOnly: number;
    inXeroOnly: number;
    amountMismatch: number;
    dateMismatch: number;
    total: number;
  } {
    const summary = {
      matched: 0,
      inBankOnly: 0,
      inXeroOnly: 0,
      amountMismatch: 0,
      dateMismatch: 0,
      total: matches.length,
    };

    for (const match of matches) {
      switch (match.status) {
        case BankStatementMatchStatus.MATCHED:
          summary.matched++;
          break;
        case BankStatementMatchStatus.IN_BANK_ONLY:
          summary.inBankOnly++;
          break;
        case BankStatementMatchStatus.IN_XERO_ONLY:
          summary.inXeroOnly++;
          break;
        case BankStatementMatchStatus.AMOUNT_MISMATCH:
          summary.amountMismatch++;
          break;
        case BankStatementMatchStatus.DATE_MISMATCH:
          summary.dateMismatch++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get reconciliation matches by reconciliation ID
   */
  async getMatchesByReconciliationId(
    tenantId: string,
    reconciliationId: string,
  ): Promise<Array<{
    id: string;
    bankDate: Date;
    bankDescription: string;
    bankAmountCents: number;
    bankIsCredit: boolean;
    transactionId: string | null;
    xeroDate: Date | null;
    xeroDescription: string | null;
    xeroAmountCents: number | null;
    xeroIsCredit: boolean | null;
    status: BankStatementMatchStatus;
    matchConfidence: number | null;
    discrepancyReason: string | null;
  }>> {
    return this.matchRepo.findByReconciliationId(tenantId, reconciliationId);
  }

  /**
   * Get unmatched transactions summary
   */
  async getUnmatchedSummary(
    tenantId: string,
    reconciliationId: string,
  ): Promise<{
    inBankOnly: Array<{ date: Date; description: string; amount: number }>;
    inXeroOnly: Array<{ date: Date; description: string; amount: number; transactionId: string }>;
  }> {
    const matches = await this.matchRepo.findByReconciliationId(tenantId, reconciliationId);

    const inBankOnly = matches
      .filter(m => m.status === BankStatementMatchStatus.IN_BANK_ONLY)
      .map(m => ({
        date: m.bankDate,
        description: m.bankDescription,
        amount: m.bankAmountCents / 100,
      }));

    const inXeroOnly = matches
      .filter(m => m.status === BankStatementMatchStatus.IN_XERO_ONLY && m.transactionId)
      .map(m => ({
        date: m.xeroDate!,
        description: m.xeroDescription!,
        amount: m.xeroAmountCents! / 100,
        transactionId: m.transactionId!,
      }));

    return { inBankOnly, inXeroOnly };
  }
}
```
</service_file>

<repository_file>
## src/database/repositories/bank-statement-match.repository.ts

Repository must have these methods:
1. `create(dto: CreateBankStatementMatchDto): Promise<BankStatementMatch>`
2. `findById(id: string): Promise<BankStatementMatch | null>`
3. `findByReconciliationId(tenantId: string, reconciliationId: string): Promise<BankStatementMatch[]>`
4. `findByStatus(tenantId: string, status: BankStatementMatchStatus): Promise<BankStatementMatch[]>`
5. `findByTransactionId(transactionId: string): Promise<BankStatementMatch | null>`
6. `deleteByReconciliationId(reconciliationId: string): Promise<void>`
7. `countByStatus(tenantId: string, reconciliationId: string): Promise<Record<BankStatementMatchStatus, number>>`

Error handling:
- P2003 (foreign key) → NotFoundException for tenant or reconciliation
- Not found → NotFoundException('BankStatementMatch', id)
</repository_file>

<controller_additions>
## Add to src/api/reconciliation/reconciliation.controller.ts

```typescript
// ============================================
// TASK-RECON-019: Bank Statement Reconciliation
// ============================================

@Post('bank-statement')
@HttpCode(201)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(FileInterceptor('file'))
@ApiOperation({ summary: 'Reconcile bank statement PDF with Xero transactions' })
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
      bank_account: { type: 'string' },
    },
  },
})
@ApiResponse({
  status: 201,
  type: BankStatementReconciliationResponseDto,
  description: 'Bank statement reconciled successfully',
})
@ApiResponse({
  status: 400,
  description: 'Invalid PDF or could not extract statement data',
})
@ApiResponse({
  status: 409,
  description: 'Period already reconciled',
})
async reconcileBankStatement(
  @UploadedFile() file: Express.Multer.File,
  @Body() dto: ReconcileBankStatementDto,
  @CurrentUser() user: IUser,
): Promise<BankStatementReconciliationResponseDto> {
  if (!file) {
    throw new BadRequestException('Bank statement PDF file is required');
  }

  this.logger.log(
    `Bank statement reconciliation: tenant=${user.tenantId}, file=${file.originalname}, size=${file.size}`,
  );

  const result = await this.bankStatementReconciliationService.reconcileStatement(
    user.tenantId,
    dto.bank_account,
    file.buffer,
    user.id,
  );

  // Get all matches for response
  const matches = await this.bankStatementReconciliationService.getMatchesByReconciliationId(
    user.tenantId,
    result.reconciliationId,
  );

  return {
    success: true,
    data: {
      reconciliation_id: result.reconciliationId,
      period_start: result.statementPeriod.start.toISOString().split('T')[0],
      period_end: result.statementPeriod.end.toISOString().split('T')[0],
      opening_balance: result.openingBalanceCents / 100,
      closing_balance: result.closingBalanceCents / 100,
      calculated_balance: result.calculatedBalanceCents / 100,
      discrepancy: result.discrepancyCents / 100,
      match_summary: {
        matched: result.matchSummary.matched,
        in_bank_only: result.matchSummary.inBankOnly,
        in_xero_only: result.matchSummary.inXeroOnly,
        amount_mismatch: result.matchSummary.amountMismatch,
        date_mismatch: result.matchSummary.dateMismatch,
        total: result.matchSummary.total,
      },
      status: result.status,
      matches: matches.map(m => ({
        id: m.id,
        bank_date: m.bankDate.toISOString().split('T')[0],
        bank_description: m.bankDescription,
        bank_amount: m.bankAmountCents / 100,
        bank_is_credit: m.bankIsCredit,
        transaction_id: m.transactionId,
        xero_date: m.xeroDate?.toISOString().split('T')[0] ?? null,
        xero_description: m.xeroDescription,
        xero_amount: m.xeroAmountCents ? m.xeroAmountCents / 100 : null,
        xero_is_credit: m.xeroIsCredit,
        status: m.status,
        match_confidence: m.matchConfidence ? Number(m.matchConfidence) : null,
        discrepancy_reason: m.discrepancyReason,
      })),
    },
  };
}

@Get(':id/matches')
@HttpCode(200)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({ summary: 'Get bank statement matches for a reconciliation' })
@ApiParam({ name: 'id', description: 'Reconciliation ID' })
@ApiResponse({
  status: 200,
  description: 'List of bank statement matches',
})
async getReconciliationMatches(
  @Param('id') reconciliationId: string,
  @Query() query: BankStatementMatchFilterDto,
  @CurrentUser() user: IUser,
): Promise<{
  success: boolean;
  data: BankStatementMatchResponseDto[];
  total: number;
}> {
  const matches = await this.bankStatementReconciliationService.getMatchesByReconciliationId(
    user.tenantId,
    reconciliationId,
  );

  // Apply status filter if provided
  let filtered = matches;
  if (query.status) {
    filtered = filtered.filter(m => m.status === query.status);
  }

  // Apply pagination
  const page = query.page ?? 1;
  const limit = query.limit ?? 100;
  const startIndex = (page - 1) * limit;
  const paginatedMatches = filtered.slice(startIndex, startIndex + limit);

  return {
    success: true,
    data: paginatedMatches.map(m => ({
      id: m.id,
      bank_date: m.bankDate.toISOString().split('T')[0],
      bank_description: m.bankDescription,
      bank_amount: m.bankAmountCents / 100,
      bank_is_credit: m.bankIsCredit,
      transaction_id: m.transactionId,
      xero_date: m.xeroDate?.toISOString().split('T')[0] ?? null,
      xero_description: m.xeroDescription,
      xero_amount: m.xeroAmountCents ? m.xeroAmountCents / 100 : null,
      xero_is_credit: m.xeroIsCredit,
      status: m.status,
      match_confidence: m.matchConfidence ? Number(m.matchConfidence) : null,
      discrepancy_reason: m.discrepancyReason,
    })),
    total: filtered.length,
  };
}

@Get(':id/unmatched')
@HttpCode(200)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({ summary: 'Get unmatched transactions for a reconciliation' })
@ApiParam({ name: 'id', description: 'Reconciliation ID' })
async getUnmatchedTransactions(
  @Param('id') reconciliationId: string,
  @CurrentUser() user: IUser,
): Promise<{
  success: boolean;
  data: {
    in_bank_only: Array<{ date: string; description: string; amount: number }>;
    in_xero_only: Array<{ date: string; description: string; amount: number; transaction_id: string }>;
  };
}> {
  const unmatched = await this.bankStatementReconciliationService.getUnmatchedSummary(
    user.tenantId,
    reconciliationId,
  );

  return {
    success: true,
    data: {
      in_bank_only: unmatched.inBankOnly.map(t => ({
        date: t.date.toISOString().split('T')[0],
        description: t.description,
        amount: t.amount,
      })),
      in_xero_only: unmatched.inXeroOnly.map(t => ({
        date: t.date.toISOString().split('T')[0],
        description: t.description,
        amount: t.amount,
        transaction_id: t.transactionId,
      })),
    },
  };
}
```

## Add imports at top of controller:
```typescript
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiConsumes, ApiBody } from '@nestjs/swagger';
import { BankStatementReconciliationService } from '../../database/services/bank-statement-reconciliation.service';
import {
  ReconcileBankStatementDto,
  BankStatementReconciliationResponseDto,
  BankStatementMatchResponseDto,
  BankStatementMatchFilterDto,
} from './dto';
```

## Add service to constructor:
```typescript
constructor(
  // ... existing services ...
  private readonly bankStatementReconciliationService: BankStatementReconciliationService,
) {}
```
</controller_additions>

<module_update>
## Update src/api/reconciliation/reconciliation.module.ts

```typescript
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DatabaseModule } from '../../database/database.module';
import { SharedModule } from '../../shared/shared.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from '../../database/services/reconciliation.service';
import { FinancialReportService } from '../../database/services/financial-report.service';
import { BalanceSheetService } from '../../database/services/balance-sheet.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { DiscrepancyService } from '../../database/services/discrepancy.service';
import { BankStatementReconciliationService } from '../../database/services/bank-statement-reconciliation.service';  // ADD
import { LLMWhispererParser } from '../../database/parsers/llmwhisperer-parser';  // ADD

@Module({
  imports: [
    DatabaseModule,
    SharedModule,
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    }),
  ],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    FinancialReportService,
    BalanceSheetService,
    AuditLogService,
    DiscrepancyService,
    BankStatementReconciliationService,  // ADD
    LLMWhispererParser,  // ADD
  ],
  exports: [ReconciliationService, FinancialReportService, BalanceSheetService],
})
export class ReconciliationModule {}
```
</module_update>

<test_cleanup_update>
## UPDATE ALL EXISTING TEST FILES

Add this line at the TOP of the beforeEach cleanup (in FK order):

```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.bankStatementMatch.deleteMany({});  // ADD THIS LINE
  // ... all other existing deleteMany calls ...
});
```

Files to update (search for `deleteMany` in tests/):
- All repository spec files
- All service spec files
- All controller spec files
</test_cleanup_update>

<index_updates>
## Update src/database/entities/index.ts
Add at end:
```typescript
export * from './bank-statement-match.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './bank-statement-reconciliation.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './bank-statement-match.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/database/services/bank-statement-reconciliation.service.spec.ts (15+ tests)
Test scenarios:
- reconcileStatement: parses PDF, matches transactions, returns result
- reconcileStatement: throws if period already reconciled
- reconcileStatement: handles empty bank statement
- reconcileStatement: handles no Xero transactions
- matchTransactions: exact match (same date, amount, similar description)
- matchTransactions: date mismatch (±1 day tolerance)
- matchTransactions: amount mismatch detection
- matchTransactions: bank only transactions
- matchTransactions: Xero only transactions
- calculateSimilarity: identical strings return 1.0
- calculateSimilarity: completely different strings return ~0
- calculateBalance: opening + credits - debits = calculated
- getMatchesByReconciliationId: returns all matches for tenant
- getUnmatchedSummary: returns bank-only and xero-only lists

### tests/database/repositories/bank-statement-match.repository.spec.ts (10+ tests)
Test scenarios:
- create: creates with all fields
- findById: exists, not found
- findByReconciliationId: returns matches for reconciliation
- findByStatus: filters by match status
- findByTransactionId: finds match by transaction
- deleteByReconciliationId: removes all matches for reconciliation
- countByStatus: returns counts per status

Use REAL test data (South African bank context):
```typescript
const testBankTransaction = {
  bankDate: new Date('2023-08-15'),
  bankDescription: 'PAYMENT FROM ABC COMPANY',
  bankAmountCents: 500000, // R5,000.00
  bankIsCredit: true,
};

const testXeroTransaction = {
  date: new Date('2023-08-15'),
  description: 'Payment from ABC Company',
  amountCents: 500000,
  isCredit: true,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_bank_statement_match

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/bank-statement-match.entity.ts

# 5. Create DTO file
# Create src/database/dto/bank-statement-reconciliation.dto.ts

# 6. Extend LLMWhisperer parser
# Add parseWithBalances method to src/database/parsers/llmwhisperer-parser.ts

# 7. Create repository file
# Create src/database/repositories/bank-statement-match.repository.ts

# 8. Create service file
# Create src/database/services/bank-statement-reconciliation.service.ts

# 9. Update reconciliation module file
# Update src/api/reconciliation/reconciliation.module.ts

# 10. Update reconciliation controller file
# Add endpoints to src/api/reconciliation/reconciliation.controller.ts

# 11. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 12. Update existing test files (ALL of them)
# Add bankStatementMatch.deleteMany to cleanup

# 13. Create test files
# Create tests/database/services/bank-statement-reconciliation.service.spec.ts
# Create tests/database/repositories/bank-statement-match.repository.spec.ts

# 14. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 410+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - NO backwards compatibility hacks - fail fast with clear errors
    - NO swallowing errors - log with full context, then re-throw
    - All errors must clearly indicate WHAT failed and WHY
    - Must use UUID for primary keys
    - Must include tenantId FK on BankStatementMatch
    - All amounts stored as CENTS (integers)
    - LLMWhisperer used for PDF text extraction
    - Transaction matching uses Levenshtein distance for descriptions
    - Date tolerance: ±1 business day
    - Reconciliation is immutable once status = RECONCILED
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 410+ tests passing
    - Migration applies and can be reverted
    - PDF parsing extracts opening/closing balances
    - Transaction matching works with fuzzy description matching
    - Unmatched transactions are identified
    - Balance reconciliation calculates correctly
    - Tenant isolation enforced on all queries
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Import enums from `@prisma/client` in DTOs (import from entity file)
  - Use `string?` in interfaces (use `string | null`)
  - Run tests without `--runInBand` flag
  - Skip updating existing test cleanup order
  - Create mock/stub implementations
  - Store amounts as floats (always use CENTS as integers)
  - Modify reconciled periods (status = RECONCILED is immutable)
  - Skip the npx prisma generate step
  - Use hardcoded bank account identifiers
</anti_patterns>

</task_spec>
