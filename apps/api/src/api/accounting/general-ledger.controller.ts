/**
 * General Ledger Controller
 * TASK-ACCT-002: General Ledger Views API
 */
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { GeneralLedgerService } from '../../database/services/general-ledger.service';
import { MonthEndPackService } from './month-end-pack.service';
import { TenantRepository } from '../../database/repositories/tenant.repository';

@ApiTags('General Ledger')
@ApiBearerAuth()
@Controller('general-ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeneralLedgerController {
  private readonly logger = new Logger(GeneralLedgerController.name);

  constructor(
    private readonly glService: GeneralLedgerService,
    private readonly monthEndPackService: MonthEndPackService,
    private readonly tenantRepo: TenantRepository,
  ) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get general ledger entries' })
  @ApiQuery({ name: 'from_date', required: true })
  @ApiQuery({ name: 'to_date', required: true })
  @ApiQuery({ name: 'account_code', required: false })
  @ApiQuery({ name: 'source_type', required: false })
  @ApiResponse({ status: 200, description: 'General ledger entries' })
  async getGeneralLedger(
    @CurrentUser() user: IUser,
    @Query('from_date') fromDate: string,
    @Query('to_date') toDate: string,
    @Query('account_code') accountCode?: string,
    @Query('source_type') sourceType?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Get GL: tenant=${tenantId}, from=${fromDate}, to=${toDate}`,
    );
    const entries = await this.glService.getGeneralLedger({
      tenantId,
      startDate: new Date(fromDate),
      endDate: new Date(toDate),
      accountCode,
    });
    return { success: true, data: entries };
  }

  @Get('account/:accountCode')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get ledger for specific account' })
  @ApiParam({ name: 'accountCode', description: 'Account code' })
  @ApiQuery({ name: 'from_date', required: true })
  @ApiQuery({ name: 'to_date', required: true })
  @ApiResponse({ status: 200, description: 'Account ledger' })
  async getAccountLedger(
    @CurrentUser() user: IUser,
    @Param('accountCode') accountCode: string,
    @Query('from_date') fromDate: string,
    @Query('to_date') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Get account ledger: tenant=${tenantId}, account=${accountCode}`,
    );
    const ledger = await this.glService.getAccountLedger(
      tenantId,
      accountCode,
      new Date(fromDate),
      new Date(toDate),
    );
    return { success: true, data: ledger };
  }

  @Get('trial-balance')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get trial balance' })
  @ApiQuery({ name: 'as_of_date', required: true })
  @ApiResponse({ status: 200, description: 'Trial balance' })
  async getTrialBalance(
    @CurrentUser() user: IUser,
    @Query('as_of_date') asOfDate: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`Get trial balance: tenant=${tenantId}, asOf=${asOfDate}`);
    const trialBalance = await this.glService.getTrialBalance(
      tenantId,
      new Date(asOfDate),
    );
    return { success: true, data: trialBalance };
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get ledger summary' })
  @ApiQuery({ name: 'from_date', required: true })
  @ApiQuery({ name: 'to_date', required: true })
  @ApiResponse({ status: 200, description: 'Ledger summary' })
  async getSummary(
    @CurrentUser() user: IUser,
    @Query('from_date') fromDate: string,
    @Query('to_date') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    const summary = await this.glService.getLedgerSummary(
      tenantId,
      new Date(fromDate),
      new Date(toDate),
    );
    return { success: true, data: summary };
  }

  @Get('month-end-pack')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Download month-end export pack',
    description:
      'Returns a ZIP archive containing 5 CSVs: general ledger, trial balance, invoices, payments, and Xero manual journal. ' +
      'Period must be YYYY-MM format and must not be in the future.',
  })
  @ApiQuery({
    name: 'period',
    required: true,
    description: 'Billing month in YYYY-MM format (e.g. 2025-12)',
    example: '2025-12',
  })
  @ApiResponse({
    status: 200,
    description: 'ZIP archive containing month-end CSVs',
    content: { 'application/zip': {} },
  })
  @ApiResponse({ status: 400, description: 'Invalid or future period' })
  async getMonthEndPack(
    @CurrentUser() user: IUser,
    @Query('period') period: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const tenantId = getTenantId(user);

    if (!period) {
      throw new BadRequestException('Query parameter "period" is required');
    }

    // Validate period — throws with a descriptive message on failure
    try {
      this.monthEndPackService.parsePeriod(period);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }

    // Build a tenant slug for the filename: prefer tradingName, fall back to tenantId prefix
    let tenantSlug = tenantId.slice(0, 8);
    try {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant) {
        const name = (tenant.tradingName ?? tenant.name).trim();
        tenantSlug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 32);
      }
    } catch {
      // Non-fatal: use the fallback slug
    }

    const filename = `month-end-${tenantSlug}-${period}.zip`;

    this.logger.log(
      `Month-end pack request: tenant=${tenantId}, period=${period}, file=${filename}`,
    );

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    const stream = await this.monthEndPackService.buildPackStream(
      tenantId,
      period,
    );

    return new StreamableFile(stream);
  }
}
