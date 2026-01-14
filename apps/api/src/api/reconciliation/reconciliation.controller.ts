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
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { ReconciliationService } from '../../database/services/reconciliation.service';
import { FinancialReportService } from '../../database/services/financial-report.service';
import { BalanceSheetService } from '../../database/services/balance-sheet.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { BankStatementReconciliationService } from '../../database/services/bank-statement-reconciliation.service';
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
  ReconciliationListQueryDto,
  ReconciliationListResponseDto,
  ReconciliationListItemDto,
  DiscrepanciesResponseDto,
  DiscrepancyItemDto,
  DiscrepancySummaryDto,
} from './dto';
import { DiscrepancyService } from '../../database/services/discrepancy.service';
import { NotFoundException } from '../../shared/exceptions';
import { BalanceSheetResponse } from '../../database/dto/balance-sheet.dto';
import {
  AuditLogQueryDto,
  AuditLogExportDto,
  PaginatedAuditLogResponseDto,
  AuditLogResponseDto,
} from '../../database/dto/audit-log.dto';
import {
  ReconcileBankStatementDto,
  BankStatementReconciliationResponseDto,
  BankStatementMatchResponseDto,
  BankStatementMatchFilterDto,
} from '../../database/dto/bank-statement-reconciliation.dto';

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
    private readonly discrepancyService: DiscrepancyService,
    private readonly bankStatementReconciliationService: BankStatementReconciliationService,
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

  // ============================================
  // TASK-RECON-UI: List and Detail Endpoints
  // ============================================

  @Get()
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'List reconciliations with filtering and pagination',
  })
  @ApiResponse({
    status: 200,
    type: ReconciliationListResponseDto,
    description: 'Paginated list of reconciliations',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getReconciliations(
    @Query() query: ReconciliationListQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<ReconciliationListResponseDto> {
    this.logger.log(
      `List reconciliations: tenant=${user.tenantId}, bank_account=${query.bank_account ?? 'all'}, status=${query.status ?? 'all'}, page=${query.page}, limit=${query.limit}`,
    );

    // Transform API snake_case filter to service camelCase
    const filter = {
      bankAccount: query.bank_account,
      status: query.status as
        | 'IN_PROGRESS'
        | 'RECONCILED'
        | 'DISCREPANCY'
        | undefined,
    };

    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        user.tenantId,
      );

    // Apply filters manually since service returns all
    let filtered = reconciliations;
    if (filter.bankAccount) {
      filtered = filtered.filter((r) => r.bankAccount === filter.bankAccount);
    }
    if (filter.status) {
      filtered = filtered.filter((r) => r.status === filter.status);
    }

    // Calculate pagination - default to 100 to show full history
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = filtered.slice(startIndex, endIndex);

    // Transform to API response format (cents to Rands, camelCase to snake_case)
    // Note: matchedCount/unmatchedCount are computed during reconciliation but not stored in DB
    // For list view, we set them to 0 - use GET /:id for detailed counts if needed
    const data: ReconciliationListItemDto[] = paginatedResults.map((r) => ({
      id: r.id,
      status: r.status,
      bank_account: r.bankAccount,
      period_start: r.periodStart.toISOString().split('T')[0],
      period_end: r.periodEnd.toISOString().split('T')[0],
      opening_balance: r.openingBalanceCents / 100,
      closing_balance: r.closingBalanceCents / 100,
      calculated_balance: r.calculatedBalanceCents / 100,
      discrepancy: r.discrepancyCents / 100,
      matched_count: 0, // Not stored in DB, computed during reconciliation
      unmatched_count: 0, // Not stored in DB, computed during reconciliation
      reconciled_at: r.reconciledAt?.toISOString() ?? null,
      created_at: r.createdAt.toISOString(),
    }));

    return {
      success: true,
      data,
      total,
      page,
      limit,
    };
  }

  @Get('discrepancies')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get all discrepancies for review' })
  @ApiResponse({
    status: 200,
    type: DiscrepanciesResponseDto,
    description: 'List of discrepancies across all reconciliations',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getDiscrepancies(
    @CurrentUser() user: IUser,
  ): Promise<DiscrepanciesResponseDto> {
    this.logger.log(`Get discrepancies: tenant=${user.tenantId}`);

    // Get all reconciliations with discrepancies
    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        user.tenantId,
      );

    // Filter to those with status DISCREPANCY or non-zero discrepancy
    const withDiscrepancies = reconciliations.filter(
      (r) => r.status === 'DISCREPANCY' || r.discrepancyCents !== 0,
    );

    const allDiscrepancies: DiscrepancyItemDto[] = [];
    let totalInBankNotXero = 0;
    let totalInXeroNotBank = 0;
    let totalAmountMismatches = 0;
    let totalDateMismatches = 0;
    let totalAmountCents = 0;

    // Detect discrepancies for each reconciliation
    for (const recon of withDiscrepancies) {
      try {
        const report = await this.discrepancyService.detectDiscrepancies(
          user.tenantId,
          recon.id,
        );

        // Transform discrepancies to API format
        for (const d of report.discrepancies) {
          allDiscrepancies.push({
            id:
              d.transactionId ??
              `discrepancy-${recon.id}-${allDiscrepancies.length}`,
            reconciliation_id: recon.id,
            type: d.type,
            description: d.description,
            amount: d.amountCents / 100,
            severity: d.severity.toLowerCase() as 'low' | 'medium' | 'high',
            period_start: recon.periodStart.toISOString().split('T')[0],
            period_end: recon.periodEnd.toISOString().split('T')[0],
            bank_account: recon.bankAccount,
            transaction_date: d.date?.toISOString().split('T')[0] ?? null,
            xero_transaction_id: d.xeroTransactionId ?? null,
          });
        }

        // Accumulate summary
        totalInBankNotXero += report.summary.inBankNotXero;
        totalInXeroNotBank += report.summary.inXeroNotBank;
        totalAmountMismatches += report.summary.amountMismatches;
        totalDateMismatches += report.summary.dateMismatches;
        totalAmountCents += report.totalDiscrepancyCents;
      } catch (error) {
        // Log but continue processing other reconciliations
        this.logger.warn(
          `Failed to detect discrepancies for reconciliation ${recon.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const summary: DiscrepancySummaryDto = {
      in_bank_not_xero: totalInBankNotXero,
      in_xero_not_bank: totalInXeroNotBank,
      amount_mismatches: totalAmountMismatches,
      date_mismatches: totalDateMismatches,
      total_count: allDiscrepancies.length,
      total_amount: totalAmountCents / 100,
    };

    this.logger.log(
      `Found ${allDiscrepancies.length} discrepancies, total amount: R${summary.total_amount}`,
    );

    return {
      success: true,
      data: allDiscrepancies,
      summary,
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
    // Bank balance should be the LATEST reconciled period's closing balance, not the sum
    // This is because each period's closing balance already includes previous periods
    let totalReconciledCents = 0;
    let totalUnreconciledCents = 0;
    let totalDiscrepancyCents = 0;
    let lastReconciliationDate: Date | null = null;
    let reconciledCount = 0;

    // Sort reconciliations by period end date to find the latest
    const sortedReconciliations = [...reconciliations].sort(
      (a, b) => b.periodEnd.getTime() - a.periodEnd.getTime(),
    );

    // Find latest reconciled period for bank balance
    const latestReconciled = sortedReconciliations.find(
      (r) => r.status === 'RECONCILED',
    );
    if (latestReconciled) {
      // Use only the latest closing balance (not cumulative sum)
      totalReconciledCents = Math.abs(latestReconciled.closingBalanceCents);
    }

    // Find latest unreconciled period for unreconciled balance
    const latestUnreconciled = sortedReconciliations.find(
      (r) => r.status !== 'RECONCILED',
    );
    if (latestUnreconciled) {
      totalUnreconciledCents = Math.abs(latestUnreconciled.closingBalanceCents);
    }

    for (const recon of reconciliations) {
      if (recon.status === 'RECONCILED') {
        reconciledCount++;
        if (
          recon.reconciledAt &&
          (!lastReconciliationDate ||
            recon.reconciledAt > lastReconciliationDate)
        ) {
          lastReconciliationDate = recon.reconciledAt;
        }
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
      response.data.document_url = `/api/reconciliation/income-statement/export?period_start=${query.period_start}&period_end=${query.period_end}&format=${query.format === 'excel' ? 'xlsx' : 'pdf'}`;
    }

    return response;
  }

  @Get('income-statement/export')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Export Income Statement as PDF or Excel' })
  @ApiResponse({
    status: 200,
    description: 'Income statement exported successfully',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format or unsupported format',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async exportIncomeStatement(
    @Query('period_start') periodStart: string,
    @Query('period_end') periodEnd: string,
    @Query('format') format: 'pdf' | 'xlsx',
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Income Statement Export: tenant=${user.tenantId}, period=${periodStart} to ${periodEnd}, format=${format}`,
    );

    // Validate format
    if (!['pdf', 'xlsx'].includes(format)) {
      throw new BadRequestException('Invalid format. Use "pdf" or "xlsx"');
    }

    // Parse and validate dates
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Generate income statement
    const report = await this.financialReportService.generateIncomeStatement(
      user.tenantId,
      start,
      end,
    );

    // Export to requested format
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    const tenantName = 'CrecheBooks'; // Default branding

    if (format === 'pdf') {
      buffer = await this.financialReportService.exportIncomeStatementPDF(
        report,
        tenantName,
      );
      mimeType = 'application/pdf';
      filename = `income-statement-${periodStart}-${periodEnd}.pdf`;
    } else {
      buffer = await this.financialReportService.exportIncomeStatementExcel(
        report,
        tenantName,
      );
      mimeType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `income-statement-${periodStart}-${periodEnd}.xlsx`;
    }

    this.logger.log(
      `Income Statement exported: format=${format}, size=${buffer.length} bytes`,
    );

    // Set response headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer
    res.send(buffer);
  }

  @Get('trial-balance')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Generate Trial Balance' })
  @ApiResponse({
    status: 200,
    description: 'Trial balance generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getTrialBalance(
    @Query('as_at_date') asAtDate: string,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `Trial Balance: tenant=${user.tenantId}, as_at_date=${asAtDate}`,
    );

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    const trialBalance = await this.financialReportService.generateTrialBalance(
      user.tenantId,
      date,
    );

    this.logger.log(
      `Trial Balance generated: accounts=${trialBalance.accounts.length}, balanced=${trialBalance.isBalanced}`,
    );

    return {
      success: true,
      data: {
        as_at_date: trialBalance.asOfDate.toISOString().slice(0, 10),
        accounts: trialBalance.accounts.map((acc) => ({
          account_code: acc.accountCode,
          account_name: acc.accountName,
          debit: acc.debitRands,
          credit: acc.creditRands,
        })),
        totals: {
          debits: trialBalance.totals.debitsRands,
          credits: trialBalance.totals.creditsRands,
        },
        is_balanced: trialBalance.isBalanced,
        generated_at: trialBalance.generatedAt.toISOString(),
      },
    };
  }

  @Get('trial-balance/export')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Export Trial Balance as PDF or Excel' })
  @ApiResponse({
    status: 200,
    description: 'Trial balance exported successfully',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format or unsupported format',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async exportTrialBalance(
    @Query('as_at_date') asAtDate: string,
    @Query('format') format: 'pdf' | 'xlsx',
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Trial Balance Export: tenant=${user.tenantId}, as_at_date=${asAtDate}, format=${format}`,
    );

    // Validate format
    if (!['pdf', 'xlsx'].includes(format)) {
      throw new BadRequestException('Invalid format. Use "pdf" or "xlsx"');
    }

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Generate trial balance
    const trialBalance = await this.financialReportService.generateTrialBalance(
      user.tenantId,
      date,
    );

    // Export to requested format
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    const tenantName = 'CrecheBooks'; // Default branding

    if (format === 'pdf') {
      buffer = await this.financialReportService.exportTrialBalancePDF(
        trialBalance,
        tenantName,
      );
      mimeType = 'application/pdf';
      filename = `trial-balance-${asAtDate}.pdf`;
    } else {
      buffer = await this.financialReportService.exportTrialBalanceExcel(
        trialBalance,
        tenantName,
      );
      mimeType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `trial-balance-${asAtDate}.xlsx`;
    }

    this.logger.log(
      `Trial Balance exported: format=${format}, size=${buffer.length} bytes`,
    );

    // Set response headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer
    res.send(buffer);
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
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
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
      throw new BadRequestException('Invalid format. Use "pdf" or "xlsx"');
    }

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
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

  // ============================================
  // TASK-RECON-019: Bank Statement Reconciliation
  // ============================================

  @Post('bank-statement')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Reconcile bank statement PDF with Xero transactions',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        bank_account: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    type: BankStatementReconciliationResponseDto,
    description: 'Bank statement reconciled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid PDF or could not extract statement data',
  })
  @ApiResponse({
    status: 409,
    description: 'Period already reconciled',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async reconcileBankStatement(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ReconcileBankStatementDto,
    @CurrentUser() user: IUser,
  ): Promise<BankStatementReconciliationResponseDto> {
    if (!file) {
      throw new BadRequestException('Bank statement PDF file is required');
    }

    this.logger.log(
      `Bank statement reconciliation: tenant=${user.tenantId}, file=${file.originalname}, size=${file.size}`,
    );

    const result =
      await this.bankStatementReconciliationService.reconcileStatement(
        user.tenantId,
        dto.bank_account,
        file.buffer,
        user.id,
      );

    // Get all matches for response
    const matches =
      await this.bankStatementReconciliationService.getMatchesByReconciliationId(
        user.tenantId,
        result.reconciliationId,
      );

    return {
      success: true,
      data: {
        reconciliation_id: result.reconciliationId,
        period_start: result.statementPeriod.start.toISOString().split('T')[0],
        period_end: result.statementPeriod.end.toISOString().split('T')[0],
        opening_balance: result.openingBalanceCents / 100,
        closing_balance: result.closingBalanceCents / 100,
        calculated_balance: result.calculatedBalanceCents / 100,
        discrepancy: result.discrepancyCents / 100,
        match_summary: {
          matched: result.matchSummary.matched,
          in_bank_only: result.matchSummary.inBankOnly,
          in_xero_only: result.matchSummary.inXeroOnly,
          amount_mismatch: result.matchSummary.amountMismatch,
          date_mismatch: result.matchSummary.dateMismatch,
          total: result.matchSummary.total,
        },
        status: result.status,
        matches: matches.map((m) => ({
          id: m.id,
          bank_date: m.bankDate.toISOString().split('T')[0],
          bank_description: m.bankDescription,
          bank_amount: m.bankAmountCents / 100,
          bank_is_credit: m.bankIsCredit,
          transaction_id: m.transactionId,
          xero_date: m.xeroDate?.toISOString().split('T')[0] ?? null,
          xero_description: m.xeroDescription,
          xero_amount: m.xeroAmountCents ? m.xeroAmountCents / 100 : null,
          xero_is_credit: m.xeroIsCredit,
          status: m.status,
          match_confidence: m.matchConfidence
            ? Number(m.matchConfidence)
            : null,
          discrepancy_reason: m.discrepancyReason,
        })),
      },
    };
  }

  @Get(':id/matches')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get bank statement matches for a reconciliation' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'List of bank statement matches',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getReconciliationMatches(
    @Param('id') reconciliationId: string,
    @Query() query: BankStatementMatchFilterDto,
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    data: BankStatementMatchResponseDto[];
    total: number;
  }> {
    const matches =
      await this.bankStatementReconciliationService.getMatchesByReconciliationId(
        user.tenantId,
        reconciliationId,
      );

    // Apply status filter if provided
    let filtered = matches;
    if (query.status) {
      filtered = filtered.filter((m) => m.status === query.status);
    }

    // Apply pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const startIndex = (page - 1) * limit;
    const paginatedMatches = filtered.slice(startIndex, startIndex + limit);

    return {
      success: true,
      data: paginatedMatches.map((m) => ({
        id: m.id,
        bank_date: m.bankDate.toISOString().split('T')[0],
        bank_description: m.bankDescription,
        bank_amount: m.bankAmountCents / 100,
        bank_is_credit: m.bankIsCredit,
        transaction_id: m.transactionId,
        xero_date: m.xeroDate?.toISOString().split('T')[0] ?? null,
        xero_description: m.xeroDescription,
        xero_amount: m.xeroAmountCents ? m.xeroAmountCents / 100 : null,
        xero_is_credit: m.xeroIsCredit,
        status: m.status,
        match_confidence: m.matchConfidence ? Number(m.matchConfidence) : null,
        discrepancy_reason: m.discrepancyReason,
      })),
      total: filtered.length,
    };
  }

  @Get(':id/unmatched')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get unmatched transactions for a reconciliation' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getUnmatchedTransactions(
    @Param('id') reconciliationId: string,
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    data: {
      in_bank_only: Array<{
        date: string;
        description: string;
        amount: number;
      }>;
      in_xero_only: Array<{
        date: string;
        description: string;
        amount: number;
        transaction_id: string;
      }>;
    };
  }> {
    const unmatched =
      await this.bankStatementReconciliationService.getUnmatchedSummary(
        user.tenantId,
        reconciliationId,
      );

    return {
      success: true,
      data: {
        in_bank_only: unmatched.inBankOnly.map((t) => ({
          date: t.date.toISOString().split('T')[0],
          description: t.description,
          amount: t.amount,
        })),
        in_xero_only: unmatched.inXeroOnly.map((t) => ({
          date: t.date.toISOString().split('T')[0],
          description: t.description,
          amount: t.amount,
          transaction_id: t.transactionId,
        })),
      },
    };
  }

  @Post(':id/matches/:matchId/manual-match')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Manually match a bank statement record with a transaction' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  @ApiParam({ name: 'matchId', description: 'Bank statement match ID' })
  @ApiResponse({
    status: 200,
    description: 'Match updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Match or transaction not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async manualMatch(
    @Param('id') reconciliationId: string,
    @Param('matchId') matchId: string,
    @Body() body: { transaction_id: string },
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    data: {
      id: string;
      status: string;
      match_confidence: number | null;
    };
  }> {
    this.logger.log(
      `Manual match: reconciliation=${reconciliationId}, match=${matchId}, transaction=${body.transaction_id}`,
    );

    const result = await this.bankStatementReconciliationService.manualMatch(
      user.tenantId,
      matchId,
      body.transaction_id,
    );

    return {
      success: true,
      data: {
        id: result.id,
        status: result.status,
        match_confidence: result.matchConfidence,
      },
    };
  }

  @Post(':id/matches/:matchId/unmatch')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Unmatch a previously matched bank statement record' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  @ApiParam({ name: 'matchId', description: 'Bank statement match ID' })
  @ApiResponse({
    status: 200,
    description: 'Match unlinked successfully',
  })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async unmatch(
    @Param('id') reconciliationId: string,
    @Param('matchId') matchId: string,
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    data: {
      id: string;
      status: string;
    };
  }> {
    this.logger.log(
      `Unmatch: reconciliation=${reconciliationId}, match=${matchId}`,
    );

    const result = await this.bankStatementReconciliationService.unmatch(
      user.tenantId,
      matchId,
    );

    return {
      success: true,
      data: {
        id: result.id,
        status: result.status,
      },
    };
  }

  @Get(':id/available-transactions')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get available transactions for manual matching' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAvailableTransactions(
    @Param('id') reconciliationId: string,
    @Query('search') searchTerm: string | undefined,
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      is_credit: boolean;
    }>;
  }> {
    const transactions =
      await this.bankStatementReconciliationService.getAvailableTransactionsForMatching(
        user.tenantId,
        reconciliationId,
        { searchTerm },
      );

    return {
      success: true,
      data: transactions.map((t) => ({
        id: t.id,
        date: t.date.toISOString().split('T')[0],
        description: t.description,
        amount: t.amountCents / 100,
        is_credit: t.isCredit,
      })),
    };
  }

  // ============================================
  // TASK-RECON-UI: Get Reconciliation by ID
  // NOTE: This must be LAST to avoid matching specific routes like 'summary', 'discrepancies'
  // ============================================

  @Get(':id')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get single reconciliation by ID' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  @ApiResponse({
    status: 200,
    type: ApiReconciliationResponseDto,
    description: 'Reconciliation details',
  })
  @ApiResponse({ status: 404, description: 'Reconciliation not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getReconciliationById(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<ApiReconciliationResponseDto> {
    this.logger.log(
      `Get reconciliation by ID: tenant=${user.tenantId}, id=${id}`,
    );

    // Use the repository to find by ID
    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        user.tenantId,
      );

    const reconciliation = reconciliations.find((r) => r.id === id);

    if (!reconciliation) {
      throw new NotFoundException('Reconciliation', id);
    }

    // Verify tenant ownership (already filtered by tenant above, but explicit check)
    if (reconciliation.tenantId !== user.tenantId) {
      throw new NotFoundException('Reconciliation', id);
    }

    // Get matches to compute summary counts
    const matches =
      await this.bankStatementReconciliationService.getMatchesByReconciliationId(
        user.tenantId,
        id,
      );

    // Compute match summary from actual match data
    const matchSummary = {
      matched: matches.filter((m) => m.status === 'MATCHED').length,
      inBankOnly: matches.filter((m) => m.status === 'IN_BANK_ONLY').length,
      inXeroOnly: matches.filter((m) => m.status === 'IN_XERO_ONLY').length,
      amountMismatch: matches.filter((m) => m.status === 'AMOUNT_MISMATCH')
        .length,
      dateMismatch: matches.filter((m) => m.status === 'DATE_MISMATCH').length,
      total: matches.length,
    };

    // Transform to API response (cents to Rands, camelCase to snake_case)
    return {
      success: true,
      data: {
        id: reconciliation.id,
        status: reconciliation.status,
        bank_account: reconciliation.bankAccount,
        period_start: reconciliation.periodStart.toISOString().split('T')[0],
        period_end: reconciliation.periodEnd.toISOString().split('T')[0],
        opening_balance: reconciliation.openingBalanceCents / 100,
        closing_balance: reconciliation.closingBalanceCents / 100,
        calculated_balance: reconciliation.calculatedBalanceCents / 100,
        discrepancy: reconciliation.discrepancyCents / 100,
        matched_count: matchSummary.matched,
        unmatched_count:
          matchSummary.inBankOnly +
          matchSummary.inXeroOnly +
          matchSummary.amountMismatch +
          matchSummary.dateMismatch,
        match_summary: {
          matched: matchSummary.matched,
          in_bank_only: matchSummary.inBankOnly,
          in_xero_only: matchSummary.inXeroOnly,
          amount_mismatch: matchSummary.amountMismatch,
          date_mismatch: matchSummary.dateMismatch,
          total: matchSummary.total,
        },
      },
    };
  }
}
