<task_spec id="TASK-E2E-008" version="1.0">

<metadata>
  <title>E2E Bug - Staff Creation Fails with 400 Bad Request</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>161</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>SARS-STAFF-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - API bug fix -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Bug Identified During E2E Testing
Date: 2026-01-06

During comprehensive Playwright E2E testing, creating a new staff member fails with a 400 Bad Request error.

## Error Details
```
Console Error: AxiosError - Request failed with status code 400
Location: apps/web/src/hooks/use-staff.ts:186
API Endpoint: POST /api/v1/staff
```

## Steps to Reproduce
1. Navigate to /staff/new
2. Fill in all required fields:
   - Employee Number: EMP003
   - First Name: Jane
   - Last Name: Doe
   - SA ID Number: 8501015800088 (valid format)
   - Date of Birth: 1985-01-01 (matching SA ID)
   - Start Date: 2026-01-06
   - Monthly Gross Salary: R 25,000.00
   - Payment Method: EFT
   - Employment Status: Active
3. Click "Add Staff"
4. Error: 400 Bad Request

## Root Cause Analysis Required
The API is rejecting the request. Possible causes:
1. DTO validation failing on server side
2. Missing required field in request body
3. Date format mismatch between frontend and backend
4. SA ID validation mismatch between frontend and backend

## Impact
- **Staff Management**: Cannot add new staff members
- **Payroll**: Cannot run payroll for new employees
- **SARS Compliance**: Cannot generate EMP201 for new staff

## Pages Affected
- /staff/new (Add Staff form)
- Staff management functionality

</context>

<input_context_files>
  <file purpose="hook">apps/web/src/hooks/use-staff.ts</file>
  <file purpose="controller">apps/api/src/api/staff/staff.controller.ts</file>
  <file purpose="dto">apps/api/src/api/staff/dto/</file>
  <file purpose="service">apps/api/src/database/services/staff.service.ts</file>
</input_context_files>

<prerequisites>
  <check>API server running</check>
  <check>Database accessible</check>
</prerequisites>

<scope>
  <in_scope>
    - Debug the 400 error cause
    - Fix the validation/mapping issue
    - Ensure staff creation works end-to-end
  </in_scope>
  <out_of_scope>
    - Refactoring staff module
    - Adding new staff features
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - Staff creation API returns 201 Created
    - New staff appears in staff list
    - All required fields are properly validated
    - SA ID and DOB validation works correctly
  </constraints>

  <verification>
    - Navigate to /staff/new
    - Fill in all required fields with valid data
    - Submit the form
    - Verify success message appears
    - Verify new staff appears in /staff list
  </verification>
</definition_of_done>

<debug_steps>
1. Check API logs for detailed 400 error message
2. Compare frontend request payload with API DTO expectations
3. Check date format (ISO 8601 vs other formats)
4. Verify all required fields are included in request
5. Check SA ID validation logic on both frontend and backend
6. Fix the identified issue
7. Test the complete flow
</debug_steps>

<test_commands>
  <command>Check API logs: tail -f apps/api/logs/*.log</command>
  <command>Test API directly: curl -X POST http://localhost:3001/api/v1/staff -H "Content-Type: application/json" -d '{"employee_number": "EMP003", ...}'</command>
</test_commands>

</task_spec>
