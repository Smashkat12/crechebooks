<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-BILL-001</task_id>
    <title>Fix Frontend VAT Calculation Mismatch</title>
    <priority>CRITICAL</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>billing</category>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>vat</tag>
      <tag>frontend</tag>
      <tag>calculation</tag>
      <tag>critical-bug</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      Frontend displays VAT on items that should be exempt, causing mismatch
      between what users see and what the backend calculates. This leads to
      customer confusion, incorrect invoice previews, and potential compliance issues.
    </problem_statement>

    <business_impact>
      - Customers see incorrect totals before invoice generation
      - Trust issues when preview differs from final invoice
      - Potential VAT compliance violations
      - Support ticket volume increase
    </business_impact>

    <root_cause>
      Frontend VAT calculation logic does not check exemption flags from the
      backend. The frontend applies default VAT rate uniformly without
      considering item-level or organization-level VAT exemptions.
    </root_cause>

    <affected_users>
      - All users previewing invoices with VAT-exempt items
      - Organizations with partial or full VAT exemption status
    </affected_users>
  </context>

  <scope>
    <in_scope>
      <item>Frontend VAT calculation utilities in vat.ts</item>
      <item>Billing components that display VAT amounts</item>
      <item>Invoice preview components</item>
      <item>Line item display components</item>
      <item>Synchronization with backend VAT rules</item>
    </in_scope>

    <out_of_scope>
      <item>Backend VAT calculation logic (already correct)</item>
      <item>Database schema changes</item>
      <item>VAT rate configuration</item>
      <item>Historical invoice correction</item>
    </out_of_scope>

    <affected_files>
      <file>apps/web/src/components/billing/InvoicePreview.tsx</file>
      <file>apps/web/src/components/billing/LineItemTable.tsx</file>
      <file>apps/web/src/components/billing/BillingSummary.tsx</file>
      <file>apps/web/src/components/billing/VATBreakdown.tsx</file>
      <file>apps/web/src/lib/vat.ts</file>
      <file>apps/web/src/lib/billing-utils.ts</file>
    </affected_files>

    <dependencies>
      <dependency type="api">Backend VAT calculation endpoint responses</dependency>
      <dependency type="data">Item and organization exemption flags</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Refactor frontend VAT calculation to respect exemption flags from backend
      API responses. Implement shared VAT calculation utility that mirrors
      backend logic.
    </approach>

    <steps>
      <step order="1">
        <description>Audit current frontend VAT calculation in vat.ts</description>
        <details>
          - Identify all VAT calculation functions
          - Document current behavior and missing exemption checks
          - Map all components consuming VAT calculations
        </details>
      </step>

      <step order="2">
        <description>Update vat.ts to accept and use exemption flags</description>
        <details>
          - Add exemption flag parameters to calculation functions
          - Implement item-level exemption check
          - Implement organization-level exemption check
          - Add fallback to backend calculation when flags unavailable
        </details>
        <code_snippet>
