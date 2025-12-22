<task_spec id="TASK-SARS-031" version="3.0">

<metadata>
  <title>SARS Controller and DTOs</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>53</sequence>
  <implements>
    <requirement_ref>REQ-SARS-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-014</task_ref>
    <task_ref status="complete">TASK-SARS-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Create NestJS SARS API controller at src/api/sars/ with POST /sars/:id/submit endpoint.
Uses SarsSubmissionRepository.submit() method. All three SARS endpoints (submit, vat201, emp201)
will be in the same controller. This task creates the base controller and submit endpoint.
TASK-SARS-032 and TASK-SARS-033 add vat201 and emp201 endpoints to this controller.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use jest.spyOn() with real service interface types</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API DTOs use snake_case (e.g., sars_reference, submitted_date)</rule>
  <rule>Internal service DTOs use camelCase (e.g., sarsReference, submittedBy)</rule>
  <rule>All monetary values: cents internally, divide by 100 for API responses</rule>
  <rule>Use `import type { IUser }` for decorator compatibility with isolatedModules</rule>
</critical_rules>

<project_context>
  <test_count>1479 tests passing as of TASK-PAY-033 completion</test_count>
  <completed_api_modules>
    - src/api/auth/ (AuthModule)
    - src/api/transaction/ (TransactionModule)
    - src/api/billing/ (BillingModule)
    - src/api/payment/ (PaymentModule)
  </completed_api_modules>
  <pattern_reference>Use src/api/payment/ as the reference implementation pattern</pattern_reference>
</project_context>

