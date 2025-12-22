<task_spec id="TASK-SARS-033" version="3.0">

<metadata>
  <title>EMP201 Endpoint</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>55</sequence>
  <implements>
    <requirement_ref>REQ-SARS-006</requirement_ref>
    <requirement_ref>REQ-SARS-007</requirement_ref>
    <requirement_ref>REQ-SARS-008</requirement_ref>
    <requirement_ref>REQ-SARS-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-031</task_ref>
    <task_ref status="complete">TASK-SARS-032</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
  <completed_at>2025-12-22T03:37:00Z</completed_at>
</metadata>

<executive_summary>
Add POST /sars/emp201 endpoint to SarsController (created in TASK-SARS-031, extended in TASK-SARS-032).
Uses Emp201Service.generateEmp201() from src/database/services/emp201.service.ts.
Creates EMP201 employer reconciliation submission in DRAFT status. Calculates PAYE, UIF, and SDL
from payroll records for a given month.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use jest.spyOn() with real service interface types</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API DTOs use snake_case (e.g., period_month, total_paye)</rule>
  <rule>Internal service DTOs use camelCase (e.g., periodMonth, totalPayeCents)</rule>
  <rule>All monetary values: cents internally, divide by 100 for API responses</rule>
  <rule>Use `import type { IUser }` for decorator compatibility with isolatedModules</rule>
</critical_rules>

<project_context>
  <test_count>1479 tests + TASK-SARS-031 tests + TASK-SARS-032 tests</test_count>
  <prerequisite>TASK-SARS-031 and TASK-SARS-032 must be completed first</prerequisite>
  <pattern_reference>Use TASK-SARS-032 generateVat201 as reference pattern</pattern_reference>
</project_context>

