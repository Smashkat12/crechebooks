<task_spec id="TASK-BILL-031" version="3.0">

<metadata>
  <title>Invoice Controller and DTOs</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>46</sequence>
  <implements>
    <requirement_ref>REQ-BILL-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-012</task_ref>
    <task_ref>TASK-API-001</task_ref>
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
- All API responses use snake_case per REST conventions
- Tests must NOT use mock data - test real service interactions
- NO backwards compatibility - fail fast with robust error logging
</critical_context>

<actual_file_paths>
CRITICAL: These are the REAL paths verified against git history. DO NOT use paths from older specs.

SERVICES (already exist):
- src/database/services/invoice-generation.service.ts (InvoiceGenerationService)
- src/database/services/invoice-delivery.service.ts (InvoiceDeliveryService)
- src/database/services/enrollment.service.ts (EnrollmentService)

REPOSITORIES (already exist):
- src/database/repositories/invoice.repository.ts (InvoiceRepository)
- src/database/repositories/invoice-line.repository.ts (InvoiceLineRepository)
- src/database/repositories/parent.repository.ts (ParentRepository)
- src/database/repositories/child.repository.ts (ChildRepository)

ENTITIES (already exist):
- src/database/entities/invoice.entity.ts (IInvoice, InvoiceStatus, DeliveryStatus, DeliveryMethod)
- src/database/entities/invoice-line.entity.ts (IInvoiceLine, LineType)
- src/database/entities/parent.entity.ts (IParent, PreferredContact)
- src/database/entities/child.entity.ts (IChild, Gender)
- src/database/entities/user.entity.ts (IUser, UserRole - from @prisma/client)

DTOs (already exist):
- src/database/dto/invoice.dto.ts (CreateInvoiceDto, UpdateInvoiceDto, InvoiceFilterDto)
- src/database/dto/invoice-generation.dto.ts (InvoiceGenerationResult, GeneratedInvoiceInfo)

AUTH (already exists):
- src/api/auth/guards/jwt-auth.guard.ts (JwtAuthGuard)
- src/api/auth/guards/roles.guard.ts (RolesGuard)
- src/api/auth/decorators/current-user.decorator.ts (@CurrentUser)
- src/api/auth/decorators/roles.decorator.ts (@Roles)

