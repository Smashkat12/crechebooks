<task_spec id="TASK-E2E-005" version="1.0">

<metadata>
  <title>E2E Bug Fixes - Arrears Page Data Mismatch</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>158</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-PAY-010</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

The Arrears page shows inconsistent data between the summary cards and the table.

## Error Details
Summary cards show:
- Total Outstanding: R 3,333.33
- 90+ Days Overdue: R 3,333.33
- Accounts in Arrears: 1

But the table shows:
- "No arrears found"

Also multiple 500 errors in console when page loads.

## Root Cause
The summary data and table data appear to come from different API endpoints or use different filtering logic, causing a mismatch.

## Impact
- **Arrears page**: Confusing UX - shows arrears exist but table is empty
- **User experience**: Cannot see which parents have arrears

## Pages Affected
- /arrears

## Expected Behavior
1. Summary cards and table should show consistent data
2. If 1 account is in arrears, table should show that account
3. No 500 errors during page load

</context>

<input_context_files>
  <file purpose="page">apps/web/src/app/(dashboard)/arrears/page.tsx</file>
  <file purpose="hook">apps/web/src/hooks/use-arrears.ts</file>
  <file purpose="controller">apps/api/src/api/payment/payment.controller.ts</file>
  <file purpose="service">apps/api/src/database/services/arrears.service.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Investigate why summary and table data differ
    - Fix API endpoints to return consistent data
    - Fix any 500 errors during page load
    - Ensure table displays arrears accounts correctly
  </in_scope>
  <out_of_scope>
    - Changing arrears calculation logic
    - Adding new features to arrears page
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - Summary cards match table data
    - If "1 account in arrears", table shows 1 row
    - No 500 errors on page load
    - All arrears data displays correctly
  </constraints>

  <verification>
    - Navigate to /arrears
    - No console errors (500s)
    - If summary shows "1 account in arrears", table shows 1 row
    - Data is consistent between summary and table
  </verification>
</definition_of_done>

<investigation_steps>
1. Check browser Network tab for failed API calls
2. Compare arrears/summary endpoint vs arrears list endpoint
3. Verify filtering logic matches between endpoints
4. Check if tenant_id filtering is applied consistently
</investigation_steps>

<test_commands>
  <command>npm run dev</command>
  <command>Navigate to http://localhost:3000/arrears</command>
  <command>Check browser console for errors</command>
  <command>curl http://localhost:3001/api/v1/payments/arrears</command>
</test_commands>

</task_spec>
