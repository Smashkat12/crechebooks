<task_spec id="TASK-SARS-032" version="3.0">

<metadata>
  <title>VAT201 Endpoint</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>54</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-002</requirement_ref>
    <requirement_ref>REQ-SARS-003</requirement_ref>
    <requirement_ref>REQ-SARS-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Add POST /sars/vat201 endpoint to SarsController (created in TASK-SARS-031).
Uses Vat201Service.generateVat201() from src/database/services/vat201.service.ts.
Creates VAT201 submission in DRAFT status. Calculates output VAT from invoices,
input VAT from expenses, and flags items requiring review.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use jest.spyOn() with real service interface types</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API DTOs use snake_case (e.g., period_start, output_vat)</rule>
  <rule>Internal service DTOs use camelCase (e.g., periodStart, outputVatCents)</rule>
  <rule>All monetary values: cents internally, divide by 100 for API responses</rule>
  <rule>Use `import type { IUser }` for decorator compatibility with isolatedModules</rule>
</critical_rules>

<project_context>
  <test_count>1479 tests passing + TASK-SARS-031 tests</test_count>
  <prerequisite>TASK-SARS-031 must be completed first (creates SarsController)</prerequisite>
  <pattern_reference>Use src/api/payment/payment.controller.ts matchPayments method as reference</pattern_reference>
</project_context>

