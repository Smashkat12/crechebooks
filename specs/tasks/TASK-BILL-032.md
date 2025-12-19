<task_spec id="TASK-BILL-032" version="1.0">

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
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the monthly invoice generation endpoint for the CrecheBooks system.
It creates the POST /invoices/generate endpoint that triggers batch invoice creation for
all enrolled children (or a filtered subset), including pro-rata calculations, sibling
discounts, and VAT calculations. Returns detailed summary of invoices created.
</context>

<input_context_files>
  <file purpose="billing_service">src/core/billing/billing.service.ts</file>
  <file purpose="fee_calculation">src/core/billing/fee-calculation.service.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#invoices/generate</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-031 completed (Invoice controller base)</check>
  <check>TASK-BILL-012 completed (Billing service)</check>
  <check>Fee structures configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Add POST /invoices/generate endpoint to InvoiceController
    - Create generation request/response DTOs with validation
    - Support filtering by specific child IDs
    - Include ad-hoc charges in generation
    - Return detailed summary with invoice breakdown
    - Add Swagger/OpenAPI annotations
    - Validate billing_month format (YYYY-MM)
    - Return 201 Created with invoice list
  </in_scope>
  <out_of_scope>
    - Invoice generation logic (in BillingService)
    - Fee calculations (in FeeCalculationService)
    - Sibling discount logic (in service)
    - Pro-rata calculations (in service)
    - Xero sync (handled in service)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/billing/invoice.controller.ts">
      @Post('generate')
      @HttpCode(201)
      @ApiOperation({ summary: 'Generate monthly invoices for enrolled children' })
      @ApiResponse({ status: 201, type: GenerateInvoicesResponseDto })
      @Roles(UserRole.OWNER, UserRole.ADMIN)
      @UseGuards(JwtAuthGuard, RolesGuard)
      async generateInvoices(
        @Body() dto: GenerateInvoicesDto,
        @CurrentUser() user: User
      ): Promise&lt;GenerateInvoicesResponseDto&gt;;
    </signature>
    <signature file="src/api/billing/dto/generate-invoices.dto.ts">
      export class GenerateInvoicesDto {
        @IsString()
        @Matches(/^\d{4}-\d{2}$/, {
          message: 'billing_month must be in YYYY-MM format'
        })
        @ApiProperty({ example: '2025-01', format: 'YYYY-MM' })
        billing_month: string;

        @IsOptional()
        @IsArray()
        @IsUUID('4', { each: true })
        @ApiProperty({
          type: [String],
          required: false,
          description: 'Specific children; if empty, all active'
        })
        child_ids?: string[];

        @IsOptional()
        @IsBoolean()
        @ApiProperty({ required: false, default: true })
        include_adhoc?: boolean;
      }

      export class InvoiceSummaryDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ example: 'INV-2025-001' })
        invoice_number: string;

        @ApiProperty()
        child_name: string;

        @ApiProperty({ example: 3450.00 })
        total: number;

        @ApiProperty({ enum: InvoiceStatus })
        status: InvoiceStatus;
      }

      export class GenerateInvoicesResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty()
        data: {
          invoices_created: number;
          total_amount: number;
          invoices: InvoiceSummaryDto[];
        };
      }
    </signature>
  </signatures>

  <constraints>
    - billing_month must be YYYY-MM format
    - Only OWNER and ADMIN roles can generate invoices
    - Must validate billing month is not in the future
    - Must prevent duplicate generation for same month/child
    - If child_ids empty, generate for all active enrollments
    - Must include ad-hoc charges by default
    - Return 201 Created (not 200 OK)
    - Must calculate total_amount across all invoices
    - All DTOs must have Swagger documentation
  </constraints>

  <verification>
    - POST /invoices/generate creates invoices for all active children
    - Filtering by child_ids works
    - billing_month validation works (format and not future)
    - Duplicate prevention works (same month/child)
    - include_adhoc flag works
    - Returns correct invoices_created count
    - Returns correct total_amount sum
    - Only OWNER/ADMIN can access (403 for others)
    - Swagger documentation complete
  </verification>
