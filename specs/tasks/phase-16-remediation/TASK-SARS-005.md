<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-SARS-005</task_id>
    <title>Complete Period Format Validation Tests</title>
    <priority>LOW</priority>
    <severity>LOW</severity>
    <category>testing</category>
    <estimated_effort>1-2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>
      <tag>sars</tag>
      <tag>testing</tag>
      <tag>validation</tag>
      <tag>period-format</tag>
      <tag>test-coverage</tag>
    </tags>
  </metadata>

  <context>
    <issue_description>
      The SARS module has incomplete test coverage for tax period format validation.
      Period format validation is critical as SARS requires specific YYYYMM format,
      and invalid formats can cause submission failures.
    </issue_description>

    <current_behavior>
      Existing tests may only cover basic valid/invalid cases. Edge cases such as
      boundary months (01, 12), year transitions, invalid month values (13, 00),
      and malformed strings are not comprehensively tested.
    </current_behavior>

    <expected_behavior>
      Comprehensive test suite covering all period format validation scenarios
      including valid formats, boundary cases, invalid formats, edge cases,
      and error message verification.
    </expected_behavior>

    <affected_files>
      <file>apps/api/src/sars/*.spec.ts</file>
      <file>apps/api/src/sars/vat201.service.spec.ts</file>
      <file>apps/api/src/sars/emp201.service.spec.ts</file>
      <file>apps/api/src/sars/deadline.service.spec.ts</file>
      <file>apps/api/src/sars/validators/period.validator.spec.ts</file>
    </affected_files>

    <period_format_rules>
      <rule>Format: YYYYMM (6 digits)</rule>
      <rule>Year: 4 digits, reasonable range (e.g., 2000-2100)</rule>
      <rule>Month: 2 digits, 01-12</rule>
      <rule>No separators, spaces, or special characters</rule>
      <rule>Must be numeric only</rule>
    </period_format_rules>
  </context>

  <scope>
    <in_scope>
      <item>Add comprehensive period format validation tests</item>
      <item>Test boundary conditions (month 01, 12, year transitions)</item>
      <item>Test invalid formats (wrong length, non-numeric, invalid months)</item>
      <item>Test error messages for validation failures</item>
      <item>Achieve minimum 90% coverage for period validation</item>
    </in_scope>

    <out_of_scope>
      <item>Implementing new validation logic (only testing existing)</item>
      <item>Performance/load testing</item>
      <item>E2E API testing</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Create a comprehensive test suite organized by validation scenario categories.
      Use parameterized tests (test.each) for efficient coverage of multiple cases.
      Ensure tests are descriptive and serve as documentation for expected behavior.
    </approach>

    <steps>
      <step order="1">
        <description>Audit existing period validation tests</description>
        <details>
          Review current test files to identify gaps and missing scenarios
        </details>
      </step>

      <step order="2">
        <description>Create/update period validator test file</description>
        <details>
          Add comprehensive test cases for period format validation
        </details>
        <code_example>
// apps/api/src/sars/validators/period.validator.spec.ts
import { validateTaxPeriod, TaxPeriodValidationError } from './period.validator';

describe('TaxPeriod Validator', () => {
  describe('Valid Formats', () => {
    const validPeriods = [
      ['202401', 'January 2024'],
      ['202412', 'December 2024'],
      ['202301', 'January 2023'],
      ['202006', 'June 2020'],
      ['203012', 'December 2030'],
      ['200001', 'January 2000 (boundary year)'],
    ];

    test.each(validPeriods)(
      'should accept valid period %s (%s)',
      (period, description) => {
        expect(() => validateTaxPeriod(period)).not.toThrow();
        expect(validateTaxPeriod(period)).toEqual({
          year: parseInt(period.substring(0, 4)),
          month: parseInt(period.substring(4, 6)),
          formatted: period,
        });
      }
    );
  });

  describe('Invalid Month Values', () => {
    const invalidMonths = [
      ['202400', 'month 00'],
      ['202413', 'month 13'],
      ['202499', 'month 99'],
      ['202420', 'month 20'],
    ];

    test.each(invalidMonths)(
      'should reject period %s with invalid %s',
      (period, description) => {
        expect(() => validateTaxPeriod(period)).toThrow(TaxPeriodValidationError);
        expect(() => validateTaxPeriod(period)).toThrow(/invalid month/i);
      }
    );
  });

  describe('Invalid Format - Wrong Length', () => {
    const wrongLength = [
      ['20241', '5 characters'],
      ['2024011', '7 characters'],
      ['2024', '4 characters (year only)'],
      ['01', '2 characters (month only)'],
      ['', 'empty string'],
      ['202401202401', '12 characters (doubled)'],
    ];

    test.each(wrongLength)(
      'should reject %s (%s)',
      (period, description) => {
        expect(() => validateTaxPeriod(period)).toThrow(TaxPeriodValidationError);
        expect(() => validateTaxPeriod(period)).toThrow(/invalid.*length|format/i);
      }
    );
  });

  describe('Invalid Format - Non-Numeric', () => {
    const nonNumeric = [
      ['2024AB', 'letters in month'],
      ['ABCD01', 'letters in year'],
      ['2024-1', 'hyphen separator'],
      ['2024/1', 'slash separator'],
      ['2024.1', 'dot separator'],
      ['2024 1', 'space separator'],
      ['2024_1', 'underscore'],
      ['$20241', 'special character'],
    ];

    test.each(nonNumeric)(
      'should reject %s (%s)',
      (period, description) => {
        expect(() => validateTaxPeriod(period)).toThrow(TaxPeriodValidationError);
        expect(() => validateTaxPeriod(period)).toThrow(/numeric|invalid.*format/i);
      }
    );
  });

  describe('Invalid Year Values', () => {
    const invalidYears = [
      ['000001', 'year 0000'],
      ['199901', 'year before 2000'],
      ['210101', 'year after 2100'],
    ];

    test.each(invalidYears)(
      'should reject period %s with invalid %s',
      (period, description) => {
        expect(() => validateTaxPeriod(period)).toThrow(TaxPeriodValidationError);
        expect(() => validateTaxPeriod(period)).toThrow(/invalid year|out of range/i);
      }
    );
  });

  describe('Edge Cases', () => {
    test('should handle null input', () => {
      expect(() => validateTaxPeriod(null as any)).toThrow(TaxPeriodValidationError);
      expect(() => validateTaxPeriod(null as any)).toThrow(/required|null/i);
    });

    test('should handle undefined input', () => {
      expect(() => validateTaxPeriod(undefined as any)).toThrow(TaxPeriodValidationError);
      expect(() => validateTaxPeriod(undefined as any)).toThrow(/required|undefined/i);
    });

    test('should handle numeric input (not string)', () => {
      expect(() => validateTaxPeriod(202401 as any)).toThrow(TaxPeriodValidationError);
      expect(() => validateTaxPeriod(202401 as any)).toThrow(/string|type/i);
    });

    test('should handle whitespace-padded input', () => {
      expect(() => validateTaxPeriod(' 202401 ')).toThrow(TaxPeriodValidationError);
    });

    test('should handle leading zeros correctly', () => {
      expect(() => validateTaxPeriod('202401')).not.toThrow();
      const result = validateTaxPeriod('202401');
      expect(result.month).toBe(1); // Not 01 as string
    });
  });

  describe('Boundary Months', () => {
    test('should accept month 01 (January)', () => {
      const result = validateTaxPeriod('202401');
      expect(result.month).toBe(1);
    });

    test('should accept month 12 (December)', () => {
      const result = validateTaxPeriod('202412');
      expect(result.month).toBe(12);
    });

    test('should reject month 00', () => {
      expect(() => validateTaxPeriod('202400')).toThrow();
    });

    test('should reject month 13', () => {
      expect(() => validateTaxPeriod('202413')).toThrow();
    });
  });

  describe('Year Transitions', () => {
    test('should handle December to January transition', () => {
      const dec = validateTaxPeriod('202312');
      const jan = validateTaxPeriod('202401');

      expect(dec.year).toBe(2023);
      expect(dec.month).toBe(12);
      expect(jan.year).toBe(2024);
      expect(jan.month).toBe(1);
    });

    test('should accept tax year boundary (March)', () => {
      expect(() => validateTaxPeriod('202403')).not.toThrow(); // Start of SA tax year
      expect(() => validateTaxPeriod('202502')).not.toThrow(); // End of SA tax year
    });
  });

  describe('Error Messages', () => {
    test('should provide descriptive error for invalid month', () => {
      try {
        validateTaxPeriod('202413');
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('month');
        expect(error.message).toMatch(/13|invalid|01.*12/i);
      }
    });

    test('should provide descriptive error for wrong format', () => {
      try {
        validateTaxPeriod('2024-01');
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('format');
        expect(error.message).toContain('YYYYMM');
      }
    });

    test('should include invalid value in error message', () => {
      try {
        validateTaxPeriod('invalid');
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('invalid');
      }
    });
  });
});
        </code_example>
      </step>

      <step order="3">
        <description>Add integration tests for services using period validation</description>
        <details>
          Test that services correctly reject invalid periods and accept valid ones
        </details>
        <code_example>
// apps/api/src/sars/vat201.service.spec.ts (additions)
describe('VAT201Service - Period Validation', () => {
  describe('generateVat201 - Period Parameter', () => {
    const invalidPeriods = ['', 'invalid', '202413', '2024-01', '20241'];

    test.each(invalidPeriods)(
      'should reject invalid period: %s',
      async (period) => {
        await expect(
          service.generateVat201(organizationId, period)
        ).rejects.toThrow(/period|format|invalid/i);
      }
    );

    test('should accept valid period format', async () => {
      const result = await service.generateVat201(organizationId, '202401');
      expect(result).toBeDefined();
      expect(result.taxPeriod).toBe('202401');
    });
  });
});

// apps/api/src/sars/emp201.service.spec.ts (additions)
describe('EMP201Service - Period Validation', () => {
  describe('generateEmp201 - Period Parameter', () => {
    test('should validate period before processing', async () => {
      await expect(
        service.generateEmp201(organizationId, 'bad')
      ).rejects.toThrow();
    });
  });
});

// apps/api/src/sars/deadline.service.spec.ts (additions)
describe('DeadlineService - Period Validation', () => {
  describe('calculateVat201Deadline', () => {
    test('should reject invalid period format', () => {
      expect(() => service.calculateVat201Deadline('2024/01')).toThrow();
    });

    test('should handle boundary periods correctly', () => {
      // January period - deadline in February
      const janDeadline = service.calculateVat201Deadline('202401');
      expect(janDeadline.getMonth()).toBe(1); // February (0-indexed)

      // December period - deadline in January next year
      const decDeadline = service.calculateVat201Deadline('202412');
      expect(decDeadline.getFullYear()).toBe(2025);
      expect(decDeadline.getMonth()).toBe(0); // January
    });
  });
});
        </code_example>
      </step>

      <step order="4">
        <description>Add test coverage reporting</description>
        <details>
          Ensure coverage reports show period validation at >= 90%
        </details>
      </step>

      <step order="5">
        <description>Document test scenarios in test file</description>
        <details>
          Add JSDoc comments explaining test categories and expected behaviors
        </details>
      </step>
    </steps>

    <test_organization>
      <category name="Valid Formats">Standard valid YYYYMM formats</category>
      <category name="Invalid Month Values">Months outside 01-12 range</category>
      <category name="Invalid Format - Wrong Length">Too short/long strings</category>
      <category name="Invalid Format - Non-Numeric">Letters, symbols, separators</category>
      <category name="Invalid Year Values">Years outside reasonable range</category>
      <category name="Edge Cases">null, undefined, wrong types</category>
      <category name="Boundary Months">Month 01 and 12 handling</category>
      <category name="Year Transitions">December to January, tax year boundaries</category>
      <category name="Error Messages">Descriptive and helpful error content</category>
    </test_organization>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>All new tests pass</name>
        <type>unit</type>
        <expected_result>100% pass rate for new test cases</expected_result>
      </test_case>
      <test_case>
        <name>Coverage threshold met</name>
        <type>coverage</type>
        <expected_result>>= 90% coverage for period validation code</expected_result>
      </test_case>
      <test_case>
        <name>No regression in existing tests</name>
        <type>regression</type>
        <expected_result>All existing tests continue to pass</expected_result>
      </test_case>
    </test_cases>

    <coverage_targets>
      <target file="period.validator.ts">90%</target>
      <target file="vat201.service.ts" function="generateVat201">85%</target>
      <target file="emp201.service.ts" function="generateEmp201">85%</target>
      <target file="deadline.service.ts">85%</target>
    </coverage_targets>

    <manual_verification>
      <step>Run npm test -- --coverage and verify targets met</step>
      <step>Review test output for descriptive test names</step>
      <step>Verify error messages are helpful for debugging</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criterion>Comprehensive test suite covering all period format scenarios</criterion>
    <criterion>Parameterized tests used for efficient coverage</criterion>
    <criterion>>= 90% code coverage for period validation</criterion>
    <criterion>All edge cases tested (null, undefined, wrong types)</criterion>
    <criterion>Boundary conditions tested (month 01/12, year transitions)</criterion>
    <criterion>Error message content verified in tests</criterion>
    <criterion>Test file well-documented with JSDoc comments</criterion>
    <criterion>No regression in existing tests</criterion>
    <criterion>Code review approved</criterion>
  </definition_of_done>
</task_specification>