<existing_infrastructure>
  <file path="src/database/services/vat201.service.ts" purpose="VAT201 generation service">
    Key method signature:
    ```typescript
    async generateVat201(dto: GenerateVat201Dto): Promise<SarsSubmission>

    // GenerateVat201Dto interface (from src/database/dto/vat201.dto.ts):
    interface GenerateVat201Dto {
      tenantId: string;
      periodStart: Date;
      periodEnd: Date;
    }

    // Returns Prisma SarsSubmission with:
    // - id, tenantId, submissionType: 'VAT201'
    // - periodStart, periodEnd, deadline
    // - outputVatCents, inputVatCents, netVatCents (all integers in cents)
    // - status: 'DRAFT'
    // - documentData: JSON with flaggedItems array
    ```
    Throws Error if tenant not VAT registered (check taxStatus !== 'VAT_REGISTERED').
    Throws Error if tenant has no vatNumber.
  </file>
  <file path="src/database/dto/vat201.dto.ts" purpose="VAT201 internal DTOs">
    Contains GenerateVat201Dto, Vat201Document, Vat201Fields, VatFlaggedItem types.
  </file>
  <file path="src/api/sars/sars.controller.ts" purpose="Controller from TASK-SARS-031">
    Will add generateVat201 method to this controller.
  </file>
  <file path="src/api/sars/sars.module.ts" purpose="Module from TASK-SARS-031">
    Will add Vat201Service to providers.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="src/api/sars/dto/vat201.dto.ts">
    API DTOs for VAT201 endpoint.

    ```typescript
    /**
     * VAT201 DTOs
     * TASK-SARS-032: VAT201 Endpoint
     *
     * API DTOs for VAT201 generation endpoint.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
    import { IsDateString } from 'class-validator';

    export class ApiGenerateVat201Dto {
      @ApiProperty({
        description: 'Start date of VAT period (YYYY-MM-DD)',
        example: '2025-01-01',
      })
      @IsDateString()
      period_start!: string;

      @ApiProperty({
        description: 'End date of VAT period (YYYY-MM-DD)',
        example: '2025-01-31',
      })
      @IsDateString()
      period_end!: string;
    }

    export class ApiVat201ReviewItemDto {
      @ApiProperty({ example: 'trans-uuid' })
      transaction_id!: string;

      @ApiProperty({ example: 'Missing VAT number on supplier invoice' })
      issue!: string;

      @ApiProperty({ example: 'WARNING', enum: ['ERROR', 'WARNING'] })
      severity!: string;
    }

    export class ApiVat201DataDto {
      @ApiProperty({ example: 'uuid-here' })
      id!: string;

      @ApiProperty({ example: 'VAT201' })
      submission_type!: string;

      @ApiProperty({ example: '2025-01', description: 'Period in YYYY-MM format' })
      period!: string;

      @ApiProperty({ example: 'DRAFT', enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'] })
      status!: string;

      @ApiProperty({ example: 23175.00, description: 'Output VAT from sales (Rands)' })
      output_vat!: number;

      @ApiProperty({ example: 8450.00, description: 'Input VAT from purchases (Rands)' })
      input_vat!: number;

      @ApiProperty({ example: 14725.00, description: 'Net VAT payable (output - input, Rands)' })
      net_vat!: number;

      @ApiProperty({ example: true, description: 'True if net VAT is owed to SARS' })
      is_payable!: boolean;

      @ApiProperty({ type: [ApiVat201ReviewItemDto], description: 'Items requiring review' })
      items_requiring_review!: ApiVat201ReviewItemDto[];

      @ApiProperty({ example: '2025-02-25T00:00:00.000Z', description: 'Submission deadline' })
      deadline!: string;

      @ApiProperty({ example: '/sars/vat201/uuid/document' })
      document_url!: string;
    }

    export class ApiVat201ResponseDto {
      @ApiProperty({ example: true })
      success!: boolean;

      @ApiProperty({ type: ApiVat201DataDto })
      data!: ApiVat201DataDto;
    }
    ```
  </file>

  <file path="tests/api/sars/vat201.controller.spec.ts">
    Controller unit tests using jest.spyOn() - NO MOCK DATA.

    Test coverage:
    1. POST /sars/vat201 with valid period returns 201
    2. Transforms API snake_case to service camelCase
    3. Converts cents to Rands in response (divide by 100)
    4. Response uses snake_case field names
    5. Period format is YYYY-MM from periodStart
    6. Calculates is_payable correctly (net_vat > 0)
    7. Includes items_requiring_review from documentData
    8. Works for ADMIN users same as OWNER
    9. Works for ACCOUNTANT role (read-only but can generate drafts)
    10. Propagates error when tenant not VAT registered
    11. Propagates error when period_end before period_start

    Pattern: Use tests/api/payment/payment-matching.controller.spec.ts as reference.
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/sars/sars.controller.ts">
    Add Vat201Service dependency and generateVat201 method.

    ```typescript
    // Add to imports:
    import { Vat201Service } from '../../database/services/vat201.service';
    import {
      ApiMarkSubmittedDto, SarsSubmissionResponseDto,
      ApiGenerateVat201Dto, ApiVat201ResponseDto,
    } from './dto';

    // Add to constructor:
    constructor(
      private readonly sarsSubmissionRepo: SarsSubmissionRepository,
      private readonly vat201Service: Vat201Service,
    ) {}

    // Add method:
    @Post('vat201')
    @HttpCode(201)
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Generate VAT201 return for period' })
    @ApiResponse({ status: 201, type: ApiVat201ResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid date format or period' })
    @ApiResponse({ status: 403, description: 'Tenant not VAT registered' })
    @ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, or ACCOUNTANT role' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
    async generateVat201(
      @Body() dto: ApiGenerateVat201Dto,
      @CurrentUser() user: IUser,
    ): Promise<ApiVat201ResponseDto> {
      this.logger.log(
        `Generate VAT201: tenant=${user.tenantId}, period=${dto.period_start} to ${dto.period_end}`
      );

      // Validate period_end is after period_start
      const periodStart = new Date(dto.period_start);
      const periodEnd = new Date(dto.period_end);
      if (periodEnd <= periodStart) {
        throw new BadRequestException('period_end must be after period_start');
      }

      // Transform API snake_case to service camelCase
      const submission = await this.vat201Service.generateVat201({
        tenantId: user.tenantId,
        periodStart,
        periodEnd,
      });

      // Extract flagged items from documentData
      const documentData = submission.documentData as {
        flaggedItems?: Array<{ transactionId: string; issue: string; severity: string }>;
      };
      const flaggedItems = documentData?.flaggedItems ?? [];

      this.logger.log(
        `VAT201 generated: ${submission.id}, output=${submission.outputVatCents}, input=${submission.inputVatCents}`
      );

      // Transform service camelCase to API snake_case, cents to Rands
      return {
        success: true,
        data: {
          id: submission.id,
          submission_type: submission.submissionType,
          period: submission.periodStart.toISOString().slice(0, 7), // YYYY-MM
          status: submission.status,
          output_vat: (submission.outputVatCents ?? 0) / 100,
          input_vat: (submission.inputVatCents ?? 0) / 100,
          net_vat: (submission.netVatCents ?? 0) / 100,
          is_payable: (submission.netVatCents ?? 0) > 0,
          items_requiring_review: flaggedItems.map(item => ({
            transaction_id: item.transactionId,
            issue: item.issue,
            severity: item.severity,
          })),
          deadline: submission.deadline.toISOString(),
          document_url: `/sars/vat201/${submission.id}/document`,
        },
      };
    }
    ```
  </file>

  <file path="src/api/sars/sars.module.ts">
    Add Vat201Service and its dependencies to providers.

    ```typescript
    import { Vat201Service } from '../../database/services/vat201.service';
    import { VatService } from '../../database/services/vat.service';

    @Module({
      imports: [PrismaModule],
      controllers: [SarsController],
      providers: [
        SarsSubmissionRepository,
        Vat201Service,
        VatService, // Required by Vat201Service
        // Emp201Service will be added in TASK-SARS-033
      ],
    })
    export class SarsModule {}
    ```
  </file>

  <file path="src/api/sars/dto/index.ts">
    Add VAT201 DTO exports.

    ```typescript
    export * from './mark-submitted.dto';
    export * from './sars-response.dto';
    export * from './vat201.dto';
    // TASK-SARS-033 will add: export * from './emp201.dto';
    ```
  </file>
