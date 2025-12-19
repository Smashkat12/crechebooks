<task_spec id="TASK-SARS-033" version="1.0">

<metadata>
  <title>EMP201 Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>55</sequence>
  <implements>
    <requirement_ref>REQ-SARS-006</requirement_ref>
    <requirement_ref>REQ-SARS-007</requirement_ref>
    <requirement_ref>REQ-SARS-008</requirement_ref>
    <requirement_ref>REQ-SARS-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the EMP201 employer reconciliation endpoint. It generates an EMP201
submission for a specified month, calculating PAYE, UIF, and SDL from payroll records.
The endpoint applies current SARS tax tables and caps, handles employee count, and creates
a submission in DRAFT status for review before final submission to SARS eFiling.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#sars_endpoints</file>
  <file purpose="service_interface">src/core/sars/sars.service.ts</file>
  <file purpose="payroll_rules">specs/functional/sars-module.md#emp201_calculations</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-031 completed (SARS controller)</check>
  <check>TASK-SARS-014 completed (SarsService)</check>
  <check>TASK-SARS-015 completed (SarsAgent)</check>
  <check>Payroll records exist in database</check>
</prerequisites>

<scope>
  <in_scope>
    - POST /sars/emp201 endpoint
    - GenerateEmp201Dto with period parameter
    - Emp201ResponseDto with PAYE/UIF/SDL breakdown
    - PAYE calculation using SARS tax tables
    - UIF calculation with statutory cap
    - SDL calculation if applicable
    - Employee count tracking
    - Document URL generation
    - Swagger/OpenAPI annotations
  </in_scope>
  <out_of_scope>
    - EMP201 calculation logic (in SarsService)
    - VAT201 generation (TASK-SARS-032)
    - Submission marking (TASK-SARS-031)
    - eFiling integration
    - Payroll processing (separate module)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/sars/sars.controller.ts">
      @Controller('sars')
      @ApiTags('SARS')
      @UseGuards(JwtAuthGuard)
      export class SarsController {
        @Post('emp201')
        @ApiOperation({ summary: 'Generate EMP201 employer reconciliation' })
        @ApiResponse({ status: 201, type: Emp201ResponseDto })
        async generateEmp201(
          @Body() dto: GenerateEmp201Dto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;Emp201ResponseDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/sars/dto/generate-emp201.dto.ts">
      export class GenerateEmp201Dto {
        @ApiProperty({ example: '2025-01' })
        @IsString()
        @Matches(/^\d{4}-\d{2}$/)
        period_month: string;
      }
    </signature>

    <signature file="src/api/sars/dto/emp201-response.dto.ts">
      export class Emp201ResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ example: 'EMP201' })
        submission_type: string;

        @ApiProperty({ example: '2025-01' })
        period: string;

        @ApiProperty({ enum: ['DRAFT', 'READY', 'SUBMITTED'] })
        status: string;

        @ApiProperty({ example: 12450.00 })
        total_paye: number;

        @ApiProperty({ example: 1770.00 })
        total_uif: number;

        @ApiProperty({ example: 0.00 })
        total_sdl: number;

        @ApiProperty({ example: 5 })
        employee_count: number;

        @ApiProperty()
        document_url: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate period_month format is YYYY-MM
    - Must validate period_month is not in future
    - Must calculate PAYE using current SARS tax tables
    - Must calculate UIF at 1% employee + 1% employer (2% total)
    - UIF capped at maximum income threshold
    - Must calculate SDL at 1% if payroll exceeds threshold
    - Must count unique employees in period
    - Must return amounts in Rand (not cents)
    - Must create submission with DRAFT status
    - Must use Swagger/OpenAPI annotations
    - Must return 201 Created on success
    - Must return 400 Bad Request for validation errors
  </constraints>

  <verification>
    - POST /sars/emp201 with valid period returns 201
    - POST /sars/emp201 with invalid format returns 400
    - POST /sars/emp201 with future date returns 400
    - POST /sars/emp201 without auth token returns 401
    - POST /sars/emp201 with no payroll data returns 201 with zeros
    - PAYE calculated correctly using tax tables
    - UIF calculated correctly with cap
    - SDL calculated correctly if applicable
    - Employee count accurate
    - Document URL generated correctly
    - Swagger UI displays endpoint correctly
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
SarsController (src/api/sars/sars.controller.ts):
  @Post('emp201')
  @ApiOperation({ summary: 'Generate EMP201 employer reconciliation' })
  @ApiResponse({ status: 201, type: Emp201ResponseDto })
  async generateEmp201(dto: GenerateEmp201Dto, user: JwtPayload):
    try:
      submission = await sarsService.generateEmp201(
        dto.period_month,
        user.tenant_id
      )

      return {
        success: true,
        data: {
          id: submission.id,
          submission_type: submission.submission_type,
          period: submission.period_month,
          status: submission.status,
          total_paye: Money.fromCents(submission.paye_cents).toNumber(),
          total_uif: Money.fromCents(submission.uif_cents).toNumber(),
          total_sdl: Money.fromCents(submission.sdl_cents).toNumber(),
          employee_count: submission.employee_count,
          document_url: `/sars/emp201/${submission.id}/document`
        }
      }
    catch error:
      if error instanceof ValidationException:
        throw new BadRequestException(error.message)
      throw error

GenerateEmp201Dto (src/api/sars/dto/generate-emp201.dto.ts):
  export class GenerateEmp201Dto:
    @ApiProperty({
      example: '2025-01',
      description: 'Payroll period in YYYY-MM format'
    })
    @IsString()
    @Matches(/^\d{4}-\d{2}$/, {
      message: 'period_month must be in YYYY-MM format'
    })
    period_month: string

Emp201ResponseDto (src/api/sars/dto/emp201-response.dto.ts):
  export class Emp201ResponseDto:
    @ApiProperty()
    id: string

    @ApiProperty({ example: 'EMP201' })
    submission_type: string

    @ApiProperty({
      example: '2025-01',
      description: 'Period in YYYY-MM format'
    })
    period: string

    @ApiProperty({ enum: ['DRAFT', 'READY', 'SUBMITTED'] })
    status: string

    @ApiProperty({
      example: 12450.00,
      description: 'Total PAYE (Pay As You Earn) tax'
    })
    total_paye: number

    @ApiProperty({
      example: 1770.00,
      description: 'Total UIF (Unemployment Insurance Fund) contributions'
    })
    total_uif: number

    @ApiProperty({
      example: 0.00,
      description: 'Total SDL (Skills Development Levy)'
    })
    total_sdl: number

    @ApiProperty({
      example: 5,
      description: 'Number of employees in period'
    })
    employee_count: number

    @ApiProperty({
      example: '/sars/emp201/uuid/document',
      description: 'URL to download EMP201 document'
    })
    document_url: string
</pseudo_code>

<files_to_create>
  <file path="src/api/sars/dto/generate-emp201.dto.ts">DTO for EMP201 generation request</file>
  <file path="src/api/sars/dto/emp201-response.dto.ts">DTO for EMP201 response</file>
  <file path="tests/api/sars/emp201.controller.spec.ts">EMP201 endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/sars/sars.controller.ts">Add generateEmp201 method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Endpoint compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>POST /sars/emp201 returns 201 with correct structure</criterion>
  <criterion>PAYE calculated correctly using tax tables</criterion>
  <criterion>UIF calculated at 2% with cap applied</criterion>
  <criterion>SDL calculated at 1% if applicable</criterion>
  <criterion>Employee count accurate</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test emp201.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X POST http://localhost:3000/sars/emp201 -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"period_month":"2025-01"}'</command>
</test_commands>

</task_spec>
