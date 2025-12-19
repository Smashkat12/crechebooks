<task_spec id="TASK-PAY-033" version="1.0">

<metadata>
  <title>Arrears Dashboard Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>52</sequence>
  <implements>
    <requirement_ref>REQ-PAY-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-013</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task implements the arrears dashboard endpoint that provides a comprehensive view of
outstanding payments. It displays aging analysis with buckets (current, 30, 60, 90+ days),
total outstanding amounts, and identifies top debtors. This endpoint is critical for cash
flow management and enables proactive follow-up on overdue payments.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#payment_endpoints</file>
  <file purpose="service_interface">src/core/payment/payment.service.ts</file>
  <file purpose="entities">src/core/billing/entities/invoice.entity.ts</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-013 completed (ArrearsService)</check>
  <check>TASK-BILL-011 completed (Invoice entities)</check>
  <check>TASK-CORE-002 completed (Parent entity)</check>
  <check>Invoice data exists in database</check>
</prerequisites>

<scope>
  <in_scope>
    - GET /arrears endpoint
    - ArrearsReportDto with aging breakdown
    - Top debtors list with outstanding amounts
    - Swagger/OpenAPI annotations
    - Tenant context filtering from JWT
    - Formatted monetary amounts
  </in_scope>
  <out_of_scope>
    - Payment allocation (TASK-PAY-031)
    - Payment matching (TASK-PAY-032)
    - Arrears calculation logic (in ArrearsService)
    - Email reminders (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/payment/payment.controller.ts">
      @Controller('payments')
      @ApiTags('Payments')
      @UseGuards(JwtAuthGuard)
      export class PaymentController {
        @Get('/arrears')
        @ApiOperation({ summary: 'Get arrears dashboard with aging breakdown' })
        @ApiResponse({ status: 200, type: ArrearsReportDto })
        async getArrearsReport(
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;ArrearsReportDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/payment/dto/arrears-report.dto.ts">
      export class AgingBreakdownDto {
        @ApiProperty({ example: 15000.00 })
        current: number;

        @ApiProperty({ example: 12000.00 })
        days_30: number;

        @ApiProperty({ example: 8600.00 })
        days_60: number;

        @ApiProperty({ example: 10000.00 })
        days_90_plus: number;
      }

      export class ArrearsSummaryDto {
        @ApiProperty({ example: 45600.00 })
        total_outstanding: number;

        @ApiProperty({ type: AgingBreakdownDto })
        aging: AgingBreakdownDto;
      }

      export class TopDebtorDto {
        @ApiProperty()
        parent_id: string;

        @ApiProperty()
        parent_name: string;

        @ApiProperty({ example: 6900.00 })
        outstanding: number;

        @ApiProperty({ example: '2024-10-01' })
        oldest_invoice_date: string;
      }

      export class ArrearsReportDto {
        @ApiProperty({ type: ArrearsSummaryDto })
        summary: ArrearsSummaryDto;

        @ApiProperty({ type: [TopDebtorDto] })
        top_debtors: TopDebtorDto[];
      }
    </signature>
  </signatures>

  <constraints>
    - Must filter by tenant_id from JWT
    - Must calculate aging from invoice due_date
    - Aging buckets: current (0-29), 30 (30-59), 60 (60-89), 90+ (90+)
    - Must return amounts in Rand (not cents)
    - Must order top_debtors by outstanding amount descending
    - Must include oldest_invoice_date for each debtor
    - Must use Swagger/OpenAPI annotations
    - Must return 200 OK on success
    - Must return 401 Unauthorized without valid token
  </constraints>

  <verification>
    - GET /arrears returns 200 with correct structure
    - GET /arrears without auth token returns 401
    - Aging buckets sum equals total_outstanding
    - Top debtors ordered by outstanding amount descending
    - Amounts formatted correctly in Rand
    - Date format is YYYY-MM-DD
    - Empty tenant returns zero totals (not error)
    - Swagger UI displays endpoint correctly
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
PaymentController (src/api/payment/payment.controller.ts):
  @Get('/arrears')
  @ApiOperation({ summary: 'Get arrears dashboard with aging breakdown' })
  @ApiResponse({ status: 200, type: ArrearsReportDto })
  async getArrearsReport(user: JwtPayload):
    try:
      report = await paymentService.getArrearsReport(user.tenant_id)

      return {
        success: true,
        data: {
          summary: {
            total_outstanding: Money.fromCents(report.totalOutstanding).toNumber(),
            aging: {
              current: Money.fromCents(report.aging.current).toNumber(),
              days_30: Money.fromCents(report.aging.days30).toNumber(),
              days_60: Money.fromCents(report.aging.days60).toNumber(),
              days_90_plus: Money.fromCents(report.aging.days90Plus).toNumber()
            }
          },
          top_debtors: report.topDebtors.map(d => ({
            parent_id: d.parent_id,
            parent_name: d.parent_name,
            outstanding: Money.fromCents(d.outstanding).toNumber(),
            oldest_invoice_date: format(d.oldest_invoice_date, 'yyyy-MM-dd')
          }))
        }
      }
    catch error:
      throw error

ArrearsReportDto (src/api/payment/dto/arrears-report.dto.ts):
  export class AgingBreakdownDto:
    @ApiProperty({
      example: 15000.00,
      description: 'Amount due 0-29 days overdue'
    })
    current: number

    @ApiProperty({
      example: 12000.00,
      description: 'Amount due 30-59 days overdue'
    })
    days_30: number

    @ApiProperty({
      example: 8600.00,
      description: 'Amount due 60-89 days overdue'
    })
    days_60: number

    @ApiProperty({
      example: 10000.00,
      description: 'Amount due 90+ days overdue'
    })
    days_90_plus: number

  export class ArrearsSummaryDto:
    @ApiProperty({
      example: 45600.00,
      description: 'Total outstanding across all invoices'
    })
    total_outstanding: number

    @ApiProperty({ type: AgingBreakdownDto })
    aging: AgingBreakdownDto

  export class TopDebtorDto:
    @ApiProperty()
    parent_id: string

    @ApiProperty({ example: 'John Smith' })
    parent_name: string

    @ApiProperty({ example: 6900.00 })
    outstanding: number

    @ApiProperty({
      example: '2024-10-01',
      description: 'Date of oldest unpaid invoice'
    })
    oldest_invoice_date: string

  export class ArrearsReportDto:
    @ApiProperty({ type: ArrearsSummaryDto })
    summary: ArrearsSummaryDto

    @ApiProperty({
      type: [TopDebtorDto],
      description: 'Top 10 debtors by outstanding amount'
    })
    top_debtors: TopDebtorDto[]
</pseudo_code>

<files_to_create>
  <file path="src/api/payment/dto/arrears-report.dto.ts">DTO for arrears dashboard response</file>
  <file path="tests/api/payment/arrears.controller.spec.ts">Arrears endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/payment/payment.controller.ts">Add getArrearsReport method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Endpoint compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete Swagger annotations</criterion>
  <criterion>GET /arrears returns 200 with correct structure</criterion>
  <criterion>Aging buckets calculated correctly</criterion>
  <criterion>Total outstanding equals sum of aging buckets</criterion>
  <criterion>Top debtors sorted by outstanding amount</criterion>
  <criterion>Dates formatted as YYYY-MM-DD</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test arrears.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X GET http://localhost:3000/arrears -H "Authorization: Bearer token"</command>
</test_commands>

</task_spec>
