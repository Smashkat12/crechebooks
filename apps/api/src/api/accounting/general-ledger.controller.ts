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
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiQuery({ name: 'accountCode', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'General ledger entries' })
  async getGeneralLedger(
    @CurrentUser() user: IUser,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('accountCode') accountCode?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`Get GL: tenant=${tenantId}, from=${fromDate}, to=${toDate}`);
    return this.glService.getGeneralLedger({
      tenantId,
      startDate: new Date(fromDate),
      endDate: new Date(toDate),
      accountCode,
    });
  }

  @Get('account/:accountCode')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get ledger for specific account' })
  @ApiParam({ name: 'accountCode', description: 'Account code' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiResponse({ status: 200, description: 'Account ledger' })
  async getAccountLedger(
    @CurrentUser() user: IUser,
    @Param('accountCode') accountCode: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`Get account ledger: tenant=${tenantId}, account=${accountCode}`);
    return this.glService.getAccountLedger(
      tenantId,
      accountCode,
      new Date(fromDate),
      new Date(toDate),
    );
  }

  @Get('trial-balance')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get trial balance' })
  @ApiQuery({ name: 'asOfDate', required: true })
  @ApiResponse({ status: 200, description: 'Trial balance' })
  async getTrialBalance(
    @CurrentUser() user: IUser,
    @Query('asOfDate') asOfDate: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`Get trial balance: tenant=${tenantId}, asOf=${asOfDate}`);
    return this.glService.getTrialBalance(tenantId, new Date(asOfDate));
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get ledger summary' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiResponse({ status: 200, description: 'Ledger summary' })
  async getSummary(
    @CurrentUser() user: IUser,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    return this.glService.getLedgerSummary(
      tenantId,
      new Date(fromDate),
      new Date(toDate),
    );
  }
}
