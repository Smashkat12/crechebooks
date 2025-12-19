<task_spec id="TASK-BILL-031" version="1.0">

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
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Surface Layer invoice endpoints for the CrecheBooks system. It
implements the REST API controller for listing invoices with filtering by status, parent,
child, and date range. The controller exposes the BillingService business logic with
proper DTOs including parent/child relationship data.
</context>

<input_context_files>
  <file purpose="billing_service">src/core/billing/billing.service.ts</file>
  <file purpose="invoice_entity">src/core/billing/entities/invoice.entity.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#invoice_endpoints</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-012 completed (Billing service)</check>
  <check>TASK-API-001 completed (Auth guards)</check>
  <check>Invoice entities created</check>
</prerequisites>

<scope>
  <in_scope>
    - Create InvoiceController with GET /invoices endpoint
    - Implement filtering by status, parent, child, date range
    - Create response DTOs with parent/child information
    - Create query/filter DTOs with validation
    - Add Swagger/OpenAPI annotations
    - Implement pagination for invoice listing
    - Add tenant isolation using JWT tenant_id
  </in_scope>
  <out_of_scope>
    - Invoice generation endpoint (TASK-BILL-032)
    - Invoice delivery endpoint (TASK-BILL-033)
    - Invoice PDF generation (in service layer)
    - Business logic (already in services)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/billing/invoice.controller.ts">
      @Controller('invoices')
      @ApiTags('Invoices')
      @UseGuards(JwtAuthGuard)
      export class InvoiceController {
        @Get()
        @ApiOperation({ summary: 'List invoices with filtering' })
        @ApiResponse({ status: 200, type: InvoiceListResponseDto })
        async listInvoices(
          @Query() query: ListInvoicesQueryDto,
          @CurrentUser() user: User
        ): Promise&lt;InvoiceListResponseDto&gt;;
      }
    </signature>
    <signature file="src/api/billing/dto/list-invoices.dto.ts">
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
        @ApiProperty({ required: false })
        parent_id?: string;

        @IsOptional()
        @IsUUID()
        @ApiProperty({ required: false })
        child_id?: string;

        @IsOptional()
        @IsISO8601()
        @ApiProperty({ required: false, example: '2025-01-01' })
        date_from?: string;

        @IsOptional()
        @IsISO8601()
        @ApiProperty({ required: false, example: '2025-01-31' })
        date_to?: string;
      }
    </signature>
    <signature file="src/api/billing/dto/invoice-response.dto.ts">
      export class ParentSummaryDto {
        @ApiProperty()
        id: string;

        @ApiProperty()
        name: string;

        @ApiProperty({ required: false })
        email?: string;
      }

      export class ChildSummaryDto {
        @ApiProperty()
        id: string;

        @ApiProperty()
        name: string;
      }

      export class InvoiceResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ example: 'INV-2025-001' })
        invoice_number: string;

        @ApiProperty({ type: ParentSummaryDto })
        parent: ParentSummaryDto;

        @ApiProperty({ type: ChildSummaryDto })
        child: ChildSummaryDto;

        @ApiProperty({ example: '2025-01-01' })
        issue_date: string;

        @ApiProperty({ example: '2025-01-08' })
        due_date: string;

        @ApiProperty({ example: 3000.00 })
        subtotal: number;

        @ApiProperty({ example: 450.00 })
        vat: number;

        @ApiProperty({ example: 3450.00 })
        total: number;

        @ApiProperty({ example: 0.00 })
        amount_paid: number;

        @ApiProperty({ enum: InvoiceStatus })
        status: InvoiceStatus;

        @ApiProperty({ enum: DeliveryStatus, required: false })
        delivery_status?: DeliveryStatus;

        @ApiProperty({ required: false })
        created_at: Date;
      }

      export class InvoiceListResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty({ type: [InvoiceResponseDto] })
        data: InvoiceResponseDto[];

        @ApiProperty({ type: PaginationMetaDto })
        meta: PaginationMetaDto;
      }
    </signature>
  </signatures>

  <constraints>
    - All DTOs must use class-validator decorators
    - All endpoints must have Swagger/OpenAPI documentation
    - Pagination defaults: page=1, limit=20, max=100
    - Dates must be in YYYY-MM-DD format
    - Amounts must be in decimal format (not cents)
    - Must filter by tenant_id from JWT
    - Parent and child data must be embedded (not just IDs)
    - Invoice number format: INV-YYYY-NNN
  </constraints>

  <verification>
    - GET /invoices returns paginated list with defaults
    - Filtering by status works correctly
    - Filtering by parent_id works
    - Filtering by child_id works
    - Date range filtering works (inclusive)
    - Parent and child info included in response
    - Only returns invoices for current tenant
    - Swagger UI shows all filters correctly
  </verification>