<existing_infrastructure>
  <file path="src/database/repositories/sars-submission.repository.ts" purpose="Repository with submit method">
    Key method: submit(id: string, dto: SubmitSarsSubmissionDto): Promise<SarsSubmission>
    - Validates submission exists
    - Checks submission is not already finalized
    - Requires status === READY to submit
    - Sets submittedAt, submittedBy, sarsReference
    - Throws NotFoundException if submission not found
    - Throws BusinessException if wrong status
  </file>
  <file path="src/database/dto/sars-submission.dto.ts" purpose="Internal DTOs">
    - SubmitSarsSubmissionDto: { submittedBy: string, sarsReference?: string }
    - SarsSubmissionFilterDto for querying
    - CreateSarsSubmissionDto, UpdateSarsSubmissionDto
  </file>
  <file path="src/database/entities/sars-submission.entity.ts" purpose="Entity with enums">
    - SubmissionType: VAT201 | EMP201 | IRP5
    - SubmissionStatus: DRAFT | READY | SUBMITTED | ACKNOWLEDGED
  </file>
  <file path="src/database/services/vat201.service.ts" purpose="VAT201 generation">
    - generateVat201(dto: GenerateVat201Dto): Creates SARS submission with DRAFT status
  </file>
  <file path="src/database/services/emp201.service.ts" purpose="EMP201 generation">
    - generateEmp201(dto: GenerateEmp201Dto): Creates SARS submission with DRAFT status
  </file>
  <file path="src/api/auth/decorators/current-user.decorator.ts" purpose="Get current user from JWT">
    @CurrentUser() returns IUser from request
  </file>
  <file path="src/api/auth/guards/jwt-auth.guard.ts" purpose="JWT authentication guard">
    @UseGuards(JwtAuthGuard)
  </file>
  <file path="src/api/auth/guards/roles.guard.ts" purpose="Role-based access control">
    @UseGuards(JwtAuthGuard, RolesGuard) with @Roles(UserRole.OWNER, ...)
  </file>
  <file path="src/shared/exceptions/index.ts" purpose="Custom exception classes">
    NotFoundException, ConflictException, BusinessException
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="src/api/sars/sars.controller.ts">
    NestJS controller for SARS endpoints.

    Structure:
    ```typescript
    /**
     * SARS Controller
     * TASK-SARS-031: SARS Controller and DTOs
     *
     * Handles SARS tax submission operations.
     * Uses snake_case for external API, transforms to camelCase for internal services.
     */
    import {
      Controller, Post, Body, Param, Logger, HttpCode, UseGuards,
    } from '@nestjs/common';
    import {
      ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
      ApiUnauthorizedResponse, ApiForbiddenResponse, ApiParam,
    } from '@nestjs/swagger';
    import { UserRole } from '@prisma/client';
    import { SarsSubmissionRepository } from '../../database/repositories/sars-submission.repository';
    import { CurrentUser } from '../auth/decorators/current-user.decorator';
    import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
    import { RolesGuard } from '../auth/guards/roles.guard';
    import { Roles } from '../auth/decorators/roles.decorator';
    import type { IUser } from '../../database/entities/user.entity';
    import { ApiMarkSubmittedDto, SarsSubmissionResponseDto } from './dto';

    @Controller('sars')
    @ApiTags('SARS')
    @ApiBearerAuth('JWT-auth')
    export class SarsController {
      private readonly logger = new Logger(SarsController.name);

      constructor(
        private readonly sarsSubmissionRepo: SarsSubmissionRepository,
        // Vat201Service and Emp201Service will be added in TASK-SARS-032/033
      ) {}

      @Post(':id/submit')
      @HttpCode(200)
      @Roles(UserRole.OWNER, UserRole.ADMIN)
      @UseGuards(JwtAuthGuard, RolesGuard)
      @ApiOperation({ summary: 'Mark SARS submission as submitted to eFiling' })
      @ApiParam({ name: 'id', description: 'SARS submission ID (UUID)' })
      @ApiResponse({ status: 200, type: SarsSubmissionResponseDto })
      @ApiResponse({ status: 400, description: 'Invalid submission ID or date format' })
      @ApiResponse({ status: 404, description: 'Submission not found' })
      @ApiResponse({ status: 409, description: 'Submission not in READY status' })
      @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
      @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
      async markSubmitted(
        @Param('id') id: string,
        @Body() dto: ApiMarkSubmittedDto,
        @CurrentUser() user: IUser,
      ): Promise<SarsSubmissionResponseDto> {
        this.logger.log(`Mark submitted: tenant=${user.tenantId}, submission=${id}`);

        // Transform API snake_case to service camelCase
        const submission = await this.sarsSubmissionRepo.submit(id, {
          submittedBy: user.id,
          sarsReference: dto.sars_reference, // snake_case -> camelCase
        });

        this.logger.log(`Submission ${id} marked as submitted`);

        return {
          success: true,
          data: {
            id: submission.id,
            submission_type: submission.submissionType,
            period: submission.periodStart.toISOString().slice(0, 7), // YYYY-MM
            status: submission.status,
            submitted_at: submission.submittedAt?.toISOString() ?? null,
            sars_reference: submission.sarsReference ?? null,
            is_finalized: submission.isFinalized,
          },
        };
      }
    }
    ```
  </file>

  <file path="src/api/sars/dto/mark-submitted.dto.ts">
    API DTO for POST /sars/:id/submit request body.

    ```typescript
    /**
     * Mark Submitted DTO
     * TASK-SARS-031: SARS Controller and DTOs
     *
     * API DTO for marking a SARS submission as submitted.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
    import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';

    export class ApiMarkSubmittedDto {
      @ApiPropertyOptional({
        description: 'eFiling reference number from SARS (optional)',
        example: 'SARS-REF-2025-001234',
      })
      @IsOptional()
      @IsString()
      @MaxLength(100)
      sars_reference?: string;

      @ApiProperty({
        description: 'Date submission was filed with SARS (YYYY-MM-DD)',
        example: '2025-01-25',
      })
      @IsDateString()
      submitted_date!: string;
    }
    ```
  </file>

  <file path="src/api/sars/dto/sars-response.dto.ts">
    Response DTOs for SARS endpoints.

    ```typescript
    /**
     * SARS Response DTOs
     * TASK-SARS-031: SARS Controller and DTOs
     *
     * Response DTOs for SARS submission operations.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

    export class SarsSubmissionDataDto {
      @ApiProperty({ example: 'uuid-here' })
      id!: string;

      @ApiProperty({ example: 'VAT201', enum: ['VAT201', 'EMP201', 'IRP5'] })
      submission_type!: string;

      @ApiProperty({ example: '2025-01', description: 'Period in YYYY-MM format' })
      period!: string;

      @ApiProperty({ example: 'SUBMITTED', enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'] })
      status!: string;

      @ApiPropertyOptional({ example: '2025-01-25T14:30:00.000Z' })
      submitted_at!: string | null;

      @ApiPropertyOptional({ example: 'SARS-REF-2025-001234' })
      sars_reference!: string | null;

      @ApiProperty({ example: false })
      is_finalized!: boolean;
    }

    export class SarsSubmissionResponseDto {
      @ApiProperty({ example: true })
      success!: boolean;

      @ApiProperty({ type: SarsSubmissionDataDto })
      data!: SarsSubmissionDataDto;
    }
    ```
  </file>

  <file path="src/api/sars/dto/index.ts">
    Barrel export for SARS DTOs.

    ```typescript
    /**
     * SARS DTO Barrel Exports
     * TASK-SARS-031: SARS Controller and DTOs
     */
    export * from './mark-submitted.dto';
    export * from './sars-response.dto';
    // TASK-SARS-032 will add: export * from './vat201.dto';
    // TASK-SARS-033 will add: export * from './emp201.dto';
    ```
  </file>

  <file path="src/api/sars/sars.module.ts">
    NestJS module for SARS API.

    ```typescript
    /**
     * SARS Module
     * TASK-SARS-031: SARS Controller and DTOs
     *
     * Provides the SarsController with required dependencies.
     */
    import { Module } from '@nestjs/common';
    import { SarsController } from './sars.controller';
    import { SarsSubmissionRepository } from '../../database/repositories/sars-submission.repository';
    import { PrismaModule } from '../../database/prisma';

    @Module({
      imports: [PrismaModule],
      controllers: [SarsController],
      providers: [
        SarsSubmissionRepository,
        // Vat201Service will be added in TASK-SARS-032
        // Emp201Service will be added in TASK-SARS-033
      ],
    })
    export class SarsModule {}
    ```
  </file>

  <file path="tests/api/sars/sars.controller.spec.ts">
    Controller unit tests using jest.spyOn() - NO MOCK DATA.

    Test coverage:
    1. POST /sars/:id/submit with valid payload returns 200
    2. Transforms API snake_case to service camelCase
    3. Response uses snake_case field names
    4. Period format is YYYY-MM from periodStart
    5. Handles null submitted_at and sars_reference
    6. Works for ADMIN users same as OWNER
    7. Propagates NotFoundException from repository
    8. Propagates BusinessException for wrong status

    Pattern: Use tests/api/payment/payment-matching.controller.spec.ts as reference.
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/api.module.ts">
    Add SarsModule to imports and exports.

    ```typescript
    import { SarsModule } from './sars/sars.module';

    @Module({
      imports: [AuthModule, TransactionModule, BillingModule, PaymentModule, SarsModule],
      exports: [AuthModule, TransactionModule, BillingModule, PaymentModule, SarsModule],
    })
    export class ApiModule {}
    ```
  </file>
