<task_spec id="TASK-BILL-032" version="3.0">

<metadata>
  <title>Invoice Generation Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>47</sequence>
  <implements>
    <requirement_ref>REQ-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-004</requirement_ref>
    <requirement_ref>REQ-BILL-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-031</task_ref>
    <task_ref>TASK-BILL-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<critical_context>
CRITICAL: You are an AI agent implementing this task. Read ALL sections before coding.

PROJECT STATE:
- NestJS 10.x backend with Prisma ORM
- PostgreSQL database with multi-tenant isolation via tenantId
- All monetary values stored as CENTS (integers), displayed as decimals
- Authentication via Auth0 JWT with @CurrentUser() decorator
- Role-based access via @Roles() decorator and RolesGuard
- All API responses use snake_case per REST conventions
- Tests must NOT use mock data - test real service interactions
- NO backwards compatibility - fail fast with robust error logging

PREREQUISITE: TASK-BILL-031 must be completed first (creates InvoiceController and BillingModule)
</critical_context>

<actual_file_paths>
CRITICAL: These are the REAL paths verified against git history. DO NOT use paths from older specs.

SERVICES (already exist):
- src/database/services/invoice-generation.service.ts (InvoiceGenerationService)
  - generateMonthlyInvoices(tenantId, billingMonth, userId, childIds?): Promise<InvoiceGenerationResult>
- src/database/services/enrollment.service.ts (EnrollmentService)
  - applySiblingDiscount(tenantId, parentId): Promise<Map<string, Decimal>>

REPOSITORIES (already exist):
- src/database/repositories/invoice.repository.ts (InvoiceRepository)
- src/database/repositories/enrollment.repository.ts (EnrollmentRepository)

ENTITIES (already exist):
- src/database/entities/invoice.entity.ts (IInvoice, InvoiceStatus)
- src/database/entities/user.entity.ts (IUser, UserRole - from @prisma/client)
  - UserRole values: OWNER, ADMIN, VIEWER, ACCOUNTANT

DTOs (already exist):
- src/database/dto/invoice-generation.dto.ts:
  - InvoiceGenerationResult { invoicesCreated, totalAmountCents, invoices[], errors[] }
  - GeneratedInvoiceInfo { id, invoiceNumber, childId, childName, parentId, totalCents, status, xeroInvoiceId }
  - InvoiceGenerationError { childId, enrollmentId?, error, code }

AUTH (already exists):
- src/api/auth/guards/jwt-auth.guard.ts (JwtAuthGuard)
- src/api/auth/guards/roles.guard.ts (RolesGuard)
- src/api/auth/decorators/current-user.decorator.ts (@CurrentUser)
- src/api/auth/decorators/roles.decorator.ts (@Roles)

CONTROLLER (from TASK-BILL-031):
- src/api/billing/invoice.controller.ts (add generate endpoint here)
- src/api/billing/billing.module.ts (add InvoiceGenerationService to providers)

MODULE PATTERN:
- src/api/transaction/transaction.module.ts (reference for module pattern)
</actual_file_paths>

<context>
This task adds POST /invoices/generate endpoint to the existing InvoiceController.
It triggers batch invoice creation for all enrolled children (or a filtered subset).

The InvoiceGenerationService already handles:
- Fee calculations from enrollment fee structures
- Sibling discounts via EnrollmentService.applySiblingDiscount()
- VAT calculations (15% for VAT-registered tenants)
- Duplicate prevention (checks if invoice exists for billing period)
- Xero sync (creates draft invoice in Xero)
- Sequential invoice numbering (INV-YYYY-NNN format)

This controller endpoint only needs to:
1. Validate request (billing_month format, not future month)
2. Call InvoiceGenerationService.generateMonthlyInvoices()
3. Transform result to API response format

BILLING MONTH FORMAT: YYYY-MM (e.g., "2025-01")
INVOICE NUMBER FORMAT: INV-YYYY-NNN (e.g., "INV-2025-001")
</context>

