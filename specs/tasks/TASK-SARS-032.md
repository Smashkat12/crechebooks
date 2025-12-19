<task_spec id="TASK-SARS-032" version="1.0">

<metadata>
  <title>VAT201 Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>54</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-002</requirement_ref>
    <requirement_ref>REQ-SARS-003</requirement_ref>
    <requirement_ref>REQ-SARS-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the VAT201 return generation endpoint. It creates a VAT201 submission
for a specified period, calculating output VAT from invoices and input VAT from expenses.
The endpoint distinguishes between standard-rated, zero-rated, and exempt supplies, and
flags any items requiring review (e.g., missing VAT numbers). Returns are created in DRAFT
status for review before final submission.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#sars_endpoints</file>
  <file purpose="service_interface">src/core/sars/sars.service.ts</file>
  <file purpose="vat_rules">specs/functional/sars-module.md#vat_calculations</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-031 completed (SARS controller)</check>
  <check>TASK-SARS-014 completed (SarsService)</check>
  <check>TASK-SARS-015 completed (SarsAgent)</check>
  <check>Invoice and transaction data exists</check>
</prerequisites>

<scope>
  <in_scope>
    - POST /sars/vat201 endpoint
    - GenerateVat201Dto with period parameters
    - Vat201ResponseDto with detailed VAT breakdown
    - Output VAT from invoices
    - Input VAT from categorized expenses
    - Items requiring review flagging
    - Document URL generation
    - Swagger/OpenAPI annotations
  </in_scope>
  <out_of_scope>
    - VAT calculation logic (in SarsService)
    - EMP201 generation (TASK-SARS-033)
    - Submission marking (TASK-SARS-031)
    - eFiling integration
    - PDF generation (can return URL to placeholder)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/sars/sars.controller.ts">
      @Controller('sars')
      @ApiTags('SARS')
      @UseGuards(JwtAuthGuard)
      export class SarsController {
        @Post('vat201')
        @ApiOperation({ summary: 'Generate VAT201 return for period' })
        @ApiResponse({ status: 201, type: Vat201ResponseDto })
        async generateVat201(
          @Body() dto: GenerateVat201Dto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;Vat201ResponseDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/sars/dto/generate-vat201.dto.ts">
      export class GenerateVat201Dto {
        @ApiProperty({ example: '2025-01-01' })
        @IsDateString()
        period_start: string;

        @ApiProperty({ example: '2025-01-31' })
        @IsDateString()
        period_end: string;
      }
    </signature>

    <signature file="src/api/sars/dto/vat201-response.dto.ts">
      export class ReviewItemDto {
        @ApiProperty()
        transaction_id: string;

        @ApiProperty()
        issue: string;
      }

      export class Vat201ResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ example: 'VAT201' })
        submission_type: string;

        @ApiProperty({ example: '2025-01' })
        period: string;

        @ApiProperty({ enum: ['DRAFT', 'READY', 'SUBMITTED'] })
        status: string;

        @ApiProperty({ example: 23175.00 })
        output_vat: number;

        @ApiProperty({ example: 8450.00 })
        input_vat: number;

        @ApiProperty({ example: 14725.00 })
        net_vat: number;

        @ApiProperty({ type: [ReviewItemDto] })
        items_requiring_review: ReviewItemDto[];

        @ApiProperty()
        document_url: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate period_start and period_end are valid dates
    - Must validate period_end is after period_start
    - Must verify tenant is VAT registered
    - Must calculate output VAT from invoices in period
    - Must calculate input VAT from expense transactions in period
    - Must distinguish standard-rated, zero-rated, exempt
    - Must flag items without proper VAT documentation
    - Net VAT = output_vat - input_vat
    - Must return amounts in Rand (not cents)
    - Must create submission with DRAFT status
    - Must use Swagger/OpenAPI annotations
    - Must return 201 Created on success
    - Must return 400 Bad Request for validation errors
    - Must return 403 Forbidden if tenant not VAT registered
  </constraints>

  <verification>
    - POST /sars/vat201 with valid period returns 201
    - POST /sars/vat201 with invalid dates returns 400
    - POST /sars/vat201 with end before start returns 400
    - POST /sars/vat201 without auth token returns 401
    - POST /sars/vat201 for non-VAT tenant returns 403
    - Output VAT calculated correctly from invoices
    - Input VAT calculated correctly from expenses
    - Net VAT equals output minus input
    - Items missing VAT details flagged for review
    - Document URL generated correctly
    - Swagger UI displays endpoint correctly
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
SarsController (src/api/sars/sars.controller.ts):
  @Post('vat201')
  @ApiOperation({ summary: 'Generate VAT201 return for period' })
  @ApiResponse({ status: 201, type: Vat201ResponseDto })
  @ApiResponse({ status: 403, description: 'Tenant not VAT registered' })
  async generateVat201(dto: GenerateVat201Dto, user: JwtPayload):
    try:
      submission = await sarsService.generateVat201(
        new Date(dto.period_start),
        new Date(dto.period_end),
        user.tenant_id
      )

      return {
        success: true,
        data: {
          id: submission.id,
          submission_type: submission.submission_type,
          period: submission.period_month,
          status: submission.status,
          output_vat: Money.fromCents(submission.output_vat_cents).toNumber(),
          input_vat: Money.fromCents(submission.input_vat_cents).toNumber(),
          net_vat: Money.fromCents(submission.net_vat_cents).toNumber(),
          items_requiring_review: submission.review_items.map(item => ({
            transaction_id: item.transaction_id,
            issue: item.issue
          })),
          document_url: `/sars/vat201/${submission.id}/document`
        }
      }
    catch error:
      if error instanceof ForbiddenException:
        throw new ForbiddenException('Tenant is not VAT registered')
      if error instanceof ValidationException:
        throw new BadRequestException(error.message)
      throw error