</definition_of_done>

<pseudo_code>
InvoiceController (src/api/billing/invoice.controller.ts):
  @Post('generate')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async generateInvoices(dto: GenerateInvoicesDto, user: User):
    # Validate billing month format and not in future
    billingMonth = parseBillingMonth(dto.billing_month)

    if (billingMonth > getCurrentMonth()):
      throw new BadRequestException('Cannot generate invoices for future months')

    # Check for duplicates
    existingInvoices = await billingService.findInvoicesByMonth(
      billingMonth,
      user.tenantId
    )

    if (existingInvoices.length > 0 && !dto.child_ids):
      throw new ConflictException(
        `Invoices already exist for ${dto.billing_month}`
      )

    # Generate invoices
    result = await billingService.generateMonthlyInvoices({
      billingMonth,
      childIds: dto.child_ids,
      includeAdhoc: dto.include_adhoc ?? true,
      tenantId: user.tenantId
    })

    # Calculate total
    totalAmount = result.invoices.reduce(
      (sum, inv) => sum.add(inv.total),
      new Decimal(0)
    )

    return {
      success: true,
      data: {
        invoices_created: result.invoices.length,
        total_amount: totalAmount.toNumber(),
        invoices: result.invoices.map(invoice => ({
          id: invoice.id,
          invoice_number: invoice.invoiceNumber,
          child_name: `${invoice.child.firstName} ${invoice.child.lastName}`,
          total: invoice.total.toNumber(),
          status: invoice.status
        }))
      }
    }

Billing Month Validation:
  function parseBillingMonth(month: string): Date
    # month format: YYYY-MM
    [year, monthNum] = month.split('-').map(Number)

    if (monthNum < 1 || monthNum > 12):
      throw new BadRequestException('Invalid month')

    return new Date(year, monthNum - 1, 1)

  function getCurrentMonth(): Date
    now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)

Duplicate Detection:
  # Check if invoices already exist for this month
  # Allow regeneration for specific child_ids
  if (existingInvoices.length > 0):
    if (dto.child_ids):
      # Filter out children with existing invoices
      existingChildIds = existingInvoices.map(inv => inv.childId)
      dto.child_ids = dto.child_ids.filter(id => !existingChildIds.includes(id))
    else:
      throw ConflictException('Invoices already generated for this month')
</pseudo_code>

<files_to_create>
  <file path="src/api/billing/dto/generate-invoices.dto.ts">Invoice generation DTOs</file>
  <file path="src/api/billing/dto/invoice-summary.dto.ts">Invoice summary DTO</file>
  <file path="tests/api/billing/generate-invoices.spec.ts">Generation endpoint unit tests</file>
  <file path="tests/api/billing/generate-invoices.e2e-spec.ts">Generation E2E tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/billing/invoice.controller.ts">Add generate endpoint</file>
</files_to_modify>

<validation_criteria>
  <criterion>POST /invoices/generate creates invoices for all active</criterion>
  <criterion>Filtering by child_ids works correctly</criterion>
  <criterion>billing_month format validated (YYYY-MM)</criterion>
  <criterion>Future month validation works</criterion>
  <criterion>Duplicate prevention works</criterion>
  <criterion>Returns correct counts and totals</criterion>
  <criterion>Role guard enforces OWNER/ADMIN only</criterion>
  <criterion>Swagger documentation complete</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- generate-invoices.spec</command>
  <command>npm run test:e2e -- generate-invoices.e2e-spec</command>
  <command>curl -X POST -H "Authorization: Bearer TOKEN" -d '{"billing_month":"2025-01"}' http://localhost:3000/v1/invoices/generate</command>
  <command>curl -X POST -H "Authorization: Bearer TOKEN" -d '{"billing_month":"2025-01","child_ids":["uuid1","uuid2"]}' http://localhost:3000/v1/invoices/generate</command>
</test_commands>

</task_spec>