<scope>
  <in_scope>
    - Add POST /invoices/generate endpoint to InvoiceController
    - Create GenerateInvoicesDto with validation
    - Create GenerateInvoicesResponseDto
    - Add role restriction (OWNER, ADMIN only)
    - Validate billing_month format (YYYY-MM)
    - Validate billing_month is not in future
    - Return 201 Created with invoice list
    - Add Swagger/OpenAPI annotations
    - Create controller unit tests
  </in_scope>
  <out_of_scope>
    - Invoice generation logic (already in InvoiceGenerationService)
    - Fee calculations (already in service)
    - Sibling discounts (already in service)
    - Pro-rata calculations (already in service)
    - Xero sync (already in service)
    - Duplicate prevention (already in service via findByBillingPeriod)
  </out_of_scope>
</scope>

<files_to_create>
  <file path="src/api/billing/dto/generate-invoices.dto.ts">
    Generation request and response DTOs
  </file>
  <file path="tests/api/billing/generate-invoices.controller.spec.ts">
    Generation endpoint unit tests (minimum 8 tests)
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/billing/invoice.controller.ts">
    Add generateInvoices endpoint
  </file>
  <file path="src/api/billing/billing.module.ts">
    Add InvoiceGenerationService to providers
  </file>
  <file path="src/api/billing/dto/index.ts">
    Export new DTOs
  </file>
</files_to_modify>

<implementation_signatures>
// src/api/billing/dto/generate-invoices.dto.ts
import { IsString, IsOptional, IsArray, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';

export class GenerateInvoicesDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'billing_month must be in YYYY-MM format (e.g., 2025-01)',
  })
  @ApiProperty({
    example: '2025-01',
    description: 'Billing month in YYYY-MM format',
  })
  billing_month: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ApiProperty({
    type: [String],
    required: false,
    description: 'Specific child UUIDs to generate invoices for. If empty, generates for all active enrollments.',
  })
  child_ids?: string[];
}

export class GeneratedInvoiceSummaryDto {
  @ApiProperty({ description: 'Invoice UUID' })
  id: string;

  @ApiProperty({ example: 'INV-2025-001' })
  invoice_number: string;

  @ApiProperty({ description: 'Child UUID' })
  child_id: string;

  @ApiProperty({ example: 'Emma Smith' })
  child_name: string;

  @ApiProperty({ example: 3450.00, description: 'Total in Rands (not cents)' })
  total: number;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiProperty({ required: false, description: 'Xero invoice ID if synced' })
  xero_invoice_id?: string;
}

export class GenerationErrorDto {
  @ApiProperty({ description: 'Child UUID that failed' })
  child_id: string;

  @ApiProperty({ required: false })
  enrollment_id?: string;

  @ApiProperty({ example: 'Invoice already exists for billing period 2025-01' })
  error: string;

  @ApiProperty({ example: 'DUPLICATE_INVOICE' })
  code: string;
}

export class GenerateInvoicesResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: {
    invoices_created: number;
    total_amount: number;  // In Rands, not cents
    invoices: GeneratedInvoiceSummaryDto[];
    errors: GenerationErrorDto[];
  };
}

// Add to src/api/billing/invoice.controller.ts
import { UserRole } from '@prisma/client';  // CRITICAL: import from @prisma/client

