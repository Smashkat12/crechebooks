<task_spec id="TASK-INT-005" version="3.0">

<metadata>
  <title>E2E Reconciliation Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>62</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-RECON-032</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
FINAL E2E integration test for CrecheBooks. Tests the complete bank reconciliation workflow
including period selection, transaction matching, discrepancy identification, and financial
report generation. Validates the critical balance formula: Opening Balance + Credits - Debits
= Closing Balance. This is the ultimate validation of financial integrity across all system
components.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use real services with actual database</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API uses snake_case (e.g., bank_account, period_start, opening_balance)</rule>
  <rule>Internal services use camelCase (e.g., bankAccount, periodStart, openingBalanceCents)</rule>
  <rule>API amounts in decimal Rands, internal amounts in cents</rule>
  <rule>Balance formula must be exact: opening + credits - debits = closing</rule>
  <rule>Reconciled transactions are immutable</rule>
  <rule>Cannot re-reconcile same period</rule>
</critical_rules>

<project_context>
  <test_count>1536 tests currently passing</test_count>
  <surface_layer_status>100% complete (all 16 Surface Layer tasks done)</surface_layer_status>
  <total_tasks>63 tasks (58 complete, 5 integration remaining)</total_tasks>
  <currency>ZAR (South African Rand)</currency>
</project_context>

<existing_infrastructure>
  <file path="src/api/reconciliation/reconciliation.controller.ts" purpose="Reconciliation endpoints">
    Key endpoints:
    - POST /reconciliation - Run bank reconciliation for period
    - GET /reconciliation/income-statement - Generate Income Statement (Profit & Loss)

    POST /reconciliation body:
    { bank_account, period_start, period_end, opening_balance, closing_balance }

    GET /reconciliation/income-statement query:
    { period_start, period_end, format? }

    Response: { success: true, data: {...} }
  </file>

  <file path="src/api/reconciliation/dto/index.ts" purpose="Reconciliation DTOs">
    Exports:
    - ApiReconcileDto (bank_account, period_start, period_end, opening_balance, closing_balance)
    - ApiReconciliationResponseDto (id, status, bank_account, matched_count, unmatched_count, discrepancy, etc.)
    - ApiIncomeStatementQueryDto (period_start, period_end, format?)
    - ApiIncomeStatementResponseDto (period, income, expenses, net_profit, generated_at)
  </file>

  <file path="src/database/services/reconciliation.service.ts" purpose="Reconciliation service">
    ReconciliationService.reconcile(dto, userId) -> ReconciliationResult
    Returns: { id, status, openingBalanceCents, closingBalanceCents, calculatedBalanceCents,
               discrepancyCents, matchedCount, unmatchedCount }

    Status: RECONCILED (discrepancy = 0) or DISCREPANCY (discrepancy > 0)
  </file>

  <file path="src/database/services/financial-report.service.ts" purpose="Financial reports">
    FinancialReportService.generateIncomeStatement(tenantId, periodStart, periodEnd)
    Returns: IncomeStatement { period, income, expenses, netProfitCents, generatedAt }

    Income from paid invoices, expenses from categorized transactions.
  </file>

  <file path="src/database/services/discrepancy-detection.service.ts" purpose="Discrepancy detection">
    DiscrepancyDetectionService.detect(tenantId, periodStart, periodEnd, bankAccount)
    Returns: { inBankNotXero[], inXeroNotBank[], amountMismatches[] }
  </file>

  <file path="src/database/entities/reconciliation.entity.ts" purpose="Reconciliation entity">
    ReconciliationStatus: DRAFT, IN_PROGRESS, RECONCILED, DISCREPANCY
    Fields: tenantId, bankAccount, periodStart, periodEnd, openingBalanceCents,
            closingBalanceCents, calculatedBalanceCents, discrepancyCents, status,
            matchedCount, unmatchedCount, reconciledBy, reconciledAt
  </file>

  <file path="tests/api/reconciliation/reconciliation.controller.spec.ts" purpose="Controller tests">
    12 tests for POST /reconciliation endpoint.
    Pattern: Use jest.spyOn() for service verification.
  </file>

  <file path="tests/api/reconciliation/reports.controller.spec.ts" purpose="Income statement tests">
    14 tests for GET /reconciliation/income-statement endpoint.
    Pattern: Use jest.spyOn() for FinancialReportService verification.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="tests/e2e/reconciliation-flow.e2e.spec.ts">
    Complete E2E test suite:

    ```typescript
    import { Test, TestingModule } from '@nestjs/testing';
    import { INestApplication, ValidationPipe } from '@nestjs/common';
    import * as request from 'supertest';
    import { AppModule } from '../../src/app.module';
    import { PrismaService } from '../../src/database/prisma/prisma.service';

    describe('E2E: Reconciliation Flow', () => {
      let app: INestApplication;
      let prisma: PrismaService;
      let authToken: string;
      let testTenantId: string;

      beforeAll(async () => {
        // Setup app, tenant, user, token
        // Create complete financial cycle:
        // - Parents and children
        // - Invoices (income)
        // - Payments (credits)
        // - Expense transactions (debits)
      });

      afterAll(async () => {
        // Cleanup in order: reconciliations, payments, transactions, invoices, etc.
      });

      describe('Bank Reconciliation', () => {
        it('reconciles perfectly when balances match', async () => {
          // POST /reconciliation with correct opening/closing
          // Expect status: RECONCILED, discrepancy: 0
        });

        it('validates balance formula: opening + credits - debits = closing', async () => {
          // Calculate expected from transaction sums
          // Verify calculated_balance matches
        });

        it('marks all matched transactions as reconciled', async () => {
          // Verify is_reconciled = true for all period transactions
        });

        it('identifies discrepancies with clear explanations', async () => {
          // Create mismatched closing balance
          // Expect status: DISCREPANCY with explanation
        });

        it('prevents re-reconciliation of same period', async () => {
          // POST /reconciliation again → 409 Already reconciled
        });
      });

      describe('Income Statement', () => {
        it('calculates total income from paid invoices', async () => {
          // Verify income.total matches sum of paid invoice amounts
        });

        it('calculates total expenses from categorized transactions', async () => {
          // Verify expenses.total matches sum of expense transactions
        });

        it('calculates net profit correctly', async () => {
          // net_profit = income.total - expenses.total
        });

        it('breaks down by account category', async () => {
          // Verify breakdown arrays have account_code and account_name
        });
      });

      describe('Transaction Immutability', () => {
        it('prevents editing reconciled transactions', async () => {
          // PUT /transactions/:id/categorize → 409 Cannot edit reconciled
        });
      });

      describe('Financial Integrity', () => {
        it('maintains chain of balances across periods', async () => {
          // February opening = January closing
        });

        it('accounts receivable matches unpaid invoices', async () => {
          // AR = total_invoiced - total_paid
        });
      });
    });
    ```
  </file>

  <file path="tests/helpers/balance-validators.ts">
    Helper functions:
    - calculateExpectedClosing(opening, credits, debits) -> closing
    - validateBalanceFormula(opening, credits, debits, closing) -> boolean
    - sumTransactionsByType(transactions) -> { credits, debits }
  </file>

  <file path="tests/helpers/financial-integrity-checker.ts">
    Comprehensive validation:
    - checkReconciliationChain(reconciliations) -> { valid, errors[] }
    - checkInvoicePaymentBalance(invoices, payments) -> { outstanding, errors[] }
    - checkSystemIntegrity(tenantId) -> IntegrityReport
  </file>

  <file path="tests/e2e/INTEGRATION_SUMMARY.md">
    Summary of all 5 integration tests:
    - TASK-INT-001: Transaction Categorization (CSV/PDF import, AI categorization, patterns)
    - TASK-INT-002: Billing Cycle (enrollment, invoicing, delivery)
    - TASK-INT-003: Payment Matching (AI matching, allocation, arrears)
    - TASK-INT-004: SARS Submission (VAT201, EMP201, immutability)
    - TASK-INT-005: Reconciliation (balance formula, income statement, integrity)
  </file>
