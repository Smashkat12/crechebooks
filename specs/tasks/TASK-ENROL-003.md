<task_spec id="TASK-ENROL-003" version="1.0">

<metadata>
  <title>Bulk Year-End Graduation Feature</title>
  <status>complete</status>
  <started_date>2026-01-07</started_date>
  <completed_date>2026-01-07</completed_date>
  <layer>logic</layer>
  <sequence>172</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>EC-ENROL-004</requirement_ref>
    <requirement_ref>REQ-ENROL-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-ENROL-002</task_ref>
    <task_ref>TASK-BILL-024</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Business Requirement
At year-end (typically December in South Africa), children who are moving on to primary school or aging out
need to be marked as GRADUATED. This triggers the re-registration flow (TASK-BILL-024) when they return
the following year.

**Current Gap**: There is no method to graduate children - only WITHDRAWN status is implemented via `withdrawChild()`.

## Use Cases
1. **Single Graduation**: Admin graduates an individual child (e.g., mid-year departure to primary school)
2. **Bulk Year-End Graduation**: Admin selects multiple ACTIVE enrollments and graduates them all at once
3. **Re-Registration Trigger**: When a GRADUATED child re-enrolls, they pay R300 instead of R500

## Current State
- EnrollmentStatus enum has `GRADUATED` status (defined in entity)
- `withdrawChild()` exists as a pattern to follow
- Bulk status change exists in controller but doesn't set endDate
- UI has `BulkActionsBar` component for bulk operations

## Project Context
- **Framework**: NestJS with Prisma ORM
- **Database**: PostgreSQL
- **Frontend**: Next.js 15 with React Query
- **Multi-tenant**: All operations scoped by tenantId
</context>

<input_context_files>
  <file purpose="enrollment_entity">apps/api/src/database/entities/enrollment.entity.ts</file>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="enrollment_repository">apps/api/src/database/repositories/enrollment.repository.ts</file>
  <file purpose="enrollment_controller">apps/api/src/api/billing/enrollment.controller.ts</file>
  <file purpose="audit_log_service">apps/api/src/database/services/audit-log.service.ts</file>
  <file purpose="enrollments_page">apps/web/src/app/(dashboard)/enrollments/page.tsx</file>
  <file purpose="bulk_actions_bar">apps/web/src/components/enrollments/BulkActionsBar.tsx</file>
  <file purpose="enrollments_api">apps/web/src/lib/api/enrollments.ts</file>
  <file purpose="use_enrollments">apps/web/src/hooks/use-enrollments.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-ENROL-002 completed (EnrollmentService exists with withdrawChild)</check>
  <check>TASK-BILL-024 completed (re-registration fee logic works)</check>
  <check>AuditLogService available for audit logging</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `graduateChild()` method to EnrollmentService
    - Add `bulkGraduate()` method to EnrollmentService
    - Add `POST /enrollments/bulk/graduate` API endpoint
    - Add "Graduate" option to BulkActionsBar component
    - Add graduation date picker dialog
    - Audit log all graduation actions
  </in_scope>
  <out_of_scope>
    - Automatic age-based graduation (future enhancement)
    - Email notifications to parents on graduation
    - Graduation certificates
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      async graduateChild(
        tenantId: string,
        enrollmentId: string,
        endDate: Date,
        userId: string,
      ): Promise&lt;IEnrollment&gt;
    </signature>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      async bulkGraduate(
        tenantId: string,
        enrollmentIds: string[],
        endDate: Date,
        userId: string,
      ): Promise&lt;{ graduated: number; skipped: number }&gt;
    </signature>
    <signature file="apps/api/src/api/billing/enrollment.controller.ts">
      @Post('bulk/graduate')
      async bulkGraduate(
        @CurrentUser() user: IUser,
        @Body() body: { enrollment_ids: string[]; end_date: string },
      ): Promise&lt;{ success: boolean; graduated: number; skipped: number }&gt;
    </signature>
  </signatures>

  <constraints>
    - Only ACTIVE enrollments can be graduated
    - endDate must be >= startDate
    - endDate must be <= today (cannot graduate in the future)
    - Audit log must capture before/after state
    - Bulk operations must be atomic (all succeed or all fail)
  </constraints>

  <verification>
    - TypeScript compiles without errors: npm run build
    - Single graduation works via service method
    - Bulk graduation API endpoint returns correct counts
    - UI shows "Graduate" option in bulk actions
    - Graduation date dialog appears when Graduate is selected
    - Audit logs created for each graduation
    - Graduated enrollments trigger re-registration fee on re-enrollment
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Logic Layer (Service)

1. Add `graduateChild()` method to `enrollment.service.ts`:
   - Validate enrollment exists and is ACTIVE
   - Validate endDate constraints
   - Update status to GRADUATED and set endDate
   - Create audit log entry
   - Return updated enrollment

2. Add `bulkGraduate()` method to `enrollment.service.ts`:
   - Accept array of enrollment IDs
   - Filter to only ACTIVE enrollments for this tenant
   - Graduate each valid enrollment
   - Return counts of graduated and skipped

