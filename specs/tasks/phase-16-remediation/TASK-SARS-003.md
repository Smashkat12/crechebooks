<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-SARS-003</task_id>
    <title>Share UIF Cap Constant</title>
    <priority>LOW</priority>
    <severity>LOW</severity>
    <category>code-organization</category>
    <estimated_effort>1-2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>
      <tag>sars</tag>
      <tag>uif</tag>
      <tag>constants</tag>
      <tag>shared-packages</tag>
      <tag>dry</tag>
    </tags>
  </metadata>

  <context>
    <issue_description>
      The UIF (Unemployment Insurance Fund) cap value of R177.12 is hardcoded in the frontend
      payroll constants file. This value should be shared between frontend and backend to ensure
      consistency and make updates easier when SARS changes the rate.
    </issue_description>

    <current_behavior>
      The UIF cap constant exists only in the frontend at apps/web/src/lib/payroll-constants.ts.
      If the backend needs this value, it would need to duplicate it, leading to potential
      inconsistency when the rate changes.
    </current_behavior>

    <expected_behavior>
      The UIF cap and related payroll constants should be defined in a shared types/constants
      package that can be imported by both frontend and backend, ensuring a single source of truth.
    </expected_behavior>

    <affected_files>
      <file>apps/web/src/lib/payroll-constants.ts</file>
      <file>packages/types/src/constants/ (new)</file>
      <file>apps/api/src/sars/*.ts (consumers)</file>
    </affected_files>

    <related_constants>
      <constant name="UIF_CAP_MONTHLY" value="177.12">Maximum monthly UIF contribution</constant>
      <constant name="UIF_RATE_EMPLOYEE" value="0.01">Employee UIF contribution rate (1%)</constant>
      <constant name="UIF_RATE_EMPLOYER" value="0.01">Employer UIF contribution rate (1%)</constant>
      <constant name="UIF_CEILING_ANNUAL" value="212544">Annual remuneration ceiling for UIF</constant>
    </related_constants>
  </context>

  <scope>
    <in_scope>
      <item>Create shared constants package/module for payroll values</item>
      <item>Move UIF-related constants to shared package</item>
      <item>Update frontend to import from shared package</item>
      <item>Document constant update process for annual rate changes</item>
    </in_scope>

    <out_of_scope>
      <item>Automatic rate updates from SARS</item>
      <item>Historical rate tracking</item>
      <item>Admin interface for constant management</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Create a constants module within the shared types package that exports all payroll-related
      constants. This follows the monorepo pattern of sharing code between apps through packages.
    </approach>

    <steps>
      <step order="1">
        <description>Create shared payroll constants module</description>
        <details>
          Add a new constants directory to the types package with payroll constants
        </details>
        <code_example>
// packages/types/src/constants/payroll.constants.ts

/**
 * South African Payroll Constants
 * Updated: 2024 Tax Year
 * Source: SARS
 */

// UIF (Unemployment Insurance Fund) Constants
export const UIF_CONSTANTS = {
  /** Maximum monthly UIF contribution per employee/employer */
  CAP_MONTHLY: 177.12,

  /** Employee contribution rate (1%) */
  RATE_EMPLOYEE: 0.01,

  /** Employer contribution rate (1%) */
  RATE_EMPLOYER: 0.01,

  /** Annual remuneration ceiling for UIF calculation */
  CEILING_ANNUAL: 212544,

  /** Effective date of these constants */
  EFFECTIVE_FROM: '2024-03-01',
} as const;

// SDL (Skills Development Levy) Constants
export const SDL_CONSTANTS = {
  /** SDL rate (1%) */
  RATE: 0.01,

  /** Annual payroll threshold for SDL liability */
  THRESHOLD_ANNUAL: 500000,
} as const;

// Tax Year Constants
export const TAX_YEAR_CONSTANTS = {
  /** Current tax year */
  CURRENT_YEAR: 2024,

  /** Tax year start month */
  START_MONTH: 3, // March

  /** Tax year end month */
  END_MONTH: 2, // February
} as const;

