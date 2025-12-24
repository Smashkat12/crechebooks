/**
 * Reconciliation Controller
 * TASK-RECON-031: Reconciliation Controller
 * TASK-RECON-032: Financial Reports Endpoint
 * TASK-RECON-033: Balance Sheet API Endpoint
 * TASK-RECON-034: Audit Log Pagination and Filtering
 *
 * Handles bank reconciliation and financial reporting operations.
 * Uses snake_case for external API, transforms to camelCase for internal services.
 */
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Logger,
  HttpCode,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { ReconciliationService } from '../../database/services/reconciliation.service';
import { FinancialReportService } from '../../database/services/financial-report.service';
import { BalanceSheetService } from '../../database/services/balance-sheet.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import {
  ApiReconcileDto,
  ApiReconciliationResponseDto,
  ApiIncomeStatementQueryDto,
  ApiIncomeStatementResponseDto,
  ReconciliationSummaryResponseDto,
} from './dto';
import { BalanceSheetResponse } from '../../database/dto/balance-sheet.dto';
import {
  AuditLogQueryDto,
  AuditLogExportDto,
  PaginatedAuditLogResponseDto,
  AuditLogResponseDto,
} from '../../database/dto/audit-log.dto';

@Controller('reconciliation')
@ApiTags('Reconciliation')
@ApiBearerAuth('JWT-auth')
export class ReconciliationController {
  private readonly logger = new Logger(ReconciliationController.name);

  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly financialReportService: FinancialReportService,
    private readonly balanceSheetService: BalanceSheetService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Run bank reconciliation for period' })
  @ApiResponse({
    status: 201,
    type: ApiReconciliationResponseDto,
    description: 'Reconciled successfully',
  })
  @ApiResponse({
    status: 200,
    type: ApiReconciliationResponseDto,
    description: 'Reconciled with discrepancies',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format or period_end before period_start',
  })
  @ApiResponse({ status: 409, description: 'Period already reconciled' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async reconcile(
    @Body() dto: ApiReconcileDto,
    @CurrentUser() user: IUser,
  ): Promise<ApiReconciliationResponseDto> {
    this.logger.log(
      `Reconcile: tenant=${user.tenantId}, account=${dto.bank_account}, period=${dto.period_start} to ${dto.period_end}`,
    );

    // Transform API snake_case to service camelCase, Rands to cents
    const result = await this.reconciliationService.reconcile(
      {
        tenantId: user.tenantId,
        bankAccount: dto.bank_account,
        periodStart: dto.period_start,
        periodEnd: dto.period_end,
        openingBalanceCents: Math.round(dto.opening_balance * 100),
        closingBalanceCents: Math.round(dto.closing_balance * 100),
      },
      user.id,
    );

    this.logger.log(
      `Reconciliation ${result.id}: status=${result.status}, discrepancy=${result.discrepancyCents}c`,
    );

    // Transform service camelCase to API snake_case, cents to Rands
    return {
      success: true,
      data: {
        id: result.id,
        status: result.status,
        bank_account: dto.bank_account,
        period_start: dto.period_start,
        period_end: dto.period_end,
        opening_balance: result.openingBalanceCents / 100,
        closing_balance: result.closingBalanceCents / 100,
        calculated_balance: result.calculatedBalanceCents / 100,
        discrepancy: result.discrepancyCents / 100,
        matched_count: result.matchedCount,
        unmatched_count: result.unmatchedCount,
      },
    };
  }

  @Get('summary')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get reconciliation summary' })
  @ApiResponse({ status: 200, type: ReconciliationSummaryResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getSummary(
    @CurrentUser() user: IUser,
  ): Promise<ReconciliationSummaryResponseDto> {
    this.logger.log(`Reconciliation summary: tenant=${user.tenantId}`);

    // Query all reconciliations for this tenant
    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        user.tenantId,
      );

    // Calculate summary statistics from real data
    let totalReconciledCents = 0;
    let totalUnreconciledCents = 0;
    let totalDiscrepancyCents = 0;
    let lastReconciliationDate: Date | null = null;
    let reconciledCount = 0;

    for (const recon of reconciliations) {
      if (recon.status === 'RECONCILED') {
        totalReconciledCents += Math.abs(recon.closingBalanceCents);
        reconciledCount++;
        if (
          recon.reconciledAt &&
          (!lastReconciliationDate ||
            recon.reconciledAt > lastReconciliationDate)
        ) {
          lastReconciliationDate = recon.reconciledAt;
        }
      } else {
        totalUnreconciledCents += Math.abs(recon.closingBalanceCents);
      }
      totalDiscrepancyCents += Math.abs(recon.discrepancyCents);
    }

    const totalPeriods = reconciliations.length;
    const reconciliationRate =
      totalPeriods > 0 ? (reconciledCount / totalPeriods) * 100 : 0;

    return {
      success: true,
      data: {
        total_reconciled: totalReconciledCents / 100,
        total_unreconciled: totalUnreconciledCents / 100,
        last_reconciliation_date: lastReconciliationDate
          ? lastReconciliationDate.toISOString().split('T')[0]
          : null,
        reconciliation_rate: Math.round(reconciliationRate * 100) / 100,
        discrepancy_amount: totalDiscrepancyCents / 100,
        period_count: totalPeriods,
      },
    };
  }

  @Get('income-statement')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Generate Income Statement (Profit & Loss)' })
  @ApiResponse({ status: 200, type: ApiIncomeStatementResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format or period_end before period_start',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getIncomeStatement(
    @Query() query: ApiIncomeStatementQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<ApiIncomeStatementResponseDto> {
    this.logger.log(
      `Income Statement: tenant=${user.tenantId}, period=${query.period_start} to ${query.period_end}`,
    );

    // Transform API snake_case to service camelCase
    const periodStart = new Date(query.period_start);
    const periodEnd = new Date(query.period_end);

    const report = await this.financialReportService.generateIncomeStatement(
      user.tenantId,
      periodStart,
      periodEnd,
    );

    this.logger.log(
      `Income Statement generated: income=${report.income.totalCents}c, expenses=${report.expenses.totalCents}c`,
    );

    // Transform service camelCase to API snake_case
    const response: ApiIncomeStatementResponseDto = {
      success: true,
      data: {
        period: {
          start: report.period.start.toISOString().slice(0, 10), // YYYY-MM-DD
          end: report.period.end.toISOString().slice(0, 10),
        },
        income: {
          total: report.income.totalRands,
          breakdown: report.income.breakdown.map((b) => ({
            account_code: b.accountCode,
            account_name: b.accountName,
            amount: b.amountRands,
          })),
        },
        expenses: {
          total: report.expenses.totalRands,
          breakdown: report.expenses.breakdown.map((b) => ({
            account_code: b.accountCode,
            account_name: b.accountName,
            amount: b.amountRands,
          })),
        },
        net_profit: report.netProfitRands,
        generated_at: report.generatedAt.toISOString(),
      },
    };

    // Future: handle pdf/excel format by adding document_url
    if (query.format === 'pdf' || query.format === 'excel') {
      // For now, just return the data - PDF/Excel export is NOT_IMPLEMENTED in service
      response.data.document_url = `/reports/income-statement/download?format=${query.format}`;
    }

    return response;
  }

  @Get('balance-sheet')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Generate Balance Sheet (IFRS for SMEs)' })
  @ApiResponse({
    status: 200,
    description: 'Balance sheet generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getBalanceSheet(
    @Query('as_at_date') asAtDate: string,
    @CurrentUser() user: IUser,
  ): Promise<BalanceSheetResponse> {
    this.logger.log(
      `Balance Sheet: tenant=${user.tenantId}, as_at_date=${asAtDate}`,
    );

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const balanceSheet = await this.balanceSheetService.generate(
      user.tenantId,
      date,
    );

    this.logger.log(
      `Balance Sheet generated: assets=${balanceSheet.totalAssetsCents}c, balanced=${balanceSheet.isBalanced}`,
    );

    return {
      success: true,
      data: balanceSheet,
    };
  }

  @Get('balance-sheet/export')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Export Balance Sheet as PDF or Excel' })
  @ApiResponse({
    status: 200,
    description: 'Balance sheet exported successfully',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format or unsupported format',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async exportBalanceSheet(
    @Query('as_at_date') asAtDate: string,
    @Query('format') format: 'pdf' | 'xlsx',
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Balance Sheet Export: tenant=${user.tenantId}, as_at_date=${asAtDate}, format=${format}`,
    );

    // Validate format
    if (!['pdf', 'xlsx'].includes(format)) {
      throw new Error('Invalid format. Use "pdf" or "xlsx"');
    }

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    // Generate balance sheet
    const balanceSheet = await this.balanceSheetService.generate(
      user.tenantId,
      date,
    );

    // Export to requested format
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    if (format === 'pdf') {
      buffer = await this.balanceSheetService.exportToPdf(balanceSheet);
      mimeType = 'application/pdf';
      filename = `balance-sheet-${asAtDate}.pdf`;
    } else {
      buffer = await this.balanceSheetService.exportToExcel(balanceSheet);
      mimeType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `balance-sheet-${asAtDate}.xlsx`;
    }

    this.logger.log(
      `Balance Sheet exported: format=${format}, size=${buffer.length} bytes`,
    );

    // Set response headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer
    res.send(buffer);
  }

  // ============================================
  // TASK-RECON-034: Audit Log Endpoints
  // ============================================

  @Get('audit-logs')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get paginated audit logs with filtering' })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit logs returned',
    type: PaginatedAuditLogResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAuditLogs(
    @Query() query: AuditLogQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<PaginatedAuditLogResponseDto> {
    this.logger.log(
      `Audit logs: tenant=${user.tenantId}, offset=${query.offset}, limit=${query.limit}`,
    );

    const result = await this.auditLogService.findAll(user.tenantId, {
      offset: query.offset,
      limit: query.limit,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      entityType: query.entityType,
      action: query.action,
      userId: query.userId,
      entityId: query.entityId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      data: result.data as AuditLogResponseDto[],
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }

  @Get('audit-logs/export')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Export audit logs as CSV or JSON' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs exported successfully',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async exportAuditLogs(
    @Query() query: AuditLogExportDto,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Audit logs export: tenant=${user.tenantId}, format=${query.format}`,
    );

    const format = query.format || 'csv';
    const buffer = await this.auditLogService.export(
      user.tenantId,
      {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        entityType: query.entityType,
        action: query.action,
        userId: query.userId,
        entityId: query.entityId,
      },
      format,
    );

    const mimeType = format === 'json' ? 'application/json' : 'text/csv';
    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  }

  @Get('audit-logs/:id')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get a single audit log by ID' })
  @ApiParam({ name: 'id', description: 'Audit log ID' })
  @ApiResponse({
    status: 200,
    description: 'Audit log returned',
    type: AuditLogResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAuditLogById(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<AuditLogResponseDto> {
    this.logger.log(`Audit log by ID: tenant=${user.tenantId}, id=${id}`);

    const log = await this.auditLogService.getById(user.tenantId, id);
    return log as AuditLogResponseDto;
  }

  @Get('audit-logs/entity/:entityId')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get all audit logs for a specific entity' })
  @ApiParam({ name: 'entityId', description: 'Entity ID to filter by' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs returned',
    type: [AuditLogResponseDto],
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAuditLogsByEntityId(
    @Param('entityId') entityId: string,
    @CurrentUser() user: IUser,
  ): Promise<AuditLogResponseDto[]> {
    this.logger.log(
      `Audit logs by entity: tenant=${user.tenantId}, entityId=${entityId}`,
    );

    const logs = await this.auditLogService.getByEntityId(
      user.tenantId,
      entityId,
    );
    return logs as AuditLogResponseDto[];
  }
}
