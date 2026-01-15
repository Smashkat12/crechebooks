<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-TXN-001</task_id>
    <title>Fix Split Transaction Validation</title>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <category>Bug Fix</category>
    <phase>16 - Transaction Remediation</phase>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>2-4 hours</estimated_effort>
    <tags>
      <tag>transactions</tag>
      <tag>validation</tag>
      <tag>security</tag>
      <tag>financial-integrity</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      The split transaction validation logic only verifies that split amounts sum to the
      original transaction amount. It does not validate that individual split parts contain
      positive, non-zero amounts. This creates a vulnerability where users could potentially
      create invalid splits with zero or negative values that still pass validation.
    </problem_statement>

    <current_behavior>
      - Split validation checks: sum(split_amounts) === original_amount
      - No validation for individual split part amounts
      - Zero amounts would pass validation
      - Negative amounts could pass if they balance out
    </current_behavior>

    <expected_behavior>
      - All split parts must have positive amounts greater than zero
      - Sum of splits must equal original transaction amount
      - Clear error messages for invalid split configurations
      - Prevent creation of splits with zero or negative values
    </expected_behavior>

    <impact>
      - Financial integrity risk: Invalid splits could corrupt ledger entries
      - Reporting errors: Zero-value splits would skew transaction counts
      - Audit concerns: Negative splits could be used to hide transactions
    </impact>
  </context>

  <scope>
    <files_to_modify>
      <file>
        <path>apps/api/src/transactions/split.service.ts</path>
        <changes>Add individual amount validation before sum check</changes>
      </file>
    </files_to_modify>

    <files_to_create>
      <file>
        <path>apps/api/src/transactions/__tests__/split.service.spec.ts</path>
        <purpose>Add test cases for edge case validation</purpose>
      </file>
    </files_to_create>

    <out_of_scope>
      <item>UI changes for split transaction forms</item>
      <item>Database schema modifications</item>
      <item>Historical data migration</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Add validation logic to check each split part amount before performing the sum
      validation. Use a dedicated validation function that can be reused and tested
      independently.
    </approach>

    <pseudocode>
```typescript
interface SplitPart {
  amount: number;
  categoryId: string;
  description?: string;
}

function validateSplitParts(parts: SplitPart[], originalAmount: number): ValidationResult {
  // Step 1: Check minimum split count
  if (parts.length < 2) {
    return { valid: false, error: 'Split requires at least 2 parts' };
  }

  // Step 2: Validate each part has positive amount
  for (const part of parts) {
    if (part.amount <= 0) {
      return {
        valid: false,
        error: `Split part amount must be positive: received ${part.amount}`
      };
    }

    if (!Number.isFinite(part.amount)) {
      return {
        valid: false,
        error: 'Split part amount must be a valid finite number'
      };
    }
  }

  // Step 3: Validate sum equals original
  const sum = parts.reduce((acc, part) => acc + part.amount, 0);
  const tolerance = 0.01; // Account for floating point precision

  if (Math.abs(sum - originalAmount) > tolerance) {
    return {
      valid: false,
      error: `Split amounts (${sum}) do not equal original amount (${originalAmount})`
    };
  }

  return { valid: true };
}
```
    </pseudocode>

    <technical_notes>
      - Use Number.isFinite() to catch NaN and Infinity values
      - Apply floating point tolerance for sum comparison
      - Consider using Decimal.js for precise calculations
      - Throw BadRequestException for invalid splits
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should reject split with zero amount part</name>
        <input>splitParts: [{amount: 0, categoryId: 'cat1'}, {amount: 100, categoryId: 'cat2'}]</input>
        <expected_result>ValidationError: Split part amount must be positive</expected_result>
      </test_case>
      <test_case>
        <name>Should reject split with negative amount part</name>
        <input>splitParts: [{amount: -50, categoryId: 'cat1'}, {amount: 150, categoryId: 'cat2'}]</input>
        <expected_result>ValidationError: Split part amount must be positive</expected_result>
      </test_case>
      <test_case>
        <name>Should reject split with NaN amount</name>
        <input>splitParts: [{amount: NaN, categoryId: 'cat1'}, {amount: 100, categoryId: 'cat2'}]</input>
        <expected_result>ValidationError: Split part amount must be a valid finite number</expected_result>
      </test_case>
      <test_case>
        <name>Should accept valid split with all positive amounts</name>
        <input>splitParts: [{amount: 60, categoryId: 'cat1'}, {amount: 40, categoryId: 'cat2'}], originalAmount: 100</input>
        <expected_result>Validation passes, split created successfully</expected_result>
      </test_case>
      <test_case>
        <name>Should handle floating point precision</name>
        <input>splitParts: [{amount: 33.33, categoryId: 'cat1'}, {amount: 33.33, categoryId: 'cat2'}, {amount: 33.34, categoryId: 'cat3'}], originalAmount: 100</input>
        <expected_result>Validation passes within tolerance</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Attempt to create split with zero amount via API - should fail</step>
      <step>Attempt to create split with negative amount via API - should fail</step>
      <step>Verify existing split functionality still works correctly</step>
      <step>Check error messages are user-friendly and actionable</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>All split parts validated for positive, non-zero amounts</criterion>
      <criterion>Clear error messages returned for invalid configurations</criterion>
      <criterion>Unit tests cover zero, negative, NaN, and Infinity cases</criterion>
      <criterion>Integration tests verify API behavior</criterion>
      <criterion>Existing split functionality regression tested</criterion>
      <criterion>Code reviewed and approved</criterion>
      <criterion>No breaking changes to API contract</criterion>
    </criteria>
  </definition_of_done>

  <references>
    <reference>
      <title>Transaction Split Service</title>
      <path>apps/api/src/transactions/split.service.ts</path>
    </reference>
    <reference>
      <title>Financial Validation Standards</title>
      <url>https://docs.example.com/financial-validation</url>
    </reference>
  </references>
</task_specification>