@Post('generate')
@HttpCode(201)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({
  summary: 'Generate monthly invoices for enrolled children',
  description: 'Generates invoices for all active enrollments or specific children. Returns 201 with invoice list.',
})
@ApiResponse({ status: 201, type: GenerateInvoicesResponseDto })
@ApiResponse({ status: 400, description: 'Invalid billing_month format or future month' })
@ApiResponse({ status: 403, description: 'Insufficient permissions (requires OWNER or ADMIN)' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async generateInvoices(
  @Body() dto: GenerateInvoicesDto,
  @CurrentUser() user: IUser,
): Promise<GenerateInvoicesResponseDto>;
</implementation_signatures>

<pseudo_code>
InvoiceController.generateInvoices(dto, user):
  1. Extract tenantId from user JWT
  2. Validate billing_month format (already handled by DTO decorator)
  3. Validate billing_month is not in future:
     - Parse month: [year, month] = dto.billing_month.split('-').map(Number)
     - currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
     - requestedMonth = new Date(year, month - 1, 1)
     - if (requestedMonth > currentMonth) throw BadRequestException('Cannot generate invoices for future months')
  4. Call service:
     result = await invoiceGenerationService.generateMonthlyInvoices(
       tenantId,
       dto.billing_month,
       user.id,
       dto.child_ids
     )
  5. Transform result to response:
     return {
       success: true,
       data: {
         invoices_created: result.invoicesCreated,
         total_amount: result.totalAmountCents / 100,  // Convert cents to decimal
         invoices: result.invoices.map(inv => ({
           id: inv.id,
           invoice_number: inv.invoiceNumber,
           child_id: inv.childId,
           child_name: inv.childName,
           total: inv.totalCents / 100,  // Convert cents to decimal
           status: inv.status,
           xero_invoice_id: inv.xeroInvoiceId ?? undefined,
         })),
         errors: result.errors.map(err => ({
           child_id: err.childId,
           enrollment_id: err.enrollmentId,
           error: err.error,
           code: err.code,
         })),
       },
     }

CRITICAL CONVERSIONS:
  - result.totalAmountCents / 100 → total_amount (decimal)
  - inv.totalCents / 100 → total (decimal)
  - camelCase → snake_case for all response fields
</pseudo_code>

<test_requirements>
Create tests/api/billing/generate-invoices.controller.spec.ts with minimum 8 tests:

1. "should generate invoices for all active enrollments"
2. "should generate invoices for specific child_ids"
3. "should reject future billing months"
4. "should reject invalid billing_month format" (handled by DTO validation)
5. "should return correct counts and totals"
6. "should convert cents to decimal in response"
7. "should include errors in response"
8. "should enforce OWNER/ADMIN role restriction"

CRITICAL TESTING PHILOSOPHY:
- NO MOCK DATA that masks real issues
- Tests must verify ACTUAL behavior, not pass superficially
- If a test passes when the system is broken, the test is WRONG
- Every test must fail if the underlying functionality breaks

TEST SETUP:
- Use jest.spyOn() on service methods to control return values
- Use REALISTIC test data that matches actual service response:
  - InvoiceGenerationResult with all fields populated
  - Invoices with real cents values (e.g., 345000 = R3450.00)
  - Errors with actual error codes (DUPLICATE_INVOICE, NOT_FOUND)
- Mock user with OWNER/ADMIN role for success tests
- Mock user with VIEWER role for forbidden test

WHAT TO TEST:
- Service called with CORRECT parameters (tenantId, billingMonth, userId, childIds)
- Future month validation rejects correctly (compare dates properly)
- Response structure EXACTLY matches DTO specification
- Cents → decimal conversion is mathematically correct (345000 → 3450.00)
- Error objects properly transformed (camelCase → snake_case)
- Role guard enforced (VIEWER gets 403, OWNER/ADMIN gets 201)

CONTROLLER DEPENDENCIES TO MOCK:
- InvoiceGenerationService (must mock generateMonthlyInvoices)
- InvoiceRepository (from TASK-BILL-031, still needed in providers)
- ParentRepository (from TASK-BILL-031, still needed in providers)
- ChildRepository (from TASK-BILL-031, still needed in providers)

DO NOT:
- Create tests that always pass regardless of implementation
- Use empty mocks that don't verify method calls
- Skip testing error scenarios
- Ignore the cents→decimal conversion verification
- Test role guard with only one role

REFERENCE: tests/api/transaction/categorize.controller.spec.ts for role guard testing
</test_requirements>

<validation_criteria>
  <criterion>POST /invoices/generate returns 201 Created</criterion>
  <criterion>Validates billing_month format (YYYY-MM)</criterion>
  <criterion>Rejects future billing months with 400</criterion>
  <criterion>Only OWNER and ADMIN can access (403 for others)</criterion>
  <criterion>Calls InvoiceGenerationService correctly</criterion>
  <criterion>Returns correct invoices_created count</criterion>
  <criterion>Returns correct total_amount (in Rands, not cents)</criterion>
  <criterion>Includes errors in response for partial failures</criterion>
  <criterion>Swagger documentation complete</criterion>
  <criterion>All tests pass (minimum 8 tests)</criterion>
  <criterion>npm run build passes</criterion>
  <criterion>npm run lint passes with 0 warnings</criterion>
</validation_criteria>

<error_handling>
CRITICAL: Fail fast with clear errors. NO SILENT FAILURES. NO WORKAROUNDS.

PRINCIPLES:
- If something fails, it MUST error out with a clear message
- NO try-catch blocks that swallow errors silently
- NO fallback values that mask real problems
- Every error must be LOGGED with full context before being thrown
- The system must be DEBUGGABLE - when it fails, we know EXACTLY what failed

ERROR RESPONSES:
1. Missing JWT token → 401 Unauthorized (handled by JwtAuthGuard)
2. Insufficient role → 403 Forbidden (handled by RolesGuard)
3. Invalid billing_month format → 400 BadRequest with clear message (handled by class-validator)
4. Future billing_month → 400 BadRequest: "Cannot generate invoices for future months"
5. Service throws → Log full error with stack trace, throw InternalServerErrorException

REQUIRED LOGGING (every endpoint call MUST log):
this.logger.log(`Generate invoices: tenant=${tenantId}, month=${dto.billing_month}, childIds=${dto.child_ids?.length ?? 'all'}`);
this.logger.log(`Generation complete: created=${result.invoicesCreated}, errors=${result.errors.length}, total=${result.totalAmountCents}c`);

ERROR LOGGING:
this.logger.warn(`Future month rejected: ${dto.billing_month} > current month`);
this.logger.error(`Invoice generation failed for tenant=${tenantId}: ${error.message}`, error.stack);

PARTIAL FAILURES (errors array from service):
The service returns errors for individual children that failed. These are NOT thrown as exceptions.
They are returned in the response so the caller knows what succeeded and what failed.
Format (from InvoiceGenerationService):
{
  childId: 'child-001',
  enrollmentId: 'enroll-001',
  error: 'Invoice already exists for billing period 2025-01',
  code: 'DUPLICATE_INVOICE'
}

Possible error codes:
- DUPLICATE_INVOICE: Invoice already exists for this child/period
- NOT_FOUND: Enrollment or related entity not found
- VALIDATION_ERROR: Invalid data
- CONFLICT: Conflicting state
- GENERATION_ERROR: Generic generation failure

DO NOT:
- Catch service errors and return empty success response
- Ignore the errors array from service
- Use try-catch without re-throwing
- Return 200 when service throws exception
</error_handling>

<test_commands>
  <command>npm run test -- tests/api/billing/generate-invoices.controller.spec.ts</command>
  <command>npm run test -- tests/api/billing/</command>
  <command>npm run build</command>
  <command>npm run lint</command>
</test_commands>

<learnings_from_similar_tasks>
From TASK-TRANS-032, TASK-TRANS-033:
1. Import UserRole from '@prisma/client' NOT from entity file for enum compatibility
2. Use @Roles(UserRole.OWNER, UserRole.ADMIN) for role restriction
3. Use @HttpCode(201) for POST endpoints that create resources
4. All services in controller constructor must be mocked in test providers
5. Role guard tests need different mock users (OWNER, ADMIN, VIEWER)
6. Cents to decimal: value / 100 (simple division, no Decimal.js needed in controller)
7. Service method signatures must match exactly (tenantId, billingMonth, userId, childIds)

CRITICAL IMPORT:
// CORRECT - from @prisma/client
import { UserRole } from '@prisma/client';

// WRONG - don't import UserRole from entity
// import { UserRole } from '../../../database/entities/user.entity';
// (The entity file re-exports from @prisma/client, but use @prisma/client directly)
</learnings_from_similar_tasks>

<service_interface>
InvoiceGenerationService.generateMonthlyInvoices signature:
  async generateMonthlyInvoices(
    tenantId: string,
    billingMonth: string,      // Format: YYYY-MM
    userId: string,
    childIds?: string[],       // Optional filter
  ): Promise<InvoiceGenerationResult>

InvoiceGenerationResult interface:
{
  invoicesCreated: number;
  totalAmountCents: number;    // CENTS - must convert to decimal
  invoices: GeneratedInvoiceInfo[];
  errors: InvoiceGenerationError[];
}

GeneratedInvoiceInfo interface:
{
  id: string;
  invoiceNumber: string;       // Format: INV-YYYY-NNN
  childId: string;
  childName: string;           // Already formatted: "FirstName LastName"
  parentId: string;
  totalCents: number;          // CENTS - must convert to decimal
  status: InvoiceStatus;       // Usually DRAFT
  xeroInvoiceId: string | null;
}

InvoiceGenerationError interface:
{
  childId: string;
  enrollmentId?: string;
  error: string;
  code: string;
}
</service_interface>

</task_spec>