API STRUCTURE PATTERN (follow this exactly):
- src/api/transaction/transaction.controller.ts (reference for controller pattern)
- src/api/transaction/transaction.module.ts (reference for module pattern)
- src/api/transaction/dto/*.ts (reference for DTO pattern)

MODULE REGISTRATION:
- src/api/api.module.ts (must import BillingModule here)
</actual_file_paths>

<context>
This task creates the Invoice Controller with GET /invoices list endpoint for CrecheBooks.
It exposes the existing InvoiceRepository with proper DTOs including parent/child relationship data.

INVOICE DATA STRUCTURE (from invoice.entity.ts):
- id: string (UUID)
- tenantId: string (for multi-tenant isolation)
- invoiceNumber: string (format: INV-YYYY-NNN)
- parentId: string (FK to Parent)
- childId: string (FK to Child)
- billingPeriodStart/End: Date
- issueDate: Date
- dueDate: Date
- subtotalCents: number (integer, amount before VAT)
- vatCents: number (integer, VAT amount - 15%)
- totalCents: number (integer, subtotal + VAT)
- amountPaidCents: number (integer, amount paid so far)
- status: InvoiceStatus enum (DRAFT, SENT, VIEWED, PARTIALLY_PAID, PAID, OVERDUE, VOID)
- deliveryStatus: DeliveryStatus enum | null
- isDeleted: boolean (soft delete flag)

CRITICAL CONVERSIONS:
- Store: cents (integer) → Display: decimal (divide by 100)
- Store: Date object → Display: YYYY-MM-DD string
- Store: camelCase → API: snake_case
</context>

<scope>
  <in_scope>
    - Create InvoiceController with GET /invoices endpoint
    - Create BillingModule for API layer
    - Create ListInvoicesQueryDto with filtering (status, parent_id, child_id, date_from, date_to)
    - Create InvoiceResponseDto with parent/child summary data
    - Create InvoiceListResponseDto with pagination
    - Add pagination support (page, limit with defaults 1/20, max 100)
    - Include parent name and email in response
    - Include child name in response
    - Apply tenant isolation using JWT tenantId
    - Add Swagger/OpenAPI annotations
    - Create controller unit tests
  </in_scope>
  <out_of_scope>
    - Invoice generation endpoint (TASK-BILL-032)
    - Invoice delivery endpoint (TASK-BILL-033)
    - Business logic (already in InvoiceRepository/InvoiceGenerationService)
  </out_of_scope>
</scope>

<files_to_create>
  <file path="src/api/billing/billing.module.ts">
    Billing API module - imports repositories and services
  </file>
  <file path="src/api/billing/invoice.controller.ts">
    Invoice controller with GET /invoices endpoint
  </file>
  <file path="src/api/billing/dto/index.ts">
    DTO barrel export
  </file>
  <file path="src/api/billing/dto/list-invoices.dto.ts">
    Query parameters DTO with validation
  </file>
  <file path="src/api/billing/dto/invoice-response.dto.ts">
    Invoice response DTOs including parent/child summary
  </file>
  <file path="tests/api/billing/invoice.controller.spec.ts">
    Invoice controller unit tests (minimum 8 tests)
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/api.module.ts">
    Add BillingModule to imports array
  </file>
</files_to_modify>

<implementation_signatures>
// src/api/billing/dto/list-invoices.dto.ts
import { IsOptional, IsInt, Min, Max, IsEnum, IsUUID, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';

export class ListInvoicesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false, default: 1 })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({ required: false, default: 20 })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  @ApiProperty({ enum: InvoiceStatus, required: false })
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, description: 'Filter by parent UUID' })
  parent_id?: string;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, description: 'Filter by child UUID' })
  child_id?: string;

  @IsOptional()
  @IsISO8601()
  @ApiProperty({ required: false, example: '2025-01-01', description: 'Issue date from (YYYY-MM-DD)' })
  date_from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiProperty({ required: false, example: '2025-01-31', description: 'Issue date to (YYYY-MM-DD)' })
  date_to?: string;
}

// src/api/billing/dto/invoice-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus, DeliveryStatus } from '../../../database/entities/invoice.entity';

export class ParentSummaryDto {
  @ApiProperty({ description: 'Parent UUID' })
  id: string;

  @ApiProperty({ example: 'John Smith' })
  name: string;

  @ApiProperty({ required: false, example: 'john@example.com' })
  email?: string;
}

export class ChildSummaryDto {
  @ApiProperty({ description: 'Child UUID' })
  id: string;

  @ApiProperty({ example: 'Emma Smith' })
  name: string;
}

export class InvoiceResponseDto {
  @ApiProperty({ description: 'Invoice UUID' })
  id: string;

  @ApiProperty({ example: 'INV-2025-001' })
  invoice_number: string;

  @ApiProperty({ type: ParentSummaryDto })
  parent: ParentSummaryDto;

  @ApiProperty({ type: ChildSummaryDto })
  child: ChildSummaryDto;

  @ApiProperty({ example: '2025-01-01', description: 'Billing period start (YYYY-MM-DD)' })
  billing_period_start: string;

  @ApiProperty({ example: '2025-01-31', description: 'Billing period end (YYYY-MM-DD)' })
  billing_period_end: string;

  @ApiProperty({ example: '2025-01-01', description: 'Invoice issue date (YYYY-MM-DD)' })
  issue_date: string;

  @ApiProperty({ example: '2025-01-08', description: 'Payment due date (YYYY-MM-DD)' })
  due_date: string;

  @ApiProperty({ example: 3000.00, description: 'Subtotal before VAT (in Rands, not cents)' })
  subtotal: number;

  @ApiProperty({ example: 450.00, description: 'VAT amount (in Rands, not cents)' })
  vat: number;

  @ApiProperty({ example: 3450.00, description: 'Total including VAT (in Rands, not cents)' })
  total: number;

  @ApiProperty({ example: 0.00, description: 'Amount already paid (in Rands, not cents)' })
  amount_paid: number;

  @ApiProperty({ example: 3450.00, description: 'Outstanding balance (in Rands, not cents)' })
  balance_due: number;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiProperty({ enum: DeliveryStatus, required: false })
  delivery_status?: DeliveryStatus;

  @ApiProperty()
  created_at: Date;
}

export class PaginationMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class InvoiceListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [InvoiceResponseDto] })
  data: InvoiceResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

// src/api/billing/invoice.controller.ts
@Controller('invoices')
@ApiTags('Invoices')
@ApiBearerAuth('JWT-auth')
export class InvoiceController {
  private readonly logger = new Logger(InvoiceController.name);

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly parentRepo: ParentRepository,
    private readonly childRepo: ChildRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List invoices with filtering and pagination' })
  @ApiResponse({ status: 200, type: InvoiceListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listInvoices(
    @Query() query: ListInvoicesQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<InvoiceListResponseDto>;
}
</implementation_signatures>

<pseudo_code>
InvoiceController.listInvoices():
  1. Extract tenantId from user JWT
  2. Build filter object from query params:
     - status: query.status (if provided)
     - parentId: query.parent_id (if provided)
     - childId: query.child_id (if provided)
  3. Call invoiceRepo.findByTenant(tenantId, filter)
  4. Apply date range filter on results if date_from/date_to provided
  5. Apply pagination (slice array based on page/limit)
  6. For each invoice, fetch parent and child data:
     - parent = await parentRepo.findById(invoice.parentId)
     - child = await childRepo.findById(invoice.childId)
  7. Transform to response DTO:
     - Convert cents to decimal (divide by 100)
     - Convert dates to YYYY-MM-DD strings
     - Build parent/child summary objects
     - Calculate balance_due = totalCents - amountPaidCents
  8. Return { success: true, data: [...], meta: { page, limit, total, totalPages } }

CRITICAL TRANSFORMATIONS:
  - invoice.subtotalCents / 100 → subtotal (decimal)
  - invoice.vatCents / 100 → vat (decimal)
  - invoice.totalCents / 100 → total (decimal)
  - invoice.amountPaidCents / 100 → amount_paid (decimal)
  - (invoice.totalCents - invoice.amountPaidCents) / 100 → balance_due (decimal)
  - invoice.issueDate.toISOString().split('T')[0] → issue_date (string)
  - `${parent.firstName} ${parent.lastName}` → parent.name
  - `${child.firstName} ${child.lastName}` → child.name
</pseudo_code>

<test_requirements>
Create tests/api/billing/invoice.controller.spec.ts with minimum 8 tests:

1. "should return paginated invoices with default params"
2. "should apply status filter"
3. "should apply parent_id filter"
4. "should apply child_id filter"
5. "should apply date range filters"
6. "should include parent and child summary in response"
7. "should convert cents to decimal amounts"
8. "should enforce tenant isolation"

CRITICAL TESTING PHILOSOPHY:
- NO MOCK DATA that masks real issues
- Tests must verify ACTUAL behavior, not pass superficially
- If a test passes when the system is broken, the test is WRONG
- Every test must fail if the underlying functionality breaks

TEST SETUP:
- Use jest.spyOn() on repository methods to control return values
- Use REALISTIC test data that matches actual database schemas:
  - Invoice with all required fields (id, tenantId, invoiceNumber, subtotalCents, etc.)
  - Parent with firstName, lastName, email
  - Child with firstName, lastName
- Use actual cents values (e.g., 345000 = R3450.00) and verify conversion
- Verify EXACT field names and types in response

WHAT TO TEST:
- Repository methods called with CORRECT parameters (tenantId, filters)
- Response structure EXACTLY matches DTO specification
- Cents → decimal conversion is mathematically correct
- Date → string conversion produces valid YYYY-MM-DD
- Parent/child name concatenation produces "FirstName LastName"
- Missing parent/child handled gracefully (log warning, use 'Unknown')

DO NOT:
- Create tests that always pass regardless of implementation
- Use empty mocks that don't verify behavior
- Skip error case testing
- Ignore edge cases (empty results, missing relations)

REFERENCE: tests/api/transaction/transaction.controller.spec.ts for test patterns
</test_requirements>

<validation_criteria>
  <criterion>GET /invoices returns 200 with paginated data</criterion>
  <criterion>Default pagination works (page=1, limit=20)</criterion>
  <criterion>All filters work (status, parent_id, child_id, date_from, date_to)</criterion>
  <criterion>Parent/child data embedded in response (not just IDs)</criterion>
  <criterion>Tenant isolation enforced via user.tenantId</criterion>
  <criterion>Amounts displayed as decimals (not cents)</criterion>
  <criterion>Dates displayed as YYYY-MM-DD strings</criterion>
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
2. Invalid filter values → 400 Bad Request (handled by class-validator)
3. Database errors → Log full error with stack trace, throw HttpException
4. Parent/child not found for invoice → Log WARNING with invoice/parent/child IDs, use 'Unknown' for name
   (This is the ONLY acceptable fallback - prevents entire list from failing due to orphaned data)

REQUIRED LOGGING:
this.logger.debug(`Listing invoices: tenant=${tenantId}, page=${page}, limit=${limit}, filters=${JSON.stringify(filter)}`);
this.logger.warn(`Parent ${parentId} not found for invoice ${invoiceId} - using 'Unknown' name`);
this.logger.error(`Database error in listInvoices: ${error.message}`, error.stack);

DO NOT:
- Catch and ignore exceptions
- Return empty arrays when database fails
- Use default values that hide configuration problems
- Skip logging "to reduce noise"
</error_handling>

<test_commands>
  <command>npm run test -- tests/api/billing/invoice.controller.spec.ts</command>
  <command>npm run build</command>
  <command>npm run lint</command>
</test_commands>

<learnings_from_similar_tasks>
From TASK-TRANS-031, TASK-TRANS-032, TASK-TRANS-033:
1. All services used by controller must be mocked in test providers array
2. Import UserRole from '@prisma/client' for enum compatibility
3. Use Type(() => Number) decorator for query params that need number conversion
4. API responses use snake_case, internal code uses camelCase
5. Date string format: date.toISOString().split('T')[0] produces YYYY-MM-DD
6. PaginationMetaDto should match transaction pattern: { page, limit, total, totalPages }
7. All repository/service mocks need jest.fn() for each method called
</learnings_from_similar_tasks>

</task_spec>
