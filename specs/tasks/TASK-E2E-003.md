<task_spec id="TASK-E2E-003" version="1.0">

<metadata>
  <title>E2E Bug Fixes - SA ID Validation Too Strict</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>156</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-VALID-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

The SA ID validation on the Staff form is too strict. Even the placeholder value (8501015800083) fails validation with "Invalid SA ID number" error.

## Error Details
When submitting the Add Staff form:
- Entered SA ID: 8501015800083 (the placeholder value shown)
- Error displayed: "Invalid SA ID number"
- Form won't submit

## Root Cause
The Luhn checksum validation for SA ID numbers may have an error, or the placeholder ID doesn't have a valid checksum.

## SA ID Format Reference
- 13 digits total
- YYMMDD (6 digits) - Date of birth
- SSSS (4 digits) - Gender/sequence (0000-4999 female, 5000-9999 male)
- C (1 digit) - Citizenship (0=SA, 1=permanent resident)
- A (1 digit) - Usually 8
- Z (1 digit) - Luhn checksum

## Impact
- **Staff creation**: Cannot add staff members
- **User experience**: Confusing since placeholder appears invalid

## Pages Affected
- /staff/new (Add Staff form)
- /staff/[id]/edit (Edit Staff form)

</context>

<input_context_files>
  <file purpose="form">apps/web/src/app/(dashboard)/staff/new/page.tsx</file>
  <file purpose="hook">apps/web/src/hooks/use-staff.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Review SA ID validation logic
    - Fix Luhn checksum calculation if incorrect
    - Update placeholder to a valid SA ID
    - Add clear validation error messages
  </in_scope>
  <out_of_scope>
    - Adding new validation rules
    - Backend validation changes
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - Valid SA ID numbers pass validation
    - Placeholder shows a valid example ID
    - Clear error messages for invalid IDs
  </constraints>

  <verification>
    - Navigate to /staff/new
    - Enter the placeholder SA ID value
    - Form should NOT show validation error
    - Submit form with valid data - should succeed
  </verification>
</definition_of_done>

<pseudo_code>
// Luhn checksum for SA ID validation
function validateSaId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;

  // Extract date and validate
  const year = parseInt(id.substring(0, 2));
  const month = parseInt(id.substring(2, 4));
  const day = parseInt(id.substring(4, 6));

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Luhn checksum validation
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

// Valid test SA IDs:
// 8501015800086 (male, SA citizen, born 1985-01-01)
// 9001015800085 (male, SA citizen, born 1990-01-01)
</pseudo_code>

<test_commands>
  <command>npm run dev</command>
  <command>Navigate to http://localhost:3000/staff/new and test SA ID validation</command>
</test_commands>

</task_spec>
