<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-RECON-003</task_id>
    <title>Standardize Balance Tolerance Configuration</title>
    <priority>MEDIUM</priority>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>3 hours</estimated_effort>
    <assigned_to>TBD</assigned_to>
    <tags>reconciliation, tolerance, configuration, consistency</tags>
  </metadata>

  <context>
    <problem_statement>
      The reconciliation module has inconsistent tolerance values hardcoded in different
      locations. Some services use 1 cent tolerance while others use 100 cents (R1). This
      inconsistency leads to unpredictable reconciliation results and makes it difficult
      to understand or modify tolerance behavior.

      Current state:
      - matching.service.ts: No tolerance (exact match only)
      - discrepancy.service.ts: 1 cent tolerance for some checks
      - bank-statement-reconciliation.service.ts: 100 cents for balance validation
    </problem_statement>

    <business_impact>
      - Inconsistent reconciliation outcomes
      - Difficulty explaining reconciliation logic to stakeholders
      - Maintenance burden when tolerance needs adjustment
      - Potential compliance issues with audit trails
    </business_impact>

    <root_cause>
      Tolerance values were added ad-hoc during development without a centralized
      configuration strategy. Different developers made different assumptions about
      acceptable variance.
    </root_cause>
  </context>

  <scope>
    <in_scope>
      - Create centralized tolerance configuration module
      - Define clear tolerance categories (amount, balance, date)
      - Update all services to use shared configuration
      - Add environment-based tolerance overrides
      - Document tolerance rationale and usage
    </in_scope>

    <out_of_scope>
      - UI for tolerance configuration (future feature)
      - Per-account tolerance customization
      - Historical tolerance tracking
    </out_of_scope>

    <affected_files>
      <file path="apps/api/src/reconciliation/config/tolerance.config.ts" change_type="create">
        Centralized tolerance configuration
      </file>
      <file path="apps/api/src/reconciliation/matching.service.ts" change_type="modify">
        Update to use shared tolerance config
      </file>
      <file path="apps/api/src/reconciliation/discrepancy.service.ts" change_type="modify">
        Update to use shared tolerance config
      </file>
      <file path="apps/api/src/reconciliation/bank-statement-reconciliation.service.ts" change_type="modify">
        Update to use shared tolerance config
      </file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      1. Audit existing tolerance usage across all reconciliation files
      2. Design unified tolerance configuration with clear semantics
      3. Create centralized configuration module
      4. Refactor all services to use shared config
      5. Add validation and logging for tolerance usage
    </approach>

    <technical_details>
      <code_changes>
        <change file="apps/api/src/reconciliation/config/tolerance.config.ts">
          ```typescript
          import { Injectable } from '@nestjs/common';
          import { ConfigService } from '@nestjs/config';

          /**
           * Tolerance categories for reconciliation operations.
           * All monetary values are in cents (1 ZAR = 100 cents).
           */
          export interface ToleranceConfig {
            /**
             * Amount matching tolerance for individual transactions.
             * Used when comparing bank entry amounts to system transaction amounts.
             * Default: 1 cent (allows for minor rounding differences)
             */
            amountMatchingTolerance: number;

            /**
             * Balance reconciliation tolerance.
             * Used when validating closing balance matches expected balance.
             * Default: 100 cents (R1) to account for timing differences
             */
            balanceValidationTolerance: number;

            /**
             * Bank fee tolerance for matching.
             * Maximum amount that can be attributed to bank fees.
             * Default: 500 cents (R5) for typical bank fee range
             */
            bankFeeTolerance: number;

            /**
             * Date tolerance in days for matching.
             * Transactions within this window are considered same-day.
             * Default: 1 day (accounts for processing delays)
             */
            dateTolerance: number;

            /**
             * Percentage tolerance for large amounts.
             * Applied when absolute tolerance is insufficient.
             * Default: 0.5% (0.005)
             */
            percentageTolerance: number;
          }

          export const DEFAULT_TOLERANCE_CONFIG: ToleranceConfig = {
            amountMatchingTolerance: 1,        // 1 cent
            balanceValidationTolerance: 100,   // R1
            bankFeeTolerance: 500,             // R5
            dateTolerance: 1,                  // 1 day
            percentageTolerance: 0.005,        // 0.5%
          };

          @Injectable()
          export class ToleranceConfigService {
            private config: ToleranceConfig;

            constructor(private configService: ConfigService) {
              this.config = this.loadConfig();
            }

            private loadConfig(): ToleranceConfig {
              return {
                amountMatchingTolerance: this.configService.get<number>(
                  'RECONCILIATION_AMOUNT_TOLERANCE',
                  DEFAULT_TOLERANCE_CONFIG.amountMatchingTolerance
                ),
                balanceValidationTolerance: this.configService.get<number>(
                  'RECONCILIATION_BALANCE_TOLERANCE',
                  DEFAULT_TOLERANCE_CONFIG.balanceValidationTolerance
                ),
                bankFeeTolerance: this.configService.get<number>(
                  'RECONCILIATION_BANK_FEE_TOLERANCE',
                  DEFAULT_TOLERANCE_CONFIG.bankFeeTolerance
                ),
                dateTolerance: this.configService.get<number>(
                  'RECONCILIATION_DATE_TOLERANCE',
                  DEFAULT_TOLERANCE_CONFIG.dateTolerance
                ),
                percentageTolerance: this.configService.get<number>(
                  'RECONCILIATION_PERCENTAGE_TOLERANCE',
                  DEFAULT_TOLERANCE_CONFIG.percentageTolerance
                ),
              };
            }

            get amountMatchingTolerance(): number {
              return this.config.amountMatchingTolerance;
            }

            get balanceValidationTolerance(): number {
              return this.config.balanceValidationTolerance;
            }

            get bankFeeTolerance(): number {
              return this.config.bankFeeTolerance;
            }

            get dateTolerance(): number {
              return this.config.dateTolerance;
            }

            get percentageTolerance(): number {
              return this.config.percentageTolerance;
            }

            /**
             * Calculate effective tolerance for a given amount.
             * Returns the higher of absolute tolerance or percentage-based tolerance.
             */
            getEffectiveTolerance(amount: number): number {
              const percentageAmount = Math.ceil(amount * this.config.percentageTolerance);
              return Math.max(this.config.amountMatchingTolerance, percentageAmount);
            }

            /**
             * Check if a variance is within tolerance for the given amount.
             */
            isWithinTolerance(
              variance: number,
              amount: number,
              toleranceType: keyof ToleranceConfig = 'amountMatchingTolerance'
            ): boolean {
              const tolerance = toleranceType === 'amountMatchingTolerance'
                ? this.getEffectiveTolerance(amount)
                : this.config[toleranceType] as number;

              return Math.abs(variance) <= tolerance;
            }

            /**
             * Get all current tolerance values for logging/debugging.
             */
            getAllTolerances(): ToleranceConfig {
              return { ...this.config };
            }
          }
          ```
        </change>

        <change file="apps/api/src/reconciliation/matching.service.ts">
          ```typescript
          // Before:
          // const matches = amount1 === amount2;

          // After:
          import { ToleranceConfigService } from './config/tolerance.config';

          @Injectable()
          export class MatchingService {
            constructor(
              private readonly toleranceConfig: ToleranceConfigService,
              // ... other dependencies
            ) {}

            private isAmountMatch(bankAmount: number, transactionAmount: number): boolean {
              const variance = Math.abs(bankAmount - transactionAmount);
              return this.toleranceConfig.isWithinTolerance(
                variance,
                bankAmount,
                'amountMatchingTolerance'
              );
            }

            private isDateMatch(bankDate: Date, transactionDate: Date): boolean {
              const diffDays = Math.abs(
                (bankDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              return diffDays <= this.toleranceConfig.dateTolerance;
            }
          }
          ```
        </change>

        <change file="apps/api/src/reconciliation/bank-statement-reconciliation.service.ts">
          ```typescript
          // Before:
          // const BALANCE_TOLERANCE = 100; // hardcoded

          // After:
          import { ToleranceConfigService } from './config/tolerance.config';

          @Injectable()
          export class BankStatementReconciliationService {
            constructor(
              private readonly toleranceConfig: ToleranceConfigService,
              // ... other dependencies
            ) {}

            private validateBalance(expected: number, actual: number): boolean {
              const variance = Math.abs(expected - actual);
              return this.toleranceConfig.isWithinTolerance(
                variance,
                expected,
                'balanceValidationTolerance'
              );
            }
          }
          ```
        </change>
      </code_changes>
    </technical_details>

    <dependencies>
      - TASK-RECON-001 (Amount Tolerance to Matching) - should be coordinated
      - @nestjs/config package for environment configuration
    </dependencies>

    <risks>
      <risk level="medium">
        Changing tolerance values may affect existing reconciliation results.
        Mitigated by keeping defaults close to existing hardcoded values and
        documenting the change.
      </risk>
      <risk level="low">
        Over-reliance on environment variables may complicate deployment.
        Sensible defaults ensure system works without configuration.
      </risk>
    </risks>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001" type="unit">
        <description>ToleranceConfigService loads default values correctly</description>
        <input>No environment variables set</input>
        <expected>All tolerances match DEFAULT_TOLERANCE_CONFIG</expected>
      </test_case>

      <test_case id="TC-002" type="unit">
        <description>ToleranceConfigService respects environment overrides</description>
        <input>RECONCILIATION_AMOUNT_TOLERANCE=10</input>
        <expected>amountMatchingTolerance = 10, others use defaults</expected>
      </test_case>

      <test_case id="TC-003" type="unit">
        <description>getEffectiveTolerance uses percentage for large amounts</description>
        <input>amount: 100000 (R1000), percentageTolerance: 0.005</input>
        <expected>Returns 500 (0.5% of R1000) not 1 cent</expected>
      </test_case>

      <test_case id="TC-004" type="unit">
        <description>isWithinTolerance correctly evaluates variance</description>
        <input>variance: 50, amount: 10000, tolerance: 100</input>
        <expected>Returns true (50 <= 100)</expected>
      </test_case>

      <test_case id="TC-005" type="integration">
        <description>All services use shared tolerance configuration</description>
        <input>Set custom tolerance via environment</input>
        <expected>All services reflect the custom tolerance</expected>
      </test_case>
    </test_cases>

    <acceptance_criteria>
      - Single source of truth for all tolerance values
      - All reconciliation services use ToleranceConfigService
      - Tolerances configurable via environment variables
      - Default values documented with clear rationale
      - No hardcoded tolerance values remain in service files
      - Logging includes tolerance values used in reconciliation
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item status="pending">ToleranceConfigService implemented</item>
      <item status="pending">DEFAULT_TOLERANCE_CONFIG documented</item>
      <item status="pending">matching.service.ts refactored</item>
      <item status="pending">discrepancy.service.ts refactored</item>
      <item status="pending">bank-statement-reconciliation.service.ts refactored</item>
      <item status="pending">Environment variable documentation added</item>
      <item status="pending">Unit tests for ToleranceConfigService</item>
      <item status="pending">All hardcoded tolerances removed</item>
      <item status="pending">Code reviewed and approved</item>
    </checklist>

    <review_notes>
      Ensure backward compatibility by choosing default values that match the most
      common existing hardcoded values. Document any changes from previous behavior.
    </review_notes>
  </definition_of_done>
</task_specification>