// Type exports for type-safe usage
export type UifConstants = typeof UIF_CONSTANTS;
export type SdlConstants = typeof SDL_CONSTANTS;
export type TaxYearConstants = typeof TAX_YEAR_CONSTANTS;
        </code_example>
      </step>

      <step order="2">
        <description>Create index export for constants</description>
        <details>
          Add barrel export for easy importing
        </details>
        <code_example>
// packages/types/src/constants/index.ts
export * from './payroll.constants';

// packages/types/src/index.ts (update)
export * from './constants';
        </code_example>
      </step>

      <step order="3">
        <description>Update frontend to use shared constants</description>
        <details>
          Replace hardcoded values in apps/web/src/lib/payroll-constants.ts
        </details>
        <code_example>
// apps/web/src/lib/payroll-constants.ts (updated)
import { UIF_CONSTANTS, SDL_CONSTANTS, TAX_YEAR_CONSTANTS } from '@crechebooks/types';

// Re-export for backward compatibility if needed
export const UIF_CAP = UIF_CONSTANTS.CAP_MONTHLY;
export const UIF_RATE = UIF_CONSTANTS.RATE_EMPLOYEE;

// Or update all consumers to import directly from @crechebooks/types
        </code_example>
      </step>

      <step order="4">
        <description>Update backend services to use shared constants</description>
        <details>
          Import constants in API services that need UIF calculations
        </details>
        <code_example>
// apps/api/src/sars/emp201.service.ts (updated)
import { UIF_CONSTANTS } from '@crechebooks/types';

calculateUifContribution(grossRemuneration: number): number {
  const contribution = grossRemuneration * UIF_CONSTANTS.RATE_EMPLOYEE;
  return Math.min(contribution, UIF_CONSTANTS.CAP_MONTHLY);
}
        </code_example>
      </step>

      <step order="5">
        <description>Add documentation for constant updates</description>
        <details>
          Document the process for updating constants when SARS rates change
        </details>
      </step>
    </steps>

    <file_structure>
      <directory path="packages/types/src/constants/">
        <file>index.ts - Barrel exports</file>
        <file>payroll.constants.ts - UIF, SDL, tax year constants</file>
        <file>vat.constants.ts - VAT rates (future)</file>
        <file>paye.constants.ts - PAYE tax tables (future)</file>
      </directory>
    </file_structure>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should export UIF constants from shared package</name>
        <type>unit</type>
        <expected_result>UIF_CONSTANTS accessible from @crechebooks/types</expected_result>
      </test_case>
      <test_case>
        <name>Frontend should use shared UIF cap value</name>
        <type>integration</type>
        <expected_result>Frontend calculations use value from shared package</expected_result>
      </test_case>
      <test_case>
        <name>Backend should use shared UIF cap value</name>
        <type>integration</type>
        <expected_result>API calculations use value from shared package</expected_result>
      </test_case>
      <test_case>
        <name>Constants should be type-safe</name>
        <type>unit</type>
        <expected_result>TypeScript prevents modification of constant values</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Verify frontend imports constant from shared package</step>
      <step>Verify backend imports constant from shared package</step>
      <step>Change constant value and verify both apps reflect the change</step>
      <step>Run payroll calculation tests to ensure consistency</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criterion>Shared constants module created in packages/types</criterion>
    <criterion>UIF constants defined with proper documentation</criterion>
    <criterion>Frontend updated to import from shared package</criterion>
    <criterion>Backend updated to import from shared package</criterion>
    <criterion>No duplicate UIF cap values in codebase</criterion>
    <criterion>Constants are properly typed (as const)</criterion>
    <criterion>Documentation added for annual rate update process</criterion>
    <criterion>All existing tests pass</criterion>
    <criterion>Code review approved</criterion>
  </definition_of_done>
</task_specification>
