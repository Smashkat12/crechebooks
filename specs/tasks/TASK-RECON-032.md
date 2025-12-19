<task_spec id="TASK-RECON-032" version="1.0">

<metadata>
  <title>Financial Reports Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>57</sequence>
  <implements>
    <requirement_ref>REQ-RECON-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the financial reports endpoint, specifically the Income Statement (Profit
and Loss) report. It generates a comprehensive income statement for a specified period, showing
revenue breakdown, expense categories, and net profit. The endpoint supports multiple output
formats (JSON, PDF, Excel) and follows South African accounting standards for report structure.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#reconciliation_endpoints</file>
  <file purpose="service_interface">src/core/reconciliation/reconciliation.service.ts</file>
  <file purpose="entities">src/core/transaction/entities/transaction.entity.ts</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-RECON-013 completed (ReportingService)</check>
  <check>TASK-TRANS-011 completed (Transaction entities)</check>
  <check>TASK-CORE-002 completed (ChartOfAccounts)</check>
  <check>Categorized transaction data exists</check>
</prerequisites>

<scope>
  <in_scope>
    - GET /reports/income-statement endpoint
    - Query parameters for period and format
    - IncomeStatementDto with revenue/expense breakdown
    - JSON format response
    - PDF/Excel format support (URL to generated file)
    - Swagger/OpenAPI annotations
    - Tenant context filtering from JWT
    - South African accounting standards compliance
  </in_scope>
  <out_of_scope>
    - Bank reconciliation (TASK-RECON-031)
    - Balance sheet report (future enhancement)
    - Cash flow statement (future enhancement)
    - Actual PDF/Excel generation (can use placeholder URLs)
    - Report scheduling (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/reconciliation/reconciliation.controller.ts">
      @Controller('reports')
      @ApiTags('Reports')
      @UseGuards(JwtAuthGuard)
      export class ReportsController {
        constructor(private readonly reportingService: ReportingService) {}

        @Get('income-statement')
        @ApiOperation({ summary: 'Generate Income Statement (Profit & Loss)' })
        @ApiResponse({ status: 200, type: IncomeStatementDto })
        async getIncomeStatement(
          @Query() dto: IncomeStatementQueryDto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;IncomeStatementDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/reconciliation/dto/income-statement-query.dto.ts">
      export class IncomeStatementQueryDto {
        @ApiProperty({ example: '2025-01-01' })
        @IsDateString()
        period_start: string;

        @ApiProperty({ example: '2025-01-31' })
        @IsDateString()
        period_end: string;

        @ApiPropertyOptional({ enum: ['json', 'pdf', 'excel'], default: 'json' })
        @IsOptional()
        @IsEnum(['json', 'pdf', 'excel'])
        format?: string;
      }
    </signature>

    <signature file="src/api/reconciliation/dto/income-statement.dto.ts">
      export class AccountBreakdownDto {
        @ApiProperty()
        account: string;

        @ApiProperty()
        amount: number;
      }

      export class IncomeSectionDto {
        @ApiProperty()
        total: number;

        @ApiProperty({ type: [AccountBreakdownDto] })
        breakdown: AccountBreakdownDto[];
      }

      export class ExpenseSectionDto {
        @ApiProperty()
        total: number;

        @ApiProperty({ type: [AccountBreakdownDto] })
        breakdown: AccountBreakdownDto[];
      }

      export class PeriodDto {
        @ApiProperty()
        start: string;

        @ApiProperty()
        end: string;
      }

      export class IncomeStatementDto {
        @ApiProperty({ type: PeriodDto })
        period: PeriodDto;

        @ApiProperty({ type: IncomeSectionDto })
        income: IncomeSectionDto;

        @ApiProperty({ type: ExpenseSectionDto })
        expenses: ExpenseSectionDto;

        @ApiProperty()
        net_profit: number;

        @ApiPropertyOptional()
        document_url?: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate period_end is after period_start
    - Must filter by tenant_id from JWT
    - Must group transactions by account code
    - Must separate income (credit) and expenses (debit)
    - Must calculate net_profit = income - expenses
    - Must order accounts logically (e.g., revenue first, then expenses)
    - Must return amounts in Rand (not cents)
    - For format=json, return full data structure
    - For format=pdf or format=excel, return document_url
    - Must use Swagger/OpenAPI annotations
    - Must return 200 OK on success
    - Must return 400 Bad Request for validation errors
    - Date format in response: YYYY-MM-DD
  </constraints>

  <verification>
    - GET /reports/income-statement with valid params returns 200
    - GET /reports/income-statement with invalid dates returns 400
    - GET /reports/income-statement with end before start returns 400
    - GET /reports/income-statement without auth token returns 401
    - GET /reports/income-statement?format=json returns full data
    - GET /reports/income-statement?format=pdf returns document_url
    - Income total calculated correctly
    - Expenses total calculated correctly
    - Net profit = income - expenses
    - Accounts ordered logically
    - Swagger UI displays endpoint correctly
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
ReportsController (src/api/reconciliation/reports.controller.ts):
  @Controller('reports')
  @ApiTags('Reports')
  @UseGuards(JwtAuthGuard)
  export class ReportsController:
    constructor(reportingService: ReportingService)

    @Get('income-statement')
    @ApiOperation({ summary: 'Generate Income Statement' })
    @ApiResponse({ status: 200, type: IncomeStatementDto })
    async getIncomeStatement(query: IncomeStatementQueryDto, user: JwtPayload):
      try:
        format = query.format || 'json'

        report = await reportingService.generateIncomeStatement(
          new Date(query.period_start),
          new Date(query.period_end),
          user.tenant_id
        )

        response = {
          period: {
            start: format(report.period_start, 'yyyy-MM-dd'),
            end: format(report.period_end, 'yyyy-MM-dd')
          },
          income: {
            total: Money.fromCents(report.income_total_cents).toNumber(),
            breakdown: report.income_breakdown.map(b => ({
              account: b.account_name,
              amount: Money.fromCents(b.amount_cents).toNumber()
            }))
          },
          expenses: {
            total: Money.fromCents(report.expenses_total_cents).toNumber(),
            breakdown: report.expenses_breakdown.map(b => ({
              account: b.account_name,
              amount: Money.fromCents(b.amount_cents).toNumber()
            }))
          },
          net_profit: Money.fromCents(
            report.income_total_cents - report.expenses_total_cents
          ).toNumber()
        }

        if format === 'pdf' or format === 'excel':
          document_id = await reportingService.generateDocument(report, format)
          response.document_url = `/reports/income-statement/${document_id}/download`

        return {
          success: true,
          data: response
        }
      catch error:
        if error instanceof ValidationException:
          throw new BadRequestException(error.message)
        throw error

IncomeStatementQueryDto (src/api/reconciliation/dto/income-statement-query.dto.ts):
  export class IncomeStatementQueryDto:
    @ApiProperty({
      example: '2025-01-01',
      description: 'Start date of reporting period'
    })
    @IsDateString()
    period_start: string

    @ApiProperty({
      example: '2025-01-31',
      description: 'End date of reporting period'
    })
    @IsDateString()
    period_end: string

    @ApiPropertyOptional({
      enum: ['json', 'pdf', 'excel'],
      default: 'json',
      description: 'Output format'
    })
    @IsOptional()
    @IsEnum(['json', 'pdf', 'excel'])
    format?: string

IncomeStatementDto (src/api/reconciliation/dto/income-statement.dto.ts):
  export class AccountBreakdownDto:
    @ApiProperty({ example: 'School Fees' })
    account: string

    @ApiProperty({ example: 150000.00 })
    amount: number

  export class IncomeSectionDto:
    @ApiProperty({ example: 154500.00 })
    total: number

    @ApiProperty({ type: [AccountBreakdownDto] })
    breakdown: AccountBreakdownDto[]

  export class ExpenseSectionDto:
    @ApiProperty({ example: 85200.00 })
    total: number

    @ApiProperty({ type: [AccountBreakdownDto] })
    breakdown: AccountBreakdownDto[]

  export class PeriodDto:
    @ApiProperty({ example: '2025-01-01' })
    start: string

    @ApiProperty({ example: '2025-01-31' })
    end: string

  export class IncomeStatementDto:
    @ApiProperty({ type: PeriodDto })
    period: PeriodDto

    @ApiProperty({ type: IncomeSectionDto })
    income: IncomeSectionDto

    @ApiProperty({ type: ExpenseSectionDto })
    expenses: ExpenseSectionDto

    @ApiProperty({
      example: 69300.00,
      description: 'Net profit (income - expenses)'
    })
    net_profit: number

    @ApiPropertyOptional({
      example: '/reports/income-statement/uuid/download',
      description: 'Present if format is pdf or excel'
    })
    document_url?: string
</pseudo_code>

<files_to_create>
  <file path="src/api/reconciliation/reports.controller.ts">Reports controller with income statement endpoint</file>
  <file path="src/api/reconciliation/dto/income-statement-query.dto.ts">DTO for income statement query params</file>
  <file path="src/api/reconciliation/dto/income-statement.dto.ts">DTO for income statement response</file>
  <file path="tests/api/reconciliation/reports.controller.spec.ts">Reports endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/reconciliation/reconciliation.module.ts">Add ReportsController</file>
</files_to_modify>

<validation_criteria>
  <criterion>Controller compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>GET /reports/income-statement returns 200 with correct structure</criterion>
  <criterion>Income and expenses calculated correctly</criterion>
  <criterion>Net profit = income - expenses</criterion>
  <criterion>JSON format returns full data</criterion>
  <criterion>PDF/Excel formats return document_url</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test reports.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X GET "http://localhost:3000/reports/income-statement?period_start=2025-01-01&period_end=2025-01-31&format=json" -H "Authorization: Bearer token"</command>
  <command>curl -X GET "http://localhost:3000/reports/income-statement?period_start=2025-01-01&period_end=2025-01-31&format=pdf" -H "Authorization: Bearer token"</command>
</test_commands>

</task_spec>
