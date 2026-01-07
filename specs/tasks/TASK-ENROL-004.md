<task_spec id="TASK-ENROL-004" version="1.0">

<metadata>
  <title>Year-End Processing Dashboard</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>176</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-ENROL-005</requirement_ref>
    <requirement_ref>REQ-ENROL-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-ENROL-003</task_ref>
    <task_ref>TASK-BILL-037</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
## Business Requirement
At year-end (November-December), administrators need a consolidated view to:
1. Review all active enrollments and identify students by category
2. Process graduations and withdrawals in bulk
3. Confirm continuing students for the next academic year
4. Send notifications to parents about year-end status

## Categories of Students at Year-End
1. **Continuing**: Under 6 years old, no withdrawal notice - Stays ACTIVE
2. **Graduating**: Turning 6 or older, moving to Grade R - Status → GRADUATED
3. **Withdrawing**: Parent has given withdrawal notice - Status → WITHDRAWN

## Current State
- TASK-ENROL-003 implemented bulk graduation feature
- No year-end dashboard exists
- No age-based graduation suggestions
- No parent notification system for year-end

## Project Context
- **Framework**: NestJS with Prisma ORM (API), Next.js 15 (Web)
- **Database**: PostgreSQL
- **Multi-tenant**: All operations scoped by tenantId
- **South African School Year**: January - December
</context>

<input_context_files>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="enrollment_controller">apps/api/src/api/billing/enrollment.controller.ts</file>
  <file purpose="enrollments_page">apps/web/src/app/(dashboard)/enrollments/page.tsx</file>
  <file purpose="bulk_actions_bar">apps/web/src/components/enrollments/BulkActionsBar.tsx</file>
  <file purpose="child_entity">apps/api/src/database/entities/child.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-ENROL-003 completed (bulk graduation works)</check>
  <check>TASK-BILL-037 completed (re-registration logic exists)</check>
  <check>Child entity has dateOfBirth field</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `getYearEndReview()` method to EnrollmentService
    - Add `GET /enrollments/year-end/review` API endpoint
    - Create YearEndReviewPage component
    - Show students grouped by category (continuing/graduating/withdrawing)
    - Calculate age as of January 1st next year
    - Flag students turning 6 as graduation candidates
    - Allow bulk confirmation of continuing status
    - Allow bulk graduation processing
    - Show account balance summary for each enrollment
  </in_scope>
  <out_of_scope>
    - Parent notification system (future task)
    - Automatic age-based graduation (manual confirmation required)
    - Staff year-end processing
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      interface YearEndStudent {
        enrollmentId: string;
        childId: string;
        childName: string;
        parentName: string;
        dateOfBirth: Date;
        ageOnJan1: number;
        category: 'continuing' | 'graduating' | 'withdrawing';
        graduationCandidate: boolean; // true if turning 6+
        currentStatus: string;
        accountBalance: number; // in cents
        feeTierName: string;
      }

      interface YearEndReviewResult {
        academicYear: number; // e.g., 2026
        reviewPeriod: { start: Date; end: Date };
        students: {
          continuing: YearEndStudent[];
          graduating: YearEndStudent[];
          withdrawing: YearEndStudent[];
        };
        summary: {
          totalActive: number;
          continuingCount: number;
          graduatingCount: number;
          withdrawingCount: number;
          graduationCandidates: number;
        };
      }

      async getYearEndReview(
        tenantId: string,
        academicYear: number,
      ): Promise&lt;YearEndReviewResult&gt;
    </signature>
    <signature file="apps/api/src/api/billing/enrollment.controller.ts">
      @Get('year-end/review')
      async getYearEndReview(
        @CurrentUser() user: IUser,
        @Query('year') year?: string,
      ): Promise&lt;{ success: boolean; data: YearEndReviewResult }&gt;
    </signature>
  </signatures>

  <constraints>
    - Age calculation: As of January 1st of next academic year
    - Graduation candidate: Child turning 6 or older
    - Only show students with ACTIVE status
    - Account balance from parent's outstanding invoices
    - Must be accessible Nov 1 - Jan 31 (year-end period)
  </constraints>

  <verification>
    - TypeScript compiles without errors: npm run build
    - API returns correct student categorization
    - UI shows grouped student list
    - Age calculation is accurate
    - Graduation candidates are flagged correctly
    - Bulk actions work from year-end view
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Logic Layer

1. Add `YearEndStudent` and `YearEndReviewResult` interfaces to enrollment DTOs
2. Add `getYearEndReview()` method to EnrollmentService:
   - Query all ACTIVE enrollments with child and parent relations
   - Calculate age as of January 1st next year
   - Categorize students (all start as 'continuing')
   - Flag graduation candidates (age >= 6)
   - Get account balance from parent's outstanding invoices
   - Return grouped results

## Phase 2: API Layer

3. Add `GET /enrollments/year-end/review` endpoint:
   - Default year: Current year if before July, next year if after
   - Return structured review data

## Phase 3: UI Layer

4. Create `apps/web/src/app/(dashboard)/enrollments/year-end/page.tsx`:
   - Tabs for Continuing / Graduating / Withdrawing
   - Student cards with age, fee tier, balance
   - Graduation candidate badges
   - Bulk select and action buttons
   - Link to existing bulk graduation dialog

5. Add navigation link from enrollments page

## Phase 4: Verification

6. Build and verify:
   ```bash
   npm run build
   npm run lint
   ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/src/database/services/enrollment.service.ts">Add getYearEndReview() method</file>
  <file path="apps/api/src/api/billing/enrollment.controller.ts">Add GET /enrollments/year-end/review endpoint</file>
  <file path="apps/web/src/lib/api/enrollments.ts">Add getYearEndReview() API function</file>
  <file path="apps/web/src/hooks/use-enrollments.ts">Add useYearEndReview() hook</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/dto/year-end-review.dto.ts">Year-end review DTOs</file>
  <file path="apps/web/src/app/(dashboard)/enrollments/year-end/page.tsx">Year-end review page</file>
  <file path="apps/web/src/components/enrollments/YearEndStudentCard.tsx">Student card component</file>
</files_to_create>

<validation_criteria>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>API returns students grouped by category</criterion>
  <criterion>Age calculation accurate as of Jan 1 next year</criterion>
  <criterion>Graduation candidates correctly identified</criterion>
  <criterion>UI displays all three categories</criterion>
  <criterion>Bulk graduation works from year-end view</criterion>
  <criterion>Account balance displayed for each student</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- enrollment</command>
</test_commands>

</task_spec>
