<task_spec id="TASK-E2E-006" version="1.0">

<metadata>
  <title>E2E Bug - Enrollment Success Modal Shows R 0.00</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>159</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>BILL-ENR-003</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - UI bug fix -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

During comprehensive Playwright E2E testing, when a child is enrolled successfully, the success modal displays "Total Amount: R 0.00" instead of the actual invoice amount.

## Error Details
```
Enrollment Success Modal:
- Shows: "Total Amount: R 0.00"
- Expected: "Total Amount: R 3,166.67" (pro-rated amount from invoice)
```

## Steps to Reproduce
1. Navigate to /parents/[id]
2. Click "Add Child"
3. Fill in child details and select fee structure
4. Submit the form
5. Success modal appears with incorrect total amount (R 0.00)

## Root Cause
The EnrollmentSuccessModal component is not receiving or displaying the invoice total amount correctly. The invoice is being created correctly (verified via /invoices page shows correct amount).

## Impact
- **User Experience**: Confusing for parents/staff when R 0.00 is displayed
- **Invoice accuracy**: Invoices are correct, only modal display is wrong

## Pages Affected
- Enrollment success modal on /parents/[id] page

</context>

<input_context_files>
  <file purpose="component">apps/web/src/components/enrollments/EnrollmentSuccessModal.tsx</file>
  <file purpose="hook">apps/web/src/hooks/use-enrollments.ts</file>
  <file purpose="api">apps/api/src/api/billing/child.controller.ts</file>
</input_context_files>

<prerequisites>
  <check>Enrollment flow working</check>
  <check>Invoice auto-generation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Fix the EnrollmentSuccessModal to display correct invoice amount
    - Ensure the API returns the invoice total in the enrollment response
    - Update the frontend to pass the correct amount to the modal
  </in_scope>
  <out_of_scope>
    - Refactoring enrollment logic
    - Adding new features
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - Success modal displays correct invoice amount
    - Amount matches the invoice shown in /invoices page
    - Pro-rated amounts display correctly
  </constraints>

  <verification>
    - Enroll a child on any day of the month
    - Verify success modal shows correct pro-rated amount
    - Verify amount matches invoice in /invoices page
  </verification>
</definition_of_done>

<fix_steps>
1. Check if API enrollment response includes invoice total
2. If not, update child.controller.ts to include invoice details in response
3. Update EnrollmentSuccessModal to receive and display the amount
4. Test with new enrollment
</fix_steps>

<test_commands>
  <command>Navigate to parent detail page and enroll a child</command>
  <command>Verify success modal shows correct amount</command>
</test_commands>

</task_spec>
