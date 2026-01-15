<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-RECON-001</task_id>
    <title>Add Amount Tolerance to Matching</title>
    <priority>CRITICAL</priority>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>4 hours</estimated_effort>
    <assigned_to>TBD</assigned_to>
    <tags>reconciliation, matching, tolerance, bank-fees</tags>
  </metadata>

  <context>
    <problem_statement>
      The current reconciliation matching service only performs exact amount matching between
      bank statement entries and system transactions. This causes legitimate transactions to
      fail matching when bank fees, rounding differences, or minor discrepancies exist.

      For example, a payment of R100.00 that incurs a R0.50 bank fee would appear as R99.50
      on the bank statement, causing a match failure despite being the same transaction.
    </problem_statement>

    <business_impact>
      - False negatives in reconciliation results
      - Manual intervention required for fee-adjusted transactions
      - Increased reconciliation time and effort
      - Risk of missing legitimate discrepancies due to alert fatigue
    </business_impact>

    <root_cause>
      The matching algorithm in `matching.service.ts` uses strict equality comparison
      for amount matching without any tolerance configuration.
    </root_cause>
  </context>

  <scope>
    <in_scope>
      - Add configurable amount tolerance to matching service
      - Support both absolute (cents) and percentage-based tolerance
      - Default tolerance of 1 cent for exact matches
      - Configurable upper limit (up to R5) for bank fee scenarios
      - Update matching confidence scoring based on tolerance used
    </in_scope>

    <out_of_scope>
      - Changes to the reconciliation UI
      - Historical data migration
      - Fee categorization or fee-type detection
    </out_of_scope>

    <affected_files>
      <file path="apps/api/src/reconciliation/matching.service.ts" change_type="modify">
        Primary matching logic - add tolerance parameter and comparison
      </file>
      <file path="apps/api/src/reconciliation/dto/matching-config.dto.ts" change_type="create">
        DTO for tolerance configuration
      </file>
      <file path="apps/api/src/reconciliation/constants/tolerance.constants.ts" change_type="create">
        Default tolerance values and limits
      </file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      1. Create tolerance configuration constants with sensible defaults
      2. Add tolerance parameters to matching service methods
      3. Implement tolerance-aware amount comparison
      4. Adjust match confidence score based on tolerance deviation
      5. Add validation to prevent excessive tolerance values
    </approach>

    <technical_details>
      <code_changes>
        <change file="apps/api/src/reconciliation/constants/tolerance.constants.ts">
          ```typescript
          export const TOLERANCE_DEFAULTS = {
            // Default tolerance in cents (1 cent)
            DEFAULT_AMOUNT_TOLERANCE_CENTS: 1,

            // Maximum allowed tolerance in cents (R5 = 500 cents)
            MAX_AMOUNT_TOLERANCE_CENTS: 500,

            // Percentage-based tolerance (0.5%)
            DEFAULT_PERCENTAGE_TOLERANCE: 0.005,

            // Maximum percentage tolerance (5%)
            MAX_PERCENTAGE_TOLERANCE: 0.05,
          } as const;
          ```
        </change>

        <change file="apps/api/src/reconciliation/matching.service.ts">
          ```typescript
          interface ToleranceConfig {
            absoluteTolerance?: number; // in cents
            percentageTolerance?: number; // as decimal (0.01 = 1%)
            useHigherTolerance?: boolean; // use max of absolute/percentage
          }

          private isAmountWithinTolerance(
            amount1: number,
            amount2: number,
            config: ToleranceConfig = {}
          ): { matches: boolean; deviation: number; confidenceAdjustment: number } {
            const {
              absoluteTolerance = TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
              percentageTolerance = TOLERANCE_DEFAULTS.DEFAULT_PERCENTAGE_TOLERANCE,
              useHigherTolerance = true,
            } = config;

            const deviation = Math.abs(amount1 - amount2);
            const percentageDeviation = deviation / Math.max(amount1, amount2);

            const absoluteMatch = deviation <= absoluteTolerance;
            const percentageMatch = percentageDeviation <= percentageTolerance;

            const matches = useHigherTolerance
              ? (absoluteMatch || percentageMatch)
              : (absoluteMatch && percentageMatch);

            // Reduce confidence based on deviation
            const confidenceAdjustment = matches
              ? -Math.min(deviation / absoluteTolerance * 0.1, 0.2)
              : 0;

            return { matches, deviation, confidenceAdjustment };
          }
          ```
        </change>
      </code_changes>
    </technical_details>

    <dependencies>
      - None - this is a foundational change
    </dependencies>

    <risks>
      <risk level="medium">
        Too high tolerance could create false positive matches. Mitigated by
        enforcing maximum tolerance limits and reducing confidence scores.
      </risk>
      <risk level="low">
        Performance impact from additional calculations. Negligible for
        typical reconciliation batch sizes.
      </risk>
    </risks>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001" type="unit">
        <description>Exact amount match returns full confidence</description>
        <input>amount1: 10000, amount2: 10000, tolerance: 1</input>
        <expected>matches: true, deviation: 0, confidenceAdjustment: 0</expected>
      </test_case>

      <test_case id="TC-002" type="unit">
        <description>Amount within tolerance matches with reduced confidence</description>
        <input>amount1: 10000, amount2: 9999, tolerance: 1</input>
        <expected>matches: true, deviation: 1, confidenceAdjustment: -0.1</expected>
      </test_case>

      <test_case id="TC-003" type="unit">
        <description>Amount outside tolerance does not match</description>
        <input>amount1: 10000, amount2: 9998, tolerance: 1</input>
        <expected>matches: false, deviation: 2</expected>
      </test_case>

      <test_case id="TC-004" type="unit">
        <description>Bank fee scenario matches with configured tolerance</description>
        <input>amount1: 10000, amount2: 9950, tolerance: 100</input>
        <expected>matches: true, deviation: 50</expected>
      </test_case>

      <test_case id="TC-005" type="unit">
        <description>Percentage tolerance handles large amounts correctly</description>
        <input>amount1: 1000000, amount2: 999500, percentageTolerance: 0.005</input>
        <expected>matches: true (0.05% deviation within 0.5% tolerance)</expected>
      </test_case>

      <test_case id="TC-006" type="integration">
        <description>End-to-end reconciliation with tolerance produces correct matches</description>
        <input>Bank statement with fee-adjusted transactions</input>
        <expected>Transactions matched with appropriate confidence scores</expected>
      </test_case>
    </test_cases>

    <acceptance_criteria>
      - Tolerance configuration is configurable per reconciliation run
      - Default tolerance of 1 cent is applied when not specified
      - Maximum tolerance of R5 (500 cents) is enforced
      - Match confidence is reduced proportionally to deviation
      - All existing exact matches continue to work unchanged
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item status="pending">Tolerance constants defined with sensible defaults</item>
      <item status="pending">ToleranceConfig interface implemented</item>
      <item status="pending">isAmountWithinTolerance method implemented</item>
      <item status="pending">Matching service updated to use tolerance</item>
      <item status="pending">Unit tests written with >90% coverage for new code</item>
      <item status="pending">Integration tests verify end-to-end behavior</item>
      <item status="pending">Code reviewed and approved</item>
      <item status="pending">Documentation updated</item>
      <item status="pending">No regression in existing functionality</item>
    </checklist>

    <review_notes>
      Pay special attention to edge cases: zero amounts, negative amounts (refunds),
      and very large amounts where percentage tolerance might exceed absolute limits.
    </review_notes>
  </definition_of_done>
</task_specification>