<existing_infrastructure>
  <file path="src/database/services/emp201.service.ts" purpose="EMP201 generation service">
    Key method signature:
    ```typescript
    async generateEmp201(dto: GenerateEmp201Dto): Promise<SarsSubmission>

    // GenerateEmp201Dto interface (from src/database/dto/emp201.dto.ts):
    interface GenerateEmp201Dto {
      tenantId: string;
      periodMonth: string; // Format: YYYY-MM
    }

    // Returns Prisma SarsSubmission with:
    // - id, tenantId, submissionType: 'EMP201'
    // - periodStart, periodEnd (first/last day of month)
    // - deadline (7th of following month)
    // - totalPayeCents, totalUifCents, totalSdlCents (all integers in cents)
    // - status: 'DRAFT'
    // - documentData: JSON with summary and employees array
    ```
    Throws Error if period format is invalid (not YYYY-MM).
    Throws Error if no approved payroll records for the period.
  </file>
  <file path="src/database/dto/emp201.dto.ts" purpose="EMP201 internal DTOs">
    Contains GenerateEmp201Dto, Emp201Document, Emp201Summary, Emp201EmployeeRecord types.
  </file>
  <file path="src/api/sars/sars.controller.ts" purpose="Controller with markSubmitted and generateVat201">
    Will add generateEmp201 method to this controller.
  </file>
  <file path="src/api/sars/sars.module.ts" purpose="Module with Vat201Service">
    Will add Emp201Service and dependencies to providers.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="src/api/sars/dto/emp201.dto.ts">
    API DTOs for EMP201 endpoint.

    ```typescript
    /**
     * EMP201 DTOs
     * TASK-SARS-033: EMP201 Endpoint
     *
     * API DTOs for EMP201 employer reconciliation endpoint.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty } from '@nestjs/swagger';
    import { IsString, Matches } from 'class-validator';

    export class ApiGenerateEmp201Dto {
      @ApiProperty({
        description: 'Payroll period in YYYY-MM format',
        example: '2025-01',
      })
      @IsString()
      @Matches(/^\d{4}-\d{2}$/, { message: 'period_month must be in YYYY-MM format' })
      period_month!: string;
    }

    export class ApiEmp201DataDto {
      @ApiProperty({ example: 'uuid-here' })
      id!: string;

      @ApiProperty({ example: 'EMP201' })
      submission_type!: string;

      @ApiProperty({ example: '2025-01', description: 'Period in YYYY-MM format' })
      period!: string;

      @ApiProperty({ example: 'DRAFT', enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'] })
      status!: string;

      @ApiProperty({ example: 12450.00, description: 'Total PAYE tax (Rands)' })
      total_paye!: number;

      @ApiProperty({ example: 1770.00, description: 'Total UIF contributions (Rands)' })
      total_uif!: number;

      @ApiProperty({ example: 885.00, description: 'Total SDL levy (Rands)' })
      total_sdl!: number;

      @ApiProperty({ example: 15105.00, description: 'Total due to SARS (PAYE + UIF + SDL)' })
      total_due!: number;

      @ApiProperty({ example: 5, description: 'Number of employees in period' })
      employee_count!: number;

      @ApiProperty({ example: '2025-02-07T00:00:00.000Z', description: 'Submission deadline' })
      deadline!: string;

      @ApiProperty({ example: '/sars/emp201/uuid/document' })
      document_url!: string;
    }

    export class ApiEmp201ResponseDto {
      @ApiProperty({ example: true })
      success!: boolean;

      @ApiProperty({ type: ApiEmp201DataDto })
      data!: ApiEmp201DataDto;
    }
    ```
  </file>

  <file path="tests/api/sars/emp201.controller.spec.ts">
    Controller unit tests using jest.spyOn() - NO MOCK DATA.

    Test coverage:
    1. POST /sars/emp201 with valid period returns 201
    2. Transforms API snake_case to service camelCase
    3. Converts cents to Rands in response (divide by 100)
    4. Response uses snake_case field names
    5. Period format matches input period_month
    6. Calculates total_due correctly (paye + uif + sdl)
    7. Employee count matches service result
    8. Works for ADMIN users same as OWNER
    9. Works for ACCOUNTANT role
    10. Propagates error for invalid period format
    11. Propagates error when no payroll records found

    Pattern: Use tests/api/sars/vat201.controller.spec.ts as reference.
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/sars/sars.controller.ts">
    Add Emp201Service dependency and generateEmp201 method.

    ```typescript
    // Add to imports:
    import { Emp201Service } from '../../database/services/emp201.service';
    import {
      ApiMarkSubmittedDto, SarsSubmissionResponseDto,
      ApiGenerateVat201Dto, ApiVat201ResponseDto,
      ApiGenerateEmp201Dto, ApiEmp201ResponseDto,
    } from './dto';

    // Update constructor:
    constructor(
      private readonly sarsSubmissionRepo: SarsSubmissionRepository,
      private readonly vat201Service: Vat201Service,
      private readonly emp201Service: Emp201Service,
    ) {}

    // Add method:
    @Post('emp201')
    @HttpCode(201)
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Generate EMP201 employer reconciliation for month' })
    @ApiResponse({ status: 201, type: ApiEmp201ResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid period format (must be YYYY-MM)' })
    @ApiResponse({ status: 404, description: 'No payroll records for period' })
    @ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, or ACCOUNTANT role' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
    async generateEmp201(
      @Body() dto: ApiGenerateEmp201Dto,
      @CurrentUser() user: IUser,
    ): Promise<ApiEmp201ResponseDto> {
      this.logger.log(
        `Generate EMP201: tenant=${user.tenantId}, period=${dto.period_month}`
      );

      // Transform API snake_case to service camelCase
      const submission = await this.emp201Service.generateEmp201({
        tenantId: user.tenantId,
        periodMonth: dto.period_month, // snake_case -> camelCase
      });

      // Extract summary from documentData
      const documentData = submission.documentData as {
        summary?: { employeeCount?: number };
      };
      const employeeCount = documentData?.summary?.employeeCount ?? 0;

      // Calculate total due
      const totalPayeCents = submission.totalPayeCents ?? 0;
      const totalUifCents = submission.totalUifCents ?? 0;
      const totalSdlCents = submission.totalSdlCents ?? 0;
      const totalDueCents = totalPayeCents + totalUifCents + totalSdlCents;

      this.logger.log(
        `EMP201 generated: ${submission.id}, paye=${totalPayeCents}, uif=${totalUifCents}, sdl=${totalSdlCents}`
      );

      // Transform service camelCase to API snake_case, cents to Rands
      return {
        success: true,
        data: {
          id: submission.id,
          submission_type: submission.submissionType,
          period: dto.period_month, // Use input format directly
          status: submission.status,
          total_paye: totalPayeCents / 100,
          total_uif: totalUifCents / 100,
          total_sdl: totalSdlCents / 100,
          total_due: totalDueCents / 100,
          employee_count: employeeCount,
          deadline: submission.deadline.toISOString(),
          document_url: `/sars/emp201/${submission.id}/document`,
        },
      };
    }
    ```
  </file>

  <file path="src/api/sars/sars.module.ts">
    Add Emp201Service and its dependencies to providers.

    ```typescript
    import { Emp201Service } from '../../database/services/emp201.service';
    import { PayeService } from '../../database/services/paye.service';
    import { UifService } from '../../database/services/uif.service';

    @Module({
      imports: [PrismaModule],
      controllers: [SarsController],
      providers: [
        SarsSubmissionRepository,
        Vat201Service,
        VatService,
        Emp201Service,
        PayeService, // Required by Emp201Service
        UifService,  // Required by Emp201Service
      ],
    })
    export class SarsModule {}
    ```
  </file>

  <file path="src/api/sars/dto/index.ts">
    Add EMP201 DTO exports.

    ```typescript
    export * from './mark-submitted.dto';
    export * from './sars-response.dto';
    export * from './vat201.dto';
    export * from './emp201.dto';
    ```
  </file>
