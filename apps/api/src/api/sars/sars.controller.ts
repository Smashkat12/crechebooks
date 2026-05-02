/**
 * SARS Controller
 * TASK-SARS-031: SARS Controller and DTOs
 * TASK-SARS-035: Replace Mock eFiling with File Generation
 *
 * Handles SARS tax submission operations.
 * Uses snake_case for external API, transforms to camelCase for internal services.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Logger,
  HttpCode,
  UseGuards,
  BadRequestException,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SarsSubmissionRepository } from '../../database/repositories/sars-submission.repository';
import { Vat201Service } from '../../database/services/vat201.service';
import { Emp201Service } from '../../database/services/emp201.service';
import { SarsFileGeneratorService } from '../../database/services/sars-file-generator.service';
import { SarsReadinessService } from './sars-readiness.service';
import { SarsReadinessResponseDto } from './dto/readiness.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import {
  ApiMarkSubmittedDto,
  SarsSubmissionResponseDto,
  ApiGenerateVat201Dto,
  ApiVat201ResponseDto,
  ApiGenerateEmp201Dto,
  ApiEmp201ResponseDto,
} from './dto';
import { SarsSubmissionsListResponseDto } from './dto/sars-submissions-list.dto';
import {
  Emp201DownloadQueryDto,
  Emp501DownloadQueryDto,
} from '../../database/dto/sars-file.dto';

@Controller('sars')
@ApiTags('SARS')
@ApiBearerAuth('JWT-auth')
export class SarsController {
  private readonly logger = new Logger(SarsController.name);

  constructor(
    private readonly sarsSubmissionRepo: SarsSubmissionRepository,
    private readonly vat201Service: Vat201Service,
    private readonly emp201Service: Emp201Service,
    private readonly sarsFileGenerator: SarsFileGeneratorService,
    private readonly sarsReadiness: SarsReadinessService,
  ) {}

  /**
   * GET /sars/readiness?period=YYYY-MM
   *
   * Returns the next SARS filing deadline and any data-completeness blockers.
   * Read-only — no mutations.  Tenant-scoped from JWT.
   *
   * period (optional): YYYY-MM reference date; defaults to today.
   *
   * Deadlines computed (EMP201 §3, VAT201 §6 Category A, EMP501 §2):
   *   EMP201  — 7th of following month
   *   VAT201  — 25th of month after bi-monthly period (Category A; see service TODO)
   *   EMP501  — May 31 (interim) / Oct 31 (annual)
   */
  @Get('readiness')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Filing readiness checklist for the next SARS deadline',
    description:
      'Aggregates uncategorised transactions, unreconciled bank lines, missing payslips (EMP201), and VAT gaps (VAT201) to surface what is blocking the next submission.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Reference period YYYY-MM. Defaults to current month.',
    example: '2026-04',
  })
  @ApiResponse({ status: 200, type: SarsReadinessResponseDto })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getReadiness(
    @Query('period') period: string | undefined,
    @CurrentUser() user: IUser,
  ): Promise<SarsReadinessResponseDto> {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Readiness check: tenant=${tenantId}, period=${period ?? 'auto'}`,
    );

    // Validate period format if supplied
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('period must be in YYYY-MM format');
    }

    return this.sarsReadiness.getReadiness(tenantId, period);
  }

  /**
   * GET /sars/submissions
   *
   * Returns paginated SARS submission history for the authenticated tenant.
   * Tenant-scoped from JWT. Admin/Owner/Accountant only.
   *
   * Query params:
   *   type  — optional, one of VAT201 | EMP201 | EMP501
   *   from  — optional YYYY-MM, filters periodStart >= first day of month
   *   to    — optional YYYY-MM, filters periodEnd <= last day of month
   *   page  — optional integer >= 1 (default 1)
   *   limit — optional integer 1–100 (default 20)
   */
  @Get('submissions')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'List SARS submission history for the tenant' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['VAT201', 'EMP201', 'EMP501'],
    description: 'Filter by submission type',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Filter from period start YYYY-MM',
    example: '2026-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Filter to period end YYYY-MM',
    example: '2026-12',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page 1-100 (default 20)',
    example: 20,
  })
  @ApiResponse({ status: 200, type: SarsSubmissionsListResponseDto })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listSubmissions(
    @Query('type') type: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: IUser,
  ): Promise<SarsSubmissionsListResponseDto> {
    const tenantId = getTenantId(user);

    // Validate query params
    if (type && !['VAT201', 'EMP201', 'EMP501'].includes(type)) {
      throw new BadRequestException('type must be one of VAT201, EMP201, EMP501');
    }
    if (from && !/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) {
      throw new BadRequestException('from must be in YYYY-MM format');
    }
    if (to && !/^\d{4}-(0[1-9]|1[0-2])$/.test(to)) {
      throw new BadRequestException('to must be in YYYY-MM format');
    }

    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10)))
      : 20;

    // Build filter for repository
    const filter: {
      submissionType?: string;
      periodStart?: Date;
      periodEnd?: Date;
    } = {};

    if (type) {
      filter.submissionType = type;
    }
    if (from) {
      const [y, m] = from.split('-').map(Number);
      filter.periodStart = new Date(y, m - 1, 1);
    }
    if (to) {
      const [y, m] = to.split('-').map(Number);
      // Last day of the month
      filter.periodEnd = new Date(y, m, 0);
    }

    // Fetch all matching (repository orders by periodStart desc)
    const all = await this.sarsSubmissionRepo.findByTenantId(
      tenantId,
      filter as Parameters<typeof this.sarsSubmissionRepo.findByTenantId>[1],
    );

    const total = all.length;
    const offset = (pageNum - 1) * limitNum;
    const items = all.slice(offset, offset + limitNum);

    this.logger.log(
      `List submissions: tenant=${tenantId} total=${total} page=${pageNum}`,
    );

    return {
      success: true,
      data: {
        items: items.map((s) => ({
          id: s.id,
          submission_type: s.submissionType,
          period: s.periodStart.toISOString().slice(0, 7),
          status: s.status,
          submitted_at: s.submittedAt?.toISOString() ?? null,
          sars_reference: s.sarsReference ?? null,
          is_finalized: s.isFinalized,
          created_at: s.createdAt.toISOString(),
        })),
        total,
        page: pageNum,
        limit: limitNum,
      },
    };
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Mark SARS submission as submitted to eFiling' })
  @ApiParam({ name: 'id', description: 'SARS submission ID (UUID)' })
  @ApiResponse({ status: 200, type: SarsSubmissionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid submission ID or date format',
  })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @ApiResponse({ status: 409, description: 'Submission not in READY status' })
  @ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async markSubmitted(
    @Param('id') id: string,
    @Body() dto: ApiMarkSubmittedDto,
    @CurrentUser() user: IUser,
  ): Promise<SarsSubmissionResponseDto> {
    this.logger.log(
      `Mark submitted: tenant=${getTenantId(user)}, submission=${id}`,
    );

    // Transform API snake_case to service camelCase
    const submission = await this.sarsSubmissionRepo.submit(
      id,
      getTenantId(user),
      {
        submittedBy: user.id,
        sarsReference: dto.sars_reference, // snake_case -> camelCase
      },
    );

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

  @Post('vat201')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Generate VAT201 return for period' })
  @ApiResponse({ status: 201, type: ApiVat201ResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid date format or period' })
  @ApiResponse({ status: 403, description: 'Tenant not VAT registered' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async generateVat201(
    @Body() dto: ApiGenerateVat201Dto,
    @CurrentUser() user: IUser,
  ): Promise<ApiVat201ResponseDto> {
    this.logger.log(
      `Generate VAT201: tenant=${getTenantId(user)}, period=${dto.period_start} to ${dto.period_end}`,
    );

    // Validate period_end is after period_start
    const periodStart = new Date(dto.period_start);
    const periodEnd = new Date(dto.period_end);
    if (periodEnd <= periodStart) {
      throw new BadRequestException('period_end must be after period_start');
    }

    // Transform API snake_case to service camelCase
    const submission = await this.vat201Service.generateVat201({
      tenantId: getTenantId(user),
      periodStart,
      periodEnd,
    });

    // Extract flagged items from documentData
    const documentData = submission.documentData as {
      flaggedItems?: Array<{
        transactionId: string;
        issue: string;
        severity: string;
      }>;
    };
    const flaggedItems = documentData?.flaggedItems ?? [];

    this.logger.log(
      `VAT201 generated: ${submission.id}, output=${submission.outputVatCents}, input=${submission.inputVatCents}`,
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
        items_requiring_review: flaggedItems.map((item) => ({
          transaction_id: item.transactionId,
          issue: item.issue,
          severity: item.severity,
        })),
        deadline: submission.deadline.toISOString(),
        document_url: `/sars/vat201/${submission.id}/document`,
      },
    };
  }

  @Post('emp201')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Generate EMP201 return for period' })
  @ApiResponse({ status: 201, type: ApiEmp201ResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid period format or no approved payroll',
  })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async generateEmp201(
    @Body() dto: ApiGenerateEmp201Dto,
    @CurrentUser() user: IUser,
  ): Promise<ApiEmp201ResponseDto> {
    this.logger.log(
      `Generate EMP201: tenant=${getTenantId(user)}, period=${dto.period_month}`,
    );

    // Transform API snake_case to service camelCase
    const submission = await this.emp201Service.generateEmp201({
      tenantId: getTenantId(user),
      periodMonth: dto.period_month, // snake_case -> camelCase
    });

    // Extract document data for response details
    const documentData = submission.documentData as {
      summary?: {
        employeeCount: number;
        totalGrossRemunerationCents: number;
        totalPayeCents: number;
        totalUifCents: number;
        totalSdlCents: number;
        totalDueCents: number;
      };
      employees?: Array<{
        staffId: string;
        fullName: string;
        grossRemunerationCents: number;
        payeCents: number;
        uifEmployeeCents: number;
        uifEmployerCents: number;
      }>;
      validationIssues?: string[];
    };

    const summary = documentData?.summary ?? {
      employeeCount: 0,
      totalGrossRemunerationCents: 0,
      totalPayeCents: 0,
      totalUifCents: 0,
      totalSdlCents: 0,
      totalDueCents: 0,
    };

    const employees = documentData?.employees ?? [];
    const validationIssues = documentData?.validationIssues ?? [];

    this.logger.log(
      `EMP201 generated: ${submission.id}, employees=${summary.employeeCount}, due=${summary.totalDueCents}`,
    );

    // Transform service camelCase to API snake_case, cents to Rands
    return {
      success: true,
      data: {
        id: submission.id,
        submission_type: submission.submissionType,
        period: submission.periodStart.toISOString().slice(0, 7), // YYYY-MM
        status: submission.status,
        summary: {
          employee_count: summary.employeeCount,
          total_gross: summary.totalGrossRemunerationCents / 100,
          total_paye: summary.totalPayeCents / 100,
          total_uif: summary.totalUifCents / 100,
          total_sdl: summary.totalSdlCents / 100,
          total_due: summary.totalDueCents / 100,
        },
        employees: employees.map((e) => ({
          staff_id: e.staffId,
          full_name: e.fullName,
          gross_remuneration: e.grossRemunerationCents / 100,
          paye: e.payeCents / 100,
          uif_employee: e.uifEmployeeCents / 100,
          uif_employer: e.uifEmployerCents / 100,
        })),
        validation_issues: validationIssues,
        deadline: submission.deadline.toISOString(),
        document_url: `/sars/emp201/${submission.id}/document`,
      },
    };
  }

  /**
   * Download EMP201 CSV file for SARS submission
   * TASK-SARS-035: Replace Mock eFiling with File Generation
   */
  @Get('emp201/download')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Download EMP201 CSV for SARS eFiling',
    description:
      'Generates EMP201 CSV file from SimplePay data for upload to SARS eFiling portal',
  })
  @ApiQuery({
    name: 'taxYear',
    description: 'Tax year in YYYY format',
    example: '2025',
  })
  @ApiQuery({
    name: 'taxPeriod',
    description: 'Tax period (1-12 for monthly)',
    example: '1',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'EMP201 CSV file download',
    content: {
      'text/csv': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid tax year or period format',
  })
  @ApiResponse({
    status: 503,
    description: 'SimplePay service unavailable',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async downloadEmp201(
    @Query() query: Emp201DownloadQueryDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Download EMP201: tenant=${getTenantId(user)}, year=${query.taxYear}, period=${query.taxPeriod}`,
    );

    try {
      const result = await this.sarsFileGenerator.generateEmp201Csv(
        getTenantId(user),
        parseInt(query.taxYear, 10),
        parseInt(query.taxPeriod, 10),
      );

      res.set({
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-cache',
      });

      res.send(result.content);

      this.logger.log(`EMP201 CSV downloaded: ${result.filename}`);
    } catch (error) {
      this.logger.error(
        `Failed to generate EMP201 CSV: ${error.message}`,
        error.stack,
      );

      if (error.message?.includes('SimplePay')) {
        throw new ServiceUnavailableException(
          'SimplePay service unavailable. Please try again later.',
        );
      }

      throw error;
    }
  }

  /**
   * Download EMP501 CSV file for SARS annual reconciliation
   * TASK-SARS-035: Replace Mock eFiling with File Generation
   */
  @Get('emp501/download')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Download EMP501 CSV for SARS annual reconciliation',
    description:
      'Generates EMP501 CSV file from SimplePay IRP5 data for upload to SARS eFiling portal',
  })
  @ApiQuery({
    name: 'taxYearStart',
    description: 'Tax year start date (YYYY-MM-DD)',
    example: '2025-03-01',
  })
  @ApiQuery({
    name: 'taxYearEnd',
    description: 'Tax year end date (YYYY-MM-DD)',
    example: '2026-02-28',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'EMP501 CSV file download',
    content: {
      'text/csv': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format',
  })
  @ApiResponse({
    status: 503,
    description: 'SimplePay service unavailable',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async downloadEmp501(
    @Query() query: Emp501DownloadQueryDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Download EMP501: tenant=${getTenantId(user)}, period=${query.taxYearStart} to ${query.taxYearEnd}`,
    );

    try {
      const result = await this.sarsFileGenerator.generateEmp501Csv(
        getTenantId(user),
        query.taxYearStart,
        query.taxYearEnd,
      );

      res.set({
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-cache',
      });

      res.send(result.content);

      this.logger.log(`EMP501 CSV downloaded: ${result.filename}`);
    } catch (error) {
      this.logger.error(
        `Failed to generate EMP501 CSV: ${error.message}`,
        error.stack,
      );

      if (error.message?.includes('SimplePay')) {
        throw new ServiceUnavailableException(
          'SimplePay service unavailable. Please try again later.',
        );
      }

      throw error;
    }
  }
}
