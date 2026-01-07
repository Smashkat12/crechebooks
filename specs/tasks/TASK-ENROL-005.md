<task_spec id="TASK-ENROL-005" version="1.0">

<metadata>
  <title>Off-Boarding Workflow (Graduation & Withdrawal)</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>177</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-ENROL-006</requirement_ref>
    <requirement_ref>REQ-ENROL-005</requirement_ref>
    <requirement_ref>REQ-BILL-013</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-ENROL-003</task_ref>
    <task_ref>TASK-BILL-036</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
## Business Requirement
When a child leaves the creche (graduation or withdrawal), a comprehensive off-boarding process must occur:
1. **Account Settlement**: Calculate outstanding balance or credit
2. **Pro-Rata Credit**: Calculate credit for unused days in current billing period
3. **Final Statement**: Generate comprehensive statement for parent
4. **Status Update**: Change enrollment status to GRADUATED or WITHDRAWN
5. **Audit Trail**: Log all off-boarding actions

## Off-Boarding Triggers
1. **Graduation**: Child is moving to primary school (Grade R/1)
2. **Withdrawal**: Parent chooses to remove child before school age

## Credit Handling Options
- Apply to outstanding invoices
- Apply to sibling's account (if sibling enrolled)
- Refund to parent
- Donate to school

## Current State
- TASK-ENROL-003 implemented basic graduation status change
- TASK-BILL-036 implemented pro-rata calculation
- No account settlement process exists
- No final statement generation
- No credit handling workflow

## Project Context
- **Framework**: NestJS with Prisma ORM
- **Database**: PostgreSQL
- **Multi-tenant**: All operations scoped by tenantId
- **Financial**: All amounts in cents (integers)
</context>

