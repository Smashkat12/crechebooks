<task_spec id="TASK-E2E-004" version="1.0">

<metadata>
  <title>E2E Bug Fixes - VAT201 Duplicate Submission Error</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>157</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>EC-SARS-011</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

The VAT201 page returns a 500 error when a submission already exists for the current period.

## Error Details
```
PrismaClientKnownRequestError: Unique constraint failed on the fields: (`tenant_id`, `submission_type`, `period_start`)
Location: apps/api/src/database/services/vat201.service.ts:132
```

## Root Cause
The `generateVat201()` method tries to create a new SarsSubmission record without checking if one already exists for the same tenant/type/period combination.

## Impact
- **VAT201 page**: 500 error when revisiting
- **User experience**: Cannot view or update existing VAT201 submissions

## Pages Affected
- /sars/vat201

## Expected Behavior
1. If submission exists for period: Return existing submission (or update it)
2. If no submission exists: Create new one
3. Never fail with duplicate error

</context>

<input_context_files>
  <file purpose="service">apps/api/src/database/services/vat201.service.ts</file>
  <file purpose="controller">apps/api/src/api/sars/sars.controller.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Add check for existing submission before creating new one
    - Use upsert pattern or findFirst + update/create logic
    - Return existing submission if found
  </in_scope>
  <out_of_scope>
    - Adding versioning to submissions
    - Changing the API contract
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - No duplicate key errors when generating VAT201
    - Existing submissions are returned/updated gracefully
    - First-time submissions still create correctly
  </constraints>

  <verification>
    - Navigate to /sars/vat201 - should load without error
    - Refresh the page - should still work
    - API returns valid VAT201 data
  </verification>
</definition_of_done>

<pseudo_code>
// In vat201.service.ts generateVat201():

async generateVat201(tenantId: string, periodStart: Date, periodEnd: Date) {
  // Check for existing submission first
  const existing = await this.prisma.sarsSubmission.findFirst({
    where: {
      tenantId,
      submissionType: 'VAT201',
      periodStart,
    },
  });

  if (existing) {
    // Return existing or update if needed
    return existing;
  }

  // ... rest of VAT201 calculation ...

  // Create new submission
  const submission = await this.prisma.sarsSubmission.create({
    data: {
      tenantId,
      submissionType: 'VAT201',
      periodStart,
      periodEnd,
      // ... other fields
    },
  });

  return submission;
}

// OR use upsert:
const submission = await this.prisma.sarsSubmission.upsert({
  where: {
    tenantId_submissionType_periodStart: {
      tenantId,
      submissionType: 'VAT201',
      periodStart,
    },
  },
  update: { /* update existing */ },
  create: { /* create new */ },
});
</pseudo_code>

<test_commands>
  <command>npm run dev:api</command>
  <command>curl -X POST http://localhost:3001/api/v1/sars/vat201</command>
  <command>Navigate to http://localhost:3000/sars/vat201</command>
</test_commands>

</task_spec>
