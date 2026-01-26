/**
 * Cash Flow Controller
 * TASK-ACCT-004: Cash Flow Reports API
 */
import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { CashFlowService } from '../../database/services/cash-flow.service';

@ApiTags('Cash Flow')
@ApiBearerAuth()
@Controller('cash-flow')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashFlowController {
  private readonly logger = new Logger(CashFlowController.name);

  constructor(private readonly cashFlowService: CashFlowService) {}

  @Get('statement')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate cash flow statement' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiQuery({ name: 'includeComparative', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Cash flow statement' })
  async getStatement(
    @CurrentUser() user: IUser,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Query('includeComparative') includeComparative?: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(
      `Generate cash flow statement: tenant=${tenantId}, from=${fromDate}, to=${toDate}`,
    );
    return this.cashFlowService.generateCashFlowStatement(
      tenantId,
      new Date(fromDate),
      new Date(toDate),
      includeComparative === 'true',
    );
  }

  @Get('trend')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get cash flow trend' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiResponse({ status: 200, description: 'Cash flow trend data' })
  async getTrend(
    @CurrentUser() user: IUser,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    this.logger.log(`Get cash flow trend: tenant=${tenantId}`);
    return this.cashFlowService.getCashFlowTrend(
      tenantId,
      new Date(fromDate),
      new Date(toDate),
    );
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get cash flow summary' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiResponse({ status: 200, description: 'Cash flow summary' })
  async getSummary(
    @CurrentUser() user: IUser,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    const tenantId = getTenantId(user);
    return this.cashFlowService.getCashFlowSummary(
      tenantId,
      new Date(fromDate),
      new Date(toDate),
    );
  }
}