<input_context_files>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="invoice_service">apps/api/src/database/services/invoice.service.ts</file>
  <file purpose="pro_rata_service">apps/api/src/database/services/pro-rata.service.ts</file>
  <file purpose="credit_balance_service">apps/api/src/database/services/credit-balance.service.ts</file>
  <file purpose="statement_service">apps/api/src/database/services/statement.service.ts</file>
  <file purpose="audit_log_service">apps/api/src/database/services/audit-log.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-ENROL-003 completed (graduation status change works)</check>
  <check>TASK-BILL-036 completed (pro-rata calculation works)</check>
  <check>CreditBalanceService available</check>
  <check>StatementService available</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `OffboardingService` class
    - Add `initiateOffboarding()` method
    - Add `calculateAccountSettlement()` method
    - Add `generateFinalStatement()` method
    - Add `processRefund()` method
    - Add `POST /enrollments/:id/offboard` API endpoint
    - Create off-boarding dialog UI
    - Show account settlement preview before confirmation
    - Handle credit options (apply/refund/donate)
  </in_scope>
  <out_of_scope>
    - Actual bank refund processing (manual)
    - Progress reports / certificates (future task)
    - Parent notification emails (future task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/offboarding.service.ts">
      interface AccountSettlement {
        parentId: string;
        parentName: string;
        childId: string;
        childName: string;
        outstandingBalance: number; // cents, positive = owes, negative = credit
        proRataCredit: number; // cents, credit for unused days
        netAmount: number; // cents, positive = owes, negative = owed to parent
        invoices: {
          id: string;
          invoiceNumber: string;
          totalCents: number;
          paidCents: number;
          status: string;
        }[];
      }

      interface OffboardingResult {
        enrollmentId: string;
        status: 'GRADUATED' | 'WITHDRAWN';
        endDate: Date;
        settlement: AccountSettlement;
        creditAction: 'applied' | 'refunded' | 'donated' | 'sibling' | 'none';
        creditAmount: number;
        finalStatementId: string;
      }

      async calculateAccountSettlement(
        tenantId: string,
        enrollmentId: string,
        endDate: Date,
      ): Promise&lt;AccountSettlement&gt;

      async initiateOffboarding(
        tenantId: string,
        enrollmentId: string,
        endDate: Date,
        reason: 'GRADUATION' | 'WITHDRAWAL',
        creditAction: 'apply' | 'refund' | 'donate' | 'sibling' | 'none',
        siblingEnrollmentId?: string,
        userId: string,
      ): Promise&lt;OffboardingResult&gt;
    </signature>
    <signature file="apps/api/src/api/billing/enrollment.controller.ts">
      @Post(':id/offboard')
      async offboardEnrollment(
        @CurrentUser() user: IUser,
        @Param('id') enrollmentId: string,
        @Body() body: {
          end_date: string;
          reason: 'GRADUATION' | 'WITHDRAWAL';
          credit_action: 'apply' | 'refund' | 'donate' | 'sibling' | 'none';
          sibling_enrollment_id?: string;
        },
      ): Promise&lt;{ success: boolean; data: OffboardingResult }&gt;
    </signature>
  </signatures>

  <constraints>
    - Must calculate pro-rata credit for unused days
    - Must generate final statement before completing off-boarding
    - Credit action must be specified (cannot be null)
    - If credit_action is 'sibling', sibling_enrollment_id required
    - Audit log must capture all settlement details
    - Cannot off-board if enrollment is not ACTIVE
    - End date must be >= start date
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Account settlement calculation accurate
    - Pro-rata credit calculated correctly
    - Final statement generated
    - Credit handling works for all options
    - Audit log captures off-boarding details
    - Enrollment status updated correctly
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Logic Layer

1. Create `apps/api/src/database/services/offboarding.service.ts`:
   - Inject EnrollmentService, InvoiceService, ProRataService, CreditBalanceService
   - Implement `calculateAccountSettlement()`
   - Implement `initiateOffboarding()`
   - Implement `applyCredit()`, `processRefund()`, `transferToSibling()`

2. Create DTOs in `apps/api/src/database/dto/offboarding.dto.ts`:
   - AccountSettlement interface
   - OffboardingResult interface
   - InitiateOffboardingDto class

## Phase 2: API Layer

3. Add `POST /enrollments/:id/offboard` endpoint:
   - Validate enrollment exists and is ACTIVE
   - Call offboarding service
   - Return settlement and result

4. Add `GET /enrollments/:id/settlement-preview` endpoint:
   - Return account settlement calculation without processing

## Phase 3: UI Layer

5. Create `apps/web/src/components/enrollments/OffboardingDialog.tsx`:
   - End date picker
   - Reason selector (Graduation/Withdrawal)
   - Account settlement preview
   - Credit action selector
   - Sibling selector (if applicable)
   - Confirmation button

6. Update enrollment table to show off-board action button

## Phase 4: Verification

7. Build and verify:
   ```bash
   npm run build
   npm run lint
   npm run test -- offboarding
   ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/src/api/billing/enrollment.controller.ts">Add POST /enrollments/:id/offboard endpoint</file>
  <file path="apps/api/src/database/database.module.ts">Register OffboardingService</file>
  <file path="apps/web/src/lib/api/enrollments.ts">Add offboard API functions</file>
  <file path="apps/web/src/hooks/use-enrollments.ts">Add useOffboard hooks</file>
  <file path="apps/web/src/components/enrollments/EnrollmentTable.tsx">Add offboard action</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/offboarding.service.ts">Off-boarding service</file>
  <file path="apps/api/src/database/dto/offboarding.dto.ts">Off-boarding DTOs</file>
  <file path="apps/web/src/components/enrollments/OffboardingDialog.tsx">Off-boarding dialog</file>
  <file path="apps/api/tests/database/services/offboarding.service.spec.ts">Off-boarding tests</file>
</files_to_create>

<validation_criteria>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>Account settlement calculates outstanding balance correctly</criterion>
  <criterion>Pro-rata credit calculated for unused days</criterion>
  <criterion>Final statement generated with all details</criterion>
  <criterion>Credit applied to outstanding invoices</criterion>
  <criterion>Credit transferred to sibling when selected</criterion>
  <criterion>Enrollment status updated to GRADUATED or WITHDRAWN</criterion>
  <criterion>Audit log captures all off-boarding actions</criterion>
  <criterion>UI shows settlement preview before confirmation</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- offboarding</command>
</test_commands>

<test_scenarios>
## Scenario 1: Graduation with Outstanding Balance
- Child has R500 unpaid on invoice
- Graduation date: Dec 15
- Current invoice period: Dec 1-31
- EXPECTED:
  - Pro-rata credit for Dec 16-31 (approx R900 if R1800/month)
  - Net: R400 credit (R900 - R500)
  - Credit applied to parent's account or refunded

## Scenario 2: Withdrawal with Credit Balance
- Parent already has R200 credit
- Withdrawal date: Nov 20
- EXPECTED:
  - Pro-rata credit for Nov 21-30
  - Total credit = existing + pro-rata
  - Final statement shows all credits

## Scenario 3: Transfer to Sibling
- Child graduating has R500 credit
- Sibling is still enrolled
- Credit action: Transfer to sibling
- EXPECTED:
  - Credit transferred to sibling's parent account
  - Audit log shows transfer

## Scenario 4: Graduation - No Outstanding Balance
- Parent is fully paid up
- No pro-rata (graduation at month end)
- EXPECTED:
  - Net amount: R0
  - Status updated to GRADUATED
  - Final statement generated
</test_scenarios>

</task_spec>