</definition_of_done>

<pseudo_code>
InvoiceController (src/api/billing/invoice.controller.ts):
  @Controller('invoices')
  @ApiTags('Invoices')
  @UseGuards(JwtAuthGuard)
  class InvoiceController:
    constructor(private billingService: BillingService)

    @Get()
    @ApiOperation({ summary: 'List invoices with filtering' })
    async listInvoices(query: ListInvoicesQueryDto, user: User):
      # Extract tenant from JWT
      tenantId = user.tenantId

      # Build filter object
      filters = {
        status: query.status,
        parentId: query.parent_id,
        childId: query.child_id,
        dateFrom: query.date_from ? new Date(query.date_from) : undefined,
        dateTo: query.date_to ? new Date(query.date_to) : undefined
      }

      # Call service with pagination
      result = await billingService.findInvoices({
        tenantId,
        filters,
        page: query.page || 1,
        limit: query.limit || 20
      })

      # Transform to response DTO
      return {
        success: true,
        data: result.items.map(invoice => ({
          id: invoice.id,
          invoice_number: invoice.invoiceNumber,
          parent: {
            id: invoice.parent.id,
            name: `${invoice.parent.firstName} ${invoice.parent.lastName}`,
            email: invoice.parent.email
          },
          child: {
            id: invoice.child.id,
            name: `${invoice.child.firstName} ${invoice.child.lastName}`
          },
          issue_date: invoice.issueDate.toISOString().split('T')[0],
          due_date: invoice.dueDate.toISOString().split('T')[0],
          subtotal: invoice.subtotal.toNumber(),
          vat: invoice.vat.toNumber(),
          total: invoice.total.toNumber(),
          amount_paid: invoice.amountPaid.toNumber(),
          status: invoice.status,
          delivery_status: invoice.deliveryStatus,
          created_at: invoice.createdAt
        })),
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit)
        }
      }

DTO Transformations:
  # Parent name concatenation
  parent.name = `${parent.firstName} ${parent.lastName}`

  # Child name concatenation
  child.name = `${child.firstName} ${child.lastName}`

  # Decimal to number conversion
  subtotal: invoice.subtotal.toNumber()
  vat: invoice.vat.toNumber()
  total: invoice.total.toNumber()

  # Date to YYYY-MM-DD
  issue_date: invoice.issueDate.toISOString().split('T')[0]
</pseudo_code>

<files_to_create>
  <file path="src/api/billing/invoice.controller.ts">Invoice controller with list endpoint</file>
  <file path="src/api/billing/billing.module.ts">Billing API module</file>
  <file path="src/api/billing/dto/list-invoices.dto.ts">Query parameters DTO</file>
  <file path="src/api/billing/dto/invoice-response.dto.ts">Invoice response DTOs</file>
  <file path="src/api/billing/dto/parent-summary.dto.ts">Parent summary DTO</file>
  <file path="src/api/billing/dto/child-summary.dto.ts">Child summary DTO</file>
  <file path="tests/api/billing/invoice.controller.spec.ts">Invoice controller unit tests</file>
  <file path="tests/api/billing/invoice.e2e-spec.ts">Invoice E2E tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import BillingApiModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>GET /invoices returns 200 with paginated data</criterion>
  <criterion>Default pagination works (page=1, limit=20)</criterion>
  <criterion>All filters work (status, parent, child, dates)</criterion>
  <criterion>Parent/child data embedded in response</criterion>
  <criterion>Tenant isolation enforced</criterion>
  <criterion>Amounts in decimal format</criterion>
  <criterion>Dates in YYYY-MM-DD format</criterion>
  <criterion>Swagger documentation complete</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- invoice.controller.spec</command>
  <command>npm run test:e2e -- invoice.e2e-spec</command>
  <command>curl -H "Authorization: Bearer TOKEN" http://localhost:3000/v1/invoices</command>
  <command>curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/v1/invoices?status=SENT&amp;parent_id=UUID"</command>
</test_commands>

</task_spec>