```typescript
// apps/web/src/lib/vat.ts
interface VATCalculationInput {
  amount: number;
  vatRate: number;
  isExempt?: boolean;
  exemptionReason?: string;
  organizationVatStatus?: 'standard' | 'exempt' | 'reverse_charge';
}

export function calculateVAT(input: VATCalculationInput): number {
  const { amount, vatRate, isExempt, organizationVatStatus } = input;

  // Check item-level exemption
  if (isExempt) {
    return 0;
  }

  // Check organization-level exemption
  if (organizationVatStatus === 'exempt' || organizationVatStatus === 'reverse_charge') {
    return 0;
  }

  return amount * (vatRate / 100);
}

export function calculateLineItemVAT(
  lineItem: LineItem,
  organization: Organization
): number {
  return calculateVAT({
    amount: lineItem.amount,
    vatRate: lineItem.vatRate ?? organization.defaultVatRate,
    isExempt: lineItem.isVatExempt,
    exemptionReason: lineItem.vatExemptionReason,
    organizationVatStatus: organization.vatStatus,
  });
}
```
        </code_snippet>
      </step>

      <step order="3">
        <description>Update billing components to pass exemption data</description>
        <details>
          - Modify InvoicePreview to use updated VAT functions
          - Update LineItemTable to display correct VAT per line
          - Fix BillingSummary to aggregate VAT correctly
          - Update VATBreakdown to show exemption details
        </details>
      </step>

      <step order="4">
        <description>Add exemption indicator UI elements</description>
        <details>
          - Show "VAT Exempt" badge on exempt line items
          - Display exemption reason tooltip
          - Add organization VAT status indicator
        </details>
      </step>

      <step order="5">
        <description>Implement validation against backend calculation</description>
        <details>
          - Add dev-mode comparison between frontend and backend totals
          - Log discrepancies for debugging
          - Add frontend calculation confidence indicator
        </details>
      </step>
    </steps>

    <technical_notes>
      - Ensure VAT calculation is deterministic and matches backend exactly
      - Handle edge cases: partial exemptions, mixed baskets, rounding
      - Consider caching organization VAT status for performance
      - Use TypeScript strict null checks for exemption flags
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>VAT-exempt item shows zero VAT</description>
        <preconditions>Line item with isVatExempt=true</preconditions>
        <expected_result>VAT amount displayed as 0.00</expected_result>
      </test_case>

      <test_case id="TC-002">
        <description>Exempt organization shows zero VAT on all items</description>
        <preconditions>Organization with vatStatus='exempt'</preconditions>
        <expected_result>All line items show zero VAT</expected_result>
      </test_case>

      <test_case id="TC-003">
        <description>Mixed basket calculates correctly</description>
        <preconditions>Invoice with both exempt and non-exempt items</preconditions>
        <expected_result>VAT only on non-exempt items, total matches backend</expected_result>
      </test_case>

      <test_case id="TC-004">
        <description>Frontend total matches backend total</description>
        <preconditions>Any valid invoice configuration</preconditions>
        <expected_result>Frontend calculated total equals API response total</expected_result>
      </test_case>

      <test_case id="TC-005">
        <description>Reverse charge organization shows correct VAT treatment</description>
        <preconditions>Organization with vatStatus='reverse_charge'</preconditions>
        <expected_result>VAT shown as 0 with reverse charge indicator</expected_result>
      </test_case>
    </test_cases>

    <manual_testing>
      <step>Create invoice with VAT-exempt item, verify preview shows 0 VAT</step>
      <step>Switch organization to exempt status, verify all VAT becomes 0</step>
      <step>Compare preview totals with final generated invoice</step>
      <step>Test rounding scenarios with multiple line items</step>
    </manual_testing>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Frontend VAT calculation respects item-level exemption flags</criterion>
      <criterion>Frontend VAT calculation respects organization-level VAT status</criterion>
      <criterion>Invoice preview totals match backend-generated invoice totals</criterion>
      <criterion>VAT exemption is visually indicated on exempt items</criterion>
      <criterion>All existing billing component tests pass</criterion>
      <criterion>New unit tests cover exemption scenarios</criterion>
      <criterion>No regression in standard VAT calculation</criterion>
      <criterion>Code reviewed and approved</criterion>
      <criterion>QA sign-off on billing preview accuracy</criterion>
    </criteria>

    <acceptance_checklist>
      <item checked="false">vat.ts updated with exemption-aware functions</item>
      <item checked="false">All billing components using updated functions</item>
      <item checked="false">Unit tests for all exemption scenarios</item>
      <item checked="false">Integration test comparing frontend/backend totals</item>
      <item checked="false">UI shows exemption indicators</item>
      <item checked="false">No console errors or warnings</item>
      <item checked="false">Performance not degraded</item>
    </acceptance_checklist>
  </definition_of_done>

  <references>
    <reference type="issue">GitHub Issue #XXX - VAT Mismatch Reports</reference>
    <reference type="documentation">Backend VAT calculation spec</reference>
    <reference type="code">apps/api/src/billing/vat.service.ts - Reference implementation</reference>
  </references>
</task_specification>
