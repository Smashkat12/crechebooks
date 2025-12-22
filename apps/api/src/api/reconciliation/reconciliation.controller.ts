/**
 * Reconciliation Controller
 * TASK-RECON-031: Reconciliation Controller
 * TASK-RECON-032: Financial Reports Endpoint
 *
 * Handles bank reconciliation and financial reporting operations.
 * Uses snake_case for external API, transforms to camelCase for internal services.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Logger,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReconciliationService } from '../../database/services/reconciliation.service';
import { FinancialReportService } from '../../database/services/financial-report.service';
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
} from './dto';

@Controller('reconciliation')
@ApiTags('Reconciliation')
@ApiBearerAuth('JWT-auth')
export class ReconciliationController {
  private readonly logger = new Logger(ReconciliationController.name);

  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly financialReportService: FinancialReportService,
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
}