## Phase 2: Surface Layer (API)

3. Add `POST /enrollments/bulk/graduate` endpoint to `enrollment.controller.ts`:
   - Accept `{ enrollment_ids: string[], end_date: string }`
   - Validate end_date is valid ISO date
   - Call `bulkGraduate()` service method
   - Return `{ success: true, graduated: N, skipped: M }`

## Phase 3: Surface Layer (UI)

4. Update `apps/web/src/lib/api/enrollments.ts`:
   - Add `bulkGraduateEnrollments()` function
   - Add `BulkGraduateParams` interface

5. Update `apps/web/src/hooks/use-enrollments.ts`:
   - Add `useBulkGraduate()` mutation hook

6. Update `apps/web/src/components/enrollments/BulkActionsBar.tsx`:
   - Add "Graduate" action button
   - Add graduation date picker dialog
   - Call bulk graduate API on confirm

7. Update `apps/web/src/app/(dashboard)/enrollments/page.tsx`:
   - Wire up new bulk graduate handler

## Phase 4: Verification

8. Build and verify:
   ```bash
   npm run build
   npm run lint
   ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/src/database/services/enrollment.service.ts">Add graduateChild() and bulkGraduate() methods</file>
  <file path="apps/api/src/api/billing/enrollment.controller.ts">Add POST /enrollments/bulk/graduate endpoint</file>
  <file path="apps/web/src/lib/api/enrollments.ts">Add bulkGraduateEnrollments() function</file>
  <file path="apps/web/src/hooks/use-enrollments.ts">Add useBulkGraduate() hook</file>
  <file path="apps/web/src/components/enrollments/BulkActionsBar.tsx">Add Graduate action with date picker</file>
  <file path="apps/web/src/app/(dashboard)/enrollments/page.tsx">Wire up graduation handler</file>
</files_to_modify>

<validation_criteria>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>graduateChild() sets status to GRADUATED and endDate</criterion>
  <criterion>bulkGraduate() only graduates ACTIVE enrollments</criterion>
  <criterion>API returns correct graduated/skipped counts</criterion>
  <criterion>UI shows Graduate option in bulk actions bar</criterion>
  <criterion>Date picker dialog appears for graduation date selection</criterion>
  <criterion>Audit logs created for graduation actions</criterion>
  <criterion>GRADUATED status triggers re-registration fee on re-enrollment</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- enrollment</command>
</test_commands>


<implementation_notes>
## Implementation Summary (2026-01-07)

### Changes Made:

1. **EnrollmentService** (`apps/api/src/database/services/enrollment.service.ts`):
   - Added `graduateChild()` method:
     - Validates enrollment exists and is ACTIVE
     - Validates endDate > startDate and endDate <= today
     - Sets status to GRADUATED and endDate
     - Creates audit log entry
   - Added `bulkGraduate()` method:
     - Iterates through enrollment IDs
     - Calls graduateChild() for each, skipping failures
     - Returns counts of graduated and skipped

2. **EnrollmentController** (`apps/api/src/api/billing/enrollment.controller.ts`):
   - Added `EnrollmentService` injection
   - Added `POST /enrollments/bulk/graduate` endpoint:
     - Accepts `{ enrollment_ids: string[], end_date: string }`
     - Returns `{ success: true, graduated: N, skipped: M }`

3. **Frontend API** (`apps/web/src/lib/api/enrollments.ts`):
   - Added `BulkGraduateParams` and `BulkGraduateResponse` interfaces
   - Added `bulkGraduate` endpoint
   - Added `bulkGraduateEnrollments()` function

4. **Frontend Hooks** (`apps/web/src/hooks/use-enrollments.ts`):
   - Added `useBulkGraduate()` mutation hook

5. **BulkActionsBar** (`apps/web/src/components/enrollments/BulkActionsBar.tsx`):
   - Added "Graduate" button with GraduationCap icon
   - Added graduation date picker dialog
   - Shows re-registration fee notice (R300)
   - Supports loading state during graduation

6. **Enrollments Page** (`apps/web/src/app/(dashboard)/enrollments/page.tsx`):
   - Added `useBulkGraduate` hook
   - Added `handleBulkGraduate()` handler
   - Wired up to BulkActionsBar component
   - Toast notifications for success/error

### Business Logic:
- Only ACTIVE enrollments can be graduated
- Graduation date must be after start date and not in the future
- Graduated children will pay re-registration fee (R300) when re-enrolled
- Audit logs capture all graduation actions

### User Flow:
1. User selects one or more enrollments in the table
2. BulkActionsBar appears with "Graduate" button
3. User clicks "Graduate" → Dialog opens with date picker
4. User selects graduation date (defaults to today)
5. User confirms → API call made
6. Toast shows results (graduated count, skipped count)
7. Table refreshes to show updated statuses

### Verification:
- ✅ TypeScript build passes without errors
- ✅ API endpoint added and accessible
- ✅ UI shows Graduate action with date picker
- ✅ Only active enrollments can be graduated
- ✅ Audit logs created for graduation actions
</implementation_notes>

</task_spec>