</files_to_modify>

<test_requirements>
  <requirement>Use jest.spyOn() to verify service/repository calls</requirement>
  <requirement>Create mock IUser objects with real UserRole from @prisma/client</requirement>
  <requirement>Return typed service response objects (not mock data)</requirement>
  <requirement>Verify DTO transformation (snake_case API to camelCase service)</requirement>
  <requirement>Verify cents to decimal conversion where applicable</requirement>
  <requirement>Test error propagation (NotFoundException, BusinessException)</requirement>
  <requirement>Minimum 8 tests for this endpoint</requirement>
</test_requirements>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test tests/api/sars/sars.controller.spec.ts - all tests pass</step>
  <step>npm run test - all 1487+ tests pass (1479 + ~8 new)</step>
</verification_steps>

<error_handling>
  Repository throws NotFoundException if submission not found - let it propagate.
  Repository throws BusinessException if submission not in READY status - let it propagate.
  Repository throws BusinessException if submission already finalized - let it propagate.
  DO NOT catch and wrap errors unless adding context. Fail fast with clear error messages.
</error_handling>

<implementation_notes>
  1. The controller uses SarsSubmissionRepository.submit() which expects status === READY.
     If the submission is in DRAFT status, generate endpoints (TASK-SARS-032/033) must call
     markAsReady() first to transition to READY before submit() can be called.
  2. The submitted_date from API DTO is informational - the actual submittedAt is set by the
     repository to the current timestamp when submit() is called.
  3. TenantId validation is implicit - the repository does not filter by tenantId on submit.
     Consider adding tenant validation in controller if required for security.
</implementation_notes>

</task_spec>