GenerateVat201Dto (src/api/sars/dto/generate-vat201.dto.ts):
  export class GenerateVat201Dto:
    @ApiProperty({
      example: '2025-01-01',
      description: 'Start date of VAT period (YYYY-MM-DD)'
    })
    @IsDateString()
    period_start: string

    @ApiProperty({
      example: '2025-01-31',
      description: 'End date of VAT period (YYYY-MM-DD)'
    })
    @IsDateString()
    period_end: string

    @Validate(IsAfterDate, ['period_start'])
    period_end: string

Vat201ResponseDto (src/api/sars/dto/vat201-response.dto.ts):
  export class ReviewItemDto:
    @ApiProperty()
    transaction_id: string

    @ApiProperty({ example: 'Missing VAT number on supplier invoice' })
    issue: string

  export class Vat201ResponseDto:
    @ApiProperty()
    id: string

    @ApiProperty({ example: 'VAT201' })
    submission_type: string

    @ApiProperty({
      example: '2025-01',
      description: 'Period in YYYY-MM format'
    })
    period: string

    @ApiProperty({ enum: ['DRAFT', 'READY', 'SUBMITTED'] })
    status: string

    @ApiProperty({
      example: 23175.00,
      description: 'Total output VAT from sales'
    })
    output_vat: number

    @ApiProperty({
      example: 8450.00,
      description: 'Total input VAT from purchases'
    })
    input_vat: number

    @ApiProperty({
      example: 14725.00,
      description: 'Net VAT payable (output - input)'
    })
    net_vat: number

    @ApiProperty({
      type: [ReviewItemDto],
      description: 'Transactions requiring manual review'
    })
    items_requiring_review: ReviewItemDto[]

    @ApiProperty({
      example: '/sars/vat201/uuid/document',
      description: 'URL to download VAT201 document'
    })
    document_url: string
</pseudo_code>

<files_to_create>
  <file path="src/api/sars/dto/generate-vat201.dto.ts">DTO for VAT201 generation request</file>
  <file path="src/api/sars/dto/vat201-response.dto.ts">DTO for VAT201 response</file>
  <file path="tests/api/sars/vat201.controller.spec.ts">VAT201 endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/sars/sars.controller.ts">Add generateVat201 method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Endpoint compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>POST /sars/vat201 returns 201 with correct structure</criterion>
  <criterion>Output VAT calculated from invoices</criterion>
  <criterion>Input VAT calculated from expenses</criterion>
  <criterion>Net VAT equals output minus input</criterion>
  <criterion>Review items flagged correctly</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test vat201.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X POST http://localhost:3000/sars/vat201 -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"period_start":"2025-01-01","period_end":"2025-01-31"}'</command>
</test_commands>

</task_spec>