</files_to_modify>

<test_requirements>
  <requirement>Use jest.spyOn() to verify Vat201Service.generateVat201() calls</requirement>
  <requirement>Create mock IUser objects with real UserRole from @prisma/client</requirement>
  <requirement>Return typed SarsSubmission objects (not mock data)</requirement>
  <requirement>Verify DTO transformation (snake_case API to camelCase service)</requirement>
  <requirement>Verify cents to Rands conversion (divide by 100)</requirement>
  <requirement>Test error propagation (tenant not VAT registered)</requirement>
  <requirement>Test period validation (end after start)</requirement>
  <requirement>Minimum 10 tests for this endpoint</requirement>
</test_requirements>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test tests/api/sars/vat201.controller.spec.ts - all tests pass</step>
  <step>npm run test - all tests pass (previous + ~10 new)</step>
</verification_steps>

<error_handling>
  Vat201Service throws Error with message "Tenant is not VAT registered" - catch and throw ForbiddenException.
  Vat201Service throws Error with message "Tenant has no VAT number" - catch and throw ForbiddenException.
  Period validation (end before start) - throw BadRequestException in controller.
  All other errors should propagate with their original messages.
</error_handling>

<implementation_notes>
  1. Vat201Service.generateVat201() creates submission in DRAFT status.
     To submit to SARS, user must first call markAsReady() then /sars/:id/submit.
  2. The documentData field contains the full VAT201 document with flaggedItems array.
     Extract flaggedItems for the API response.
  3. ACCOUNTANT role can generate drafts (helps with preparation) but only OWNER/ADMIN can submit.
  4. The is_payable field indicates whether the business owes SARS (net_vat > 0) or is owed a refund.
  5. South African VAT rate is 15%. The service handles all calculations.
</implementation_notes>

<south_african_context>
  <vat_rate>15%</vat_rate>
  <submission_deadline>25th of month following VAT period</submission_deadline>
  <vat_registration_threshold>R1,000,000 annual turnover</vat_registration_threshold>
  <output_vat>VAT collected on sales (invoices to parents)</output_vat>
  <input_vat>VAT paid on purchases (expense transactions)</input_vat>
  <net_vat>output_vat - input_vat (positive = owe SARS, negative = refund due)</net_vat>
</south_african_context>

</task_spec>
