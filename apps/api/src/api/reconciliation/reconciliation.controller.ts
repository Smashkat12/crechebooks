/**
 * Reconciliation Controller
 * TASK-RECON-031: Reconciliation Controller
 * TASK-RECON-032: Financial Reports Endpoint
 * TASK-RECON-033: Balance Sheet API Endpoint
 * TASK-RECON-034: Audit Log Pagination and Filtering
 * TASK-RECON-036: Comparative Balance Sheet
 *
 * Handles bank reconciliation and financial reporting operations.
 * Uses snake_case for external API, transforms to camelCase for internal services.
 */
import {
  Controller,
  Post,
  Get,
  Patch,
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
import { getTenantId } from '../auth/utils/tenant-assertions';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
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
import { ComparativeBalanceSheetService } from '../../database/services/comparative-balance-sheet.service';
import { AccruedBankChargeService } from '../../database/services/accrued-bank-charge.service';
import { XeroTransactionSplitService } from '../../database/services/xero-transaction-split.service';
import { FeeInflationCorrectionService } from '../../database/services/fee-inflation-correction.service';
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
  ComparativeBalanceSheetResponse,
  OpeningBalancesResult,
} from '../../database/dto/comparative-balance-sheet.dto';
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
import {
  SuggestSplitMatchDto,
  ConfirmSplitMatchDto,
  RejectSplitMatchDto,
  SplitMatchFilterDto,
  SplitMatchResponseDto,
  SuggestSplitMatchResponseDto,
  ConfirmSplitMatchResponseDto,
  SplitMatchListResponseDto,
} from '../../database/dto/split-transaction.dto';
import {
  CreateAccruedBankChargeDto,
  MatchAccruedChargeDto,
  UpdateAccruedChargeStatusDto,
  AccruedChargeFilterDto,
  AccruedBankChargeResponseDto,
  AccruedChargeSummaryDto,
} from '../../database/dto/accrued-bank-charge.dto';
import { SplitTransactionMatcherService } from '../../database/services/split-transaction-matcher.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  SplitXeroTransactionDto,
  DetectSplitParamsDto,
  ConfirmXeroSplitDto,
  CancelXeroSplitDto,
  XeroSplitFilterDto,
} from '../../database/dto/xero-transaction-split.dto';

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
    private readonly comparativeBalanceSheetService: ComparativeBalanceSheetService,
    private readonly splitTransactionMatcherService: SplitTransactionMatcherService,
    private readonly accruedBankChargeService: AccruedBankChargeService,
    private readonly xeroTransactionSplitService: XeroTransactionSplitService,
    private readonly feeInflationCorrectionService: FeeInflationCorrectionService,
    private readonly prisma: PrismaService,
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
      `Reconcile: tenant=${getTenantId(user)}, account=${dto.bank_account}, period=${dto.period_start} to ${dto.period_end}`,
    );

    // Transform API snake_case to service camelCase, Rands to cents
    const result = await this.reconciliationService.reconcile(
      {
        tenantId: getTenantId(user),
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
      `List reconciliations: tenant=${getTenantId(user)}, bank_account=${query.bank_account ?? 'all'}, status=${query.status ?? 'all'}, page=${query.page}, limit=${query.limit}`,
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
        getTenantId(user),
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
    this.logger.log(`Get discrepancies: tenant=${getTenantId(user)}`);

    // Get all reconciliations with discrepancies
    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        getTenantId(user),
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
          getTenantId(user),
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
    this.logger.log(`Reconciliation summary: tenant=${getTenantId(user)}`);

    // Query all reconciliations for this tenant
    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        getTenantId(user),
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
      `Income Statement: tenant=${getTenantId(user)}, period=${query.period_start} to ${query.period_end}`,
    );

    // Transform API snake_case to service camelCase
    const periodStart = new Date(query.period_start);
    const periodEnd = new Date(query.period_end);

    const report = await this.financialReportService.generateIncomeStatement(
      getTenantId(user),
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
      `Income Statement Export: tenant=${getTenantId(user)}, period=${periodStart} to ${periodEnd}, format=${format}`,
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
      getTenantId(user),
      start,
      end,
    );

    // Export to requested format
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    // Fetch tenant name for white-labeling
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: getTenantId(user) },
      select: { name: true, tradingName: true },
    });
    const tenantName =
      tenant?.tradingName ?? tenant?.name ?? 'Financial Report';

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
      `Trial Balance: tenant=${getTenantId(user)}, as_at_date=${asAtDate}`,
    );

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    const trialBalance = await this.financialReportService.generateTrialBalance(
      getTenantId(user),
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
      `Trial Balance Export: tenant=${getTenantId(user)}, as_at_date=${asAtDate}, format=${format}`,
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
      getTenantId(user),
      date,
    );

    // Export to requested format
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    // Fetch tenant name for white-labeling
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: getTenantId(user) },
      select: { name: true, tradingName: true },
    });
    const tenantName =
      tenant?.tradingName ?? tenant?.name ?? 'Financial Report';

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
      `Balance Sheet: tenant=${getTenantId(user)}, as_at_date=${asAtDate}`,
    );

    // Parse and validate date
    const date = new Date(asAtDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    const balanceSheet = await this.balanceSheetService.generate(
      getTenantId(user),
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
      `Balance Sheet Export: tenant=${getTenantId(user)}, as_at_date=${asAtDate}, format=${format}`,
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
      getTenantId(user),
      date,
    );

    // Export to requested format
    let buffer: Buffer;
    let mimeType: string;
    let filename: string;

    // Fetch tenant name for white-labeling
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: getTenantId(user) },
      select: { name: true, tradingName: true },
    });
    const tenantName = tenant?.tradingName ?? tenant?.name ?? 'Balance Sheet';

    if (format === 'pdf') {
      buffer = await this.balanceSheetService.exportToPdf(
        balanceSheet,
        tenantName,
      );
      mimeType = 'application/pdf';
      filename = `balance-sheet-${asAtDate}.pdf`;
    } else {
      buffer = await this.balanceSheetService.exportToExcel(
        balanceSheet,
        tenantName,
      );
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
  // TASK-RECON-036: Comparative Balance Sheet
  // ============================================

  @Get('balance-sheet/comparative')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Generate Comparative Balance Sheet with variance analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Comparative balance sheet generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format or missing required parameters',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getComparativeBalanceSheet(
    @Query('current_date') currentDate: string,
    @Query('prior_date') priorDate: string,
    @CurrentUser() user: IUser,
  ): Promise<ComparativeBalanceSheetResponse> {
    this.logger.log(
      `Comparative Balance Sheet: tenant=${getTenantId(user)}, current_date=${currentDate}, prior_date=${priorDate}`,
    );

    // Validate required parameters
    if (!currentDate || !priorDate) {
      throw new BadRequestException(
        'Both current_date and prior_date are required',
      );
    }

    // Parse and validate dates
    const current = new Date(currentDate);
    const prior = new Date(priorDate);

    if (isNaN(current.getTime())) {
      throw new BadRequestException(
        'Invalid current_date format. Use YYYY-MM-DD',
      );
    }

    if (isNaN(prior.getTime())) {
      throw new BadRequestException(
        'Invalid prior_date format. Use YYYY-MM-DD',
      );
    }

    if (prior >= current) {
      throw new BadRequestException('prior_date must be before current_date');
    }

    const comparative =
      await this.comparativeBalanceSheetService.generateComparative(
        getTenantId(user),
        current,
        prior,
      );

    this.logger.log(
      `Comparative Balance Sheet generated: asset_variance=${comparative.variances.assets.totalVarianceCents}c, compliant=${comparative.complianceStatus.isCompliant}`,
    );

    return {
      success: true,
      data: comparative,
    };
  }

  @Get('balance-sheet/opening-balances')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get opening balances for a period',
  })
  @ApiResponse({
    status: 200,
    description: 'Opening balances retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date format',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getOpeningBalances(
    @Query('period_start_date') periodStartDate: string,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: OpeningBalancesResult }> {
    this.logger.log(
      `Opening Balances: tenant=${getTenantId(user)}, period_start_date=${periodStartDate}`,
    );

    // Validate required parameter
    if (!periodStartDate) {
      throw new BadRequestException('period_start_date is required');
    }

    // Parse and validate date
    const startDate = new Date(periodStartDate);
    if (isNaN(startDate.getTime())) {
      throw new BadRequestException(
        'Invalid period_start_date format. Use YYYY-MM-DD',
      );
    }

    const openingBalances =
      await this.comparativeBalanceSheetService.getOpeningBalances(
        getTenantId(user),
        startDate,
      );

    this.logger.log(
      `Opening Balances retrieved: total_assets=${openingBalances.totalAssetsCents}c`,
    );

    return {
      success: true,
      data: openingBalances,
    };
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
      `Audit logs: tenant=${getTenantId(user)}, offset=${query.offset}, limit=${query.limit}`,
    );

    const result = await this.auditLogService.findAll(getTenantId(user), {
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
      `Audit logs export: tenant=${getTenantId(user)}, format=${query.format}`,
    );

    const format = query.format || 'csv';
    const buffer = await this.auditLogService.export(
      getTenantId(user),
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
    this.logger.log(`Audit log by ID: tenant=${getTenantId(user)}, id=${id}`);

    const log = await this.auditLogService.getById(getTenantId(user), id);
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
      `Audit logs by entity: tenant=${getTenantId(user)}, entityId=${entityId}`,
    );

    const logs = await this.auditLogService.getByEntityId(
      getTenantId(user),
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
      `Bank statement reconciliation: tenant=${getTenantId(user)}, file=${file.originalname}, size=${file.size}`,
    );

    const result =
      await this.bankStatementReconciliationService.reconcileStatement(
        getTenantId(user),
        dto.bank_account,
        file.buffer,
        user.id,
      );

    // Get all matches for response
    const matches =
      await this.bankStatementReconciliationService.getMatchesByReconciliationId(
        getTenantId(user),
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
          fee_adjusted_match: result.matchSummary.feeAdjusted,
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
        getTenantId(user),
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
        getTenantId(user),
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
  @ApiOperation({
    summary: 'Manually match a bank statement record with a transaction',
  })
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
      getTenantId(user),
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
  @ApiOperation({
    summary: 'Unmatch a previously matched bank statement record',
  })
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
      getTenantId(user),
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
        getTenantId(user),
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
  // TASK-RECON-035: Split Transaction Matching
  // ============================================

  @Post('split-matches/suggest')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Suggest split matches for a bank transaction',
    description:
      'Uses subset sum algorithm to find invoice combinations that match the transaction amount within tolerance',
  })
  @ApiResponse({
    status: 200,
    type: SuggestSplitMatchResponseDto,
    description: 'Split match suggestions',
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async suggestSplitMatches(
    @Body() dto: SuggestSplitMatchDto,
    @CurrentUser() user: IUser,
  ): Promise<SuggestSplitMatchResponseDto> {
    this.logger.log(
      `Suggest split matches: tenant=${getTenantId(user)}, transaction=${dto.bank_transaction_id}, amount=${dto.amount_cents}c`,
    );

    const suggestions =
      await this.splitTransactionMatcherService.suggestSplitMatches(
        getTenantId(user),
        dto,
      );

    return {
      success: true,
      suggestions,
      total_suggestions: suggestions.length,
    };
  }

  @Post('split-matches/confirm')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Confirm a split match and create payments',
    description:
      'Confirms a split match suggestion, creates payment records, and updates invoice statuses',
  })
  @ApiResponse({
    status: 200,
    type: ConfirmSplitMatchResponseDto,
    description: 'Split match confirmed',
  })
  @ApiResponse({
    status: 400,
    description: 'Split match already confirmed or rejected',
  })
  @ApiResponse({ status: 404, description: 'Split match not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async confirmSplitMatch(
    @Body() dto: ConfirmSplitMatchDto,
    @CurrentUser() user: IUser,
  ): Promise<ConfirmSplitMatchResponseDto> {
    this.logger.log(
      `Confirm split match: tenant=${getTenantId(user)}, match=${dto.split_match_id}`,
    );

    const result = await this.splitTransactionMatcherService.confirmSplitMatch(
      getTenantId(user),
      dto,
      user.id,
    );

    return {
      success: true,
      split_match: result.splitMatch,
      invoices_paid: result.invoicesPaid,
      payments_created: result.paymentsCreated,
    };
  }

  @Post('split-matches/reject')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Reject a split match suggestion',
  })
  @ApiResponse({
    status: 200,
    type: SplitMatchResponseDto,
    description: 'Split match rejected',
  })
  @ApiResponse({
    status: 400,
    description: 'Split match already confirmed or rejected',
  })
  @ApiResponse({ status: 404, description: 'Split match not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async rejectSplitMatch(
    @Body() dto: RejectSplitMatchDto,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; split_match: SplitMatchResponseDto }> {
    this.logger.log(
      `Reject split match: tenant=${getTenantId(user)}, match=${dto.split_match_id}`,
    );

    const splitMatch =
      await this.splitTransactionMatcherService.rejectSplitMatch(
        getTenantId(user),
        dto.split_match_id,
        dto.reason,
      );

    return {
      success: true,
      split_match: splitMatch,
    };
  }

  @Get('split-matches')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'List split matches with filtering and pagination',
  })
  @ApiResponse({
    status: 200,
    type: SplitMatchListResponseDto,
    description: 'Paginated list of split matches',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listSplitMatches(
    @Query() filter: SplitMatchFilterDto,
    @CurrentUser() user: IUser,
  ): Promise<SplitMatchListResponseDto> {
    this.logger.log(
      `List split matches: tenant=${getTenantId(user)}, status=${filter.status}, type=${filter.match_type}`,
    );

    const result = await this.splitTransactionMatcherService.getSplitMatches(
      getTenantId(user),
      filter,
    );

    return {
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      total_pages: result.totalPages,
    };
  }

  @Get('split-matches/:splitMatchId')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get a single split match by ID',
  })
  @ApiParam({ name: 'splitMatchId', description: 'Split match ID' })
  @ApiResponse({
    status: 200,
    type: SplitMatchResponseDto,
    description: 'Split match details',
  })
  @ApiResponse({ status: 404, description: 'Split match not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getSplitMatchById(
    @Param('splitMatchId') splitMatchId: string,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: SplitMatchResponseDto }> {
    this.logger.log(
      `Get split match by ID: tenant=${getTenantId(user)}, id=${splitMatchId}`,
    );

    const splitMatch =
      await this.splitTransactionMatcherService.getSplitMatchById(
        getTenantId(user),
        splitMatchId,
      );

    return {
      success: true,
      data: splitMatch,
    };
  }

  // ============================================
  // TASK-RECON-036: Accrued Bank Charges
  // Handles fee-adjusted matches where Bank NET + Accrued Fee = Xero GROSS
  // ============================================

  @Get('accrued-charges')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'List accrued bank charges with filtering and pagination',
    description:
      'Returns accrued fees shown on bank statements but charged in following period',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of accrued charges',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAccruedCharges(
    @Query() filter: AccruedChargeFilterDto,
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    data: AccruedBankChargeResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    this.logger.log(
      `List accrued charges: tenant=${getTenantId(user)}, status=${filter.status ?? 'all'}, fee_type=${filter.fee_type ?? 'all'}`,
    );

    const result = await this.accruedBankChargeService.listAccruedCharges(
      getTenantId(user),
      filter,
    );

    return {
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Get('accrued-charges/summary')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get accrued bank charges summary statistics',
    description:
      'Returns summary of accrued charges by status and fee type with totals',
  })
  @ApiResponse({
    status: 200,
    description: 'Accrued charges summary',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAccruedChargesSummary(
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: AccruedChargeSummaryDto }> {
    this.logger.log(`Accrued charges summary: tenant=${getTenantId(user)}`);

    const summary = await this.accruedBankChargeService.getSummary(
      getTenantId(user),
    );

    return {
      success: true,
      data: summary,
    };
  }

  @Get('accrued-charges/:chargeId')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get a single accrued charge by ID' })
  @ApiParam({ name: 'chargeId', description: 'Accrued charge ID' })
  @ApiResponse({
    status: 200,
    description: 'Accrued charge details',
  })
  @ApiResponse({ status: 404, description: 'Accrued charge not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getAccruedChargeById(
    @Param('chargeId') chargeId: string,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: AccruedBankChargeResponseDto }> {
    this.logger.log(
      `Get accrued charge by ID: tenant=${getTenantId(user)}, id=${chargeId}`,
    );

    const charge = await this.accruedBankChargeService.getAccruedCharge(
      getTenantId(user),
      chargeId,
    );

    return {
      success: true,
      data: charge,
    };
  }

  @Post('accrued-charges')
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Create an accrued bank charge record',
    description:
      'Records a fee shown on bank statement that will be charged in the next billing period',
  })
  @ApiResponse({
    status: 201,
    description: 'Accrued charge created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async createAccruedCharge(
    @Body() dto: CreateAccruedBankChargeDto,
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: AccruedBankChargeResponseDto }> {
    this.logger.log(
      `Create accrued charge: tenant=${getTenantId(user)}, fee_type=${dto.fee_type}, amount=${dto.accrued_amount_cents}c`,
    );

    const charge = await this.accruedBankChargeService.createAccruedCharge(
      getTenantId(user),
      dto,
    );

    return {
      success: true,
      data: charge,
    };
  }

  @Post('accrued-charges/:chargeId/match')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Match accrued charge to actual fee transaction',
    description:
      'Links the accrued charge to the actual bank fee transaction when it appears',
  })
  @ApiParam({ name: 'chargeId', description: 'Accrued charge ID' })
  @ApiResponse({
    status: 200,
    description: 'Accrued charge matched successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Charge already matched or invalid transaction',
  })
  @ApiResponse({ status: 404, description: 'Accrued charge not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async matchAccruedCharge(
    @Param('chargeId') chargeId: string,
    @Body() body: { charge_transaction_id: string; charge_date?: string },
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: AccruedBankChargeResponseDto }> {
    this.logger.log(
      `Match accrued charge: tenant=${getTenantId(user)}, charge=${chargeId}, transaction=${body.charge_transaction_id}`,
    );

    const dto: MatchAccruedChargeDto = {
      accrued_charge_id: chargeId,
      charge_transaction_id: body.charge_transaction_id,
      charge_date: body.charge_date,
    };

    const charge = await this.accruedBankChargeService.matchAccruedCharge(
      getTenantId(user),
      dto,
      user.id,
    );

    return {
      success: true,
      data: charge,
    };
  }

  @Patch('accrued-charges/:chargeId/status')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Update accrued charge status',
    description:
      'Update the status of an accrued charge (e.g., to REVERSED or WRITTEN_OFF)',
  })
  @ApiParam({ name: 'chargeId', description: 'Accrued charge ID' })
  @ApiResponse({
    status: 200,
    description: 'Status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Accrued charge not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async updateAccruedChargeStatus(
    @Param('chargeId') chargeId: string,
    @Body() body: { status: string; notes?: string },
    @CurrentUser() user: IUser,
  ): Promise<{ success: boolean; data: AccruedBankChargeResponseDto }> {
    this.logger.log(
      `Update accrued charge status: tenant=${getTenantId(user)}, charge=${chargeId}, status=${body.status}`,
    );

    const dto: UpdateAccruedChargeStatusDto = {
      accrued_charge_id: chargeId,
      status: body.status as any,
      notes: body.notes,
    };

    const charge = await this.accruedBankChargeService.updateStatus(
      getTenantId(user),
      dto,
    );

    return {
      success: true,
      data: charge,
    };
  }

  @Post('accrued-charges/auto-match')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Auto-match pending accrued charges',
    description:
      'Automatically matches pending accrued charges to fee transactions from the next billing period',
  })
  @ApiResponse({
    status: 200,
    description: 'Auto-matching completed',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async autoMatchAccruedCharges(@CurrentUser() user: IUser): Promise<{
    success: boolean;
    data: {
      matched_count: number;
      remaining_count: number;
      total_matched_cents: number;
    };
  }> {
    this.logger.log(`Auto-match accrued charges: tenant=${getTenantId(user)}`);

    const result = await this.accruedBankChargeService.autoMatchAccruedCharges(
      getTenantId(user),
      user.id,
    );

    return {
      success: true,
      data: {
        matched_count: result.matchedCount,
        remaining_count: result.remainingCount,
        total_matched_cents: result.totalMatchedCents,
      },
    };
  }

  // ============================================
  // TASK-RECON-037: Xero Transaction Splitting
  // Split Xero transactions into net + fee for bank matching
  // ============================================

  @Post('xero-splits/detect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Detect split parameters for a Xero transaction',
    description:
      'Analyzes the difference between a Xero transaction and bank statement amount to determine if splitting is recommended and suggests split parameters.',
  })
  @ApiResponse({
    status: 200,
    description: 'Split detection result with suggested parameters',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async detectXeroSplitParams(
    @Body() dto: DetectSplitParamsDto,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Detecting Xero split params: tenant=${getTenantId(user)}, xeroAmount=${dto.xero_amount_cents}, bankAmount=${dto.bank_amount_cents}`,
    );

    const result = await this.xeroTransactionSplitService.detectSplitParams(
      getTenantId(user),
      dto,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post('xero-splits')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Split a Xero transaction into net amount + fee',
    description:
      'Creates a split record for a Xero transaction, separating the gross amount into net (for bank matching) and fee (as accrued bank charge).',
  })
  @ApiResponse({
    status: 201,
    description: 'Split created successfully with linked accrued charge',
  })
  @ApiBadRequestResponse({
    description: 'Invalid split parameters or transaction already split',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async splitXeroTransaction(
    @Body() dto: SplitXeroTransactionDto,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Splitting Xero transaction: tenant=${getTenantId(user)}, xeroTxn=${dto.xero_transaction_id}, net=${dto.net_amount_cents}, fee=${dto.fee_amount_cents}`,
    );

    const result = await this.xeroTransactionSplitService.splitXeroTransaction(
      getTenantId(user),
      dto,
      user.id,
    );

    return {
      success: true,
      data: result,
      message: `Xero transaction split created. Net: R${(dto.net_amount_cents / 100).toFixed(2)}, Fee: R${(dto.fee_amount_cents / 100).toFixed(2)}`,
    };
  }

  @Post('xero-splits/:id/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Confirm a pending Xero transaction split',
    description:
      'Confirms a pending split, making it ready for bank statement matching.',
  })
  @ApiResponse({
    status: 200,
    description: 'Split confirmed successfully',
  })
  @ApiNotFoundResponse({ description: 'Split not found' })
  @ApiBadRequestResponse({ description: 'Split is not in pending status' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async confirmXeroSplit(
    @Param('id') id: string,
    @Body() dto: Partial<ConfirmXeroSplitDto>,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Confirming Xero split: tenant=${getTenantId(user)}, splitId=${id}`,
    );

    const result = await this.xeroTransactionSplitService.confirmSplit(
      getTenantId(user),
      { split_id: id, ...dto },
      user.id,
    );

    return {
      success: true,
      data: result,
      message: 'Xero transaction split confirmed',
    };
  }

  @Post('xero-splits/:id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Cancel a Xero transaction split',
    description:
      'Cancels a split and reverses the associated accrued bank charge.',
  })
  @ApiResponse({
    status: 200,
    description: 'Split cancelled successfully',
  })
  @ApiNotFoundResponse({ description: 'Split not found' })
  @ApiBadRequestResponse({ description: 'Split is already cancelled' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async cancelXeroSplit(
    @Param('id') id: string,
    @Body() dto: Partial<CancelXeroSplitDto>,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Cancelling Xero split: tenant=${getTenantId(user)}, splitId=${id}`,
    );

    const result = await this.xeroTransactionSplitService.cancelSplit(
      getTenantId(user),
      { split_id: id, ...dto },
      user.id,
    );

    return {
      success: true,
      data: result,
      message: 'Xero transaction split cancelled',
    };
  }

  @Get('xero-splits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'List Xero transaction splits',
    description:
      'Returns a paginated list of Xero transaction splits with optional filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of Xero transaction splits',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listXeroSplits(
    @Query() filter: XeroSplitFilterDto,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Listing Xero splits: tenant=${getTenantId(user)}, filter=${JSON.stringify(filter)}`,
    );

    const result = await this.xeroTransactionSplitService.listSplits(
      getTenantId(user),
      filter,
    );

    return {
      success: true,
      ...result,
    };
  }

  @Get('xero-splits/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get Xero transaction split summary',
    description:
      'Returns a summary of Xero transaction splits including totals by status and fee type.',
  })
  @ApiResponse({
    status: 200,
    description: 'Split summary statistics',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getXeroSplitSummary(@CurrentUser() user: IUser) {
    this.logger.log(`Getting Xero split summary: tenant=${getTenantId(user)}`);

    const result = await this.xeroTransactionSplitService.getSummary(
      getTenantId(user),
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get('xero-splits/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get a Xero transaction split by ID',
    description:
      'Returns the details of a specific Xero transaction split including the linked accrued charge.',
  })
  @ApiResponse({
    status: 200,
    description: 'Split details with linked accrued charge',
  })
  @ApiNotFoundResponse({ description: 'Split not found' })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getXeroSplit(@Param('id') id: string, @CurrentUser() user: IUser) {
    this.logger.log(
      `Getting Xero split: tenant=${getTenantId(user)}, splitId=${id}`,
    );

    const result = await this.xeroTransactionSplitService.getSplit(
      getTenantId(user),
      id,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get('xero-splits/by-xero-transaction/:xeroTransactionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Get a Xero transaction split by Xero transaction ID',
    description:
      'Checks if a Xero transaction has been split and returns the split details if found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Split details or null if not found',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getXeroSplitByXeroTransactionId(
    @Param('xeroTransactionId') xeroTransactionId: string,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Getting Xero split by xeroTransactionId: tenant=${getTenantId(user)}, xeroTxnId=${xeroTransactionId}`,
    );

    const result =
      await this.xeroTransactionSplitService.getSplitByXeroTransactionId(
        getTenantId(user),
        xeroTransactionId,
      );

    return {
      success: true,
      data: result,
      message: result
        ? 'Split found'
        : 'No split found for this Xero transaction',
    };
  }

  // ============================================
  // Fee Inflation Correction
  // Corrects FNB bank feed GROSS amounts to NET
  // ============================================

  @Post('fee-corrections/preview')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Preview fee inflation corrections (dry-run)',
    description:
      'Scans existing matches where Xero GROSS > Bank NET and shows proposed corrections without applying them',
  })
  @ApiResponse({
    status: 200,
    description: 'Preview of proposed fee corrections',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async previewFeeCorrections(@CurrentUser() user: IUser) {
    this.logger.log(
      `Preview fee corrections: tenant=${getTenantId(user)}`,
    );

    const result =
      await this.feeInflationCorrectionService.correctExistingMatches(
        getTenantId(user),
        user.id,
        { dryRun: true },
      );

    return {
      success: true,
      data: result,
    };
  }

  @Post('fee-corrections/apply')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Apply fee inflation corrections',
    description:
      'Corrects transaction amounts from Xero GROSS to Bank NET, creates accrued bank charges for the fee portion',
  })
  @ApiResponse({
    status: 200,
    description: 'Fee corrections applied successfully',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER or ADMIN role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async applyFeeCorrections(@CurrentUser() user: IUser) {
    this.logger.log(
      `Apply fee corrections: tenant=${getTenantId(user)}`,
    );

    const result =
      await this.feeInflationCorrectionService.correctExistingMatches(
        getTenantId(user),
        user.id,
        { dryRun: false },
      );

    return {
      success: true,
      data: result,
    };
  }

  @Post('fee-corrections/match-monthly')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Match monthly fee aggregates to charge transactions',
    description:
      'Groups accrued charges by fee type for the given period and matches to monthly fee transactions like #Cash Deposit Fee',
  })
  @ApiResponse({
    status: 200,
    description: 'Monthly fee matching results',
  })
  @ApiBadRequestResponse({
    description: 'Missing or invalid date parameters',
  })
  @ApiForbiddenResponse({
    description: 'Requires OWNER, ADMIN, or ACCOUNTANT role',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async matchMonthlyFees(
    @Body() body: { start_date: string; end_date: string },
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Match monthly fees: tenant=${getTenantId(user)}, period=${body.start_date} to ${body.end_date}`,
    );

    if (!body.start_date || !body.end_date) {
      throw new BadRequestException(
        'Both start_date and end_date are required (YYYY-MM-DD)',
      );
    }

    const startDate = new Date(body.start_date);
    const endDate = new Date(body.end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    const result =
      await this.feeInflationCorrectionService.matchMonthlyFeeTransactions(
        getTenantId(user),
        user.id,
        startDate,
        endDate,
      );

    return {
      success: true,
      data: {
        matched_count: result.matchedCount,
        total_matched_cents: result.totalMatchedCents,
        matches: result.matches,
        unmatched: result.unmatched,
      },
    };
  }

  // ============================================
  // TASK-RECON-UI: Get Reconciliation by ID
  // NOTE: This must be LAST to avoid matching specific routes like 'summary', 'discrepancies', 'xero-splits'
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
      `Get reconciliation by ID: tenant=${getTenantId(user)}, id=${id}`,
    );

    // Use the repository to find by ID
    const reconciliations =
      await this.reconciliationService.getReconciliationsByTenant(
        getTenantId(user),
      );

    const reconciliation = reconciliations.find((r) => r.id === id);

    if (!reconciliation) {
      throw new NotFoundException('Reconciliation', id);
    }

    // Verify tenant ownership (already filtered by tenant above, but explicit check)
    if (reconciliation.tenantId !== getTenantId(user)) {
      throw new NotFoundException('Reconciliation', id);
    }

    // Get matches to compute summary counts
    const matches =
      await this.bankStatementReconciliationService.getMatchesByReconciliationId(
        getTenantId(user),
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
      feeAdjusted: matches.filter((m) => m.status === 'FEE_ADJUSTED_MATCH')
        .length,
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
          fee_adjusted_match: matchSummary.feeAdjusted,
          total: matchSummary.total,
        },
      },
    };
  }
}
