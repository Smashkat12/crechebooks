<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-RECON-005</task_id>
    <title>Align Discrepancy Service Logic with Reconciliation Service</title>
    <priority>MEDIUM</priority>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>4 hours</estimated_effort>
    <assigned_to>TBD</assigned_to>
    <tags>reconciliation, discrepancy, consistency, alignment</tags>
  </metadata>

  <context>
    <problem_statement>
      The DiscrepancyService uses different calculation logic than the main
      BankStatementReconciliationService, leading to inconsistent results. When a
      discrepancy is reported, the values may not match what the reconciliation
      service calculated, causing confusion and reducing trust in the system.

      Key differences identified:
      - Balance calculation methods differ (running total vs. point-in-time)
      - Tolerance handling is inconsistent
      - Date range filtering uses different criteria
      - Rounding behavior varies between services
    </problem_statement>

    <business_impact>
      - Conflicting reports between reconciliation and discrepancy views
      - User confusion when numbers don't match
      - Extra time spent reconciling the reconciliation
      - Audit findings due to inconsistent calculations
      - Reduced confidence in financial reporting
    </business_impact>

    <root_cause>
      The DiscrepancyService was developed independently and later, without using
      shared calculation logic from the reconciliation service. No single source of
      truth for calculation logic exists.
    </root_cause>
  </context>

  <scope>
    <in_scope>
      - Extract shared calculation logic into common utilities
      - Align balance calculation methods
      - Standardize tolerance handling (with TASK-RECON-003)
      - Unify date range filtering logic
      - Ensure consistent rounding behavior
      - Add validation to detect calculation drift
    </in_scope>

    <out_of_scope>
      - UI changes for discrepancy display
      - Historical discrepancy recalculation
      - New discrepancy types or categories
    </out_of_scope>

    <affected_files>
      <file path="apps/api/src/reconciliation/utils/calculation.utils.ts" change_type="create">
        Shared calculation utilities
      </file>
      <file path="apps/api/src/reconciliation/discrepancy.service.ts" change_type="modify">
        Refactor to use shared calculation utilities
      </file>
      <file path="apps/api/src/reconciliation/bank-statement-reconciliation.service.ts" change_type="modify">
        Refactor to use shared calculation utilities
      </file>
      <file path="apps/api/src/reconciliation/utils/calculation.utils.spec.ts" change_type="create">
        Tests for shared calculation utilities
      </file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      1. Audit both services to identify all calculation discrepancies
      2. Design shared calculation utilities with clear semantics
      3. Extract calculation logic from both services
      4. Implement shared utilities with comprehensive tests
      5. Refactor both services to use shared utilities
      6. Add validation to ensure consistency going forward
    </approach>

    <technical_details>
      <code_changes>
        <change file="apps/api/src/reconciliation/utils/calculation.utils.ts">
          ```typescript
          import { ToleranceConfigService } from '../config/tolerance.config';
          import { BankStatementEntry, Transaction } from '../types';

          /**
           * Shared calculation utilities for reconciliation operations.
           * All monetary calculations use cents (integers) to avoid floating point issues.
           */
          export class ReconciliationCalculator {
            constructor(
              private readonly toleranceConfig: ToleranceConfigService
            ) {}

            /**
             * Calculate balance difference with consistent methodology.
             * Uses running total approach where each entry updates the balance.
             *
             * @param entries - Bank statement entries in chronological order
             * @param expectedClosingBalance - Expected balance at end of period
             * @returns Balance difference (positive = system has more, negative = bank has more)
             */
            calculateBalanceDifference(
              entries: BankStatementEntry[],
              expectedClosingBalance: number
            ): BalanceCalculationResult {
              if (entries.length === 0) {
                return {
                  calculatedBalance: 0,
                  expectedBalance: expectedClosingBalance,
                  difference: expectedClosingBalance,
                  withinTolerance: this.toleranceConfig.isWithinTolerance(
                    expectedClosingBalance,
                    expectedClosingBalance,
                    'balanceValidationTolerance'
                  ),
                };
              }

              // Sort entries by date to ensure correct running total
              const sortedEntries = [...entries].sort(
                (a, b) => a.date.getTime() - b.date.getTime()
              );

              // Get the last entry's balance as the actual closing balance
              const actualClosingBalance = sortedEntries[sortedEntries.length - 1].balance;

              const difference = expectedClosingBalance - actualClosingBalance;

              return {
                calculatedBalance: actualClosingBalance,
                expectedBalance: expectedClosingBalance,
                difference,
                withinTolerance: this.toleranceConfig.isWithinTolerance(
                  Math.abs(difference),
                  expectedClosingBalance,
                  'balanceValidationTolerance'
                ),
              };
            }

            /**
             * Calculate transaction totals with consistent rounding.
             * All calculations use integer cents to avoid floating point errors.
             *
             * @param transactions - Array of transactions
             * @returns Totals for credits, debits, and net
             */
            calculateTransactionTotals(transactions: Transaction[]): TransactionTotals {
              let credits = 0;
              let debits = 0;

              for (const txn of transactions) {
                // Ensure we're working with integers (cents)
                const amount = Math.round(txn.amount);

                if (txn.type === 'credit' || txn.amount > 0) {
                  credits += Math.abs(amount);
                } else {
                  debits += Math.abs(amount);
                }
              }

              return {
                totalCredits: credits,
                totalDebits: debits,
                netAmount: credits - debits,
                transactionCount: transactions.length,
              };
            }

            /**
             * Calculate amount difference between bank entry and transaction.
             * Handles sign normalization for credit/debit comparison.
             */
            calculateAmountDifference(
              bankAmount: number,
              transactionAmount: number
            ): AmountDifferenceResult {
              // Normalize to absolute values for comparison
              const normalizedBank = Math.abs(Math.round(bankAmount));
              const normalizedTxn = Math.abs(Math.round(transactionAmount));

              const difference = normalizedBank - normalizedTxn;
              const percentageDifference = normalizedBank !== 0
                ? (difference / normalizedBank) * 100
                : 0;

              return {
                bankAmount: normalizedBank,
                transactionAmount: normalizedTxn,
                absoluteDifference: Math.abs(difference),
                percentageDifference,
                withinTolerance: this.toleranceConfig.isWithinTolerance(
                  Math.abs(difference),
                  normalizedBank,
                  'amountMatchingTolerance'
                ),
              };
            }

            /**
             * Filter entries by date range with consistent boundary handling.
             * Uses inclusive start and exclusive end for consistency.
             *
             * @param entries - Array of entries to filter
             * @param startDate - Start of range (inclusive)
             * @param endDate - End of range (exclusive)
             */
            filterByDateRange<T extends { date: Date }>(
              entries: T[],
              startDate: Date,
              endDate: Date
            ): T[] {
              const start = this.normalizeDate(startDate, 'start');
              const end = this.normalizeDate(endDate, 'end');

              return entries.filter(entry => {
                const entryDate = entry.date.getTime();
                return entryDate >= start.getTime() && entryDate < end.getTime();
              });
            }

            /**
             * Normalize date to start or end of day for consistent comparisons.
             */
            private normalizeDate(date: Date, boundary: 'start' | 'end'): Date {
              const normalized = new Date(date);

              if (boundary === 'start') {
                normalized.setHours(0, 0, 0, 0);
              } else {
                normalized.setHours(23, 59, 59, 999);
              }

              return normalized;
            }

            /**
             * Round monetary value to cents with consistent banker's rounding.
             */
            roundToCents(value: number): number {
              // Banker's rounding: round half to even
              const scaled = value * 100;
              const floor = Math.floor(scaled);
              const decimal = scaled - floor;

              if (decimal === 0.5) {
                // Round to nearest even
                return floor % 2 === 0 ? floor : floor + 1;
              }

              return Math.round(scaled);
            }
          }

          // Result types
          export interface BalanceCalculationResult {
            calculatedBalance: number;
            expectedBalance: number;
            difference: number;
            withinTolerance: boolean;
          }

          export interface TransactionTotals {
            totalCredits: number;
            totalDebits: number;
            netAmount: number;
            transactionCount: number;
          }

          export interface AmountDifferenceResult {
            bankAmount: number;
            transactionAmount: number;
            absoluteDifference: number;
            percentageDifference: number;
            withinTolerance: boolean;
          }
          ```
        </change>

        <change file="apps/api/src/reconciliation/discrepancy.service.ts">
          ```typescript
          import { Injectable, Logger } from '@nestjs/common';
          import { ReconciliationCalculator } from './utils/calculation.utils';
          import { ToleranceConfigService } from './config/tolerance.config';

          @Injectable()
          export class DiscrepancyService {
            private readonly logger = new Logger(DiscrepancyService.name);
            private readonly calculator: ReconciliationCalculator;

            constructor(
              private readonly toleranceConfig: ToleranceConfigService,
              private readonly prisma: PrismaService,
            ) {
              // Use shared calculator
              this.calculator = new ReconciliationCalculator(toleranceConfig);
            }

            /**
             * Detect balance discrepancies using shared calculation logic.
             */
            async detectBalanceDiscrepancy(
              accountId: string,
              periodStart: Date,
              periodEnd: Date
            ): Promise<BalanceDiscrepancy | null> {
              const entries = await this.prisma.bankStatementEntry.findMany({
                where: { accountId },
              });

              // Use shared date filtering
              const periodEntries = this.calculator.filterByDateRange(
                entries,
                periodStart,
                periodEnd
              );

              const expectedBalance = await this.getExpectedBalance(accountId, periodEnd);

              // Use shared balance calculation
              const result = this.calculator.calculateBalanceDifference(
                periodEntries,
                expectedBalance
              );

              if (!result.withinTolerance) {
                return {
                  type: 'balance',
                  accountId,
                  periodStart,
                  periodEnd,
                  expectedBalance: result.expectedBalance,
                  actualBalance: result.calculatedBalance,
                  difference: result.difference,
                  severity: this.calculateSeverity(result.difference, result.expectedBalance),
                };
              }

              return null;
            }

            /**
             * Detect transaction amount discrepancies using shared calculation logic.
             */
            async detectAmountDiscrepancies(
              matchedPairs: Array<{ bankEntry: BankStatementEntry; transaction: Transaction }>
            ): Promise<AmountDiscrepancy[]> {
              const discrepancies: AmountDiscrepancy[] = [];

              for (const { bankEntry, transaction } of matchedPairs) {
                // Use shared amount calculation
                const result = this.calculator.calculateAmountDifference(
                  bankEntry.amount,
                  transaction.amount
                );

                if (!result.withinTolerance) {
                  discrepancies.push({
                    type: 'amount',
                    bankEntryId: bankEntry.id,
                    transactionId: transaction.id,
                    bankAmount: result.bankAmount,
                    transactionAmount: result.transactionAmount,
                    difference: result.absoluteDifference,
                    percentageDifference: result.percentageDifference,
                    severity: this.calculateSeverity(
                      result.absoluteDifference,
                      result.bankAmount
                    ),
                  });
                }
              }

              return discrepancies;
            }

            /**
             * Calculate totals for discrepancy reporting using shared logic.
             */
            async calculateDiscrepancyTotals(
              discrepancies: Discrepancy[]
            ): Promise<DiscrepancyTotals> {
              const amountDiscrepancies = discrepancies
                .filter(d => d.type === 'amount')
                .map(d => ({ amount: d.difference, date: d.createdAt, type: 'debit' as const }));

              // Use shared totals calculation
              const totals = this.calculator.calculateTransactionTotals(
                amountDiscrepancies as any
              );

              return {
                totalDiscrepancies: discrepancies.length,
                totalAmount: totals.netAmount,
                byType: this.groupByType(discrepancies),
                bySeverity: this.groupBySeverity(discrepancies),
              };
            }

            private calculateSeverity(
              difference: number,
              baseAmount: number
            ): 'low' | 'medium' | 'high' | 'critical' {
              const percentage = baseAmount !== 0
                ? (Math.abs(difference) / baseAmount) * 100
                : 100;

              if (percentage < 0.1 || difference < 100) return 'low';
              if (percentage < 1 || difference < 1000) return 'medium';
              if (percentage < 5 || difference < 10000) return 'high';
              return 'critical';
            }

            // ... other helper methods
          }
          ```
        </change>

        <change file="apps/api/src/reconciliation/bank-statement-reconciliation.service.ts">
          ```typescript
          // Update to use shared calculator
          import { ReconciliationCalculator } from './utils/calculation.utils';

          @Injectable()
          export class BankStatementReconciliationService {
            private readonly calculator: ReconciliationCalculator;

            constructor(
              private readonly toleranceConfig: ToleranceConfigService,
              // ... other dependencies
            ) {
              this.calculator = new ReconciliationCalculator(toleranceConfig);
            }

            async reconcile(
              bankEntries: BankStatementEntry[],
              transactions: Transaction[],
              options: ReconciliationOptions
            ): Promise<ReconciliationResult> {
              // Use shared date filtering
              const filteredEntries = this.calculator.filterByDateRange(
                bankEntries,
                options.startDate,
                options.endDate
              );

              // Use shared totals calculation
              const bankTotals = this.calculator.calculateTransactionTotals(
                filteredEntries.map(e => ({
                  amount: e.amount,
                  type: e.type,
                  date: e.date,
                })) as any
              );

              const systemTotals = this.calculator.calculateTransactionTotals(
                transactions
              );

              // Use shared balance calculation
              const balanceResult = this.calculator.calculateBalanceDifference(
                filteredEntries,
                options.expectedClosingBalance
              );

              // ... rest of reconciliation logic using shared calculations
            }
          }
          ```
        </change>
      </code_changes>
    </technical_details>

    <dependencies>
      - TASK-RECON-003 (Standardize Tolerance) - provides ToleranceConfigService
    </dependencies>

    <risks>
      <risk level="medium">
        Refactoring may temporarily break existing functionality. Mitigated by
        comprehensive test coverage before refactoring.
      </risk>
      <risk level="low">
        Existing discrepancy records may differ from new calculations. Document
        that historical records use previous logic.
      </risk>
    </risks>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001" type="unit">
        <description>ReconciliationCalculator and DiscrepancyService produce same balance result</description>
        <input>Same bank entries and expected balance</input>
        <expected>Identical difference values</expected>
      </test_case>

      <test_case id="TC-002" type="unit">
        <description>Date range filtering is consistent across services</description>
        <input>Same entries and date range</input>
        <expected>Same entries returned from both services</expected>
      </test_case>

      <test_case id="TC-003" type="unit">
        <description>Amount difference calculation is consistent</description>
        <input>Same bank entry and transaction amounts</input>
        <expected>Same difference and withinTolerance result</expected>
      </test_case>

      <test_case id="TC-004" type="unit">
        <description>Transaction totals match between services</description>
        <input>Same set of transactions</input>
        <expected>Same credit, debit, and net totals</expected>
      </test_case>

      <test_case id="TC-005" type="unit">
        <description>Rounding is consistent (banker's rounding)</description>
        <input>Value of 123.455</input>
        <expected>Rounded to 12346 cents (round half to even)</expected>
      </test_case>

      <test_case id="TC-006" type="integration">
        <description>Full reconciliation matches discrepancy detection</description>
        <input>Complete reconciliation run</input>
        <expected>All calculated values are identical</expected>
      </test_case>
    </test_cases>

    <acceptance_criteria>
      - Single ReconciliationCalculator class used by both services
      - Balance calculations are identical between services
      - Date filtering uses same boundary handling
      - Rounding behavior is consistent (banker's rounding)
      - All tolerance checks use shared ToleranceConfigService
      - No calculation logic remains duplicated in service files
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item status="pending">ReconciliationCalculator utility class created</item>
      <item status="pending">Balance calculation method implemented</item>
      <item status="pending">Transaction totals method implemented</item>
      <item status="pending">Amount difference method implemented</item>
      <item status="pending">Date range filtering method implemented</item>
      <item status="pending">Banker's rounding implemented</item>
      <item status="pending">DiscrepancyService refactored to use calculator</item>
      <item status="pending">BankStatementReconciliationService refactored</item>
      <item status="pending">Unit tests for ReconciliationCalculator (>90% coverage)</item>
      <item status="pending">Integration tests verify consistency</item>
      <item status="pending">Code reviewed and approved</item>
      <item status="pending">Documentation updated with calculation logic</item>
    </checklist>

    <review_notes>
      Pay special attention to edge cases: zero amounts, negative values (refunds),
      very large amounts, and date boundary conditions. Ensure all existing tests
      still pass after refactoring.
    </review_notes>
  </definition_of_done>
</task_specification>
