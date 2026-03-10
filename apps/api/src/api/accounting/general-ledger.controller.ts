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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { GeneralLedgerService } from '../../database/services/general-ledger.service';

@ApiTags('General Ledger')
@ApiBearerAuth()
@Controller('general-ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeneralLedgerController {
  private readonly logger = new Logger(GeneralLedgerController.name);

  constructor(private readonly glService: GeneralLedgerService) {}

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
}