</files_to_create>

<test_requirements>
  <requirement>Use real database with actual Prisma operations</requirement>
  <requirement>Use real ReconciliationService and FinancialReportService</requirement>
  <requirement>Mock only external Xero MCP for sync operations</requirement>
  <requirement>Balance formula must be exact to 2 decimal places</requirement>
  <requirement>All discrepancies identified with type and reason</requirement>
  <requirement>Reconciled transactions immutable at database level</requirement>
  <requirement>Cannot re-reconcile same period (409 Conflict)</requirement>
  <requirement>Income statement totals match ledger entries</requirement>
  <requirement>Period chain maintains continuity (closing = next opening)</requirement>
  <requirement>Test validates all 63 tasks work together correctly</requirement>
</test_requirements>

<endpoint_reference>
  | Method | Path | DTO In | DTO Out | Description |
  |--------|------|--------|---------|-------------|
  | POST | /reconciliation | ApiReconcileDto | ApiReconciliationResponseDto | Run reconciliation |
  | GET | /reconciliation/income-statement | ApiIncomeStatementQueryDto | ApiIncomeStatementResponseDto | Income statement |
</endpoint_reference>

<balance_formula>
  The critical formula that must always be validated:

  closing_balance = opening_balance + total_credits - total_debits

  Where:
  - opening_balance: Bank balance at period start
  - total_credits: Sum of all credit transactions (money in)
  - total_debits: Sum of all debit transactions (money out)
  - closing_balance: Bank balance at period end

  If calculated_balance != closing_balance, status = DISCREPANCY
</balance_formula>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test:e2e -- reconciliation-flow.e2e.spec.ts - all tests pass</step>
  <step>Verify balance formula validates exactly</step>
  <step>Verify income statement totals match reconciliation</step>
  <step>Verify reconciled transactions are immutable</step>
  <step>Verify financial integrity across all 63 tasks</step>
</verification_steps>

<test_commands>
  <command>npm run test:e2e -- reconciliation-flow.e2e.spec.ts</command>
  <command>npm run test:e2e -- --verbose</command>
</test_commands>

<final_validation>
  This is the FINAL integration test. Upon completion:
  - All 63 tasks validated
  - 1536+ unit tests passing
  - 5 E2E integration tests passing
  - Financial integrity verified
  - System ready for production
</final_validation>

</task_spec>
