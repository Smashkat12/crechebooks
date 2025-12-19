<task_spec id="TASK-SARS-031" version="1.0">

<metadata>
  <title>SARS Controller and DTOs</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>53</sequence>
  <implements>
    <requirement_ref>REQ-SARS-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-014</task_ref>
    <task_ref>TASK-SARS-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the SARS Controller and associated DTOs for managing tax submissions.
It provides the REST API endpoint for marking SARS submissions as submitted after the
user has filed them through eFiling. This endpoint finalizes submissions and makes them
immutable for audit purposes. The controller handles both VAT201 and EMP201 submissions.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#sars_endpoints</file>
  <file purpose="service_interface">src/core/sars/sars.service.ts</file>
  <file purpose="entities">src/core/sars/entities/sars-submission.entity.ts</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-014 completed (SarsService)</check>
  <check>TASK-SARS-015 completed (SarsAgent)</check>
  <check>TASK-CORE-002 completed (SarsSubmission entity)</check>
  <check>NestJS application running</check>
</prerequisites>

<scope>
  <in_scope>
    - SARS controller with POST /sars/{id}/submit endpoint
    - MarkSubmittedDto with validation decorators
    - SarsSubmissionResponseDto for structured responses
    - Swagger/OpenAPI annotations
    - Request validation using class-validator
    - Error handling for already-submitted submissions
    - Immutability enforcement
  </in_scope>
  <out_of_scope>
    - VAT201 generation (TASK-SARS-032)
    - EMP201 generation (TASK-SARS-033)
    - Tax calculations (handled in SarsService)
    - eFiling integration (manual submission by user)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/sars/sars.controller.ts">
      @Controller('sars')
      @ApiTags('SARS')
      @UseGuards(JwtAuthGuard)
      export class SarsController {
        constructor(private readonly sarsService: SarsService) {}

        @Post(':id/submit')
        @ApiOperation({ summary: 'Mark SARS submission as submitted' })
        @ApiResponse({ status: 200, type: SarsSubmissionResponseDto })
        @ApiResponse({ status: 409, description: 'Already submitted' })
        async markSubmitted(
          @Param('id') id: string,
          @Body() dto: MarkSubmittedDto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;SarsSubmissionResponseDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/sars/dto/mark-submitted.dto.ts">
      export class MarkSubmittedDto {
        @ApiPropertyOptional({ example: 'SARS-REF-123' })
        @IsOptional()
        @IsString()
        @MaxLength(100)
        sars_reference?: string;

        @ApiProperty({ example: '2025-01-25' })
        @IsDateString()
        submitted_date: string;
      }
    </signature>

    <signature file="src/api/sars/dto/sars-submission-response.dto.ts">
      export class SarsSubmissionResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ enum: ['DRAFT', 'READY', 'SUBMITTED'] })
        status: string;

        @ApiProperty()
        submitted_at: string;

        @ApiProperty()
        is_finalized: boolean;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate id is valid UUID
    - Must validate submitted_date is valid date in YYYY-MM-DD format
    - Must check submission is not already submitted (409 Conflict)
    - Must verify submission belongs to user's tenant
    - Must set is_finalized to true (immutable)
    - Must update status to SUBMITTED
    - Must store SARS reference if provided
    - Must use class-validator decorators for all validations
    - Must include Swagger/OpenAPI annotations
    - Must return 200 OK on success
    - Must return 404 Not Found if submission doesn't exist
    - Must return 409 Conflict if already submitted
  </constraints>

  <verification>
    - POST /sars/{id}/submit with valid payload returns 200
    - POST /sars/{id}/submit with invalid UUID returns 400
    - POST /sars/{id}/submit with invalid date format returns 400
    - POST /sars/{id}/submit without auth token returns 401
    - POST /sars/{id}/submit for non-existent submission returns 404
    - POST /sars/{id}/submit for already-submitted submission returns 409
    - Submission becomes immutable after marking as submitted
    - is_finalized set to true
    - Swagger UI displays endpoint correctly
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
SarsController (src/api/sars/sars.controller.ts):
  @Controller('sars')
  @ApiTags('SARS')
  @UseGuards(JwtAuthGuard)
  export class SarsController:
    constructor(sarsService: SarsService)

    @Post(':id/submit')
    @ApiOperation({ summary: 'Mark SARS submission as submitted' })
    @ApiResponse({ status: 200, type: SarsSubmissionResponseDto })
    @ApiResponse({ status: 404, description: 'Submission not found' })
    @ApiResponse({ status: 409, description: 'Already submitted' })
    async markSubmitted(id: string, dto: MarkSubmittedDto, user: JwtPayload):
      try:
        submission = await sarsService.markSubmitted(
          id,
          dto.sars_reference,
          new Date(dto.submitted_date),
          user.tenant_id,
          user.user_id
        )

        return {
          success: true,
          data: {
            id: submission.id,
            status: submission.status,
            submitted_at: submission.submitted_at.toISOString(),
            is_finalized: submission.is_finalized
          }
        }
      catch error:
        if error instanceof NotFoundException:
          throw new NotFoundException('Submission not found')
        if error instanceof ConflictException:
          throw new ConflictException('Submission already marked as submitted')
        throw error

MarkSubmittedDto (src/api/sars/dto/mark-submitted.dto.ts):
  export class MarkSubmittedDto:
    @ApiPropertyOptional({
      example: 'SARS-REF-123',
      description: 'eFiling reference number from SARS'
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    sars_reference?: string

    @ApiProperty({
      example: '2025-01-25',
      description: 'Date submission was filed with SARS'
    })
    @IsDateString()
    submitted_date: string

SarsSubmissionResponseDto (src/api/sars/dto/sars-submission-response.dto.ts):
  export class SarsSubmissionResponseDto:
    @ApiProperty()
    id: string

    @ApiProperty({
      enum: ['DRAFT', 'READY', 'SUBMITTED'],
      example: 'SUBMITTED'
    })
    status: string

    @ApiProperty({ example: '2025-01-25T14:30:00Z' })
    submitted_at: string

    @ApiProperty({
      example: true,
      description: 'Whether submission is finalized and immutable'
    })
    is_finalized: boolean

SarsModule (src/api/sars/sars.module.ts):
  @Module({
    imports: [
      CoreSarsModule,
      AuthModule
    ],
    controllers: [SarsController],
    providers: []
  })
  export class SarsApiModule {}
</pseudo_code>

<files_to_create>
  <file path="src/api/sars/sars.controller.ts">SARS controller with submit endpoint</file>
  <file path="src/api/sars/dto/mark-submitted.dto.ts">DTO for submission marking request</file>
  <file path="src/api/sars/dto/sars-submission-response.dto.ts">DTO for submission response</file>
  <file path="src/api/sars/sars.module.ts">SARS API module</file>
  <file path="tests/api/sars/sars.controller.spec.ts">Controller unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import SarsApiModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>Controller compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>POST /sars/{id}/submit returns 200 with correct response</criterion>
  <criterion>Already-submitted submissions return 409 Conflict</criterion>
  <criterion>is_finalized enforces immutability</criterion>
  <criterion>Missing auth token returns 401</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test sars.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X POST http://localhost:3000/sars/uuid/submit -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"submitted_date":"2025-01-25","sars_reference":"SARS-REF-123"}'</command>
</test_commands>

</task_spec>