</files_to_modify>

<test_requirements>
  <requirement>Use jest.spyOn() to verify Emp201Service.generateEmp201() calls</requirement>
  <requirement>Create mock IUser objects with real UserRole from @prisma/client</requirement>
  <requirement>Return typed SarsSubmission objects (not mock data)</requirement>
  <requirement>Verify DTO transformation (snake_case API to camelCase service)</requirement>
  <requirement>Verify cents to Rands conversion (divide by 100)</requirement>
  <requirement>Test error propagation (invalid format, no payroll records)</requirement>
  <requirement>Verify total_due = total_paye + total_uif + total_sdl</requirement>
  <requirement>Minimum 10 tests for this endpoint</requirement>
</test_requirements>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test tests/api/sars/emp201.controller.spec.ts - all tests pass</step>
  <step>npm run test - all tests pass (previous + ~10 new)</step>
</verification_steps>

<error_handling>
  Emp201Service throws Error with message containing "Invalid period format" - let propagate as BadRequestException.
  Emp201Service throws Error with message containing "No approved payroll records" - let propagate as NotFoundException.
  Period format validation (@Matches decorator) - returns 400 automatically via class-validator.
  All other errors should propagate with their original messages.
</error_handling>

<implementation_notes>
  1. Emp201Service.generateEmp201() creates submission in DRAFT status.
     To submit to SARS, user must first call markAsReady() then /sars/:id/submit.
  2. The documentData field contains the full EMP201 document with summary and employees array.
     Extract employeeCount from summary for the API response.
  3. ACCOUNTANT role can generate drafts but only OWNER/ADMIN can submit.
  4. EMP201 is due by the 7th of the month following the payroll period.
  5. Total due is simply PAYE + UIF + SDL - no deductions in this simple case.
</implementation_notes>

<south_african_context>
  <paye>Pay As You Earn - income tax deducted from employees based on SARS tax tables</paye>
  <uif>Unemployment Insurance Fund - 1% employee + 1% employer (2% total), capped at earnings threshold</uif>
  <sdl>Skills Development Levy - 1% of payroll if annual payroll exceeds R500,000</sdl>
  <submission_deadline>7th of month following payroll period</submission_deadline>
  <monthly_filing>EMP201 is filed monthly (unlike EMP501 which is bi-annual reconciliation)</monthly_filing>
</south_african_context>

<prisma_model_reference>
  SarsSubmission model fields for EMP201:
  - totalPayeCents: Int? (sum of all employee PAYE)
  - totalUifCents: Int? (sum of employee + employer UIF)
  - totalSdlCents: Int? (SDL if applicable)
  - documentData: Json (contains summary and employees array)

  Emp201Summary in documentData:
  - employeeCount: number
  - totalGrossRemunerationCents: number
  - totalPayeCents: number
  - totalUifEmployeeCents: number
  - totalUifEmployerCents: number
  - totalUifCents: number
  - totalSdlCents: number
  - totalDueCents: number
</prisma_model_reference>

</task_spec>
